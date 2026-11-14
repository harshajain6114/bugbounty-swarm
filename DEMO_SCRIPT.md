# BUGBOUNTY SWARM — 2-Minute Demo Recording Script

## Video Overview (Total Duration: 2:00)

---

### [0:00 - 0:25] Introduction & The Problem
- **Voiceover**: "Welcome to BUGBOUNTY SWARM — an autonomous multi-agent web security research platform anchored to NEAR Protocol Testnet. Modern bug bounty hunting requires complex reconnaissance, nuanced exploitation, and tamper-proof verification. We created a specialized swarm of autonomous agents that find, reproduce, and record vulnerabilities on-chain."
- **Screen**: Show `http://localhost:5173` dashboard showing the connected status and `harsha-swarm.testnet` operator indicator.

---

### [0:25 - 0:55] Autonomous Swarm Execution
- **Action**: Click **"Start a mission"**.
- **Voiceover**: "When we launch a mission, our Mission Orchestrator coordinates four specialist security agents against our target shop. First, the Reconnaissance Agent crawls the application using headless Chromium, mapping 8 pages, 13 endpoints, and 7 forms. Next, specialist agents sequentially test the surface: IdorAgent identifies broken object authorization, XssAgent confirms stored JavaScript execution in the browser DOM, and BusinessLogicAgent exploits client-side price manipulation."
- **Screen**: Show progress indicators updating and the 3 verified findings populating the table.

---

### [0:55 - 1:25] NEAR Protocol Testnet Attestation
- **Action**: Point out the NEAR Testnet pill with transaction hash `CBx7vSCKqc...`. Click **"View on NearBlocks Explorer"**.
- **Voiceover**: "Immediately following finding verification, the orchestrator computes deterministic SHA-256 digests and submits an attestation transaction to our smart contract on NEAR Testnet at `harsha-swarm.testnet`. Each specialist agent also receives immutable reputation credit on-chain for every validated finding."
- **Screen**: NearBlocks Explorer showing transaction details, method `record_mission`, and block confirmation.

---

### [1:25 - 1:50] Cryptographic Tamper Verification
- **Action**: Return to dashboard. Click **"Verify integrity"**.
- **Voiceover**: "Any party can verify that a local report hasn't been altered. Clicking 'Verify integrity' queries the hash from the smart contract, hashes our local report, and confirms a perfect MATCH."
- **Action**: Click **"Simulate Tamper"**.
- **Voiceover**: "If an attacker modifies even a single character in the report, our integrity check catches it instantly with a MISMATCH flag."
- **Screen**: Show the red MISMATCH alert comparing the stored hash with the mutated computed hash.

---

### [1:50 - 2:00] Conclusion
- **Voiceover**: "BUGBOUNTY SWARM combines autonomous security agents with NEAR blockchain immutability for the future of verifiable security research. Thank you!"
- **Screen**: GitHub repository and final clean dashboard view.
