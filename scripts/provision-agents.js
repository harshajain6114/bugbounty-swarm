/**
 * scripts/provision-agents.js
 *
 * Idempotently provisions Function-Call access keys for specialist and generalist
 * agent sub-accounts: idor, xss, logic, gen1, gen2.
 *
 * Permissions granted:
 *   Receiver: market.harsha-swarm.testnet
 *   Allowed Methods: ["commit_bid", "reveal_bid"]
 *   Allowance: 0.25 NEAR
 *
 * Keys are securely persisted to gitignored .agent-keys.json.
 * NEVER prints private keys to stdout.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Load .env manually if dotenv not in root
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

const AGENT_SUBACCOUNTS = [
  'idor.harsha-swarm.testnet',
  'xss.harsha-swarm.testnet',
  'logic.harsha-swarm.testnet',
  'gen1.harsha-swarm.testnet',
  'gen2.harsha-swarm.testnet',
];

const MARKET_CONTRACT = process.env.NEAR_MARKET_CONTRACT || 'market.harsha-swarm.testnet';
const OPERATOR_ID = process.env.NEAR_ACCOUNT_ID || 'harsha-swarm.testnet';
const RPC_URL = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com';
const KEYS_FILE = path.resolve(__dirname, '../.agent-keys.json');

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  BUGBOUNTY SWARM — Sub-Account & Function-Call Key Provisioner ');
  console.log(`  Market Contract : ${MARKET_CONTRACT}`);
  console.log(`  Operator        : ${OPERATOR_ID}`);
  console.log(`  RPC             : ${RPC_URL}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  const nearApi = require(path.resolve(__dirname, '../apps/server/node_modules/near-api-js'));
  const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = nearApi;
  const provider = new JsonRpcProvider({ url: RPC_URL });

  // Load existing stored keys if present
  let storedKeys = {};
  if (fs.existsSync(KEYS_FILE)) {
    try {
      storedKeys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    } catch {}
  }

  const credsDir = path.join(os.homedir(), '.near-credentials', 'testnet');

  for (const accountId of AGENT_SUBACCOUNTS) {
    console.log(`Checking sub-account: ${accountId}…`);

    // 1. Verify account exists
    const accRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'view-acc',
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: accountId },
      }),
    });
    const accData = await accRes.json();
    if (!accData.result) {
      console.error(`  ✕ Account ${accountId} does not exist on testnet!`);
      continue;
    }
    console.log(`  ✓ Account active (balance: ${(Number(accData.result.amount) / 1e24).toFixed(3)} NEAR)`);

    // 2. Query access keys
    const keysRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'view-keys',
        method: 'query',
        params: { request_type: 'view_access_key_list', finality: 'final', account_id: accountId },
      }),
    });
    const keysData = await keysRes.json();
    const existingKeys = keysData.result?.keys || [];

    const hasFcKey = existingKeys.some((k) => {
      const perm = k.access_key.permission;
      if (typeof perm === 'object' && perm.FunctionCall) {
        const fc = perm.FunctionCall;
        return (
          fc.receiver_id === MARKET_CONTRACT &&
          fc.method_names.includes('commit_bid') &&
          fc.method_names.includes('reveal_bid')
        );
      }
      return false;
    });

    if (hasFcKey && storedKeys[accountId]?.privateKey) {
      console.log(`  ✓ Function-Call key already exists on-chain and stored locally.`);
      continue;
    }

    // 3. Add Function-Call key using sub-account full access key
    const credPath = path.join(credsDir, `${accountId}.json`);
    let subAccountKey;
    if (fs.existsSync(credPath)) {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      subAccountKey = raw.private_key || raw.secret_key;
    }

    if (!subAccountKey) {
      console.warn(`  ⚠ No master credentials found for ${accountId} in ${credPath}`);
      continue;
    }

    const masterKp = KeyPair.fromString(subAccountKey);
    const masterSigner = new KeyPairSigner(masterKp);
    const subAccount = new Account(accountId, provider, masterSigner);

    // Generate new dedicated function-call keypair
    const newKp = KeyPair.fromRandom('ed25519');
    const newPubkey = newKp.getPublicKey();

    console.log(`  Adding Function-Call key on testnet for ${accountId}…`);
    try {
      await subAccount.addFunctionCallAccessKey({
        publicKey: newPubkey,
        contractId: MARKET_CONTRACT,
        methodNames: ['commit_bid', 'reveal_bid'],
        allowance: BigInt('250000000000000000000000'), // 0.25 NEAR allowance
      });

      storedKeys[accountId] = {
        publicKey: newPubkey.toString(),
        privateKey: newKp.toString(),
        contractId: MARKET_CONTRACT,
        methodNames: ['commit_bid', 'reveal_bid'],
        createdAt: new Date().toISOString(),
      };

      console.log(`  ✓ Function-Call key added and registered for ${accountId}.`);
    } catch (err) {
      console.error(`  ✕ Failed to add key for ${accountId}:`, err.message);
    }
  }

  // Persist keys securely to gitignored file
  fs.writeFileSync(KEYS_FILE, JSON.stringify(storedKeys, null, 2), { mode: 0o600 });
  console.log(`\nAgent function-call keys saved to ${KEYS_FILE} (gitignored).`);
  console.log('Provisioning complete.\n');
}

main().catch(console.error);
