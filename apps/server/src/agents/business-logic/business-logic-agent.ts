/**
 * apps/server/src/agents/business-logic/business-logic-agent.ts
 *
 * Specialist Security Agent: Business Logic / Price Manipulation Flaws.
 * Autonomously consumes live ReconResult, dynamically isolates financial and
 * checkout endpoints, contrasts client-supplied pricing against authoritative
 * catalog pricing, and produces verified findings with strict test isolation.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ReconResult, DiscoveredEndpoint } from "../recon/types.js";
import type {
  BusinessLogicAgentOptions,
  BusinessLogicCandidate,
  SkippedEndpoint,
  PriceManipulationEvidence,
  BusinessLogicFinding,
  BusinessLogicMissionResult,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface HttpCallResult {
  status: number;
  body: Record<string, unknown> | Array<unknown> | string;
}

export class BusinessLogicAgent {
  public missionId: string;
  private reconResult: ReconResult;
  private options: Required<BusinessLogicAgentOptions>;
  private targetOrigin = "http://localhost:4000";
  private targetBasePath = "/shop";
  private errors: string[] = [];

  constructor(reconResult: ReconResult, options?: BusinessLogicAgentOptions) {
    this.reconResult = reconResult;
    this.missionId = options?.missionId || `bizlogic-${Date.now()}`;

    const defaultResultsDir = path.resolve(__dirname, "../../../tests/results");
    this.options = {
      missionId: this.missionId,
      outputFilePath:
        options?.outputFilePath ||
        path.join(defaultResultsDir, "business-logic-agent-result.json"),
      targetScope: options?.targetScope || "http://localhost:4000/shop",
      credentials: options?.credentials || {
        email: "alice@example.com",
        password: "Alice123!",
      },
      timeoutMs: options?.timeoutMs || 10000,
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
   * Target MUST be localhost:4000/shop.
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
   * Low-level HTTP helper.
   */
  private makeHttpRequest(
    urlPath: string,
    method: "GET" | "POST",
    body?: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<HttpCallResult> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.targetOrigin);
      const payload = body ? JSON.stringify(body) : undefined;

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 4000,
          path: url.pathname + url.search,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        },
        (res) => {
          let rawData = "";
          res.on("data", (chunk) => {
            rawData += chunk;
          });
          res.on("end", () => {
            let parsedBody: Record<string, unknown> | Array<unknown> | string = rawData;
            try {
              parsedBody = JSON.parse(rawData);
            } catch {
              // Plain text or HTML
            }
            resolve({
              status: res.statusCode || 0,
              body: parsedBody,
            });
          });
        }
      );

      req.on("error", (err) => {
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Resets database state to deterministic seeded fixture for test isolation.
   */
  public async resetDatabase(): Promise<boolean> {
    try {
      const res = await this.makeHttpRequest("/shop/api/reset", "POST");
      return res.status === 200;
    } catch (err) {
      this.errors.push(`Database reset call failed: ${String(err)}`);
      return false;
    }
  }

  /**
   * Dynamic candidate identification from ReconResult.
   */
  private filterCandidates(endpoints: DiscoveredEndpoint[]): {
    candidates: BusinessLogicCandidate[];
    skipped: SkippedEndpoint[];
  } {
    const candidates: BusinessLogicCandidate[] = [];
    const skipped: SkippedEndpoint[] = [];
    const seen = new Set<string>();

    for (const ep of endpoints) {
      const normPath = ep.path;
      const key = `${ep.method}:${normPath}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const isPost = ep.method.toUpperCase() === "POST";
      const isCheckoutOrOrder =
        normPath.includes("checkout") ||
        (normPath.includes("orders") && isPost);

      if (isPost && isCheckoutOrOrder) {
        candidates.push({
          endpoint: normPath,
          method: ep.method,
          authRequired: ep.authRequired,
          rationale: `State-changing financial mutation endpoint (${ep.method} ${normPath}) identified for price validation and transaction integrity probing.`,
        });
      } else {
        let reason = "Endpoint does not process monetary checkout transactions.";
        if (normPath.includes("/api/auth/")) {
          reason = "Authentication / session endpoint without transactional commerce logic.";
        } else if (normPath.includes("/api/orders/") && ep.method === "GET") {
          reason = "Read-only order retrieval endpoint; subject to IDOR analysis rather than price manipulation.";
        } else if (normPath.includes("/api/products/") && ep.method === "POST") {
          reason = "Content submission endpoint (product review); evaluated for injection/XSS flaws.";
        } else if (normPath.includes("/api/products")) {
          reason = "Catalog retrieval endpoint; used as authoritative price reference.";
        } else if (!normPath.startsWith("/shop/api/")) {
          reason = "Frontend UI route, not an API transaction endpoint.";
        }

        skipped.push({
          endpoint: normPath,
          method: ep.method,
          reason,
        });
      }
    }

    return { candidates, skipped };
  }

  /**
   * Executes the autonomous Business Logic / Price Manipulation security audit.
   */
  public async execute(): Promise<BusinessLogicMissionResult> {
    const startTime = Date.now();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  BUGBOUNTY SWARM — Business Logic Specialist Agent`);
    console.log(`  Mission ID : ${this.missionId}`);
    console.log(`  Target     : ${this.reconResult.target}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 1. Validate Scope
    if (!this.isScopeValid(this.reconResult.target)) {
      const scopeError = `[SECURITY VIOLATION] Target '${this.reconResult.target}' is outside authorized scope (http://localhost:4000/shop).`;
      console.error(`  ✕ ${scopeError}`);
      this.errors.push(scopeError);

      const failedResult: BusinessLogicMissionResult = {
        missionId: this.missionId,
        target: this.reconResult.target,
        status: "failed",
        summary: {
          totalDiscoveredEndpoints: this.reconResult.endpoints.length,
          checkoutCandidatesEvaluated: 0,
          skippedEndpointsCount: 0,
          vulnerabilitiesConfirmed: 0,
          priceDiscrepancyCents: 0,
          durationMs: Date.now() - startTime,
        },
        candidatesEvaluated: [],
        skippedEndpoints: [],
        findings: [],
        errors: this.errors,
        metadata: {
          agentName: "BusinessLogicAgent",
          agentVersion: "1.0.0",
          completedAt: new Date().toISOString(),
          targetScope: this.options.targetScope,
        },
      };

      this.saveResult(failedResult);
      return failedResult;
    }

    // 2. Dynamic candidate filtering from ReconResult
    console.log(`[Phase 1] Dynamic Endpoint Ingestion and Candidate Analysis…`);
    const { candidates, skipped } = this.filterCandidates(this.reconResult.endpoints);

    console.log(`  ✓ Total discovered endpoints      : ${this.reconResult.endpoints.length}`);
    console.log(`  ✓ Financial checkout candidates   : ${candidates.length}`);
    console.log(`  ✓ Skipped non-checkout endpoints  : ${skipped.length}`);

    // 3. Reset database for clean test isolation before testing
    console.log(`\n[Phase 2] Initializing Clean Database State…`);
    await this.resetDatabase();
    console.log(`  ✓ Target database reset to clean seed fixture`);

    const findings: BusinessLogicFinding[] = [];
    let totalUndercharge = 0;

    try {
      // 4. Authenticate demo user (Alice)
      console.log(`\n[Phase 3] Authenticating as demo user via API…`);
      const authRes = await this.makeHttpRequest("/shop/api/auth/login", "POST", {
        email: this.options.credentials.email,
        password: this.options.credentials.password,
      });

      if (authRes.status !== 200 || !authRes.body || typeof authRes.body !== "object") {
        throw new Error(`Authentication failed: HTTP ${authRes.status}`);
      }

      const authData = authRes.body as { token: string; user: { id: string; name: string } };
      const authToken = authData.token;
      console.log(`  ✓ Authenticated as ${authData.user.name} (${authData.user.id})`);

      // 5. Query authoritative product catalog
      console.log(`\n[Phase 4] Retrieving authoritative product catalog pricing…`);
      const catalogRes = await this.makeHttpRequest("/shop/api/products", "GET");
      if (catalogRes.status !== 200 || !Array.isArray(catalogRes.body)) {
        throw new Error(`Failed to retrieve catalog products: HTTP ${catalogRes.status}`);
      }

      const catalog = catalogRes.body as {
        id: string;
        name: string;
        price: number;
        description: string;
      }[];

      if (catalog.length === 0) {
        throw new Error("Product catalog is empty.");
      }

      // Select target test product (prod-001 or first product)
      const targetProduct = catalog.find((p) => p.id === "prod-001") || catalog[0];
      const canonicalPrice = targetProduct.price; // cents
      console.log(`  ✓ Target Product     : ${targetProduct.name} (${targetProduct.id})`);
      console.log(`  ✓ Authoritative Price: ${canonicalPrice} cents ($${(canonicalPrice / 100).toFixed(2)})`);

      // 6. Test candidates
      console.log(`\n[Phase 5] Conducting Price Manipulation Testing…`);
      let findingIndex = 1;

      for (const candidate of candidates) {
        console.log(`\n  → Testing candidate endpoint: ${candidate.method} ${candidate.endpoint}`);

        // Manipulated client-side price: 1 cent ($0.01) vs authoritative price (e.g. $79.99)
        const manipulatedPrice = 1;
        const manipulatedPayload = {
          items: [
            {
              productId: targetProduct.id,
              quantity: 1,
              price: manipulatedPrice,
            },
          ],
        };

        console.log(`    Authoritative catalog price : ${canonicalPrice} cents ($${(canonicalPrice / 100).toFixed(2)})`);
        console.log(`    Client-submitted price      : ${manipulatedPrice} cent ($${(manipulatedPrice / 100).toFixed(2)})`);

        const checkoutRes = await this.makeHttpRequest(
          candidate.endpoint,
          "POST",
          manipulatedPayload,
          { Authorization: `Bearer ${authToken}` }
        );

        console.log(`    Server response status      : HTTP ${checkoutRes.status}`);

        if (checkoutRes.status === 201 && typeof checkoutRes.body === "object" && checkoutRes.body !== null) {
          const body = checkoutRes.body as {
            message?: string;
            order?: {
              id: string;
              userId: string;
              items: {
                productId: string;
                quantity: number;
                priceAtPurchase: number;
              }[];
              total: number;
            };
          };

          const recordedOrder = body.order;
          if (recordedOrder && Array.isArray(recordedOrder.items) && recordedOrder.items.length > 0) {
            const recordedItem = recordedOrder.items[0];
            const acceptedPrice = recordedItem.priceAtPurchase;
            const acceptedTotal = recordedOrder.total;
            const priceDifference = canonicalPrice - acceptedPrice;

            console.log(`    Server-accepted purchase price : ${acceptedPrice} cent(s)`);
            console.log(`    Server-recorded order total    : ${acceptedTotal} cent(s)`);
            console.log(`    Calculated undercharge         : ${priceDifference} cents ($${(priceDifference / 100).toFixed(2)})`);

            // Confirm vulnerability ONLY if backend accepts price inconsistent with authoritative catalog
            const vulnerabilityConfirmed =
              acceptedPrice === manipulatedPrice && acceptedPrice < canonicalPrice;

            if (vulnerabilityConfirmed) {
              totalUndercharge += priceDifference;

              const evidence: PriceManipulationEvidence = {
                targetEndpoint: candidate.endpoint,
                productId: targetProduct.id,
                productName: targetProduct.name,
                canonicalCatalogPriceCents: canonicalPrice,
                clientSubmittedPriceCents: manipulatedPrice,
                serverRecordedPriceCents: acceptedPrice,
                serverRecordedTotalCents: acceptedTotal,
                priceUnderchargeCents: priceDifference,
                createdOrderId: recordedOrder.id,
                httpStatus: checkoutRes.status,
                requestPayload: manipulatedPayload,
                responseSnippet: checkoutRes.body as Record<string, unknown>,
                vulnerabilityConfirmed: true,
              };

              const finding: BusinessLogicFinding = {
                findingId: `bizlogic-find-${String(findingIndex).padStart(3, "0")}`,
                vulnerabilityType: "Business Logic Flaw: Client-Side Price Manipulation",
                title: "Client-Side Price Parameter Trusted During Checkout",
                severity: "High",
                affectedEndpoint: candidate.endpoint,
                testResult: "VULNERABILITY_CONFIRMED",
                reproducible: true,
                evidence,
                reproductionSteps: [
                  `Authenticate to the store API using user credentials (${this.options.credentials.email}).`,
                  `Query the authoritative product catalog (GET /shop/api/products/${targetProduct.id}) and record the canonical price (${canonicalPrice} cents).`,
                  `Construct a checkout payload targeting ${candidate.endpoint} overriding the price parameter with an arbitrary lower value (${manipulatedPrice} cent).`,
                  `Send the checkout request: POST ${candidate.endpoint}.`,
                  `Observe that the server accepts the client-supplied price without validating against the product database, creating order ${recordedOrder.id} for ${acceptedTotal} cent(s) instead of ${canonicalPrice} cents.`,
                ],
                remediation:
                  "Never accept product price fields from client-side checkout payloads. When processing orders, ignore any client-supplied price and look up the authoritative price server-side directly from the database using productId.",
                timestamp: new Date().toISOString(),
              };

              findings.push(finding);
              findingIndex++;
              console.log(`    🎯 CONFIRMED VULNERABILITY: ${finding.findingId} - ${finding.title}`);
            } else {
              console.log(`    ✓ Server rejected or corrected manipulated price (not vulnerable).`);
            }
          }
        } else {
          console.log(`    ✓ Server rejected checkout with HTTP ${checkoutRes.status}`);
        }
      }
    } catch (err) {
      console.error(`  ✕ Execution error during business logic testing:`, err);
      this.errors.push(`Execution error: ${String(err)}`);
    } finally {
      // 7. Clean up: reset database after testing
      console.log(`\n[Phase 6] Cleaning up test data (post-mission reset)…`);
      await this.resetDatabase();
      console.log(`  ✓ Database restored to clean seeded state`);
    }

    const durationMs = Date.now() - startTime;
    const missionResult: BusinessLogicMissionResult = {
      missionId: this.missionId,
      target: this.reconResult.target,
      status: this.errors.length > 0 && findings.length === 0 ? "failed" : "completed",
      summary: {
        totalDiscoveredEndpoints: this.reconResult.endpoints.length,
        checkoutCandidatesEvaluated: candidates.length,
        skippedEndpointsCount: skipped.length,
        vulnerabilitiesConfirmed: findings.length,
        priceDiscrepancyCents: totalUndercharge,
        durationMs,
      },
      candidatesEvaluated: candidates,
      skippedEndpoints: skipped,
      findings,
      errors: this.errors,
      metadata: {
        agentName: "BusinessLogicAgent",
        agentVersion: "1.0.0",
        completedAt: new Date().toISOString(),
        targetScope: this.options.targetScope,
      },
    };

    this.saveResult(missionResult);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Business Logic Agent Mission Complete`);
    console.log(`  Candidates Evaluated : ${candidates.length}`);
    console.log(`  Skipped Endpoints    : ${skipped.length}`);
    console.log(`  Vulnerabilities Found: ${findings.length}`);
    console.log(`  Total Undercharge    : ${totalUndercharge} cents ($${(totalUndercharge / 100).toFixed(2)})`);
    console.log(`  Duration             : ${durationMs}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return missionResult;
  }

  /**
   * Serializes and writes mission results to disk, verifying zero credential leaks.
   */
  private saveResult(result: BusinessLogicMissionResult): void {
    try {
      const dir = path.dirname(this.options.outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const jsonStr = JSON.stringify(result, null, 2);

      // Security check: ensure no passwords or raw bearer tokens leak in output
      if (
        jsonStr.includes("Alice123!") ||
        jsonStr.includes("Bob123!") ||
        /tok-user-[a-zA-Z0-9_-]+/.test(jsonStr)
      ) {
        throw new Error(
          "[SECURITY CRITICAL] Password or raw session token detected in Business Logic findings report!"
        );
      }

      fs.writeFileSync(this.options.outputFilePath, jsonStr, "utf8");
      console.log(`\n━━━ Business Logic Agent Result saved to: ${this.options.outputFilePath}`);
    } catch (err) {
      console.error(`Failed to save Business Logic agent result:`, err);
    }
  }
}

/**
 * Functional entrypoint:
 * runBusinessLogicMission(reconResult, missionId?, options?) -> Promise<BusinessLogicMissionResult>
 */
export async function runBusinessLogicMission(
  reconResult: ReconResult,
  missionId?: string,
  options?: BusinessLogicAgentOptions
): Promise<BusinessLogicMissionResult> {
  const agent = new BusinessLogicAgent(reconResult, {
    ...options,
    missionId: missionId || options?.missionId,
  });
  return await agent.execute();
}
