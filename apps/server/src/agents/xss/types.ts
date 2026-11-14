/**
 * apps/server/src/agents/xss/types.ts
 *
 * Data contracts and findings structures for the Stored XSS Specialist Agent.
 */

import type { FormField } from "../recon/types.js";

export interface XSSAgentOptions {
  missionId?: string;
  outputFilePath?: string;
  targetScope?: string; // Default: "http://localhost:4000/shop"
  credentials?: {
    email: string;
    password: string;
  };
  headless?: boolean;
  timeoutMs?: number;
}

export interface XSSCandidate {
  candidateId: string;
  formId: string;
  pageUrl: string;
  submissionEndpoint: string;
  httpMethod: string;
  targetField: FormField;
  secondaryFields: FormField[];
  submitButtonText?: string;
  expectedRenderUrl: string;
  rationale: string;
}

export interface SkippedField {
  formId: string;
  pageUrl: string;
  fieldName: string;
  fieldType: string;
  reason: string;
}

export interface XSSEvidence {
  browserEngine: string;
  targetUrl: string;
  authenticatedAs: string;
  payloadSubmitted: {
    content: string;
    sentinelKey: string;
    sentinelValue: string;
    inputSelector: string;
    submissionUrl: string;
  };
  storageVerification: {
    reviewId: string | null;
    storedVerbatim: boolean;
    apiEndpointQueried: string;
    apiResponseSnippet: string | null;
  };
  renderVerification: {
    pageUrl: string;
    containsDangerousSink: boolean;
    sinkSnippet: string | null;
  };
  browserExecution: {
    sentinelKey: string;
    expectedValue: string;
    actualValue: string | null;
    executed: boolean;
  };
}

export interface XSSFinding {
  findingId: string;
  vulnerabilityType: "Stored Cross-Site Scripting (Stored XSS)";
  title: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  affectedPage: string;
  affectedPages: string[];
  affectedEndpoint: string;
  inputField: string;
  payloadType: "IMG_ONERROR_SENTINEL";
  testResult: "VULNERABILITY_CONFIRMED" | "NOT_REPRODUCED" | "INCONCLUSIVE";
  reproducible: boolean;
  evidence: XSSEvidence;
  allEvidence: XSSEvidence[];
  testedInstancesCount: number;
  reproductionSteps: string[];
  remediation: string;
  timestamp: string;
}

export interface XSSMissionResult {
  missionId: string;
  target: string;
  status: "completed" | "failed";
  summary: {
    totalDiscoveredForms: number;
    candidateInputsEvaluated: number;
    skippedFieldsCount: number;
    testedInputsCount: number;
    vulnerabilitiesConfirmed: number;
    durationMs: number;
  };
  candidatesEvaluated: XSSCandidate[];
  skippedFields: SkippedField[];
  findings: XSSFinding[];
  errors: string[];
  metadata: {
    agentName: "XssAgent";
    agentVersion: "1.0.0";
    completedAt: string;
    targetScope: string;
  };
}
