/**
 * apps/server/src/agents/business-logic/types.ts
 *
 * Data contracts and findings structures for the Business Logic /
 * Price Manipulation Specialist Agent.
 */

export interface BusinessLogicAgentOptions {
  missionId?: string;
  outputFilePath?: string;
  targetScope?: string; // Default: "http://localhost:4000/shop"
  credentials?: {
    email: string;
    password: string;
  };
  timeoutMs?: number;
}

export interface BusinessLogicCandidate {
  endpoint: string;
  method: string;
  authRequired: boolean;
  rationale: string;
}

export interface SkippedEndpoint {
  endpoint: string;
  method: string;
  reason: string;
}

export interface PriceManipulationEvidence {
  targetEndpoint: string;
  productId: string;
  productName: string;
  canonicalCatalogPriceCents: number;
  clientSubmittedPriceCents: number;
  serverRecordedPriceCents: number;
  serverRecordedTotalCents: number;
  priceUnderchargeCents: number;
  createdOrderId: string;
  httpStatus: number;
  requestPayload: {
    items: {
      productId: string;
      quantity: number;
      price: number;
    }[];
  };
  responseSnippet: Record<string, unknown>;
  vulnerabilityConfirmed: boolean;
}

export interface BusinessLogicFinding {
  findingId: string;
  vulnerabilityType: "Business Logic Flaw: Client-Side Price Manipulation";
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  affectedEndpoint: string;
  testResult: "VULNERABILITY_CONFIRMED" | "NOT_REPRODUCED" | "INCONCLUSIVE";
  reproducible: boolean;
  evidence: PriceManipulationEvidence;
  reproductionSteps: string[];
  remediation: string;
  timestamp: string;
}

export interface BusinessLogicMissionResult {
  missionId: string;
  target: string;
  status: "completed" | "failed";
  summary: {
    totalDiscoveredEndpoints: number;
    checkoutCandidatesEvaluated: number;
    skippedEndpointsCount: number;
    vulnerabilitiesConfirmed: number;
    priceDiscrepancyCents: number;
    durationMs: number;
  };
  candidatesEvaluated: BusinessLogicCandidate[];
  skippedEndpoints: SkippedEndpoint[];
  findings: BusinessLogicFinding[];
  errors: string[];
  metadata: {
    agentName: "BusinessLogicAgent";
    agentVersion: "1.0.0";
    completedAt: string;
    targetScope: string;
  };
}
