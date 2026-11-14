/**
 * scripts/verify-near.js
 * Read-only NEAR testnet verifier. Requires no private keys or funds.
 * Queries get_mission, get_mission_contributions, and get_agent_reputation.
 */

const fs = require('fs');
const path = require('path');
const { JsonRpcProvider } = require(path.resolve(__dirname, '../apps/server/node_modules/near-api-js'));

const CONTRACT_ID = process.env.NEAR_CONTRACT_ID || 'harsha-swarm.testnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';

function resolveLatestMissionId() {
  if (process.argv[2]) {
    return { id: process.argv[2], source: 'CLI argument' };
  }
  const resultsDir = path.resolve(__dirname, '../apps/server/tests/results');
  if (fs.existsSync(resultsDir)) {
    const primary = path.join(resultsDir, 'mission-result.json');
    if (fs.existsSync(primary)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(primary, 'utf8'));
        if (parsed.missionId) {
          return { id: parsed.missionId, source: 'latest mission-result.json' };
        }
      } catch (_) {}
    }
    const files = fs.readdirSync(resultsDir)
      .filter(f => f.startsWith('mission-') && f.endsWith('.json'))
      .map(f => ({ name: f, full: path.join(resultsDir, f), mtime: fs.statSync(path.join(resultsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const file of files) {
      try {
        const parsed = JSON.parse(fs.readFileSync(file.full, 'utf8'));
        if (parsed.missionId) {
          return { id: parsed.missionId, source: `newest results file (${file.name})` };
        }
      } catch (_) {}
    }
  }
  return { id: 'test-mission-1794640261981', source: 'default fallback' };
}

const { id: MISSION_ID, source: MISSION_SOURCE } = resolveLatestMissionId();

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  BUGBOUNTY SWARM — READ-ONLY NEAR TESTNET VERIFIER');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Contract Account : ${CONTRACT_ID}`);
  console.log(`RPC Endpoint     : ${RPC_URL}`);
  console.log(`Target Mission   : ${MISSION_ID} (Source: ${MISSION_SOURCE})`);
  console.log('────────────────────────────────────────────────────────────\n');

  const provider = new JsonRpcProvider({ url: RPC_URL });

  // 1. Query Mission Attestation
  console.log('[1/3] Calling view method: get_mission…');
  try {
    const rawMission = await provider.callFunction({
      contractId: CONTRACT_ID,
      method: 'get_mission',
      args: { mission_id: MISSION_ID },
    });
    console.log('✓ On-Chain Mission Attestation:');
    console.log(JSON.stringify(rawMission, null, 2));
  } catch (err) {
    console.error('✕ Failed to retrieve mission:', err.message);
  }

  // 2. Query Agent Contributions
  console.log('\n[2/3] Calling view method: get_mission_contributions…');
  try {
    const rawContribs = await provider.callFunction({
      contractId: CONTRACT_ID,
      method: 'get_mission_contributions',
      args: { mission_id: MISSION_ID },
    });
    console.log('✓ Recorded Agent Contributions:');
    console.log(JSON.stringify(rawContribs, null, 2));
  } catch (err) {
    console.error('✕ Failed to retrieve contributions:', err.message);
  }

  // 3. Query Agent Reputations
  console.log('\n[3/3] Calling view method: get_agent_reputation…');
  const agents = ['ReconAgent', 'IdorAgent', 'XssAgent', 'BusinessLogicAgent'];
  for (const agent of agents) {
    try {
      const rep = await provider.callFunction({
        contractId: CONTRACT_ID,
        method: 'get_agent_reputation',
        args: { agent_id: agent },
      });
      console.log(`  - ${agent.padEnd(20)}: ${rep} reputation points`);
    } catch (err) {
      console.error(`  ✕ ${agent}:`, err.message);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  VERIFICATION COMPLETE (Read-only, 0 gas consumed)');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(console.error);
