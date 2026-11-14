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

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const VALID_HASH: &str = "a3f1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1";
    const VALID_HASH_2: &str = "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2";

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    fn new_contract(operator: AccountId) -> BugBountySwarmContract {
        let context = get_context(operator.clone());
        testing_env!(context.build());
        BugBountySwarmContract::new(operator)
    }

    // ── Initialisation ───────────────────────────────────────────────────────

    #[test]
    fn test_new_sets_operator() {
        let operator = accounts(0);
        let contract = new_contract(operator.clone());
        assert_eq!(contract.get_operator(), operator);
    }

    #[test]
    fn test_initial_mission_count_is_zero() {
        let contract = new_contract(accounts(0));
        assert_eq!(contract.get_mission_count(), 0);
    }

    // ── Mission attestation ──────────────────────────────────────────────────

    #[test]
    fn test_record_mission_success() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());

        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission(
            "mission-001".to_string(),
            VALID_HASH.to_string(),
            VALID_HASH_2.to_string(),
            3,
        );

        assert_eq!(contract.get_mission_count(), 1);
        let att = contract.get_mission("mission-001".to_string()).unwrap();
        assert_eq!(att.mission_id, "mission-001");
        assert_eq!(att.verified_finding_count, 3);
        assert_eq!(att.result_hash, VALID_HASH);
    }

    #[test]
    #[should_panic(expected = "Mission 'mission-001' has already been attested")]
    fn test_record_duplicate_mission_panics() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission(
            "mission-001".to_string(),
            VALID_HASH.to_string(),
            VALID_HASH_2.to_string(),
            3,
        );
        contract.record_mission(
            "mission-001".to_string(),
            VALID_HASH.to_string(),
            VALID_HASH_2.to_string(),
            3,
        );
    }

    #[test]
    #[should_panic(expected = "Only the operator account may call this method")]
    fn test_non_operator_cannot_record_mission() {
        let operator = accounts(0);
        let non_operator = accounts(1);
        let mut contract = new_contract(operator);

        let context = get_context(non_operator);
        testing_env!(context.build());

        contract.record_mission(
            "mission-002".to_string(),
            VALID_HASH.to_string(),
            VALID_HASH_2.to_string(),
            1,
        );
    }

    #[test]
    #[should_panic(expected = "result_hash must be a 64-char hex SHA-256 digest")]
    fn test_invalid_hash_length_panics() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission(
            "mission-003".to_string(),
            "tooshort".to_string(),
            VALID_HASH_2.to_string(),
            1,
        );
    }

    #[test]
    fn test_get_mission_ids() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission("m-1".to_string(), VALID_HASH.to_string(), VALID_HASH_2.to_string(), 1);
        contract.record_mission("m-2".to_string(), VALID_HASH_2.to_string(), VALID_HASH.to_string(), 2);

        let ids = contract.get_mission_ids();
        assert_eq!(ids.len(), 2);
        assert_eq!(ids[0], "m-1");
        assert_eq!(ids[1], "m-2");
    }

    // ── Agent contributions ──────────────────────────────────────────────────

    #[test]
    fn test_record_agent_contribution_success() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission("m-1".to_string(), VALID_HASH.to_string(), VALID_HASH_2.to_string(), 2);
        contract.record_agent_contribution(
            "m-1".to_string(),
            "IdorAgent".to_string(),
            VALID_HASH.to_string(),
            2,
        );

        let contributions = contract.get_mission_contributions("m-1".to_string());
        assert_eq!(contributions.len(), 1);
        assert_eq!(contributions[0].agent_id, "IdorAgent");
        assert_eq!(contributions[0].findings_contributed, 2);
    }

    #[test]
    #[should_panic(expected = "Mission 'm-999' must be attested before recording agent contributions")]
    fn test_contribution_requires_existing_mission() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_agent_contribution(
            "m-999".to_string(),
            "IdorAgent".to_string(),
            VALID_HASH.to_string(),
            1,
        );
    }

    #[test]
    #[should_panic(expected = "Only the operator account may call this method")]
    fn test_non_operator_cannot_record_contribution() {
        let operator = accounts(0);
        let non_operator = accounts(1);
        let mut contract = new_contract(operator.clone());

        let context = get_context(operator);
        testing_env!(context.build());
        contract.record_mission("m-1".to_string(), VALID_HASH.to_string(), VALID_HASH_2.to_string(), 1);

        let context2 = get_context(non_operator);
        testing_env!(context2.build());
        contract.record_agent_contribution(
            "m-1".to_string(),
            "IdorAgent".to_string(),
            VALID_HASH.to_string(),
            1,
        );
    }

    // ── Reputation ───────────────────────────────────────────────────────────

    #[test]
    fn test_reputation_accumulates() {
        let operator = accounts(0);
        let mut contract = new_contract(operator.clone());
        let context = get_context(operator);
        testing_env!(context.build());

        contract.record_mission("m-1".to_string(), VALID_HASH.to_string(), VALID_HASH_2.to_string(), 5);
        contract.record_mission("m-2".to_string(), VALID_HASH_2.to_string(), VALID_HASH.to_string(), 3);

        contract.record_agent_contribution("m-1".to_string(), "XssAgent".to_string(), VALID_HASH.to_string(), 3);
        contract.record_agent_contribution("m-2".to_string(), "XssAgent".to_string(), VALID_HASH_2.to_string(), 2);

        assert_eq!(contract.get_agent_reputation("XssAgent".to_string()), 5);
    }

    #[test]
    fn test_unknown_agent_reputation_is_zero() {
        let contract = new_contract(accounts(0));
        assert_eq!(contract.get_agent_reputation("UnknownAgent".to_string()), 0);
    }

    #[test]
    fn test_unknown_mission_returns_none() {
        let contract = new_contract(accounts(0));
        assert!(contract.get_mission("does-not-exist".to_string()).is_none());
    }
}
