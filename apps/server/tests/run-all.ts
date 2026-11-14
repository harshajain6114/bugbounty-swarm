/**
 * tests/run-all.ts
 *
 * Runs all three security tests in sequence.
 * Requires the demo shop server to be running on localhost:4000.
 *
 * Output: tests/results/security-test-results.json
 *
 * Exit codes:
 *   0 — all tests passed AND all vulnerabilities reproduced (expected state)
 *   1 — one or more tests did not reproduce the expected vulnerability
 *   2 — one or more tests had infrastructure errors
 *
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY — localhost-restricted.
 */

import http from "node:http";
import { spawnSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, "results");

// tsx binary — resolve relative to this file's location
const tsxBin = path.join(__dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");

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
    return { child: null };
  }

  console.log("  Starting demo shop server on port 4000…");
  const child = spawn("node", [tsxBin, "src/index.ts"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "ignore",
    detached: false,
  });

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await checkServerOnline()) {
      console.log("  ✓ Demo shop server started successfully.\n");
      return { child };
    }
  }

  throw new Error("Timed out waiting for demo shop server on port 4000");
}

interface TestEntry {
  id: string;
  file: string;
  label: string;
}

const TESTS: TestEntry[] = [
  { id: "IDOR-001",  file: "tests/idor-bola.test.ts",        label: "IDOR / BOLA" },
  { id: "XSS-001",   file: "tests/stored-xss.test.ts",       label: "Stored XSS (Playwright Browser Execution)" },
  { id: "PRICE-001", file: "tests/price-manipulation.test.ts", label: "Price Manipulation" },
];

interface TestRunResult {
  id: string;
  label: string;
  file: string;
  /** Exit 0 = test ran AND vuln reproduced; 1 = ran but not reproduced; 2 = infra error */
  exitCode: number;
  /** true when test executed without infrastructure errors (exit 0 or 1) */
  testPassed: boolean;
  /** true only when exit code is 0 (vulnerability was reproduced) */
  vulnerabilityReproduced: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
  resultFile: string;
}

function runTest(entry: TestEntry): TestRunResult {
  const start = Date.now();
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Running: ${entry.label} (${entry.id})`);
  console.log(`${"═".repeat(60)}`);

  const result = spawnSync(
    "node",
    [tsxBin, entry.file],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      timeout: 45_000,
    }
  );

  const durationMs = Date.now() - start;
  const exitCode = result.status ?? 2;

  // Print live output
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return {
    id: entry.id,
    label: entry.label,
    file: entry.file,
    exitCode,
    testPassed: exitCode === 0 || exitCode === 1,  // 0 or 1 = test ran without infra error
    vulnerabilityReproduced: exitCode === 0,         // only 0 = vuln confirmed
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs,
    resultFile: path.join(resultsDir, `${entry.id.toLowerCase().replace("-", "-")}-result.json`),
  };
}

function loadFinding(resultFile: string): unknown {
  try {
    const resolved = resultFile.includes("idor")
      ? path.join(resultsDir, "idor-result.json")
      : resultFile.includes("xss")
      ? path.join(resultsDir, "xss-result.json")
      : path.join(resultsDir, "price-result.json");
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, "utf8"));
    }
  } catch { /* ignore */ }
  return null;
}

async function main(): Promise<void> {
  console.log("\n" + "═".repeat(60));
  console.log("  BUGBOUNTY SWARM — Full Security Test Suite");
  console.log("  Target: http://localhost:4000/shop");
  console.log("═".repeat(60));

  const { child: serverProcess } = await ensureServerRunning();

  try {
    console.log(`  Running ${TESTS.length} tests...\n`);

    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

    const runs: TestRunResult[] = [];
    for (const test of TESTS) {
      runs.push(runTest(test));
    }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  RESULTS SUMMARY");
  console.log("═".repeat(60));

  let allTestsPassed = true;
  let allVulnsReproduced = true;
  let anyInfraError = false;

  for (const run of runs) {
    const finding = loadFinding(run.resultFile) as Record<string, unknown> | null;
    const statusIcon = run.vulnerabilityReproduced
      ? "⚠️  VULN CONFIRMED"
      : run.testPassed
      ? "✓  VULN NOT FOUND (fixed?)"
      : "✗  INFRA ERROR";

    console.log(`  [${run.id}] ${run.label}`);
    console.log(`         Status  : ${statusIcon}`);
    console.log(`         Exit    : ${run.exitCode}`);
    console.log(`         Duration: ${run.durationMs}ms`);

    if (run.id === "XSS-001" && finding) {
      console.log(`         payloadStored         : ${finding["payloadStored"]}`);
      console.log(`         dangerousSinkDetected : ${finding["dangerousSinkDetected"]}`);
      console.log(`         javascriptExecuted    : ${finding["javascriptExecuted"]}`);
      console.log(`         vulnerabilityReproduced: ${finding["vulnerabilityReproduced"]}`);
    }

    console.log();

    if (!run.testPassed)            anyInfraError = true;
    if (!run.vulnerabilityReproduced) allVulnsReproduced = false;
    if (!run.testPassed)            allTestsPassed = false;
  }

  // ── Write combined JSON ────────────────────────────────────────────────────
  const combinedResults = {
    suiteLabel: "BugBounty Swarm — VulnShop Security Audit",
    target: "http://localhost:4000/shop",
    testedAt: new Date().toISOString(),
    summary: {
      totalTests: runs.length,
      testsPassed: runs.filter((r) => r.testPassed).length,
      vulnerabilitiesReproduced: runs.filter((r) => r.vulnerabilityReproduced).length,
      infrastructureErrors: runs.filter((r) => !r.testPassed).length,
      allExpectedVulnsConfirmed: allVulnsReproduced && allTestsPassed,
      browserExecutionVerified: runs.some(
        (r) => r.id === "XSS-001" && r.vulnerabilityReproduced
      ),
    },
    tests: runs.map((run) => {
      const finding = loadFinding(run.resultFile) as Record<string, unknown> | null;
      return {
        id: run.id,
        label: run.label,
        file: run.file,
        exitCode: run.exitCode,
        /**
         * testPassed: true when the test script ran without infrastructure failures.
         * This is NOT the same as the vulnerability being reproduced.
         */
        testPassed: run.testPassed,
        /**
         * vulnerabilityReproduced: true only when the actual vulnerability
         * was exercised and confirmed by the test.
         */
        vulnerabilityReproduced: run.vulnerabilityReproduced,
        ...(run.id === "XSS-001" && finding
          ? {
              payloadStored: finding["payloadStored"],
              dangerousSinkDetected: finding["dangerousSinkDetected"],
              javascriptExecuted: finding["javascriptExecuted"],
            }
          : {}),
        durationMs: run.durationMs,
        finding,
      };
    }),
  };

  const outPath = path.join(resultsDir, "security-test-results.json");
  fs.writeFileSync(outPath, JSON.stringify(combinedResults, null, 2));

  console.log("═".repeat(60));
  console.log(`  Combined results: ${outPath}`);
  console.log("═".repeat(60));
  console.log(JSON.stringify(combinedResults.summary, null, 2));
  console.log("═".repeat(60) + "\n");

    // Exit codes:
    //  0 = all ran + all vulns reproduced
    //  1 = all ran but some vulns not reproduced
    //  2 = infrastructure errors
    if (anyInfraError) process.exit(2);
    if (!allVulnsReproduced) process.exit(1);
    process.exit(0);
  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main().catch((err: unknown) => {
  console.error("Runner error:", err);
  process.exit(2);
});
