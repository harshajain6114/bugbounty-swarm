# BUGBOUNTY SWARM — Swarm Bounty Market Rules

**Version**: 2.0.0 (Agent Economy & AI Swarms Track)  
**Contract Architecture**: Commit-Reveal Auction with Gated Verification Payouts  
**Network**: NEAR Protocol Testnet  

---

## 1. Core Economic Model

Instead of a centralized coordinator assigning tasks deterministically, the coordinator acts as an autonomous market auctioneer. For each discovered security assessment task, a round is opened on NEAR Testnet:

1. **Target Tasks**:
   - `task-access-control`: Evaluates broken object-level authorization (IDOR / BOLA) on discovered user resources.
   - `task-injection`: Evaluates stored cross-site scripting (XSS) in user review sinks via real Chromium DOM execution.
   - `task-business-logic`: Evaluates client-side price tampering during order checkout.

2. **Market Bidders**:
   - **Specialists**:
     - `idor.harsha-swarm.testnet` (`IdorAgent`)
     - `xss.harsha-swarm.testnet` (`XssAgent`)
     - `logic.harsha-swarm.testnet` (`BusinessLogicAgent`)
   - **Scripted Generalists** (competing across all tasks):
     - `gen1.harsha-swarm.testnet` (`GeneralistAlpha` — High volume, low-cost discount strategy)
     - `gen2.harsha-swarm.testnet` (`GeneralistBeta` — Conservative balance strategy)

---

## 2. Commit-Reveal Protocol

To prevent front-running, bid copying, or priority gas auction games on-chain, all bidders follow a two-phase commit-reveal scheme:

### Phase 1: Commitment
Each bidder computes a cryptographic commitment:
$$\text{commitment} = \text{sha256}(\text{agent\_id} \parallel \text{task\_id} \parallel \text{confidence\_bps} \parallel \text{cost\_yocto} \parallel \text{salt})$$
and submits `commit_bid(round_id, commitment)` to the smart contract.

### Phase 2: Reveal & Verification
Each bidder reveals `(confidence_bps, cost_yocto, salt)`.
The smart contract verifies the pre-image matches the stored commitment using `env::sha256`. Invalid reveals are strictly rejected.

---

## 3. Deterministic Winner Selection Formula

The market auctioneer does not pick favorites. The contract enforces a deterministic, math-driven scoring rule:

$$\text{Score} = \frac{\text{confidence\_bps} \times (1 + \text{reputation})}{\text{cost\_yocto}}$$

- `confidence_bps`: Bidder's declared confidence (0 to 10,000 basis points).
- `reputation`: On-chain reputation points accrued from past verified findings.
- `cost_yocto`: Bid price requested in yoctoNEAR (subject to task maximum cap).
- **Tie-Break**: Lexicographical order of the bidder's NEAR account ID.

---

## 4. Gated Verification Payout

Winning the bid grants the **execution right**, NOT the payout.

1. **Execution**: The winning agent runs its testing suite against the target.
2. **Verification Gate**: The independent `FindingVerifier` must inspect:
   - Complete HTTP request/response differential proofs
   - Real browser JavaScript marker DOM execution
   - Cryptographic non-leakage of raw secrets
3. **Payout**:
   - Only if the finding is `VERIFIED_CONFIRMED`, the contract executes `payout(round_id)`.
   - The contract transfers the escrowed reward directly to the winner's sub-account (`*.harsha-swarm.testnet`).
   - The winner's on-chain reputation increments by `+1`.
   - If no vulnerability is confirmed, the escrow is refunded to the operator and zero reputation is awarded.
