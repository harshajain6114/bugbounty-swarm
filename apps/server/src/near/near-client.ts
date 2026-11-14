/**
 * apps/server/src/near/near-client.ts
 *
 * NEAR Protocol testnet client for BUGBOUNTY SWARM.
 *
 * Responsibilities:
 *  - Load credentials from environment variables
 *  - Submit mission attestations and agent contribution records to the testnet contract
 *  - Confirm transaction finality
 *  - NEVER log, print, or propagate private keys
 *  - NEVER throw on NEAR failure — always return a structured error record
 *
 * TESTNET ONLY. networkId must be "testnet".
 */

import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import type {
  NearConfig,
  NearMissionRecord,
  NearTxStatus,
  SubmitAttestationParams,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// near-api-js dynamic import wrapper
// ─────────────────────────────────────────────────────────────────────────────

type NearApiJs = typeof import("near-api-js");

let nearApi: NearApiJs | null = null;

async function getNearApi(): Promise<NearApiJs | null> {
  if (nearApi) return nearApi;
  try {
    nearApi = await import("near-api-js");
    return nearApi;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Config loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads NEAR configuration from environment variables.
 * Returns null if any required variable is absent.
 * NEVER logs the private key.
 */
export function loadNearConfig(): NearConfig | null {
  const networkId = process.env["NEAR_NETWORK_ID"] || "testnet";
  const rpcUrl =
    process.env["NEAR_RPC_URL"] || "https://rpc.testnet.near.org";
  const accountId = process.env["NEAR_ACCOUNT_ID"];
  const contractId = process.env["NEAR_CONTRACT_ID"];
  const privateKey = process.env["NEAR_PRIVATE_KEY"];

  if (!accountId || !contractId || !privateKey) {
    return null;
  }

  // Enforce testnet — never allow mainnet
  if (networkId !== "testnet") {
    console.warn(
      "[NEAR] WARNING: NEAR_NETWORK_ID must be 'testnet'. Refusing non-testnet config."
    );
    return null;
  }

  return { networkId, rpcUrl, accountId, contractId, privateKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEAR client
// ─────────────────────────────────────────────────────────────────────────────

export class NearClient {
  private config: NearConfig;

  constructor(config: NearConfig) {
    this.config = config;
  }

  /**
   * Submits a full mission attestation and all agent contributions.
   * Returns a structured NearMissionRecord.
   * NEVER throws — all errors are caught and returned as "failed" status.
   */
  async submitMissionAttestation(
    params: SubmitAttestationParams
  ): Promise<NearMissionRecord> {
    const base: NearMissionRecord = {
      status: "failed",
      contractId: this.config.contractId,
      networkId: this.config.networkId,
      missionId: params.missionId,
      resultHash: params.resultHash,
      findingsHash: params.findingsHash,
      verifiedFindingCount: params.verifiedFindingCount,
    };

    try {
      const api = await getNearApi();
      if (!api) {
        return {
          ...base,
          errorMessage:
            "near-api-js is not installed. Run: pnpm add near-api-js in apps/server",
        };
      }

      const { KeyPair, KeyPairSigner, JsonRpcProvider, Account } = api;

      const keyPair = KeyPair.fromString(
        this.config.privateKey as `ed25519:${string}` | `secp256k1:${string}`
      );
      const signer = new KeyPairSigner(keyPair);
      const provider = new JsonRpcProvider({ url: this.config.rpcUrl });
      const account = new Account(this.config.accountId, provider, signer);

      // ── Submit mission attestation ────────────────────────────────────────
      console.log(
        `[NEAR] Submitting mission attestation for '${params.missionId}' on testnet…`
      );

      const missionTxResult = await account.callFunctionRaw({
        contractId: this.config.contractId,
        methodName: "record_mission",
        args: {
          mission_id: params.missionId,
          result_hash: params.resultHash,
          findings_hash: params.findingsHash,
          verified_finding_count: params.verifiedFindingCount,
        },
        gas: BigInt("30000000000000"), // 30 TGas
        deposit: BigInt(0),
      });

      const missionTxHash = typeof missionTxResult.transaction.hash === "string"
        ? missionTxResult.transaction.hash
        : Buffer.from(missionTxResult.transaction.hash).toString("base64");

      console.log(`[NEAR] Mission attestation TX: ${missionTxHash}`);

      // ── Submit agent contributions ────────────────────────────────────────
      const contributionTxHashes: string[] = [];
      const contributionTxStatuses: NearTxStatus[] = [];

      for (const contribution of params.agentContributions) {
        try {
          const contribResult = await account.callFunctionRaw({
            contractId: this.config.contractId,
            methodName: "record_agent_contribution",
            args: {
              mission_id: params.missionId,
              agent_id: contribution.agentId,
              contribution_hash: contribution.contributionHash,
              findings_contributed: contribution.findingsContributed,
            },
            gas: BigInt("20000000000000"), // 20 TGas
            deposit: BigInt(0),
          });

          const contribTxHash = typeof contribResult.transaction.hash === "string"
            ? contribResult.transaction.hash
            : Buffer.from(contribResult.transaction.hash).toString("base64");

          contributionTxHashes.push(contribTxHash);
          contributionTxStatuses.push("confirmed");

          console.log(
            `[NEAR] Agent contribution TX (${contribution.agentId}): ${contribTxHash}`
          );
        } catch (contribErr) {
          console.error(
            `[NEAR] Agent contribution failed for ${contribution.agentId}:`,
            contribErr
          );
          contributionTxHashes.push("failed");
          contributionTxStatuses.push("failed");
        }
      }

      const explorerUrl = `https://testnet.nearblocks.io/txns/${encodeURIComponent(missionTxHash)}`;

      return {
        ...base,
        status: "confirmed",
        missionTxHash,
        missionTxStatus: "confirmed",
        contributionTxHashes,
        contributionTxStatuses,
        explorerUrl,
        attestedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[NEAR] Attestation failed:`, message);
      return {
        ...base,
        errorMessage: message,
      };
    }
  }

  /**
   * Queries the contract to verify a mission attestation exists on-chain.
   * Returns false if the query fails or the mission is not found.
   */
  async verifyMissionOnChain(missionId: string): Promise<boolean> {
    try {
      const api = await getNearApi();
      if (!api) return false;

      const { JsonRpcProvider } = api;
      const provider = new JsonRpcProvider({ url: this.config.rpcUrl });

      const raw = await provider.callFunction({
        contractId: this.config.contractId,
        method: "get_mission",
        args: { mission_id: missionId },
      });

      return raw !== null && raw !== undefined;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a NearClient from env variables.
 * Returns null if configuration is incomplete or invalid.
 */
export function createNearClient(): NearClient | null {
  const config = loadNearConfig();
  if (!config) return null;
  return new NearClient(config);
}
