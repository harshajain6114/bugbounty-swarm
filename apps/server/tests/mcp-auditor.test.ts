/**
 * apps/server/tests/mcp-auditor.test.ts
 *
 * Read-only test (no gas, no keys needed beyond the public .agent-keys.json
 * entries) for the NEAR MCP pre-payout auditor. Uses rounds already on
 * market.harsha-swarm.testnet to prove the audit REJECTS bad payouts.
 */

import { McpAuditor } from "../src/near/mcp-auditor.js";

// A round from the documented refund demo: status is now Paid (payout done).
const PAID_ROUND = "mission-refund-1794721485135-r2";
const PAID_ROUND_WINNER = "xss.harsha-swarm.testnet";

let failures = 0;
function check(cond: boolean, label: string) {
  console.log(`  ${cond ? "✓" : "✕"} ${label}`);
  if (!cond) failures++;
}

const auditor = new McpAuditor();
try {
  console.log("\n[1] Already-paid round must not be approved again");
  const a1 = await auditor.auditRoundBeforePayout(PAID_ROUND, PAID_ROUND_WINNER);
  check(a1.roundStatus === "Paid", `MCP read round status via get_round (got ${a1.roundStatus})`);
  check(a1.winnerMatches, "MCP read on-chain winner matches");
  check(a1.winnerKeyScoped, "MCP confirmed winner's bid key is FunctionCall-scoped to market commit_bid/reveal_bid");
  check(!a1.approved, `Audit rejected: ${a1.reasons.join("; ")}`);

  console.log("\n[2] Wrong recorded winner must be rejected");
  const a2 = await auditor.auditRoundBeforePayout(PAID_ROUND, "gen2.harsha-swarm.testnet");
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
