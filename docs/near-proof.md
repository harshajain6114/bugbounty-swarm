# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `mission-refund-1794726348171`  
> **Timestamp**: 2026-11-15T07:08:53.474Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `mission-refund-1794726348171`
- **Result Hash (SHA-256)**: `9364c1d500400d921a335eff8f443b4cc391e20e4b82339997011d967538cc22`
- **Findings Hash (SHA-256)**: `f067b618085759135a61400783ce4d1957d3621ef392d452f551b8907cae777a`
- **Verified Vulnerabilities**: 2
- **Attestation Transaction**: [544jKbms359rQVBrEw1JZUMhrAn9iYj2HMV1AzhggMyL](https://testnet.nearblocks.io/txns/544jKbms359rQVBrEw1JZUMhrAn9iYj2HMV1AzhggMyL)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `mission-refund-1794726348171-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `REFUNDED` | [`Dur3WG8nRhQr…`](https://testnet.nearblocks.io/txns/Dur3WG8nRhQrXgXw43ig6Z26SPLzgyDbnB1maZNRim2J) |
| `mission-refund-1794726348171-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`4beQyfZRy8R2…`](https://testnet.nearblocks.io/txns/4beQyfZRy8R25hRZd8aGu1nB3yjZoa39NPemu99FvKoX) |
| `mission-refund-1794726348171-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`HxXQsiEjkiJ8…`](https://testnet.nearblocks.io/txns/HxXQsiEjkiJ8oPCkUhPDW4g5gX7DfVFQw4ckCFyWAWfq) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
