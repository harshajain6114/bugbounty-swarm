# BUGBOUNTY SWARM — Judge's Verification Guide

> **For Hackathon Judges & Automated Evaluation Evaluators**  
> Each claim below points to the code that implements it, a command that checks it, and (where relevant) testnet transactions. Known limitations and one corrected defect are listed in §3. Note: commits and missions after `9e2d027` are dated after the 14 Nov 23:59 UTC submission deadline.

---

## 1. Quick Verification Matrix

| Claim Made | Track | Source File / Implementation | Zero-Gas / Offline Verification Command | On-Chain Proof (NEAR Testnet) |
|---|---|---|---|---|
| **Commit-Reveal Task Auction** | AI Swarms | `apps/near-market-contract/src/lib.rs`<br>`apps/server/src/near/market-coordinator.ts` | `npm run verify:market`<br>`npm run test:market-contract` | `market.harsha-swarm.testnet`<br>Methods: `open_round`, `commit_bid`, `reveal_bid`, `settle_round` |
| **On-Chain Winner Is Authoritative** | AI Swarms | `apps/server/src/near/market-coordinator.ts` (`viewCall("get_round")` after `settle_round`) | `npm run verify:market` | `winnerSource: "on_chain_settle"` in each round of `apps/server/tests/results/mission-result.json`; payout/refund refused for unsettled rounds |
| **Deployed Code == This Source** | All | `scripts/verify-deployment.js` | `npm run verify:deployment` | Rebuilds both wasm files from source. SHA-256 equals on-chain `code_hash`: market `f2e3d93a…7ad9`, attestation `cf50e9bb…013b` |
| **Operator Scoped Key** | AI Security | `scripts/provision-agents.js` (`__operator__`)<br>`market-coordinator.ts` (`loadOperatorScopedAccount`) | Check the signer `public_key` of any `settle_round`/`payout`/`refund_round` tx | FunctionCall key on `harsha-swarm.testnet`, receiver `market.harsha-swarm.testnet`, methods `settle_round, payout, refund_round`, 0.25 NEAR allowance. Full key is used only for `open_round` (deposit) and attestation |
| **Winning Grants Execution** | AI Swarms / Agent Economy | `mission-orchestrator.ts` (`assertAwarded`) | `npm run test:orchestrator` | A specialist runs only if it is the on-chain round winner; otherwise it is `skipped` and the escrow is refunded |
| **AI Bid Reasoning on NEAR AI Cloud (TEE)** | AI Swarms / AI Security | `apps/server/src/near/near-ai-client.ts`<br>`apps/server/src/agents/bid-advisor.ts` | `npm run test:near-ai` (offline signer recovery)<br>full run needs `NEAR_AI_API_KEY` | Preflight attestation with fresh 32-byte nonce; per completion: signed text == `sha256(req):sha256(resp)`, EIP-191 signer == `signing_address`, exactly one model attestation for that signer, and its TDX quote `report_data` contains signer + nonce. Unverified → scripted bid. **Not verified:** the TDX quote's own DCAP signature/cert chain and NVIDIA evidence (binding, not genuineness). **No recorded mission has run with a key yet.** Stored as `aiBidAdvice` + per-bid `confidenceSource` |
| **Escrow Priced via NEAR Intents 1Click** | Agent Economy | `apps/server/src/near/intents-pricer.ts`<br>`market-coordinator.ts` (`open_round` deposit) | `npm run test:intents` | Live `POST https://1click.chaindefuser.com/v0/quote` (`dry: true`); quoted wNEAR `amountIn` = escrow. `bountyPricing` (correlationId, signature) on each round. No Intents settlement (mainnet-only) |
| **NEAR MCP Pre-Payout Audit** | AI Swarms / AI Security | `apps/server/src/near/mcp-auditor.ts`<br>`apps/server/src/orchestrator/mission-orchestrator.ts` (Stage 3b) | `npm run test:mcp` (read-only) | Launches `@nearai/near-mcp` over stdio; `contract_call_raw_function_as_read_only` (`get_round` = Settled + same winner) and `account_list_access_keys` on the key that actually signed the winner's `commit_bid` (read from RPC `tx`) must be FunctionCall-scoped; both must pass or the round is refunded. Result stored as `mcpAudit` on every round in `mission-result.json` |
| **Agent Sub-Account Keys** | AI Swarms | `scripts/provision-agents.js`<br>`apps/server/src/near/market-coordinator.ts` | `npm run verify:market` (prints access keys) | 5 sub-accounts (`idor`, `xss`, `logic`, `gen1`, `gen2`) with `FunctionCall` access keys limited to `market.harsha-swarm.testnet` |
| **Independent Replay Verification** | AI Security & Defense | `apps/server/src/orchestrator/replay-verifier.ts`<br>`apps/server/src/orchestrator/finding-verifier.ts` | `npm run test:fabricated`<br>`npm run test:orchestrator` | Independent Chromium browser DOM sink & fresh Alice/Bob cross-tenant session replay |
| **Verification-Gated Escrow Payout** | AI Security & Defense | `apps/near-market-contract/src/lib.rs` (`payout`)<br>`apps/server/src/orchestrator/mission-orchestrator.ts` | `npm run verify:market`<br>`npm run test:market-contract` | Escrow (1Click-priced, ~0.011 NEAR) released by the orchestrator only after replay verification + MCP audit pass. **Operator-enforced policy**: the deployed contract checks operator/status/winner, not the verification itself |
| **Automated Escrow Refund on Rejection** | AI Security & Defense | `apps/near-market-contract/src/lib.rs` (`refund_round`)<br>`apps/server/tests/demo-refund.ts` | `npm run demo:refund` | Live refund tx: [`Dur3WG8nRhQrXgXw43ig6Z26SPLzgyDbnB1maZNRim2J`](https://testnet.nearblocks.io/txns/Dur3WG8nRhQrXgXw43ig6Z26SPLzgyDbnB1maZNRim2J)<br>Status: `Refunded`, 0 reputation change |
| **On-Chain Agent Reputation** | Agent Economy | `apps/near-market-contract/src/lib.rs`<br>`apps/near-contract/src/lib.rs` | `npm run verify:near`<br>`npm run verify:market` | Method `get_agent_reputation`<br>Reputation accumulates upon verified payout |
| **Cryptographic Mission Attestation** | Open Innovation | `apps/near-contract/src/lib.rs`<br>`apps/server/src/near/near-client.ts` | `npm run verify:near`<br>`npm run test:contract` | `harsha-swarm.testnet`<br>Master Attestation Tx: [`544jKbms359rQVBrEw1JZUMhrAn9iYj2HMV1AzhggMyL`](https://testnet.nearblocks.io/txns/544jKbms359rQVBrEw1JZUMhrAn9iYj2HMV1AzhggMyL) |
| **Cryptographic Integrity & Tamper Proof** | AI Security & Defense | `apps/server/src/index.ts` (`/api/missions/verify-integrity`)<br>`apps/web/src/App.tsx` | Run UI, click **Verify integrity** (MATCH) and **Simulate Local Tamper** (MISMATCH) | Real-time RPC comparison between local in-memory findings hash and immutable on-chain record |

---

## 2. Step-by-Step Codebase Verification

### A. Smart Contract Unit Tests (Zero Network, Pure Rust)
Run tests for both smart contracts:
```bash
# 1. Attestation Contract (13 tests passing)
npm run test:contract

# 2. Swarm Bounty Market Contract (10 tests passing: commit, reveal, settle, payout, refund once, no double spend, non-operator rejection)
npm run test:market-contract

# 3. Mission Orchestrator Pipeline (12/12 checks passing)
npm run test:orchestrator
```

### B. Independent Replay Verification (No False Positives)
To verify that the verifier does **not** blindly trust agent booleans, run:
```bash
npm run test:fabricated
```
**Expected Output**:
- The test feeds a fabricated finding where `verified: true`, `reproduced: true`, but the target endpoint does not exhibit the vulnerability.
- `FindingVerifier` and `ReplayVerifier` execute a real HTTP check against the demo shop, detect the mismatch, and **REJECT** the finding (`verified: false`).

### C. Live Testnet Refund Demo
To witness a live testnet transaction where an unverified finding triggers smart contract escrow refund rather than payout:
```bash
npm run demo:refund
```
**Expected Output**:
- Sets `DEMO_PATCH_IDOR=1` so the IDOR vulnerability cannot be reproduced.
- `ReplayVerifier` rejects the IDOR finding.
- Coordinator calls `refund_round(round_id)`.
- Live testnet transaction confirmed: escrow returned to operator, status set to `Refunded`, agent reputation unchanged.

### D. Zero-Gas Read-Only On-Chain State Inspection
Anyone can verify all on-chain states directly from NEAR testnet without private keys or gas:
```bash
# Inspect master attestation and specialist agent reputation on harsha-swarm.testnet
npm run verify:near

# Inspect commit-reveal auction rounds, agent Function-Call keys, and escrow payouts on market.harsha-swarm.testnet
npm run verify:market
```

---

## 3. Architecture & Honest Disclosures

### What Is Real
1. **Real Browser Runtime**: Playwright Chromium v1255 runs headless in `ReconAgent`, `XssAgent`, and `ReplayVerifier` to execute real DOM code and cross-tenant session cookies.
2. **Real Smart Contracts**: Rust contracts deployed on NEAR Protocol Testnet at `harsha-swarm.testnet` and `market.harsha-swarm.testnet`.
3. **Real Function-Call Keys**: Competing agent accounts sign bids using dedicated ed25519 Function-Call keys restricted specifically to `market.harsha-swarm.testnet` methods `commit_bid` and `reveal_bid` (0.25 NEAR gas allowance each). There is **no fallback** to the operator or to the agent's full-access key: a missing scoped key means no bid (`signingMode: "missing_key"`). Mission `mission-refund-1794726348171`: 30/30 bid txs signed by the scoped keys (RPC `tx.public_key`). Earlier missions were full-access signed due to a since-fixed key-path bug (see README §3).
4. **Real FastNear RPC Verification**: In-memory findings hash is compared against the live FastNear RPC response. If absent, the system explicitly reports `NO ON-CHAIN RECORD`.

### Known Limitations
1. **Bids in recorded missions are scripted**: cost units are always fixed per agent; confidence comes from verified NEAR AI reasoning only when `NEAR_AI_API_KEY` is set, which no recorded mission had. With the scripted values the specialist always wins its own task.
2. **Generalists have no exploit code**: `gen1`/`gen2` really commit and reveal, but if one won, `assertAwarded` would run no task and the escrow would be refunded.
3. **NEAR Testnet Only for Funds**: every signed transaction is on testnet; the only mainnet contact is the read-only 1Click dry quote.
4. **NEAR Intents is used only for price discovery (1Click dry quotes); the Agent API is not used.** Both are mainnet-only (see §4). Escrow and payouts are native testnet NEAR in the market contract.
5. **Agent sub-accounts also hold their creator full-access key** (kept in the owner's `~/.near-credentials`, used only by `provision:agents`). The runtime loads only the scoped key (no full-access fallback), and the MCP audit checks the signer of the winner's actual commit tx.

---

## 4. Why a Custom Market Contract Instead of the Agent API

The track rubric scores a hand-rolled permissioning contract lower than the Agent API, *unless the code does something the Agent API cannot*. Here is that case, stated precisely so it can be checked:

**What the Agent API provides** (docs.agentsonintents.com, *Agent API → How it works*): one wallet per agent on NEAR Intents, an owner-signed policy (actions, assets, limits, destinations, USD budget, delays, time windows, emergency stop), and the actions `swap`, `limit_order`, `transfer`, `withdraw`, `shield`/`unshield`. It is *"an experimental, mainnet-only beta"*.

**What `market.harsha-swarm.testnet` does that those actions do not:**
| Mechanism | Where | Why the Agent API doesn't cover it |
|---|---|---|
| **Commit-reveal** auction; the preimage is checked on-chain with `env::sha256` (no separate on-chain commit/reveal phases in the deployed version) | `lib.rs` `commit_bid` / `reveal_bid` | The Agent API moves funds under a policy. It has no auction or bid-commitment primitive. |
| **Reputation-weighted** winner selection with a lexicographic tie-break | `lib.rs` `settle_round` | Its policies limit *what* an agent may spend. They don't *choose between* competing agents. |
| Escrow released by the orchestrator only after **independent replay verification** of the winner's own work, otherwise `refund_round` (operator-enforced, not contract-enforced) | `lib.rs` `payout` / `refund_round` + `mission-orchestrator.ts` Stage 3b | Its `timelock_ms` / `owner_approval` delay a payment or ask a human. Neither ties a payout to a machine-checked proof of work. |
| **Reputation** that only goes up on a verified payout | `lib.rs` `payout` → `agent_reputation` | No reputation concept exists in the Agent API. |

**What we do *not* claim:** the agents' function-call keys are *permission scoping* (only `commit_bid`/`reveal_bid` on one contract, a 0.25 NEAR gas allowance). They are not a spending-limit policy and they do not replace the Agent API's budget controls. Agents in this design never spend; they only bid and get paid.
