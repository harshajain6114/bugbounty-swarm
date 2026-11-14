# BUGBOUNTY SWARM

> **Autonomous Multi-Agent Web Security Research Platform with On-Chain NEAR Protocol Testnet Attestation**

BUGBOUNTY SWARM deploys a synchronized collective of specialist security agents that autonomously map attack surfaces, systematically reproduce web vulnerabilities in actual browser DOM and API contexts, independently verify cryptographic and differential proof, and record tamper-evident audit attestations onto the **NEAR Protocol Testnet**.

---

## 1. Core Tracks & Design Principles

- **Primary Track**: **AI Swarms** — A cooperative multi-agent architecture featuring a Reconnaissance Agent and three specialized exploitation agents coordinated by a sequential Mission Orchestrator.
- **Verification Layer**: **NEAR Protocol Testnet** — Smart contract state records mission hashes, vulnerability counts, and individual agent reputation scores.
- **Honest Agent Architecture**: Agents are **rule-based, deterministic security state-machines** designed for reproducibility, stability, and zero hallucination. They use Playwright for real Chromium DOM evaluation rather than LLM guesswork.

---

## 2. Quick Start: "Do X, See Y"

### Prerequisites
- Node.js v18+ (tested on Node v22)
- Rust toolchain (optional, for contract recompilation: `rustup target add wasm32-unknown-unknown`)
- Chromium for Playwright: `cd apps/server && npx playwright install chromium`

### Step 1: Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your NEAR testnet credentials are set (or leave defaults to test in local simulation mode):
```env
NEAR_NETWORK_ID=testnet
NEAR_RPC_URL=https://rpc.testnet.near.org
NEAR_ACCOUNT_ID=harsha-swarm.testnet
NEAR_PRIVATE_KEY=ed25519:<YOUR_KEY>
NEAR_CONTRACT_ID=harsha-swarm.testnet
```

### Step 2: Start Backend & Frontend Together
Run the single start command from root:
```bash
npm start
```
- **Backend API & Demo Shop**: `http://localhost:4000/shop`
- **Security Dashboard**: `http://localhost:5173`

### Step 3: Run Mission & See Results
1. Open `http://localhost:5173`.
2. Click **"Start a mission"**.
3. **What You See**:
   - The swarm executes: ReconAgent crawls 8 pages and 13 endpoints; IdorAgent, XssAgent, and BusinessLogicAgent reproduce 3 critical/high vulnerabilities.
   - Findings appear in the real-time findings table with cryptographic DOM/HTTP proof.
   - The mission attestation transaction hash is broadcasted to NEAR Testnet and linked to the NearBlocks Explorer.
4. Click **"Verify integrity"**:
   - Computes local SHA-256 hash and validates it against the on-chain hash stored on `harsha-swarm.testnet`, displaying **MATCH**.
5. Click **"Simulate Tamper"**:
   - Mutates a title in memory and recalculates the hash, highlighting an on-chain **MISMATCH**.

---

## 3. Verified NEAR Testnet Proofs

- **Contract Account**: `harsha-swarm.testnet`
- **Deployment Tx**: [FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8](https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8)
- **Live Mission Attestation Tx**: [CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb](https://testnet.nearblocks.io/txns/CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb)
- **Agent Contributions**:
  - `IdorAgent`: [Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ](https://testnet.nearblocks.io/txns/Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ)
  - `XssAgent`: [2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2](https://testnet.nearblocks.io/txns/2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2)
  - `BusinessLogicAgent`: [5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc](https://testnet.nearblocks.io/txns/5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc)

Full proof records and view readbacks are documented in [docs/near-proof.md](docs/near-proof.md).

---

## 4. Test Verification Suites

- Run all security exploits: `npm run test:server`
- Run full mission orchestrator pipeline: `npm run test:orchestrator`
- Run smart contract tests: `npm run test:contract` (13/13 passing)
