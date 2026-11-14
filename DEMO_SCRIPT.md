# BUGBOUNTY SWARM — 2-Minute Demo Video Script & Recording Playbook

> **Target Duration**: Exactly 2 minutes (120 seconds)  
> **Submitted Tracks**: **AI Swarms** (Primary), **Agent Economy**, **AI Security & Defense**  
> **Key Principle**: Zero faking — every claim is backed by visible on-screen execution and confirmed NEAR Testnet transactions.

---

## 0. Pre-Recording Setup (Do This Before Pressing Record)

1. Open your terminal at the project root and run:
   ```bash
   npm start
   ```
   *(This boots the backend at `http://localhost:4000` and the web dashboard at `http://localhost:5173`)*.

2. Open Chrome to:
   - Tab 1: `http://localhost:5173` (Security Dashboard)
   - Tab 2: `https://testnet.nearblocks.io/address/market.harsha-swarm.testnet` (NearBlocks Explorer)

3. **Get a Clean Scratch State**:
   - In Tab 1 (`http://localhost:5173`), click **"Reset Demo State"** in the top bar.
   - The dashboard will instantly reset: Status = `AWAITING TRIGGER`, Verified Vulnerabilities = `0`, Discovered Endpoints = `0`, Table = `Target attack surface unscanned`.
   - Now your screen is 100% fresh, clean, and ready to record!

---

## Synchronized 2-Minute Script (Timestamp | Screen | Action | Voiceover)

---

### [0:00 - 0:20] Hook: What We Built & Why We Built It
- **Track Highlight**: Problem Statement & Mission Overview
- **Screen**: Full browser on `http://localhost:5173` (Dashboard in clean reset state: 0 vulnerabilities, "Awaiting Trigger").
- **Mouse**: Hover lightly over the title and target workspace.
- **Voiceover**:
  > *"Traditional bug bounty hunting is broken. Manual researchers duplicate effort, while LLM vulnerability scanners flood security teams with hallucinated false positives.  
  > We built **BUGBOUNTY SWARM**: an autonomous swarm of specialist security agents that discover and exploit web vulnerabilities in real browser DOM sessions, coordinate tasks through a decentralized commit-reveal bounty market on NEAR Protocol, and gate rewards through independent cryptographic verification."*

---

### [0:20 - 0:45] The Live Trigger & Swarm Execution
- **Track Highlight**: Autonomous Multi-Agent Swarm
- **Screen**: Mission Control.
- **Action**: Click the green **"Start a mission"** button.
- **Visual**: The status badge turns `RUNNING`, the pipeline progress track lights up, and agents begin executing.
- **Voiceover**:
  > *"Watch this live execution against our local demo shop.  
  > When I click 'Start a mission', our Mission Orchestrator deploys ReconAgent, which uses headless Playwright Chromium to crawl the attack surface across authenticated and unauthenticated states.  
  > It discovers 8 pages and 13 endpoints, feeding structured attack surfaces to our specialist agents."*

---

### [0:45 - 1:10] The Swarm Bounty Market (Primary Track: AI Swarms & Agent Economy)
- **Track Highlight**: **AI Swarms** & **Agent Economy**
- **Action**: Click the **"Bounty Market"** tab on the left sidebar.
- **Visual**: The 3 auction rounds (`task-access-control`, `task-injection`, `task-business-logic`) appear with 5 bidding agents.
- **Voiceover**:
  > *"Here is what makes this a true AI Swarm: tasks aren't hardcoded. Competing specialist and generalist agents bid for tasks through our smart contract on `market.harsha-swarm.testnet`.  
  > To prevent front-running, agents submit cryptographically sealed commit-reveal bids.  
  > The contract deterministically scores them on-chain using confidence, cost, and reputation. Specialist sub-accounts like `idor`, `xss`, and `logic` win the bounties, which are held in escrow."*

---

### [1:10 - 1:35] Reproducible Exploits & Gated Payouts (Track: AI Security & Defense)
- **Track Highlight**: **AI Security & Defense**
- **Action**: Click the **"Findings"** tab on the left sidebar.
- **Visual**: The 3 confirmed vulnerabilities populate the table with green `Verified` badges and reproduction rationale.
- **Voiceover**:
  > *"Under AI Security & Defense, bounties are never paid on confidence alone. Payout is strictly gated by our automated verifier, which reproduces each finding:  
  > 1. Differential cross-user data leakage on order endpoints.  
  > 2. Persistent Stored XSS executed directly in Chromium's DOM.  
  > 3. Client-side price tampering during checkout.  
  > Because these are confirmed in actual browser runtime, we achieve zero false positives. Only upon verified reproduction does the contract release the escrowed NEAR reward."*

---

### [1:35 - 1:55] On-Chain Attestation & Cryptographic Tamper Proof
- **Track Highlight**: Immutable Ledger & Tamper Resistance
- **Action**: 
  1. Click back to **"Mission Control"**.
  2. Click **"Verify integrity"** (Green MATCH banner appears).
  3. Click **"Simulate Local Tamper"** (Red MISMATCH banner appears).
- **Voiceover**:
  > *"Finally, audit integrity. Clicking 'Verify integrity' compares our local mission report hash against the immutable record on `harsha-swarm.testnet` — producing a confirmed MATCH.  
  > But if a malicious attacker alters a finding locally, clicking 'Simulate Local Tamper' immediately triggers a red MISMATCH alert, because on-chain smart contracts cannot be forged or rewritten."*

---

### [1:55 - 2:00] Outro & Explorer Verification
- **Screen**: Click the **"NEAR Explorer"** link or switch to the NearBlocks tab showing the confirmed transactions.
- **Voiceover**:
  > *"All 13 auction transactions and mission attestations are confirmed live on NEAR Testnet. This is BUGBOUNTY SWARM — autonomous security testing powered by the agent economy."*

---

## Quick Demo Checklist

| Step | Action | Expected On-Screen Result |
|---|---|---|
| 1 | Click **"Reset Demo State"** | Everything resets to 0 (clean scratch state). |
| 2 | Click **"Start a mission"** | Status turns `RUNNING`, progress bar animates. |
| 3 | Wait ~25 seconds | Mission finishes; 3 findings appear, NEAR status shows `CONFIRMED`. |
| 4 | Click **"Bounty Market"** tab | Shows 3 settled rounds, 5 sub-account bidders, deterministic scores, and tx links. |
| 5 | Click **"Findings"** tab | Shows IDOR, Stored XSS (DOM verified), and Price Tampering. |
| 6 | Return to **"Mission Control"** | Shows dashboard summary. |
| 7 | Click **"Verify integrity"** | Green banner: `INTEGRITY CHECK: MATCH`. |
| 8 | Click **"Simulate Local Tamper"** | Red banner: `INTEGRITY CHECK: MISMATCH`. |

---

## Terminal Verification (Optional 5-Second Flex for Judges)
If you want to show terminal verification on camera, run:
```bash
npm run verify:market
```
It instantly reads the contract status, 3 settled rounds, and 5 revealed bids from `market.harsha-swarm.testnet` with zero gas and zero private keys.
