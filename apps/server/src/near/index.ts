/**
 * apps/server/src/near/index.ts
 *
 * Public API for the NEAR Protocol integration layer.
 */

export type {
  NearConfig,
  NearMissionAttestation,
  NearAgentContribution,
  NearMissionRecord,
  NearTxRecord,
  NearTxStatus,
  SubmitAttestationParams,
  AgentContributionInput,
} from "./types.js";

export {
  hashMissionResult,
  hashFinding,
  hashFindings,
  hashAgentFindings,
} from "./hasher.js";

export {
  loadNearConfig,
  NearClient,
  createNearClient,
} from "./near-client.js";

export { MarketCoordinator } from "./market-coordinator.js";
export type { MarketBidStrategy, MarketRoundResult, SwarmMarketState } from "./market-types.js";
