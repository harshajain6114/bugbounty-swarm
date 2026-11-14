# BUGBOUNTY SWARM — NEAR Protocol Testnet Live Proof

**Contract ID**: `harsha-swarm.testnet`  
**Network**: NEAR Testnet (`https://rpc.testnet.near.org`)  
**Operator Account**: `harsha-swarm.testnet`  
**Explorer Base**: [https://testnet.nearblocks.io/](https://testnet.nearblocks.io/)

---

## 1. Contract Deployment & Initialization

- **Contract Account**: `harsha-swarm.testnet`
- **Transaction Hash**: `FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8`
- **Explorer Link**: [https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8](https://testnet.nearblocks.io/txns/FVvpikhEnsY2sYaEhRdzwGKL6pzFAjANVjY4nbzA4zx8)
- **Initialized Operator**: `harsha-swarm.testnet`

---

## 2. Live Autonomous Security Mission Attestation

**Mission ID**: `test-mission-1794640261981`  
**Target**: `http://localhost:4000/shop`  
**Status**: Verified & Confirmed on-chain  

### Transactions Recorded on NEAR Testnet

| Operation | Agent / Record | Transaction Hash | Explorer Link |
|---|---|---|---|
| **Mission Attestation** | Master Attestation (3 verified vulns) | `CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb` | [View on NearBlocks](https://testnet.nearblocks.io/txns/CBx7vSCKqcMTouJSVSjCRP2VaQyNgvEoBqAmq3Bbq9bb) |
| **Agent Contribution** | ReconAgent (0 findings, 8 pages/13 endpoints) | `CWrogvhg4QbZsXhdQr9gRWnQnzCaRvjiHKByCY2VpUbz` | [View on NearBlocks](https://testnet.nearblocks.io/txns/CWrogvhg4QbZsXhdQr9gRWnQnzCaRvjiHKByCY2VpUbz) |
| **Agent Contribution** | IdorAgent (1 verified finding) | `Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ` | [View on NearBlocks](https://testnet.nearblocks.io/txns/Hx9sDJDPUkjGo8Eu8pSpEAW8SLCK2tv4NEAfBCPbKaVZ) |
| **Agent Contribution** | XssAgent (1 verified finding) | `2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2` | [View on NearBlocks](https://testnet.nearblocks.io/txns/2h7gFw2RwrLLjGxrpT4QuJZUnqC2KgymiJtyM3696jF2) |
| **Agent Contribution** | BusinessLogicAgent (1 verified finding) | `5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc` | [View on NearBlocks](https://testnet.nearblocks.io/txns/5pojRxsyKzm5dSPGYzdLT3tN8wiSsS6JHNcZ8fyTUTQc) |

---

## 3. Read-Back Verification Output

Raw results retrieved directly from `harsha-swarm.testnet` using view calls:

### `get_mission({"mission_id": "test-mission-1794640261981"})`
```json
{
  "mission_id": "test-mission-1794640261981",
  "result_hash": "f8f7137fd66e53b7709ba4743b81ee58c17c0b2f26416607453185e0f7e801d3",
  "findings_hash": "fad393c96d1cb0a62d5d2bdd19d9deacd574e059933616ad066ab36ae6ce11e5",
  "verified_finding_count": 3,
  "timestamp_ms": 1794640321221,
  "submitted_by": "harsha-swarm.testnet"
}
```

### `get_mission_contributions({"mission_id": "test-mission-1794640261981"})`
```json
[
  {
    "agent_id": "ReconAgent",
    "contribution_hash": "94aa48cb199730fd0f9e7a71cdc373bf83535dbdc4c52be68f185dace4db7c41",
    "findings_contributed": 0,
    "mission_id": "test-mission-1794640261981",
    "timestamp_ms": 1794640329089
  },
  {
    "agent_id": "IdorAgent",
    "contribution_hash": "fcd4c3de439e28b1743fe511b51117ab1bcc12ea7197ff1a9f82226dd169be6a",
    "findings_contributed": 1,
    "mission_id": "test-mission-1794640261981",
    "timestamp_ms": 1794640336831
  },
  {
    "agent_id": "XssAgent",
    "contribution_hash": "80b00fdcd9e9bdef7770d7920dea9bbcbe8bfc66c996ec27cbe4e228a76f2a48",
    "findings_contributed": 1,
    "mission_id": "test-mission-1794640261981",
    "timestamp_ms": 1794640344216
  },
  {
    "agent_id": "BusinessLogicAgent",
    "contribution_hash": "323f9d9a32195407f03a6cba822b05cdb0695237d8a155434442793f6c5b6c8c",
    "findings_contributed": 1,
    "mission_id": "test-mission-1794640261981",
    "timestamp_ms": 1794640352028
  }
]
```

### `get_agent_reputation`
- `IdorAgent`: **1**
- `XssAgent`: **1**
- `BusinessLogicAgent`: **1**
