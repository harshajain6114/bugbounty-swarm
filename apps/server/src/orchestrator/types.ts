/**
 * apps/server/src/orchestrator/types.ts
 *
 * Data contracts and structures for the BUGBOUNTY SWARM Mission Orchestrator.
 */

import type { ReconResult, ReconSummary } from "../agents/recon/types.js";
import type { IDORFinding, IDORMissionResult } from "../agents/idor/types.js";
import type { XSSFinding, XSSMissionResult } from "../agents/xss/types.js";
import type {
  BusinessLogicFinding,
  BusinessLogicMissionResult,
} from "../agents/business-logic/types.js";

export type RawFinding = IDORFinding | XSSFinding | BusinessLogicFinding;

export interface AgentExecutionRecord {
  agentName: "ReconAgent" | "IdorAgent" | "XssAgent" | "BusinessLogicAgent";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "completed" | "failed" | "skipped";
  findingsCount: number;
  error?: string;
}

export interface OrchestratorOptions {
  target?: string;
  missionId?: string;
  outputFilePath?: string;
  headless?: boolean;
  timeoutMs?: number;
}

export interface VerifiedFinding {
  findingId: string;
  originalFindingId: string;
  sourceAgent: "IdorAgent" | "XssAgent" | "BusinessLogicAgent";
  vulnerabilityType: string;
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  affectedEndpoint: string;
  affectedPages?: string[];
  verificationStatus: "VERIFIED_CONFIRMED";
  verificationRationale: string;
  testedInputsCount: number;
  evidence: Record<string, unknown>;
  reproductionSteps: string[];
  remediation: string;
  timestamp: string;
}

export interface RejectedFinding {
  originalFindingId: string;
  sourceAgent: string;
  vulnerabilityType: string;
  reason: string;
  rawFinding: Record<string, unknown>;
}

export interface DeduplicationSummary {
  rawFindingsCount: number;
  deduplicatedCount: number;
  distinctRootCauses: number;
  details: string[];
}

export interface MissionSummary {
  totalDiscoveredPages: number;
  totalDiscoveredEndpoints: number;
  totalDiscoveredForms: number;
  totalAgentsRun: number;
  totalRawFindings: number;
  totalVerifiedVulnerabilities: number;
  totalRejectedFindings: number;
  totalTestedInputs: number;
  allAgentsSucceeded: boolean;
}

export interface NearAttestationRecord {
  status: "confirmed" | "pending" | "failed" | "skipped";
  contractId?: string;
  networkId?: string;
  missionId?: string;
  resultHash?: string;
  findingsHash?: string;
  verifiedFindingCount?: number;
  missionTxHash?: string;
  missionTxStatus?: "confirmed" | "pending" | "failed";
  contributionTxHashes?: string[];
  contributionTxStatuses?: ("confirmed" | "pending" | "failed")[];
  explorerUrl?: string;
  attestedAt?: string;
  errorMessage?: string;
}

export interface MissionResult {
  missionId: string;
  target: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  reconSummary: ReconSummary;
  agentsExecuted: AgentExecutionRecord[];
  agentResults: {
    recon?: ReconResult;
    idor?: IDORMissionResult;
    xss?: XSSMissionResult;
    businessLogic?: BusinessLogicMissionResult;
  };
  allFindings: RawFinding[];
  verifiedFindings: VerifiedFinding[];
  rejectedFindings: RejectedFinding[];
  deduplicationSummary: DeduplicationSummary;
  summary: MissionSummary;
  metadata: {
    orchestratorVersion: "1.0.0";
    targetScope: string;
    completedAt: string;
  };
  /** NEAR blockchain attestation record — present when NEAR is configured */
  nearAttestation?: NearAttestationRecord;
  /** Swarm Bounty Market auction rounds data */
  marketRounds?: import("../near/market-types.js").MarketRoundResult[];
  /** Per-agent NEAR AI Cloud bid reasoning with TEE signature/attestation verification */
  aiBidAdvice?: import("../agents/bid-advisor.js").AgentBidAdvice[];
}

export interface MissionSummaryItem {
  missionId: string;
  target: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  durationMs: number;
  verifiedVulnerabilitiesCount: number;
  agentsRunCount: number;
}
