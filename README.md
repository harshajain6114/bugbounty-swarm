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

### Swarm Architecture: AI Decides What to Bid, Code Proves What Is Paid
- **Pipeline**: Recon → AI bid reasoning (NEAR AI Cloud) → 1Click-priced escrow → Commit-Reveal Auction → IDOR/BOLA → Stored XSS → Price Tampering → Independent Replay Verification → NEAR MCP Audit → Escrow Payout or Refund → Master Attestation.
- **AI Bid Reasoning on NEAR AI Cloud (TEE)** *(on when `NEAR_AI_API_KEY` is set)*: After recon, each of the 5 agents separately asks a TEE-hosted model (`cloud-api.near.ai`), given *its own* capabilities and the discovered attack surface, how confident it is for each task. Every completion is verified before use: the TEE signature's signed text must equal `sha256(request):sha256(response)`, the recovered EIP-191 signer must equal `signing_address`, and that signer must appear in an attestation report fetched with a **fresh random nonce** that the report echoes back. Only verified answers can set an on-chain bid; anything else falls back to scripted confidence, recorded per bid as `confidenceSource`. *Not done:* full Intel TDX quote / NVIDIA GPU evidence verification (`apps/server/src/near/near-ai-client.ts`, `apps/server/src/agents/bid-advisor.ts`).
- **Bounty Priced via NEAR Intents (1Click)**: Each bounty is defined in USD (`BOUNTY_USD`, default $0.03). Before a round opens, a live 1Click `POST /v0/quote` with `dry: true` (EXACT_OUTPUT wNEAR → USDC) returns how much NEAR that costs, and that amount is the escrow attached to `open_round`. The quote's correlationId and signature are stored on the round. Dry quotes move no funds; settlement is *not* done via Intents, which has no testnet (`apps/server/src/near/intents-pricer.ts`).
- **Deterministic Exploitation**: The exploits themselves are rule-based code, with no LLM in the attack path. Headless Playwright Chromium runs real JavaScript sinks and cross-user sessions.
- **Commit-Reveal Task Auction**:
  - **Phase 1 (Commit)**: Competing agents submit `sha256(bidder|taskId|confidence|cost|salt)` signed with agent Function-Call keys to prevent front-running.
  - **Phase 2 (Reveal)**: Preimages are validated on-chain by the market contract.
  - **Deterministic Formula**:
    $$\text{Score} = \frac{\text{Confidence\_Bps} \times (1 + \text{Reputation}) \times 10^{12}}{\text{Cost\_Units}}$$
  - **Phase 3 (Settle)**: `settle_round` picks the winner on-chain using each bidder's on-chain reputation. The server then reads the winner back with `get_round` and treats it as authoritative. The local score is only a preview, and payout or refund is refused for any round the contract did not settle.
  - **Phase 3b (NEAR MCP Audit)**: Before any escrow moves, the orchestrator launches the official NEAR MCP server (`@nearai/near-mcp`, stdio) and re-reads chain state through it, independently of the path that sent the transactions. `contract_call_raw_function_as_read_only` → `get_round` must show `Settled` with the recorded winner, and `account_list_access_keys` must show the winner's bid key as a FunctionCall key scoped to `commit_bid`/`reveal_bid` on the market. A failed audit means a refund, not a payout (`apps/server/src/near/mcp-auditor.ts`).
  - **Phase 4 (Gated Payout / Refund)**: The escrow (1Click-quoted, about 0.011 NEAR for $0.03; fixed 0.01 NEAR if the quote fails) per round goes to the **on-chain winner** only if *that winner's* finding is independently reproduced by `ReplayVerifier`. Otherwise `refund_round` returns the escrow to the operator and reputation is unchanged.

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
3. Click **"Start a mission"** (runtime: about 30 seconds without testnet credentials; about 2.5 minutes with them, because roughly 45 testnet transactions are signed and awaited).
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
Mission `mission-refund-1794721485135` (`npm run demo:refund`) exercises **both** escrow outcomes in one run. The IDOR bug is patched for this demo, so replay verification fails and round 1 is refunded; rounds 2 and 3 are paid. Every winner below was read back from the contract (`get_round`) after `settle_round`, and every bid was signed by the agent's own sub-account function-call key. The full per-bid list is in [docs/near-proof.md](docs/near-proof.md).

- **NEAR MCP-audited mission** `test-mission-1794722221081`: all three rounds passed the MCP pre-payout audit, then paid. Payouts: [`BzSrhfQF…`](https://testnet.nearblocks.io/txns/BzSrhfQFHzirWe4XeEty5Tds5XQMbeGFzpYw29JqCrXq) · [`HifsvhH2…`](https://testnet.nearblocks.io/txns/HifsvhH2nHjNfLSbjMCPd87eyyA8fDh7aDyANqK7DpSx) · [`29WbVuNx…`](https://testnet.nearblocks.io/txns/29WbVuNxgppAz9tKYXYfSHLUMMycpzeQrSwzD3ewtB9X); attestation [`HRYHqy1W…`](https://testnet.nearblocks.io/txns/HRYHqy1WYHR7XdD99z9jiJsiz1TjUs1Zvkf28mSGdUN2). The `mcpAudit` record is in `apps/server/tests/results/mission-test-mission-1794722221081.json`.
- **Master Mission Attestation** (refund-demo mission): [`Hq8kCU5rzpNeDHnE5xHzMFxt2jzyQRhYYXLtn52XUvj`](https://testnet.nearblocks.io/txns/Hq8kCU5rzpNeDHnE5xHzMFxt2jzyQRhYYXLtn52XUvj)
- **Round 1 (`task-access-control`) → REFUNDED** (on-chain winner `idor.harsha-swarm.testnet`, finding not reproducible):
  - Open: [`74B5m8DH…`](https://testnet.nearblocks.io/txns/74B5m8DHrDk6Z81krqVLnf6ZnEKUw1naWMvifqxYQfrZ) · Settle: [`9G6DexMs…`](https://testnet.nearblocks.io/txns/9G6DexMskd28K2RUr7eFopLocceE7tapACTQDrCZ82He) · `refund_round`: [`5e1J9yZn…`](https://testnet.nearblocks.io/txns/5e1J9yZneCNSpt35Yokvgt1o3ox2mNZVVsnYDjEJkhWC)
- **Round 2 (`task-injection`) → PAID** to `xss.harsha-swarm.testnet`:
  - Open: [`8PbLZnDz…`](https://testnet.nearblocks.io/txns/8PbLZnDzTymfwLiWqbH4vwgD2nBpoQsHQiYdLdc5jgpy) · Settle: [`E1RT2mBr…`](https://testnet.nearblocks.io/txns/E1RT2mBrwhFYWLm2dnpnecLvwvd6WKdUMm4U5m8HrmGp) · `payout`: [`26KMPvPS…`](https://testnet.nearblocks.io/txns/26KMPvPSqC7oD7wN3kfbQwxmYhkDkG4LvSxr2B24688U)
- **Round 3 (`task-business-logic`) → PAID** to `logic.harsha-swarm.testnet`:
  - Open: [`Ehxcpg4X…`](https://testnet.nearblocks.io/txns/Ehxcpg4XfruFTscXWyUMaGJXCpVLDz43Gvgqjg1NFbBx) · Settle: [`79KJVtGQ…`](https://testnet.nearblocks.io/txns/79KJVtGQ4zEvPX5fdhnBWJRfxbGkhH2oPiQ4iNNna8AT) · `payout`: [`4fiKDzQV…`](https://testnet.nearblocks.io/txns/4fiKDzQV3NS5zpqNCFwNBBeS2BgHyBZu86P79w2pxonj)

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
  npm run test:mcp             # Read-only: NEAR MCP audit rejects paid / wrong-winner / missing rounds
  npm run test:intents         # Live 1Click dry quote → escrow amount (no funds move)
  npm run test:near-ai         # Offline: TEE response-signature recovery (known vector + tamper)
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
2. **Generalist Agents Have No Exploit Code**: `gen1` and `gen2` are real sub-accounts that really commit and reveal bids, but they implement no exploits. The orchestrator always runs the task's specialist. If a generalist ever won a round, no verified finding would come from the winner, so the round would be **refunded**, not paid (`mission-orchestrator.ts`, Stage 3b).
3. **NEAR Testnet Only**: All contracts and sub-accounts are deployed exclusively on NEAR Protocol Testnet (`harsha-swarm.testnet`, `market.harsha-swarm.testnet`). No mainnet deployment or real financial value is involved.
4. **NEAR Intents is used for pricing only, not settlement; the Agent API is not used**: Per the NEAR Intents docs, *"There is no testnet version of NEAR Intents or the Agent API"*. The project calls the live 1Click quote API (dry, no funds moved) to set each escrow, but pays out with native testnet NEAR transfers from the market contract. See [docs/JUDGES.md §4](docs/JUDGES.md) for why the custom market contract does something the Agent API does not offer.
7. **AI Is Optional and Limited to Bidding**: Without `NEAR_AI_API_KEY`, all bids use scripted confidences, and `confidenceSource: "scripted"` says so on every bid. The AI never decides whether a finding is real or whether anyone gets paid.
6. **Agent Sub-Accounts Also Hold a Full-Access Key**: Each agent sub-account was created with a full-access key, which stays in the owner's local `~/.near-credentials` and is used only by `provision:agents` to add the scoped key. The agent runtime loads and signs with the scoped function-call key from `.agent-keys.json`, and the MCP audit checks that this exact key is the scoped one.
5. **Operator Role**: Only the operator account (`harsha-swarm.testnet`, full-access key from `.env`) calls `open_round` (which needs an attached deposit, so a function-call key cannot do it), `settle_round`, `payout` and `refund_round`. Bids are **never** signed by the operator. An agent with no provisioned function-call key simply does not bid (`signingMode: "missing_key"`).

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
