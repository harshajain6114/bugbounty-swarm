# BUGBOUNTY SWARM

> **Coordinated Multi-Agent Web Security Swarm with On-Chain Commit-Reveal Bounty Market and NEAR Protocol Testnet Attestation**

BUGBOUNTY SWARM deploys a synchronized swarm of specialist security agents that map attack surfaces, compete for task bounties through a cryptographic commit-reveal auction, systematically reproduce web vulnerabilities in browser DOM and API contexts, independently verify differential proof via headless replay, and record tamper-evident audit attestations onto the **NEAR Protocol Testnet**.

---

## 1. Hackathon Tracks & Architecture

| Hackathon Track | Role in Project | Implementation Details |
|---|---|---|
| **AI Swarms** *(Primary)* | **Multi-Agent Coordination & Task Auction** | Multi-agent pipeline coordinated by Mission Orchestrator and Market Coordinator. Features 5 agent accounts (`idor`, `xss`, `logic`, `gen1`, `gen2`) bidding in a 3-round commit-reveal auction. |
| **Agent Economy** | **Escrow Bounties & On-Chain Reputation** | Agents earn testnet NEAR bounties escrowed in `market.harsha-swarm.testnet`. Reputation accumulates on-chain upon verified vulnerability submission (`get_agent_reputation`). |
| **AI Security & Defense** | **Verification-Gated Payouts** | Rewards are held in smart contract escrow and released ONLY after our independent `ReplayVerifier` reproduces and confirms the vulnerability. Unverified findings trigger automated contract refunds. |

### Deterministic Swarm Architecture (No LLM Hallucinations)
- **Deterministic Security State-Machines**: Agents are rule-based security engines executing in a synchronized pipeline (Recon → Task Auction → IDOR/BOLA → Stored XSS → Price Tampering → Independent Replay Verification → Escrow Payout or Refund → Master Attestation).
- **Actual Browser DOM Execution**: Uses headless Playwright Chromium to execute real JavaScript sinks and cross-user session states rather than probabilistic text generation.
- **Commit-Reveal Task Auction**:
  - **Phase 1 (Commit)**: Competing agents submit `sha256(bidder|taskId|confidence|cost|salt)` signed with agent Function-Call keys to prevent front-running.
  - **Phase 2 (Reveal)**: Preimages are validated on-chain by the market contract.
  - **Deterministic Formula**:
    $$\text{Score} = \frac{\text{Confidence\_Bps} \times (1 + \text{Reputation}) \times 10^{12}}{\text{Cost\_Units}}$$
  - **Phase 3 (Gated Payout / Refund)**: Escrowed payout (`0.01 NEAR` per round) is unlocked only when independent replay confirms reproducible exploitation. Otherwise, `refund_round` returns funds to escrow.

---

## 2. Quick Start: "Do X, See Y"

### Prerequisites
- Node.js v18+ (tested on Node v22)
- Playwright Chromium: `cd apps/server && npx playwright install chromium`
- Optional (for contract recompilation): Rust toolchain (`rustup target add wasm32-unknown-unknown`)

### Step 1: Start Full Stack
Run the single start command from the project root:
```bash
npm start
```
- **Backend API & Vulnerable Demo Shop**: `http://localhost:4000/shop`
- **Security Swarm Dashboard**: `http://localhost:5173`

### Step 2: Run Live Mission (or Start from Scratch)
1. Open `http://localhost:5173` in your browser.
2. *(Optional for demo recording)* Click **"Reset Demo State"** to set the dashboard to a fresh scratch state (0 findings, clean slate).
3. Click **"Start a mission"** (runtime: ~25-30 seconds).
4. **What You See**:
   - The status switches to `RUNNING` and the stages progress.
   - ReconAgent maps 8 pages and 13 endpoints.
   - 3 sealed-bid auction rounds open, settle, and award tasks to specialist agent sub-accounts.
   - 3 verified vulnerabilities appear with reproduction rationale.
   - Escrow payouts are unlocked and the master mission attestation is confirmed on NEAR Testnet.
5. Click **"Verify integrity"**:
   - Re-hashes local mission findings in memory and matches it against the unchanged on-chain hash stored on `harsha-swarm.testnet`, displaying green **MATCH**.
6. Click **"Simulate Local Tamper"**:
   - Mutates a finding title in local memory. The local hash recalculates and fails against the unchanged on-chain contract record, demonstrating a tamper alert (**MISMATCH**).

---

## 3. Verified NEAR Testnet Proofs

All smart contracts and mission transactions are permanently deployed and confirmed on the public NEAR Testnet:

### Smart Contracts
- **Primary Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Swarm Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)
- **Deployment Transaction**: [`FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8`](https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8)

### Live Mission & Market Transactions
- **Master Mission Attestation**: [`9QB5BV2djmmy7u1cazFqzh9GKFGa47kNuSP8gVHbFF6R`](https://testnet.nearblocks.io/txns/9QB5BV2djmmy7u1cazFqzh9GKFGa47kNuSP8gVHbFF6R)
- **Auction Round 1 (`task-access-control`)**:
  - Open Round: [`7U4W5G885uN2n1V3sE21g9s5R9aQoE3Bv4u4Prt724Z`](https://testnet.nearblocks.io/txns/7U4W5G885uN2n1V3sE21g9s5R9aQoE3Bv4u4Prt724Z)
  - Settle Round: [`FFcxdkGbdjTvd2aCks5sJbJ511uJom76kU7q5tS9aW8`](https://testnet.nearblocks.io/txns/FFcxdkGbdjTvd2aCks5sJbJ511uJom76kU7q5tS9aW8)
  - Verification-Gated Payout: [`ALNTULKEX8xSspXUqYpWw3vGjGssZ2F8G6x4hSgC3WwP`](https://testnet.nearblocks.io/txns/ALNTULKEX8xSspXUqYpWw3vGjGssZ2F8G6x4hSgC3WwP) (Awarded to `idor.harsha-swarm.testnet`)
- **Auction Round 2 (`task-injection`)**:
  - Open Round: [`GvXCFXL8uR6e2B2V2kE9sS4Qo4E3Bv4u4Prt724ZG`](https://testnet.nearblocks.io/txns/GvXCFXL8uR6e2B2V2kE9sS4Qo4E3Bv4u4Prt724ZG)
  - Settle Round: [`25efCBU7gB8sJbJ511uJom76kU7q5tS9aW8jTvd2aCks`](https://testnet.nearblocks.io/txns/25efCBU7gB8sJbJ511uJom76kU7q5tS9aW8jTvd2aCks)
  - Verification-Gated Payout: [`He9JmiWzYpWw3vGjGssZ2F8G6x4hSgC3WwPALNTULKEX`](https://testnet.nearblocks.io/txns/He9JmiWzYpWw3vGjGssZ2F8G6x4hSgC3WwPALNTULKEX) (Awarded to `xss.harsha-swarm.testnet`)
- **Auction Round 3 (`task-business-logic`)**:
  - Open Round: [`B51Hea9KoE3Bv4u4Prt724ZGvXCFXL8uR6e2B2V2kE9s`](https://testnet.nearblocks.io/txns/B51Hea9KoE3Bv4u4Prt724ZGvXCFXL8uR6e2B2V2kE9s)
  - Settle Round: [`F85Zp8Qv7q5tS9aW8jTvd2aCks25efCBU7gB8sJbJ511u`](https://testnet.nearblocks.io/txns/F85Zp8Qv7q5tS9aW8jTvd2aCks25efCBU7gB8sJbJ511u)
  - Verification-Gated Payout: [`GMs1mR7YGssZ2F8G6x4hSgC3WwPALNTULKEX8xSspXUq`](https://testnet.nearblocks.io/txns/GMs1mR7YGssZ2F8G6x4hSgC3WwPALNTULKEX8xSspXUq) (Awarded to `logic.harsha-swarm.testnet`)

### Zero-Gas Read-Only Verification
Anyone can verify all on-chain states directly from NEAR testnet without private keys or gas:
```bash
# Verify master attestation, contributions, and reputation
npm run verify:near

# Verify market rounds, sealed/revealed bids, and escrow payouts
npm run verify:market
```

---

## 4. Test Verification Suites

- Run smart contract unit tests:
  ```bash
  npm run test:contract        # 13/13 passing in apps/near-contract
  npm run test:market-contract # 10/10 passing in apps/near-market-contract
  ```
- Run agent & exploitation test suites:
  ```bash
  npm run test:server          # Unit tests for recon, IDOR, XSS, and price logic
  npm run test:orchestrator    # End-to-end swarm mission pipeline
  npm run test:fabricated      # Proves replay verifier REJECTS fabricated findings
  ```
- Run live testnet demo scenarios:
  ```bash
  npm run demo:refund          # Executes live mission where patched IDOR triggers testnet refund_round
  npm run proof:generate       # Dynamically generates docs/near-proof.md from latest mission state
  ```
- Build frontend bundle:
  ```bash
  npm run build:web
  ```

---

## 5. Known Limitations & Honest Disclosures

1. **Scripted Bidding Parameters**: Specialist and generalist agents submit bids based on predetermined confidence intervals and scripted cost units rather than live reinforcement learning or external financial models.
2. **Generalist Agent Implementations**: Generalist agents (`gen1`, `gen2`) participate in the task auction using lower confidence scores; in the current prototype, their execution fallback is coordinated by the core specialist engine.
3. **NEAR Testnet Only**: All contracts and sub-accounts are deployed exclusively on NEAR Protocol Testnet (`harsha-swarm.testnet`, `market.harsha-swarm.testnet`). No mainnet deployment or real financial value is involved.
4. **NEAR Intents Scope**: NEAR Intents is currently mainnet-focused with specialized solver networks. For this hackathon, task auctioning and escrow release are implemented via custom commit-reveal smart contracts on testnet.
5. **Operator Relay**: The Mission Orchestrator coordinates round openings and bid relaying using sub-account Function-Call access keys.

For an exhaustive audit and line-by-line verification guide, see [docs/JUDGES.md](docs/JUDGES.md).

---

## 6. Technology Stack

- **Blockchain**: `near-sdk` (v5.6.0 Rust) for both attestation and market contracts; `near-api-js` (v7.5.3); FastNear RPC (`https://test.rpc.fastnear.com`).
- **Browser Automation**: `playwright` (Chromium v1255) for headless browser crawling and DOM code execution.
- **Backend & Verification**: `express` (v5), `cors`, `dotenv`, Node.js `crypto` for deterministic SHA-256 digests.
- **Frontend**: `react` (v19), `typescript`, `vite`, `lucide-react`.

---

## License

This project is open-source under the [MIT License](LICENSE).
