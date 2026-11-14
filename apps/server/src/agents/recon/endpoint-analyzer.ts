/**
 * apps/server/src/agents/recon/endpoint-analyzer.ts
 *
 * Correlates, normalizes, and analyzes endpoints discovered through
 * network traffic observation, form actions, and script references.
 */

import http from "node:http";
import type { DiscoveredEndpoint, DiscoveredForm } from "./types.js";
import type { ObservedNetworkRequest, PageExplorationData } from "./browser-explorer.js";

export class EndpointAnalyzer {
  private targetOrigin: string;

  constructor(targetOrigin = "http://localhost:4000") {
    this.targetOrigin = targetOrigin;
  }

  /**
   * Normalizes a path, replacing concrete IDs with pattern placeholders
   * e.g. /shop/api/products/prod-001 -> /shop/api/products/:id
   *      /shop/api/orders/order-alice-001 -> /shop/api/orders/:id
   */
  public normalizeApiPath(rawPath: string): { normalizedPath: string; dynamicParam?: string } {
    const segments = rawPath.split("/").filter(Boolean);
    let dynamicParam: string | undefined;

    const normalizedSegments = segments.map((seg, idx) => {
      // Check for product ID pattern: prod-001, prod-xyz
      if (/^prod-\d+$/i.test(seg) || (idx === segments.length - 1 && segments[idx - 1] === "products" && seg.length > 2)) {
        dynamicParam = "id";
        return ":id";
      }
      // Check for order ID pattern: order-xxx, order-alice-001
      if (/^order-[a-z0-9-]+$/i.test(seg) || (idx === segments.length - 1 && segments[idx - 1] === "orders" && seg.length > 2)) {
        dynamicParam = "id";
        return ":id";
      }
      return seg;
    });

    return {
      normalizedPath: "/" + normalizedSegments.join("/"),
      dynamicParam,
    };
  }

  /**
   * Combines all observation channels (network traffic, forms, scripts) into
   * a comprehensive list of DiscoveredEndpoints.
   */
  public async analyzeEndpoints(
    networkRequests: ObservedNetworkRequest[],
    pageResults: PageExplorationData[],
    forms: DiscoveredForm[]
  ): Promise<DiscoveredEndpoint[]> {
    const endpointsMap = new Map<string, DiscoveredEndpoint>();

    // 1. Process network requests directly observed by browser
    for (const req of networkRequests) {
      try {
        const parsedUrl = new URL(req.url);
        const { normalizedPath, dynamicParam } = this.normalizeApiPath(parsedUrl.pathname);
        const method = req.method.toUpperCase();
        const key = `${method} ${normalizedPath}`;

        // Extract query parameters
        const parameters: DiscoveredEndpoint["parameters"] = [];
        parsedUrl.searchParams.forEach((_, paramName) => {
          parameters.push({ name: paramName, in: "query" });
        });

        if (dynamicParam) {
          parameters.push({ name: dynamicParam, in: "path", type: "string" });
        }

        const isAuthEndpoint =
          req.hasAuthHeader ||
          req.statusCode === 401 ||
          normalizedPath.includes("/orders") ||
          normalizedPath.includes("/checkout") ||
          normalizedPath.includes("/auth/me");

        endpointsMap.set(key, {
          url: `${this.targetOrigin}${normalizedPath}`,
          path: normalizedPath,
          method,
          statusCode: req.statusCode,
          authRequired: isAuthEndpoint,
          parameters,
          discoverySource: "network-observation",
          discoveredOnPage: req.discoveredOnPage,
        });
      } catch {
        // Skip malformed
      }
    }

    // 2. Process endpoints discovered via forms
    for (const form of forms) {
      if (form.formAction && form.formAction.startsWith("/shop/api")) {
        const { normalizedPath, dynamicParam } = this.normalizeApiPath(form.formAction);
        const method = form.method.toUpperCase() || "POST";
        const key = `${method} ${normalizedPath}`;

        const formParams: DiscoveredEndpoint["parameters"] = form.fields.map((f) => ({
          name: f.name || f.id,
          in: "body",
          type: f.type,
        }));

        if (dynamicParam) {
          formParams.push({ name: dynamicParam, in: "path", type: "string" });
        }

        const isAuthEndpoint =
          normalizedPath.includes("/orders") ||
          normalizedPath.includes("/checkout") ||
          normalizedPath.includes("/reviews");

        if (!endpointsMap.has(key)) {
          endpointsMap.set(key, {
            url: `${this.targetOrigin}${normalizedPath}`,
            path: normalizedPath,
            method,
            statusCode: null,
            authRequired: isAuthEndpoint,
            parameters: formParams,
            discoverySource: "form-action",
            discoveredOnPage: form.pageUrl,
          });
        }
      }
    }

    // 3. Process endpoints discovered through page script scanning
    for (const res of pageResults) {
      for (const ep of res.scriptEndpoints) {
        const { normalizedPath, dynamicParam } = this.normalizeApiPath(ep.path);
        const method = (ep.method || "GET").toUpperCase();
        const key = `${method} ${normalizedPath}`;

        if (!endpointsMap.has(key)) {
          const params: DiscoveredEndpoint["parameters"] = [];
          if (dynamicParam) {
            params.push({ name: dynamicParam, in: "path", type: "string" });
          }

          const isAuthEndpoint =
            normalizedPath.includes("/orders") ||
            normalizedPath.includes("/checkout") ||
            normalizedPath.includes("/auth/me") ||
            normalizedPath.includes("/reviews");

          endpointsMap.set(key, {
            url: `${this.targetOrigin}${normalizedPath}`,
            path: normalizedPath,
            method,
            statusCode: null,
            authRequired: isAuthEndpoint,
            parameters: params,
            discoverySource: "page-script",
            discoveredOnPage: res.page.url,
          });
        }
      }
    }

    // 4. Verify auth requirement by non-destructively probing endpoints unauthenticated
    const endpoints = Array.from(endpointsMap.values());
    for (const ep of endpoints) {
      // If statusCode is null or we want to verify auth status definitively
      if (ep.method === "GET" && ep.statusCode === null) {
        try {
          const testPath = ep.path.replace(":id", "prod-001");
          const status = await this.probeStatus(`${this.targetOrigin}${testPath}`);
          ep.statusCode = status;
          if (status === 401) {
            ep.authRequired = true;
          }
        } catch {
          // Probe failure is non-fatal
        }
      }
    }

    return endpoints;
  }

  /**
   * Safe, read-only HTTP GET probe to determine response status code without auth.
   */
  private probeStatus(urlStr: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        const parsed = new URL(urlStr);
        const req = http.request(
          {
            hostname: parsed.hostname,
            port: Number(parsed.port || 80),
            path: parsed.pathname,
            method: "GET",
            headers: { Accept: "application/json, text/html" },
            timeout: 2000,
          },
          (res) => {
            resolve(res.statusCode ?? 0);
          }
        );
        req.on("error", () => resolve(0));
        req.on("timeout", () => {
          req.destroy();
          resolve(0);
        });
        req.end();
      } catch {
        resolve(0);
      }
    });
  }
}
