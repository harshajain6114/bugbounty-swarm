/**
 * apps/server/tests/near-ai-verify.test.ts
 *
 * Offline test of the EIP-191 signer recovery used to verify NEAR AI Cloud
 * response signatures (no network, no API key).
 */

import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { recoverEip191Address } from "../src/near/near-ai-client.js";

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

if (failures) {
  console.error(`\n✕ NEAR AI VERIFY TEST FAILED (${failures})`);
  process.exit(1);
}
console.log("\n✓ NEAR AI VERIFY TEST PASSED");
