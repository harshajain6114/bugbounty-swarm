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

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  MARKET VERIFICATION COMPLETE (Read-only, 0 gas consumed)');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(console.error);
