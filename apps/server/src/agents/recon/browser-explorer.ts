/**
 * apps/server/src/agents/recon/browser-explorer.ts
 *
 * Playwright-driven browser exploration engine.
 * Strictly restricted to localhost:4000/shop — rejects all external origins.
 */

import { chromium, type Browser, type BrowserContext, type Page, type Response, type Request } from "playwright";
import type {
  DiscoveredForm,
  DiscoveredPage,
  FormField,
  ReconCredentials,
} from "./types.js";

export interface ObservedNetworkRequest {
  url: string;
  method: string;
  statusCode: number | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  hasAuthHeader: boolean;
  discoveredOnPage: string;
  timestamp: string;
}

export interface PageExplorationData {
  page: DiscoveredPage;
  internalLinks: string[];
  forms: DiscoveredForm[];
  scriptEndpoints: { path: string; method?: string }[];
}

export class BrowserExplorer {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private targetOrigin = "http://localhost:4000";
  private targetBasePath = "/shop";
  private observedRequests: ObservedNetworkRequest[] = [];
  private externalOriginsVisited: string[] = [];

  constructor(targetUrl = "http://localhost:4000/shop") {
    try {
      const parsed = new URL(targetUrl);
      this.targetOrigin = parsed.origin;
      this.targetBasePath = parsed.pathname.replace(/\/+$/, "");
    } catch {
      this.targetOrigin = "http://localhost:4000";
      this.targetBasePath = "/shop";
    }
  }

  /**
   * Strictly enforces target scope: only localhost:4000/shop* is allowed.
   * Rejects external domains, foreign ports, and non-shop paths.
   */
  public isAllowedUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
      const isExpectedPort = parsed.port === "4000" || parsed.port === "";
      const isShopPath =
        parsed.pathname === this.targetBasePath ||
        parsed.pathname.startsWith(this.targetBasePath + "/");

      return isLocalhost && isExpectedPort && isShopPath;
    } catch {
      return false;
    }
  }

  public assertSafeUrl(urlStr: string): void {
    if (!this.isAllowedUrl(urlStr)) {
      this.externalOriginsVisited.push(urlStr);
      throw new Error(`[SECURITY] URL rejected outside demo target scope: ${urlStr}`);
    }
  }

  public async init(headless = true): Promise<void> {
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();

    // Hook network request/response observation
    this.page.on("request", (req: Request) => {
      // Security guard on all browser-initiated requests
      if (!this.isAllowedUrl(req.url())) {
        this.externalOriginsVisited.push(req.url());
      }
    });

    this.page.on("response", (res: Response) => {
      const req = res.request();
      const url = req.url();

      if (this.isAllowedUrl(url)) {
        const headers = req.headers();
        const hasAuth =
          Boolean(headers["authorization"]) || Boolean(headers["x-session-token"]);

        this.observedRequests.push({
          url,
          method: req.method(),
          statusCode: res.status(),
          requestHeaders: headers,
          responseHeaders: res.headers(),
          hasAuthHeader: hasAuth,
          discoveredOnPage: this.page ? this.page.url() : url,
          timestamp: new Date().toISOString(),
        });
      }
    });
  }

  public getObservedRequests(): ObservedNetworkRequest[] {
    return [...this.observedRequests];
  }

  public getExternalOriginsVisited(): string[] {
    return [...this.externalOriginsVisited];
  }

  /**
   * Navigates to a page and extracts all attack surface details:
   * Title, links, forms, input fields, and script endpoints.
   */
  public async explorePage(targetUrl: string): Promise<PageExplorationData> {
    this.assertSafeUrl(targetUrl);
    if (!this.page) throw new Error("Explorer not initialized.");

    const response = await this.page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    const statusCode = response ? response.status() : 200;
    const title = (await this.page.title()).trim();
    const currentUrl = this.page.url();
    const parsedCurrent = new URL(currentUrl);

    // Extract authentication requirement indicators from DOM
    const authIndicators = await this.page.evaluate(() => {
      const text = document.body ? document.body.innerText : "";
      const requiresLoginText =
        text.includes("Please log in first") ||
        text.includes("Unauthorized – please log in") ||
        text.includes("Please log in");
      const hasLoginForm = Boolean(document.getElementById("login-section"));
      const isOrdersListEmptyPrompt =
        Boolean(document.getElementById("orders-list")) && requiresLoginText;
      const navUserText =
        document.getElementById("nav-user")?.textContent?.trim() ?? "";
      const isAuthenticatedInStorage = Boolean(localStorage.getItem("shopToken"));

      return {
        requiresLoginText,
        hasLoginForm,
        isOrdersListEmptyPrompt,
        navUserText,
        isAuthenticatedInStorage,
      };
    });

    // Determine if page requires auth
    const authRequired =
      authIndicators.isOrdersListEmptyPrompt ||
      (parsedCurrent.pathname.includes("/orders") && !authIndicators.isAuthenticatedInStorage);

    // Discover internal links
    const rawLinks = await this.page.$$eval("a[href]", (anchors) =>
      anchors.map((a) => ({
        href: a.getAttribute("href") || "",
        text: (a.textContent || "").trim(),
      }))
    );

    const internalLinksSet = new Set<string>();
    for (const link of rawLinks) {
      if (!link.href || link.href.startsWith("#") || link.href.startsWith("javascript:")) {
        continue;
      }
      try {
        const resolved = new URL(link.href, currentUrl).href;
        if (this.isAllowedUrl(resolved)) {
          // Normalize (strip trailing slash or hash)
          const norm = resolved.split("#")[0].replace(/\/+$/, "");
          internalLinksSet.add(norm);
        }
      } catch {
        // Ignore unparseable
      }
    }

    // Discover forms and interactive panels
    const forms = await this.extractFormsFromDom(currentUrl);

    // Discover API endpoints referenced in page scripts
    const scriptEndpoints = await this.extractScriptEndpoints();

    const discoveredPage: DiscoveredPage = {
      url: currentUrl,
      path: parsedCurrent.pathname,
      title,
      authRequired,
      statusCode,
      linksDiscovered: Array.from(internalLinksSet),
      formsDiscovered: forms.length,
      discoveredAt: new Date().toISOString(),
    };

    return {
      page: discoveredPage,
      internalLinks: Array.from(internalLinksSet),
      forms,
      scriptEndpoints,
    };
  }

  /**
   * Extracts traditional <form> elements and modern AJAX input panels
   * (e.g. review submission, order lookup, login card, cart editor).
   */
  private async extractFormsFromDom(pageUrl: string): Promise<DiscoveredForm[]> {
    if (!this.page) return [];

    const discoveredForms = await this.page.evaluate((currUrl) => {
      const results: {
        id: string;
        formAction: string;
        method: string;
        fields: {
          name: string;
          id: string;
          type: string;
          placeholder?: string;
          label?: string;
          required: boolean;
          defaultValue?: string;
        }[];
        submitButton?: {
          text: string;
          id?: string;
          actionDescription?: string;
        };
      }[] = [];

      // 1. Traditional <form> elements
      const standardForms = document.querySelectorAll("form");
      standardForms.forEach((form, idx) => {
        const action = form.getAttribute("action") || currUrl;
        const method = (form.getAttribute("method") || "GET").toUpperCase();
        const formId = form.id || `form-${idx + 1}`;

        const fields: typeof results[0]["fields"] = [];
        const inputs = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input, textarea, select"
        );

        inputs.forEach((input) => {
          fields.push({
            name: input.name || input.id || "unnamed",
            id: input.id || "",
            type: (input.getAttribute("type") || input.tagName.toLowerCase()),
            placeholder: input.getAttribute("placeholder") || undefined,
            required: input.hasAttribute("required"),
            defaultValue: input.value || undefined,
          });
        });

        const submitBtn = form.querySelector<HTMLButtonElement | HTMLInputElement>(
          'button[type="submit"], input[type="submit"], button'
        );

        results.push({
          id: formId,
          formAction: action,
          method,
          fields,
          submitButton: submitBtn
            ? {
                text: (submitBtn.textContent || (submitBtn as HTMLInputElement).value || "").trim(),
                id: submitBtn.id || undefined,
                actionDescription: submitBtn.getAttribute("onclick") || undefined,
              }
            : undefined,
        });
      });

      // 2. Interactive AJAX cards / form containers (e.g. login, reviews, orders lookup)
      const potentialContainers = document.querySelectorAll<HTMLElement>(
        "#login-section, .card, div[id*='form'], div[id*='section']"
      );

      potentialContainers.forEach((container, idx) => {
        // Skip if inside a standard <form> already handled
        if (container.closest("form")) return;

        const inputs = container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
          "input, textarea, select"
        );
        const button = container.querySelector<HTMLButtonElement>("button");

        // Only treat as an interactive form if it has both input elements and a button
        if (inputs.length > 0 && button) {
          const containerId =
            container.id || `panel-${container.className.replace(/\s+/g, "-")}-${idx + 1}`;

          const fields: typeof results[0]["fields"] = [];
          inputs.forEach((input) => {
            fields.push({
              name: input.name || input.id || "field",
              id: input.id || "",
              type: (input.getAttribute("type") || input.tagName.toLowerCase()),
              placeholder: input.getAttribute("placeholder") || undefined,
              required: input.hasAttribute("required"),
              defaultValue: input.value || undefined,
            });
          });

          // Infer action/endpoint from button onclick if present
          const onclick = button.getAttribute("onclick") || "";
          let inferredAction = currUrl;
          let inferredMethod = "POST";

          if (onclick.includes("login")) {
            inferredAction = "/shop/api/auth/login";
            inferredMethod = "POST";
          } else if (onclick.includes("submitReview")) {
            inferredAction = "/shop/api/products/:id/reviews";
            inferredMethod = "POST";
          } else if (onclick.includes("lookupOrder")) {
            inferredAction = "/shop/api/orders/:id";
            inferredMethod = "GET";
          } else if (onclick.includes("placeOrder")) {
            inferredAction = "/shop/api/checkout";
            inferredMethod = "POST";
          }

          results.push({
            id: containerId,
            formAction: inferredAction,
            method: inferredMethod,
            fields,
            submitButton: {
              text: (button.textContent || "").trim(),
              id: button.id || undefined,
              actionDescription: onclick || undefined,
            },
          });
        }
      });

      return results;
    }, pageUrl);

    return discoveredForms.map((f) => ({
      ...f,
      pageUrl,
    }));
  }

  /**
   * Scans page HTML/scripts to extract API routes that the frontend communicates with.
   */
  private async extractScriptEndpoints(): Promise<{ path: string; method?: string }[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const endpoints: { path: string; method?: string }[] = [];
      const scripts = Array.from(document.querySelectorAll("script")).map((s) => s.textContent || "");
      const fullHtml = document.documentElement.innerHTML;
      const combined = scripts.join("\n") + "\n" + fullHtml;

      // Match endpoints like '/shop/api/...'
      const apiMatches = combined.matchAll(/\/shop\/api\/[a-zA-Z0-9_\-\/:]+/g);
      for (const match of apiMatches) {
        const path = match[0];
        if (!endpoints.some((e) => e.path === path)) {
          // Infer method based on context in string
          let method = "GET";
          if (
            path.includes("login") ||
            path.includes("logout") ||
            path.includes("checkout") ||
            path.includes("reviews")
          ) {
            method = "POST";
          }
          endpoints.push({ path, method });
        }
      }

      return endpoints;
    });
  }

  /**
   * Logs in using demo credentials inside the browser context, establishing session.
   */
  public async login(credentials: ReconCredentials): Promise<boolean> {
    if (!this.page) throw new Error("Explorer not initialized.");

    const loginUrl = `${this.targetOrigin}${this.targetBasePath}`;
    this.assertSafeUrl(loginUrl);

    await this.page.goto(loginUrl, { waitUntil: "domcontentloaded" });

    // Fill credentials in demo shop login form
    await this.page.fill("#email", credentials.email);
    await this.page.fill("#password", credentials.password);
    await this.page.click('#login-section button:has-text("Login")');

    // Wait for session token in localStorage
    try {
      await this.page.waitForFunction(
        () => localStorage.getItem("shopToken") !== null,
        undefined,
        { timeout: 6000 }
      );
      const token = await this.page.evaluate(() => localStorage.getItem("shopToken"));
      return typeof token === "string" && token.length > 0;
    } catch {
      return false;
    }
  }

  public async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
