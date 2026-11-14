/**
 * apps/server/tests/business-logic-agent.test.ts
 *
 * Test suite for the autonomous Business Logic / Price Manipulation Specialist Agent.
 * Validates dynamic ReconResult ingestion, candidate selection, price disparity
 * verification against authoritative catalog records, test order containment,
 * credential sanitization, and scope boundary enforcement.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { runReconMission, type ReconResult } from "../src/agents/recon/index.js";
import {
  runBusinessLogicMission,
  type BusinessLogicMissionResult,
} from "../src/agents/business-logic/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://localhost:4000/shop";
const BIZLOGIC_RESULTS_PATH = path.resolve(
  __dirname,
  "results/business-logic-agent-result.json"
);
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

  console.log("  Starting demo shop server for Business Logic agent test…");
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

async function runTest(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  BUGBOUNTY SWARM — Business Logic Agent Verification Test");
  console.log("════════════════════════════════════════════════════════════\n");

  const { child: serverProcess } = await ensureServerRunning();

  try {
    // ── Step 1: Obtain fresh ReconResult from Recon Agent ───────────────────
    console.log("[1/7] Running Recon Agent to obtain fresh attack-surface map…");
    const reconResult: ReconResult = await runReconMission(TARGET_URL, {
      missionId: "recon-for-bizlogic-test",
      maxPages: 10,
      headless: true,
    });

    if (reconResult.status !== "completed") {
      throw new Error(`Recon mission failed with status: ${reconResult.status}`);
    }
    console.log(
      `  ✓ Recon Agent completed: ${reconResult.endpoints.length} endpoints discovered.`
    );

    // ── Step 2: Execute Business Logic Agent on ReconResult ────────────────
    console.log("\n[2/7] Executing Business Logic Agent on discovered ReconResult…");
    const bizlogicResult: BusinessLogicMissionResult =
      await runBusinessLogicMission(reconResult, "bizlogic-mission-001", {
        outputFilePath: BIZLOGIC_RESULTS_PATH,
      });

    if (bizlogicResult.status !== "completed") {
      throw new Error(
        `Business Logic mission failed: ${JSON.stringify(bizlogicResult.errors)}`
      );
    }
    console.log(`  ✓ Business Logic Agent mission completed.`);

    // ── Step 3: Verify dynamic candidate selection and skipped endpoints ───
    console.log("\n[3/7] Verifying dynamic candidate selection and skipped endpoints…");
    const checkoutCandidate = bizlogicResult.candidatesEvaluated.find(
      (c) => c.endpoint.includes("checkout") && c.method.toUpperCase() === "POST"
    );
    if (!checkoutCandidate) {
      throw new Error("Expected checkout endpoint candidate was not selected.");
    }
    console.log(`  ✓ Evaluated checkout candidate: ${checkoutCandidate.method} ${checkoutCandidate.endpoint}`);
    console.log(`  ✓ Total skipped non-checkout endpoints logged with reasons: ${bizlogicResult.skippedEndpoints.length}`);

    // ── Step 4: Verify business logic price disparity evidence ─────────────
    console.log("\n[4/7] Verifying price disparity evidence against authoritative catalog…");
    if (bizlogicResult.findings.length === 0) {
      throw new Error("No Business Logic finding was reported by the agent.");
    }

    const finding = bizlogicResult.findings[0];
    const evidence = finding.evidence;

    if (evidence.targetEndpoint !== "/shop/api/checkout") {
      throw new Error(`Unexpected affected endpoint: ${evidence.targetEndpoint}`);
    }
    if (evidence.canonicalCatalogPriceCents !== 7999) {
      throw new Error(
        `Expected canonical price 7999 cents, got ${evidence.canonicalCatalogPriceCents}`
      );
    }
    if (evidence.clientSubmittedPriceCents !== 1) {
      throw new Error(
        `Expected client submitted price 1 cent, got ${evidence.clientSubmittedPriceCents}`
      );
    }
    if (evidence.serverRecordedPriceCents !== 1) {
      throw new Error(
        `Expected server accepted price 1 cent, got ${evidence.serverRecordedPriceCents}`
      );
    }
    if (evidence.priceUnderchargeCents !== 7998) {
      throw new Error(
        `Expected price discrepancy 7998 cents, got ${evidence.priceUnderchargeCents}`
      );
    }
    if (!evidence.vulnerabilityConfirmed || !finding.reproducible) {
      throw new Error("Finding was not confirmed as reproducible.");
    }
    if (finding.testResult !== "VULNERABILITY_CONFIRMED") {
      throw new Error("Finding testResult is not VULNERABILITY_CONFIRMED.");
    }

    console.log(`  ✓ Canonical Price : ${evidence.canonicalCatalogPriceCents} cents ($${(evidence.canonicalCatalogPriceCents / 100).toFixed(2)})`);
    console.log(`  ✓ Client Sent     : ${evidence.clientSubmittedPriceCents} cent ($${(evidence.clientSubmittedPriceCents / 100).toFixed(2)})`);
    console.log(`  ✓ Server Recorded : ${evidence.serverRecordedPriceCents} cent ($${(evidence.serverRecordedPriceCents / 100).toFixed(2)})`);
    console.log(`  ✓ Undercharge Loss: ${evidence.priceUnderchargeCents} cents ($${(evidence.priceUnderchargeCents / 100).toFixed(2)})`);
    console.log(`  ✓ Order Created   : ${evidence.createdOrderId} (HTTP ${evidence.httpStatus})`);

    // ── Step 5: Verify zero credential and session token leakage ───────────
    console.log("\n[5/7] Verifying zero credentials or tokens in report…");
    if (!fs.existsSync(BIZLOGIC_RESULTS_PATH)) {
      throw new Error(`Report not found at ${BIZLOGIC_RESULTS_PATH}`);
    }
    const reportContent = fs.readFileSync(BIZLOGIC_RESULTS_PATH, "utf8");

    if (reportContent.includes("Alice123!") || reportContent.includes("Bob123!")) {
      throw new Error("[SECURITY BUG] Raw passwords leaked into report!");
    }
    if (/tok-user-[a-zA-Z0-9_-]+/.test(reportContent)) {
      throw new Error("[SECURITY BUG] Raw session tokens leaked into report!");
    }
    console.log(`  ✓ Verified: Report contains 0 passwords and 0 raw session tokens.`);

    // ── Step 6: Verify out-of-scope target rejection ───────────────────────
    console.log("\n[6/7] Verifying strict out-of-scope target rejection…");
    const outOfScopeRecon = {
      ...reconResult,
      target: "http://malicious-external-target.com/shop",
    };
    const rejectedResult = await runBusinessLogicMission(
      outOfScopeRecon,
      "bizlogic-scope-check"
    );

    if (rejectedResult.status !== "failed" || rejectedResult.findings.length > 0) {
      throw new Error("Agent failed to reject out-of-scope target!");
    }
    if (!rejectedResult.errors.some((e) => e.includes("SECURITY VIOLATION"))) {
      throw new Error("Agent did not log a security violation for out-of-scope target.");
    }
    console.log(`  ✓ Verified: Out-of-scope target was strictly rejected with security violation.`);

    // ── Step 7: Verify clean database reset state ──────────────────────────
    console.log("\n[7/7] Verifying post-mission test data isolation and cleanup…");
    const orderCheck = await new Promise<number>((resolve) => {
      http.get(
        `http://localhost:4000/shop/api/orders/${evidence.createdOrderId}`,
        (res) => resolve(res.statusCode || 0)
      ).on("error", () => resolve(0));
    });
    // Since resetDatabase() was executed in finally, the test order should no longer exist
    if (orderCheck === 200) {
      throw new Error("Post-mission cleanup failed: temporary test order still exists in database!");
    }
    console.log(`  ✓ Verified: Database cleanly restored; test order purged (HTTP ${orderCheck}).`);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ✓ BUSINESS LOGIC AGENT TEST PASSED");
    console.log("════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ Business Logic Agent test failed:", err);
  process.exit(1);
});
