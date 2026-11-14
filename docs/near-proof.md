# NEAR Protocol Testnet Verification Proofs

> **Generated from Mission**: `test-mission-1794687289883`  
> **Timestamp**: 2026-11-14T20:17:40.239Z  
> **Status**: COMPLETED  

---

## 1. Smart Contracts on NEAR Testnet

- **Attestation Contract**: [`harsha-swarm.testnet`](https://testnet.nearblocks.io/address/harsha-swarm.testnet)
- **Bounty Market Contract**: [`market.harsha-swarm.testnet`](https://testnet.nearblocks.io/address/market.harsha-swarm.testnet)

---

## 2. Master Mission Attestation

- **Mission ID**: `test-mission-1794687289883`
- **Result Hash (SHA-256)**: `d1d3c41401cfab7896cbc1a94d3976f843f1e17b6556ef82f15bde686179b30c`
- **Findings Hash (SHA-256)**: `fad393c96d1cb0a62d5d2bdd19d9deacd574e059933616ad066ab36ae6ce11e5`
- **Verified Vulnerabilities**: 3
- **Attestation Transaction**: [6YHWcRkpGddsxan5Z4DrN4MDDF5CNCAcWWCcfvN1wpkc](https://testnet.nearblocks.io/txns/6YHWcRkpGddsxan5Z4DrN4MDDF5CNCAcWWCcfvN1wpkc)

---

## 3. Swarm Bounty Market Rounds & Commit-Reveal Bids

| Round ID | Task ID | Winner Sub-Account | Payout Status | Payout / Refund Transaction |
|---|---|---|---|---|
| `test-mission-1794687289883-r1` | `task-access-control` | `idor.harsha-swarm.testnet` | `CONFIRMED` | [`Fu7g8a5wBBdm…`](https://testnet.nearblocks.io/txns/Fu7g8a5wBBdm2x2TWAoJy5FeqRe3jTs1QJ1PZTe2NhW4) |
| `test-mission-1794687289883-r2` | `task-injection` | `xss.harsha-swarm.testnet` | `CONFIRMED` | [`4iH82Md1jeaN…`](https://testnet.nearblocks.io/txns/4iH82Md1jeaNmYUMpzXcGD2odQBC5qMwTwfvnDD9QHLA) |
| `test-mission-1794687289883-r3` | `task-business-logic` | `logic.harsha-swarm.testnet` | `CONFIRMED` | [`8rY8BrhivqQz…`](https://testnet.nearblocks.io/txns/8rY8BrhivqQzrGDDN5qJ21VNMyGRwzRHYEpAenEtRD7C) |

---

## 4. How to Verify On-Chain (Zero Gas / Read-Only)

Anyone can verify the attestation and market state using the read-only scripts without keys:
```bash
# 1. Verify master mission attestation, contributions, and reputation
npm run verify:near

# 2. Verify market rounds, sealed bids, reveals, and payouts
npm run verify:market
```
