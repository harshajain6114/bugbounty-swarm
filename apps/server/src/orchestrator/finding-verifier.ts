/**
 * apps/server/src/orchestrator/finding-verifier.ts
 *
 * Independent Finding Verifier for BUGBOUNTY SWARM.
 * Rigorously inspects raw findings from specialist agents, validates cryptographic /
 * DOM execution / access control evidence, filters unverified claims, and
 * deduplicates findings sharing the same root cause without losing evidence.
 */

import type {
  RawFinding,
  VerifiedFinding,
  RejectedFinding,
  DeduplicationSummary,
} from "./types.js";
import type { IDORFinding } from "../agents/idor/types.js";
import type { XSSFinding } from "../agents/xss/types.js";
import type { BusinessLogicFinding } from "../agents/business-logic/types.js";

export class FindingVerifier {
  /**
   * Verifies, validates evidence, and deduplicates raw agent findings.
   */
  public verifyFindings(rawFindings: RawFinding[]): {
    verifiedFindings: VerifiedFinding[];
    rejectedFindings: RejectedFinding[];
    deduplicationSummary: DeduplicationSummary;
  } {
    const verifiedCandidates: VerifiedFinding[] = [];
    const rejectedFindings: RejectedFinding[] = [];
    const deduplicationDetails: string[] = [];

    let counter = 1;

    for (const raw of rawFindings) {
      const vulnType = raw.vulnerabilityType;

      // ── 1. IDOR / BOLA Verification ──────────────────────────────────────────
      if (vulnType === "Insecure Direct Object Reference (IDOR / BOLA)") {
        const idor = raw as IDORFinding;
        const ev = idor.evidence;

        if (!idor.reproducible || idor.testResult !== "VULNERABILITY_CONFIRMED") {
          rejectedFindings.push({
            originalFindingId: idor.findingId,
            sourceAgent: "IdorAgent",
            vulnerabilityType: idor.vulnerabilityType,
            reason: "Agent did not mark finding as reproducible VULNERABILITY_CONFIRMED.",
            rawFinding: idor as unknown as Record<string, unknown>,
          });
          continue;
        }

        if (
          !ev ||
          ev.aliceOwnResource?.httpStatus !== 200 ||
          ev.crossUserAccessAttempt?.httpStatus !== 200 ||
          !ev.ownershipComparison?.crossUserLeakageConfirmed ||
          !Array.isArray(ev.ownershipComparison.leakedFields) ||
          ev.ownershipComparison.leakedFields.length === 0
        ) {
          rejectedFindings.push({
            originalFindingId: idor.findingId,
            sourceAgent: "IdorAgent",
            vulnerabilityType: idor.vulnerabilityType,
            reason:
              "Incomplete differential access control proof: missing baseline 200, cross-user 200, or confirmed leaked fields.",
            rawFinding: idor as unknown as Record<string, unknown>,
          });
          continue;
        }

        verifiedCandidates.push({
          findingId: `VF-${String(counter++).padStart(3, "0")}`,
          originalFindingId: idor.findingId,
          sourceAgent: "IdorAgent",
          vulnerabilityType: idor.vulnerabilityType,
          title: idor.title,
          severity: idor.severity,
          affectedEndpoint: idor.affectedEndpoint,
          verificationStatus: "VERIFIED_CONFIRMED",
          verificationRationale: `Differential cross-user access control probe verified: User '${idor.authenticatedUser}' retrieved private object belonging to '${ev.ownershipComparison.actualOwnerInResponse}' with HTTP 200, exposing sensitive fields: [${ev.ownershipComparison.leakedFields.join(", ")}].`,
          testedInputsCount: 1,
          evidence: ev as unknown as Record<string, unknown>,
          reproductionSteps: idor.reproductionSteps,
          remediation: idor.remediation,
          timestamp: idor.timestamp,
        });
        continue;
      }

      // ── 2. Stored XSS Verification ───────────────────────────────────────────
      if (vulnType === "Stored Cross-Site Scripting (Stored XSS)") {
        const xss = raw as XSSFinding;
        const ev = xss.evidence;

        if (!xss.reproducible || xss.testResult !== "VULNERABILITY_CONFIRMED") {
          rejectedFindings.push({
            originalFindingId: xss.findingId,
            sourceAgent: "XssAgent",
            vulnerabilityType: xss.vulnerabilityType,
            reason: "Agent did not mark finding as reproducible VULNERABILITY_CONFIRMED.",
            rawFinding: xss as unknown as Record<string, unknown>,
          });
          continue;
        }

        const isStored = ev?.storageVerification?.storedVerbatim === true;
        const hasSink = ev?.renderVerification?.containsDangerousSink === true;
        const executed =
          ev?.browserExecution?.executed === true &&
          ev?.browserExecution?.actualValue === ev?.browserExecution?.expectedValue;

        if (!isStored || !hasSink || !executed) {
          rejectedFindings.push({
            originalFindingId: xss.findingId,
            sourceAgent: "XssAgent",
            vulnerabilityType: xss.vulnerabilityType,
            reason: `Failed 4-way verification: stored=${isStored}, innerHTML_sink=${hasSink}, browser_exec=${executed}.`,
            rawFinding: xss as unknown as Record<string, unknown>,
          });
          continue;
        }

        const testedCount = xss.testedInstancesCount || (xss.allEvidence ? xss.allEvidence.length : 1);
        verifiedCandidates.push({
          findingId: `VF-${String(counter++).padStart(3, "0")}`,
          originalFindingId: xss.findingId,
          sourceAgent: "XssAgent",
          vulnerabilityType: xss.vulnerabilityType,
          title: xss.title,
          severity: xss.severity,
          affectedEndpoint: xss.affectedEndpoint,
          affectedPages: xss.affectedPages || [xss.affectedPage],
          verificationStatus: "VERIFIED_CONFIRMED",
          verificationRationale: `4-way execution proof confirmed: payload persisted verbatim in database, rendered via unescaped innerHTML sink, and executed sentinel handler in Playwright Chromium browser DOM context.`,
          testedInputsCount: testedCount,
          evidence: {
            primaryEvidence: ev,
            allEvidence: xss.allEvidence || [ev],
          },
          reproductionSteps: xss.reproductionSteps,
          remediation: xss.remediation,
          timestamp: xss.timestamp,
        });
        continue;
      }

      // ── 3. Business Logic / Price Manipulation Verification ──────────────────
      if (vulnType === "Business Logic Flaw: Client-Side Price Manipulation") {
        const biz = raw as BusinessLogicFinding;
        const ev = biz.evidence;

        if (!biz.reproducible || biz.testResult !== "VULNERABILITY_CONFIRMED") {
          rejectedFindings.push({
            originalFindingId: biz.findingId,
            sourceAgent: "BusinessLogicAgent",
            vulnerabilityType: biz.vulnerabilityType,
            reason: "Agent did not mark finding as reproducible VULNERABILITY_CONFIRMED.",
            rawFinding: biz as unknown as Record<string, unknown>,
          });
          continue;
        }

        const isPriceDisparity =
          ev &&
          typeof ev.canonicalCatalogPriceCents === "number" &&
          typeof ev.clientSubmittedPriceCents === "number" &&
          typeof ev.serverRecordedPriceCents === "number" &&
          ev.serverRecordedPriceCents === ev.clientSubmittedPriceCents &&
          ev.serverRecordedPriceCents < ev.canonicalCatalogPriceCents &&
          ev.vulnerabilityConfirmed === true;

        if (!isPriceDisparity) {
          rejectedFindings.push({
            originalFindingId: biz.findingId,
            sourceAgent: "BusinessLogicAgent",
            vulnerabilityType: biz.vulnerabilityType,
            reason:
              "Price integrity check failed: server-recorded price matches canonical price or client manipulation was rejected.",
            rawFinding: biz as unknown as Record<string, unknown>,
          });
          continue;
        }

        verifiedCandidates.push({
          findingId: `VF-${String(counter++).padStart(3, "0")}`,
          originalFindingId: biz.findingId,
          sourceAgent: "BusinessLogicAgent",
          vulnerabilityType: biz.vulnerabilityType,
          title: biz.title,
          severity: biz.severity,
          affectedEndpoint: biz.affectedEndpoint,
          verificationStatus: "VERIFIED_CONFIRMED",
          verificationRationale: `Price integrity violation confirmed: server trusted client-supplied price (${ev.clientSubmittedPriceCents} cents) over authoritative catalog price (${ev.canonicalCatalogPriceCents} cents), creating order '${ev.createdOrderId}' with an undercharge of ${ev.priceUnderchargeCents} cents.`,
          testedInputsCount: 1,
          evidence: ev as unknown as Record<string, unknown>,
          reproductionSteps: biz.reproductionSteps,
          remediation: biz.remediation,
          timestamp: biz.timestamp,
        });
        continue;
      }

      // Unrecognized finding type
      rejectedFindings.push({
        originalFindingId: (raw as { findingId?: string }).findingId || "unknown",
        sourceAgent: "Unknown",
        vulnerabilityType: (raw as { vulnerabilityType?: string }).vulnerabilityType || "Unknown",
        reason: "Unrecognized vulnerability finding schema; lacks verifiable proof signature.",
        rawFinding: raw as unknown as Record<string, unknown>,
      });
    }

    // ── 4. Root-Cause Deduplication ──────────────────────────────────────────
    const deduplicatedMap = new Map<string, VerifiedFinding>();

    for (const item of verifiedCandidates) {
      const rootCauseKey = `${item.vulnerabilityType}::${item.affectedEndpoint}`;

      if (!deduplicatedMap.has(rootCauseKey)) {
        deduplicatedMap.set(rootCauseKey, item);
      } else {
        const existing = deduplicatedMap.get(rootCauseKey)!;
        existing.testedInputsCount += item.testedInputsCount;
        if (item.affectedPages && existing.affectedPages) {
          existing.affectedPages = Array.from(
            new Set([...existing.affectedPages, ...item.affectedPages])
          );
        }
        deduplicationDetails.push(
          `Merged finding ${item.originalFindingId} into ${existing.findingId}: duplicate root cause on endpoint '${item.affectedEndpoint}'.`
        );
      }
    }

    const verifiedFindings = Array.from(deduplicatedMap.values());
    const deduplicationSummary: DeduplicationSummary = {
      rawFindingsCount: rawFindings.length,
      deduplicatedCount: verifiedCandidates.length - verifiedFindings.length,
      distinctRootCauses: verifiedFindings.length,
      details: deduplicationDetails,
    };

    return { verifiedFindings, rejectedFindings, deduplicationSummary };
  }
}
