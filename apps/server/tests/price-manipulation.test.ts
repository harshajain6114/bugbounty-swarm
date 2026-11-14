/**
 * tests/price-manipulation.test.ts
 *
 * Security test: Price Manipulation — POST /shop/api/checkout
 *
 * Strategy:
 *  1. Alice logs in.
 *  2. Fetch the canonical (server-side) product price for prod-001 from the API.
 *  3. Alice submits a checkout request with a manipulated price (1 cent).
 *  4. Compare the price recorded in the returned order with:
 *     a. The legitimate server-side product price — they should DIFFER if vuln exists.
 *     b. The client-supplied manipulated price  — they should MATCH if vuln exists.
 *  5. Record structured finding.
 *
 * Exit codes:
 *   0 — test ran cleanly AND vulnerability was reproduced
 *   1 — test ran cleanly but vulnerability was NOT reproduced (vuln was fixed)
 *   2 — test infrastructure error
 *
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY — localhost-restricted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { httpRequest, loginAs, bearer, BASE } from "./lib/http-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_PRODUCT_ID     = "prod-001";
const MANIPULATED_PRICE   = 1;   // 1 cent (should be 7999 cents = $79.99)

export interface PriceManipulationFinding {
  testName: string;
  vulnerability: string;
  severity: string;
  affectedEndpoint: string;
  cwe: string;
  reproductionSteps: string[];
  evidence: {
    legitimateProductPrice: number;         // server-side price in cents
    clientSubmittedPrice: number;           // what the test sent
    recordedPriceAtPurchase: number | null; // what the server stored in the order
    orderTotal: number | null;              // order total stored by server
    priceDifference: number | null;         // legitimate - recorded (cents)
  };
  testPassed: boolean;
  vulnerabilityReproduced: boolean;
  details: string;
  testedAt: string;
}

async function runPriceManipulationTest(): Promise<PriceManipulationFinding> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BUGBOUNTY SWARM — Price Manipulation Security Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ── Step 1: Alice logs in ──────────────────────────────────────────────────
  console.log("[1/4] Logging in as Alice…");
  const alice = await loginAs("alice@example.com", "Alice123!");
  console.log(`  ✓ Logged in as ${alice.name} (${alice.userId})`);

  // ── Step 2: Fetch canonical server-side product price ─────────────────────
  console.log(`\n[2/4] Fetching canonical price for product ${TEST_PRODUCT_ID}…`);
  const productResult = await httpRequest(`${BASE}/products/${TEST_PRODUCT_ID}`, "GET", {});
  if (productResult.status !== 200) {
    throw new Error(`Failed to fetch product: HTTP ${productResult.status}`);
  }
  const productData = productResult.body as { id: string; name: string; price: number };
  const legitimatePrice = productData.price;
  console.log(`  ✓ Canonical price: ${legitimatePrice} cents ($${(legitimatePrice / 100).toFixed(2)})`);
  console.log(`  Sending manipulated price: ${MANIPULATED_PRICE} cent ($${(MANIPULATED_PRICE / 100).toFixed(2)})`);

  // ── Step 3: Checkout with manipulated price ────────────────────────────────
  console.log("\n[3/4] Submitting checkout with manipulated price…");
  const checkoutPayload = {
    items: [
      {
        productId: TEST_PRODUCT_ID,
        quantity: 1,
        price: MANIPULATED_PRICE,  // ⚠️ client-controlled — legitimate is legitimatePrice
      },
    ],
  };
  console.log("  Payload:", JSON.stringify(checkoutPayload, null, 4));

  const checkoutResult = await httpRequest(
    `${BASE}/checkout`,
    "POST",
    bearer(alice.token),
    checkoutPayload
  );
  console.log(`  HTTP ${checkoutResult.status}`);
  console.log("  Response:", JSON.stringify(checkoutResult.body, null, 4));

  if (checkoutResult.status !== 201) {
    throw new Error(`Checkout request failed: HTTP ${checkoutResult.status}`);
  }

  // ── Step 4: Evaluate ───────────────────────────────────────────────────────
  console.log("\n[4/4] Evaluating result…");

  const responseBody = checkoutResult.body as {
    order?: {
      total: number;
      items: { productId: string; quantity: number; priceAtPurchase: number }[];
    };
  };

  const recordedItem = responseBody.order?.items.find(
    (i) => i.productId === TEST_PRODUCT_ID
  );
  const recordedPrice = recordedItem?.priceAtPurchase ?? null;
  const orderTotal   = responseBody.order?.total ?? null;
  const priceDiff    = recordedPrice !== null ? legitimatePrice - recordedPrice : null;

  const vulnReproduced =
    recordedPrice !== null &&
    recordedPrice === MANIPULATED_PRICE &&
    recordedPrice !== legitimatePrice;

  if (vulnReproduced) {
    console.log("  ⚠️  VULNERABILITY CONFIRMED:");
    console.log(`     Legitimate price : ${legitimatePrice} cents ($${(legitimatePrice / 100).toFixed(2)})`);
    console.log(`     Client-sent price: ${MANIPULATED_PRICE} cent ($${(MANIPULATED_PRICE / 100).toFixed(2)})`);
    console.log(`     Recorded in order: ${recordedPrice} cent (accepted from client)`);
    console.log(`     Price undercharge : ${priceDiff} cents ($${((priceDiff ?? 0) / 100).toFixed(2)} loss)`);
    console.log(`     Order total stored: ${orderTotal} cents`);
  } else {
    console.log("  ✓  Vulnerability NOT reproduced.");
    if (recordedPrice === legitimatePrice) {
      console.log("     Server used its own price instead of the client-supplied price.");
    } else if (checkoutResult.status !== 201) {
      console.log("     Checkout was rejected by the server.");
    }
  }

  return {
    testName: "PRICE-001",
    vulnerability: "Client-Side Price Manipulation (Improper Input Validation)",
    severity: "High",
    affectedEndpoint: "POST /shop/api/checkout",
    cwe: "CWE-20: Improper Input Validation",
    reproductionSteps: [
      "1. POST /shop/api/auth/login — credentials: alice@example.com / Alice123!",
      `2. Note that ${TEST_PRODUCT_ID} has a canonical price of ${legitimatePrice} cents ($${(legitimatePrice / 100).toFixed(2)}).`,
      "3. POST /shop/api/checkout with body:",
      `   { "items": [{ "productId": "${TEST_PRODUCT_ID}", "quantity": 1, "price": ${MANIPULATED_PRICE} }] }`,
      "4. Observe that the returned order records priceAtPurchase = 1 — not the catalog price.",
    ],
    evidence: {
      legitimateProductPrice: legitimatePrice,
      clientSubmittedPrice: MANIPULATED_PRICE,
      recordedPriceAtPurchase: recordedPrice,
      orderTotal,
      priceDifference: priceDiff,
    },
    testPassed: true,
    vulnerabilityReproduced: vulnReproduced,
    details: vulnReproduced
      ? `POST /shop/api/checkout accepts the "price" field from the client payload without ` +
        `validating it against the server-side product catalog. The order was created with ` +
        `priceAtPurchase=${recordedPrice} (client-supplied) instead of ${legitimatePrice} (catalog). ` +
        `Fix: ignore the client price field; derive price from server-side product record.`
      : `The server used the catalog price (${legitimatePrice}) rather than the client-supplied price (${MANIPULATED_PRICE}). ` +
        `The vulnerability appears to be fixed.`,
    testedAt: new Date().toISOString(),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

runPriceManipulationTest()
  .then((finding) => {
    const outPath = path.join(resultsDir, "price-result.json");
    fs.writeFileSync(outPath, JSON.stringify(finding, null, 2));
    console.log(`\n━━━ Result written to: ${outPath}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (finding.vulnerabilityReproduced) {
      process.exit(0); // success: vulnerability confirmed as expected
    } else {
      console.error("FAIL: Price Manipulation vulnerability was NOT reproduced.");
      process.exit(1);
    }
  })
  .catch((err: unknown) => {
    const outPath = path.join(resultsDir, "price-result.json");
    const errFinding: PriceManipulationFinding = {
      testName: "PRICE-001",
      vulnerability: "Client-Side Price Manipulation (Improper Input Validation)",
      severity: "High",
      affectedEndpoint: "POST /shop/api/checkout",
      cwe: "CWE-20: Improper Input Validation",
      reproductionSteps: [],
      evidence: {
        legitimateProductPrice: 0,
        clientSubmittedPrice: MANIPULATED_PRICE,
        recordedPriceAtPurchase: null,
        orderTotal: null,
        priceDifference: null,
      },
      testPassed: false,
      vulnerabilityReproduced: false,
      details: `Test infrastructure error: ${String(err)}`,
      testedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outPath, JSON.stringify(errFinding, null, 2));
    console.error("Test infrastructure error:", err);
    process.exit(2);
  });
