/**
 * apps/server/src/near/market-types.ts
 *
 * Data structures for the Swarm Bounty Market auction layer.
 */

export interface MarketBidStrategy {
  agentId: string;
  account: string;
  confidenceBps: number;
  costYocto: string;
  salt: string;
}

/**
 * agent_key        — signed by the agent's own sub-account function-call key
 * missing_key      — agent had no key; its bid was NOT submitted (no operator fallback)
 * local_simulation — no testnet credentials; nothing was signed or sent
 */
export type BidSigningMode = "agent_key" | "missing_key" | "local_simulation";

export interface MarketRoundResult {
  roundId: string;
  taskId: string;
  taskName: string;
  rewardNear: string;
  openTxHash?: string;
  winnerAccount: string;
  winnerAgentId?: string;
  winnerScore: string;
  /** on_chain_settle = read back from get_round after settle_round; unsettled = chain settle failed */
  winnerSource?: "on_chain_settle" | "unsettled" | "local_simulation";
  allBids: {
    agentId: string;
    account: string;
    confidenceBps: number;
    costYocto: string;
    reputation?: number;
    revealed: boolean;
    score: number;
    commitTxHash?: string;
    revealTxHash?: string;
    relayed?: boolean;
    signingMode?: BidSigningMode;
  }[];
  commitTxHashes?: Record<string, string>;
  revealTxHashes?: Record<string, string>;
  settleTxHash?: string;
  payoutTxHash?: string;
  payoutStatus: "not_configured" | "simulated" | "pending" | "confirmed" | "failed" | "refunded";
  errors?: string[];
}

export interface SwarmMarketState {
  marketContract: string;
  rounds: MarketRoundResult[];
  reputation: Record<string, number>;
}
