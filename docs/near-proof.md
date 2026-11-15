# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `mission-refund-1794725357805`  
> **Timestamp**: 2026-11-15T06:52:24.697Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `mission-refund-1794725357805`
- **Result Hash (SHA-256)**: `092ee20185e1fb221121bfef5c83146ff9b1c34b0c7a122a6b351a3824e8ae1a`
- **Findings Hash (SHA-256)**: `f067b618085759135a61400783ce4d1957d3621ef392d452f551b8907cae777a`
- **Verified Vulnerabilities**: 2
- **Attestation Transaction**: [9ndGZJ2F8sWAQTgTnkzPgMKbtgs5upbQwQKtabLLvGhm](https://testnet.nearblocks.io/txns/9ndGZJ2F8sWAQTgTnkzPgMKbtgs5upbQwQKtabLLvGhm)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `mission-refund-1794725357805-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `REFUNDED` | [`4VfpiRVzLVm1…`](https://testnet.nearblocks.io/txns/4VfpiRVzLVm18Aa1nvFoeWzLX5BvqNF9c19pnof5Vtqn) |
| `mission-refund-1794725357805-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`94gHiyzsayCn…`](https://testnet.nearblocks.io/txns/94gHiyzsayCnmNChdZPiEhx61GkqVQVuBySFRUyALqrM) |
| `mission-refund-1794725357805-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`9jqqdAhyL98A…`](https://testnet.nearblocks.io/txns/9jqqdAhyL98AAPG9mHX2sUW3dDKgbMoutb2mAx6UtXcF) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
