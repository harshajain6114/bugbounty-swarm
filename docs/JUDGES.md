# BUGBOUNTY SWARM — Judge's Verification Guide

> **For Hackathon Judges & Automated Evaluation Evaluators**  
> Every claim in this submission is backed by reproducible source code, passing unit tests, and live, verifiable transactions on the NEAR Protocol Testnet.

---

## 1. Quick Verification Matrix

| Claim Made | Track | Source File / Implementation | Zero-Gas / Offline Verification Command | On-Chain Proof (NEAR Testnet) |
|---|---|---|---|---|
| **Commit-Reveal Task Auction** | AI Swarms | `apps/near-market-contract/src/lib.rs`<br>`apps/server/src/near/market-coordinator.ts` | `npm run verify:market`<br>`npm run test:market-contract` | `market.harsha-swarm.testnet`<br>Methods: `open_round`, `commit_bid`, `reveal_bid`, `settle_round` |
| **Agent Sub-Account Keys** | AI Swarms | `scripts/provision-agents.js`<br>`apps/server/src/near/market-coordinator.ts` | `npm run verify:market` (prints access keys) | 5 sub-accounts (`idor`, `xss`, `logic`, `gen1`, `gen2`) with `FunctionCall` access keys limited to `market.harsha-swarm.testnet` |
| **Independent Replay Verification** | AI Security & Defense | `apps/server/src/orchestrator/replay-verifier.ts`<br>`apps/server/src/orchestrator/finding-verifier.ts` | `npm run test:fabricated`<br>`npm run test:orchestrator` | Independent Chromium browser DOM sink & fresh Alice/Bob cross-tenant session replay |
| **Verification-Gated Escrow Payout** | AI Security & Defense | `apps/near-market-contract/src/lib.rs` (`payout`)<br>`apps/server/src/orchestrator/mission-orchestrator.ts` | `npm run verify:market`<br>`npm run test:market-contract` | Escrowed `0.01 NEAR` released ONLY after `replayVerifier.verify()` passes |
| **Automated Escrow Refund on Rejection** | AI Security & Defense | `apps/near-market-contract/src/lib.rs` (`refund_round`)<br>`apps/server/tests/demo-refund.ts` | `npm run demo:refund` | Live refund tx: [`3fratm23AqZscv778uTAyJAdw7AbRGE8QJoWFBU7F7ii`](https://testnet.nearblocks.io/txns/3fratm23AqZscv778uTAyJAdw7AbRGE8QJoWFBU7F7ii)<br>Status: `Refunded`, 0 reputation change |
| **On-Chain Agent Reputation** | Agent Economy | `apps/near-market-contract/src/lib.rs`<br>`apps/near-contract/src/lib.rs` | `npm run verify:near`<br>`npm run verify:market` | Method `get_agent_reputation`<br>Reputation accumulates upon verified payout |
| **Cryptographic Mission Attestation** | Open Innovation | `apps/near-contract/src/lib.rs`<br>`apps/server/src/near/near-client.ts` | `npm run verify:near`<br>`npm run test:contract` | `harsha-swarm.testnet`<br>Master Attestation Tx: [`6YHWcRkpGddsxan5Z4DrN4MDDF5CNCAcWWCcfvN1wpkc`](https://testnet.nearblocks.io/txns/6YHWcRkpGddsxan5Z4DrN4MDDF5CNCAcWWCcfvN1wpkc) |
| **Cryptographic Integrity & Tamper Proof** | AI Security & Defense | `apps/server/src/index.ts` (`/api/missions/verify-integrity`)<br>`apps/web/src/App.tsx` | Run UI, click **Verify integrity** (MATCH) and **Simulate Local Tamper** (MISMATCH) | Real-time RPC comparison between local in-memory findings hash and immutable on-chain record |

---

## 2. Step-by-Step Codebase Verification

### A. Smart Contract Unit Tests (Zero Network, Pure Rust)
Run tests for both smart contracts:
```bash
# 1. Attestation Contract (13 tests passing)
npm run test:contract

# 2. Swarm Bounty Market Contract (10 tests passing: commit, reveal, settle, gated payout, refund once, no double spend, non-operator rejection)
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
3. **Real Function-Call Keys**: Competing agent accounts sign bids using dedicated ed25519 Function-Call keys restricted specifically to `market.harsha-swarm.testnet` methods `commit_bid` and `reveal_bid`.
4. **Real FastNear RPC Verification**: In-memory findings hash is compared against the live FastNear RPC response. If absent, the system explicitly reports `NO ON-CHAIN RECORD`.

### Known Limitations
1. **Deterministic Bidding**: Competing agents use scripted confidence intervals and scripted cost units rather than dynamic external economic models.
2. **Generalist Agent Implementations**: Generalist agent accounts (`gen1`, `gen2`) participate in the auction using lower confidence scores; their exploit fallback relies on the specialist engine.
3. **NEAR Testnet Only**: All contracts and accounts operate exclusively on NEAR Testnet; no mainnet funds or real tokens are used.
4. **NEAR Intents**: NEAR Intents solvers currently focus on mainnet token routing. For this multi-agent hackathon, auction settlement is handled via custom commit-reveal smart contracts.
