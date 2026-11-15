/**
 * apps/server/src/near/market-coordinator.ts
 *
 * Implements scripted agent bidding, commit-reveal rounds on market.harsha-swarm.testnet,
 * deterministic settlement, and gated verification payouts.
 *
 * NO hardcoded baseline rounds or recycled fake hashes.
 * Every on-chain transaction outcome is verified against execution success.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { createNearClient, loadNearConfig, isFinalExecutionSuccessful } from "./near-client.js";
import type { MarketRoundResult, MarketBidStrategy, BidSigningMode } from "./market-types.js";
import { priceBountyViaIntents } from "./intents-pricer.js";
import type { AgentBidAdvice, TaskId } from "../agents/bid-advisor.js";

const MARKET_CONTRACT = process.env.NEAR_MARKET_CONTRACT || "market.harsha-swarm.testnet";
const OPERATOR_ACCOUNT = process.env.NEAR_ACCOUNT_ID || "harsha-swarm.testnet";

export class MarketCoordinator {
  private static instance: MarketCoordinator;
  private marketState: MarketRoundResult[] = [];
  private isReset = false;

  constructor() {
    // Initial empty state — no hardcoded or fake transaction rounds
  }

  public static getInstance(): MarketCoordinator {
    if (!MarketCoordinator.instance) {
      MarketCoordinator.instance = new MarketCoordinator();
    }
    return MarketCoordinator.instance;
  }

  public resetMarketState(): void {
    this.isReset = true;
    this.marketState = [];
  }

  public getMarketRounds(): MarketRoundResult[] {
    if (this.isReset) return [];
    return this.marketState;
  }

  /** Verified NEAR AI bid advice for the current mission (see agents/bid-advisor.ts). */
  private bidAdvice: AgentBidAdvice[] | null = null;

  public setBidAdvice(advice: AgentBidAdvice[] | null): void {
    this.bidAdvice = advice;
  }

  /**
   * Builds each agent's bid. Confidence comes from that agent's NEAR AI
   * reasoning when (and only when) its TEE-signed completion verified;
   * otherwise the scripted default is used. The source is recorded per bid.
   */
  public generateBids(taskId: string): MarketBidStrategy[] {
    return this.scriptedBids(taskId).map((b) => {
      const advice = this.bidAdvice?.find((a) => a.agentId === b.agentId);
      const aiBps = advice?.confidences[taskId as TaskId];
      if (advice?.verification.verified && aiBps !== undefined) {
        return {
          ...b,
          confidenceBps: aiBps,
          confidenceSource: "near_ai_tee_verified" as const,
          aiChatId: advice.verification.chatId,
          aiSigningAddress: advice.verification.signingAddress,
        };
      }
      return { ...b, confidenceSource: "scripted" as const };
    });
  }

  /** Scripted defaults (used when NEAR AI is not configured or did not verify). */
  private scriptedBids(taskId: string): MarketBidStrategy[] {
    const isAccess = taskId === "task-access-control";
    const isInject = taskId === "task-injection";
    const isLogic = taskId === "task-business-logic";

    return [
      {
        agentId: "IdorAgent",
        account: "idor.harsha-swarm.testnet",
        confidenceBps: isAccess ? 9800 : 2000,
        costYocto: "10000000000", // scripted cost units (10 billion)
        salt: `salt-idor-${Date.now()}`,
      },
      {
        agentId: "XssAgent",
        account: "xss.harsha-swarm.testnet",
        confidenceBps: isInject ? 9900 : 2500,
        costYocto: "10000000000",
        salt: `salt-xss-${Date.now()}`,
      },
      {
        agentId: "BusinessLogicAgent",
        account: "logic.harsha-swarm.testnet",
        confidenceBps: isLogic ? 9700 : 1500,
        costYocto: "10000000000",
        salt: `salt-logic-${Date.now()}`,
      },
      {
        agentId: "GeneralistAlpha",
        account: "gen1.harsha-swarm.testnet",
        confidenceBps: 6000,
        costYocto: "8000000000", // discount bidder
        salt: `salt-gen1-${Date.now()}`,
      },
      {
        agentId: "GeneralistBeta",
        account: "gen2.harsha-swarm.testnet",
        confidenceBps: 5500,
        costYocto: "6000000000", // ultra-discount bidder
        salt: `salt-gen2-${Date.now()}`,
      },
    ];
  }

  /**
   * Loads access key for a sub-account from local storage.
   */
  private loadAgentSigner(
    accountId: string,
    provider: unknown,
    nearApi: typeof import("near-api-js")
  ): { signerAccount: unknown; signingMode: "agent_key" } | null {
    const { KeyPair, KeyPairSigner, Account } = nearApi;

    // 1. Check .agent-keys.json in workspace
    const agentKeysFile = path.resolve(process.cwd(), ".agent-keys.json");
    if (fs.existsSync(agentKeysFile)) {
      try {
        const agentKeys = JSON.parse(fs.readFileSync(agentKeysFile, "utf8"));
        if (agentKeys[accountId]?.privateKey) {
          const kp = KeyPair.fromString(agentKeys[accountId].privateKey);
          const signer = new KeyPairSigner(kp);
          return {
            signerAccount: new Account(accountId, provider as any, signer),
            signingMode: "agent_key",
          };
        }
      } catch {}
    }

    // 2. Check ~/.near-credentials/testnet/<accountId>.json
    const credPath = path.join(os.homedir(), ".near-credentials", "testnet", `${accountId}.json`);
    if (fs.existsSync(credPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(credPath, "utf8"));
        const key = raw.private_key || raw.secret_key;
        if (key) {
          const kp = KeyPair.fromString(key);
          const signer = new KeyPairSigner(kp);
          return {
            signerAccount: new Account(accountId, provider as any, signer),
            signingMode: "agent_key",
          };
        }
      } catch {}
    }

    return null;
  }

  /**
   * Returns the operator account signing with its FunctionCall key scoped to
   * settle_round / payout / refund_round on the market (provisioned by
   * scripts/provision-agents.js). Falls back to the full-access key from .env
   * only if no scoped key is provisioned; the mode is recorded on the round.
   */
  private loadOperatorScopedAccount(
    provider: unknown,
    nearApi: typeof import("near-api-js"),
    fullAccessAccount: unknown
  ): { account: any; mode: "function_call_key" | "full_access_key" } {
    const { KeyPair, KeyPairSigner, Account } = nearApi;
    for (const f of [path.resolve(process.cwd(), ".agent-keys.json"), path.resolve(process.cwd(), "../../.agent-keys.json")]) {
      if (!fs.existsSync(f)) continue;
      try {
        const op = JSON.parse(fs.readFileSync(f, "utf8")).__operator__;
        if (op?.privateKey && op.accountId === OPERATOR_ACCOUNT && op.contractId === MARKET_CONTRACT) {
          const signer = new KeyPairSigner(KeyPair.fromString(op.privateKey));
          return { account: new Account(OPERATOR_ACCOUNT, provider as any, signer), mode: "function_call_key" };
        }
      } catch {
        // ignore malformed key file
      }
    }
    return { account: fullAccessAccount, mode: "full_access_key" };
  }

  /**
   * Read-only view call against the market contract (no gas, no signing).
   * Returns null on any RPC/parse error.
   */
  private async viewCall<T>(rpcUrl: string, methodName: string, args: Record<string, unknown>): Promise<T | null> {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: `view-${methodName}`,
          method: "query",
          params: {
            request_type: "call_function",
            finality: "optimistic",
            account_id: MARKET_CONTRACT,
            method_name: methodName,
            args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
          },
        }),
      });
      const data = (await res.json()) as { result?: { result?: number[] } };
      if (!data.result?.result) return null;
      return JSON.parse(Buffer.from(data.result.result).toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  /**
   * Executes a complete market auction round for a security task.
   */
  public async runMarketRound(
    taskId: string,
    taskName: string,
    roundId: string
  ): Promise<MarketRoundResult> {
    this.isReset = false;
    console.log(`\n  [MARKET] ── Opening Auction Round: ${roundId} (${taskName}) ──`);
    const bids = this.generateBids(taskId);
    const nearClient = createNearClient();

    // Read each bidder's current on-chain reputation (view call, no gas) so the
    // local preview uses exactly the contract's formula:
    //   score = (confidence_bps * (1 + reputation) * 1e12) / cost_yocto
    const rpcUrl = loadNearConfig()?.rpcUrl;
    const reputations: Record<string, number> = {};
    for (const b of bids) {
      reputations[b.account] = nearClient && rpcUrl
        ? Number((await this.viewCall<number>(rpcUrl, "get_agent_reputation", { agent: b.account })) ?? 0)
        : 0;
    }

    const scoredBids = bids.map((b) => {
      const rep = reputations[b.account] ?? 0;
      const score =
        (BigInt(b.confidenceBps) * BigInt(1 + rep) * 1_000_000_000_000n) / BigInt(b.costYocto);
      return {
        agentId: b.agentId,
        account: b.account,
        confidenceBps: b.confidenceBps,
        costYocto: b.costYocto,
        salt: b.salt,
        confidenceSource: b.confidenceSource,
        aiChatId: b.aiChatId,
        aiSigningAddress: b.aiSigningAddress,
        reputation: rep,
        revealed: false,
        score: Number(score),
        commitTxHash: undefined as string | undefined,
        revealTxHash: undefined as string | undefined,
        relayed: false,
        signingMode: "agent_key" as BidSigningMode,
      };
    }).sort((a, b) => b.score - a.score || (a.account < b.account ? -1 : 1));

    // Local preview only. When testnet is configured, the authoritative winner
    // is read back from the contract after settle_round (see below).
    const previewWinner = scoredBids[0];
    console.log(
      `  [MARKET] Local preview winner: ${previewWinner.agentId} (${previewWinner.account}) score ${previewWinner.score}`
    );

    // Price the bounty in USD via a live NEAR Intents 1Click dry quote; the
    // quoted wNEAR amount becomes the escrow attached to open_round.
    const bountyPricing = await priceBountyViaIntents();
    if (bountyPricing.pricingSource === "near_intents_1click_dry_quote") {
      console.log(
        `  [MARKET] ✓ 1Click dry quote: $${bountyPricing.bountyUsd} USDC ≈ ${bountyPricing.escrowNear} NEAR (correlationId ${bountyPricing.quote?.correlationId})`
      );
    } else {
      console.warn(`  [MARKET] ⚠ 1Click quote unavailable (${bountyPricing.error}); using fixed ${bountyPricing.escrowNear} NEAR escrow`);
    }

    let openTxHash: string | undefined;
    let settleTxHash: string | undefined;
    let winnerAccount = previewWinner.account;
    let winnerScore = previewWinner.score;
    let winnerSource: MarketRoundResult["winnerSource"] = nearClient ? "unsettled" : "local_simulation";
    const errors: string[] = [];
    const operatorKeyModes: NonNullable<MarketRoundResult["operatorKeyModes"]> = {
      open: nearClient ? "full_access_key" : undefined,
    };
    const commitTxHashes: Record<string, string> = {};
    const revealTxHashes: Record<string, string> = {};

    // Submit on-chain if testnet configured
    if (nearClient) {
      try {
        const api = await import("near-api-js");
        const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;
        const config = loadNearConfig()!;
        const keyPair = KeyPair.fromString(config.privateKey as `ed25519:${string}`);
        const signer = new KeyPairSigner(keyPair);
        const provider = new JsonRpcProvider({ url: config.rpcUrl });
        const operatorAccount = new Account(config.accountId, provider, signer);

        console.log(`  [MARKET] Submitting open_round transaction on ${MARKET_CONTRACT}…`);
        const openTx = await operatorAccount.callFunctionRaw({
          contractId: MARKET_CONTRACT,
          methodName: "open_round",
          args: {
            round_id: roundId,
            task_id: taskId,
          },
          gas: BigInt("30000000000000"),
          deposit: BigInt(bountyPricing.escrowYocto), // escrow priced by 1Click quote
        });

        if (isFinalExecutionSuccessful(openTx)) {
          openTxHash = typeof openTx.transaction.hash === "string"
            ? openTx.transaction.hash
            : Buffer.from(openTx.transaction.hash).toString("base64");
          console.log(`  [MARKET] ✓ Round opened TX: ${openTxHash}`);
        } else {
          console.error(`  [MARKET] ✕ open_round execution failed:`, openTx.status);
        }

        // Phase 1: Each agent signs commit_bid from its OWN sub-account using its
        // function-call key (scoped to commit_bid/reveal_bid on the market).
        // There is no operator fallback: an agent without a key does not bid.
        console.log(`  [MARKET] Submitting commit_bid from each agent's sub-account…`);
        for (const b of scoredBids) {
          try {
            const agentSignerResult = this.loadAgentSigner(b.account, provider, api);
            if (!agentSignerResult) {
              b.signingMode = "missing_key";
              const msg = `No function-call key for ${b.account}; bid not submitted (run npm run provision:agents)`;
              errors.push(msg);
              console.warn(`    ⚠ ${msg}`);
              continue;
            }
            const bidderAcc: any = agentSignerResult.signerAccount;
            b.signingMode = "agent_key";
            b.relayed = false;

            const preimage = `${b.account}|${taskId}|${b.confidenceBps}|${b.costYocto}|${b.salt}`;
            const commitment = createHash("sha256").update(preimage).digest("hex");
            const commitTx = await bidderAcc.callFunctionRaw({
              contractId: MARKET_CONTRACT,
              methodName: "commit_bid",
              args: { round_id: roundId, commitment },
              gas: BigInt("20000000000000"),
              deposit: BigInt(0),
            });

            if (isFinalExecutionSuccessful(commitTx)) {
              const hash = typeof commitTx.transaction.hash === "string"
                ? commitTx.transaction.hash
                : Buffer.from(commitTx.transaction.hash).toString("base64");
              commitTxHashes[b.agentId] = hash;
              b.commitTxHash = hash;
              console.log(`    ✓ commit_bid [${b.agentId}]: ${hash} (${b.signingMode})`);
            } else {
              console.error(`    ✕ commit_bid failed execution for ${b.agentId}:`, commitTx.status);
            }
          } catch (cErr) {
            console.error(`    ✕ commit_bid error for ${b.agentId}:`, (cErr as Error).message);
          }
        }

        // Phase 2: Reveal from the same agent sub-account (only bids that committed).
        console.log(`  [MARKET] Submitting reveal_bid from each committed agent…`);
        for (const b of scoredBids) {
          if (!b.commitTxHash) continue;
          try {
            const agentSignerResult = this.loadAgentSigner(b.account, provider, api);
            if (!agentSignerResult) continue;
            const bidderAcc: any = agentSignerResult.signerAccount;

            const revealTx = await bidderAcc.callFunctionRaw({
              contractId: MARKET_CONTRACT,
              methodName: "reveal_bid",
              args: {
                round_id: roundId,
                confidence_bps: b.confidenceBps,
                cost_yocto: Number(b.costYocto),
                salt: b.salt,
              },
              gas: BigInt("20000000000000"),
              deposit: BigInt(0),
            });

            if (isFinalExecutionSuccessful(revealTx)) {
              const hash = typeof revealTx.transaction.hash === "string"
                ? revealTx.transaction.hash
                : Buffer.from(revealTx.transaction.hash).toString("base64");
              revealTxHashes[b.agentId] = hash;
              b.revealTxHash = hash;
              b.revealed = true;
              console.log(`    ✓ reveal_bid [${b.agentId}]: ${hash}`);
            } else {
              console.error(`    ✕ reveal_bid failed execution for ${b.agentId}:`, revealTx.status);
            }
          } catch (rErr) {
            console.error(`    ✕ reveal_bid error for ${b.agentId}:`, (rErr as Error).message);
          }
        }

        // Phase 3: Settle round as operator, signed with the scoped FunctionCall key
        const scopedOp = this.loadOperatorScopedAccount(provider, api, operatorAccount);
        operatorKeyModes.settle = scopedOp.mode;
        console.log(`  [MARKET] Submitting settle_round as operator (${scopedOp.mode})…`);
        const settleTx = await scopedOp.account.callFunctionRaw({
          contractId: MARKET_CONTRACT,
          methodName: "settle_round",
          args: { round_id: roundId },
          gas: BigInt("30000000000000"),
          deposit: BigInt(0),
        });

        if (isFinalExecutionSuccessful(settleTx)) {
          settleTxHash = typeof settleTx.transaction.hash === "string"
            ? settleTx.transaction.hash
            : Buffer.from(settleTx.transaction.hash).toString("base64");
          console.log(`  [MARKET] ✓ Round settled TX: ${settleTxHash}`);

          // The contract is the source of truth for the winner: read it back.
          const onChainRound = await this.viewCall<{ winner?: string | null; status?: string }>(
            config.rpcUrl, "get_round", { round_id: roundId }
          );
          if (onChainRound?.winner) {
            winnerAccount = onChainRound.winner;
            winnerSource = "on_chain_settle";
            const w = scoredBids.find((b) => b.account === winnerAccount);
            winnerScore = w?.score ?? 0;
            if (winnerAccount !== previewWinner.account) {
              console.warn(`  [MARKET] ⚠ On-chain winner ${winnerAccount} differs from local preview ${previewWinner.account}; using on-chain result.`);
            }
            console.log(`  [MARKET] ✓ On-chain winner (get_round): ${winnerAccount} [status ${onChainRound.status}]`);
          } else {
            errors.push("settle_round succeeded but get_round returned no winner");
          }
        } else {
          errors.push("settle_round failed execution");
          console.error(`  [MARKET] ✕ settle_round failed execution:`, settleTx.status);
        }
      } catch (err) {
        errors.push(`On-chain execution error: ${(err as Error).message}`);
        console.warn(`  [MARKET] ⚠ On-chain execution notice:`, (err as Error).message);
      }
    } else {
      console.log(`  [MARKET] LOCAL SIMULATION: Testnet credentials not loaded. Sealed bidding executed locally; nothing is signed or sent.`);
      for (const b of scoredBids) {
        b.signingMode = "local_simulation";
        b.revealed = true;
      }
    }

    const winnerBid = scoredBids.find((b) => b.account === winnerAccount);
    const roundResult: MarketRoundResult = {
      roundId,
      taskId,
      taskName,
      rewardNear: bountyPricing.escrowNear,
      bountyPricing,
      openTxHash,
      winnerAccount,
      winnerAgentId: winnerBid?.agentId,
      winnerScore: String(winnerScore),
      winnerSource,
      allBids: scoredBids,
      commitTxHashes,
      revealTxHashes,
      settleTxHash,
      payoutStatus: !nearClient
        ? "simulated"
        : openTxHash && winnerSource === "on_chain_settle" ? "pending" : "failed",
      errors: errors.length > 0 ? errors : undefined,
      operatorKeyModes: nearClient ? operatorKeyModes : undefined,
    };

    this.marketState.push(roundResult);
    return roundResult;
  }

  /**
   * Releases escrowed payout only after independent verification confirmation.
   */
  public async releasePayout(roundId: string): Promise<string | undefined> {
    const round = this.marketState.find((r) => r.roundId === roundId);
    if (!round) return undefined;

    console.log(`  [MARKET] ── Releasing Verification-Gated Payout for ${roundId} ──`);
    const nearClient = createNearClient();
    if (!nearClient) {
      console.log(`  [MARKET] LOCAL SIMULATION: Payout recorded locally (no chain configured)`);
      round.payoutStatus = "simulated";
      return undefined;
    }
    if (round.winnerSource !== "on_chain_settle") {
      console.error(`  [MARKET] ✕ Round ${roundId} was not settled on-chain; payout not attempted.`);
      round.payoutStatus = "failed";
      return undefined;
    }

    try {
      const api = await import("near-api-js");
      const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;
      const config = loadNearConfig()!;
      const keyPair = KeyPair.fromString(config.privateKey as `ed25519:${string}`);
      const signer = new KeyPairSigner(keyPair);
      const provider = new JsonRpcProvider({ url: config.rpcUrl });
      const fullAccess = new Account(config.accountId, provider, signer);
      const scoped = this.loadOperatorScopedAccount(provider, api, fullAccess);
      round.operatorKeyModes = { ...round.operatorKeyModes, release: scoped.mode };
      const account = scoped.account;

      const payoutTx = await account.callFunctionRaw({
        contractId: MARKET_CONTRACT,
        methodName: "payout",
        args: { round_id: roundId },
        gas: BigInt("30000000000000"),
        deposit: BigInt(0),
      });

      const payoutTxHash = typeof payoutTx.transaction.hash === "string"
        ? payoutTx.transaction.hash
        : Buffer.from(payoutTx.transaction.hash).toString("base64");

      if (isFinalExecutionSuccessful(payoutTx)) {
        round.payoutTxHash = payoutTxHash;
        round.payoutStatus = "confirmed";
        console.log(`  [MARKET] ✓ Reward Payout Confirmed TX: ${payoutTxHash}`);
        return payoutTxHash;
      } else {
        console.error(`  [MARKET] ✕ Payout transaction failed execution:`, payoutTx.status);
        round.payoutStatus = "failed";
        return undefined;
      }
    } catch (err) {
      console.warn(`  [MARKET] ⚠ Payout call error:`, (err as Error).message);
      round.payoutStatus = "failed";
      return undefined;
    }
  }

  /**
   * Refunds escrowed payout to operator when independent finding verification fails.
   */
  public async refundRound(roundId: string): Promise<string | undefined> {
    const round = this.marketState.find((r) => r.roundId === roundId);
    if (!round) return undefined;

    console.log(`  [MARKET] ── Refunding Escrow for ${roundId} (Verification Failed) ──`);
    const nearClient = createNearClient();
    if (!nearClient) {
      console.log(`  [MARKET] LOCAL SIMULATION: Escrow refund recorded locally (no chain configured)`);
      round.payoutStatus = "simulated";
      return undefined;
    }
    if (round.winnerSource !== "on_chain_settle") {
      console.error(`  [MARKET] ✕ Round ${roundId} was not settled on-chain; refund not attempted.`);
      round.payoutStatus = "failed";
      return undefined;
    }

    try {
      const api = await import("near-api-js");
      const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;
      const config = loadNearConfig()!;
      const keyPair = KeyPair.fromString(config.privateKey as `ed25519:${string}`);
      const signer = new KeyPairSigner(keyPair);
      const provider = new JsonRpcProvider({ url: config.rpcUrl });
      const fullAccess = new Account(config.accountId, provider, signer);
      const scoped = this.loadOperatorScopedAccount(provider, api, fullAccess);
      round.operatorKeyModes = { ...round.operatorKeyModes, release: scoped.mode };
      const account = scoped.account;

      const refundTx = await account.callFunctionRaw({
        contractId: MARKET_CONTRACT,
        methodName: "refund_round",
        args: { round_id: roundId },
        gas: BigInt("30000000000000"),
        deposit: BigInt(0),
      });

      const refundTxHash = typeof refundTx.transaction.hash === "string"
        ? refundTx.transaction.hash
        : Buffer.from(refundTx.transaction.hash).toString("base64");

      if (isFinalExecutionSuccessful(refundTx)) {
        round.payoutTxHash = refundTxHash;
        round.payoutStatus = "refunded";
        console.log(`  [MARKET] ✓ Escrow Refund Confirmed TX: ${refundTxHash}`);
        return refundTxHash;
      } else {
        console.error(`  [MARKET] ✕ Refund transaction failed execution:`, refundTx.status);
        round.payoutStatus = "failed";
        return undefined;
      }
    } catch (err) {
      console.warn(`  [MARKET] ⚠ Refund call error:`, (err as Error).message);
      round.payoutStatus = "failed";
      return undefined;
    }
  }
}
