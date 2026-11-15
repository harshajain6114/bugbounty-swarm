# BUGBOUNTY SWARM — Project Status

Date: November 14, 2026  
Status: Complete Hackathon Submission (All Tracks Verified On-Chain)

---

## 1. What Is Built & Verified Working

### Specialist Multi-Agent Swarm
- **Reconnaissance Agent** (`apps/server/src/agents/recon/`): Headless Playwright Chromium crawler. Maps 8 pages, 13 API endpoints, and 7 forms across authenticated and unauthenticated states.
- **IDOR / BOLA Specialist Agent** (`apps/server/src/agents/idor/`): Performs cross-tenant differential access testing on `/shop/api/orders/:id`, proving unauthorized data exposure.
- **Stored XSS Specialist Agent** (`apps/server/src/agents/xss/`): Injects payloads into product reviews, navigates in real Chromium, and confirms DOM sink execution via `window.__bugbounty_xss_test`.
- **Business Logic Specialist Agent** (`apps/server/src/agents/business-logic/`): Executes client-side price tampering during checkout, purchasing items at $0.01 without server re-validation.
- **Mission Orchestrator & ReplayVerifier** (`apps/server/src/orchestrator/`): Coordinates sequential execution, enforces authorized target scope, deduplicates root causes, independently reproduces each finding via fresh HTTP/DOM replay, and handles escrow release or contract refund.

### Swarm Bounty Market on NEAR Testnet
- **Market Smart Contract** (`apps/near-market-contract/`): Rust contract with 10/10 passing unit tests:
  - Commit-reveal sealed bidding (SHA-256 preimages).
  - Deterministic scoring: `(confidence_bps * (1 + rep) * 1e12) / cost_units`.
  - Verification-gated payouts: operator releases escrowed reward only after independent replay reproduction.
  - Operator escrow refund: `refund_round(round_id)` returns escrow to operator if finding is unreproducible.
  - Reputation increments upon confirmed payout; remains unchanged upon refund.
- **Live Testnet Market Deployment**: Deployed and active at `market.harsha-swarm.testnet`.
- **5 Competing Sub-Accounts with Function-Call Access Keys**:
  - `idor.harsha-swarm.testnet`
  - `xss.harsha-swarm.testnet`
  - `logic.harsha-swarm.testnet`
  - `gen1.harsha-swarm.testnet`
  - `gen2.harsha-swarm.testnet`

### Attestation Smart Contract on NEAR Testnet
- **Attestation Contract** (`apps/near-contract/`): Rust contract with 13/13 passing unit tests.
- **Live Deployment**: Deployed and active at `harsha-swarm.testnet`.
- **Master Attestation**: Live transaction `9ndGZJ2F8sWAQTgTnkzPgMKbtgs5upbQwQKtabLLvGhm` (mission `mission-refund-1794725357805`) storing root mission hash, finding count, and timestamp.

### Web Dashboard & Demo System
- **React + Vite UI** (`apps/web/`):
  - **Clean Reset Demo Feature**: One-click "Reset Demo State" button sets dashboard to 0 findings / fresh scratch state for live video recording.
  - **Mission Control**: Live progress indicator, verified findings table, and NEAR status.
  - **Bounty Market View**: Displays all 3 rounds, competing bids, scores, winners, and transaction links.
  - **Findings View**: Full vulnerability details, severity badges, and reproduction rationale.
  - **Cryptographic Integrity Testing**: Real-time "Verify integrity" (shows MATCH) and "Simulate Local Tamper" (shows MISMATCH).
  - **Agent Leaderboard**: Live on-chain reputation reading directly from NEAR Testnet.

---

## 2. Verification Scripts (Zero Gas / Read-Only)

```bash
# 1. Read-only market auction verification
npm run verify:market

# 2. Read-only master attestation verification
npm run verify:near

# 3. Deployed contracts match this source (sha256 == on-chain code_hash)
npm run verify:deployment

# 4. Test suites
npm test                    # 12 suites, no signing key needed
npm run test:orchestrator   # full testnet mission
npm run demo:refund         # testnet refund path
npm run build:web
```

---

## 3. Scope & Safety Guardrails
- **Scope Restriction**: Hardcoded to `http://localhost:4000/shop`. Out-of-scope targets are strictly rejected.
- **NEAR Testnet Only for Funds**: Every signed transaction is on testnet. The only mainnet contact is a read-only 1Click dry price quote (no funds move).
- **Key Security**: No private keys or `.env` files are tracked in git or printed in logs.
