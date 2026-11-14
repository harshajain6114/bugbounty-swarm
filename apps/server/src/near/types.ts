/**
 * apps/server/src/near/types.ts
 *
 * TypeScript interfaces for the NEAR Protocol blockchain integration layer.
 * TESTNET ONLY — never reference mainnet.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface NearConfig {
  networkId: string;
  rpcUrl: string;
  accountId: string;
  contractId: string;
  /** Private key in NEAR ed25519 format: "ed25519:BASE58KEY" — NEVER log this */
  privateKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// On-chain record mirrors (match Rust contract structs)
// ─────────────────────────────────────────────────────────────────────────────

export interface NearMissionAttestation {
  missionId: string;
  resultHash: string;
  findingsHash: string;
  verifiedFindingCount: number;
  timestampMs: number;
  submittedBy: string;
}

export interface NearAgentContribution {
  agentId: string;
  contributionHash: string;
  findingsContributed: number;
  missionId: string;
  timestampMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction tracking
// ─────────────────────────────────────────────────────────────────────────────

export type NearTxStatus = "confirmed" | "pending" | "failed";

export interface NearTxRecord {
  txHash: string;
  status: NearTxStatus;
  blockHash?: string;
  confirmationMs?: number;
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mission attestation result — stored in MissionResult.nearAttestation
// ─────────────────────────────────────────────────────────────────────────────

export interface NearMissionRecord {
  status: NearTxStatus;
  contractId: string;
  networkId: string;
  missionId: string;
  resultHash: string;
  findingsHash: string;
  verifiedFindingCount: number;
  missionTxHash?: string;
  missionTxStatus?: NearTxStatus;
  contributionTxHashes?: string[];
  contributionTxStatuses?: NearTxStatus[];
  explorerUrl?: string;
  attestedAt?: string;
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Input to the NEAR client submit call
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmitAttestationParams {
  missionId: string;
  resultHash: string;
  findingsHash: string;
  verifiedFindingCount: number;
  agentContributions: AgentContributionInput[];
}

export interface AgentContributionInput {
  agentId: string;
  contributionHash: string;
  findingsContributed: number;
}
