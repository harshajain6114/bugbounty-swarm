/**
 * apps/server/src/agents/idor/idor-agent.ts
 *
 * Specialist Security Agent: IDOR / BOLA (Broken Object Level Authorization).
 * Autonomously consumes ReconResult, isolates user-owned resource candidates,
 * conducts differential dual-user permission testing, and produces verified findings.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReconResult } from "../recon/types.js";
import { AccessControlAnalyzer } from "./access-control-analyzer.js";
import type {
  IDORAgentOptions,
  IDORFinding,
  IDORMissionResult,
  UserResourceProfile,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface HttpCallResult {
  status: number;
  body: Record<string, unknown>;
}

export class IdorAgent {
  public missionId: string;
  private reconResult: ReconResult;
  private options: Required<IDORAgentOptions>;
  private analyzer: AccessControlAnalyzer;
  private targetOrigin = "http://localhost:4000";
  private targetBasePath = "/shop";
  private errors: string[] = [];

  constructor(reconResult: ReconResult, options?: IDORAgentOptions) {
    this.reconResult = reconResult;
    this.missionId = options?.missionId || `idor-${Date.now()}`;
    this.analyzer = new AccessControlAnalyzer();

    const defaultResultsDir = path.resolve(__dirname, "../../../tests/results");
    this.options = {
      missionId: this.missionId,
      outputFilePath: options?.outputFilePath || path.join(defaultResultsDir, "idor-agent-result.json"),
      targetScope: options?.targetScope || "http://localhost:4000/shop",
      aliceCredentials: options?.aliceCredentials || {
        email: "alice@example.com",
        password: "Alice123!",
      },
      bobCredentials: options?.bobCredentials || {
        email: "bob@example.com",
        password: "Bob123!",
      },
    };

    try {
      const parsed = new URL(reconResult.target);
      this.targetOrigin = parsed.origin;
      this.targetBasePath = parsed.pathname.replace(/\/+$/, "");
    } catch {
      this.targetOrigin = "http://localhost:4000";
      this.targetBasePath = "/shop";
    }
  }

  /**
   * Strictly enforces safety and scope boundaries.
   * Rejects targets outside localhost:4000/shop.
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

  /**
   * Main mission execution entry point.
   */
  public async execute(): Promise<IDORMissionResult> {
    const startTime = Date.now();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  BUGBOUNTY SWARM — IDOR / BOLA Security Agent`);
    console.log(`  Mission ID : ${this.missionId}`);
    console.log(`  Target     : ${this.reconResult.target}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 1. Validate Scope
    if (!this.isScopeValid(this.reconResult.target)) {
      const scopeError = `[SECURITY VIOLATION] Target '${this.reconResult.target}' is outside authorized scope (http://localhost:4000/shop).`;
      console.error(`  ❌ ${scopeError}`);
      this.errors.push(scopeError);

      return this.buildMissionResult(startTime, [], [], []);
    }

    // 2. Ingest ReconResult and filter candidates
    console.log(`[1/4] Ingesting ReconResult endpoints (${this.reconResult.endpoints.length} total)…`);
    const { candidates, skipped } = this.analyzer.filterCandidates(this.reconResult.endpoints);

    console.log(`  ✓ Identified ${candidates.length} object-level candidate endpoint(s):`);
    for (const c of candidates) {
      console.log(`    → ${c.endpoint.method} ${c.endpoint.path} [Param: ${c.parameterName} in ${c.parameterIn}] (${c.reason})`);
    }

    console.log(`  ✓ Skipped ${skipped.length} non-object-level endpoint(s):`);
    for (const s of skipped) {
      console.log(`    - Skipped ${s.method} ${s.path}: ${s.reason}`);
    }

    // 3. Establish sessions for Alice and Bob
    console.log(`\n[2/4] Establishing authenticated testing sessions for Alice and Bob…`);
    let aliceProfile: UserResourceProfile | null = null;
    let bobProfile: UserResourceProfile | null = null;
    let aliceToken = "";
    let bobToken = "";

    try {
      const aliceAuth = await this.login(
        this.options.aliceCredentials.email,
        this.options.aliceCredentials.password
      );
      aliceToken = aliceAuth.token;
      aliceProfile = {
        user: aliceAuth.user,
        discoveredResourceIds: [],
      };
      console.log(`  ✓ Alice authenticated: ${aliceAuth.user.name} (${aliceAuth.user.id})`);

      const bobAuth = await this.login(
        this.options.bobCredentials.email,
        this.options.bobCredentials.password
      );
      bobToken = bobAuth.token;
      bobProfile = {
        user: bobAuth.user,
        discoveredResourceIds: [],
      };
      console.log(`  ✓ Bob authenticated: ${bobAuth.user.name} (${bobAuth.user.id})`);
    } catch (authErr) {
      const msg = `Session setup failed: ${String(authErr)}`;
      console.error(`  ❌ ${msg}`);
      this.errors.push(msg);
      return this.buildMissionResult(startTime, candidates.map((c) => c.endpoint.path), skipped, []);
    }

    // 4. Discover legitimate user-owned resource IDs
    console.log(`\n[3/4] Discovering legitimate resource identifiers for each user…`);
    try {
      // Discover orders for Alice
      const aliceOrders = await this.makeRequest(
        `${this.targetOrigin}/shop/api/orders`,
        "GET",
        aliceToken
      );
      if (Array.isArray(aliceOrders.body)) {
        aliceProfile.discoveredResourceIds = (aliceOrders.body as { id: string }[]).map((o) => o.id);
      }
      console.log(`  ✓ Discovered ${aliceProfile.discoveredResourceIds.length} resource(s) for Alice: [${aliceProfile.discoveredResourceIds.join(", ")}]`);

      // Discover orders for Bob
      const bobOrders = await this.makeRequest(
        `${this.targetOrigin}/shop/api/orders`,
        "GET",
        bobToken
      );
      if (Array.isArray(bobOrders.body)) {
        bobProfile.discoveredResourceIds = (bobOrders.body as { id: string }[]).map((o) => o.id);
      }
      console.log(`  ✓ Discovered ${bobProfile.discoveredResourceIds.length} resource(s) for Bob: [${bobProfile.discoveredResourceIds.join(", ")}]`);
    } catch (resErr) {
      const msg = `Resource discovery error: ${String(resErr)}`;
      console.error(`  ❌ ${msg}`);
      this.errors.push(msg);
    }

    // 5. Conduct Differential Access Control Probing
    console.log(`\n[4/4] Conducting differential cross-user access control probes…`);
    const findings: IDORFinding[] = [];

    for (const candidate of candidates) {
      console.log(`\n  Testing candidate endpoint: ${candidate.endpoint.method} ${candidate.endpoint.path}`);

      // We need at least one legitimate resource for Alice and one for Bob
      const aliceResourceId = aliceProfile.discoveredResourceIds[0];
      const bobResourceId = bobProfile.discoveredResourceIds[0];

      if (!aliceResourceId || !bobResourceId) {
        console.warn(`    ⚠️ Insufficient resource fixtures found to probe ${candidate.endpoint.path}. Skipping.`);
        continue;
      }

      // Step A: Baseline - Alice requests Alice's own resource
      const aliceOwnUrl = `${this.targetOrigin}${candidate.endpoint.path.replace(":id", aliceResourceId)}`;
      console.log(`    [Baseline] Alice accesses her own resource: GET ${aliceOwnUrl}`);
      const ownResponse = await this.makeRequest(aliceOwnUrl, "GET", aliceToken);
      console.log(`    → HTTP ${ownResponse.status} (Owner in response: ${(ownResponse.body as { userId?: string }).userId})`);

      // Step B: Cross-User Probe - Alice requests Bob's resource
      const bobResourceUrl = `${this.targetOrigin}${candidate.endpoint.path.replace(":id", bobResourceId)}`;
      console.log(`    [Cross-User Probe] Alice attempts to access Bob's resource: GET ${bobResourceUrl}`);
      const crossResponse = await this.makeRequest(bobResourceUrl, "GET", aliceToken);
      console.log(`    → HTTP ${crossResponse.status} (Response: ${JSON.stringify(crossResponse.body)})`);

      // Step C: Verify Ownership Violation
      const ownershipCheck = this.analyzer.verifyOwnershipLeak(
        bobResourceId,
        crossResponse.status,
        crossResponse.body,
        bobProfile.user,
        aliceProfile.user
      );

      if (ownershipCheck.crossUserLeakageConfirmed) {
        console.log(`    ⚠️ VULNERABILITY CONFIRMED: Cross-user data leakage detected!`);
        console.log(`       Authenticated user : ${aliceProfile.user.id} (${aliceProfile.user.email})`);
        console.log(`       Resource owner     : ${bobProfile.user.id} (${bobProfile.user.email})`);
        console.log(`       Exposed fields     : [${ownershipCheck.leakedFields.join(", ")}]`);

        const finding: IDORFinding = {
          findingId: `idor-finding-${findings.length + 1}`,
          vulnerabilityType: "Insecure Direct Object Reference (IDOR / BOLA)",
          title: `BOLA / IDOR Authorization Bypass on ${candidate.endpoint.path}`,
          severity: "High",
          affectedEndpoint: candidate.endpoint.path,
          httpMethod: candidate.endpoint.method,
          authenticatedUser: `${aliceProfile.user.name} (${aliceProfile.user.email})`,
          resourceOwner: `${bobProfile.user.name} (${bobProfile.user.email})`,
          testResult: "VULNERABILITY_CONFIRMED",
          reproducible: true,
          evidence: {
            authenticatedUser: aliceProfile.user,
            resourceOwner: bobProfile.user,
            aliceOwnResource: {
              resourceId: aliceResourceId,
              httpStatus: ownResponse.status,
              responseBody: ownResponse.body,
            },
            crossUserAccessAttempt: {
              targetResourceId: bobResourceId,
              httpStatus: crossResponse.status,
              responseBody: crossResponse.body,
            },
            ownershipComparison: ownershipCheck,
          },
          reproductionSteps: [
            `1. Authenticate as ${aliceProfile.user.email} via POST /shop/api/auth/login.`,
            `2. Obtain session Bearer token for ${aliceProfile.user.email}.`,
            `3. Verify legitimate baseline: GET /shop/api/orders/${aliceResourceId} returns HTTP 200 with Alice's order.`,
            `4. Send cross-user request: GET /shop/api/orders/${bobResourceId} with Alice's Bearer token.`,
            `5. Observe that HTTP 200 is returned with Bob's private data (userId="${bobProfile.user.id}") — no ownership validation enforced.`,
          ],
          remediation:
            "Implement server-side object ownership authorization. Verify that the requested order's userId matches the authenticated session's userId (req.userId). If mismatched, return HTTP 403 Forbidden.",
          timestamp: new Date().toISOString(),
        };

        findings.push(finding);
      } else {
        console.log(`    ✓ Access control verified secure (HTTP ${crossResponse.status}). No cross-user leakage.`);
      }
    }

    const missionResult = this.buildMissionResult(
      startTime,
      candidates.map((c) => c.endpoint.path),
      skipped,
      findings
    );

    // Save structured report
    this.saveResult(missionResult);

    return missionResult;
  }

  private login(
    email: string,
    pass: string
  ): Promise<{ token: string; user: { id: string; email: string; name: string } }> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ email, password: pass });
      const req = http.request(
        {
          hostname: "localhost",
          port: 4000,
          path: "/shop/api/auth/login",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
          },
          timeout: 4000,
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk: Buffer) => {
            raw += chunk.toString();
          });
          res.on("end", () => {
            try {
              const data = JSON.parse(raw);
              if (res.statusCode === 200 && data.token) {
                resolve({ token: data.token, user: data.user });
              } else {
                reject(new Error(`Login failed for ${email}: HTTP ${res.statusCode} — ${raw}`));
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      );
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  private makeRequest(urlStr: string, method: string, token: string): Promise<HttpCallResult> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(urlStr);
      const req = http.request(
        {
          hostname: parsed.hostname,
          port: Number(parsed.port || 80),
          path: parsed.pathname + parsed.search,
          method,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          timeout: 4000,
        },
        (res) => {
          let raw = "";
          res.on("data", (chunk: Buffer) => {
            raw += chunk.toString();
          });
          res.on("end", () => {
            let body: Record<string, unknown> = {};
            try {
              body = JSON.parse(raw);
            } catch {
              body = { rawResponse: raw };
            }
            resolve({ status: res.statusCode ?? 0, body });
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  private buildMissionResult(
    startTime: number,
    candidatesEvaluated: string[],
    skippedEndpoints: { path: string; method: string; reason: string }[],
    findings: IDORFinding[]
  ): IDORMissionResult {
    const durationMs = Date.now() - startTime;
    return {
      missionId: this.missionId,
      target: this.reconResult.target,
      status: this.errors.length > 0 && findings.length === 0 ? "failed" : "completed",
      summary: {
        totalDiscoveredEndpoints: this.reconResult.endpoints.length,
        candidateEndpointsEvaluated: candidatesEvaluated.length,
        skippedEndpointsCount: skippedEndpoints.length,
        vulnerabilitiesConfirmed: findings.filter((f) => f.reproducible).length,
        durationMs,
      },
      candidatesEvaluated,
      skippedEndpoints,
      findings,
      errors: this.errors,
      metadata: {
        agentName: "IdorAgent",
        agentVersion: "1.0.0",
        completedAt: new Date().toISOString(),
        targetScope: this.options.targetScope,
      },
    };
  }

  private saveResult(result: IDORMissionResult): void {
    try {
      const dir = path.dirname(this.options.outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Security check: ensure no passwords or raw bearer tokens leak in output
      const jsonStr = JSON.stringify(result, null, 2);
      if (
        jsonStr.includes("Alice123!") ||
        jsonStr.includes("Bob123!") ||
        /tok-user-[a-zA-Z0-9_-]+/.test(jsonStr)
      ) {
        throw new Error("[SECURITY CRITICAL] Password or raw session token detected in IDOR report!");
      }

      fs.writeFileSync(this.options.outputFilePath, jsonStr, "utf8");
      console.log(`\n━━━ IDOR Agent Result saved to: ${this.options.outputFilePath}`);
    } catch (err) {
      console.error(`Failed to save IDOR agent result:`, err);
    }
  }
}

/**
 * Functional entrypoint required by specifications:
 * runIdorMission(reconResult, missionId?, options?) -> Promise<IDORMissionResult>
 */
export async function runIdorMission(
  reconResult: ReconResult,
  missionId?: string,
  options?: IDORAgentOptions
): Promise<IDORMissionResult> {
  const agent = new IdorAgent(reconResult, {
    ...options,
    missionId: missionId || options?.missionId,
  });
  return await agent.execute();
}
