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
import type { MarketRoundResult, MarketBidStrategy } from "./market-types.js";

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

  /**
   * Generates scripted bids for specialists and generalists.
   */
  public generateBids(taskId: string): MarketBidStrategy[] {
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
  ): { signerAccount: unknown; signingMode: "agent_key" | "operator_relayed" } | null {
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

    // Calculate deterministic scores: (confidence_bps * 1e12) / cost_numeric
    const scoredBids = bids.map((b) => {
      const score = (Number(b.confidenceBps) * 1e12) / Number(b.costYocto);
      return {
        agentId: b.agentId,
        account: b.account,
        confidenceBps: b.confidenceBps,
        costYocto: b.costYocto,
        salt: b.salt,
        revealed: true,
        score: Math.round(score * 100) / 100,
        commitTxHash: undefined as string | undefined,
        revealTxHash: undefined as string | undefined,
        relayed: false,
        signingMode: "agent_key" as "agent_key" | "operator_relayed",
      };
    }).sort((a, b) => b.score - a.score);

    const winner = scoredBids[0];
    console.log(
      `  [MARKET] ✓ Deterministic Auction Winner: ${winner.agentId} (${winner.account}) with score ${winner.score}`
    );

    let openTxHash: string | undefined;
    let settleTxHash: string | undefined;
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
          deposit: BigInt("10000000000000000000000"), // 0.01 NEAR escrow
        });

        if (isFinalExecutionSuccessful(openTx)) {
          openTxHash = typeof openTx.transaction.hash === "string"
            ? openTx.transaction.hash
            : Buffer.from(openTx.transaction.hash).toString("base64");
          console.log(`  [MARKET] ✓ Round opened TX: ${openTxHash}`);
        } else {
          console.error(`  [MARKET] ✕ open_round execution failed:`, openTx.status);
        }

        // Phase 1: Submit commit_bid from each of the 5 agents
        console.log(`  [MARKET] Submitting commit_bid from 5 agents…`);
        for (const b of scoredBids) {
          try {
            const agentSignerResult = this.loadAgentSigner(b.account, provider, api);
            let bidderAcc: any = operatorAccount;

            if (agentSignerResult) {
              bidderAcc = agentSignerResult.signerAccount;
              b.signingMode = "agent_key";
              b.relayed = false;
            } else {
              b.signingMode = "operator_relayed";
              b.relayed = true;
              console.log(`  [MARKET] Note: Agent key missing for ${b.agentId}, bid signed as operator_relayed`);
            }

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

        // Phase 2: Submit reveal_bid from each of the 5 agents
        console.log(`  [MARKET] Submitting reveal_bid from 5 agents…`);
        for (const b of scoredBids) {
          try {
            const agentSignerResult = this.loadAgentSigner(b.account, provider, api);
            const bidderAcc: any = agentSignerResult ? agentSignerResult.signerAccount : operatorAccount;

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
              console.log(`    ✓ reveal_bid [${b.agentId}]: ${hash}`);
            } else {
              console.error(`    ✕ reveal_bid failed execution for ${b.agentId}:`, revealTx.status);
            }
          } catch (rErr) {
            console.error(`    ✕ reveal_bid error for ${b.agentId}:`, (rErr as Error).message);
          }
        }

        // Phase 3: Settle round as operator
        console.log(`  [MARKET] Submitting settle_round transaction as operator…`);
        const settleTx = await operatorAccount.callFunctionRaw({
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
        } else {
          console.error(`  [MARKET] ✕ settle_round failed execution:`, settleTx.status);
        }
      } catch (err) {
        console.warn(`  [MARKET] ⚠ On-chain execution notice:`, (err as Error).message);
      }
    } else {
      console.log(`  [MARKET] LOCAL SIMULATION: Testnet credentials not loaded. Sealed bidding executed locally.`);
      for (const b of scoredBids) {
        b.signingMode = "operator_relayed";
        b.relayed = true;
      }
    }

    const roundResult: MarketRoundResult = {
      roundId,
      taskId,
      taskName,
      rewardNear: "0.01",
      openTxHash,
      winnerAccount: winner.account,
      winnerScore: String(winner.score),
      allBids: scoredBids,
      commitTxHashes,
      revealTxHashes,
      settleTxHash,
      payoutStatus: nearClient ? (openTxHash ? "pending" : "failed") : "simulated",
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

    try {
      const api = await import("near-api-js");
      const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;
      const config = loadNearConfig()!;
      const keyPair = KeyPair.fromString(config.privateKey as `ed25519:${string}`);
      const signer = new KeyPairSigner(keyPair);
      const provider = new JsonRpcProvider({ url: config.rpcUrl });
      const account = new Account(config.accountId, provider, signer);

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

    try {
      const api = await import("near-api-js");
      const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;
      const config = loadNearConfig()!;
      const keyPair = KeyPair.fromString(config.privateKey as `ed25519:${string}`);
      const signer = new KeyPairSigner(keyPair);
      const provider = new JsonRpcProvider({ url: config.rpcUrl });
      const account = new Account(config.accountId, provider, signer);

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
