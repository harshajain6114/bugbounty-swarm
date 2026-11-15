/**
 * apps/server/tests/near-ai-verify.test.ts
 *
 * Offline test of the EIP-191 signer recovery used to verify NEAR AI Cloud
 * response signatures (no network, no API key).
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { recoverEip191Address, tdxReportData, reportDataBindsSigner } from "../src/near/near-ai-client.js";

let failures = 0;
const check = (cond: boolean, label: string) => {
  console.log(`  ${cond ? "✓" : "✕"} ${label}`);
  if (!cond) failures++;
};

// Well-known test account from the web3.js documentation.
const PRIV = "4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318";
const EXPECTED = "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23";

const pub = secp256k1.getPublicKey(PRIV, false);
const derived = "0x" + Buffer.from(keccak_256(pub.slice(1)).slice(-20)).toString("hex");
check(derived === EXPECTED, `address derivation matches known vector (${derived})`);

function personalSign(message: string): string {
  const m = Buffer.from(message, "utf8");
  const digest = keccak_256(Buffer.concat([Buffer.from(`\x19Ethereum Signed Message:\n${m.length}`), m]));
  const sig = secp256k1.sign(digest, PRIV);
  return "0x" + sig.toCompactHex() + (27 + sig.recovery).toString(16);
}

const text = "a".repeat(64) + ":" + "b".repeat(64); // shape of NEAR AI signed text
const sig = personalSign(text);
check(recoverEip191Address(text, sig) === EXPECTED, "recovers signer of request_hash:response_hash text");
check(recoverEip191Address(text.replace("a", "c"), sig) !== EXPECTED, "tampered text recovers a different signer");

// ── TDX quote report_data binding (signer + fresh nonce) ──────────────────
const nonce = "11".repeat(32);
function fakeQuote(version: 4 | 5, signer: string, nonceHex: string): string {
  const bodyStart = version === 4 ? 48 : 54;
  const q = Buffer.alloc(bodyStart + 584);
  q.writeUInt16LE(version, 0);
  const rd = Buffer.alloc(64);
  Buffer.from(signer.replace(/^0x/, ""), "hex").copy(rd, 0); // bytes 0..20, then zero padding to 32
  Buffer.from(nonceHex, "hex").copy(rd, 32);
  rd.copy(q, bodyStart + 520);
  return q.toString("hex");
}
for (const v of [4, 5] as const) {
  const rd = tdxReportData(fakeQuote(v, EXPECTED, nonce))!;
  check(!!rd && reportDataBindsSigner(rd, EXPECTED), `TDX v${v}: report_data binds signer`);
  check(Buffer.from(rd.subarray(32, 64)).toString("hex") === nonce, `TDX v${v}: report_data carries our nonce`);
}
const other = tdxReportData(fakeQuote(4, "0x" + "22".repeat(20), nonce))!;
check(!reportDataBindsSigner(other, EXPECTED), "report_data for another signer is rejected");
const stale = tdxReportData(fakeQuote(4, EXPECTED, "33".repeat(32)))!;
check(Buffer.from(stale.subarray(32, 64)).toString("hex") !== nonce, "stale nonce is detected");
check(tdxReportData("0300" + "00".repeat(700)) === null, "unknown quote version is not parsed");

if (failures) {
  console.error(`\n✕ NEAR AI VERIFY TEST FAILED (${failures})`);
  process.exit(1);
}
console.log("\n✓ NEAR AI VERIFY TEST PASSED");
