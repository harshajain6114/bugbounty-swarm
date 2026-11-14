# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `mission-refund-1794685022960`  
> **Timestamp**: 2026-11-14T19:39:24.315Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `mission-refund-1794685022960`
- **Result Hash (SHA-256)**: `e2a829dc00ffb694488db478811f09fc27d77b4bc2bf33208b6a70159bbe4bc1`
- **Findings Hash (SHA-256)**: `f067b618085759135a61400783ce4d1957d3621ef392d452f551b8907cae777a`
- **Verified Vulnerabilities**: 2
- **Attestation Transaction**: [9BhhHGn9Xo78WX4v9njnrDvA4LYGqRoSVybQ3poF4vx7](https://testnet.nearblocks.io/txns/9BhhHGn9Xo78WX4v9njnrDvA4LYGqRoSVybQ3poF4vx7)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `mission-refund-1794685022960-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `REFUNDED` | [`3fratm23AqZs…`](https://testnet.nearblocks.io/txns/3fratm23AqZscv778uTAyJAdw7AbRGE8QJoWFBU7F7ii) |
| `mission-refund-1794685022960-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`BzyxkQUaeutu…`](https://testnet.nearblocks.io/txns/BzyxkQUaeutu6qcq4yuwU94vGTo4Q7m3gdwFdCaXwZwD) |
| `mission-refund-1794685022960-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`CmYb6NJA8ji4…`](https://testnet.nearblocks.io/txns/CmYb6NJA8ji4bTqFdZFVKMPyzXegH6B7ieBRBC2mdJjk) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
