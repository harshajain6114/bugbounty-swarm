# VulnShop — Intentionally Vulnerable Demo Shop

> ⚠️ **FOR LOCAL SECURITY TRAINING ONLY**
> This application contains deliberate security vulnerabilities. **Never deploy it to a public network or production environment.**

VulnShop is the controlled security-testing target used by the **BugBounty Swarm** autonomous multi-agent platform. All testing is restricted to `localhost`.

---

## Quick Start

### 1. Start the demo shop server

From `apps/server`:

```bash
npm run demo:shop
```

The server starts on **http://localhost:4000**

| URL | Description |
|-----|-------------|
| http://localhost:4000/shop | Shop UI (HTML) |
| http://localhost:4000/shop/products | Products list |
| http://localhost:4000/shop/orders | My Orders (IDOR demo) |
| http://localhost:4000/shop/checkout | Checkout (Price Manipulation demo) |
| http://localhost:4000/shop/api | REST API base |
| http://localhost:4000/health | Existing API health check |

---

## Demo Credentials

| User  | Email               | Password  |
|-------|---------------------|-----------|
| Alice | alice@example.com   | Alice123! |
| Bob   | bob@example.com     | Bob123!   |

---

## Running the IDOR Security Test

The server **must be running** first (see Quick Start above), then in a second terminal:

```bash
npm run test:idor
```

This will:
1. Log in as Alice
2. Confirm Alice can read her own order
3. Attempt to read Bob's order using Alice's session token
4. Write a structured JSON finding to `tests/results/idor-result.json`
5. Exit with code **1** if the vulnerability is confirmed (expected in training env)

---

## Deliberate Vulnerabilities

### 1. IDOR / BOLA — Broken Object Level Authorization
- **Endpoint:** `GET /shop/api/orders/:id`
- **Severity:** High (CWE-284)
- **Description:** The endpoint returns any order by ID to any authenticated user. No ownership check is performed.
- **Reproduce:**
  ```bash
  # Log in as Alice, get token
  TOKEN=$(curl -s -XPOST http://localhost:4000/shop/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"alice@example.com","password":"Alice123!"}' | jq -r .token)

  # Alice accesses Bob's order — returns 200 ⚠️
  curl -H "Authorization: Bearer $TOKEN" \
    http://localhost:4000/shop/api/orders/order-bob-001
  ```
- **Fix:** Add `if (order.userId !== req.userId) return res.status(403).json(...)` before returning.

---

### 2. Stored XSS — Unescaped Review Content
- **Endpoint:** `POST /shop/api/products/:id/reviews` → rendered at `GET /shop/products/:id`
- **Severity:** Medium (CWE-79)
- **Description:** Review `content` is stored verbatim and injected into `innerHTML` without sanitization.
- **Reproduce (browser):**
  1. Log in at http://localhost:4000/shop
  2. Navigate to any product page
  3. Submit a review with content: `<img src=x onerror="alert('XSS')">`
  4. Reload the product page — the script executes
- **Fix:** Escape HTML before storage (`&lt;`, `&gt;`, etc.) and use `textContent` instead of `innerHTML`.

---

### 3. Price Manipulation — Client-Supplied Price at Checkout
- **Endpoint:** `POST /shop/api/checkout`
- **Severity:** High (CWE-20)
- **Description:** The checkout endpoint trusts the `price` field sent in the request body rather than fetching the canonical price from server-side product records.
- **Reproduce:**
  ```bash
  TOKEN=<your-alice-token>
  curl -XPOST http://localhost:4000/shop/api/checkout \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"items":[{"productId":"prod-001","quantity":1,"price":1}]}'
  # Order is created for $0.01 instead of $79.99 ⚠️
  ```
- **Fix:** Ignore client-supplied price; look up `product.price` server-side.

---

## API Reference

```
POST   /shop/api/auth/login               – Login (returns Bearer token)
POST   /shop/api/auth/logout              – Logout
GET    /shop/api/auth/me                  – Current user (requires auth)

GET    /shop/api/products                 – List all products
GET    /shop/api/products/:id             – Single product
GET    /shop/api/products/:id/reviews     – Product reviews
POST   /shop/api/products/:id/reviews     – Submit review (auth) ⚠️ XSS

GET    /shop/api/orders                   – My orders (auth)
GET    /shop/api/orders/:id               – Single order (auth) ⚠️ IDOR

POST   /shop/api/checkout                 – Place order (auth) ⚠️ Price Manip
```

---

## In-Memory Data

The shop uses a **volatile in-memory database** seeded at startup. All data resets when the server restarts. No external database is required.

Seeded data:
- 2 users (Alice, Bob)
- 4 products
- 1 order per user (IDs: `order-alice-001`, `order-bob-001`)

---

## npm Scripts (from `apps/server`)

| Script | Description |
|--------|-------------|
| `npm run demo:shop` | Start the demo shop + main API server |
| `npm run test:idor` | Run the IDOR Playwright/HTTP security test |
| `npm run dev` | Dev mode with hot reload |
| `npm run typecheck` | TypeScript type check |

---

## Safety Notice

- All testing targets **only** `localhost:4000`
- No external domains or real websites are ever contacted
- Vulnerabilities exist **only** in `apps/server/src/shop/` files
- The existing BugBounty Swarm API (`/health` etc.) is unaffected
