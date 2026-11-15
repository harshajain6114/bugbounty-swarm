/**
 * apps/server/tests/phase-enforcement.demo.ts — `npm run demo:phases`
 *
 * Live testnet proof that market.harsha-swarm.testnet enforces commit/reveal
 * phases: a commit sent AFTER start_reveal must be rejected by the contract.
 *
 *  1. operator opens a round (0.001 NEAR escrow)
 *  2. idor commits (scoped FunctionCall key)
 *  3. operator calls start_reveal (scoped key)
 *  4. xss tries to commit late  → contract must panic "Commit phase closed"
 *  5. idor reveals, operator settles, operator refunds (escrow returned)
 */

import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { KeyPair, KeyPairSigner, JsonRpcProvider, Account } from "near-api-js";
import { isFinalExecutionSuccessful } from "../src/near/near-client.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const MARKET = process.env.NEAR_MARKET_CONTRACT || "market.harsha-swarm.testnet";
const RPC = process.env.NEAR_RPC_URL || "https://test.rpc.fastnear.com";
const OPERATOR = process.env.NEAR_ACCOUNT_ID || "harsha-swarm.testnet";
const keys = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "../../.agent-keys.json"), "utf8"));
const provider = new JsonRpcProvider({ url: RPC });
const acct = (id: string, sk: string) => new Account(id, provider, new KeyPairSigner(KeyPair.fromString(sk as `ed25519:${string}`)));

const opFull = acct(OPERATOR, process.env.NEAR_PRIVATE_KEY!);
const opScoped = acct(OPERATOR, keys.__operator__.privateKey);
const idor = acct("idor.harsha-swarm.testnet", keys["idor.harsha-swarm.testnet"].privateKey);
const xss = acct("xss.harsha-swarm.testnet", keys["xss.harsha-swarm.testnet"].privateKey);

const roundId = `phase-demo-${Date.now()}`;
const taskId = "task-phase-demo";
const txHash = (o: any) => String(o?.transaction?.hash ?? "");

async function call(a: Account, method: string, args: object, deposit = 0n) {
  try {
    const out = await a.callFunctionRaw({ contractId: MARKET, methodName: method, args, gas: 30_000_000_000_000n, deposit });
    return { ok: isFinalExecutionSuccessful(out), hash: txHash(out), detail: JSON.stringify((out as any).status ?? "") };
  } catch (err) {
    return { ok: false, hash: "", detail: (err as Error).message };
  }
}

async function viewBids(round: string): Promise<string[]> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "bids", method: "query",
      params: {
        request_type: "call_function", finality: "final", account_id: MARKET, method_name: "get_round_bids",
        args_base64: Buffer.from(JSON.stringify({ round_id: round })).toString("base64"),
      },
    }),
  });
  const data = (await res.json()) as { result?: { result?: number[] } };
  const bids = JSON.parse(Buffer.from(data.result?.result ?? []).toString("utf8") || "[]") as { bidder: string }[];
  return bids.map((b) => b.bidder);
}

function commitment(account: string, bps: number, cost: number, salt: string) {
  return createHash("sha256").update(`${account}|${taskId}|${bps}|${cost}|${salt}`).digest("hex");
}

let failures = 0;
const check = (cond: boolean, label: string) => { console.log(`  ${cond ? "✓" : "✕"} ${label}`); if (!cond) failures++; };

console.log(`\nPhase-enforcement demo on ${MARKET}, round ${roundId}`);
const open = await call(opFull, "open_round", { round_id: roundId, task_id: taskId }, 1_000_000_000_000_000_000_000n);
check(open.ok, `open_round (operator full key, deposit attached): ${open.hash}`);

const idorSalt = randomBytes(32).toString("hex");
const c1 = await call(idor, "commit_bid", { round_id: roundId, commitment: commitment("idor.harsha-swarm.testnet", 9000, 10_000_000_000, idorSalt) });
check(c1.ok, `idor commit_bid during commit phase: ${c1.hash}`);

const sr = await call(opScoped, "start_reveal", { round_id: roundId });
check(sr.ok, `start_reveal (operator scoped key): ${sr.hash}`);

const late = await call(xss, "commit_bid", { round_id: roundId, commitment: commitment("xss.harsha-swarm.testnet", 9900, 1, randomBytes(32).toString("hex")) });
// Release wasm builds surface contract panics as a generic `unreachable` trap,
// so the rejection is proven by (a) the failed tx and (b) the on-chain bid list.
// The exact "Commit phase closed" assertion is covered by the Rust unit test
// test_commit_after_reveal_started_rejected.
console.log(`    late commit: ok=${late.ok} (${late.detail.slice(0, 80)})`);
check(!late.ok, "LATE xss commit_bid was rejected by the contract");
const bids = await viewBids(roundId);
check(bids.length === 1 && bids[0] === "idor.harsha-swarm.testnet", `on-chain bid list after late attempt: [${bids.join(", ")}] (xss absent)`);

const rv = await call(idor, "reveal_bid", { round_id: roundId, confidence_bps: 9000, cost_yocto: 10_000_000_000, salt: idorSalt });
check(rv.ok, `idor reveal_bid during reveal phase: ${rv.hash}`);
const st = await call(opScoped, "settle_round", { round_id: roundId });
check(st.ok, `settle_round: ${st.hash}`);
const proof = createHash("sha256").update(`phase-demo-cleanup|${roundId}`).digest("hex");
const rf = await call(opScoped, "refund_round", { round_id: roundId, proof_hash: proof });
check(rf.ok, `refund_round (cleanup, escrow returned): ${rf.hash}`);

if (failures) {
  console.error(`\n✕ PHASE ENFORCEMENT DEMO FAILED (${failures})`);
  process.exit(1);
}
console.log("\n✓ PHASE ENFORCEMENT DEMO PASSED: the contract rejected a commit after the reveal phase opened.");
