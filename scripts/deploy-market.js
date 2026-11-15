/**
 * scripts/deploy-market.js
 *
 * Builds apps/near-market-contract from source and deploys it to the market
 * account (in-place code upgrade; no re-init, state layout unchanged).
 * Signs with the market account's key from ~/.near-credentials/testnet.
 * Afterwards, `npm run verify:deployment` should report MATCH.
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARKET = process.env.NEAR_MARKET_CONTRACT || 'market.harsha-swarm.testnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';

async function main() {
  const manifest = path.join(ROOT, 'apps/near-market-contract/Cargo.toml');
  const build = spawnSync('cargo', ['build', '--manifest-path', manifest, '--target', 'wasm32-unknown-unknown', '--release'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) throw new Error('cargo build failed');

  const wasmPath = path.join(ROOT, 'apps/near-market-contract/target/wasm32-unknown-unknown/release/bugbounty_swarm_market_contract.wasm');
  const code = fs.readFileSync(wasmPath);
  console.log(`wasm sha256: ${crypto.createHash('sha256').update(code).digest('hex')} (${code.length} bytes)`);

  const credPath = path.join(os.homedir(), '.near-credentials', 'testnet', `${MARKET}.json`);
  const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = require(path.join(ROOT, 'apps/server/node_modules/near-api-js'));
  const account = new Account(MARKET, new JsonRpcProvider({ url: RPC_URL }), new KeyPairSigner(KeyPair.fromString(cred.private_key || cred.secret_key)));

  const res = await account.deployContract(new Uint8Array(code));
  const hash = res?.transaction?.hash ?? res?.transaction_outcome?.id;
  console.log(`✓ Deployed to ${MARKET}: tx ${hash}`);
}

main().catch((e) => { console.error('✕', e.message); process.exit(1); });
