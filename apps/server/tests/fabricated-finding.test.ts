/**
 * apps/server/tests/fabricated-finding.test.ts
 *
 * Verifies that the independent ReplayVerifier correctly rejects fabricated findings
 * (where all agent evidence booleans are set to true) when tested against a patched shop.
 */

import { FindingVerifier } from "../src/orchestrator/finding-verifier.js";
import { shopRouter } from "../src/shop/routes.js";
import express from "express";
import http from "node:http";

async function runFabricatedFindingTest() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  TEST: Fabricated Finding Rejection via Replay Verifier");
  console.log("════════════════════════════════════════════════════════════════\n");

  // 1. Enable patch for IDOR
  process.env.DEMO_PATCH_IDOR = "true";

  // 2. Start patched demo shop server on port 4001 for isolated test
  const app = express();
  app.use(express.json());
  app.use("/shop", shopRouter);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
  console.log("  ✓ Patched demo shop running on http://localhost:4001/shop");

  // 3. Create a fabricated finding with all evidence booleans set to true
  const fabricatedIdorFinding = {
    findingId: "FABRICATED-IDOR-001",
    sourceAgent: "IdorAgent",
    vulnerabilityType: "Insecure Direct Object Reference (IDOR / BOLA)",
    title: "Fabricated IDOR Claim",
    severity: "High",
    affectedEndpoint: "GET /shop/api/orders/:id",
    authenticatedUser: "alice@example.com",
    reproducible: true,
    testResult: "VULNERABILITY_CONFIRMED",
    evidence: {
      aliceOwnResource: { httpStatus: 200 },
      crossUserAccessAttempt: { httpStatus: 200 },
      ownershipComparison: {
        crossUserLeakageConfirmed: true,
        actualOwnerInResponse: "user-bob",
        leakedFields: ["id", "userId", "items"],
      },
    },
    reproductionSteps: ["1. Fabricated step"],
    remediation: "Check permissions",
    timestamp: new Date().toISOString(),
  };

  // 4. Verify with FindingVerifier against patched target
  const verifier = new FindingVerifier();
  const result = await verifier.verifyFindings([fabricatedIdorFinding as any], {
    targetScope: "http://localhost:4001/shop",
  });

  server.close();
  delete process.env.DEMO_PATCH_IDOR;

  console.log(`  Raw findings provided  : ${result.deduplicationSummary.rawFindingsCount}`);
  console.log(`  Verified findings count: ${result.verifiedFindings.length}`);
  console.log(`  Rejected findings count: ${result.rejectedFindings.length}`);

  if (result.rejectedFindings.length > 0) {
    console.log(`  ✓ Rejection Reason: ${result.rejectedFindings[0].reason}`);
  }

  if (result.verifiedFindings.length === 0 && result.rejectedFindings.length === 1) {
    console.log("\n  ✓ TEST PASSED: Fabricated finding was REJECTED by ReplayVerifier against patched shop.");
    process.exit(0);
  } else {
    console.error("\n  ✕ TEST FAILED: Fabricated finding was unexpectedly accepted!");
    process.exit(1);
  }
}

runFabricatedFindingTest().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
