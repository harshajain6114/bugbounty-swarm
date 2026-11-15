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
  /** near_ai_tee_verified = set by the agent's verified NEAR AI Cloud completion */
  confidenceSource?: "near_ai_tee_verified" | "scripted";
  aiChatId?: string;
  aiSigningAddress?: string;
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
  /** How the escrow amount was set (NEAR Intents 1Click dry quote, or fixed fallback) */
  bountyPricing?: import("./intents-pricer.js").BountyPricing;
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
    confidenceSource?: "near_ai_tee_verified" | "scripted";
    aiChatId?: string;
    aiSigningAddress?: string;
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
  /** Pre-payout audit performed through the NEAR MCP server (see mcp-auditor.ts) */
  mcpAudit?: {
    approved: boolean;
    source: "near-mcp";
    roundStatus?: string;
    onChainWinner?: string;
    winnerMatches: boolean;
    winnerBidKey?: string;
    winnerKeyScoped: boolean;
    reasons: string[];
    auditedAt: string;
  };
  /**
   * Which operator key signed each step. open_round attaches a deposit, so it
   * needs the full-access key; settle/payout/refund use a FunctionCall key
   * scoped to those methods on the market when provisioned.
   */
  operatorKeyModes?: {
    open?: "full_access_key";
    settle?: "function_call_key" | "full_access_key";
    release?: "function_call_key" | "full_access_key";
  };
  payoutStatus: "not_configured" | "simulated" | "pending" | "confirmed" | "failed" | "refunded";
  errors?: string[];
}

export interface SwarmMarketState {
  marketContract: string;
  rounds: MarketRoundResult[];
  reputation: Record<string, number>;
}
