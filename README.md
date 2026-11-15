# BUGBOUNTY SWARM

> **Coordinated Multi-Agent Web Security Swarm with On-Chain Commit-Reveal Bounty Market and NEAR Protocol Testnet Attestation**

BUGBOUNTY SWARM deploys a synchronized swarm of specialist security agents that map attack surfaces, compete for task bounties through a cryptographic commit-reveal auction, systematically reproduce web vulnerabilities in browser DOM and API contexts, independently verify differential proof via headless replay, and record tamper-evident audit attestations onto the **NEAR Protocol Testnet**.

---

## 1. Hackathon Tracks & Architecture

| Hackathon Track | Role in Project | Implementation Details |
|---|---|---|
| **AI Swarms** *(Primary)* | **Multi-Agent Coordination & Task Auction** | Multi-agent pipeline coordinated by Mission Orchestrator and Market Coordinator. Features 5 agent accounts (`idor`, `xss`, `logic`, `gen1`, `gen2`) bidding in a 3-round commit-reveal auction. |
| **Agent Economy** | **Escrow Bounties & On-Chain Reputation** | Agents earn testnet NEAR bounties escrowed in `market.harsha-swarm.testnet`. Reputation accumulates on-chain upon verified vulnerability submission (`get_agent_reputation`). |
| **AI Security & Defense** | **Verification-Gated Payouts** | Rewards are held in smart contract escrow. The orchestrator releases them only after `ReplayVerifier` independently reproduces the winner's finding and a NEAR MCP audit passes; otherwise it calls `refund_round`. This gate is **operator policy**: the deployed contract checks operator, status and winner, but does not itself see the verification. |

### Swarm Architecture: AI Decides What to Bid, Code Proves What Is Paid
- **Pipeline**: Recon → AI bid reasoning (NEAR AI Cloud) → 1Click-priced escrow → Commit-Reveal Auction → IDOR/BOLA → Stored XSS → Price Tampering → Independent Replay Verification → NEAR MCP Audit → Escrow Payout or Refund → Master Attestation.
- **AI Bid Reasoning on NEAR AI Cloud (TEE)** *(on when `NEAR_AI_API_KEY` is set)*: After recon, each of the 5 agents separately asks a TEE-hosted model (`cloud-api.near.ai`), given *its own* capabilities and the discovered attack surface, how confident it is for each task. Every completion is checked before use:
  - an attestation report is fetched **before** the first completion, with a fresh random 32-byte nonce;
  - the TEE signature's signed text must equal `sha256(request):sha256(response)`;
  - the recovered EIP-191 signer must equal `signing_address`;
  - exactly one model attestation must list that signer;
  - that attestation's **Intel TDX quote `report_data`** must contain the signer address and our nonce. The HTTP echo fields are not trusted.

  Only answers that pass every check can set an on-chain bid; anything else falls back to scripted confidence, recorded per bid as `confidenceSource`. *Not done:* authenticating the TDX quote itself (Intel DCAP signature / PCK chain) and the NVIDIA GPU evidence. This proves **binding**, not hardware genuineness (`apps/server/src/near/near-ai-client.ts`, `apps/server/src/agents/bid-advisor.ts`).
- **Bounty Priced via NEAR Intents (1Click)**: Each bounty is defined in USD (`BOUNTY_USD`, default $0.03). Before a round opens, a live 1Click `POST /v0/quote` with `dry: true` (EXACT_OUTPUT wNEAR → USDC) returns how much NEAR that costs, and that amount is the escrow attached to `open_round`. The quote's correlationId and signature are stored on the round. Dry quotes move no funds; settlement is *not* done via Intents, which has no testnet (`apps/server/src/near/intents-pricer.ts`).
- **Deterministic Exploitation**: The exploits themselves are rule-based code, with no LLM in the attack path. Headless Playwright Chromium runs real JavaScript sinks and cross-user sessions.
- **Commit-Reveal Task Auction**:
  - **Phase 1 (Commit)**: Each agent submits `sha256(bidder|taskId|confidence|cost|salt)` from its own sub-account, signed with its scoped function-call key. The salt is 32 random bytes, so a commitment can't be brute-forced from the possible bid values.
  - **Phase 2 (Reveal)**: Preimages are validated on-chain by the market contract (`env::sha256`). *Limitation:* the deployed contract has no separate commit and reveal phases. Both are allowed while a round is `Open`, so a bidder could in principle commit after seeing others' reveals; each round records `phaseEnforcement`. Also, all five agents are run by one coordinator process, so the sealing guards against outside observers, not against the operator.
  - **Deterministic Formula**:
    $$\text{Score} = \frac{\text{Confidence\_Bps} \times (1 + \text{Reputation}) \times 10^{12}}{\text{Cost\_Units}}$$
  - **Phase 3 (Settle)**: `settle_round` picks the winner on-chain using each bidder's on-chain reputation. The server then reads the winner back with `get_round` and treats it as authoritative. The local score is only a preview, and payout or refund is refused for any round the contract did not settle.
  - **Phase 3b (NEAR MCP Audit)**: Before any escrow moves, the orchestrator launches the official NEAR MCP server (`@nearai/near-mcp`, stdio) and re-reads chain state through it, independently of the path that sent the transactions. `contract_call_raw_function_as_read_only` → `get_round` must show `Settled` with the recorded winner, and the signer key of the winner's actual `commit_bid` transaction (read via RPC `tx`, since near-mcp has no tx tool) must, per MCP `account_list_access_keys`, be a FunctionCall key scoped to `commit_bid`/`reveal_bid` on the market. A failed audit means a refund, not a payout (`apps/server/src/near/mcp-auditor.ts`).
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
Mission `mission-refund-1794726348171` (`npm run demo:refund`) shows **both** escrow outcomes in one run. The IDOR bug is patched for this demo, so replay verification fails and round 1 is refunded; rounds 2 and 3 pass the NEAR MCP audit and are paid. In every round:
- each escrow was set from a live 1Click quote ($0.03 ≈ 0.011 NEAR);
- the winner was read back from the contract (`get_round`);
- `settle_round` and `payout`/`refund_round` were signed by the operator's function-call key scoped to those methods.

**Signer audit:** all **30** bid transactions (15 `commit_bid`, 15 `reveal_bid`) were checked against RPC `tx` → `public_key`. All 30 were signed by each agent's **scoped function-call key**, and none by a full-access key.

> **Correction, stated openly:** in earlier recorded missions (e.g. `mission-refund-1794725357805`), the bids were signed with the agents' *full-access* keys. The coordinator only looked for `.agent-keys.json` in the working directory and silently fell back to `~/.near-credentials`, while the MCP audit only checked that a scoped key *existed*. Both are fixed: the full-access fallback is removed, and the audit now checks the signer of the winner's actual commit transaction. `npm run test:mcp` uses that old full-key-signed round as a regression case the audit must reject.

Per-bid detail (including `signerPublicKey`) is in [docs/near-proof.md](docs/near-proof.md) and `apps/server/tests/results/mission-mission-refund-1794726348171.json`.

- **Master Mission Attestation**: [`544jKbms…`](https://testnet.nearblocks.io/txns/544jKbms359rQVBrEw1JZUMhrAn9iYj2HMV1AzhggMyL)
- **Round 1 (`task-access-control`) → REFUNDED** (on-chain winner `idor.harsha-swarm.testnet`, finding not reproducible):
  - Open: [`52SkZyVw…`](https://testnet.nearblocks.io/txns/52SkZyVwsatGpSnAYmq1ddKEaepQTNsGfZA8czva2am2) · Settle: [`Aqy7QkSk…`](https://testnet.nearblocks.io/txns/Aqy7QkSkJbDRGcbrJca7p371CcFmaif8Yj49s4j1PHmt) · `refund_round`: [`Dur3WG8n…`](https://testnet.nearblocks.io/txns/Dur3WG8nRhQrXgXw43ig6Z26SPLzgyDbnB1maZNRim2J)
- **Round 2 (`task-injection`) → PAID** to `xss.harsha-swarm.testnet`:
  - Open: [`5v5kB9fi…`](https://testnet.nearblocks.io/txns/5v5kB9fiTG7QMixpJqXFkUHfw8ZarpzQH1yhzefZdUXP) · Settle: [`BTkX4ekX…`](https://testnet.nearblocks.io/txns/BTkX4ekXFAMN3gFSSQ4uox8Zc8Ja1z97dnaQdyUPsxoW) · `payout`: [`4beQyfZR…`](https://testnet.nearblocks.io/txns/4beQyfZRy8R25hRZd8aGu1nB3yjZoa39NPemu99FvKoX)
- **Round 3 (`task-business-logic`) → PAID** to `logic.harsha-swarm.testnet`:
  - Open: [`6vy2oz5q…`](https://testnet.nearblocks.io/txns/6vy2oz5qtt7j5sGiG7t2dQfXe4iesZZsBpEE3VXdf9B9) · Settle: [`Xwtc2beJ…`](https://testnet.nearblocks.io/txns/Xwtc2beJ5D9e1eTosA7DSGcvkfVHv16NymQkHNVQEab) · `payout`: [`HxXQsiEj…`](https://testnet.nearblocks.io/txns/HxXQsiEjkiJ8oPCkUhPDW4g5gX7DfVFQw4ckCFyWAWfq)

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
6. **Agent Sub-Accounts Also Hold a Full-Access Key**: Each agent sub-account was created with a full-access key, which stays in the owner's local `~/.near-credentials` and is used only by `provision:agents` to add the scoped key. The agent runtime loads **only** the scoped function-call key from `.agent-keys.json`; there is no fallback to the full-access key. The MCP audit checks that the key which actually signed the winner's `commit_bid` is the scoped one.
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
