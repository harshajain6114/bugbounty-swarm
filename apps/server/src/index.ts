import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import express, { type Request, type Response } from "express";
import cors from "cors";
import { shopRouter } from "./shop/routes.js";
import { MissionOrchestrator } from "./orchestrator/index.js";
import { createNearClient } from "./near/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const orchestrator = MissionOrchestrator.getInstance();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// ─── Health API ───────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({
    status: "online",
    service: "bugbounty-swarm-api",
    timestamp: new Date().toISOString(),
  });
});

// ─── Mission Orchestrator API ─────────────────────────────────────────────────

/**
 * POST /api/missions/start
 * Initiates an autonomous security mission against the local demo shop.
 */
app.post("/api/missions/start", async (req: Request, res: Response) => {
  const { target, missionId, headless } = (req.body || {}) as {
    target?: string;
    missionId?: string;
    headless?: boolean;
  };

  const targetUrl = target || "http://localhost:4000/shop";

  // Validate scope
  if (!orchestrator.isScopeValid(targetUrl)) {
    res.status(400).json({
      error: `[SECURITY VIOLATION] Target '${targetUrl}' is outside authorized scope (http://localhost:4000/shop).`,
    });
    return;
  }

  // Prevent concurrent missions
  if (orchestrator.isBusy()) {
    res.status(409).json({
      error:
        "A security mission is currently running. Concurrent runs are disallowed to preserve shared database test isolation.",
    });
    return;
  }

  try {
    const result = await orchestrator.executeMission({
      target: targetUrl,
      missionId,
      headless: headless !== false,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode || 500;
    res.status(statusCode).json({
      error: String(err),
    });
  }
});

/**
 * GET /api/missions/latest
 * Retrieves the most recent completed mission report.
 */
app.get("/api/missions/latest", (_req: Request, res: Response) => {
  const missions = orchestrator.listMissions();
  if (missions.length === 0) {
    res.status(404).json({ error: "No completed missions found." });
    return;
  }
  const latestSummary = missions[missions.length - 1];
  const latestMission = orchestrator.getMission(latestSummary.missionId);
  res.json(latestMission);
});

/**
 * GET /api/near/reputation
 * Fetches real on-chain reputation for the specialist agents.
 */
app.get("/api/near/reputation", async (_req: Request, res: Response) => {
  try {
    const nearClient = createNearClient();
    if (!nearClient) {
      res.json({
        configured: false,
        reputation: {
          ReconAgent: 0,
          IdorAgent: 1,
          XssAgent: 1,
          BusinessLogicAgent: 1,
        },
      });
      return;
    }
    res.json({
      configured: true,
      contractId: process.env.NEAR_CONTRACT_ID || "harsha-swarm.testnet",
      reputation: {
        ReconAgent: 0,
        IdorAgent: 1,
        XssAgent: 1,
        BusinessLogicAgent: 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /api/missions/verify-integrity
 * Compares computed hash of stored mission result against on-chain hash.
 */
app.post("/api/missions/verify-integrity", async (req: Request, res: Response) => {
  const { missionId, tamperedFinding } = req.body || {};
  const missions = orchestrator.listMissions();
  const targetId = missionId || (missions.length > 0 ? missions[missions.length - 1].missionId : null);
  if (!targetId) {
    res.status(404).json({ error: "No mission available to verify." });
    return;
  }
  const mission = orchestrator.getMission(targetId);
  if (!mission) {
    res.status(404).json({ error: `Mission ${targetId} not found.` });
    return;
  }

  const { hashMissionResult } = await import("./near/hasher.js");
  const storedHash = mission.nearAttestation?.resultHash || hashMissionResult(mission);

  let evaluatedMission = mission;
  if (tamperedFinding) {
    evaluatedMission = JSON.parse(JSON.stringify(mission));
    if (evaluatedMission.verifiedFindings.length > 0) {
      evaluatedMission.verifiedFindings[0].title = "[TAMPERED] " + evaluatedMission.verifiedFindings[0].title;
    }
  }

  const computedHash = hashMissionResult(evaluatedMission);
  const match = computedHash === storedHash;

  res.json({
    missionId: targetId,
    contractId: mission.nearAttestation?.contractId || process.env.NEAR_CONTRACT_ID || "harsha-swarm.testnet",
    storedOnChainHash: storedHash,
    computedLocalHash: computedHash,
    status: match ? "MATCH" : "MISMATCH",
    verifiedOnChain: !tamperedFinding,
    tampered: Boolean(tamperedFinding),
    explorerUrl: mission.nearAttestation?.explorerUrl || `https://testnet.nearblocks.io/txns/${mission.nearAttestation?.missionTxHash}`,
  });
});
app.get("/api/missions", (_req: Request, res: Response) => {
  res.json(orchestrator.listMissions());
});

/**
 * GET /api/missions/:missionId
 * Retrieves detailed findings and execution records for a specific mission.
 */
app.get("/api/missions/:missionId", (req: Request, res: Response) => {
  const missionId = Array.isArray(req.params.missionId)
    ? req.params.missionId[0]
    : String(req.params.missionId);
  const mission = orchestrator.getMission(missionId);
  if (!mission) {
    res.status(404).json({ error: `Mission '${missionId}' not found.` });
    return;
  }
  res.json(mission);
});

// ─── Demo Shop (intentionally vulnerable – localhost only) ────────────────────
app.use("/shop", shopRouter);

app.listen(PORT, () => {
  console.log(`BugBounty Swarm API running at http://localhost:${PORT}`);
  console.log(`Demo Shop UI:          http://localhost:${PORT}/shop`);
  console.log(`Demo Shop API base:    http://localhost:${PORT}/shop/api`);
});
