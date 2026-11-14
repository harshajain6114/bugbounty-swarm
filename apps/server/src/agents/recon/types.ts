/**
 * apps/server/src/agents/recon/types.ts
 *
 * Types and interfaces for the BugBounty Swarm Reconnaissance Agent.
 * Designed to be modular, extensible, and orchestrator-compatible.
 */

export interface ReconTarget {
  rawUrl: string;
  normalizedUrl: string;
  origin: string;
  basePath: string;
}

export interface ReconCredentials {
  email: string;
  password: string;
}

export interface ReconOptions {
  missionId?: string;
  maxPages?: number;
  maxDepth?: number;
  crawlTimeoutMs?: number;
  credentials?: ReconCredentials;
  headless?: boolean;
  outputFilePath?: string;
}

export interface DiscoveredLink {
  href: string;
  normalizedUrl: string;
  text: string;
  isInternal: boolean;
}

export interface FormField {
  name: string;
  id: string;
  type: string;
  placeholder?: string;
  label?: string;
  required: boolean;
  defaultValue?: string;
}

export interface DiscoveredForm {
  id: string;
  pageUrl: string;
  formAction: string;
  method: string;
  fields: FormField[];
  submitButton?: {
    text: string;
    id?: string;
    actionDescription?: string;
  };
}

export interface DiscoveredEndpoint {
  url: string;
  path: string;
  method: string;
  statusCode: number | null;
  authRequired: boolean;
  parameters: {
    name: string;
    in: "query" | "path" | "body";
    type?: string;
  }[];
  discoverySource: "network-observation" | "form-action" | "page-script" | "link";
  discoveredOnPage: string;
}

export interface DiscoveredPage {
  url: string;
  path: string;
  title: string;
  authRequired: boolean;
  statusCode: number;
  linksDiscovered: string[];
  formsDiscovered: number;
  discoveredAt: string;
}

export interface ReconSummary {
  pagesDiscovered: number;
  endpointsDiscovered: number;
  formsDiscovered: number;
  authenticatedPages: number;
  crawlDurationMs: number;
}

export interface ReconError {
  url?: string;
  phase: string;
  message: string;
  timestamp: string;
}

export interface ReconResult {
  missionId: string;
  target: string;
  status: "completed" | "partial" | "failed";
  summary: ReconSummary;
  pages: DiscoveredPage[];
  endpoints: DiscoveredEndpoint[];
  forms: DiscoveredForm[];
  errors: ReconError[];
  metadata: {
    agentName: string;
    agentVersion: string;
    completedAt: string;
    externalOriginsVisited: string[];
  };
}
