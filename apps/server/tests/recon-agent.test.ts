/**
 * apps/server/tests/recon-agent.test.ts
 *
 * Test suite for the autonomous Reconnaissance Agent.
 * Validates browser exploration, attack-surface mapping, endpoint detection,
 * form discovery, authentication awareness, and strict localhost confinement.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { runReconMission, type ReconResult } from "../src/agents/recon/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET_URL = "http://localhost:4000/shop";
const RESULTS_PATH = path.resolve(__dirname, "results/recon-result.json");
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

  console.log("  Starting demo shop server for reconnaissance test…");
  const child = spawn("node", [tsxBin, "src/index.ts"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    detached: false,
  });

  // Poll until online or timeout
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkServerOnline()) {
      console.log("  ✓ Demo shop server started successfully.");
      return { child };
    }
  }

  throw new Error("Timed out waiting for demo shop server to start on http://localhost:4000");
}

async function runTest(): Promise<void> {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("  BUGBOUNTY SWARM — Recon Agent Verification Test");
  console.log("════════════════════════════════════════════════════════════\n");

  const { child: serverProcess } = await ensureServerRunning();

  try {
    const missionId = "recon-local-001";
    console.log(`\n[1/7] Launching Recon Agent mission (${missionId})…`);
    const result: ReconResult = await runReconMission(TARGET_URL, {
      missionId,
      maxPages: 20,
      outputFilePath: RESULTS_PATH,
      headless: true,
    });

    console.log("\n[2/7] Verifying agent mission status…");
    if (result.status !== "completed") {
      throw new Error(`Mission did not complete successfully. Status: ${result.status}, Errors: ${JSON.stringify(result.errors)}`);
    }
    console.log(`  ✓ Mission status: ${result.status}`);

    console.log("\n[3/7] Verifying homepage and page discovery…");
    const hasHomepage = result.pages.some(
      (p) => p.url === TARGET_URL || p.url === `${TARGET_URL}/` || p.path === "/shop"
    );
    if (!hasHomepage) {
      throw new Error(`Homepage (${TARGET_URL}) was not discovered in pages: ${result.pages.map((p) => p.url).join(", ")}`);
    }
    if (result.summary.pagesDiscovered < 3) {
      throw new Error(`Expected at least 3 pages discovered, got ${result.summary.pagesDiscovered}`);
    }
    console.log(`  ✓ Homepage discovered successfully.`);
    console.log(`  ✓ Total pages discovered: ${result.summary.pagesDiscovered}`);
    for (const p of result.pages) {
      console.log(`    - [${p.statusCode}] ${p.path} (Title: "${p.title}") | Auth required: ${p.authRequired}`);
    }

    console.log("\n[4/7] Verifying endpoint discovery…");
    if (result.summary.endpointsDiscovered < 2) {
      throw new Error(`Expected at least 2 endpoints discovered, got ${result.summary.endpointsDiscovered}`);
    }
    console.log(`  ✓ Total endpoints discovered: ${result.summary.endpointsDiscovered}`);
    for (const ep of result.endpoints) {
      console.log(`    - ${ep.method} ${ep.path} (Auth: ${ep.authRequired}, Source: ${ep.discoverySource})`);
    }

    console.log("\n[5/7] Verifying form and input field discovery…");
    if (result.summary.formsDiscovered < 1) {
      throw new Error(`Expected at least 1 form discovered, got ${result.summary.formsDiscovered}`);
    }
    console.log(`  ✓ Total forms/panels discovered: ${result.summary.formsDiscovered}`);
    for (const f of result.forms) {
      const fieldNames = f.fields.map((field) => `${field.name}(${field.type})`).join(", ");
      console.log(`    - Form ID: ${f.id} on ${f.pageUrl} | Action: ${f.formAction} | Fields: [${fieldNames}]`);
    }

    console.log("\n[6/7] Verifying authentication awareness…");
    const ordersPage = result.pages.find((p) => p.path.includes("/orders"));
    const authEndpoint = result.endpoints.find(
      (ep) => ep.path.includes("/orders") || ep.path.includes("/auth/me")
    );
    if (!ordersPage && !authEndpoint) {
      throw new Error("Neither orders page nor authenticated endpoint was identified.");
    }
    console.log(`  ✓ Authenticated pages identified: ${result.summary.authenticatedPages}`);
    console.log(`  ✓ Authenticated endpoints verified (e.g., ${authEndpoint?.path || "orders API"})`);

    console.log("\n[7/7] Verifying security boundaries (Zero external origins)…");
    if (result.metadata.externalOriginsVisited.length > 0) {
      throw new Error(`[SECURITY VIOLATION] External origins visited: ${result.metadata.externalOriginsVisited.join(", ")}`);
    }

    for (const page of result.pages) {
      const u = new URL(page.url);
      if ((u.hostname !== "localhost" && u.hostname !== "127.0.0.1") || u.port !== "4000") {
        throw new Error(`Page URL outside localhost:4000: ${page.url}`);
      }
    }
    for (const ep of result.endpoints) {
      const u = new URL(ep.url);
      if ((u.hostname !== "localhost" && u.hostname !== "127.0.0.1") || u.port !== "4000") {
        throw new Error(`Endpoint URL outside localhost:4000: ${ep.url}`);
      }
    }
    console.log(`  ✓ Confirmed strictly restricted to localhost:4000/shop.`);
    console.log(`  ✓ External origins visited: 0`);

    // Verify saved JSON file
    if (!fs.existsSync(RESULTS_PATH)) {
      throw new Error(`Results file does not exist at ${RESULTS_PATH}`);
    }
    const savedContent = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
    if (savedContent.missionId !== missionId || savedContent.target !== TARGET_URL) {
      throw new Error(`Saved JSON content validation failed.`);
    }
    console.log(`  ✓ Results JSON validated at ${RESULTS_PATH}`);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("  ✓ RECON AGENT TEST PASSED");
    console.log("════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error("\n❌ Recon Agent test failed:", err);
  process.exit(1);
});
