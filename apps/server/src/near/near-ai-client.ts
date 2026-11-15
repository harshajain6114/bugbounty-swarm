/**
 * apps/server/src/near/near-ai-client.ts
 *
 * NEAR AI Cloud (TEE-hosted inference) client with verification.
 *
 * Every completion used by the swarm goes through `verifiedChat`:
 *   1. The exact request bytes are built once and kept; the exact response
 *      bytes are kept before JSON parsing (docs: "Preserve exact request and
 *      response bytes").
 *   2. GET /v1/signature/{chat_id}?signing_algo=ecdsa returns
 *      { text, signature, signing_address }.
 *   3. We check text === sha256(request) + ":" + sha256(response), and
 *      recover the EIP-191 signer of `text` with secp256k1; it must equal
 *      signing_address.
 *   4. Once per process, GET /v1/attestation/report with a fresh random
 *      nonce. We check the report echoes our nonce and that the response
 *      signer appears among the attested signing addresses.
 *
 * NOT done here: full Intel TDX quote and NVIDIA GPU evidence verification.
 * Those are recorded (`tdxQuotePresent`, `nvidiaPayloadPresent`) but not
 * cryptographically checked; use the official NEAR AI Cloud Verifier for that.
 *
 * A completion that fails any check is reported as unverified, and callers
 * must not let it influence on-chain actions.
 */

import { createHash, randomBytes } from "node:crypto";
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";

const BASE_URL = process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1";
export const NEAR_AI_MODEL = process.env.NEAR_AI_MODEL || "zai-org/GLM-5.1-FP8";

export interface NearAiVerification {
  verified: boolean;
  chatId?: string;
  model: string;
  requestHash?: string;
  responseHash?: string;
  signedText?: string;
  signingAddress?: string;
  recoveredAddress?: string;
  hashesMatch: boolean;
  signatureValid: boolean;
  attestation?: NearAiAttestationCheck;
  signerAttested: boolean;
  reasons: string[];
}

export interface NearAiAttestationCheck {
  nonce: string;
  fetchedAt: string;
  nonceBound: boolean;
  attestedSigningAddresses: string[];
  tdxQuotePresent: boolean;
  nvidiaPayloadPresent: boolean;
  error?: string;
}

const sha256Hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Recovers the Ethereum address that signed `message` with EIP-191 personal_sign. */
export function recoverEip191Address(message: string, signatureHex: string): string {
  const sig = signatureHex.replace(/^0x/, "");
  if (sig.length !== 130) throw new Error(`Unexpected signature length ${sig.length / 2} bytes`);
  let v = parseInt(sig.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  const msgBytes = Buffer.from(message, "utf8");
  const prefixed = Buffer.concat([
    Buffer.from(`\x19Ethereum Signed Message:\n${msgBytes.length}`, "utf8"),
    msgBytes,
  ]);
  const digest = keccak_256(prefixed);
  const pub = secp256k1.Signature.fromCompact(sig.slice(0, 128))
    .addRecoveryBit(v)
    .recoverPublicKey(digest)
    .toRawBytes(false);
  return "0x" + toHex(keccak_256(pub.slice(1)).slice(-20));
}

/** Collects every value of a given key anywhere inside a JSON tree. */
function collect(obj: unknown, key: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(obj)) obj.forEach((x) => collect(x, key, out));
  else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) out.push(v);
      collect(v, key, out);
    }
  }
  return out;
}

export class NearAiClient {
  private apiKey: string;
  private attestation: Promise<NearAiAttestationCheck> | null = null;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static fromEnv(): NearAiClient | null {
    const key = process.env.NEAR_AI_API_KEY;
    return key ? new NearAiClient(key) : null;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}`, ...extra };
  }

  /** Fetches the model attestation report once per process with a fresh nonce. */
  public getAttestation(): Promise<NearAiAttestationCheck> {
    if (!this.attestation) this.attestation = this.fetchAttestation();
    return this.attestation;
  }

  private async fetchAttestation(): Promise<NearAiAttestationCheck> {
    const nonce = toHex(randomBytes(32));
    const check: NearAiAttestationCheck = {
      nonce,
      fetchedAt: new Date().toISOString(),
      nonceBound: false,
      attestedSigningAddresses: [],
      tdxQuotePresent: false,
      nvidiaPayloadPresent: false,
    };
    try {
      const url = `${BASE_URL}/attestation/report?model=${encodeURIComponent(NEAR_AI_MODEL)}&signing_algo=ecdsa&nonce=${nonce}`;
      const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(30_000) });
      const raw = await res.text();
      if (!res.ok) throw new Error(`attestation HTTP ${res.status}: ${raw.slice(0, 200)}`);
      const report = JSON.parse(raw) as unknown;
      // Our nonce must be echoed back (as request_nonce, or embedded in report_data).
      check.nonceBound = raw.toLowerCase().includes(nonce);
      check.attestedSigningAddresses = [
        ...new Set(collect(report, "signing_address").filter((x): x is string => typeof x === "string").map((a) => a.toLowerCase())),
      ];
      check.tdxQuotePresent = collect(report, "intel_quote").some((q) => typeof q === "string" && q.length > 0);
      check.nvidiaPayloadPresent = collect(report, "nvidia_payload").some((q) => !!q);
    } catch (err) {
      check.error = (err as Error).message;
    }
    return check;
  }

  /**
   * Sends one chat completion and verifies its TEE signature.
   * Never throws: failures are returned in `verification.reasons`.
   */
  public async verifiedChat(
    messages: { role: "system" | "user"; content: string }[],
    maxTokens = 400
  ): Promise<{ content: string | null; verification: NearAiVerification }> {
    const verification: NearAiVerification = {
      verified: false,
      model: NEAR_AI_MODEL,
      hashesMatch: false,
      signatureValid: false,
      signerAttested: false,
      reasons: [],
    };
    let content: string | null = null;

    try {
      // 1. Exact request bytes, built once.
      const requestBody = JSON.stringify({ model: NEAR_AI_MODEL, messages, temperature: 0, max_tokens: maxTokens });
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "Accept-Encoding": "identity",
          "x-no-aliasing": "true",
        }),
        body: requestBody,
        signal: AbortSignal.timeout(90_000),
      });
      // 2. Exact response bytes, kept before parsing.
      const responseBytes = new Uint8Array(await res.arrayBuffer());
      const responseText = Buffer.from(responseBytes).toString("utf8");
      if (!res.ok) throw new Error(`chat HTTP ${res.status}: ${responseText.slice(0, 200)}`);

      const parsed = JSON.parse(responseText) as { id?: string; choices?: { message?: { content?: string } }[] };
      content = parsed.choices?.[0]?.message?.content ?? null;
      verification.chatId = parsed.id;
      verification.requestHash = sha256Hex(requestBody);
      verification.responseHash = sha256Hex(responseBytes);
      if (!parsed.id) throw new Error("completion has no id");

      // 3. Fetch the TEE signature (bounded retry: it may take a moment to be recorded).
      type SigResponse = { text?: string; signature?: string; signing_address?: string; error_code?: string };
      let sig: SigResponse = {};
      for (let attempt = 0; attempt < 4 && !sig.signature; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const sres = await fetch(
          `${BASE_URL}/signature/${encodeURIComponent(parsed.id)}?model=${encodeURIComponent(NEAR_AI_MODEL)}&signing_algo=ecdsa`,
          { headers: this.headers({ Accept: "application/json" }), signal: AbortSignal.timeout(20_000) }
        );
        if (sres.status === 404) continue;
        sig = (await sres.json()) as SigResponse;
      }
      if (!sig.signature || !sig.text || !sig.signing_address) {
        throw new Error(`signature unavailable${sig.error_code ? ` (${sig.error_code})` : ""}`);
      }

      verification.signedText = sig.text;
      const signingAddress = sig.signing_address.toLowerCase();
      verification.signingAddress = signingAddress;
      verification.hashesMatch = sig.text === `${verification.requestHash}:${verification.responseHash}`;
      if (!verification.hashesMatch) verification.reasons.push("signed text does not equal sha256(request):sha256(response)");

      verification.recoveredAddress = recoverEip191Address(sig.text, sig.signature).toLowerCase();
      verification.signatureValid = verification.recoveredAddress === signingAddress;
      if (!verification.signatureValid) verification.reasons.push("recovered signer != signing_address");

      // 4. Bind the signer to a fresh-nonce attestation report.
      const att = await this.getAttestation();
      verification.attestation = att;
      if (att.error) verification.reasons.push(`attestation unavailable: ${att.error}`);
      if (!att.nonceBound) verification.reasons.push("attestation report does not echo our fresh nonce");
      verification.signerAttested = att.attestedSigningAddresses.includes(signingAddress);
      if (!verification.signerAttested) verification.reasons.push("response signer not among attested signing addresses");

      verification.verified = verification.reasons.length === 0;
    } catch (err) {
      verification.reasons.push((err as Error).message);
    }
    return { content, verification };
  }
}
