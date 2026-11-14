# BUGBOUNTY SWARM — Live Demo Playbook & Video Script

This guide explains **how to run the live demo**, **what to click**, and **what to say to hackathon judges**.

---

## Quick Start (How to Launch the Demo)

In your terminal at the repository root, run:
```bash
npm start
```
This boots:
1. **Backend API & Demo Shop** at `http://localhost:4000`
2. **React Cyber Dashboard** at `http://localhost:5173`

Open `http://localhost:5173` in your browser.

---

## 3-Minute Live Demo Walkthrough (What to Click & What to Say)

### Act 1: The Setup & Mission Execution (0:00 - 0:50)

- **What to show**: `http://localhost:5173` (Mission Control).
- **What to say**:
  > *"Welcome to BUGBOUNTY SWARM — an autonomous security agent swarm with a decentralized bounty market on NEAR Protocol Testnet. Traditional bug bounty hunting suffers from uncoordinated duplicate reporting, manual exploitation, and lack of tamper-proof audit trails. We solved this by pairing specialized autonomous agents with an on-chain commit-reveal auction and immutable attestation."*
- **Action**: Click the green **"Start a mission"** button.
- **What to say**:
  > *"When we trigger a mission, our Mission Orchestrator coordinates the agents against our local vulnerable shop (`http://localhost:4000/shop`). First, ReconAgent uses headless Chromium to crawl the entire attack surface. Then, each specialist agent tests the target: IdorAgent detects broken object access on orders, XssAgent confirms stored JavaScript execution in the browser DOM, and BusinessLogicAgent exploits client-side price tampering."*
- **What you will see**: The status pill switches to `RUNNING`, progress stages light up, and the 3 verified findings populate in real time with the new Mission ID.

---

### Act 2: The Swarm Bounty Market (0:50 - 1:40) — *Primary Hackathon Fit*

- **Action**: Click the **"Bounty Market"** tab on the left sidebar.
- **What to show**: The 3 auction rounds (`task-access-control`, `task-injection`, `task-business-logic`) and competing sub-accounts.
- **What to say**:
  > *"Instead of hardcoding work assignments, BUGBOUNTY SWARM features a decentralized task auction deployed on NEAR Testnet at `market.harsha-swarm.testnet`. Competing specialist and generalist agents submit cryptographically sealed bids using a commit-reveal mechanism to prevent front-running."*
- **Point out the scoring formula**:
  > *"The contract deterministically scores revealed bids using:*  
  > $$\text{Score} = \frac{\text{Confidence\_Bps} \times (1 + \text{Reputation}) \times 10^{21}}{\text{Cost\_Yocto}}$$  
  > *Specialist agents (`idor.harsha-swarm.testnet`, `xss.harsha-swarm.testnet`, `logic.harsha-swarm.testnet`) win because their 98-99% confidence and on-chain reputation outrank discount generalist bidders."*
- **Point out the Verification-Gated Payout**:
  > *"Crucially, rewards are held in escrow. Payout is only released after our independent `FindingVerifier` reproduces and confirms the finding. No confirmation, no payout."*

---

### Act 3: Verified Reproducible Findings (1:40 - 2:15)

- **Action**: Click the **"Findings"** tab on the left sidebar.
- **What to show**: The 3 verified vulnerability findings:
  1. **BOLA / IDOR Authorization Bypass** (`/shop/api/orders/:id`): Differential cross-user access verified with User Alice reading Bob's private order items.
  2. **Stored XSS** (`/shop/products/:id`): Real headless Chromium DOM execution confirmed via window execution marker.
  3. **Client-Side Price Manipulation** (`/shop/checkout`): Parameter tampering accepted by server without re-validation.
- **What to say**:
  > *"Notice that each finding has full reproduction rationale. If multiple inputs trigger the same vulnerability, our verifier deduplicates them into a single root cause so agents cannot spam the market for extra bounties."*

---

### Act 4: On-Chain Immutability & Tamper Resistance (2:15 - 3:00)

- **Action**: Return to **"Mission Control"**.
- **Action**: Click **"Verify integrity"**.
  > *"Any auditor, security team, or judge can independently verify findings. Clicking 'Verify integrity' reads the immutable SHA-256 digest from the NEAR smart contract, recalculates the local report hash, and displays a green MATCH."*
- **Action**: Click **"Simulate Local Tamper"**.
  > *"Now watch what happens if a malicious database administrator or attacker alters a finding locally. Clicking 'Simulate Local Tamper' mutates the finding in memory. The check immediately flashes red MISMATCH because the on-chain hash recorded at `harsha-swarm.testnet` cannot be rewritten."*
- **Action**: Click the **"NEAR Explorer"** link or open NearBlocks explorer to show the live confirmed transactions on `harsha-swarm.testnet` and `market.harsha-swarm.testnet`.
- **In Terminal**: (Optional) Show judges zero-gas independent verification:
  ```bash
  npm run verify:near
  npm run verify:market
  ```

---

## Hackathon Track Mapping

| Track | Why Judges Love It |
|---|---|
| **AI Swarms** (Primary) | Coordinated specialist agents, sealed commit-reveal bidding rounds, individual testnet sub-accounts (`idor`, `xss`, `logic`, `gen1`, `gen2`), and deterministic auction settlement. |
| **Agent Economy** | Autonomous agents earning testnet NEAR bounties, managing reputation, and transacting via smart contracts. |
| **AI Security & Defense** | Verification-gated policy engine: bounties are escrowed and released only upon automated vulnerability reproduction. Zero false positives. |
