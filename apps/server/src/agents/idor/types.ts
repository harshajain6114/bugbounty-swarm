/**
 * apps/server/src/agents/idor/types.ts
 *
 * Data contracts and structured findings for the IDOR / BOLA Security Agent.
 */

import type { ReconResult, DiscoveredEndpoint } from "../recon/types.js";

export interface IDORAgentOptions {
  missionId?: string;
  outputFilePath?: string;
  targetScope?: string; // Default: "http://localhost:4000/shop"
  aliceCredentials?: {
    email: string;
    password: string;
  };
  bobCredentials?: {
    email: string;
    password: string;
  };
}

export interface IDORCandidate {
  endpoint: DiscoveredEndpoint;
  parameterName: string;
  parameterIn: "path" | "query" | "body";
  reason: string;
  resourceType: string;
}

export interface SkippedEndpoint {
  path: string;
  method: string;
  reason: string;
}

export interface UserResourceProfile {
  user: {
    id: string;
    email: string;
    name: string;
  };
  discoveredResourceIds: string[];
}

export interface IDOREvidence {
  authenticatedUser: {
    id: string;
    email: string;
    name: string;
  };
  resourceOwner: {
    id: string;
    email: string;
    name: string;
  };
  aliceOwnResource: {
    resourceId: string;
    httpStatus: number;
    responseBody: Record<string, unknown>;
  };
  crossUserAccessAttempt: {
    targetResourceId: string;
    httpStatus: number;
    responseBody: Record<string, unknown>;
  };
  ownershipComparison: {
    expectedOwnerId: string;
    actualOwnerInResponse: string | null;
    crossUserLeakageConfirmed: boolean;
    leakedFields: string[];
  };
}

export interface IDORFinding {
  findingId: string;
  vulnerabilityType: "Insecure Direct Object Reference (IDOR / BOLA)";
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  affectedEndpoint: string;
  httpMethod: string;
  authenticatedUser: string;
  resourceOwner: string;
  testResult: "VULNERABILITY_CONFIRMED" | "ACCESS_DENIED_SECURE" | "INCONCLUSIVE";
  reproducible: boolean;
  evidence: IDOREvidence;
  reproductionSteps: string[];
  remediation: string;
  timestamp: string;
}

export interface IDORMissionResult {
  missionId: string;
  target: string;
  status: "completed" | "failed";
  summary: {
    totalDiscoveredEndpoints: number;
    candidateEndpointsEvaluated: number;
    skippedEndpointsCount: number;
    vulnerabilitiesConfirmed: number;
    durationMs: number;
  };
  candidatesEvaluated: string[];
  skippedEndpoints: SkippedEndpoint[];
  findings: IDORFinding[];
  errors: string[];
  metadata: {
    agentName: "IdorAgent";
    agentVersion: "1.0.0";
    completedAt: string;
    targetScope: string;
  };
}
