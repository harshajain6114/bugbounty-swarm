/**
 * apps/server/tests/idor-agent.test.ts
 *
 * Test suite for the autonomous IDOR / BOLA Security Agent.
 * Validates dynamic ReconResult ingestion, candidate selection, differential
 * cross-user authorization probing, evidence validation, credential sanitization,
 * and scope boundary enforcement.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { runReconMission, type ReconResult } from "../src/agents/recon/index.js";
import { runIdorMission, type IDORMissionResult } from "../src/agents/idor/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://localhost:4000/shop";
const IDOR_RESULTS_PATH = path.resolve(__dirname, "results/idor-agent-result.json");
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

  console.log("  Starting demo shop server for IDOR agent test…");
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
  console.log("  BUGBOUNTY SWARM — IDOR Agent Verification Test");
  console.log("════════════════════════════════════════════════════════════\n");

  const { child: serverProcess } = await ensureServerRunning();

  try {
    // ── Step 1: Obtain fresh ReconResult from Recon Agent ───────────────────
    console.log("[1/6] Running Recon Agent to obtain fresh attack-surface map…");
    const reconResult: ReconResult = await runReconMission(TARGET_URL, {
      missionId: "recon-for-idor-test",
      maxPages: 10,
      headless: true,
    });

    if (reconResult.status !== "completed") {
      throw new Error(`Recon mission failed with status: ${reconResult.status}`);
    }
    console.log(`  ✓ Recon Agent completed: ${reconResult.endpoints.length} endpoints discovered.`);

    // ── Step 2: Execute IDOR Agent on the ReconResult ──────────────────────
    console.log("\n[2/6] Executing IDOR Agent on discovered ReconResult…");
    const idorResult: IDORMissionResult = await runIdorMission(
      reconResult,
      "idor-mission-001",
      { outputFilePath: IDOR_RESULTS_PATH }
    );

    if (idorResult.status !== "completed") {
      throw new Error(`IDOR mission failed: ${JSON.stringify(idorResult.errors)}`);
    }
    console.log(`  ✓ IDOR Agent mission completed.`);

    // ── Step 3: Verify dynamic candidate selection ─────────────────────────
    console.log("\n[3/6] Verifying dynamic candidate selection and skipped endpoints…");
    const evaluatedOrderEndpoint = idorResult.candidatesEvaluated.find(
      (c) => c.includes("/orders/:id") || c.includes("/orders")
    );
    if (!evaluatedOrderEndpoint) {
      throw new Error(
        `Expected candidate '/shop/api/orders/:id' was not selected. Evaluated: [${idorResult.candidatesEvaluated.join(", ")}]`
      );
    }
    console.log(`  ✓ Candidate selected for testing: ${evaluatedOrderEndpoint}`);
    console.log(`  ✓ Total skipped endpoints reported with reasons: ${idorResult.skippedEndpoints.length}`);

    // ── Step 4: Verify differential access control evidence ────────────────
    console.log("\n[4/6] Verifying differential cross-user access control evidence…");
    if (idorResult.findings.length === 0) {
      throw new Error("No IDOR finding was reported by the agent.");
    }

    const orderFinding = idorResult.findings.find(
      (f) => f.affectedEndpoint.includes("/orders")
    );
    if (!orderFinding) {
      throw new Error("No finding specifically targeting the orders endpoint was generated.");
    }

    // Verify Alice can access her own order
    if (orderFinding.evidence.aliceOwnResource.httpStatus !== 200) {
      throw new Error(`Alice own resource access failed: HTTP ${orderFinding.evidence.aliceOwnResource.httpStatus}`);
    }
    console.log(`  ✓ Baseline verified: Alice accessed her own order with HTTP 200.`);

    // Verify Bob's private order was accessed by Alice via the vulnerability
    if (orderFinding.evidence.crossUserAccessAttempt.httpStatus !== 200) {
      throw new Error(`Cross-user access probe did not return 200: HTTP ${orderFinding.evidence.crossUserAccessAttempt.httpStatus}`);
    }

    const leakCheck = orderFinding.evidence.ownershipComparison;
    if (!leakCheck.crossUserLeakageConfirmed) {
      throw new Error("Cross-user data leakage was not confirmed in ownership comparison.");
    }
    if (leakCheck.actualOwnerInResponse !== "user-bob") {
      throw new Error(`Expected owner 'user-bob' in leaked order, got '${leakCheck.actualOwnerInResponse}'`);
    }
    if (orderFinding.testResult !== "VULNERABILITY_CONFIRMED" || !orderFinding.reproducible) {
      throw new Error("Finding was not marked as reproducible VULNERABILITY_CONFIRMED.");
    }
    console.log(`  ✓ Cross-user probe verified: Alice retrieved Bob's order (${leakCheck.actualOwnerInResponse}).`);
    console.log(`  ✓ Leaked sensitive fields: [${leakCheck.leakedFields.join(", ")}]`);

    // ── Step 5: Verify credential sanitization ─────────────────────────────
    console.log("\n[5/6] Verifying zero credentials or tokens in report…");
    if (!fs.existsSync(IDOR_RESULTS_PATH)) {
      throw new Error(`Report not found at ${IDOR_RESULTS_PATH}`);
    }
    const reportContent = fs.readFileSync(IDOR_RESULTS_PATH, "utf8");

    if (reportContent.includes("Alice123!") || reportContent.includes("Bob123!")) {
      throw new Error("[SECURITY BUG] Raw passwords leaked into IDOR report!");
    }
    if (/tok-user-[a-zA-Z0-9_-]+/.test(reportContent)) {
      throw new Error("[SECURITY BUG] Raw session tokens leaked into IDOR report!");
    }
    console.log(`  ✓ Verified: Report contains 0 passwords and 0 raw session tokens.`);

    // ── Step 6: Verify out-of-scope target rejection ───────────────────────
    console.log("\n[6/6] Verifying strict out-of-scope target rejection…");
    const outOfScopeRecon = {
      ...reconResult,
      target: "http://malicious-external-target.com/shop",
    };
    const rejectedResult = await runIdorMission(outOfScopeRecon, "idor-scope-check");

    if (rejectedResult.status !== "failed" || rejectedResult.findings.length > 0) {
      throw new Error("Agent failed to reject out-of-scope target!");
    }
    if (!rejectedResult.errors.some((e) => e.includes("SECURITY VIOLATION"))) {
      throw new Error("Agent did not log a security violation for out-of-scope target.");
    }
    console.log(`  ✓ Verified: Out-of-scope target was strictly rejected with security violation.`);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ✓ IDOR AGENT TEST PASSED");
    console.log("════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ IDOR Agent test failed:", err);
  process.exit(1);
});
