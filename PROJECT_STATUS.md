# BUGBOUNTY SWARM — Project Status

Date: November 14, 2026  
Status: Complete Hackathon Submission  

---

## 1. What Is Built & Verified Working

### Sequential Multi-Agent Pipeline
- **Reconnaissance Agent** (`apps/server/src/agents/recon/`): Headless Playwright Chromium crawler. Explores unauthenticated and authenticated states, discovering 8 pages, 13 API endpoints, and 7 forms.
- **IDOR / BOLA Agent** (`apps/server/src/agents/idor/`): Performs differential access control testing on object-level endpoints (`/shop/api/orders/:id`), validating unauthorized cross-tenant data leakage.
- **Stored XSS Agent** (`apps/server/src/agents/xss/`): Injects payloads into reviews, verifies persistent storage, navigates with real browser, and verifies execution of `window.__bugbounty_xss_test` in Chromium.
- **Business Logic Agent** (`apps/server/src/agents/business-logic/`): Exploits client-controlled price fields, submitting $0.01 checkout payloads that succeed against vulnerable checkout endpoints.
- **Mission Orchestrator** (`apps/server/src/orchestrator/`): Sequential multi-agent pipeline with concurrency locks, out-of-scope target guards, independent evidence verification, credential scrubbing, and disk persistence.

### NEAR Protocol Testnet Integration
- **Rust Smart Contract** (`apps/near-contract/`): Compiled with `near-sdk` (v5.6.0) to `target/wasm32-unknown-unknown/release/bugbounty_swarm_contract.wasm`. 13/13 unit tests pass.
- **On-Chain Deployment**: Deployed and initialized on NEAR Testnet at `harsha-swarm.testnet`.
- **Live Attestation**: Submits deterministic SHA-256 mission result hashes, findings hashes, and agent contribution records. Live transaction: `CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb`.

### Dashboard & Verification UI
- **React + TypeScript Web App** (`apps/web/`):
  - Connected to live backend (`http://localhost:4000`).
  - "Start a mission" triggers real-time execution.
  - Displays all 3 confirmed vulnerabilities with reproduction steps and target endpoints.
  - Displays NEAR Testnet transaction status with direct links to NearBlocks Explorer.
  - Interactive "Verify integrity" and "Simulate Local Tamper" buttons for cryptographic validation against the on-chain hash.
  - Live Leaderboard reading on-chain reputation points directly from `harsha-swarm.testnet`.

---

## 2. Incomplete or Out-of-Scope Items
- **Mainnet**: Intentionally omitted. Contract and backend strictly enforce NEAR Testnet.
- **Arbitrary External Target URLs**: Intentionally blocked. Scope is strictly restricted to `http://localhost:4000/shop` to guarantee safe, legal testing.
- **LLM Hallucinations**: Agent logic uses deterministic rule-based engines rather than probabilistic LLMs to guarantee reproducibility for bounty reporting.

---

## 3. How to Run & Verify
```bash
# 1. Start full stack
npm start

# 2. Run read-only testnet check (no keys required)
npm run verify:near

# 3. Run test suites
npm run test:server
npm run test:orchestrator
npm run test:contract
```
