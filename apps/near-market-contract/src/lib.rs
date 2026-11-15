/*!
 * BugBounty Swarm — Market Auction Smart Contract (NEAR Testnet)
 *
 * Implements a commit-reveal auction for autonomous security agents.
 * Winners are deterministically chosen based on:
 *   Score = (confidence_bps * (1 + reputation)) / cost_yocto
 * Payout is strictly gated by post-execution independent verification.
 */

use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::{env, near, AccountId, NearToken, PanicOnDefault, Promise};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum RoundStatus {
    Open,
    Settled,
    Paid,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Bid {
    pub bidder: AccountId,
    pub commitment: String,
    pub confidence_bps: Option<u32>,
    pub cost_yocto: Option<u128>,
    pub salt: Option<String>,
    pub revealed: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct BountyRound {
    pub round_id: String,
    pub task_id: String,
    pub reward: NearToken,
    pub status: RoundStatus,
    pub winner: Option<AccountId>,
    pub operator: AccountId,
    pub created_at_ms: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BountyMarketContract {
    pub operator: AccountId,
    pub rounds: UnorderedMap<String, BountyRound>,
    pub round_bids: LookupMap<String, Vec<Bid>>,
    pub agent_reputation: UnorderedMap<AccountId, u64>,
}

#[near]
impl BountyMarketContract {
    #[init]
    pub fn new(operator: AccountId) -> Self {
        assert!(!env::state_exists(), "Already initialized");
        Self {
            operator,
            rounds: UnorderedMap::new(b"r"),
            round_bids: LookupMap::new(b"b"),
            agent_reputation: UnorderedMap::new(b"p"),
        }
    }

    /// Opens a new auction round with escrowed reward attached.
    #[payable]
    pub fn open_round(&mut self, round_id: String, task_id: String) {
        self.assert_operator();
        assert!(self.rounds.get(&round_id).is_none(), "Round already exists");
        let reward = env::attached_deposit();
        assert!(reward.as_yoctonear() > 0, "Reward must be > 0");

        let round = BountyRound {
            round_id: round_id.clone(),
            task_id,
            reward,
            status: RoundStatus::Open,
            winner: None,
            operator: self.operator.clone(),
            created_at_ms: env::block_timestamp_ms(),
        };

        self.rounds.insert(&round_id, &round);
        self.round_bids.insert(&round_id, &Vec::new());
    }

    /// Phase 1: Submit commit hash = sha256(agentId|taskId|confidence_bps|cost_yocto|salt)
    /// Only allowed while the round is in its COMMIT phase (before start_reveal).
    pub fn commit_bid(&mut self, round_id: String, commitment: String) {
        let round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round is not open");
        assert!(!Self::reveal_started(&round_id), "Commit phase closed");
        assert!(
            commitment.len() == 64 && commitment.chars().all(|c| c.is_ascii_hexdigit()),
            "Commitment must be 64 hex chars (sha256)"
        );
        let bidder = env::predecessor_account_id();

        let mut bids = self.round_bids.get(&round_id).unwrap_or_default();
        assert!(bids.len() < MAX_BIDS_PER_ROUND, "Round is full");
        assert!(!bids.iter().any(|b| b.bidder == bidder), "Bidder already committed");

        bids.push(Bid {
            bidder,
            commitment,
            confidence_bps: None,
            cost_yocto: None,
            salt: None,
            revealed: false,
        });

        self.round_bids.insert(&round_id, &bids);
    }

    /// Phase 2: Reveal bid values; contract cryptographically validates pre-image.
    pub fn reveal_bid(
        &mut self,
        round_id: String,
        confidence_bps: u32,
        cost_yocto: u128,
        salt: String,
    ) {
        let round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round is not open");
        assert!(Self::reveal_started(&round_id), "Reveal phase not open");
        assert!(confidence_bps <= 10000, "Confidence bps max 10000");
        assert!(cost_yocto > 0, "Cost must be > 0");

        let bidder = env::predecessor_account_id();
        let mut bids = self.round_bids.get(&round_id).expect("No bids for round");

        let bid = bids.iter_mut().find(|b| b.bidder == bidder).expect("Commitment not found");
        assert!(!bid.revealed, "Already revealed");

        // Verify sha256(agentId|taskId|confidence_bps|cost_yocto|salt)
        let preimage = format!("{}|{}|{}|{}|{}", bidder, round.task_id, confidence_bps, cost_yocto, salt);
        let hash_bytes = env::sha256(preimage.as_bytes());
        let computed_commitment = hex::encode(hash_bytes);

        assert_eq!(computed_commitment, bid.commitment, "Invalid reveal hash");

        bid.confidence_bps = Some(confidence_bps);
        bid.cost_yocto = Some(cost_yocto);
        bid.salt = Some(salt);
        bid.revealed = true;

        self.round_bids.insert(&round_id, &bids);
    }

    /// Phase 2a: Close commits and open reveals. After this no new commitment
    /// can be added, so a bidder cannot commit after seeing others' reveals.
    pub fn start_reveal(&mut self, round_id: String) {
        self.assert_operator();
        let round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round not open");
        assert!(!Self::reveal_started(&round_id), "Reveal already started");
        env::storage_write(&Self::phase_key(&round_id), &env::block_timestamp_ms().to_le_bytes());
    }

    /// Phase 3: Deterministically settles round using formula:
    /// score = (confidence_bps * (1 + reputation)) / cost_yocto
    pub fn settle_round(&mut self, round_id: String) -> AccountId {
        self.assert_operator();
        let mut round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round not open");
        assert!(Self::reveal_started(&round_id), "Reveal phase not started");

        let bids = self.round_bids.get(&round_id).expect("No bids");
        let revealed_bids: Vec<&Bid> = bids.iter().filter(|b| b.revealed).collect();
        assert!(!revealed_bids.is_empty(), "No revealed bids to settle");

        let mut best_bidder: Option<AccountId> = None;
        let mut highest_score: u128 = 0;

        for b in revealed_bids {
            let rep = self.agent_reputation.get(&b.bidder).unwrap_or(0);
            let conf = b.confidence_bps.unwrap() as u128;
            let cost = b.cost_yocto.unwrap();
            // Score = (conf * (1 + rep) * 1e12) / cost to retain precision
            let score = (conf * (1 + rep as u128) * 1_000_000_000_000) / cost;

            if best_bidder.is_none() || score > highest_score {
                highest_score = score;
                best_bidder = Some(b.bidder.clone());
            } else if score == highest_score {
                // Lexicographical tie break
                if let Some(ref current) = best_bidder {
                    if b.bidder < *current {
                        best_bidder = Some(b.bidder.clone());
                    }
                }
            }
        }

        let winner = best_bidder.expect("No winner determined");
        round.winner = Some(winner.clone());
        round.status = RoundStatus::Settled;
        self.rounds.insert(&round_id, &round);

        winner
    }

    /// Phase 4: Gated payout executed only after finding confirmation.
    /// `proof_hash` = sha256 of the independently replay-verified finding(s);
    /// it is stored on-chain permanently (see get_round_proof) so the payout
    /// is bound to a specific verification record anyone can re-hash.
    pub fn payout(&mut self, round_id: String, proof_hash: String) -> Promise {
        self.assert_operator();
        Self::assert_proof_hash(&proof_hash);
        let mut round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Settled, "Round must be settled before payout");
        let winner = round.winner.clone().expect("No winner set");

        round.status = RoundStatus::Paid;
        self.rounds.insert(&round_id, &round);
        env::storage_write(&Self::proof_key(&round_id), proof_hash.as_bytes());

        // Increment winner's reputation
        let current_rep = self.agent_reputation.get(&winner).unwrap_or(0);
        self.agent_reputation.insert(&winner, &(current_rep + 1));

        // Transfer reward to winner sub-account
        Promise::new(winner).transfer(round.reward)
    }

    /// Phase 4b: Refund round to operator when independent finding verification fails.
    /// Returns the escrowed reward back to operator without modifying agent reputation.
    /// `proof_hash` = sha256 of the replay-verification rejection record.
    pub fn refund_round(&mut self, round_id: String, proof_hash: String) -> Promise {
        self.assert_operator();
        Self::assert_proof_hash(&proof_hash);
        let mut round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Settled, "Round must be settled before refund");

        round.status = RoundStatus::Refunded;
        self.rounds.insert(&round_id, &round);
        env::storage_write(&Self::proof_key(&round_id), proof_hash.as_bytes());

        // Refund escrow back to operator
        Promise::new(self.operator.clone()).transfer(round.reward)
    }

    // ── Public View Methods ──────────────────────────────────────────────────

    pub fn get_round(&self, round_id: String) -> Option<BountyRound> {
        self.rounds.get(&round_id)
    }

    pub fn get_round_bids(&self, round_id: String) -> Vec<Bid> {
        self.round_bids.get(&round_id).unwrap_or_default()
    }

    pub fn get_agent_reputation(&self, agent: AccountId) -> u64 {
        self.agent_reputation.get(&agent).unwrap_or(0)
    }

    pub fn get_operator(&self) -> AccountId {
        self.operator.clone()
    }

    /// Verification proof hash recorded at payout / refund, if any.
    pub fn get_round_proof(&self, round_id: String) -> Option<String> {
        env::storage_read(&Self::proof_key(&round_id)).map(|b| String::from_utf8(b).unwrap_or_default())
    }

    /// "commit" until start_reveal is called, then "reveal".
    pub fn get_round_phase(&self, round_id: String) -> String {
        if Self::reveal_started(&round_id) { "reveal".to_string() } else { "commit".to_string() }
    }

    fn assert_operator(&self) {
        assert_eq!(env::predecessor_account_id(), self.operator, "Operator only");
    }

    // Phase flags and proofs live under raw storage keys (not new struct
    // fields) so the contract upgrades in place without a state migration.
    fn phase_key(round_id: &str) -> Vec<u8> {
        [b"ph:".as_slice(), round_id.as_bytes()].concat()
    }

    fn proof_key(round_id: &str) -> Vec<u8> {
        [b"pf:".as_slice(), round_id.as_bytes()].concat()
    }

    fn reveal_started(round_id: &str) -> bool {
        env::storage_has_key(&Self::phase_key(round_id))
    }

    fn assert_proof_hash(proof_hash: &str) {
        assert!(
            proof_hash.len() == 64 && proof_hash.chars().all(|c| c.is_ascii_hexdigit()),
            "proof_hash must be 64 hex chars (sha256)"
        );
    }
}

const MAX_BIDS_PER_ROUND: usize = 16;

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const PROOF: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    fn get_context(predecessor: AccountId, deposit: NearToken) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder.attached_deposit(deposit);
        builder
    }

    #[test]
    fn test_market_flow_with_commit_reveal_and_settle() {
        let operator = accounts(0);
        let bidder1 = accounts(1);
        let bidder2 = accounts(2);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000)); // 0.01 NEAR
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-1".to_string(), "task-access-control".to_string());

        // Bidder 1 commitments
        let salt1 = "salt123".to_string();
        let pre1 = format!("{}|task-access-control|9000|1000000000|{}", bidder1, salt1);
        let commit1 = hex::encode(near_sdk::env::sha256(pre1.as_bytes()));

        context = get_context(bidder1.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-1".to_string(), commit1);

        // Bidder 2 commitments
        let salt2 = "salt456".to_string();
        let pre2 = format!("{}|task-access-control|5000|500000000|{}", bidder2, salt2);
        let commit2 = hex::encode(near_sdk::env::sha256(pre2.as_bytes()));

        context = get_context(bidder2.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-1".to_string(), commit2);

        // Reveals
        context = get_context(bidder1.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-1".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-1".to_string(), 9000, 1000000000, salt1);

        context = get_context(bidder2.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.reveal_bid("round-1".to_string(), 5000, 500000000, salt2);

        // Settle as operator
        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        let winner = contract.settle_round("round-1".to_string());

        // Score 1 = (9000 * 1 * 1e12) / 1e9 = 9e6
        // Score 2 = (5000 * 1 * 1e12) / 5e8 = 10e6 (bidder 2 has higher efficiency score!)
        assert_eq!(winner, bidder2);

        // Payout to winner
        let _ = contract.payout("round-1".to_string(), PROOF.to_string());
        assert_eq!(contract.get_agent_reputation(bidder2), 1);
    }

    #[test]
    #[should_panic(expected = "Invalid reveal hash")]
    fn test_invalid_reveal_fails() {
        let operator = accounts(0);
        let bidder1 = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(100));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator);
        contract.open_round("round-2".to_string(), "task-injection".to_string());

        let commit = "ab".repeat(32); // well-formed sha256 hex that matches no preimage
        context = get_context(bidder1.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-2".to_string(), commit);

        // Attempt invalid reveal
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-2".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-2".to_string(), 9000, 100, "wrong-salt".to_string());
    }

    #[test]
    #[should_panic(expected = "Operator only")]
    fn test_non_operator_payout_rejected() {
        let operator = accounts(0);
        let non_operator = accounts(1);
        let bidder = accounts(2);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-nop".to_string(), "task-test".to_string());

        // Commit and reveal as bidder
        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-nop".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-nop".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-nop".to_string(), 9000, 1000000000, salt);

        // Settle as operator
        context = get_context(operator, NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-nop".to_string());

        // Attempt payout as non-operator -> MUST PANIC
        context = get_context(non_operator, NearToken::from_yoctonear(0));
        testing_env!(context.build());
        let _ = contract.payout("round-nop".to_string(), PROOF.to_string());
    }

    #[test]
    #[should_panic(expected = "Round must be settled before payout")]
    fn test_duplicate_payout_rejected() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-dup".to_string(), "task-test".to_string());

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-dup".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-dup".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-dup".to_string(), 9000, 1000000000, salt);

        // Settle as operator
        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-dup".to_string());

        // First payout succeeds
        let _ = contract.payout("round-dup".to_string(), PROOF.to_string());

        // Duplicate payout -> MUST PANIC
        let _ = contract.payout("round-dup".to_string(), PROOF.to_string());
    }

    #[test]
    fn test_reputation_increments_after_payout() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-rep".to_string(), "task-test".to_string());

        assert_eq!(contract.get_agent_reputation(bidder.clone()), 0);

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-rep".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-rep".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-rep".to_string(), 9000, 1000000000, salt);

        // Settle as operator
        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-rep".to_string());

        // Payout increments reputation
        let _ = contract.payout("round-rep".to_string(), PROOF.to_string());
        assert_eq!(contract.get_agent_reputation(bidder.clone()), 1);
    }

    #[test]
    #[should_panic(expected = "Round must be settled before refund")]
    fn test_refund_once() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-ref-once".to_string(), "task-test".to_string());

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-ref-once".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-ref-once".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-ref-once".to_string(), 9000, 1000000000, salt);

        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-ref-once".to_string());

        // First refund succeeds
        let _ = contract.refund_round("round-ref-once".to_string(), PROOF.to_string());
        assert_eq!(contract.get_round("round-ref-once".to_string()).unwrap().status, RoundStatus::Refunded);

        // Duplicate refund -> MUST PANIC
        let _ = contract.refund_round("round-ref-once".to_string(), PROOF.to_string());
    }

    #[test]
    #[should_panic(expected = "Round must be settled before refund")]
    fn test_no_refund_after_payout() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-pay-then-ref".to_string(), "task-test".to_string());

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-pay-then-ref".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-pay-then-ref".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-pay-then-ref".to_string(), 9000, 1000000000, salt);

        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-pay-then-ref".to_string());

        // Payout succeeds
        let _ = contract.payout("round-pay-then-ref".to_string(), PROOF.to_string());

        // Attempt refund after payout -> MUST PANIC
        let _ = contract.refund_round("round-pay-then-ref".to_string(), PROOF.to_string());
    }

    #[test]
    #[should_panic(expected = "Round must be settled before payout")]
    fn test_no_payout_after_refund() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-ref-then-pay".to_string(), "task-test".to_string());

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-ref-then-pay".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-ref-then-pay".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-ref-then-pay".to_string(), 9000, 1000000000, salt);

        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-ref-then-pay".to_string());

        // Refund succeeds
        let _ = contract.refund_round("round-ref-then-pay".to_string(), PROOF.to_string());

        // Attempt payout after refund -> MUST PANIC
        let _ = contract.payout("round-ref-then-pay".to_string(), PROOF.to_string());
    }

    #[test]
    #[should_panic(expected = "Operator only")]
    fn test_non_operator_refund_rejected() {
        let operator = accounts(0);
        let non_operator = accounts(1);
        let bidder = accounts(2);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-nonop-ref".to_string(), "task-test".to_string());

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-nonop-ref".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-nonop-ref".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-nonop-ref".to_string(), 9000, 1000000000, salt);

        context = get_context(operator, NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-nonop-ref".to_string());

        // Attempt refund as non-operator -> MUST PANIC
        context = get_context(non_operator, NearToken::from_yoctonear(0));
        testing_env!(context.build());
        let _ = contract.refund_round("round-nonop-ref".to_string(), PROOF.to_string());
    }

    #[test]
    fn test_reputation_unchanged_on_refund() {
        let operator = accounts(0);
        let bidder = accounts(1);

        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(10_000_000_000_000_000_000_000));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator.clone());
        contract.open_round("round-rep-unchanged".to_string(), "task-test".to_string());

        assert_eq!(contract.get_agent_reputation(bidder.clone()), 0);

        let salt = "salt".to_string();
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        let commit = hex::encode(near_sdk::env::sha256(pre.as_bytes()));

        context = get_context(bidder.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-rep-unchanged".to_string(), commit);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("round-rep-unchanged".to_string());
        testing_env!(context.build());
        contract.reveal_bid("round-rep-unchanged".to_string(), 9000, 1000000000, salt);

        // Settle as operator
        context = get_context(operator.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.settle_round("round-rep-unchanged".to_string());

        // Refund round
        let _ = contract.refund_round("round-rep-unchanged".to_string(), PROOF.to_string());

        // Reputation must still be 0
        assert_eq!(contract.get_agent_reputation(bidder.clone()), 0);
        assert_eq!(contract.get_round("round-rep-unchanged".to_string()).unwrap().status, RoundStatus::Refunded);
    }

    /// Opens a round and commits one valid bid for `bidder`; returns the salt.
    fn setup_committed(contract: &mut BountyMarketContract, round: &str, bidder: &AccountId) -> String {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(10_000_000_000_000_000_000_000)).build());
        contract.open_round(round.to_string(), "task-test".to_string());
        let salt = "s".repeat(64);
        let pre = format!("{}|task-test|9000|1000000000|{}", bidder, salt);
        testing_env!(get_context(bidder.clone(), NearToken::from_yoctonear(0)).build());
        contract.commit_bid(round.to_string(), hex::encode(near_sdk::env::sha256(pre.as_bytes())));
        salt
    }

    #[test]
    #[should_panic(expected = "Commit phase closed")]
    fn test_commit_after_reveal_started_rejected() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        setup_committed(&mut contract, "r-late", &accounts(1));
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("r-late".to_string());
        // A second bidder tries to commit after reveals opened -> MUST PANIC
        testing_env!(get_context(accounts(2), NearToken::from_yoctonear(0)).build());
        contract.commit_bid("r-late".to_string(), "cd".repeat(32));
    }

    #[test]
    #[should_panic(expected = "Reveal phase not open")]
    fn test_reveal_before_phase_rejected() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        let salt = setup_committed(&mut contract, "r-early", &accounts(1));
        contract.reveal_bid("r-early".to_string(), 9000, 1000000000, salt);
    }

    #[test]
    #[should_panic(expected = "Reveal phase not started")]
    fn test_settle_before_reveal_rejected() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        setup_committed(&mut contract, "r-settle", &accounts(1));
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.settle_round("r-settle".to_string());
    }

    #[test]
    #[should_panic(expected = "Commitment must be 64 hex chars")]
    fn test_malformed_commitment_rejected() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(10_000_000_000_000_000_000_000)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        contract.open_round("r-bad".to_string(), "task-test".to_string());
        testing_env!(get_context(accounts(1), NearToken::from_yoctonear(0)).build());
        contract.commit_bid("r-bad".to_string(), "x".repeat(5000));
    }

    #[test]
    fn test_proof_hash_recorded_and_phase_reported() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        let bidder = accounts(1);
        let salt = setup_committed(&mut contract, "r-proof", &bidder);
        assert_eq!(contract.get_round_phase("r-proof".to_string()), "commit");
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("r-proof".to_string());
        assert_eq!(contract.get_round_phase("r-proof".to_string()), "reveal");
        testing_env!(get_context(bidder.clone(), NearToken::from_yoctonear(0)).build());
        contract.reveal_bid("r-proof".to_string(), 9000, 1000000000, salt);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.settle_round("r-proof".to_string());
        assert_eq!(contract.get_round_proof("r-proof".to_string()), None);
        let _ = contract.payout("r-proof".to_string(), PROOF.to_string());
        assert_eq!(contract.get_round_proof("r-proof".to_string()), Some(PROOF.to_string()));
    }

    #[test]
    #[should_panic(expected = "proof_hash must be 64 hex chars")]
    fn test_payout_requires_proof_hash() {
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        let mut contract = BountyMarketContract::new(accounts(0));
        let salt = setup_committed(&mut contract, "r-noproof", &accounts(1));
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.start_reveal("r-noproof".to_string());
        testing_env!(get_context(accounts(1), NearToken::from_yoctonear(0)).build());
        contract.reveal_bid("r-noproof".to_string(), 9000, 1000000000, salt);
        testing_env!(get_context(accounts(0), NearToken::from_yoctonear(0)).build());
        contract.settle_round("r-noproof".to_string());
        let _ = contract.payout("r-noproof".to_string(), "".to_string());
    }
}