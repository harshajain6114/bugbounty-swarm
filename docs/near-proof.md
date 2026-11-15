# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `mission-refund-1794727136998`  
> **Timestamp**: 2026-11-15T07:22:07.912Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `mission-refund-1794727136998`
- **Result Hash (SHA-256)**: `16a543235a6a755f691b7d9fec04e7a0a754d1a2c80f29cb6d4bf4ddf01975c8`
- **Findings Hash (SHA-256)**: `f067b618085759135a61400783ce4d1957d3621ef392d452f551b8907cae777a`
- **Verified Vulnerabilities**: 2
- **Attestation Transaction**: [Euf52aUXrC7m2KbjuLwXn6ygfByayRyny5UNuUKoiq4F](https://testnet.nearblocks.io/txns/Euf52aUXrC7m2KbjuLwXn6ygfByayRyny5UNuUKoiq4F)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `mission-refund-1794727136998-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `REFUNDED` | [`HCjKLJEBH19f…`](https://testnet.nearblocks.io/txns/HCjKLJEBH19f5UqLGPSafoMMVvBiupBD8nGEL4ZiXTGg) |
| `mission-refund-1794727136998-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`EryXFdwtE3Pt…`](https://testnet.nearblocks.io/txns/EryXFdwtE3PtPPKxYk8n7WPJJxXyVwE44gfaJotEa2g5) |
| `mission-refund-1794727136998-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`6yDANauBBUHb…`](https://testnet.nearblocks.io/txns/6yDANauBBUHb1rGaRFv1pj9pmq6DEjEKddWZffKiQsBa) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
