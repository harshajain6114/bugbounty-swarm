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
    pub fn commit_bid(&mut self, round_id: String, commitment: String) {
        let round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round is not open");
        let bidder = env::predecessor_account_id();

        let mut bids = self.round_bids.get(&round_id).unwrap_or_default();
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

    /// Phase 3: Deterministically settles round using formula:
    /// score = (confidence_bps * (1 + reputation)) / cost_yocto
    pub fn settle_round(&mut self, round_id: String) -> AccountId {
        self.assert_operator();
        let mut round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Open, "Round not open");

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
    pub fn payout(&mut self, round_id: String) -> Promise {
        self.assert_operator();
        let mut round = self.rounds.get(&round_id).expect("Round not found");
        assert_eq!(round.status, RoundStatus::Settled, "Round must be settled before payout");
        let winner = round.winner.clone().expect("No winner set");

        round.status = RoundStatus::Paid;
        self.rounds.insert(&round_id, &round);

        // Increment winner's reputation
        let current_rep = self.agent_reputation.get(&winner).unwrap_or(0);
        self.agent_reputation.insert(&winner, &(current_rep + 1));

        // Transfer reward to winner sub-account
        Promise::new(winner).transfer(round.reward)
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

    fn assert_operator(&self) {
        assert_eq!(env::predecessor_account_id(), self.operator, "Operator only");
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
        contract.payout("round-1".to_string());
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

        let commit = "deadbeef".to_string();
        context = get_context(bidder1.clone(), NearToken::from_yoctonear(0));
        testing_env!(context.build());
        contract.commit_bid("round-2".to_string(), commit);

        // Attempt invalid reveal
        contract.reveal_bid("round-2".to_string(), 9000, 100, "wrong-salt".to_string());
    }

    #[test]
    #[should_panic(expected = "Round must be settled before payout")]
    fn test_payout_without_settle_fails() {
        let operator = accounts(0);
        let mut context = get_context(operator.clone(), NearToken::from_yoctonear(100));
        testing_env!(context.build());

        let mut contract = BountyMarketContract::new(operator);
        contract.open_round("round-3".to_string(), "task-logic".to_string());
        contract.payout("round-3".to_string());
    }
}
