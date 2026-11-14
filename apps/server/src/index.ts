import express, { type Request, type Response } from "express";
import cors from "cors";
import { shopRouter } from "./shop/routes.js";
import { MissionOrchestrator } from "./orchestrator/index.js";

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
 * GET /api/missions
 * Lists available completed mission summaries.
 */
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
