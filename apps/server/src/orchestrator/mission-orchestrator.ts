/**
 * apps/server/src/orchestrator/mission-orchestrator.ts
 *
 * Central Mission Orchestrator for BUGBOUNTY SWARM.
 * Coordinates autonomous reconnaissance and specialist security agents in a strict
 * sequential workflow, performs independent finding verification, and generates
 * unified tamper-evident mission reports.
 */

import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runReconMission } from "../agents/recon/index.js";
import { runIdorMission } from "../agents/idor/index.js";
import { runXssMission } from "../agents/xss/index.js";
import { runBusinessLogicMission } from "../agents/business-logic/index.js";
import { FindingVerifier } from "./finding-verifier.js";
import { adviseBids, type AgentBidAdvice } from "../agents/bid-advisor.js";
import {
  createNearClient,
  hashMissionResult,
  hashFindings,
  hashAgentFindings,
  MarketCoordinator,
  McpAuditor,
} from "../near/index.js";
import type {
  AgentExecutionRecord,
  MissionResult,
  MissionSummaryItem,
  NearAttestationRecord,
  OrchestratorOptions,
  RawFinding,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Thrown when a specialist did not win its task's auction round. */
class NotAwardedError extends Error {}

/**
 * Winning the auction is what grants execution: a specialist runs its task
 * only if the market contract selected it as the round winner.
 */
function assertAwarded(round: { winnerAgentId?: string; winnerAccount: string; roundId: string }, agentId: string): void {
  if (round.winnerAgentId !== agentId) {
    console.warn(`  ⚠ ${agentId} did not win ${round.roundId} (winner: ${round.winnerAccount}); task not executed.`);
    throw new NotAwardedError(`${agentId} was not awarded ${round.roundId}; winner was ${round.winnerAccount}`);
  }
}

export class MissionOrchestrator {
  private static instance: MissionOrchestrator;
  private isMissionRunning = false;
  private isDemoReset = false;
  private completedMissions = new Map<string, MissionResult>();
  private defaultResultsDir = path.resolve(__dirname, "../../tests/results");

  constructor() {
    this.loadPersistedMissions();
  }

  public static getInstance(): MissionOrchestrator {
    if (!MissionOrchestrator.instance) {
      MissionOrchestrator.instance = new MissionOrchestrator();
    }
    return MissionOrchestrator.instance;
  }

  /**
   * Loads previously persisted missions from results directory.
   */
  private loadPersistedMissions(): void {
    try {
      if (!fs.existsSync(this.defaultResultsDir)) return;
      const files = fs.readdirSync(this.defaultResultsDir);
      for (const file of files) {
        if (file.startsWith("mission") && file.endsWith(".json")) {
          try {
            const raw = fs.readFileSync(path.join(this.defaultResultsDir, file), "utf8");
            const parsed = JSON.parse(raw) as MissionResult;
            if (parsed.missionId && parsed.status) {
              this.completedMissions.set(parsed.missionId, parsed);
            }
          } catch {
            // ignore malformed
          }
        }
      }
    } catch {
      // Ignore disk parse errors
    }
  }

  /**
   * Validates target scope. Restricts to localhost:4000/shop.
   */
  public isScopeValid(targetUrl: string): boolean {
    try {
      const parsed = new URL(targetUrl);
      const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isPort4000 = parsed.port === "4000" || parsed.port === "";
      const isShop =
        parsed.pathname === "/shop" || parsed.pathname.startsWith("/shop/");

      return isLocalhost && isPort4000 && isShop;
    } catch {
      return false;
    }
  }

  public isBusy(): boolean {
    return this.isMissionRunning;
  }

  public resetDemoState(): void {
    this.isDemoReset = true;
    this.completedMissions.clear();
  }

  public getMission(missionId: string): MissionResult | null {
    if (this.isDemoReset) return null;
    this.loadPersistedMissions();
    return this.completedMissions.get(missionId) || null;
  }

  public listMissions(): MissionSummaryItem[] {
    if (this.isDemoReset) return [];
    this.loadPersistedMissions();
    return Array.from(this.completedMissions.values()).map((m) => ({
      missionId: m.missionId,
      target: m.target,
      status: m.status,
      startedAt: m.startedAt,
      completedAt: m.completedAt,
      durationMs: m.durationMs,
      verifiedVulnerabilitiesCount: m.summary.totalVerifiedVulnerabilities,
      agentsRunCount: m.agentsExecuted.length,
    }));
  }

  /**
   * Executes a complete autonomous security mission.
   */
  public async executeMission(options?: OrchestratorOptions): Promise<MissionResult> {
    const targetUrl = options?.target || "http://localhost:4000/shop";
    const missionId = options?.missionId || `mission-${Date.now()}`;
    const outputFilePath =
      options?.outputFilePath ||
      path.join(this.defaultResultsDir, "mission-result.json");

    // Enforce single-mission concurrency lock
    if (this.isMissionRunning) {
      const lockError = new Error(
        "A security mission is currently running. Concurrent runs are disallowed to preserve shared database test isolation."
      );
      (lockError as unknown as { statusCode: number }).statusCode = 409;
      throw lockError;
    }

    this.isMissionRunning = true;
    this.isDemoReset = false;
    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║           BUGBOUNTY SWARM — MISSION ORCHESTRATOR               ║`);
    console.log(`║  Mission ID : ${missionId.padEnd(48)} ║`);
    console.log(`║  Target     : ${targetUrl.padEnd(48)} ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

    const agentsExecuted: AgentExecutionRecord[] = [];
    const allRawFindings: RawFinding[] = [];

    let reconResult: Awaited<ReturnType<typeof runReconMission>> | undefined;
    let idorResult: Awaited<ReturnType<typeof runIdorMission>> | undefined;
    let xssResult: Awaited<ReturnType<typeof runXssMission>> | undefined;
    let bizlogicResult: Awaited<ReturnType<typeof runBusinessLogicMission>> | undefined;

    try {
      // ── Stage 1: Scope Validation ──────────────────────────────────────────
      if (!this.isScopeValid(targetUrl)) {
        throw new Error(
          `[SECURITY VIOLATION] Target '${targetUrl}' is outside authorized scope (http://localhost:4000/shop).`
        );
      }

      // ── Stage 2: Autonomous Reconnaissance ──────────────────────────────────
      console.log(`[Stage 1/4] Running Reconnaissance Agent…`);
      const reconStart = Date.now();
      const reconStartedAt = new Date().toISOString();

      try {
        reconResult = await runReconMission(targetUrl, {
          missionId: `${missionId}-recon`,
          headless: options?.headless !== false,
        });

        const reconDuration = Date.now() - reconStart;
        agentsExecuted.push({
          agentName: "ReconAgent",
          startedAt: reconStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: reconDuration,
          status: reconResult.status === "failed" ? "failed" : "completed",
          findingsCount: 0,
        });

        console.log(
          `  ✓ Recon complete: ${reconResult.pages.length} pages, ${reconResult.endpoints.length} endpoints, ${reconResult.forms.length} forms discovered.`
        );
      } catch (err) {
        agentsExecuted.push({
          agentName: "ReconAgent",
          startedAt: reconStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - reconStart,
          status: err instanceof NotAwardedError ? "skipped" : "failed",
          findingsCount: 0,
          error: String(err),
        });
        throw new Error(`Reconnaissance agent failed: ${String(err)}`);
      }

      // ── Stage 3: Sequential Specialist Agent Execution via Bounty Market ───
      console.log(`\n[Stage 2/4] Executing Specialist Security Agents via Swarm Bounty Market…`);
      const marketCoordinator = MarketCoordinator.getInstance();

      // Each agent reasons about its bid over the recon map on NEAR AI Cloud.
      // Only TEE-signature-verified answers may set a bid (else: scripted).
      let aiBidAdvice: AgentBidAdvice[] | null = null;
      try {
        if (process.env.NEAR_AI_API_KEY) {
          console.log(`\n  → Agents reasoning about bids on NEAR AI Cloud (TEE, verified)…`);
          aiBidAdvice = await adviseBids(reconResult);
        } else {
          console.log(`  ℹ NEAR_AI_API_KEY not set — agents use scripted bid confidences.`);
        }
      } catch (aiErr) {
        console.warn(`  ⚠ NEAR AI bid advice failed; using scripted confidences:`, (aiErr as Error).message);
        aiBidAdvice = null;
      }
      marketCoordinator.setBidAdvice(aiBidAdvice);

      // 1. IDOR / BOLA Agent
      console.log(`\n  → [1/3] Running Bounty Auction for: task-access-control…`);
      const idorRound = await marketCoordinator.runMarketRound("task-access-control", "BOLA / IDOR Authorization Bypass", `${missionId}-r1`);
      const idorStart = Date.now();
      const idorStartedAt = new Date().toISOString();
      try {
        assertAwarded(idorRound, "IdorAgent");
        idorResult = await runIdorMission(reconResult, `${missionId}-idor`, {
          targetScope: targetUrl,
        });
        const idorDuration = Date.now() - idorStart;
        agentsExecuted.push({
          agentName: "IdorAgent",
          startedAt: idorStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: idorDuration,
          status: idorResult.status === "failed" ? "failed" : "completed",
          findingsCount: idorResult.findings.length,
          error: idorResult.errors.length > 0 ? idorResult.errors.join("; ") : undefined,
        });
        allRawFindings.push(...idorResult.findings);
        console.log(`  ✓ IDOR Agent completed: ${idorResult.findings.length} raw finding(s).`);
      } catch (err) {
        agentsExecuted.push({
          agentName: "IdorAgent",
          startedAt: idorStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - idorStart,
          status: err instanceof NotAwardedError ? "skipped" : "failed",
          findingsCount: 0,
          error: String(err),
        });
        console.error(`  ✕ IDOR Agent failed:`, err);
      }

      // 2. Stored XSS Agent
      console.log(`\n  → [2/3] Running Bounty Auction for: task-injection…`);
      const xssRound = await marketCoordinator.runMarketRound("task-injection", "Stored XSS (Playwright DOM Injection)", `${missionId}-r2`);
      const xssStart = Date.now();
      const xssStartedAt = new Date().toISOString();
      try {
        assertAwarded(xssRound, "XssAgent");
        xssResult = await runXssMission(reconResult, `${missionId}-xss`, {
          targetScope: targetUrl,
          headless: options?.headless !== false,
        });
        const xssDuration = Date.now() - xssStart;
        agentsExecuted.push({
          agentName: "XssAgent",
          startedAt: xssStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: xssDuration,
          status: xssResult.status === "failed" ? "failed" : "completed",
          findingsCount: xssResult.findings.length,
          error: xssResult.errors.length > 0 ? xssResult.errors.join("; ") : undefined,
        });
        allRawFindings.push(...xssResult.findings);
        console.log(`  ✓ Stored XSS Agent completed: ${xssResult.findings.length} raw finding(s).`);
      } catch (err) {
        agentsExecuted.push({
          agentName: "XssAgent",
          startedAt: xssStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - xssStart,
          status: err instanceof NotAwardedError ? "skipped" : "failed",
          findingsCount: 0,
          error: String(err),
        });
        console.error(`  ✕ Stored XSS Agent failed:`, err);
      }

      // 3. Business Logic Agent
      console.log(`\n  → [3/3] Running Bounty Auction for: task-business-logic…`);
      const logicRound = await marketCoordinator.runMarketRound("task-business-logic", "Client Price Parameter Tampering", `${missionId}-r3`);
      const bizStart = Date.now();
      const bizStartedAt = new Date().toISOString();
      try {
        assertAwarded(logicRound, "BusinessLogicAgent");
        bizlogicResult = await runBusinessLogicMission(
          reconResult,
          `${missionId}-bizlogic`,
          { targetScope: targetUrl }
        );
        const bizDuration = Date.now() - bizStart;
        agentsExecuted.push({
          agentName: "BusinessLogicAgent",
          startedAt: bizStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: bizDuration,
          status: bizlogicResult.status === "failed" ? "failed" : "completed",
          findingsCount: bizlogicResult.findings.length,
          error:
            bizlogicResult.errors.length > 0
              ? bizlogicResult.errors.join("; ")
              : undefined,
        });
        allRawFindings.push(...bizlogicResult.findings);
        console.log(
          `  ✓ Business Logic Agent completed: ${bizlogicResult.findings.length} raw finding(s).`
        );
      } catch (err) {
        agentsExecuted.push({
          agentName: "BusinessLogicAgent",
          startedAt: bizStartedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - bizStart,
          status: err instanceof NotAwardedError ? "skipped" : "failed",
          findingsCount: 0,
          error: String(err),
        });
        console.error(`  ✕ Business Logic Agent failed:`, err);
      }

      // ── Stage 4: Independent Finding Verification & Replay Auditing ───────
      console.log(`\n[Stage 3/4] Independent Finding Verification & Replay Auditing…`);
      const verifier = new FindingVerifier();
      const { verifiedFindings, rejectedFindings, deduplicationSummary } =
        await verifier.verifyFindings(allRawFindings, {
          targetScope: targetUrl,
          headless: options?.headless !== false,
        });

      console.log(`  ✓ Total Raw Findings Ingested       : ${allRawFindings.length}`);
      console.log(`  ✓ Verified Unique Vulnerabilities   : ${verifiedFindings.length}`);
      console.log(`  ✓ Rejected / Unsupported Findings   : ${rejectedFindings.length}`);
      console.log(`  ✓ Deduplicated Secondary Findings   : ${deduplicationSummary.deduplicatedCount}`);

      // ── Stage 4b: Release Verification-Gated Market Payouts or Refunds ──────
      console.log(`\n[Stage 3b] Processing Verification-Gated Market Payouts & Refunds…`);
      const taskAgentMap: Record<string, string> = {
        "task-access-control": "IdorAgent",
        "task-injection": "XssAgent",
        "task-business-logic": "BusinessLogicAgent",
      };

      // Rounds settled on-chain get a second, independent read of chain state
      // through the NEAR MCP server before any escrow is released.
      const mcpAuditor = new McpAuditor();
      try {
        for (const round of marketCoordinator.getMarketRounds()) {
          if (!round.roundId.startsWith(missionId)) continue;

          // Pay only the agent the contract selected, and only if THAT agent's
          // finding for this task survived independent replay verification.
          const winnerAgent = round.winnerAgentId;
          const taskSpecialist = taskAgentMap[round.taskId];
          const hasVerifiedFinding =
            !!winnerAgent &&
            winnerAgent === taskSpecialist &&
            verifiedFindings.some((vf) => vf.sourceAgent === winnerAgent);

          // Proof of the refund decision: hash of the rejection record for this round.
          const refundProof = (reason: string) =>
            createHash("sha256")
              .update(JSON.stringify({
                roundId: round.roundId,
                winner: round.winnerAccount,
                reason,
                rejected: rejectedFindings
                  .filter((rf) => rf.sourceAgent === winnerAgent)
                  .map((rf) => ({ id: rf.originalFindingId, type: rf.vulnerabilityType, reason: rf.reason })),
              }))
              .digest("hex");

          if (!hasVerifiedFinding) {
            console.warn(`  ⚠ No verified finding from winner ${winnerAgent ?? "(none)"} for ${round.taskId} -> Refunding escrow to operator…`);
            await marketCoordinator.refundRound(round.roundId, refundProof("no_verified_finding_from_winner"));
            continue;
          }

          if (round.winnerSource === "on_chain_settle") {
            console.log(`  → NEAR MCP pre-payout audit for ${round.roundId}…`);
            const winnerBid = round.allBids.find((b) => b.account === round.winnerAccount);
            const audit = await mcpAuditor.auditRoundBeforePayout(round.roundId, round.winnerAccount, winnerBid?.commitTxHash);
            round.mcpAudit = audit;
            if (!audit.approved) {
              console.warn(`  ⚠ NEAR MCP audit REJECTED payout: ${audit.reasons.join("; ")} -> Refunding escrow…`);
              await marketCoordinator.refundRound(round.roundId, refundProof(`mcp_audit_rejected: ${audit.reasons.join("; ")}`));
              continue;
            }
            console.log(`  ✓ NEAR MCP audit approved: round ${audit.roundStatus}, winner ${audit.onChainWinner}, bid signed by scoped key.`);
          }

          // Payout proof = the winner's contribution hash over its replay-verified
          // findings (the same hash recorded for that agent in the attestation contract).
          const payoutProof = hashAgentFindings(winnerAgent!, verifiedFindings);
          console.log(`  ✓ Finding verified for ${round.taskId}. Releasing payout to winner (${round.winnerAccount}), proof ${payoutProof.slice(0, 16)}…`);
          await marketCoordinator.releasePayout(round.roundId, payoutProof);
        }
      } finally {
        await mcpAuditor.close();
      }

      // ── Stage 5: Synthesis & Summary Statistics ────────────────────────────
      console.log(`\n[Stage 4/4] Synthesizing Final Mission Artifacts…`);
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      let totalTestedInputs = 0;
      for (const vf of verifiedFindings) {
        totalTestedInputs += vf.testedInputsCount || 1;
      }

      // An agent that was not awarded its task (skipped) is not a failure.
      const allAgentsSucceeded = agentsExecuted.every((a) => a.status !== "failed");

      const missionResult: MissionResult = {
        missionId,
        target: targetUrl,
        status: allAgentsSucceeded && verifiedFindings.length > 0 ? "completed" : "failed",
        startedAt,
        completedAt,
        durationMs,
        reconSummary: reconResult.summary,
        agentsExecuted,
        agentResults: {
          recon: reconResult,
          idor: idorResult,
          xss: xssResult,
          businessLogic: bizlogicResult,
        },
        allFindings: allRawFindings,
        verifiedFindings,
        rejectedFindings,
        deduplicationSummary,
        summary: {
          totalDiscoveredPages: reconResult.pages.length,
          totalDiscoveredEndpoints: reconResult.endpoints.length,
          totalDiscoveredForms: reconResult.forms.length,
          totalAgentsRun: agentsExecuted.length,
          totalRawFindings: allRawFindings.length,
          totalVerifiedVulnerabilities: verifiedFindings.length,
          totalRejectedFindings: rejectedFindings.length,
          totalTestedInputs,
          allAgentsSucceeded,
        },
        metadata: {
          orchestratorVersion: "1.0.0",
          targetScope: targetUrl,
          completedAt,
        },
        marketRounds: marketCoordinator.getMarketRounds().filter((r) => r.roundId.startsWith(missionId)),
        aiBidAdvice: aiBidAdvice ?? undefined,
      };
      marketCoordinator.setBidAdvice(null);

      // ── Stage 5b: NEAR Blockchain Attestation (optional) ──────────────────
      // Runs AFTER finding verification, BEFORE saving results.
      // A NEAR failure must NEVER prevent mission result persistence.
      let nearAttestation: NearAttestationRecord | undefined;
      try {
        const nearClient = createNearClient();
        if (!nearClient) {
          console.log(
            `  ℹ NEAR attestation skipped — NEAR_ACCOUNT_ID / NEAR_PRIVATE_KEY / NEAR_CONTRACT_ID not configured.`
          );
          nearAttestation = { status: "skipped" };
        } else {
          console.log(`\n  → Submitting NEAR testnet attestation…`);
          const resultHash = hashMissionResult(missionResult);
          const findingsHash = hashFindings(verifiedFindings);

          const knownAgents = [
            "ReconAgent",
            "IdorAgent",
            "XssAgent",
            "BusinessLogicAgent",
          ] as const;
          const agentContributions = knownAgents.map((agentId) => ({
            agentId,
            contributionHash: hashAgentFindings(agentId, verifiedFindings),
            findingsContributed: agentsExecuted.find(
              (a) => a.agentName === agentId
            )?.findingsCount ?? 0,
          }));

          const record = await nearClient.submitMissionAttestation({
            missionId,
            resultHash,
            findingsHash,
            verifiedFindingCount: verifiedFindings.length,
            agentContributions,
          });

          nearAttestation = record;
          if (record.status === "confirmed") {
            console.log(`  ✓ NEAR attestation confirmed: ${record.missionTxHash}`);
            console.log(`    Explorer: ${record.explorerUrl}`);
          } else {
            console.warn(`  ⚠ NEAR attestation status: ${record.status} — ${record.errorMessage}`);
          }
        }
      } catch (nearErr) {
        console.error(`  ✕ NEAR attestation threw unexpectedly:`, nearErr);
        nearAttestation = {
          status: "failed",
          errorMessage: String(nearErr),
        };
      }

      if (nearAttestation) {
        missionResult.nearAttestation = nearAttestation;
      }

      // ── Stage 6: Persist Results ───────────────────────────────────────────
      const persistedResult = this.saveMissionResult(missionResult, outputFilePath);
      this.completedMissions.set(missionId, persistedResult);

      console.log(`\n════════════════════════════════════════════════════════════════`);
      console.log(`  MISSION ${missionId} COMPLETE`);
      console.log(`  Duration                     : ${durationMs}ms`);
      console.log(`  Discovered Endpoints         : ${reconResult.endpoints.length}`);
      console.log(`  Specialist Agents Executed   : ${agentsExecuted.length}`);
      console.log(`  Verified Vulnerabilities     : ${verifiedFindings.length}`);
      console.log(`  Tested Input Instances       : ${totalTestedInputs}`);
      console.log(`════════════════════════════════════════════════════════════════\n`);

      return persistedResult;
    } finally {
      this.isMissionRunning = false;
    }
  }

  /**
   * Sanitizes all sensitive authentication credentials or form default passwords
   * before persistence or transmission.
   */
  private sanitizeForPersistence(result: MissionResult): MissionResult {
    const cloned = JSON.parse(JSON.stringify(result)) as MissionResult;
    // Sanitize any password default values discovered in forms
    if (cloned.agentResults?.recon?.forms) {
      for (const form of cloned.agentResults.recon.forms) {
        for (const field of form.fields) {
          if (
            field.type === "password" ||
            field.name.toLowerCase().includes("password") ||
            field.id.toLowerCase().includes("password")
          ) {
            if (field.defaultValue) {
              field.defaultValue = "[REDACTED]";
            }
          }
        }
      }
    }
    return cloned;
  }

  /**
   * Persists mission result, strictly ensuring zero credentials or raw tokens leak.
   */
  private saveMissionResult(result: MissionResult, outputPath: string): MissionResult {
    const sanitized = this.sanitizeForPersistence(result);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonStr = JSON.stringify(sanitized, null, 2);

    // Security check: ensure no passwords or raw bearer tokens leak
    if (
      jsonStr.includes("Alice123!") ||
      jsonStr.includes("Bob123!") ||
      /tok-user-[a-zA-Z0-9_-]+/.test(jsonStr)
    ) {
      throw new Error(
        "[SECURITY CRITICAL] Password or raw session token detected in Mission report!"
      );
    }

    fs.writeFileSync(outputPath, jsonStr, "utf8");
    const idPath = path.join(dir, `mission-${sanitized.missionId}.json`);
    if (idPath !== outputPath) {
      try {
        fs.writeFileSync(idPath, jsonStr, "utf8");
      } catch {
        // ignore secondary write error
      }
    }
    console.log(`  ✓ Mission result persisted to: ${outputPath}`);
    return sanitized;
  }
}

/**
 * Functional entrypoint:
 * runSecurityMission(missionId?, options?) -> Promise<MissionResult>
 */
export async function runSecurityMission(
  missionId?: string,
  options?: OrchestratorOptions
): Promise<MissionResult> {
  const orchestrator = MissionOrchestrator.getInstance();
  return await orchestrator.executeMission({
    ...options,
    missionId: missionId || options?.missionId,
  });
}
