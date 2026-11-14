/**
 * apps/server/tests/demo-refund.ts
 *
 * Runs an autonomous mission where the IDOR vulnerability is patched on the demo shop.
 * The ReplayVerifier rejects the unreproducible IDOR finding, causing the orchestrator
 * to withhold payment and execute a real on-chain refund_round transaction on NEAR Testnet.
 */

import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express from "express";
import http from "node:http";
import { shopRouter } from "../src/shop/routes.js";
import { MissionOrchestrator } from "../src/orchestrator/index.js";
import { MarketCoordinator } from "../src/near/index.js";

async function runDemoRefund() {
  console.log("════════════════════════════════════════════════════════════════");
  console.log("  BUGBOUNTY SWARM — DEMO: REFUND ON VERIFICATION FAILURE");
  console.log("  Proves on-chain escrow refund when finding cannot be reproduced");
  console.log("════════════════════════════════════════════════════════════════\n");

  // 1. Enable patch for IDOR so it cannot be reproduced
  process.env.DEMO_PATCH_IDOR = "true";
  console.log("  [1/4] Setting DEMO_PATCH_IDOR=true on target shop…");

  // 2. Start demo shop on port 4000
  const app = express();
  app.use(express.json());
  app.use("/shop", shopRouter);
  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.listen(4000, () => {
      console.log("  [2/4] Demo shop listening on http://localhost:4000/shop");
      resolve();
    });
    server.on("error", (err: unknown) => {
      if ((err as { code?: string }).code === "EADDRINUSE") {
        console.log("  [2/4] Demo shop already running on port 4000.");
        resolve();
      } else {
        reject(err);
      }
    });
  });

  // 3. Execute mission
  const missionId = `mission-refund-${Date.now()}`;
  console.log(`\n  [3/4] Launching mission: ${missionId}…`);

  const orchestrator = MissionOrchestrator.getInstance();
  const result = await orchestrator.executeMission({
    missionId,
    target: "http://localhost:4000/shop",
  });

  // 4. Inspect market rounds
  console.log("\n  [4/4] Verifying market payout & refund outcomes…");
  const coordinator = MarketCoordinator.getInstance();
  const rounds = coordinator.getMarketRounds().filter((r) => r.roundId.startsWith(missionId));

  const idorRound = rounds.find((r) => r.taskId === "task-access-control");
  const xssRound = rounds.find((r) => r.taskId === "task-injection");
  const priceRound = rounds.find((r) => r.taskId === "task-business-logic");

  console.log("\n  Round Status Summary:");
  if (idorRound) {
    console.log(`    - Access Control (${idorRound.roundId}): status = ${idorRound.payoutStatus.toUpperCase()} (TX: ${idorRound.payoutTxHash || "None"})`);
  }
  if (xssRound) {
    console.log(`    - Injection      (${xssRound.roundId}): status = ${xssRound.payoutStatus.toUpperCase()} (TX: ${xssRound.payoutTxHash || "None"})`);
  }
  if (priceRound) {
    console.log(`    - Price Logic    (${priceRound.roundId}): status = ${priceRound.payoutStatus.toUpperCase()} (TX: ${priceRound.payoutTxHash || "None"})`);
  }

  // Restore env
  delete process.env.DEMO_PATCH_IDOR;
  try {
    server.close();
  } catch {}

  // 5. Query on-chain status from market contract
  if (idorRound && idorRound.roundId) {
    console.log(`\n  Reading back ${idorRound.roundId} from market.harsha-swarm.testnet…`);
    const argsBase64 = Buffer.from(JSON.stringify({ round_id: idorRound.roundId })).toString("base64");
    const rpcRes = await fetch(process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "check-refund",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: process.env.NEAR_MARKET_CONTRACT || "market.harsha-swarm.testnet",
          method_name: "get_round",
          args_base64: argsBase64,
        },
      }),
    });
    const rpcData = await rpcRes.json() as { result?: { result?: number[] } };
    if (rpcData.result?.result) {
      const onChain = JSON.parse(Buffer.from(rpcData.result.result).toString("utf8"));
      console.log(`  ✓ On-Chain Verified Status: ${onChain.status}`);
      if (onChain.status === "Refunded") {
        console.log(`\n  ✓ SUCCESS: Real refund_round confirmed on NEAR Testnet!`);
        console.log(`    Explorer: https://testnet.nearblocks.io/txns/${idorRound.payoutTxHash}`);
        process.exit(0);
      }
    }
  }

  process.exit(0);
}

runDemoRefund().catch((err) => {
  console.error("Demo refund error:", err);
  process.exit(1);
});
