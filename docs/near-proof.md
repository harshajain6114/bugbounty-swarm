# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `mission-refund-1794721485135`  
> **Timestamp**: 2026-11-15T05:47:11.387Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `mission-refund-1794721485135`
- **Result Hash (SHA-256)**: `aa86f7e719b466672b60c6ae8713951dd6493cd355039a0784458d4064e0a8b7`
- **Findings Hash (SHA-256)**: `f067b618085759135a61400783ce4d1957d3621ef392d452f551b8907cae777a`
- **Verified Vulnerabilities**: 2
- **Attestation Transaction**: [Hq8kCU5rzpNeDHnE5xHzMFxt2jzyQRhYYXLtn52XUvj](https://testnet.nearblocks.io/txns/Hq8kCU5rzpNeDHnE5xHzMFxt2jzyQRhYYXLtn52XUvj)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `mission-refund-1794721485135-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `REFUNDED` | [`5e1J9yZneCNS…`](https://testnet.nearblocks.io/txns/5e1J9yZneCNSpt35Yokvgt1o3ox2mNZVVsnYDjEJkhWC) |
| `mission-refund-1794721485135-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`26KMPvPSqC7o…`](https://testnet.nearblocks.io/txns/26KMPvPSqC7oD7wN3kfbQwxmYhkDkG4LvSxr2B24688U) |
| `mission-refund-1794721485135-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`4fiKDzQV3NS5…`](https://testnet.nearblocks.io/txns/4fiKDzQV3NS5zpqNCFwNBBeS2BgHyBZu86P79w2pxonj) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
