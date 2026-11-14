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

export interface MarketRoundResult {
  roundId: string;
  taskId: string;
  taskName: string;
  rewardNear: string;
  openTxHash?: string;
  winnerAccount: string;
  winnerScore: string;
  allBids: {
    agentId: string;
    account: string;
    confidenceBps: number;
    costYocto: string;
    revealed: boolean;
    score: number;
  }[];
  settleTxHash?: string;
  payoutTxHash?: string;
  payoutStatus: "confirmed" | "refunded" | "local_only";
}

export interface SwarmMarketState {
  marketContract: string;
  rounds: MarketRoundResult[];
  reputation: Record<string, number>;
}
