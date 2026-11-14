/**
 * apps/server/src/agents/recon/recon-agent.ts
 *
 * Autonomous Reconnaissance Agent for BugBounty Swarm.
 * Explores the local demo shop using Playwright browser automation
 * to map the attack surface (pages, endpoints, forms, parameters, auth requirements).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserExplorer, type PageExplorationData } from "./browser-explorer.js";
import { EndpointAnalyzer } from "./endpoint-analyzer.js";
import type {
  DiscoveredEndpoint,
  DiscoveredForm,
  DiscoveredPage,
  ReconError,
  ReconOptions,
  ReconResult,
  ReconSummary,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type AgentStatus =
  | "idle"
  | "initializing"
  | "crawling_unauth"
  | "authenticating"
  | "crawling_auth"
  | "analyzing"
  | "completed"
  | "failed";

export class ReconAgent {
  public missionId: string;
  public status: AgentStatus = "idle";
  private targetUrl: string;
  private options: Required<ReconOptions>;
  private explorer: BrowserExplorer | null = null;
  private analyzer: EndpointAnalyzer;
  private errors: ReconError[] = [];

  constructor(targetUrl = "http://localhost:4000/shop", options?: ReconOptions) {
    this.targetUrl = targetUrl;
    this.missionId = options?.missionId || `recon-local-${Date.now()}`;

    // Standard default options
    const defaultResultsDir = path.resolve(__dirname, "../../../tests/results");
    this.options = {
      missionId: this.missionId,
      maxPages: options?.maxPages ?? 25,
      maxDepth: options?.maxDepth ?? 3,
      crawlTimeoutMs: options?.crawlTimeoutMs ?? 60000,
      credentials: options?.credentials ?? {
        email: "alice@example.com",
        password: "Alice123!",
      },
      headless: options?.headless ?? true,
      outputFilePath: options?.outputFilePath ?? path.join(defaultResultsDir, "recon-result.json"),
    };

    let targetOrigin = "http://localhost:4000";
    try {
      targetOrigin = new URL(targetUrl).origin;
    } catch {
      // Use fallback
    }
    this.analyzer = new EndpointAnalyzer(targetOrigin);
  }

  /**
   * Main mission execution entry point.
   */
  public async execute(): Promise<ReconResult> {
    const startTime = Date.now();
    this.status = "initializing";
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  BUGBOUNTY SWARM — Reconnaissance Agent`);
    console.log(`  Mission ID : ${this.missionId}`);
    console.log(`  Target     : ${this.targetUrl}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    this.explorer = new BrowserExplorer(this.targetUrl);

    // Security origin check upfront
    if (!this.explorer.isAllowedUrl(this.targetUrl)) {
      const err: ReconError = {
        phase: "validation",
        url: this.targetUrl,
        message: `[SECURITY] Target outside allowed local demo scope: ${this.targetUrl}`,
        timestamp: new Date().toISOString(),
      };
      this.errors.push(err);
      this.status = "failed";
      return this.buildResult(startTime, [], [], []);
    }

    const pageResults: PageExplorationData[] = [];
    const allFormsMap = new Map<string, DiscoveredForm>();
    const visitedUrls = new Set<string>();

    try {
      await this.explorer.init(this.options.headless);

      // ── Phase 1: Unauthenticated Exploration ──────────────────────────────
      this.status = "crawling_unauth";
      console.log(`[Phase 1] Commencing unauthenticated browser crawl…`);

      const queue: string[] = [this.normalizeUrl(this.targetUrl)];

      while (queue.length > 0 && visitedUrls.size < this.options.maxPages) {
        const currentUrl = queue.shift()!;
        const normalized = this.normalizeUrl(currentUrl);

        if (visitedUrls.has(normalized)) continue;
        visitedUrls.add(normalized);

        console.log(`  [Crawling] ${normalized}`);
        try {
          const exploration = await this.explorer.explorePage(normalized);
          pageResults.push(exploration);

          // Record forms
          for (const form of exploration.forms) {
            const formKey = `${form.pageUrl}::${form.id}`;
            allFormsMap.set(formKey, form);
          }

          // Enqueue new internal links
          for (const link of exploration.internalLinks) {
            const normLink = this.normalizeUrl(link);
            if (!visitedUrls.has(normLink) && !queue.includes(normLink)) {
              queue.push(normLink);
            }
          }
        } catch (pageErr) {
          this.errors.push({
            phase: "crawling_unauth",
            url: normalized,
            message: String(pageErr),
            timestamp: new Date().toISOString(),
          });
        }
      }

      console.log(`  ✓ Phase 1 complete: ${visitedUrls.size} pages crawled unauthenticated.`);

      // ── Phase 2: Authentication ───────────────────────────────────────────
      this.status = "authenticating";
      console.log(`\n[Phase 2] Authenticating as demo user (${this.options.credentials.email})…`);

      let authSuccess = false;
      try {
        authSuccess = await this.explorer.login(this.options.credentials);
        if (authSuccess) {
          console.log(`  ✓ Session established successfully in browser context.`);
        } else {
          console.warn(`  ⚠️ Browser login returned false. Continuing with unauthenticated findings.`);
        }
      } catch (authErr) {
        this.errors.push({
          phase: "authenticating",
          message: `Login failed: ${String(authErr)}`,
          timestamp: new Date().toISOString(),
        });
      }

      // ── Phase 3: Authenticated Exploration ────────────────────────────────
      if (authSuccess) {
        this.status = "crawling_auth";
        console.log(`\n[Phase 3] Crawling authenticated pages and inspecting state changes…`);

        // Re-visit pages that require auth or display user-specific data
        const authTargets = Array.from(visitedUrls).filter(
          (u) => u.includes("/orders") || u.includes("/checkout") || u === this.targetUrl
        );

        for (const authUrl of authTargets) {
          console.log(`  [Auth Crawl] ${authUrl}`);
          try {
            const authExploration = await this.explorer.explorePage(authUrl);

            // Update page record with authenticated view
            const existingIdx = pageResults.findIndex(
              (p) => this.normalizeUrl(p.page.url) === this.normalizeUrl(authUrl)
            );
            if (existingIdx !== -1) {
              // Mark that this page has an authenticated view
              pageResults[existingIdx].page.authRequired =
                pageResults[existingIdx].page.authRequired || authUrl.includes("/orders");
            }

            // Capture any new forms or buttons visible only after authentication
            for (const form of authExploration.forms) {
              const formKey = `${form.pageUrl}::${form.id}`;
              allFormsMap.set(formKey, form);
            }
          } catch (authCrawlErr) {
            this.errors.push({
              phase: "crawling_auth",
              url: authUrl,
              message: String(authCrawlErr),
              timestamp: new Date().toISOString(),
            });
          }
        }
        console.log(`  ✓ Phase 3 complete: authenticated exploration finished.`);
      }

      // ── Phase 4: Attack-Surface Analysis ──────────────────────────────────
      this.status = "analyzing";
      console.log(`\n[Phase 4] Synthesizing network requests, forms, and endpoints…`);

      const networkRequests = this.explorer.getObservedRequests();
      const allForms = Array.from(allFormsMap.values());
      const endpoints = await this.analyzer.analyzeEndpoints(
        networkRequests,
        pageResults,
        allForms
      );

      console.log(`  ✓ Discovered ${endpoints.length} endpoints, ${allForms.length} forms.`);

      // ── Phase 5: Compile Result ───────────────────────────────────────────
      this.status = "completed";
      const distinctPages = this.deduplicatePages(pageResults.map((r) => r.page));
      const result = this.buildResult(startTime, distinctPages, endpoints, allForms);

      // Persist to tests/results/recon-result.json
      this.saveResult(result);

      return result;
    } catch (globalErr) {
      this.status = "failed";
      this.errors.push({
        phase: "mission_execution",
        message: String(globalErr),
        timestamp: new Date().toISOString(),
      });
      const distinctPages = this.deduplicatePages(pageResults.map((r) => r.page));
      return this.buildResult(startTime, distinctPages, [], Array.from(allFormsMap.values()));
    } finally {
      if (this.explorer) {
        await this.explorer.close();
      }
    }
  }

  private normalizeUrl(urlStr: string): string {
    try {
      const u = new URL(urlStr);
      return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      return urlStr.replace(/\/+$/, "");
    }
  }

  private deduplicatePages(pages: DiscoveredPage[]): DiscoveredPage[] {
    const map = new Map<string, DiscoveredPage>();
    for (const p of pages) {
      const norm = this.normalizeUrl(p.url);
      if (!map.has(norm)) {
        map.set(norm, p);
      }
    }
    return Array.from(map.values());
  }

  private buildResult(
    startTime: number,
    pages: DiscoveredPage[],
    endpoints: DiscoveredEndpoint[],
    forms: DiscoveredForm[]
  ): ReconResult {
    const durationMs = Date.now() - startTime;
    const authenticatedPagesCount = pages.filter((p) => p.authRequired).length;

    const summary: ReconSummary = {
      pagesDiscovered: pages.length,
      endpointsDiscovered: endpoints.length,
      formsDiscovered: forms.length,
      authenticatedPages: authenticatedPagesCount,
      crawlDurationMs: durationMs,
    };

    const externalOrigins = this.explorer ? this.explorer.getExternalOriginsVisited() : [];

    return {
      missionId: this.missionId,
      target: this.targetUrl,
      status: this.status === "failed" ? "failed" : this.errors.length > 0 ? "partial" : "completed",
      summary,
      pages,
      endpoints,
      forms,
      errors: this.errors,
      metadata: {
        agentName: "ReconAgent",
        agentVersion: "1.0.0",
        completedAt: new Date().toISOString(),
        externalOriginsVisited: externalOrigins,
      },
    };
  }

  private saveResult(result: ReconResult): void {
    try {
      const dir = path.dirname(this.options.outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.options.outputFilePath, JSON.stringify(result, null, 2), "utf8");
      console.log(`\n━━━ Recon Result saved to: ${this.options.outputFilePath}`);
    } catch (err) {
      console.error(`Failed to save recon result to ${this.options.outputFilePath}:`, err);
    }
  }
}

/**
 * Functional interface required by the project specifications:
 * runReconMission(target, options?) -> Promise<ReconResult>
 */
export async function runReconMission(
  target = "http://localhost:4000/shop",
  options?: ReconOptions
): Promise<ReconResult> {
  const agent = new ReconAgent(target, options);
  return await agent.execute();
}
