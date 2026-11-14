/**
 * apps/server/src/agents/xss/input-analyzer.ts
 *
 * Ingests ReconResult forms, inputs, and endpoints to identify
 * user-controlled persistent input candidates and filter irrelevant fields.
 */

import type { DiscoveredEndpoint, DiscoveredForm } from "../recon/types.js";
import type { XSSCandidate, SkippedField } from "./types.js";

export class InputAnalyzer {
  /**
   * Analyzes forms and endpoints from ReconResult to dynamically select
   * persistent input candidates suitable for Stored XSS analysis.
   */
  public analyzeForms(
    forms: DiscoveredForm[],
    endpoints: DiscoveredEndpoint[]
  ): {
    candidates: XSSCandidate[];
    skipped: SkippedField[];
  } {
    const candidates: XSSCandidate[] = [];
    const skipped: SkippedField[] = [];
    const seenCandidateKeys = new Set<string>();

    for (const form of forms) {
      // Find corresponding endpoint in ReconResult if available
      const matchingEndpoint = endpoints.find(
        (ep) =>
          ep.path === form.formAction ||
          (form.formAction.includes("reviews") && ep.path.includes("reviews"))
      );

      const endpointPath = matchingEndpoint ? matchingEndpoint.path : form.formAction;
      const httpMethod = form.method.toUpperCase() || "POST";

      // 1. Skip non-mutation forms (e.g. GET search/lookup forms)
      if (httpMethod === "GET") {
        for (const field of form.fields) {
          skipped.push({
            formId: form.id,
            pageUrl: form.pageUrl,
            fieldName: field.name || field.id,
            fieldType: field.type,
            reason: `Field belongs to a read-only GET query form (${form.formAction}); not a persistent content storage sink.`,
          });
        }
        continue;
      }

      // 2. Skip authentication forms (login, register)
      if (
        endpointPath.includes("/auth/") ||
        form.id.includes("login") ||
        form.fields.some((f) => f.type === "password")
      ) {
        for (const field of form.fields) {
          skipped.push({
            formId: form.id,
            pageUrl: form.pageUrl,
            fieldName: field.name || field.id,
            fieldType: field.type,
            reason: "Authentication credential field; verified for identity and not persisted as renderable rich user content.",
          });
        }
        continue;
      }

      // 3. Scan fields for persistent text storage candidates
      let primaryTargetField = form.fields.find(
        (f) =>
          f.type === "textarea" ||
          f.name.toLowerCase().includes("content") ||
          f.name.toLowerCase().includes("review") ||
          f.name.toLowerCase().includes("comment") ||
          f.name.toLowerCase().includes("message") ||
          f.name.toLowerCase().includes("description")
      );

      // Fallback: any text input if no textarea exists
      if (!primaryTargetField) {
        primaryTargetField = form.fields.find(
          (f) => f.type === "text" && !f.name.toLowerCase().includes("price") && !f.name.toLowerCase().includes("id")
        );
      }

      if (primaryTargetField) {
        const secondaryFields = form.fields.filter(
          (f) => (f.name || f.id) !== (primaryTargetField.name || primaryTargetField.id)
        );

        // Record skipped status for secondary fields
        for (const sec of secondaryFields) {
          skipped.push({
            formId: form.id,
            pageUrl: form.pageUrl,
            fieldName: sec.name || sec.id,
            fieldType: sec.type,
            reason: `Auxiliary form field (${sec.type}); skipped in favor of primary rich-text field '${primaryTargetField.name || primaryTargetField.id}'.`,
          });
        }

        const candidateKey = `${form.pageUrl}::${primaryTargetField.name || primaryTargetField.id}`;
        if (!seenCandidateKeys.has(candidateKey)) {
          seenCandidateKeys.add(candidateKey);
          candidates.push({
            candidateId: `xss-cand-${candidates.length + 1}`,
            formId: form.id,
            pageUrl: form.pageUrl,
            submissionEndpoint: endpointPath,
            httpMethod,
            targetField: primaryTargetField,
            secondaryFields,
            submitButtonText: form.submitButton?.text || "Submit",
            expectedRenderUrl: form.pageUrl,
            rationale: `Discovered interactive ${primaryTargetField.type} field '${primaryTargetField.name || primaryTargetField.id}' submitted via ${httpMethod} to '${endpointPath}' and rendered at '${form.pageUrl}'.`,
          });
        }
      } else {
        // All fields in this form are skipped
        for (const field of form.fields) {
          skipped.push({
            formId: form.id,
            pageUrl: form.pageUrl,
            fieldName: field.name || field.id,
            fieldType: field.type,
            reason: `Field type '${field.type}' does not accept persistent unstructured text.`,
          });
        }
      }
    }

    return { candidates, skipped };
  }
}
