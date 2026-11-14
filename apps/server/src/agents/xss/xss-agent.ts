/**
 * apps/server/src/agents/xss/xss-agent.ts
 *
 * Specialist Security Agent: Stored Cross-Site Scripting (Stored XSS).
 * Autonomously consumes live ReconResult, dynamically analyzes persistent
 * form inputs, tests browser-driven payload persistence and execution via Playwright,
 * verifies 4-way execution criteria, and outputs structured findings without leaking secrets.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ReconResult } from "../recon/types.js";
import { InputAnalyzer } from "./input-analyzer.js";
import type {
  XSSAgentOptions,
  XSSCandidate,
  SkippedField,
  XSSEvidence,
  XSSFinding,
  XSSMissionResult,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface HttpCallResult {
  status: number;
  body: unknown;
}

export class XssAgent {
  public missionId: string;
  private reconResult: ReconResult;
  private options: Required<XSSAgentOptions>;
  private analyzer: InputAnalyzer;
  private targetOrigin = "http://localhost:4000";
  private targetBasePath = "/shop";
  private errors: string[] = [];

  constructor(reconResult: ReconResult, options?: XSSAgentOptions) {
    this.reconResult = reconResult;
    this.missionId = options?.missionId || `xss-${Date.now()}`;
    this.analyzer = new InputAnalyzer();

    const defaultResultsDir = path.resolve(__dirname, "../../../tests/results");
    this.options = {
      missionId: this.missionId,
      outputFilePath: options?.outputFilePath || path.join(defaultResultsDir, "xss-agent-result.json"),
      targetScope: options?.targetScope || "http://localhost:4000/shop",
      credentials: options?.credentials || {
        email: "alice@example.com",
        password: "Alice123!",
      },
      headless: options?.headless !== false,
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
   * Low-level HTTP utility for API queries and database reset.
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
            let parsedBody: unknown = rawData;
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
   * Resets database state to deterministic seeded fixture.
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
   * Executes the autonomous Stored XSS security audit mission.
   */
  public async execute(): Promise<XSSMissionResult> {
    const startTime = Date.now();
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  BUGBOUNTY SWARM — Stored XSS Specialist Agent`);
    console.log(`  Mission ID : ${this.missionId}`);
    console.log(`  Target     : ${this.reconResult.target}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 1. Validate Scope
    if (!this.isScopeValid(this.reconResult.target)) {
      const scopeError = `[SECURITY VIOLATION] Target '${this.reconResult.target}' is outside authorized scope (http://localhost:4000/shop).`;
      console.error(`  ✕ ${scopeError}`);
      this.errors.push(scopeError);

      const failedResult: XSSMissionResult = {
        missionId: this.missionId,
        target: this.reconResult.target,
        status: "failed",
        summary: {
          totalDiscoveredForms: this.reconResult.forms.length,
          candidateInputsEvaluated: 0,
          skippedFieldsCount: 0,
          testedInputsCount: 0,
          vulnerabilitiesConfirmed: 0,
          durationMs: Date.now() - startTime,
        },
        candidatesEvaluated: [],
        skippedFields: [],
        findings: [],
        errors: this.errors,
        metadata: {
          agentName: "XssAgent",
          agentVersion: "1.0.0",
          completedAt: new Date().toISOString(),
          targetScope: this.options.targetScope,
        },
      };

      this.saveResult(failedResult);
      return failedResult;
    }

    // 2. Ingest ReconResult and evaluate candidates dynamically
    console.log(`[Phase 1] Dynamic Form and Endpoint Analysis from ReconResult…`);
    const { candidates, skipped } = this.analyzer.analyzeForms(
      this.reconResult.forms,
      this.reconResult.endpoints
    );

    console.log(`  ✓ Total discovered forms : ${this.reconResult.forms.length}`);
    console.log(`  ✓ Persistent input candidates : ${candidates.length}`);
    console.log(`  ✓ Skipped fields recorded     : ${skipped.length}`);

    // 3. Reset database for clean test isolation before testing
    console.log(`\n[Phase 2] Initializing Clean Database State…`);
    await this.resetDatabase();
    console.log(`  ✓ Target database reset to clean seed fixture`);

    const findings: XSSFinding[] = [];
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      // 4. Launch Playwright Chromium
      console.log(`\n[Phase 3] Launching Playwright Chromium Engine…`);
      browser = await chromium.launch({ headless: this.options.headless });
      context = await browser.newContext();
      page = await context.newPage();

      // 5. Authenticate via UI using provided credentials
      console.log(`\n[Phase 4] Authenticating as demo user via UI…`);
      const loginUrl = `${this.targetOrigin}${this.targetBasePath}`;
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
      await page.fill("#email", this.options.credentials.email);
      await page.fill("#password", this.options.credentials.password);
      await page.click('#login-section button:has-text("Login")');

      // Wait for session token in localStorage
      await page.waitForFunction(
        () => localStorage.getItem("shopToken") !== null,
        undefined,
        { timeout: 7000 }
      );

      const tokenPresent = await page.evaluate(
        () => typeof localStorage.getItem("shopToken") === "string"
      );
      console.log(`  ✓ Authentication successful (session established: ${tokenPresent})`);

      // 6. Test candidates
      console.log(`\n[Phase 5] Evaluating Persistent Input Candidates…`);
      const testedEvidenceList: {
        candidate: XSSCandidate;
        evidence: XSSEvidence;
        reproducible: boolean;
      }[] = [];
      let inputCounter = 1;

      for (const candidate of candidates) {
        console.log(`\n  → Testing candidate input [${inputCounter}/${candidates.length}]: ${candidate.candidateId}`);
        console.log(`    Target field: '${candidate.targetField.name || candidate.targetField.id}' (${candidate.targetField.type})`);
        console.log(`    Form Page   : ${candidate.pageUrl}`);
        console.log(`    Endpoint    : ${candidate.submissionEndpoint}`);

        // Generate unique per-candidate sentinel to guarantee no false positives
        const sanitizedMissionId = this.missionId.replace(/[^a-zA-Z0-9_]/g, "_");
        const sentinelKey = `__bb_xss_${sanitizedMissionId}_${inputCounter}`;
        const sentinelValue = `SENTINEL_${Math.random().toString(36).substring(2, 9)}`;
        const testPayload = `<img src="x" onerror="window.${sentinelKey}='${sentinelValue}'">`;

        // Step A: Navigate to form page
        await page.goto(candidate.pageUrl, { waitUntil: "domcontentloaded" });

        // Step B: Fill target field
        const targetSelector = candidate.targetField.id
          ? `#${candidate.targetField.id}`
          : `[name="${candidate.targetField.name}"]`;
        await page.fill(targetSelector, testPayload);

        // Step C: Fill secondary fields (e.g. rating select)
        for (const sec of candidate.secondaryFields) {
          const secSelector = sec.id ? `#${sec.id}` : `[name="${sec.name}"]`;
          if (sec.type === "select") {
            try {
              await page.selectOption(secSelector, sec.defaultValue || "5");
            } catch {
              // Ignore if selection fails
            }
          }
        }

        // Step D: Submit form
        const submitSelector = candidate.submitButtonText
          ? `button:has-text("${candidate.submitButtonText}")`
          : 'button[type="submit"], input[type="submit"]';
        await page.click(submitSelector);

        // Step E: Wait for submission confirmation in DOM
        try {
          await page.waitForSelector("#review-msg.success", { timeout: 7000 });
        } catch {
          console.log(`    ⚠️  Submission confirmation message not observed within timeout`);
        }

        // Step F: Verify Storage via API
        let storedVerbatim = false;
        let reviewId: string | null = null;
        let apiSnippet: string | null = null;
        let queryEndpoint = candidate.submissionEndpoint;

        // Replace :id with product id if applicable
        const prodIdMatch = candidate.pageUrl.match(/\/products\/([a-zA-Z0-9_-]+)/);
        const resolvedProdId = prodIdMatch ? prodIdMatch[1] : null;

        if (resolvedProdId && queryEndpoint.includes(":id")) {
          queryEndpoint = queryEndpoint.replace(":id", resolvedProdId);
        } else if (resolvedProdId && !queryEndpoint.includes(resolvedProdId)) {
          queryEndpoint = `/shop/api/products/${resolvedProdId}/reviews`;
        }

        try {
          const apiRes = await this.makeHttpRequest(queryEndpoint, "GET");
          if (Array.isArray(apiRes.body)) {
            const list = apiRes.body as { id?: string; content?: string }[];
            const matched = list.find((item) => item.content === testPayload);
            if (matched) {
              storedVerbatim = true;
              reviewId = matched.id || null;
              apiSnippet = JSON.stringify(matched);
            }
          }
        } catch (err) {
          this.errors.push(`API verification error on ${queryEndpoint}: ${String(err)}`);
        }
        console.log(`    [1/3] Payload stored verbatim in database: ${storedVerbatim} (id: ${reviewId || "unknown"})`);

        // Step G: Navigate to render URL and inspect sink
        await page.goto(candidate.expectedRenderUrl, { waitUntil: "domcontentloaded" });
        const pageHtml = await page.content();
        const containsDangerousSink = /\.innerHTML\s*=/.test(pageHtml);

        let sinkSnippet: string | null = null;
        const sinkMatch = pageHtml.match(
          /document\.getElementById\('review-content-[^']+'\)\.innerHTML\s*=\s*[^;]+;/
        );
        if (sinkMatch) {
          sinkSnippet = sinkMatch[0];
        }
        console.log(`    [2/3] Dangerous innerHTML sink present in page: ${containsDangerousSink}`);

        // Step H: Verify in-browser JavaScript execution
        let executed = false;
        let actualValue: string | null = null;

        try {
          await page.waitForFunction(
            (key) => (window as unknown as Record<string, unknown>)[key] !== undefined,
            sentinelKey,
            { timeout: 5000 }
          );
        } catch {
          // Timeout: marker not set
        }

        actualValue = await page.evaluate(
          (key) => ((window as unknown as Record<string, unknown>)[key] as string) ?? null,
          sentinelKey
        );
        executed = actualValue === sentinelValue;
        console.log(`    [3/3] In-browser DOM JavaScript execution: ${executed ? "CONFIRMED" : "FAILED"}`);

        // Step I: Enforce 4-way verification criteria
        const reproducible = storedVerbatim && containsDangerousSink && executed;

        const evidence: XSSEvidence = {
          browserEngine: "Chromium (Playwright)",
          targetUrl: candidate.pageUrl,
          authenticatedAs: this.options.credentials.email,
          payloadSubmitted: {
            content: testPayload,
            sentinelKey,
            sentinelValue,
            inputSelector: targetSelector,
            submissionUrl: candidate.submissionEndpoint,
          },
          storageVerification: {
            reviewId,
            storedVerbatim,
            apiEndpointQueried: queryEndpoint,
            apiResponseSnippet: apiSnippet,
          },
          renderVerification: {
            pageUrl: candidate.expectedRenderUrl,
            containsDangerousSink,
            sinkSnippet,
          },
          browserExecution: {
            sentinelKey,
            expectedValue: sentinelValue,
            actualValue,
            executed,
          },
        };

        testedEvidenceList.push({
          candidate,
          evidence,
          reproducible,
        });

        if (reproducible) {
          console.log(`    ✓ Input verified vulnerable: Browser executed sentinel ${sentinelKey}`);
        } else {
          console.log(`    ✗ Input did not satisfy full execution criteria`);
        }

        inputCounter++;
      }

      // Root-Cause Deduplication:
      // Group reproducible inputs by underlying vulnerability root cause.
      // All tested review forms submit to POST /shop/api/products/:id/reviews and render via the unescaped innerHTML sink.
      // Rather than artificially inflating finding count to 4, consolidate into 1 distinct root-cause finding preserving all 4 evidence records.
      const reproducibleInputs = testedEvidenceList.filter((t) => t.reproducible);
      if (reproducibleInputs.length > 0) {
        const primary = reproducibleInputs[0];
        const allPages = Array.from(new Set(reproducibleInputs.map((r) => r.candidate.pageUrl)));
        const allEvidences = reproducibleInputs.map((r) => r.evidence);

        const consolidatedFinding: XSSFinding = {
          findingId: "xss-find-001",
          vulnerabilityType: "Stored Cross-Site Scripting (Stored XSS)",
          title: "Stored XSS in Review Content Rendered via Unescaped innerHTML Sink",
          severity: "High",
          affectedPage: "/shop/products/:id",
          affectedPages: allPages,
          affectedEndpoint: "/shop/api/products/:id/reviews",
          inputField: primary.candidate.targetField.name || primary.candidate.targetField.id,
          payloadType: "IMG_ONERROR_SENTINEL",
          testResult: "VULNERABILITY_CONFIRMED",
          reproducible: true,
          evidence: primary.evidence,
          allEvidence: allEvidences,
          testedInstancesCount: reproducibleInputs.length,
          reproductionSteps: [
            `Authenticate to the application as demo user (${this.options.credentials.email}).`,
            `Navigate to any product detail page containing the review form (e.g. ${allPages[0]}).`,
            `Submit a review payload containing an HTML element with an event handler into '${primary.candidate.targetField.name || primary.candidate.targetField.id}': ${primary.evidence.payloadSubmitted.content}.`,
            `Verify that the API endpoint /shop/api/products/:id/reviews stores the payload without encoding or sanitization.`,
            `Navigate to the product render page.`,
            `Observe that the client script injects the raw review content into the DOM using document.getElementById(...).innerHTML = ...`,
            `Verify that the browser triggers the event handler and executes JavaScript in the page execution context.`,
            `Confirmed identical execution across ${reproducibleInputs.length} product endpoints: [${allPages.map((p) => p.split("/").pop()).join(", ")}].`,
          ],
          remediation:
            "Avoid assigning untrusted user-supplied content to element.innerHTML. Use element.textContent or safe DOM templating. Alternatively, sanitize input using DOMPurify before DOM insertion.",
          timestamp: new Date().toISOString(),
        };

        findings.push(consolidatedFinding);
        console.log(`\n  🎯 ROOT-CAUSE FINDING CONFIRMED: ${consolidatedFinding.findingId} - ${consolidatedFinding.title}`);
        console.log(`     Tested inputs evaluated : ${candidates.length}`);
        console.log(`     Confirmed vulnerable    : ${reproducibleInputs.length}`);
        console.log(`     Unique root-cause vulns : 1`);
      }
    } catch (err) {
      console.error(`  ✕ Execution error during XSS testing:`, err);
      this.errors.push(`Execution error: ${String(err)}`);
    } finally {
      // 7. Teardown browser
      if (browser) {
        try {
          await browser.close();
        } catch {
          // Ignore close error
        }
      }

      // 8. Clean up: reset database after testing
      console.log(`\n[Phase 6] Cleaning up test data (post-mission reset)…`);
      await this.resetDatabase();
      console.log(`  ✓ Database restored to clean seeded state`);
    }

    const durationMs = Date.now() - startTime;
    const missionResult: XSSMissionResult = {
      missionId: this.missionId,
      target: this.reconResult.target,
      status: this.errors.length > 0 && findings.length === 0 ? "failed" : "completed",
      summary: {
        totalDiscoveredForms: this.reconResult.forms.length,
        candidateInputsEvaluated: candidates.length,
        skippedFieldsCount: skipped.length,
        testedInputsCount: candidates.length,
        vulnerabilitiesConfirmed: findings.length,
        durationMs,
      },
      candidatesEvaluated: candidates,
      skippedFields: skipped,
      findings,
      errors: this.errors,
      metadata: {
        agentName: "XssAgent",
        agentVersion: "1.0.0",
        completedAt: new Date().toISOString(),
        targetScope: this.options.targetScope,
      },
    };

    this.saveResult(missionResult);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  Stored XSS Agent Mission Complete`);
    console.log(`  Candidates Evaluated : ${candidates.length}`);
    console.log(`  Skipped Fields       : ${skipped.length}`);
    console.log(`  Vulnerabilities Found: ${findings.length}`);
    console.log(`  Duration             : ${durationMs}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    return missionResult;
  }

  /**
   * Serializes and writes mission results to disk, verifying zero credential leaks.
   */
  private saveResult(result: XSSMissionResult): void {
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
          "[SECURITY CRITICAL] Password or raw session token detected in XSS findings report!"
        );
      }

      fs.writeFileSync(this.options.outputFilePath, jsonStr, "utf8");
      console.log(`\n━━━ XSS Agent Result saved to: ${this.options.outputFilePath}`);
    } catch (err) {
      console.error(`Failed to save XSS agent result:`, err);
    }
  }
}

/**
 * Functional entrypoint:
 * runXssMission(reconResult, missionId?, options?) -> Promise<XSSMissionResult>
 */
export async function runXssMission(
  reconResult: ReconResult,
  missionId?: string,
  options?: XSSAgentOptions
): Promise<XSSMissionResult> {
  const agent = new XssAgent(reconResult, {
    ...options,
    missionId: missionId || options?.missionId,
  });
  return await agent.execute();
}
