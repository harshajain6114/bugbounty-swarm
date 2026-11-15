/**
 * scripts/test-all.js — `npm test`
 *
 * Runs every test that needs NO testnet signing key, in order, and prints a
 * pass/fail summary. Network use is read-only (1Click dry quote, NEAR MCP
 * view calls). Testnet-writing suites are separate:
 *   npm run test:orchestrator   (full mission: auction, payouts, attestation)
 *   npm run demo:refund         (patched target → on-chain refund_round)
 */

const { spawnSync } = require('child_process');

const STEPS = [
  ['Attestation contract (Rust unit tests)', 'npm run test:contract'],
  ['Market contract (Rust unit tests)', 'npm run test:market-contract'],
  ['Exploit reproduction: IDOR, stored XSS, price tampering', 'npm run test:server'],
  ['Recon agent', 'npm --prefix apps/server run test:recon'],
  ['IDOR agent', 'npm --prefix apps/server run test:idor-agent'],
  ['Stored XSS agent', 'npm --prefix apps/server run test:xss-agent'],
  ['Business logic agent', 'npm --prefix apps/server run test:business-logic-agent'],
  ['Replay verifier rejects fabricated finding', 'npm run test:fabricated'],
  ['NEAR AI response-signature recovery (offline)', 'npm run test:near-ai'],
  ['NEAR Intents 1Click dry-quote pricing (read-only)', 'npm run test:intents'],
  ['NEAR MCP pre-payout audit (read-only)', 'npm run test:mcp'],
  ['Server typecheck', 'npm --prefix apps/server run typecheck'],
];

const results = [];
for (const [label, cmd] of STEPS) {
  console.log(`\n▶ ${label}\n  $ ${cmd}`);
  const started = Date.now();
  const r = spawnSync(cmd, { stdio: 'inherit', shell: true });
  results.push({ label, ok: r.status === 0, secs: ((Date.now() - started) / 1000).toFixed(1) });
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('  TEST SUMMARY');
console.log('════════════════════════════════════════════════════════════');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✕'} ${r.label} (${r.secs}s)`);
const failed = results.filter((r) => !r.ok).length;
console.log('────────────────────────────────────────────────────────────');
console.log(`  ${results.length - failed}/${results.length} suites passed`);
process.exit(failed ? 1 : 0);
