/**
 * apps/server/src/near/mcp-auditor.ts
 *
 * Pre-payout audit through the official NEAR MCP server (@nearai/near-mcp).
 *
 * Before any escrow is released, the orchestrator asks this auditor to
 * re-read chain state over MCP (stdio transport), independently of the
 * near-api-js path that submitted the transactions:
 *
 *   1. contract_call_raw_function_as_read_only → market.get_round
 *      The round must be `Settled` and its on-chain winner must equal the
 *      winner the coordinator recorded.
 *   2. account_list_access_keys → winner sub-account
 *      The public key the agent bids with (.agent-keys.json) must exist on
 *      chain as a FunctionCall key whose receiver is the market contract and
 *      whose methods are exactly commit_bid / reveal_bid.
 *
 * If either check fails, or MCP is unreachable, the audit does NOT approve
 * and the orchestrator refunds instead of paying.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MARKET_CONTRACT = process.env.NEAR_MARKET_CONTRACT || "market.harsha-swarm.testnet";
const NETWORK_ID = "testnet";

export interface McpRoundAudit {
  approved: boolean;
  source: "near-mcp";
  roundStatus?: string;
  onChainWinner?: string;
  winnerMatches: boolean;
  winnerBidKey?: string;
  winnerKeyScoped: boolean;
  reasons: string[];
  auditedAt: string;
}

type ToolResult = { content?: { type: string; text?: string }[]; isError?: boolean };

function toolText(result: unknown): string {
  const r = result as ToolResult;
  return (r.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

/** Extracts the first JSON value ({...} or [...]) from MCP tool text output. */
function parseJsonFromText<T>(text: string): T | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as T;
  } catch {
    return null;
  }
}

function loadAgentPublicKey(accountId: string): string | undefined {
  const file = path.resolve(process.cwd(), ".agent-keys.json");
  const rootFile = path.resolve(process.cwd(), "../../.agent-keys.json");
  for (const f of [file, rootFile]) {
    if (!fs.existsSync(f)) continue;
    try {
      const keys = JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, { publicKey?: string }>;
      if (keys[accountId]?.publicKey) return keys[accountId].publicKey;
    } catch {
      // ignore malformed file
    }
  }
  return undefined;
}

export class McpAuditor {
  private client: Client | null = null;

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("@nearai/near-mcp/package.json");
    const bin = path.join(path.dirname(pkgJson), "dist", "near-mcp.js");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, "run"],
      stderr: "pipe",
    });
    const client = new Client({ name: "bugbounty-swarm-auditor", version: "1.0.0" });
    await client.connect(transport);
    this.client = client;
    return client;
  }

  public async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
  }

  /**
   * Audits one settled round before payout. Never throws.
   */
  public async auditRoundBeforePayout(roundId: string, recordedWinner: string): Promise<McpRoundAudit> {
    const audit: McpRoundAudit = {
      approved: false,
      source: "near-mcp",
      winnerMatches: false,
      winnerKeyScoped: false,
      reasons: [],
      auditedAt: new Date().toISOString(),
    };

    try {
      const client = await this.connect();

      // 1. Round state via MCP view call
      const roundRes = await client.callTool({
        name: "contract_call_raw_function_as_read_only",
        arguments: {
          contractId: MARKET_CONTRACT,
          methodName: "get_round",
          networkId: NETWORK_ID,
          args: { round_id: roundId },
        },
      });
      const round = parseJsonFromText<{ status?: string; winner?: string | null }>(toolText(roundRes));
      audit.roundStatus = round?.status;
      audit.onChainWinner = round?.winner ?? undefined;
      audit.winnerMatches = !!round?.winner && round.winner === recordedWinner;

      if (!round) audit.reasons.push("MCP get_round returned no round");
      else if (round.status !== "Settled") audit.reasons.push(`Round status is ${round.status}, expected Settled`);
      if (round && !audit.winnerMatches) {
        audit.reasons.push(`On-chain winner ${round.winner ?? "(none)"} != recorded winner ${recordedWinner}`);
      }

      // 2. Winner's bidding key must be a FunctionCall key scoped to the market
      const bidKey = loadAgentPublicKey(recordedWinner);
      audit.winnerBidKey = bidKey;
      if (!bidKey) {
        audit.reasons.push(`No local bid key recorded for ${recordedWinner}`);
      } else {
        const keysRes = await client.callTool({
          name: "account_list_access_keys",
          arguments: { accountId: recordedWinner, networkId: NETWORK_ID },
        });
        const keys = parseJsonFromText<
          { public_key: string; access_key: { permission: unknown } }[]
        >(toolText(keysRes)) ?? [];
        const match = keys.find((k) => k.public_key === bidKey);
        const perm = match?.access_key.permission as
          | { FunctionCall?: { receiver_id: string; method_names: string[] } }
          | string
          | undefined;
        const fc = typeof perm === "object" ? perm.FunctionCall : undefined;
        const methods = [...(fc?.method_names ?? [])].sort().join(",");
        audit.winnerKeyScoped =
          !!fc && fc.receiver_id === MARKET_CONTRACT && methods === "commit_bid,reveal_bid";
        if (!match) audit.reasons.push(`Bid key ${bidKey} not found on ${recordedWinner}`);
        else if (!audit.winnerKeyScoped) audit.reasons.push(`Bid key on ${recordedWinner} is not scoped to ${MARKET_CONTRACT} commit_bid/reveal_bid`);
      }

      audit.approved = audit.reasons.length === 0;
    } catch (err) {
      audit.reasons.push(`NEAR MCP unavailable: ${(err as Error).message}`);
    }
    return audit;
  }
}
