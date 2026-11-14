/**
 * scripts/generate-proof.js
 *
 * Dynamically generates docs/near-proof.md from the latest mission result file.
 * Eliminates all hardcoded hashes in documentation.
 */

const fs = require('fs');
const path = require('path');

const missionPath = path.resolve(__dirname, '../apps/server/tests/results/mission-result.json');
const outputPath = path.resolve(__dirname, '../docs/near-proof.md');

function main() {
  console.log('Generating docs/near-proof.md from latest mission result…');

  if (!fs.existsSync(missionPath)) {
    console.error(`✕ Mission result not found at ${missionPath}. Run a mission first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(missionPath, 'utf8'));
  const att = data.nearAttestation || {};
  const rounds = data.marketRounds || [];

  const lines = [
    '# NEAR Protocol Testnet Verification Proofs',
    '',
    `> **Generated from Mission**: \`${data.missionId}\`  `,
    `> **Timestamp**: ${data.completedAt || new Date().toISOString()}  `,
    `> **Status**: ${data.status.toUpperCase()}  `,
    '',
    '---',
    '',
    '## 1. Smart Contracts on NEAR Testnet',
    '',
    `- **Attestation Contract**: [\`${att.contractId || 'harsha-swarm.testnet'}\`](https://testnet.nearblocks.io/address/${att.contractId || 'harsha-swarm.testnet'})`,
    `- **Bounty Market Contract**: [\`market.harsha-swarm.testnet\`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)`,
    '',
    '---',
    '',
    '## 2. Master Mission Attestation',
    '',
    `- **Mission ID**: \`${data.missionId}\``,
    `- **Result Hash (SHA-256)**: \`${att.resultHash || 'N/A'}\``,
    `- **Findings Hash (SHA-256)**: \`${att.findingsHash || 'N/A'}\``,
    `- **Verified Vulnerabilities**: ${data.summary?.totalVerifiedVulnerabilities ?? data.verifiedFindings?.length ?? 0}`,
    `- **Attestation Transaction**: [${att.missionTxHash || 'None'}](https://testnet.nearblocks.io/txns/${att.missionTxHash || ''})`,
    '',
    '---',
    '',
    '## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids',
    '',
    '| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |',
    '|---|---|---|---|---|',
  ];

  for (const r of rounds) {
    const txLink = r.payoutTxHash
      ? `[\`${r.payoutTxHash.slice(0, 12)}…\`](https://testnet.nearblocks.io/txns/${r.payoutTxHash})`
      : 'None';
    lines.push(`| \`${r.roundId}\` | \`${r.taskId}\` | \`${r.winnerAccount}\` | \`${r.payoutStatus.toUpperCase()}\` | ${txLink} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 4. How to Verify On-Chain (Zero Gas / Read-Only)');
  lines.push('');
  lines.push('Anyone can verify the attestation and market state using the read-only scripts without keys:');
  lines.push('```bash');
  lines.push('# 1. Verify master mission attestation, contributions, and reputation');
  lines.push('npm run verify:near');
  lines.push('');
  lines.push('# 2. Verify market rounds, sealed bids, reveals, and payouts');
  lines.push('npm run verify:market');
  lines.push('```');
  lines.push('');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`✓ Successfully generated ${outputPath}`);
}

main();
