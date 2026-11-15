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
 *   4. Preflight (before the first completion), GET /v1/attestation/report
 *      with a fresh random 32-byte nonce. HTTP fields are not trusted alone:
 *      exactly one model attestation must list the response signer (ecdsa),
 *      and that attestation's Intel TDX quote `report_data` must contain the
 *      signer address (bytes 0..20, zero-padded to 32) and our nonce (32..64).
 *
 * NOT done here: verifying the TDX quote's own signature / PCK certificate
 * chain (Intel DCAP) and the NVIDIA GPU evidence (NRAS). report_data is
 * parsed from the quote but the quote itself is not authenticated, so this
 * proves binding, not genuineness. Use the official NEAR AI Cloud Verifier
 * (or dcap-qvl) for the full chain.
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
  /** exactly one model attestation lists this signer (ecdsa) */
  signerAttested: boolean;
  /** that attestation's TDX quote report_data binds this signer AND our nonce */
  quoteBound: boolean;
  reasons: string[];
}

export interface AttestedSigner {
  signingAddress: string;
  signingAlgo?: string;
  /** TDX quote could be parsed and report_data extracted */
  quoteParsed: boolean;
  /** report_data[0..20] == signing address, report_data[20..32] == 0 */
  reportDataSignerOk: boolean;
  /** report_data[32..64] == our fresh nonce */
  reportDataNonceOk: boolean;
}

export interface NearAiAttestationCheck {
  nonce: string;
  fetchedAt: string;
  attestations: AttestedSigner[];
  tdxQuotePresent: boolean;
  nvidiaPayloadPresent: boolean;
  error?: string;
}

/**
 * Extracts the 64-byte report_data field from an Intel TDX quote (hex).
 * Quote v4: 48-byte header + TD report body; report_data at body offset 520.
 * Quote v5: 48-byte header + 6-byte body descriptor, then the body.
 * This parses the quote; it does NOT verify the quote's signature/cert chain.
 */
export function tdxReportData(quoteHex: string): Uint8Array | null {
  const q = Buffer.from(quoteHex.replace(/^0x/, ""), "hex");
  if (q.length < 48) return null;
  const version = q.readUInt16LE(0);
  const bodyStart = version === 4 ? 48 : version === 5 ? 54 : -1;
  if (bodyStart < 0 || q.length < bodyStart + 520 + 64) return null;
  return new Uint8Array(q.subarray(bodyStart + 520, bodyStart + 584));
}

/** NEAR AI binds the response signer as report_data[0..20], zero-padded to 32 bytes. */
export function reportDataBindsSigner(rd: Uint8Array, signingAddress: string): boolean {
  const addr = signingAddress.replace(/^0x/, "").toLowerCase();
  return toHex(rd.subarray(0, 20)) === addr && rd.subarray(20, 32).every((b) => b === 0);
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
      attestations: [],
      tdxQuotePresent: false,
      nvidiaPayloadPresent: false,
    };
    try {
      const url = `${BASE_URL}/attestation/report?model=${encodeURIComponent(NEAR_AI_MODEL)}&signing_algo=ecdsa&nonce=${nonce}`;
      const res = await fetch(url, {
        headers: this.headers({ "x-no-aliasing": "true" }),
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(`attestation HTTP ${res.status}: ${raw.slice(0, 200)}`);
      const report = JSON.parse(raw) as Record<string, unknown>;

      // Model attestation entries (each carries its own TDX quote).
      const entries = (
        (Array.isArray(report.model_attestations) && report.model_attestations) ||
        (Array.isArray(report.all_attestations) && report.all_attestations) ||
        (report.signing_address ? [report] : [])
      ) as { signing_address?: string; signing_algo?: string; intel_quote?: string; nvidia_payload?: unknown }[];

      // The HTTP fields (request_nonce, signing_address) are NOT trusted on their
      // own: signer and nonce must be bound inside the quote's report_data.
      check.attestations = entries
        .filter((e) => typeof e.signing_address === "string")
        .map((e) => {
          const signer = e.signing_address!.toLowerCase();
          const rd = e.intel_quote ? tdxReportData(e.intel_quote) : null;
          return {
            signingAddress: signer,
            signingAlgo: e.signing_algo,
            quoteParsed: !!rd,
            reportDataSignerOk: !!rd && reportDataBindsSigner(rd, signer),
            reportDataNonceOk: !!rd && toHex(rd.subarray(32, 64)) === nonce,
          };
        });
      check.tdxQuotePresent = entries.some((e) => typeof e.intel_quote === "string" && e.intel_quote.length > 0);
      check.nvidiaPayloadPresent = entries.some((e) => !!e.nvidia_payload);
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
      quoteBound: false,
      reasons: [],
    };
    let content: string | null = null;

    // Preflight: attestation evidence (fresh nonce) is requested BEFORE the
    // completion is sent, per the NEAR AI Cloud verification flow.
    const attestationPromise = this.getAttestation();
    await attestationPromise;

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

      // 4. Bind the signer to the preflight attestation: exactly one model
      //    attestation for this signer (ecdsa), whose TDX quote report_data
      //    contains this signer and our fresh nonce.
      const att = await attestationPromise;
      verification.attestation = att;
      if (att.error) verification.reasons.push(`attestation unavailable: ${att.error}`);
      const matches = att.attestations.filter(
        (a) => a.signingAddress === signingAddress && (!a.signingAlgo || a.signingAlgo.toLowerCase() === "ecdsa")
      );
      verification.signerAttested = matches.length === 1;
      if (matches.length !== 1) verification.reasons.push(`expected exactly one model attestation for signer, found ${matches.length}`);
      const m = matches[0];
      verification.quoteBound = !!m && m.quoteParsed && m.reportDataSignerOk && m.reportDataNonceOk;
      if (m && !m.quoteParsed) verification.reasons.push("TDX quote missing or unparseable");
      if (m && m.quoteParsed && !m.reportDataSignerOk) verification.reasons.push("quote report_data does not bind the response signer");
      if (m && m.quoteParsed && !m.reportDataNonceOk) verification.reasons.push("quote report_data does not contain our fresh nonce");

      verification.verified = verification.reasons.length === 0;
    } catch (err) {
      verification.reasons.push((err as Error).message);
    }
    return { content, verification };
  }
}
