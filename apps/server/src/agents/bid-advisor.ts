/**
 * apps/server/src/agents/bid-advisor.ts
 *
 * AI bid reasoning for the swarm, run on NEAR AI Cloud (TEE inference).
 *
 * After recon, each of the five bidding agents independently asks the model:
 * "given MY capabilities and THIS attack surface, how confident am I that I
 * can produce a verifiable finding for each task?" The answer (basis points)
 * becomes that agent's sealed bid confidence in the on-chain auction.
 *
 * Safety rules:
 *  - Only completions whose TEE signature + attestation binding verified
 *    (NearAiClient.verifiedChat) may set a bid. Anything else falls back to
 *    the scripted confidence and is labelled so.
 *  - The AI only sets bid confidence. Exploitation stays deterministic code,
 *    and payout still requires independent replay verification.
 */

import type { ReconResult } from "./recon/types.js";
import { NearAiClient, type NearAiVerification } from "../near/near-ai-client.js";

export const TASK_IDS = ["task-access-control", "task-injection", "task-business-logic"] as const;
export type TaskId = (typeof TASK_IDS)[number];

export interface AgentBidAdvice {
  agentId: string;
  confidences: Partial<Record<TaskId, number>>;
  rationale?: string;
  verification: NearAiVerification;
}

const AGENT_PROFILES: Record<string, string> = {
  IdorAgent:
    "Specialist. Has a differential access-control tester: logs in as two different users, requests each other's object IDs, and compares ownership fields. Cannot run browsers or inject scripts.",
  XssAgent:
    "Specialist. Has a Playwright Chromium harness that submits unique sentinel payloads into persistent inputs and detects real JavaScript execution in the rendered DOM. Does not test authorization or pricing.",
  BusinessLogicAgent:
    "Specialist. Has a checkout tamper module: reads the authoritative catalog price, submits a checkout with a manipulated client-side price, and checks the recorded order price. Does not test XSS or authorization.",
  GeneralistAlpha:
    "Generalist. Has NO specialised exploit module for any task; can only perform generic crawling. Any finding it produced would have to be independently reproduced to be paid.",
  GeneralistBeta:
    "Generalist (discount bidder). Has NO specialised exploit module for any task. Any finding it produced would have to be independently reproduced to be paid.",
};

function summarizeRecon(recon: ReconResult): string {
  const endpoints = recon.endpoints.slice(0, 25).map((e) => ({
    method: e.method,
    path: e.path,
    authRequired: e.authRequired,
    params: e.parameters.map((p) => `${p.in}:${p.name}`),
  }));
  const forms = recon.forms.slice(0, 10).map((f) => ({
    action: f.formAction,
    method: f.method,
    fields: f.fields.filter((x) => x.type !== "password").map((x) => `${x.type}:${x.name}`),
  }));
  return JSON.stringify({ summary: recon.summary, endpoints, forms });
}

function parseAdvice(text: string): { confidences: Partial<Record<TaskId, number>>; rationale?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const confidences: Partial<Record<TaskId, number>> = {};
    for (const t of TASK_IDS) {
      const v = Number(obj[t]);
      if (Number.isFinite(v)) confidences[t] = Math.max(1, Math.min(10000, Math.round(v)));
    }
    if (Object.keys(confidences).length !== TASK_IDS.length) return null;
    return { confidences, rationale: typeof obj.rationale === "string" ? obj.rationale.slice(0, 400) : undefined };
  } catch {
    return null;
  }
}

/**
 * Runs one verified NEAR AI completion per agent. Returns null if NEAR_AI_API_KEY is unset.
 */
export async function adviseBids(recon: ReconResult): Promise<AgentBidAdvice[] | null> {
  const client = NearAiClient.fromEnv();
  if (!client) return null;

  const surface = summarizeRecon(recon);
  const results: AgentBidAdvice[] = [];

  for (const [agentId, profile] of Object.entries(AGENT_PROFILES)) {
    const { content, verification } = await client.verifiedChat([
      {
        role: "system",
        content:
          "You are a security agent deciding how to bid in a sealed-bid bounty auction. Bids are paid ONLY if an independent verifier reproduces your finding, so overbidding on tasks you cannot do wastes the round. Reply with ONLY a JSON object.",
      },
      {
        role: "user",
        content:
          `Your agent id: ${agentId}\nYour capabilities: ${profile}\n\n` +
          `Recon of the in-scope target (localhost demo shop):\n${surface}\n\n` +
          `Tasks:\n- task-access-control: BOLA/IDOR authorization bypass\n- task-injection: stored XSS\n- task-business-logic: client price tampering at checkout\n\n` +
          `For each task, give your confidence (integer basis points 1-10000) that YOU can produce a finding an independent replay will confirm. ` +
          `Respond exactly as {"task-access-control": n, "task-injection": n, "task-business-logic": n, "rationale": "one sentence"}`,
      },
    ]);

    const parsed = content ? parseAdvice(content) : null;
    if (!parsed) verification.reasons.push("model output was not the required JSON");
    if (!parsed) verification.verified = false;

    results.push({
      agentId,
      confidences: parsed?.confidences ?? {},
      rationale: parsed?.rationale,
      verification,
    });
    console.log(
      `  [NEAR AI] ${agentId}: ${verification.verified ? "✓ verified" : "✕ unverified"} ` +
        (parsed ? JSON.stringify(parsed.confidences) : "(no usable advice)") +
        (verification.verified ? "" : ` — ${verification.reasons.join("; ")}`)
    );
  }
  return results;
}
