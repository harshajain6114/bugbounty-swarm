/**
 * apps/server/src/near/hasher.ts
 *
 * Deterministic SHA-256 hashing utilities for NEAR on-chain attestation.
 * Uses Node.js built-in `crypto` — no external dependencies.
 *
 * Rules:
 *  - Input objects are deep-cloned and keys sorted before hashing
 *    so the hash is stable regardless of property insertion order.
 *  - Private keys, passwords and tokens are stripped before hashing.
 *  - All hashes are returned as 64-char lowercase hex strings.
 */

import { createHash } from "node:crypto";
import type { MissionResult, VerifiedFinding } from "../orchestrator/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a JSON string with keys sorted recursively — deterministic regardless
 * of object property insertion order.
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}

function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential scrubbing — ensure no secrets leak into on-chain hashes
// ─────────────────────────────────────────────────────────────────────────────

const SCRUB_KEYS = new Set([
  "password",
  "defaultValue",
  "privateKey",
  "private_key",
  "secretKey",
  "secret_key",
  "seedPhrase",
  "seed_phrase",
  "token",
  "authorization",
  "cookie",
]);

function scrubCredentials(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(scrubCredentials);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SCRUB_KEYS.has(k.toLowerCase())) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = scrubCredentials(v);
      }
    }
    return result;
  }
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public hashing functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes a deterministic SHA-256 digest of the full mission result.
 * Strips credentials, sorts keys, then hashes the stable JSON string.
 */
export function hashMissionResult(result: MissionResult): string {
  const scrubbed = scrubCredentials(result);
  return sha256hex(stableStringify(scrubbed));
}

/**
 * Computes a deterministic SHA-256 digest of a single verified finding.
 * Uses only the stable identifying fields (not timestamps or run-specific IDs).
 */
export function hashFinding(finding: VerifiedFinding): string {
  const stable = {
    sourceAgent: finding.sourceAgent,
    vulnerabilityType: finding.vulnerabilityType,
    affectedEndpoint: finding.affectedEndpoint,
    severity: finding.severity,
    verificationStatus: finding.verificationStatus,
  };
  return sha256hex(stableStringify(stable));
}

/**
 * Computes a deterministic SHA-256 digest over ALL verified findings.
 * Findings are individually hashed, sorted lexicographically, then
 * the sorted list of hex digests is hashed again.
 */
export function hashFindings(findings: VerifiedFinding[]): string {
  if (findings.length === 0) {
    return sha256hex("empty-findings");
  }
  const individualHashes = findings.map(hashFinding).sort();
  return sha256hex(stableStringify(individualHashes));
}

/**
 * Computes a deterministic SHA-256 digest for a single agent's findings subset.
 */
export function hashAgentFindings(
  agentId: string,
  findings: VerifiedFinding[]
): string {
  const agentFindings = findings.filter((f) => f.sourceAgent === agentId);
  const payload = { agentId, findings: agentFindings.map(hashFinding).sort() };
  return sha256hex(stableStringify(payload));
}
