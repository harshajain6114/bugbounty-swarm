/**
 * apps/server/tests/mcp-auditor.test.ts
 *
 * Read-only test (no gas) for the NEAR MCP pre-payout auditor, using rounds
 * already on market.harsha-swarm.testnet to prove the audit REJECTS bad payouts.
 */

import { McpAuditor } from "../src/near/mcp-auditor.js";

// Round 2 of mission-refund-1794725357805: already Paid, and its winning bid was
// signed by the agent's FULL-ACCESS key (a bug since fixed). Both must be caught.
const PAID_ROUND = "mission-refund-1794725357805-r2";
const PAID_ROUND_WINNER = "xss.harsha-swarm.testnet";
const FULL_KEY_COMMIT_TX = "CHzy2nJL7mR8mhw2naaAUkFoyqFFQL8NF1sBVhdgTDbX";

let failures = 0;
function check(cond: boolean, label: string) {
  console.log(`  ${cond ? "✓" : "✕"} ${label}`);
  if (!cond) failures++;
}

const auditor = new McpAuditor();
try {
  console.log("\n[1] Paid round whose bid was signed by a full-access key");
  const a1 = await auditor.auditRoundBeforePayout(PAID_ROUND, PAID_ROUND_WINNER, FULL_KEY_COMMIT_TX);
  check(a1.roundStatus === "Paid", `MCP read round status via get_round (got ${a1.roundStatus})`);
  check(a1.winnerMatches, "MCP read on-chain winner matches");
  check(!!a1.winnerBidKey, `read actual signer of winner's commit_bid from chain (${a1.winnerBidKey?.slice(0, 20)}…)`);
  check(!a1.winnerKeyScoped, "detected the signer is NOT a scoped FunctionCall key");
  check(!a1.approved, `Audit rejected: ${a1.reasons.join("; ")}`);

  console.log("\n[2] Wrong recorded winner must be rejected");
  const a2 = await auditor.auditRoundBeforePayout(PAID_ROUND, "gen2.harsha-swarm.testnet", FULL_KEY_COMMIT_TX);
  check(!a2.winnerMatches && !a2.approved, `Audit rejected: ${a2.reasons.join("; ")}`);

  console.log("\n[3] Non-existent round must be rejected");
  const a3 = await auditor.auditRoundBeforePayout("no-such-round", PAID_ROUND_WINNER);
  check(!a3.approved, `Audit rejected: ${a3.reasons.join("; ")}`);
} finally {
  await auditor.close();
}

if (failures > 0) {
  console.error(`\n✕ MCP AUDITOR TEST FAILED (${failures} check(s))`);
  process.exit(1);
}
console.log("\n✓ MCP AUDITOR TEST PASSED");
