/**
 * apps/server/src/agents/idor/access-control-analyzer.ts
 *
 * Analyzes ReconResult endpoints to identify object-level candidate endpoints,
 * categorizes skipped endpoints with clear rationales, and verifies cross-user data exposure.
 */

import type { DiscoveredEndpoint } from "../recon/types.js";
import type { IDORCandidate, SkippedEndpoint, IDOREvidence } from "./types.js";

export class AccessControlAnalyzer {
  /**
   * Filters and categorizes discovered endpoints from ReconResult into:
   * 1. Candidate endpoints to test for IDOR/BOLA
   * 2. Skipped endpoints with explicit reasons
   */
  public filterCandidates(endpoints: DiscoveredEndpoint[]): {
    candidates: IDORCandidate[];
    skipped: SkippedEndpoint[];
  } {
    const candidates: IDORCandidate[] = [];
    const skipped: SkippedEndpoint[] = [];

    for (const ep of endpoints) {
      const path = ep.path;
      const method = ep.method.toUpperCase();

      // 1. Skip non-API routes (HTML UI pages)
      if (!path.startsWith("/shop/api")) {
        skipped.push({
          path,
          method,
          reason: "Frontend HTML page, not an API resource endpoint.",
        });
        continue;
      }

      // 2. Skip authentication & session management endpoints
      if (path.includes("/auth/")) {
        skipped.push({
          path,
          method,
          reason: "Authentication / session endpoint without object-level resource ownership.",
        });
        continue;
      }

      // 3. Skip dev / test utility endpoints
      if (path.includes("/reset")) {
        skipped.push({
          path,
          method,
          reason: "Test environment utility endpoint.",
        });
        continue;
      }

      // 4. Skip public product catalog entities (no user ownership semantics)
      if (path === "/shop/api/products" || path === "/shop/api/products/:id" || path === "/shop/api/products/:id/reviews") {
        if (method === "GET") {
          skipped.push({
            path,
            method,
            reason: "Public catalog entity without per-user ownership boundaries.",
          });
          continue;
        }
      }

      // 5. Skip state-modifying write/mutation endpoints to ensure non-destructive testing
      if (method !== "GET") {
        skipped.push({
          path,
          method,
          reason: `State-modifying ${method} mutation endpoint; skipped to preserve read-only test safety.`,
        });
        continue;
      }

      // 6. Check for collection endpoint (e.g. GET /shop/api/orders)
      // Collection endpoints return the caller's own list. They are used for ID discovery, not direct IDOR targets.
      if (path === "/shop/api/orders") {
        skipped.push({
          path,
          method,
          reason: "Collection endpoint returning current user's items; used to discover resource IDs rather than direct object lookup.",
        });
        continue;
      }

      // 7. Check for direct object reference candidates (contains :id or ID parameter)
      const hasPathId = path.includes("/:id") || ep.parameters.some((p) => p.name === "id" && p.in === "path");
      const hasQueryId = ep.parameters.some((p) => (p.name === "id" || p.name.endsWith("Id")) && p.in === "query");

      if (hasPathId || hasQueryId) {
        let resourceType = "resource";
        if (path.includes("/orders")) resourceType = "order";
        else if (path.includes("/users")) resourceType = "user";
        else if (path.includes("/profiles")) resourceType = "profile";

        candidates.push({
          endpoint: ep,
          parameterName: hasPathId ? "id" : (ep.parameters[0]?.name || "id"),
          parameterIn: hasPathId ? "path" : "query",
          reason: `Discovered endpoint accepts an object identifier parameter in ${hasPathId ? "path" : "query"} for user-scoped ${resourceType}.`,
          resourceType,
        });
      } else {
        skipped.push({
          path,
          method,
          reason: "Endpoint does not take an individual resource identifier parameter.",
        });
      }
    }

    return { candidates, skipped };
  }

  /**
   * Deeply inspects the HTTP response from a cross-user access attempt
   * to verify whether private information belonging to another user was exposed.
   *
   * Crucial rule: HTTP 200 alone is NOT sufficient. The response must actually
   * contain the victim's protected data and confirm mismatched ownership.
   */
  public verifyOwnershipLeak(
    targetResourceId: string,
    crossUserStatus: number,
    crossUserBody: unknown,
    bobUser: { id: string; email: string; name: string },
    aliceUser: { id: string; email: string; name: string }
  ): IDOREvidence["ownershipComparison"] {
    const leakedFields: string[] = [];
    let crossUserLeakageConfirmed = false;
    let actualOwnerInResponse: string | null = null;

    if (crossUserStatus === 200 && crossUserBody && typeof crossUserBody === "object") {
      const bodyRecord = crossUserBody as Record<string, unknown>;

      // Check owner identifier in response
      if ("userId" in bodyRecord && typeof bodyRecord.userId === "string") {
        actualOwnerInResponse = bodyRecord.userId;
      } else if ("ownerId" in bodyRecord && typeof bodyRecord.ownerId === "string") {
        actualOwnerInResponse = bodyRecord.ownerId;
      } else if ("user" in bodyRecord && typeof bodyRecord.user === "string") {
        actualOwnerInResponse = bodyRecord.user;
      }

      // Check for sensitive order/user attributes
      if ("items" in bodyRecord && Array.isArray(bodyRecord.items)) {
        leakedFields.push("items");
      }
      if ("total" in bodyRecord) {
        leakedFields.push("total");
      }
      if ("createdAt" in bodyRecord) {
        leakedFields.push("createdAt");
      }
      if ("userId" in bodyRecord) {
        leakedFields.push("userId");
      }

      // Verify cross-user ownership violation:
      // The resource owner in the returned data must match Bob (the victim)
      // and NOT Alice (the requester)!
      const matchesVictim = actualOwnerInResponse === bobUser.id;
      const doesNotMatchRequester = actualOwnerInResponse !== aliceUser.id;
      const matchesTargetId = bodyRecord.id === targetResourceId;

      if (matchesVictim && doesNotMatchRequester && matchesTargetId && leakedFields.length > 0) {
        crossUserLeakageConfirmed = true;
      }
    }

    return {
      expectedOwnerId: bobUser.id,
      actualOwnerInResponse,
      crossUserLeakageConfirmed,
      leakedFields,
    };
  }
}
