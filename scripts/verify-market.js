/**
 * scripts/verify-market.js
 * Read-only verifier for the Swarm Bounty Market contract on market.harsha-swarm.testnet.
 */

const path = require('path');
const { JsonRpcProvider } = require(path.resolve(__dirname, '../apps/server/node_modules/near-api-js'));

const MARKET_CONTRACT = process.env.NEAR_MARKET_CONTRACT || 'market.harsha-swarm.testnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  BUGBOUNTY SWARM — BOUNTY MARKET READ-ONLY VERIFIER');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`Market Contract  : ${MARKET_CONTRACT}`);
  console.log(`RPC Endpoint     : ${RPC_URL}`);
  console.log('────────────────────────────────────────────────────────────\n');

  const provider = new JsonRpcProvider({ url: RPC_URL });

  // 1. Query Market Operator
  console.log('[1/3] Calling view method: get_operator…');
  try {
    const op = await provider.callFunction({
      contractId: MARKET_CONTRACT,
      method: 'get_operator',
      args: {},
    });
    console.log(`✓ Market Operator Account: ${op}`);
  } catch (err) {
    console.error('✕ Failed to retrieve operator:', err.message);
  }

  // 2. Query Agent Market Reputation
  console.log('\n[2/3] Calling view method: get_agent_reputation…');
  const accounts = [
    'idor.harsha-swarm.testnet',
    'xss.harsha-swarm.testnet',
    'logic.harsha-swarm.testnet',
    'gen1.harsha-swarm.testnet',
    'gen2.harsha-swarm.testnet',
  ];

  for (const acct of accounts) {
    try {
      const rep = await provider.callFunction({
        contractId: MARKET_CONTRACT,
        method: 'get_agent_reputation',
        args: { agent: acct },
      });
      console.log(`  - ${acct.padEnd(28)}: ${rep} market reputation points`);
    } catch (err) {
      console.error(`  ✕ ${acct}:`, err.message);
    }
  }

  // 3. Query Auction Rounds & Bids
  console.log('\n[3/3] Calling view methods: get_round & get_round_bids…');
  const fs = require('fs');
  let roundIds = [];
  try {
    const missionPath = path.resolve(__dirname, '../apps/server/tests/results/mission-result.json');
    if (fs.existsSync(missionPath)) {
      const data = JSON.parse(fs.readFileSync(missionPath, 'utf8'));
      if (data.marketRounds && data.marketRounds.length > 0) {
        roundIds = data.marketRounds.map((r) => r.roundId);
      }
    }
  } catch {}
  if (roundIds.length === 0) {
    roundIds = ['test-5bids-1794651747986'];
  }

  for (const rid of roundIds) {
    try {
      const round = await provider.callFunction({
        contractId: MARKET_CONTRACT,
        method: 'get_round',
        args: { round_id: rid },
      });
      if (round) {
        console.log(`\n  Round ID   : ${round.round_id}`);
        console.log(`  Task ID    : ${round.task_id}`);
        console.log(`  Reward     : ${(Number(round.reward) / 1e24).toFixed(3)} NEAR`);
        console.log(`  Status     : ${round.status}`);
        console.log(`  Winner     : ${round.winner || 'None'}`);
        console.log(`  Paid Flag  : ${round.status === 'Paid' ? 'YES (Confirmed on-chain)' : 'NO'}`);

        const bids = await provider.callFunction({
          contractId: MARKET_CONTRACT,
          method: 'get_round_bids',
          args: { round_id: rid },
        });
        console.log(`  Bids (${bids.length} total):`);
        for (const b of bids) {
          const conf = b.confidence_bps !== null && b.confidence_bps !== undefined ? `${(b.confidence_bps / 100).toFixed(0)}%` : 'unrevealed';
          const cost = b.cost_yocto !== null && b.cost_yocto !== undefined ? `${b.cost_yocto}` : 'unrevealed';
          console.log(`    - ${b.bidder.padEnd(28)}: conf=${conf}, cost=${cost}, revealed=${b.revealed}`);
        }
      }
    } catch (err) {
      console.error(`  ✕ Round ${rid}:`, err.message);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  MARKET VERIFICATION COMPLETE (Read-only, 0 gas consumed)');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(console.error);
