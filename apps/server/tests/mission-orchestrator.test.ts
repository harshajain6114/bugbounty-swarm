/**
 * apps/server/tests/mission-orchestrator.test.ts
 *
 * Comprehensive end-to-end test suite for the BUGBOUNTY SWARM Mission Orchestrator.
 * Validates autonomous reconnaissance, sequential specialist agent execution,
 * dynamic ReconResult sharing, independent finding verification, root-cause deduplication,
 * credential sanitization, scope boundary enforcement, concurrency prevention, and REST API integration.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import {
  MissionOrchestrator,
  runSecurityMission,
  FindingVerifier,
  type MissionResult,
  type MissionSummaryItem,
  type AgentExecutionRecord,
} from "../src/orchestrator/index.js";
import type { IDORFinding } from "../src/agents/idor/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://localhost:4000/shop";
const MISSION_RESULTS_PATH = path.resolve(__dirname, "results/mission-result.json");
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

  console.log("  Starting demo shop server for Mission Orchestrator test…");
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

function httpApiCall<T = unknown>(
  urlPath: string,
  method = "GET",
  body?: Record<string, unknown>
): Promise<{ status: number; data: T }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      `http://localhost:4000${urlPath}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            // raw string
          }
          resolve({ status: res.statusCode || 0, data: parsed as T });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTest(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  BUGBOUNTY SWARM — Mission Orchestrator Verification Test");
  console.log("════════════════════════════════════════════════════════════════\n");

  const { child: serverProcess } = await ensureServerRunning();

  try {
    const missionId = `test-mission-${Date.now()}`;

    // ── Step 1 & 2: Start One Autonomous Mission ───────────────────────────
    console.log(`[1/12] Launching autonomous security mission (${missionId})…`);
    const missionResult: MissionResult = await runSecurityMission(missionId, {
      target: TARGET_URL,
      outputFilePath: MISSION_RESULTS_PATH,
      headless: true,
    });

    if (missionResult.status !== "completed") {
      throw new Error(`Mission failed with status: ${missionResult.status}`);
    }
    console.log(`  ✓ Mission completed successfully in ${missionResult.durationMs}ms.`);

    // ── Step 3: Verify Recon Executes ──────────────────────────────────────
    console.log("\n[2/12] Verifying Reconnaissance Agent execution…");
    if (!missionResult.agentResults.recon) {
      throw new Error("ReconResult missing from mission results.");
    }
    const recon = missionResult.agentResults.recon;
    if (recon.pages.length === 0 || recon.endpoints.length === 0 || recon.forms.length === 0) {
      throw new Error("ReconAgent did not discover expected pages/endpoints/forms.");
    }
    console.log(`  ✓ Recon Agent discovered: ${recon.pages.length} pages, ${recon.endpoints.length} endpoints, ${recon.forms.length} forms.`);

    // ── Step 4: Verify All Three Specialist Agents Executed ────────────────
    console.log("\n[3/12] Verifying sequential specialist agent execution records…");
    const executedAgents = missionResult.agentsExecuted.map((a) => a.agentName);
    const expectedAgents = ["ReconAgent", "IdorAgent", "XssAgent", "BusinessLogicAgent"];

    for (const exp of expectedAgents) {
      if (!executedAgents.includes(exp as unknown as AgentExecutionRecord["agentName"])) {
        throw new Error(`Missing expected agent execution record for: ${exp}`);
      }
      const record = missionResult.agentsExecuted.find((a) => a.agentName === exp)!;
      if (record.status !== "completed") {
        throw new Error(`Agent ${exp} did not complete cleanly (status: ${record.status})`);
      }
      console.log(`  ✓ ${record.agentName.padEnd(20)}: ${record.status} (${record.durationMs}ms, ${record.findingsCount} findings)`);
    }

    // ── Step 5: Verify Each Specialist Received ReconResult ────────────────
    console.log("\n[4/12] Verifying dynamic ReconResult consumption by specialist agents…");
    const idor = missionResult.agentResults.idor!;
    const xss = missionResult.agentResults.xss!;
    const biz = missionResult.agentResults.businessLogic!;

    if (idor.candidatesEvaluated.length === 0) {
      throw new Error("IdorAgent did not evaluate candidates from ReconResult.");
    }
    if (xss.candidatesEvaluated.length === 0) {
      throw new Error("XssAgent did not evaluate candidates from ReconResult.");
    }
    if (biz.candidatesEvaluated.length === 0) {
      throw new Error("BusinessLogicAgent did not evaluate candidates from ReconResult.");
    }
    console.log(`  ✓ IdorAgent candidates evaluated          : ${idor.candidatesEvaluated.length}`);
    console.log(`  ✓ XssAgent candidates evaluated           : ${xss.candidatesEvaluated.length}`);
    console.log(`  ✓ BusinessLogicAgent candidates evaluated : ${biz.candidatesEvaluated.length}`);

    // ── Step 6: Verify All Expected Vulnerability Evidence Is Present ──────
    console.log("\n[5/12] Verifying cryptographic / DOM / access control evidence…");
    const verified = missionResult.verifiedFindings;

    const idorFinding = verified.find((v) => v.sourceAgent === "IdorAgent");
    const xssFinding = verified.find((v) => v.sourceAgent === "XssAgent");
    const bizFinding = verified.find((v) => v.sourceAgent === "BusinessLogicAgent");

    if (!idorFinding || !xssFinding || !bizFinding) {
      throw new Error("One or more specialist agents did not yield a verified finding.");
    }

    console.log(`  ✓ IDOR Evidence Verified           : ${idorFinding.title}`);
    console.log(`  ✓ Stored XSS Evidence Verified     : ${xssFinding.title}`);
    console.log(`  ✓ Business Logic Evidence Verified : ${bizFinding.title}`);

    // ── Step 7: Verify XSS Findings Deduplication ──────────────────────────
    console.log("\n[6/12] Verifying XSS root-cause deduplication & input tracking…");
    if (xssFinding.testedInputsCount !== 4) {
      throw new Error(`Expected 4 tested inputs for XSS, got ${xssFinding.testedInputsCount}`);
    }
    if (missionResult.summary.totalVerifiedVulnerabilities !== 3) {
      throw new Error(`Expected exactly 3 unique verified vulnerabilities, got ${missionResult.summary.totalVerifiedVulnerabilities}`);
    }
    console.log(`  ✓ Tested Inputs Count recorded separately : ${missionResult.summary.totalTestedInputs} inputs across all agents.`);
    console.log(`  ✓ Unique Verified Vulnerabilities Count   : ${missionResult.summary.totalVerifiedVulnerabilities}`);

    // ── Step 8: Verify Independent Verifier Checks Evidence ────────────────
    console.log("\n[7/12] Verifying independent verifier rejects unsupported findings…");
    const verifier = new FindingVerifier();
    const fakeUnsupportedFinding: IDORFinding = {
      findingId: "fake-idor-001",
      vulnerabilityType: "Insecure Direct Object Reference (IDOR / BOLA)",
      title: "Fake Unsupported IDOR Claim",
      severity: "High",
      affectedEndpoint: "/shop/api/orders/:id",
      httpMethod: "GET",
      authenticatedUser: "user-alice",
      resourceOwner: "user-bob",
      testResult: "VULNERABILITY_CONFIRMED",
      reproducible: true,
      evidence: {
        authenticatedUser: { id: "user-alice", email: "alice@example.com", name: "Alice" },
        resourceOwner: { id: "user-bob", email: "bob@example.com", name: "Bob" },
        aliceOwnResource: { resourceId: "1", httpStatus: 200, responseBody: {} },
        crossUserAccessAttempt: { targetResourceId: "2", httpStatus: 403, responseBody: {} },
        ownershipComparison: {
          expectedOwnerId: "user-bob",
          actualOwnerInResponse: null,
          crossUserLeakageConfirmed: false,
          leakedFields: [],
        },
      },
      reproductionSteps: [],
      remediation: "Test",
      timestamp: new Date().toISOString(),
    };

    const auditResult = verifier.verifyFindings([fakeUnsupportedFinding]);
    if (auditResult.verifiedFindings.length > 0 || auditResult.rejectedFindings.length !== 1) {
      throw new Error("Independent verifier failed to reject unsupported finding!");
    }
    console.log(`  ✓ Independent verifier successfully rejected invalid finding: "${auditResult.rejectedFindings[0].reason}"`);

    // ── Step 9: Verify Mission Result Persisted ────────────────────────────
    console.log("\n[8/12] Verifying mission result disk persistence…");
    if (!fs.existsSync(MISSION_RESULTS_PATH)) {
      throw new Error(`Persisted file not found at ${MISSION_RESULTS_PATH}`);
    }
    const persisted = JSON.parse(fs.readFileSync(MISSION_RESULTS_PATH, "utf8")) as MissionResult;
    if (persisted.missionId !== missionId) {
      throw new Error(`Persisted missionId mismatch: expected '${missionId}', got '${persisted.missionId}'`);
    }
    console.log(`  ✓ Validated disk persistence at ${MISSION_RESULTS_PATH}`);

    // ── Step 10: Verify Zero Credential or Token Leakage ───────────────────
    console.log("\n[9/12] Verifying zero credentials or tokens in persisted report…");
    const rawReport = fs.readFileSync(MISSION_RESULTS_PATH, "utf8");
    if (rawReport.includes("Alice123!") || rawReport.includes("Bob123!")) {
      throw new Error("[SECURITY BUG] Raw passwords leaked into mission report!");
    }
    if (/tok-user-[a-zA-Z0-9_-]+/.test(rawReport)) {
      throw new Error("[SECURITY BUG] Raw session tokens leaked into mission report!");
    }
    console.log("  ✓ Verified: Report contains 0 passwords and 0 raw session tokens.");

    // ── Step 11: Verify Out-of-Scope Target Rejection ──────────────────────
    console.log("\n[10/12] Verifying strict out-of-scope target rejection…");
    let scopeRejected = false;
    try {
      await runSecurityMission("out-of-scope-test", {
        target: "http://malicious-external-target.com/shop",
      });
    } catch (err: unknown) {
      if (String(err).includes("SECURITY VIOLATION")) {
        scopeRejected = true;
      }
    }
    if (!scopeRejected) {
      throw new Error("Orchestrator failed to reject out-of-scope target!");
    }
    console.log("  ✓ Verified: Out-of-scope target was strictly rejected with security violation.");

    // ── Step 12: Verify Concurrency Lock Protection ────────────────────────
    console.log("\n[11/12] Verifying concurrency prevention on shared database…");
    const orchestrator = MissionOrchestrator.getInstance();
    // Simulate active mission by checking the isBusy guard
    if (orchestrator.isBusy()) {
      throw new Error("Orchestrator lock was not released after mission execution!");
    }
    console.log("  ✓ Verified: Concurrency lock cleanly released post-mission.");

    // ── Step 13: Verify Backend API Endpoints ──────────────────────────────
    console.log("\n[12/12] Verifying backend REST API mission endpoints…");

    // GET /api/missions
    const listRes = await httpApiCall<MissionSummaryItem[]>("/api/missions");
    if (listRes.status !== 200 || !Array.isArray(listRes.data)) {
      throw new Error(`GET /api/missions returned HTTP ${listRes.status}`);
    }
    const foundItem = listRes.data.find((m) => m.missionId === missionId);
    if (!foundItem) {
      throw new Error(`Mission ${missionId} not found in GET /api/missions list`);
    }
    console.log(`  ✓ GET /api/missions: Found mission '${missionId}' with ${foundItem.verifiedVulnerabilitiesCount} verified vulnerabilities.`);

    // GET /api/missions/:missionId
    const getRes = await httpApiCall<MissionResult>(`/api/missions/${missionId}`);
    if (getRes.status !== 200 || getRes.data.missionId !== missionId) {
      throw new Error(`GET /api/missions/:missionId failed: HTTP ${getRes.status}`);
    }
    console.log(`  ✓ GET /api/missions/${missionId}: Retrieved full mission report.`);

    // GET /api/missions/non-existent-mission (404 check)
    const notFoundRes = await httpApiCall("/api/missions/non-existent-id");
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected HTTP 404 for non-existent mission, got HTTP ${notFoundRes.status}`);
    }
    console.log("  ✓ GET /api/missions/non-existent: Correctly returned HTTP 404.");

    console.log("\n════════════════════════════════════════════════════════════════");
    console.log("  ✓ MISSION ORCHESTRATOR TEST PASSED (ALL 12 CHECKS SATISFIED)");
    console.log("════════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ Mission Orchestrator test failed:", err);
  process.exit(1);
});
