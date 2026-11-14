/*!
 * BugBounty Swarm — NEAR Testnet Smart Contract
 *
 * Records mission attestations and agent contribution records on-chain,
 * providing an independently verifiable, tamper-evident audit trail of
 * autonomous security-testing missions.
 *
 * TESTNET ONLY. Never deploy to mainnet with real funds.
 */

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{UnorderedMap, Vector};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, PanicOnDefault};

// ─────────────────────────────────────────────────────────────────────────────
// Data structures
// ─────────────────────────────────────────────────────────────────────────────

/// On-chain record for a completed security mission.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct MissionAttestation {
    /// Unique mission identifier (e.g. "mission-1700000000000")
    pub mission_id: String,
    /// SHA-256 hex digest of the full mission result JSON
    pub result_hash: String,
    /// SHA-256 hex digest of the sorted verified findings
    pub findings_hash: String,
    /// Number of independently verified unique vulnerabilities
    pub verified_finding_count: u32,
    /// Unix timestamp in milliseconds when the mission completed
    pub timestamp_ms: u64,
    /// NEAR account that submitted this attestation
    pub submitted_by: AccountId,
}

/// On-chain record for an individual agent's contribution to a mission.
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct AgentContribution {
    /// Logical agent identifier (e.g. "ReconAgent", "IdorAgent")
    pub agent_id: String,
    /// SHA-256 hex digest of the agent's findings subset
    pub contribution_hash: String,
    /// Number of raw findings this agent contributed
    pub findings_contributed: u32,
    /// Mission this contribution belongs to
    pub mission_id: String,
    /// Unix timestamp in milliseconds
    pub timestamp_ms: u64,
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract state
// ─────────────────────────────────────────────────────────────────────────────

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BugBountySwarmContract {
    /// mission_id → MissionAttestation
    missions: UnorderedMap<String, MissionAttestation>,
    /// "mission_id:agent_id" → AgentContribution
    contributions: UnorderedMap<String, AgentContribution>,
    /// agent_id → cumulative reputation score (findings_contributed sum)
    reputation: UnorderedMap<String, u64>,
    /// Ordered log of all recorded mission IDs
    mission_log: Vector<String>,
    /// Account allowed to write records (the BUGBOUNTY SWARM backend)
    operator: AccountId,
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract implementation
// ─────────────────────────────────────────────────────────────────────────────

#[near]
impl BugBountySwarmContract {
    /// Initialises the contract. Called once at deployment.
    #[init]
    pub fn new(operator: AccountId) -> Self {
        assert!(!env::state_exists(), "Contract is already initialised");
        Self {
            missions: UnorderedMap::new(b"m"),
            contributions: UnorderedMap::new(b"c"),
            reputation: UnorderedMap::new(b"r"),
            mission_log: Vector::new(b"l"),
            operator,
        }
    }

    // ── Write methods (operator-only) ────────────────────────────────────────

    /// Records a mission attestation. Rejects duplicate mission IDs.
    pub fn record_mission(
        &mut self,
        mission_id: String,
        result_hash: String,
        findings_hash: String,
        verified_finding_count: u32,
    ) {
        self.assert_operator();
        assert!(
            self.missions.get(&mission_id).is_none(),
            "Mission '{}' has already been attested",
            mission_id
        );
        assert!(!mission_id.is_empty(), "mission_id must not be empty");
        assert!(result_hash.len() == 64, "result_hash must be a 64-char hex SHA-256 digest");
        assert!(findings_hash.len() == 64, "findings_hash must be a 64-char hex SHA-256 digest");

        let attestation = MissionAttestation {
            mission_id: mission_id.clone(),
            result_hash,
            findings_hash,
            verified_finding_count,
            timestamp_ms: env::block_timestamp_ms(),
            submitted_by: env::predecessor_account_id(),
        };

        self.missions.insert(&mission_id, &attestation);
        self.mission_log.push(&mission_id);

        env::log_str(&format!(
            "MISSION_ATTESTED: id={} findings={} hash={}",
            mission_id, verified_finding_count, attestation.result_hash
        ));
    }

    /// Records an agent's contribution to a specific mission.
    pub fn record_agent_contribution(
        &mut self,
        mission_id: String,
        agent_id: String,
        contribution_hash: String,
        findings_contributed: u32,
    ) {
        self.assert_operator();
        assert!(
            self.missions.get(&mission_id).is_some(),
            "Mission '{}' must be attested before recording agent contributions",
            mission_id
        );
        assert!(!agent_id.is_empty(), "agent_id must not be empty");
        assert!(
            contribution_hash.len() == 64,
            "contribution_hash must be a 64-char hex SHA-256 digest"
        );

        let key = format!("{}:{}", mission_id, agent_id);
        let contribution = AgentContribution {
            agent_id: agent_id.clone(),
            contribution_hash,
            findings_contributed,
            mission_id: mission_id.clone(),
            timestamp_ms: env::block_timestamp_ms(),
        };

        self.contributions.insert(&key, &contribution);

        // Update reputation
        let current_rep = self.reputation.get(&agent_id).unwrap_or(0);
        self.reputation
            .insert(&agent_id, &(current_rep + findings_contributed as u64));

        env::log_str(&format!(
            "AGENT_CONTRIBUTION: mission={} agent={} findings={}",
            mission_id, agent_id, findings_contributed
        ));
    }

    // ── View methods (anyone can call) ───────────────────────────────────────

    /// Returns attestation for a given mission, or None if not found.
    pub fn get_mission(&self, mission_id: String) -> Option<MissionAttestation> {
        self.missions.get(&mission_id)
    }

    /// Returns all recorded mission IDs in insertion order.
    pub fn get_mission_ids(&self) -> Vec<String> {
        self.mission_log.to_vec()
    }

    /// Returns the total number of attested missions.
    pub fn get_mission_count(&self) -> u64 {
        self.missions.len()
    }

    /// Returns all agent contributions for a given mission.
    pub fn get_mission_contributions(&self, mission_id: String) -> Vec<AgentContribution> {
        let known_agents = [
            "ReconAgent",
            "IdorAgent",
            "XssAgent",
            "BusinessLogicAgent",
        ];
        let mut result = Vec::new();
        for agent_id in &known_agents {
            let key = format!("{}:{}", mission_id, agent_id);
            if let Some(c) = self.contributions.get(&key) {
                result.push(c);
            }
        }
        result
    }

    /// Returns the cumulative reputation score for an agent.
    pub fn get_agent_reputation(&self, agent_id: String) -> u64 {
        self.reputation.get(&agent_id).unwrap_or(0)
    }

    /// Returns the current operator account.
    pub fn get_operator(&self) -> AccountId {
        self.operator.clone()
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    fn assert_operator(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.operator,
            "Only the operator account may call this method"
        );
    }
}
