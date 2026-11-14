# BUGBOUNTY SWARM — NEAR Protocol Testnet Smart Contract

This package contains the smart contract for anchoring autonomous security testing missions and specialist agent contributions to the **NEAR Protocol Testnet**.

> **SECURITY NOTICE**: This contract is strictly designated for **NEAR TESTNET**. Never deploy to mainnet or use real funds. Never commit or expose private keys or seed phrases.

---

## 1. Architecture

The contract (`BugBountySwarmContract`) maintains an immutable, tamper-evident audit trail of verified security testing activities:

- **Mission Attestation**:
  - `mission_id`: Unique identifier of the test execution.
  - `result_hash`: Deterministic SHA-256 digest of the complete mission output.
  - `findings_hash`: Deterministic SHA-256 digest of verified vulnerability signatures.
  - `verified_finding_count`: Total number of independently confirmed vulnerabilities.
  - `timestamp_ms`: Block timestamp when recorded.
  - `submitted_by`: Authorized operator account ID.
- **Agent Contributions & Reputation**:
  - Tracks individual specialist agent submissions (`ReconAgent`, `IdorAgent`, `XssAgent`, `BusinessLogicAgent`).
  - Maintains cumulative reputation points based on validated findings.
- **Access Control**:
  - Operator-restricted methods ensure only the authorized orchestrator backend can record findings.
  - Read-only view methods are public for permissionless verification.

---

## 2. Prerequisites & Compilation

Ensure the Rust toolchain with the WASM target is installed:

```powershell
rustup target add wasm32-unknown-unknown
```

### Build Wasm Artifact

Compile the release contract binary:

```powershell
cargo build --target wasm32-unknown-unknown --release
```

Compiled output:
`target/wasm32-unknown-unknown/release/bugbounty_swarm_contract.wasm`

---

## 3. Deployment Instructions (Requires User Action)

To deploy to NEAR Testnet:

1. **Create a Testnet Account**:
   - Go to [https://testnet.mynearwallet.com](https://testnet.mynearwallet.com) or [https://app.testnet.near.org](https://app.testnet.near.org).
   - Fund your testnet account using the testnet faucet.

2. **Login via NEAR CLI**:
   - Install NEAR CLI:
     ```bash
     npm install -g near-cli
     ```
   - Authenticate your account:
     ```bash
     near login
     ```

3. **Deploy & Initialise the Contract**:
   ```bash
   near deploy --wasmFile target/wasm32-unknown-unknown/release/bugbounty_swarm_contract.wasm --accountId YOUR_ACCOUNT.testnet --initFunction "new" --initArgs '{"operator": "YOUR_ACCOUNT.testnet"}'
   ```

4. **Configure Environment Variables**:
   Update `.env` in the repository root:
   ```env
   NEAR_NETWORK_ID=testnet
   NEAR_RPC_URL=https://rpc.testnet.near.org
   NEAR_ACCOUNT_ID=YOUR_ACCOUNT.testnet
   NEAR_PRIVATE_KEY=ed25519:YOUR_PRIVATE_KEY
   NEAR_CONTRACT_ID=YOUR_ACCOUNT.testnet
   ```

---

## 4. On-Chain Verification

Anyone can query the contract without transaction fees using view methods:

```bash
# Query mission details
near view YOUR_ACCOUNT.testnet get_mission '{"mission_id": "mission-1700000000000"}'

# Query all recorded mission IDs
near view YOUR_ACCOUNT.testnet get_mission_ids '{}

# Check agent reputation
near view YOUR_ACCOUNT.testnet get_agent_reputation '{"agent_id": "IdorAgent"}'
```

Transactions can also be verified using the NEAR Testnet Explorer:
`https://testnet.nearblocks.io/`
