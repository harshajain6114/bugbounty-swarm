/**
 * apps/server/tests/xss-agent.test.ts
 *
 * Test suite for the autonomous Stored XSS Specialist Agent.
 * Validates dynamic ReconResult ingestion, candidate selection, form field filtering,
 * Playwright browser-driven payload submission and in-browser execution verification,
 * 4-way verification distinction, credential sanitization, test isolation,
 * and scope boundary enforcement.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { runReconMission, type ReconResult } from "../src/agents/recon/index.js";
import { runXssMission, type XSSMissionResult } from "../src/agents/xss/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://localhost:4000/shop";
const XSS_RESULTS_PATH = path.resolve(__dirname, "results/xss-agent-result.json");
const tsxBin = path.resolve(__dirname, "../node_modules/tsx/dist/cli.mjs");

function checkServerOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get("http://localhost:4000/health", (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServerRunning(): Promise<{ child: ChildProcess | null }> {
  const isOnline = await checkServerOnline();
  if (isOnline) {
    console.log("  ✓ Demo shop server already running on port 4000.");
    return { child: null };
  }

  console.log("  Starting demo shop server for XSS agent test…");
  const child = spawn("node", [tsxBin, "src/index.ts"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    detached: false,
  });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkServerOnline()) {
      console.log("  ✓ Demo shop server started successfully.");
      return { child };
    }
  }

  throw new Error("Timed out waiting for demo shop server on port 4000");
}

function fetchJson(urlPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:4000${urlPath}`, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    }).on("error", reject);
  });
}

async function runTest(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  BUGBOUNTY SWARM — Stored XSS Agent Verification Test");
  console.log("════════════════════════════════════════════════════════════\n");

  const { child: serverProcess } = await ensureServerRunning();

  try {
    // ── Step 1: Obtain fresh ReconResult from Recon Agent ───────────────────
    console.log("[1/7] Running Recon Agent to obtain fresh attack-surface map…");
    const reconResult: ReconResult = await runReconMission(TARGET_URL, {
      missionId: "recon-for-xss-test",
      maxPages: 10,
      headless: true,
    });

    if (reconResult.status !== "completed") {
      throw new Error(`Recon mission failed with status: ${reconResult.status}`);
    }
    console.log(
      `  ✓ Recon Agent completed: ${reconResult.forms.length} forms and ${reconResult.endpoints.length} endpoints discovered.`
    );

    // ── Step 2: Execute XSS Agent on the ReconResult ───────────────────────
    console.log("\n[2/7] Executing Stored XSS Agent on discovered ReconResult…");
    const xssResult: XSSMissionResult = await runXssMission(
      reconResult,
      "xss-mission-001",
      { outputFilePath: XSS_RESULTS_PATH, headless: true }
    );

    if (xssResult.status !== "completed") {
      throw new Error(`XSS mission failed: ${JSON.stringify(xssResult.errors)}`);
    }
    console.log(`  ✓ Stored XSS Agent mission completed.`);

    // ── Step 3: Verify dynamic candidate selection and skipped fields ───────
    console.log("\n[3/7] Verifying dynamic candidate selection and skipped fields…");
    if (xssResult.candidatesEvaluated.length === 0) {
      throw new Error("No candidates were evaluated by the XSS agent.");
    }

    const reviewCandidate = xssResult.candidatesEvaluated.find(
      (c) =>
        c.targetField.name === "review-content" ||
        c.targetField.id === "review-content" ||
        c.targetField.type === "textarea"
    );
    if (!reviewCandidate) {
      throw new Error("Expected review-content textarea candidate was not selected.");
    }
    console.log(`  ✓ Evaluated persistent candidate: ${reviewCandidate.candidateId} (${reviewCandidate.pageUrl})`);

    // Verify skipped fields (e.g. login password, email, order search input)
    if (xssResult.skippedFields.length === 0) {
      throw new Error("Expected skipped fields were not recorded.");
    }
    const skippedAuthField = xssResult.skippedFields.find(
      (s) => s.fieldType === "password" || s.fieldName === "password"
    );
    if (!skippedAuthField) {
      throw new Error("Authentication password field was not skipped and recorded.");
    }
    console.log(`  ✓ Total skipped fields recorded with reasons: ${xssResult.skippedFields.length}`);
    console.log(`  ✓ Verified skipped auth field rationale: "${skippedAuthField.reason}"`);

    // ── Step 4: Verify 4-way execution criteria in confirmed finding ────────
    console.log("\n[4/7] Verifying 4-way execution criteria in confirmed finding…");
    if (xssResult.findings.length === 0) {
      throw new Error("No Stored XSS finding was reported by the agent.");
    }

    const finding = xssResult.findings[0];
    const evidence = finding.evidence;

    // 1. Storage verification
    if (!evidence.storageVerification.storedVerbatim) {
      throw new Error("Criterion 1 Failed: Payload was not verified as stored verbatim via API.");
    }
    console.log(`  ✓ Criterion 1 (Storage): Stored verbatim confirmed (reviewId: ${evidence.storageVerification.reviewId}).`);

    // 2. Dangerous sink verification
    if (!evidence.renderVerification.containsDangerousSink) {
      throw new Error("Criterion 2 Failed: Dangerous innerHTML sink not detected.");
    }
    console.log(`  ✓ Criterion 2 (Sink): Dangerous innerHTML sink confirmed: ${evidence.renderVerification.sinkSnippet}`);

    // 3. Browser DOM execution verification
    if (!evidence.browserExecution.executed) {
      throw new Error("Criterion 3 Failed: In-browser sentinel execution was not confirmed.");
    }
    if (evidence.browserExecution.actualValue !== evidence.browserExecution.expectedValue) {
      throw new Error(
        `Criterion 3 Failed: Sentinel value mismatch. Expected '${evidence.browserExecution.expectedValue}', got '${evidence.browserExecution.actualValue}'`
      );
    }
    console.log(`  ✓ Criterion 3 (Execution): Browser execution confirmed with sentinel ${evidence.browserExecution.sentinelKey}.`);

    // 4. Overall reproduction confirmed & root-cause deduplication
    if (!finding.reproducible || finding.testResult !== "VULNERABILITY_CONFIRMED") {
      throw new Error("Criterion 4 Failed: Finding not marked as reproducible VULNERABILITY_CONFIRMED.");
    }
    if (xssResult.summary.vulnerabilitiesConfirmed !== 1) {
      throw new Error(`Expected 1 consolidated root-cause vulnerability, got ${xssResult.summary.vulnerabilitiesConfirmed}`);
    }
    if (xssResult.findings.length !== 1) {
      throw new Error(`Expected exactly 1 root-cause finding, got ${xssResult.findings.length}`);
    }
    if (finding.testedInstancesCount !== 4 || finding.allEvidence.length !== 4) {
      throw new Error(`Expected all 4 execution proofs preserved in allEvidence, got ${finding.allEvidence?.length}`);
    }
    console.log(`  ✓ Criterion 4 (Result): Confirmed 1 distinct root-cause vulnerability across ${finding.testedInstancesCount} tested inputs.`);
    console.log(`  ✓ All ${finding.allEvidence.length} in-browser execution evidence records preserved without inflating vulnerability count.`);

    // ── Step 5: Verify zero credential and session token leakage ───────────
    console.log("\n[5/7] Verifying zero credentials or tokens in report…");
    if (!fs.existsSync(XSS_RESULTS_PATH)) {
      throw new Error(`Report not found at ${XSS_RESULTS_PATH}`);
    }
    const reportContent = fs.readFileSync(XSS_RESULTS_PATH, "utf8");

    if (reportContent.includes("Alice123!") || reportContent.includes("Bob123!")) {
      throw new Error("[SECURITY BUG] Raw passwords leaked into XSS report!");
    }
    if (/tok-user-[a-zA-Z0-9_-]+/.test(reportContent)) {
      throw new Error("[SECURITY BUG] Raw session tokens leaked into XSS report!");
    }
    console.log(`  ✓ Verified: Report contains 0 passwords and 0 raw session tokens.`);

    // ── Step 6: Verify out-of-scope target rejection ───────────────────────
    console.log("\n[6/7] Verifying strict out-of-scope target rejection…");
    const outOfScopeRecon = {
      ...reconResult,
      target: "http://malicious-external-target.com/shop",
    };
    const rejectedResult = await runXssMission(outOfScopeRecon, "xss-scope-check");

    if (rejectedResult.status !== "failed" || rejectedResult.findings.length > 0) {
      throw new Error("Agent failed to reject out-of-scope target!");
    }
    if (!rejectedResult.errors.some((e) => e.includes("SECURITY VIOLATION"))) {
      throw new Error("Agent did not log a security violation for out-of-scope target.");
    }
    console.log(`  ✓ Verified: Out-of-scope target was strictly rejected with security violation.`);

    // ── Step 7: Verify clean database reset state ──────────────────────────
    console.log("\n[7/7] Verifying post-mission test data isolation and cleanup…");
    const reviewsAfter = (await fetchJson("/shop/api/products/prod-001/reviews")) as {
      content: string;
    }[];
    const lingeringSentinel = reviewsAfter.find((r) =>
      r.content.includes("__bb_xss_")
    );
    if (lingeringSentinel) {
      throw new Error("Post-mission cleanup failed: test payload is still present in reviews database!");
    }
    console.log(`  ✓ Verified: Database cleanly restored without lingering test payloads.`);

    // ── Step 8: Verify database reset endpoint restriction ────────────────
    console.log("\n[8/8] Verifying database reset endpoint restriction to local testing…");
    const remoteResetStatus = await new Promise<number>((resolve) => {
      const req = http.request(
        "http://localhost:4000/shop/api/reset",
        {
          method: "POST",
          headers: { Host: "remote-external-host.com" },
        },
        (res) => resolve(res.statusCode || 0)
      );
      req.on("error", () => resolve(0));
      req.end();
    });

    if (remoteResetStatus !== 403) {
      throw new Error(`Expected HTTP 403 when calling /shop/api/reset with foreign Host header, got HTTP ${remoteResetStatus}`);
    }
    console.log(`  ✓ Verified: /shop/api/reset strictly rejected non-localhost caller with HTTP 403.`);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ✓ STORED XSS AGENT TEST PASSED");
    console.log("════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ Stored XSS Agent test failed:", err);
  process.exit(1);
});
