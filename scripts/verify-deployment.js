/**
 * scripts/verify-deployment.js
 *
 * Proves the contracts running on NEAR testnet are built from THIS source.
 *
 * For each contract: build the wasm from source into a fresh temp target dir,
 * take its SHA-256, and compare with the `code_hash` that NEAR RPC reports
 * for the deployed account (view_account; base58 of the wasm's SHA-256).
 *
 * Read-only on chain (0 gas). Requires Rust + `rustup target add wasm32-unknown-unknown`.
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RPC_URL = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = [
  { dir: 'apps/near-market-contract', wasm: 'bugbounty_swarm_market_contract.wasm', account: process.env.NEAR_MARKET_CONTRACT || 'market.harsha-swarm.testnet' },
  { dir: 'apps/near-contract', wasm: 'bugbounty_swarm_contract.wasm', account: process.env.NEAR_CONTRACT_ID || 'harsha-swarm.testnet' },
];

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58ToHex(s) {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error(`invalid base58 char ${c}`);
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(64, '0');
}

async function onChainCodeHash(accountId) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'va', method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: accountId },
    }),
  });
  const data = await res.json();
  if (!data.result?.code_hash) throw new Error(`view_account failed for ${accountId}`);
  return data.result.code_hash;
}

async function main() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  DEPLOYMENT VERIFICATION: on-chain code == this source');
  console.log('════════════════════════════════════════════════════════════');
  const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-wasm-'));
  let failures = 0;

  for (const c of CONTRACTS) {
    console.log(`\n[${c.account}] building ${c.dir} from source…`);
    const targetDir = path.join(targetRoot, path.basename(c.dir));
    const build = spawnSync('cargo', [
      'build', '--manifest-path', path.join(ROOT, c.dir, 'Cargo.toml'),
      '--target', 'wasm32-unknown-unknown', '--release', '--target-dir', targetDir,
    ], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (build.status !== 0) {
      console.error('  ✕ cargo build failed (is Rust + wasm32-unknown-unknown installed?)');
      failures++;
      continue;
    }
    const wasmPath = path.join(targetDir, 'wasm32-unknown-unknown', 'release', c.wasm);
    const localHex = crypto.createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
    const chainB58 = await onChainCodeHash(c.account);
    const chainHex = base58ToHex(chainB58);
    const match = localHex === chainHex;
    console.log(`  local  sha256 : ${localHex}`);
    console.log(`  chain  sha256 : ${chainHex}  (code_hash ${chainB58})`);
    console.log(`  ${match ? '✓ MATCH: deployed code is built from this source' : '✕ MISMATCH'}`);
    if (!match) failures++;
  }

  fs.rmSync(targetRoot, { recursive: true, force: true });
  console.log('\n════════════════════════════════════════════════════════════');
  if (failures) {
    console.error(`  ✕ ${failures} contract(s) did not verify`);
    process.exit(1);
  }
  console.log('  ✓ ALL DEPLOYED CONTRACTS MATCH SOURCE (read-only, 0 gas)');
  console.log('════════════════════════════════════════════════════════════');
}

main().catch((e) => { console.error(e); process.exit(1); });
