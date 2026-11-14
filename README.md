# BUGBOUNTY SWARM

> **Multi-Agent Web Security Research Platform with On-Chain NEAR Protocol Testnet Attestation**

BUGBOUNTY SWARM deploys a synchronized pipeline of specialist security agents that map attack surfaces, systematically reproduce web vulnerabilities in actual browser DOM and API contexts, independently verify cryptographic and differential proof, and record tamper-evident audit attestations onto the **NEAR Protocol Testnet**.

---

## 1. Tracks & Architecture

- **Primary Track**: **AI Swarms** — A cooperative multi-agent architecture featuring a Reconnaissance Agent and three specialized security testing agents coordinated by a sequential Mission Orchestrator.
- **Secondary Track**: **Open Innovation** — Permissionless, on-chain vulnerability attestation and researcher reputation registry on the NEAR blockchain.
- **Accurate Agent Architecture**: Agents are **rule-based, deterministic security state-machines** executing in a strict **sequential pipeline** (Recon → IDOR/BOLA → Stored XSS → Price Manipulation → Verification). They use Playwright for actual Chromium DOM execution rather than probabilistic LLMs, guaranteeing 100% reproducible results for bounty triaging.
- **Reputation Formula**: Each validated vulnerability finding confirmed by an agent awards **1 reputation point** on-chain (`get_agent_reputation = sum(findings_contributed)` across all attested missions). Reconnaissance agents focus strictly on discovery and surface mapping without modifying state, maintaining 0 vulnerability points by design.

---

## 2. Quick Start: "Do X, See Y"

### Prerequisites
- Node.js v18+ (tested on Node v22)
- Playwright Chromium: `cd apps/server && npx playwright install chromium`
- Optional (for contract recompilation): Rust toolchain (`rustup target add wasm32-unknown-unknown`)

### Step 1: Configure Environment (Optional for Local Simulation)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*Note: If `NEAR_PRIVATE_KEY` is omitted or left unset, the system automatically runs in local simulation mode with NEAR attestation gracefully set to "not configured", allowing full mission execution and local verification without requiring testnet funds.*

### Step 2: Start Backend & Frontend Together
Run the single start command from the project root:
```bash
npm start
```
- **Backend API & Demo Shop**: `http://localhost:4000/shop`
- **Security Dashboard**: `http://localhost:5173`

### Step 3: Run Mission & See Results
1. Open `http://localhost:5173`.
2. Click **"Start a mission"** (expected runtime: ~25-30 seconds).
3. **What You See**:
   - The sequential pipeline executes: ReconAgent crawls 8 pages and 13 endpoints; IdorAgent, XssAgent, and BusinessLogicAgent reproduce 3 real vulnerabilities.
   - The mission table renders the 3 confirmed vulnerabilities with their exact endpoints and verification rationale.
   - The mission attestation transaction hash is broadcasted to NEAR Testnet and linked directly to NearBlocks Explorer.
4. Click **"Verify integrity"**:
   - Re-hashes the local mission result in memory and compares it against the unchanged on-chain hash stored on `harsha-swarm.testnet`, displaying **MATCH**.
5. Click **"Simulate Local Tamper"**:
   - Mutates a finding title in local memory and recalculates the local hash. The unchanged on-chain contract record does not match, clearly demonstrating a tamper alert (**MISMATCH**).

---

## 3. Verified NEAR Testnet Proofs

All transactions are permanently verified on the public NEAR Testnet:

- **Contract Account**: `harsha-swarm.testnet`
- **Deployment Transaction**: [`FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8`](https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8)
- **Live Mission Attestation**: [`CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb`](https://testnet.nearblocks.io/txns/CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb)
- **Specialist Agent Contribution Proofs**:
  - `ReconAgent`: [`CWrogvhg4QbZsXhdQr9gRWnQnzCaRvjiHKByCY2VpUbz`](https://testnet.nearblocks.io/txns/CWrogvhg4QbZsXhdQr9gRWnQnzCaRvjiHKByCY2VpUbz)
  - `IdorAgent`: [`Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ`](https://testnet.nearblocks.io/txns/Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ)
  - `XssAgent`: [`2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2`](https://testnet.nearblocks.io/txns/2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2)
  - `BusinessLogicAgent`: [`5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc`](https://testnet.nearblocks.io/txns/5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc)

Run the zero-dependency read-only verifier anytime (requires no private keys or tokens):
```bash
npm run verify:near
```

Full details and view call outputs are in [docs/near-proof.md](docs/near-proof.md).

---

## 4. Libraries and AI-Assisted Code Used

- **Blockchain**: `near-sdk` (v5.6.0 Rust) for the on-chain smart contract; `near-api-js` (v7.5.3) for JSON-RPC communication and signing.
- **Agent Browser Automation**: `playwright` (Chromium v1255) for browser-based crawling, session authentication, and Stored XSS DOM sink execution.
- **Backend & API**: `express` (v5), `cors`, `dotenv`, Node.js built-in `crypto` for deterministic SHA-256 digests.
- **Frontend**: `react` (v19), `typescript`, `vite`, `lucide-react`, `recharts`.
- **AI-Assisted Scaffolding**: Antigravity agentic assistant used for code generation, test orchestration, and toolchain debugging.

---

## 5. Test Verification Suites

- Run smart contract tests: `npm run test:contract` (13/13 passing)
- Run read-only NEAR testnet check: `npm run verify:near`
- Run local security exploitation tests: `npm run test:server`
- Run full mission orchestrator pipeline: `npm run test:orchestrator`
- Build frontend dashboard: `npm run build:web`

---

## License

This project is open-source under the [MIT License](LICENSE).
