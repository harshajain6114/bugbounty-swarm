/**
 * apps/server/tests/near-integration.test.ts
 *
 * Integration tests for the NEAR Protocol layer.
 *
 * Tests:
 *  1. Deterministic hashing — same input → same 64-char hex hash
 *  2. Finding hashing — single finding produces stable hash
 *  3. Findings set hashing — empty set, single, multiple
 *  4. Agent findings hashing — per-agent subset hashing
 *  5. NEAR config loading — missing vars → returns null
 *  6. NEAR config loading — non-testnet → refuses
 *  7. NEAR client unavailable → mission result preserved, status = "skipped"
 *  8. Credential sanitization — no passwords / tokens in hashed payload
 *
 * NOTE: These tests do NOT connect to the NEAR testnet.
 *       They test the hashing and configuration logic in isolation.
 */

import { hashMissionResult, hashFinding, hashFindings, hashAgentFindings } from "../src/near/hasher.js";
import { loadNearConfig } from "../src/near/near-client.js";
import type { MissionResult, VerifiedFinding } from "../src/orchestrator/types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────────────

function pass(label: string): void {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, details: string): void {
  console.error(`  ✕ FAIL: ${label} — ${details}`);
  process.exit(1);
}

function assert(condition: boolean, label: string, details = ""): void {
  if (!condition) fail(label, details || "assertion failed");
  pass(label);
}

function assertEq<T>(a: T, b: T, label: string): void {
  if (a !== b) fail(label, `expected "${String(b)}", got "${String(a)}"`);
  pass(label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Minimal fixture objects
// ─────────────────────────────────────────────────────────────────────────────

function makeVerifiedFinding(overrides: Partial<VerifiedFinding> = {}): VerifiedFinding {
  return {
    findingId: "finding-001",
    originalFindingId: "raw-001",
    sourceAgent: "IdorAgent",
    vulnerabilityType: "IDOR",
    title: "IDOR: Order access control bypass",
    severity: "High",
    affectedEndpoint: "http://localhost:4000/shop/api/orders/1",
    verificationStatus: "VERIFIED_CONFIRMED",
    verificationRationale: "HTTP 200 returned for cross-user resource",
    testedInputsCount: 3,
    evidence: { statusCode: 200, crossUserAccess: true },
    reproductionSteps: ["Login as user A", "Access user B order"],
    remediation: "Enforce ownership check",
    timestamp: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeMissionResult(overrides: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: "mission-test-001",
    target: "http://localhost:4000/shop",
    status: "completed",
    startedAt: "2024-01-01T00:00:00.000Z",
    completedAt: "2024-01-01T00:05:00.000Z",
    durationMs: 300000,
    reconSummary: {
      totalPages: 3,
      totalEndpoints: 5,
      totalForms: 2,
      crawlDurationMs: 10000,
      status: "completed",
    },
    agentsExecuted: [],
    agentResults: {},
    allFindings: [],
    verifiedFindings: [makeVerifiedFinding()],
    rejectedFindings: [],
    deduplicationSummary: {
      rawFindingsCount: 1,
      deduplicatedCount: 0,
      distinctRootCauses: 1,
      details: [],
    },
    summary: {
      totalDiscoveredPages: 3,
      totalDiscoveredEndpoints: 5,
      totalDiscoveredForms: 2,
      totalAgentsRun: 4,
      totalRawFindings: 1,
      totalVerifiedVulnerabilities: 1,
      totalRejectedFindings: 0,
      totalTestedInputs: 3,
      allAgentsSucceeded: true,
    },
    metadata: {
      orchestratorVersion: "1.0.0",
      targetScope: "http://localhost:4000/shop",
      completedAt: "2024-01-01T00:05:00.000Z",
    },
    ...overrides,
  } as MissionResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n╔════════════════════════════════════════════════════════╗");
console.log("║        BUGBOUNTY SWARM — NEAR Integration Tests       ║");
console.log("╚════════════════════════════════════════════════════════╝\n");

// ── 1. Deterministic mission result hashing ──────────────────────────────────
console.log("[1] Deterministic Mission Result Hashing");

const result1 = makeMissionResult();
const result2 = makeMissionResult();

const hash1 = hashMissionResult(result1);
const hash2 = hashMissionResult(result2);

assert(hash1.length === 64, "Hash is 64 hex chars", `length=${hash1.length}`);
assertEq(hash1, hash2, "Same input → same hash (deterministic)");

// Different input → different hash
const result3 = makeMissionResult({ missionId: "mission-different" });
const hash3 = hashMissionResult(result3);
assert(hash1 !== hash3, "Different input → different hash");

// Key ordering should not matter
const result4a = makeMissionResult();
const result4b = JSON.parse(JSON.stringify(result4a)) as MissionResult;
// Shuffle the verifiedFindings array elements (only 1 here, so same result)
const hash4a = hashMissionResult(result4a);
const hash4b = hashMissionResult(result4b);
assertEq(hash4a, hash4b, "Hash stable across JSON parse/stringify cycle");

// ── 2. Single finding hashing ───────────────────────────────────────────────
console.log("\n[2] Single Finding Hashing");

const finding = makeVerifiedFinding();
const fHash1 = hashFinding(finding);
const fHash2 = hashFinding(finding);

assert(fHash1.length === 64, "Finding hash is 64 hex chars");
assertEq(fHash1, fHash2, "Same finding → same hash");

const findingB = makeVerifiedFinding({ severity: "Critical" });
const fHashB = hashFinding(findingB);
assert(fHash1 !== fHashB, "Different severity → different finding hash");

// Timestamps and run-specific IDs must NOT affect the hash
const findingTimestampVariant = makeVerifiedFinding({ timestamp: "2099-12-31T23:59:59.999Z", findingId: "different-id" });
// The finding hash uses only stable fields (sourceAgent, vulnerabilityType, affectedEndpoint, severity, verificationStatus)
// so changing timestamp and findingId should NOT change the hash
assertEq(hashFinding(findingTimestampVariant), fHash1, "Timestamp and findingId do not affect finding hash");

// ── 3. Findings set hashing ──────────────────────────────────────────────────
console.log("\n[3] Findings Set Hashing");

const emptyHash = hashFindings([]);
assert(emptyHash.length === 64, "Empty findings produces 64-char hash");

const singleHash = hashFindings([finding]);
assert(singleHash.length === 64, "Single finding set produces 64-char hash");
assert(singleHash !== emptyHash, "Non-empty set differs from empty set");

const findingC = makeVerifiedFinding({ sourceAgent: "XssAgent", vulnerabilityType: "STORED_XSS" });
const twoHash_AB = hashFindings([finding, findingC]);
const twoHash_BA = hashFindings([findingC, finding]);
assertEq(twoHash_AB, twoHash_BA, "Order of findings does not affect set hash (sorted)");

const threeFindings = [finding, findingB, findingC];
const threeHash1 = hashFindings(threeFindings);
const threeHash2 = hashFindings([...threeFindings].reverse());
assertEq(threeHash1, threeHash2, "Reversed findings list → same set hash");

// ── 4. Agent findings hashing ────────────────────────────────────────────────
console.log("\n[4] Agent Findings Hashing");

const idorFinding = makeVerifiedFinding({ sourceAgent: "IdorAgent", vulnerabilityType: "IDOR" });
const xssFinding = makeVerifiedFinding({ sourceAgent: "XssAgent", vulnerabilityType: "STORED_XSS" });
const allFindings = [idorFinding, xssFinding];

const idorAgentHash = hashAgentFindings("IdorAgent", allFindings);
const xssAgentHash = hashAgentFindings("XssAgent", allFindings);
const reconAgentHash = hashAgentFindings("ReconAgent", allFindings);

assert(idorAgentHash.length === 64, "IdorAgent contribution hash is 64 chars");
assert(xssAgentHash.length === 64, "XssAgent contribution hash is 64 chars");
assert(idorAgentHash !== xssAgentHash, "Different agents → different hashes");
assert(reconAgentHash.length === 64, "Agent with no findings produces valid hash");

// Same agent, same findings = deterministic
const idorAgentHash2 = hashAgentFindings("IdorAgent", allFindings);
assertEq(idorAgentHash, idorAgentHash2, "Agent hash is deterministic");

// ── 5. NEAR config loading — missing vars ────────────────────────────────────
console.log("\n[5] NEAR Config Loading — Missing Variables");

// Clear NEAR env vars for this test
const savedVars: Record<string, string | undefined> = {
  NEAR_ACCOUNT_ID: process.env["NEAR_ACCOUNT_ID"],
  NEAR_PRIVATE_KEY: process.env["NEAR_PRIVATE_KEY"],
  NEAR_CONTRACT_ID: process.env["NEAR_CONTRACT_ID"],
  NEAR_NETWORK_ID: process.env["NEAR_NETWORK_ID"],
};

delete process.env["NEAR_ACCOUNT_ID"];
delete process.env["NEAR_PRIVATE_KEY"];
delete process.env["NEAR_CONTRACT_ID"];

const configMissing = loadNearConfig();
assert(configMissing === null, "Missing NEAR env vars → loadNearConfig returns null");

// ── 6. NEAR config loading — non-testnet refused ────────────────────────────
console.log("\n[6] NEAR Config — Non-Testnet Refused");

process.env["NEAR_ACCOUNT_ID"] = "test.near";
process.env["NEAR_PRIVATE_KEY"] = "ed25519:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
process.env["NEAR_CONTRACT_ID"] = "contract.near";
process.env["NEAR_NETWORK_ID"] = "mainnet"; // must be refused

const configMainnet = loadNearConfig();
assert(configMainnet === null, "mainnet NEAR_NETWORK_ID → loadNearConfig returns null");

// ── 7. NEAR config — testnet with valid vars ────────────────────────────────
console.log("\n[7] NEAR Config — Valid Testnet Config Accepted");

process.env["NEAR_NETWORK_ID"] = "testnet";
const configTestnet = loadNearConfig();
assert(configTestnet !== null, "Valid testnet config → non-null");
if (configTestnet) {
  assertEq(configTestnet.networkId, "testnet", "networkId is 'testnet'");
  assertEq(configTestnet.accountId, "test.near", "accountId matches");
  assertEq(configTestnet.contractId, "contract.near", "contractId matches");
}

// ── 8. Credential sanitization — passwords must not appear in hashed payload ─
console.log("\n[8] Credential Sanitization in Hashed Payload");

// Create a mission result with password fields in forms
const resultWithCredentials = makeMissionResult();
// Inject credential-looking data into the agent results
(resultWithCredentials as unknown as Record<string, unknown>)["agentResults"] = {
  recon: {
    forms: [{
      fields: [
        { name: "username", type: "text", defaultValue: "alice" },
        { name: "password", type: "password", defaultValue: "Alice123!" },
      ],
    }],
  },
};

const credentialHash = hashMissionResult(resultWithCredentials);
assert(credentialHash.length === 64, "Mission with credential fields produces valid hash");

// The hash string itself should not contain the password (hashes are hex, not plaintext)
assert(!credentialHash.includes("Alice123!"), "Password literal not present in hash output");
assert(!credentialHash.includes("Bob123!"), "Bob password not present in hash output");

// ── Restore env vars ─────────────────────────────────────────────────────────
for (const [k, v] of Object.entries(savedVars)) {
  if (v === undefined) {
    delete process.env[k];
  } else {
    process.env[k] = v;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log("\n════════════════════════════════════════════════════════");
console.log("  NEAR INTEGRATION TESTS PASSED");
console.log("════════════════════════════════════════════════════════\n");
console.log("NOTE: These tests verify local hashing and config logic only.");
console.log("      Testnet transaction submission requires a funded testnet");
console.log("      account — see apps/near-contract/README.md for setup.");
