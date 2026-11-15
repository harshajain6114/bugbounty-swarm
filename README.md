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
- **Attestation Contract Deploy** (`DeployContract` + init on `harsha-swarm.testnet`): [`FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8`](https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8). For proof that the code *currently* deployed on both accounts is this source, run `npm run verify:deployment` (below).

### Live Mission & Market Transactions
Mission `mission-refund-1794725357805` (`npm run demo:refund`) shows **both** escrow outcomes in one run. The IDOR bug is patched for this demo, so replay verification fails and round 1 is refunded; rounds 2 and 3 pass the NEAR MCP audit and are paid. In every round:
- each escrow was set from a live 1Click quote ($0.03 ≈ 0.0109 NEAR);
- all 5 bids were signed by each agent's own sub-account function-call key;
- the winner was read back from the contract (`get_round`);
- `settle_round` and `payout`/`refund_round` were signed by the operator's function-call key scoped to those three methods. You can check the signer public key on any of those transactions.

Per-bid detail is in [docs/near-proof.md](docs/near-proof.md) and `apps/server/tests/results/mission-mission-refund-1794725357805.json`.

- **Master Mission Attestation**: [`9ndGZJ2F…`](https://testnet.nearblocks.io/txns/9ndGZJ2F8sWAQTgTnkzPgMKbtgs5upbQwQKtabLLvGhm)
- **Round 1 (`task-access-control`) → REFUNDED** (on-chain winner `idor.harsha-swarm.testnet`, finding not reproducible):
  - Open: [`2hdy69cY…`](https://testnet.nearblocks.io/txns/2hdy69cYDvrXHrcCGRcs1cq18L2MGy4tcdzSjJqWQosU) · Settle: [`AX34UMTg…`](https://testnet.nearblocks.io/txns/AX34UMTg7dYAnu4RfLYVD9Wzk6oZEFf6HKyy4ymkqjxp) · `refund_round`: [`4VfpiRVz…`](https://testnet.nearblocks.io/txns/4VfpiRVzLVm18Aa1nvFoeWzLX5BvqNF9c19pnof5Vtqn)
- **Round 2 (`task-injection`) → PAID** to `xss.harsha-swarm.testnet`:
  - Open: [`9uoi9WTe…`](https://testnet.nearblocks.io/txns/9uoi9WTeSwAftwTTdsPn2SthABiLnkNLbXjFDgVrh645) · Settle: [`DTBMEf31…`](https://testnet.nearblocks.io/txns/DTBMEf31TUbbxRBaZ6PvKRvCrrc6H71hGAVuChuj187G) · `payout`: [`94gHiyzs…`](https://testnet.nearblocks.io/txns/94gHiyzsayCnmNChdZPiEhx61GkqVQVuBySFRUyALqrM)
- **Round 3 (`task-business-logic`) → PAID** to `logic.harsha-swarm.testnet`:
  - Open: [`AXnC2oT4…`](https://testnet.nearblocks.io/txns/AXnC2oT4Te5jgnxQxe5B3DaxXtwCNN99bP9XcC8LbWQq) · Settle: [`C2hHwGQ5…`](https://testnet.nearblocks.io/txns/C2hHwGQ5m7oY78gsVBuppPR3AdJxBT2BpepqS2CtkaW8) · `payout`: [`9jqqdAhy…`](https://testnet.nearblocks.io/txns/9jqqdAhyL98AAPG9mHX2sUW3dDKgbMoutb2mAx6UtXcF)

### Zero-Gas Read-Only Verification
Anyone can verify on-chain state without private keys or gas:
```bash
npm run verify:near         # master attestation, contributions, reputation
npm run verify:market       # market rounds, sealed/revealed bids, escrow outcomes
npm run verify:deployment   # rebuilds both contracts from source; sha256 must equal on-chain code_hash
```
`verify:deployment` currently reports **MATCH** for both contracts (market `f2e3d93a…`, attestation `cf50e9bb…`). The code running on testnet is exactly this repository's source.

---

## 4. Test Verification Suites

- **One command for everything that needs no signing key** (12 suites, about 3.5 minutes; read-only network use):
  ```bash
  npm test
  ```
  It runs the contract unit tests, the exploit tests, all four agent tests, the fabricated-finding rejection test, the NEAR AI signature test, the 1Click pricing test, the MCP audit test and the server typecheck, then prints a pass/fail summary.
- Run smart contract unit tests:
  ```bash
  npm run test:contract        # 13/13 passing in apps/near-contract
  npm run test:market-contract # 10/10 passing in apps/near-market-contract
  ```
- Run agent & exploitation test suites individually:
  ```bash
  npm run test:server          # Exploit reproduction: IDOR/BOLA, stored XSS (Chromium), price tampering
  npm run test:orchestrator    # End-to-end swarm mission on testnet (needs .env + provisioned keys)
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

1. **Cost Units Are Scripted**: Each agent's bid *cost* is a fixed per-agent value. Bid *confidence* comes from the agent's verified NEAR AI reasoning when `NEAR_AI_API_KEY` is set, and from scripted defaults otherwise (see 5).
2. **Generalist Agents Have No Exploit Code**: `gen1` and `gen2` are real sub-accounts that really commit and reveal bids, but they implement no exploits. **Winning grants execution**: a specialist runs only if the contract selected it as the round winner (`assertAwarded` in `mission-orchestrator.ts`). If a generalist won, no task would run, nothing would be verified, and the escrow would be **refunded**.
3. **Testnet Only for Funds**: All contracts, accounts and transactions are on NEAR testnet; no mainnet transaction is ever signed. The only mainnet contact is the read-only 1Click price quote (see 4).
4. **NEAR Intents is used for pricing only, not settlement; the Agent API is not used**: Per the NEAR Intents docs, *"There is no testnet version of NEAR Intents or the Agent API"*. The project calls the live 1Click quote API (dry, no funds moved) to set each escrow, but pays out with native testnet NEAR transfers from the market contract. See [docs/JUDGES.md §4](docs/JUDGES.md) for why the custom market contract does something the Agent API does not offer.
5. **AI Is Optional and Limited to Bidding**: Without `NEAR_AI_API_KEY`, all bids use scripted confidences, and `confidenceSource: "scripted"` says so on every bid. The AI never decides whether a finding is real or whether anyone gets paid. The NEAR AI path is implemented against the NEAR AI Cloud docs, and its signer recovery is unit-tested offline. The recorded missions in this repo ran **without** a key, so all their bids are `scripted`.
6. **Agent Sub-Accounts Also Hold a Full-Access Key**: Each agent sub-account was created with a full-access key, which stays in the owner's local `~/.near-credentials` and is used only by `provision:agents` to add the scoped key. The agent runtime loads and signs with the scoped function-call key from `.agent-keys.json`, and the MCP audit checks that this exact key is the scoped one.
7. **Operator Keys**: The operator (`harsha-swarm.testnet`) uses its full-access key from `.env` only for `open_round` (it attaches the escrow deposit, which a function-call key cannot do) and for attestation writes. `settle_round`, `payout` and `refund_round` are signed with a **function-call key scoped to exactly those three methods on the market**, added by `npm run provision:agents`; each round records this in `operatorKeyModes`. Bids are **never** signed by the operator. An agent with no provisioned key simply does not bid (`signingMode: "missing_key"`).
8. **Account Provisioning**: `npm run provision:agents` creates any missing agent sub-account (0.5 NEAR each, from the operator) and adds every scoped key. It is idempotent; the recorded runs reused existing accounts.

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
