/**
 * apps/server/tests/intents-pricer.test.ts
 *
 * Live (read-only) test of bounty pricing through the NEAR Intents 1Click API.
 * Sends a dry quote: no deposit address is issued and no funds move.
 */

import { priceBountyViaIntents } from "../src/near/intents-pricer.js";

const p = await priceBountyViaIntents(0.03);
console.log(JSON.stringify(p, null, 2));

const ok =
  p.pricingSource === "near_intents_1click_dry_quote" &&
  BigInt(p.escrowYocto) > 0n &&
  !!p.quote?.signature &&
  !!p.quote?.correlationId;

if (!ok) {
  console.error(`\n✕ INTENTS PRICER TEST FAILED: ${p.error ?? "unexpected response"}`);
  process.exit(1);
}
console.log(`\n✓ INTENTS PRICER TEST PASSED: $${p.bountyUsd} USDC ≈ ${p.escrowNear} NEAR (1Click correlationId ${p.quote?.correlationId})`);
