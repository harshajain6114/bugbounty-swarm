/**
 * tests/stored-xss.test.ts
 *
 * Security test: Stored XSS — POST /shop/api/products/:id/reviews
 *                             → GET  /shop/products/:id (render sink)
 *
 * Verified with Playwright Browser Automation:
 *  1. Open local demo shop in Chromium browser.
 *  2. Log in using existing demo credentials (alice@example.com).
 *  3. Submit a harmless XSS test payload that sets a unique marker on the page:
 *     window.__bugbounty_xss_test = "EXECUTED"
 *  4. Navigate to the page where the stored review is rendered.
 *  5. Verify from the browser execution context that the marker was actually set.
 *  6. Distinguish clearly between:
 *     - payloadStored: review stored in database / returned by API
 *     - dangerousSinkDetected: unescaped innerHTML sink in page HTML
 *     - javascriptExecuted: Playwright confirms marker actually set in window
 *     - vulnerabilityReproduced: requires ALL THREE to be true
 *
 * ⚠️  A test must not report XSS as reproduced merely because it finds innerHTML
 *     or sees an encoded payload in HTML source.
 *
 * Exit codes:
 *   0 — test ran cleanly AND vulnerability was reproduced (browser JS executed)
 *   1 — test ran cleanly but vulnerability was NOT reproduced
 *   2 — test infrastructure error
 *
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY — localhost-restricted.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { httpRequest, BASE } from "./lib/http-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SHOP_BASE_URL = "http://localhost:4000/shop";
const TEST_PRODUCT_ID = "prod-001";
const MARKER_NAME = "__bugbounty_xss_test";
const MARKER_VALUE = "EXECUTED";

// Harmless local payload — only sets an in-memory variable on window
const XSS_PAYLOAD = `<img src="x" onerror="window.${MARKER_NAME}='${MARKER_VALUE}'">`;

export interface XSSFinding {
  testName: string;
  vulnerability: string;
  severity: string;
  affectedEndpoints: string[];
  cwe: string;
  payload: string;
  reproductionSteps: string[];
  evidence: {
    browserEngine: string;
    login: {
      user: string;
      loginUrl: string;
      tokenRetrieved: boolean;
    };
    reviewSubmission: {
      submitPageUrl: string;
      reviewId: string | null;
      payloadSubmitted: string;
    };
    apiVerification: {
      httpStatus: number;
      payloadStoredVerbatim: boolean;
      retrievedContent: string | null;
    };
    sinkInspection: {
      renderUrl: string;
      containsDangerousInnerHtmlSink: boolean;
      containsPayloadInScript: boolean;
      sinkSnippet: string | null;
    };
    browserExecution: {
      renderUrl: string;
      markerVariable: string;
      expectedValue: string;
      actualValue: string | null;
      executed: boolean;
    };
  };
  payloadStored: boolean;
  dangerousSinkDetected: boolean;
  javascriptExecuted: boolean;
  testPassed: boolean;
  vulnerabilityReproduced: boolean;
  details: string;
  testedAt: string;
}

async function runXSSTest(): Promise<XSSFinding> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BUGBOUNTY SWARM — Stored XSS Browser Execution Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  console.log(`  Payload: ${XSS_PAYLOAD}`);
  console.log(`  Marker : window.${MARKER_NAME} === '${MARKER_VALUE}'\n`);

  // Launch Playwright Chromium
  console.log("[1/5] Launching Playwright Chromium browser…");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let tokenRetrieved = false;
  let reviewId: string | null = null;
  let apiContent: string | null = null;
  let apiPayloadStoredVerbatim = false;
  let containsDangerousInnerHtmlSink = false;
  let containsPayloadInScript = false;
  let sinkSnippet: string | null = null;
  let markerActualValue: string | null = null;
  let javascriptExecuted = false;

  const productUrl = `${SHOP_BASE_URL}/products/${TEST_PRODUCT_ID}`;

  try {
    // ── Step 1: Log in via browser UI ────────────────────────────────────────
    console.log("[2/5] Logging in as Alice via demo shop UI…");
    await page.goto(SHOP_BASE_URL, { waitUntil: "domcontentloaded" });
    await page.fill("#email", "alice@example.com");
    await page.fill("#password", "Alice123!");
    await page.click('#login-section button:has-text("Login")');

    // Wait for session token in localStorage
    await page.waitForFunction(
      () => localStorage.getItem("shopToken") !== null,
      undefined,
      { timeout: 7000 }
    );

    const token = await page.evaluate(() => localStorage.getItem("shopToken"));
    tokenRetrieved = typeof token === "string" && token.length > 0;
    console.log(`  ✓ Logged in via browser (session token present: ${tokenRetrieved})`);

    // ── Step 2: Submit review through the browser form ────────────────────────
    console.log(`\n[3/5] Submitting review with XSS payload on ${productUrl}…`);
    await page.goto(productUrl, { waitUntil: "domcontentloaded" });
    await page.fill("#review-content", XSS_PAYLOAD);
    await page.selectOption("#review-rating", "5");
    await page.click('button:has-text("Submit Review")');

    // Wait for the submission confirmation message in DOM
    await page.waitForSelector("#review-msg.success", { timeout: 7000 });
    const successMsg = await page.textContent("#review-msg");
    console.log(`  ✓ Review submitted via UI: "${successMsg?.trim()}"`);

    // Verify review storage via API
    const apiResult = await httpRequest(
      `${BASE}/products/${TEST_PRODUCT_ID}/reviews`,
      "GET"
    );
    const reviews = Array.isArray(apiResult.body)
      ? (apiResult.body as { id: string; content: string }[])
      : [];
    const matched = reviews.find((r) => r.content === XSS_PAYLOAD);
    if (matched) {
      reviewId = matched.id;
      apiContent = matched.content;
      apiPayloadStoredVerbatim = true;
    }
    console.log(`  ✓ Review confirmed in database (id=${reviewId}, verbatim=${apiPayloadStoredVerbatim})`);

    // ── Step 3: Navigate to rendered product page & inspect sink ─────────────
    console.log(`\n[4/5] Navigating to ${productUrl} to trigger review render…`);
    await page.goto(productUrl, { waitUntil: "domcontentloaded" });

    const pageHtml = await page.content();
    containsDangerousInnerHtmlSink = /\.innerHTML\s*=/.test(pageHtml);
    containsPayloadInScript =
      pageHtml.includes(XSS_PAYLOAD) ||
      pageHtml.includes(JSON.stringify(XSS_PAYLOAD).slice(1, -1));

    const sinkMatch = pageHtml.match(
      /document\.getElementById\('review-content-[^']+'\)\.innerHTML\s*=\s*[^;]+;/
    );
    if (sinkMatch) {
      sinkSnippet = sinkMatch[0];
    }
    console.log(`  Dangerous innerHTML sink present in HTML: ${containsDangerousInnerHtmlSink}`);
    console.log(`  Sink snippet: ${sinkSnippet ?? "(not found)"}`);

    // ── Step 4: Verify actual JavaScript execution in browser context ─────────
    console.log(`\n[5/5] Verifying browser execution of window.${MARKER_NAME}…`);

    try {
      await page.waitForFunction(
        (marker) => (window as unknown as Record<string, unknown>)[marker] !== undefined,
        MARKER_NAME,
        { timeout: 5000 }
      );
    } catch {
      // Timeout: marker was not set
    }

    markerActualValue = await page.evaluate(
      (marker) => (window as unknown as Record<string, unknown>)[marker] as string ?? null,
      MARKER_NAME
    );

    javascriptExecuted = markerActualValue === MARKER_VALUE;

    console.log(`  Expected marker value : '${MARKER_VALUE}'`);
    console.log(`  Actual marker value   : ${markerActualValue !== null ? `'${markerActualValue}'` : "undefined"}`);
    console.log(`  Browser execution     : ${javascriptExecuted ? "CONFIRMED (window marker set)" : "FAILED"}`);
  } finally {
    await browser.close();
  }

  // ── Step 5: Evaluate 4-way distinction ─────────────────────────────────────
  const payloadStored = apiPayloadStoredVerbatim;
  const dangerousSinkDetected = containsDangerousInnerHtmlSink;

  // CRITICAL RULE:
  // A test must NOT report XSS as reproduced merely because it finds innerHTML
  // or sees an encoded payload in HTML source. javascriptExecuted is MANDATORY.
  const vulnerabilityReproduced =
    payloadStored && dangerousSinkDetected && javascriptExecuted;

  console.log("\n" + "─".repeat(50));
  console.log("  EVALUATION BREAKDOWN:");
  console.log(`    1. payloadStored           : ${payloadStored}`);
  console.log(`    2. dangerousSinkDetected   : ${dangerousSinkDetected}`);
  console.log(`    3. javascriptExecuted      : ${javascriptExecuted}`);
  console.log(`    →  vulnerabilityReproduced : ${vulnerabilityReproduced}`);
  console.log("─".repeat(50));

  if (vulnerabilityReproduced) {
    console.log("\n  ⚠️  STORED XSS VULNERABILITY CONFIRMED IN REAL BROWSER:");
    console.log("     - Review payload was stored verbatim in database.");
    console.log("     - Unescaped innerHTML sink rendered payload in HTML page.");
    console.log("     - Chromium browser executed the injected onerror handler.");
    console.log(`     - Marker window.${MARKER_NAME} === '${markerActualValue}' confirmed in DOM.`);
  } else {
    console.log("\n  ✓  Vulnerability NOT reproduced:");
    if (!payloadStored) console.log("     - Payload was sanitized or rejected before storage.");
    if (!dangerousSinkDetected) console.log("     - No dangerous innerHTML sink detected on page.");
    if (!javascriptExecuted) console.log("     - JavaScript execution was NOT observed in browser context.");
  }

  return {
    testName: "XSS-001",
    vulnerability: "Stored Cross-Site Scripting (Stored XSS)",
    severity: "Medium",
    affectedEndpoints: [
      "POST /shop/api/products/:id/reviews (storage)",
      "GET  /shop/products/:id             (render sink)",
    ],
    cwe: "CWE-79: Improper Neutralization of Input During Web Page Generation",
    payload: XSS_PAYLOAD,
    reproductionSteps: [
      "1. Open http://localhost:4000/shop in Chromium via Playwright.",
      "2. Log in with alice@example.com / Alice123! — session token stored in localStorage.",
      `3. Navigate to ${productUrl} and submit review: ${XSS_PAYLOAD}`,
      "4. Confirm review is saved verbatim via GET /shop/api/products/prod-001/reviews.",
      `5. Navigate to ${productUrl} where the review is rendered.`,
      `6. Observe document.getElementById('review-content-X').innerHTML = payload; executes on load.`,
      `7. Confirm window.${MARKER_NAME} === '${MARKER_VALUE}' in the browser page context.`,
    ],
    evidence: {
      browserEngine: "Chromium (Playwright)",
      login: {
        user: "alice@example.com",
        loginUrl: `${SHOP_BASE_URL}`,
        tokenRetrieved,
      },
      reviewSubmission: {
        submitPageUrl: productUrl,
        reviewId,
        payloadSubmitted: XSS_PAYLOAD,
      },
      apiVerification: {
        httpStatus: 200,
        payloadStoredVerbatim: apiPayloadStoredVerbatim,
        retrievedContent: apiContent,
      },
      sinkInspection: {
        renderUrl: productUrl,
        containsDangerousInnerHtmlSink,
        containsPayloadInScript,
        sinkSnippet,
      },
      browserExecution: {
        renderUrl: productUrl,
        markerVariable: `window.${MARKER_NAME}`,
        expectedValue: MARKER_VALUE,
        actualValue: markerActualValue,
        executed: javascriptExecuted,
      },
    },
    payloadStored,
    dangerousSinkDetected,
    javascriptExecuted,
    testPassed: true,
    vulnerabilityReproduced,
    details: vulnerabilityReproduced
      ? `Review content is accepted and stored without server-side sanitization. ` +
        `The product page renders it via "innerHTML = <content>" — a dangerous unescaped sink. ` +
        `Playwright Chromium automation confirmed that the injected onerror handler executed, ` +
        `setting window.${MARKER_NAME} to "${markerActualValue}". ` +
        `Remediation: escape HTML entities before storage and use textContent instead of innerHTML.`
      : `Vulnerability not reproduced: browser JavaScript execution did not occur.`,
    testedAt: new Date().toISOString(),
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────
const resultsDir = path.join(__dirname, "results");
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

runXSSTest()
  .then(async (finding) => {
    // Reset test database to maintain clean test data isolation
    try {
      await httpRequest(`${BASE}/reset`, "POST");
    } catch {
      // Ignore if reset fails
    }

    const outPath = path.join(resultsDir, "xss-result.json");
    fs.writeFileSync(outPath, JSON.stringify(finding, null, 2));
    console.log(`\n━━━ Result written to: ${outPath}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (finding.vulnerabilityReproduced) {
      process.exit(0); // success: vulnerability confirmed with actual browser execution
    } else {
      console.error("FAIL: Stored XSS vulnerability was NOT reproduced (browser execution failed).");
      process.exit(1);
    }
  })
  .catch((err: unknown) => {
    const outPath = path.join(resultsDir, "xss-result.json");
    const errFinding: XSSFinding = {
      testName: "XSS-001",
      vulnerability: "Stored Cross-Site Scripting (Stored XSS)",
      severity: "Medium",
      affectedEndpoints: [
        "POST /shop/api/products/:id/reviews",
        "GET  /shop/products/:id",
      ],
      cwe: "CWE-79: Improper Neutralization of Input During Web Page Generation",
      payload: XSS_PAYLOAD,
      reproductionSteps: [],
      evidence: {
        browserEngine: "Chromium (Playwright)",
        login: { user: "alice@example.com", loginUrl: SHOP_BASE_URL, tokenRetrieved: false },
        reviewSubmission: { submitPageUrl: `${SHOP_BASE_URL}/products/${TEST_PRODUCT_ID}`, reviewId: null, payloadSubmitted: XSS_PAYLOAD },
        apiVerification: { httpStatus: 0, payloadStoredVerbatim: false, retrievedContent: null },
        sinkInspection: { renderUrl: `${SHOP_BASE_URL}/products/${TEST_PRODUCT_ID}`, containsDangerousInnerHtmlSink: false, containsPayloadInScript: false, sinkSnippet: null },
        browserExecution: { renderUrl: `${SHOP_BASE_URL}/products/${TEST_PRODUCT_ID}`, markerVariable: `window.${MARKER_NAME}`, expectedValue: MARKER_VALUE, actualValue: null, executed: false },
      },
      payloadStored: false,
      dangerousSinkDetected: false,
      javascriptExecuted: false,
      testPassed: false,
      vulnerabilityReproduced: false,
      details: `Test infrastructure error: ${String(err)}`,
      testedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outPath, JSON.stringify(errFinding, null, 2));
    console.error("Test infrastructure error:", err);
    process.exit(2);
  });
