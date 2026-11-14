/**
 * shop/routes.ts
 * All route handlers for the intentionally vulnerable demo shop.
 *
 * ⚠️  DELIBERATELY VULNERABLE — LOCAL TRAINING USE ONLY.
 *
 * Vulnerabilities implemented:
 *  1. IDOR/BOLA  – GET /shop/api/orders/:id returns any order to any
 *                  authenticated user (no ownership check).
 *  2. Stored XSS – POST /shop/api/products/:id/reviews stores review content
 *                  verbatim and the HTML template renders it unescaped.
 *  3. Price Manipulation – POST /shop/api/checkout trusts the client-supplied
 *                  `price` field instead of looking it up server-side.
 */

import { Router, Response } from "express";
import {
  findUserByEmail,
  createSession,
  deleteSession,
  products,
  getOrdersByUser,
  getOrderById,
  getReviewsByProduct,
  addReview,
  createOrder,
  resetDatabase,
} from "./db.js";
import { requireAuth, AuthRequest } from "./middleware.js";

export const shopRouter = Router();

/** POST /shop/api/reset - Resets in-memory demo data for test isolation (local training only) */
shopRouter.post("/api/reset", (req, res) => {
  // Security guard: Ensure reset is strictly restricted to local non-production environments
  if (process.env.NODE_ENV === "production") {
    res.status(403).json({ error: "Reset endpoint is disabled in production environments." });
    return;
  }
  const host = req.hostname || "";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal) {
    res.status(403).json({ error: "Reset endpoint is restricted to localhost callers only." });
    return;
  }
  resetDatabase();
  res.json({ message: "Demo database reset to initial seeded state." });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** POST /shop/api/auth/login */
shopRouter.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required." });
    return;
  }

  const user = findUserByEmail(email.toLowerCase().trim());
  if (!user || user.password !== password) {
    res.status(401).json({ error: "Invalid credentials." });
    return;
  }

  const token = createSession(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

/** POST /shop/api/auth/logout */
shopRouter.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token) deleteSession(token);
  res.json({ message: "Logged out." });
});

/** GET /shop/api/auth/me */
shopRouter.get("/api/auth/me", requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ id: req.userId, name: req.userName });
});

// ─── Products ─────────────────────────────────────────────────────────────────

/** GET /shop/api/products */
shopRouter.get("/api/products", (_req, res) => {
  res.json(products);
});

/** GET /shop/api/products/:id */
shopRouter.get("/api/products/:id", (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.json(product);
});

// ─── Reviews ──────────────────────────────────────────────────────────────────

/** GET /shop/api/products/:id/reviews */
shopRouter.get("/api/products/:id/reviews", (req, res) => {
  res.json(getReviewsByProduct(req.params.id));
});

/**
 * POST /shop/api/products/:id/reviews
 * ⚠️  VULNERABILITY – Stored XSS: `content` stored and later rendered raw.
 */
shopRouter.post(
  "/api/products/:id/reviews",
  requireAuth,
  (req: AuthRequest, res: Response) => {
    const { content, rating } = req.body as {
      content?: string;
      rating?: number;
    };

    if (!content || typeof content !== "string" || content.trim() === "") {
      res.status(400).json({ error: "Review content is required." });
      return;
    }

    const product = products.find((p) => p.id === req.params.id);
    if (!product) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const parsedRating = Number(rating);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      res.status(400).json({ error: "Rating must be between 1 and 5." });
      return;
    }

    // ⚠️  NO SANITIZATION – stored verbatim (Stored XSS vector)
    const review = addReview({
      productId: String(req.params.id),
      userId: req.userId!,
      authorName: req.userName!,
      content, // raw
      rating: parsedRating,
    });

    res.status(201).json(review);
  }
);

// ─── Orders ───────────────────────────────────────────────────────────────────

/** GET /shop/api/orders  – list the authenticated user's own orders */
shopRouter.get("/api/orders", requireAuth, (req: AuthRequest, res: Response) => {
  res.json(getOrdersByUser(req.userId!));
});

/**
 * GET /shop/api/orders/:id
 * ⚠️  VULNERABILITY – IDOR/BOLA: no ownership check; any authenticated user
 * can read any order by guessing/iterating the order ID.
 */
shopRouter.get(
  "/api/orders/:id",
  requireAuth,
  (req: AuthRequest, res: Response) => {
    const order = getOrderById(String(req.params.id));
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    // ⚠️  Missing ownership check: should be `if (order.userId !== req.userId)`
    res.json(order);
  }
);

// ─── Checkout ─────────────────────────────────────────────────────────────────

/**
 * POST /shop/api/checkout
 * ⚠️  VULNERABILITY – Price Manipulation: total is computed from client-supplied
 * `price` values instead of looking them up from the server-side product records.
 *
 * Secure implementation would be:
 *   const serverProduct = products.find(p => p.id === item.productId);
 *   total += serverProduct.price * item.quantity;
 */
shopRouter.post(
  "/api/checkout",
  requireAuth,
  (req: AuthRequest, res: Response) => {
    const { items } = req.body as {
      items?: {
        productId: string;
        quantity: number;
        price: number; // ⚠️  client-supplied – not validated against catalog
      }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "Cart is empty." });
      return;
    }

    let total = 0;
    const orderItems: {
      productId: string;
      quantity: number;
      priceAtPurchase: number;
    }[] = [];

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        res.status(400).json({ error: `Unknown product: ${item.productId}` });
        return;
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        res.status(400).json({ error: "Quantity must be a positive integer." });
        return;
      }

      // ⚠️  Uses client-supplied price, not product.price
      const clientPrice = Number(item.price);
      if (isNaN(clientPrice) || clientPrice < 0) {
        res.status(400).json({ error: "Invalid price supplied." });
        return;
      }

      total += clientPrice * qty;
      orderItems.push({
        productId: item.productId,
        quantity: qty,
        priceAtPurchase: clientPrice,
      });
    }

    const order = createOrder(req.userId!, orderItems, total);

    res.status(201).json({
      message: "Order placed successfully.",
      order,
      warning:
        "[VULN] Price was accepted from client payload — no server-side validation.",
    });
  }
);

// ─── HTML UI ──────────────────────────────────────────────────────────────────

/**
 * Minimal HTML shop UI served at /shop
 * The shop renders review content WITHOUT escaping (Stored XSS demo).
 */
shopRouter.get("/", (_req, res) => {
  res.send(shopIndexHtml());
});

shopRouter.get("/products", (_req, res) => {
  res.send(productsPageHtml());
});

shopRouter.get("/products/:id", (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {
    res.status(404).send("<h1>Product not found</h1>");
    return;
  }
  const productReviews = getReviewsByProduct(req.params.id);
  res.send(productPageHtml(product, productReviews));
});

shopRouter.get("/checkout", (_req, res) => {
  res.send(checkoutPageHtml());
});

shopRouter.get("/orders", (_req, res) => {
  res.send(ordersPageHtml());
});

// ─── HTML Templates ───────────────────────────────────────────────────────────

function navHtml(): string {
  return `
    <nav style="background:#1a1a2e;padding:12px 24px;display:flex;gap:20px;align-items:center;color:white;font-family:sans-serif">
      <strong style="color:#e94560;font-size:18px">🛒 VulnShop</strong>
      <a href="/shop" style="color:#ccc;text-decoration:none">Home</a>
      <a href="/shop/products" style="color:#ccc;text-decoration:none">Products</a>
      <a href="/shop/orders" style="color:#ccc;text-decoration:none">My Orders</a>
      <a href="/shop/checkout" style="color:#ccc;text-decoration:none">Checkout</a>
      <span id="nav-user" style="margin-left:auto;color:#aaa;font-size:13px"></span>
      <button onclick="logout()" style="background:#e94560;border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer">Logout</button>
    </nav>
    <script>
      async function logout() {
        const token = localStorage.getItem('shopToken');
        await fetch('/shop/api/auth/logout', { method:'POST', headers:{ Authorization: 'Bearer '+token }});
        localStorage.removeItem('shopToken');
        localStorage.removeItem('shopUser');
        window.location.href='/shop';
      }
      (async () => {
        const token = localStorage.getItem('shopToken');
        if (token) {
          const r = await fetch('/shop/api/auth/me', { headers:{ Authorization: 'Bearer '+token }});
          if (r.ok) {
            const u = await r.json();
            document.getElementById('nav-user').textContent = '👤 ' + u.name;
          }
        }
      })();
    </script>`;
}

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — VulnShop</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#0f0f1a; color:#e0e0e0; }
    h1,h2,h3 { color:#e94560; }
    .container { max-width:900px; margin:30px auto; padding:0 20px; }
    input, textarea, select { background:#1e1e2e; border:1px solid #444; color:#e0e0e0; padding:8px 12px; border-radius:4px; width:100%; box-sizing:border-box; margin-bottom:10px; }
    button { background:#e94560; border:none; color:white; padding:10px 20px; border-radius:4px; cursor:pointer; font-size:14px; }
    button:hover { background:#c73652; }
    .card { background:#1a1a2e; border:1px solid #2a2a4a; border-radius:8px; padding:20px; margin-bottom:16px; }
    .badge { background:#e94560; color:white; font-size:11px; padding:2px 8px; border-radius:10px; }
    .vuln-banner { background:#2a1a0a; border:1px solid #c0392b; padding:10px 16px; border-radius:6px; margin-bottom:20px; color:#e67e22; font-size:13px; }
    .success { color:#2ecc71; }
    .error { color:#e94560; }
    pre { background:#0a0a1a; padding:12px; border-radius:4px; overflow-x:auto; color:#7fdbca; font-size:12px; }
  </style>
</head>
<body>
${navHtml()}
<div class="container">
${body}
</div>
</body>
</html>`;
}

function shopIndexHtml(): string {
  return baseHtml(
    "VulnShop",
    `<div style="text-align:center;margin-top:60px">
      <h1>🛒 VulnShop</h1>
      <p style="color:#aaa;max-width:500px;margin:0 auto 30px">
        Intentionally vulnerable demo shop for local security training.<br>
        <span style="color:#e94560">⚠️ Do not deploy to production.</span>
      </p>
      <div class="vuln-banner">
        ⚠️ <strong>Training Environment</strong> — This app contains deliberate vulnerabilities:<br>
        IDOR/BOLA &bull; Stored XSS &bull; Price Manipulation
      </div>
      <div id="login-section" class="card" style="max-width:400px;margin:0 auto">
        <h2 style="margin-top:0">Login</h2>
        <input id="email" type="email" placeholder="Email" value="alice@example.com">
        <input id="password" type="password" placeholder="Password" value="Alice123!">
        <button onclick="login()">Login</button>
        <p id="login-msg" style="margin-top:10px"></p>
        <hr style="border-color:#333">
        <p style="font-size:12px;color:#888">
          Demo credentials:<br>
          alice@example.com / Alice123!<br>
          bob@example.com / Bob123!
        </p>
      </div>
      <div id="logged-section" style="display:none;margin-top:20px">
        <p class="success">✓ Logged in! <a href="/shop/products" style="color:#e94560">Browse Products →</a></p>
      </div>
    </div>
    <script>
      async function login() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const r = await fetch('/shop/api/auth/login', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email, password })
        });
        const data = await r.json();
        if (r.ok) {
          localStorage.setItem('shopToken', data.token);
          localStorage.setItem('shopUser', JSON.stringify(data.user));
          document.getElementById('login-msg').textContent = '✓ Logged in as ' + data.user.name;
          document.getElementById('login-msg').className = 'success';
        } else {
          document.getElementById('login-msg').textContent = data.error;
          document.getElementById('login-msg').className = 'error';
        }
      }
      const token = localStorage.getItem('shopToken');
      if (token) {
        document.getElementById('logged-section').style.display = 'block';
      }
    </script>`
  );
}

function productsPageHtml(): string {
  const cards = products
    .map(
      (p) => `
    <div class="card">
      <span style="font-size:40px">${p.imageEmoji}</span>
      <h3>${p.name}</h3>
      <p style="color:#aaa">${p.description}</p>
      <p><strong>$${(p.price / 100).toFixed(2)}</strong></p>
      <a href="/shop/products/${p.id}">
        <button>View & Review</button>
      </a>
      <button onclick="addToCart('${p.id}','${p.name}',${p.price})" style="margin-left:8px;background:#2a5a3a">
        🛒 Add to Cart
      </button>
    </div>`
    )
    .join("");

  return baseHtml(
    "Products",
    `<h1>Products</h1>
    ${cards}
    <script>
      function addToCart(productId, name, price) {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existing = cart.find(i => i.productId === productId);
        if (existing) { existing.quantity++; }
        else { cart.push({ productId, name, price, quantity: 1 }); }
        localStorage.setItem('cart', JSON.stringify(cart));
        alert(name + ' added to cart!');
      }
    </script>`
  );
}

function productPageHtml(
  product: { id: string; name: string; description: string; price: number; imageEmoji: string },
  productReviews: { id: string; authorName: string; content: string; rating: number; createdAt: string }[]
): string {
  // ⚠️  VULNERABILITY: review content is injected into innerHTML without escaping
  const reviewsHtml = productReviews.length
    ? productReviews
        .map(
          (r) => `
        <div class="card">
          <strong>${r.authorName}</strong>
          <span style="color:#f39c12"> ${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
          <span style="color:#888;font-size:12px"> ${new Date(r.createdAt).toLocaleDateString()}</span>
          <p id="review-content-${r.id}"></p>
        </div>`
        )
        .join("")
    : "<p style='color:#888'>No reviews yet.</p>";

  // The script sets innerHTML (not textContent) to simulate an XSS sink
  const reviewScripts = productReviews
    .map(
      (r) =>
        `document.getElementById('review-content-${r.id}').innerHTML = ${JSON.stringify(r.content)};`
    )
    .join("\n");

  return baseHtml(
    product.name,
    `<div class="vuln-banner">⚠️ Review content rendered without escaping (Stored XSS demo)</div>
    <div class="card">
      <span style="font-size:50px">${product.imageEmoji}</span>
      <h2>${product.name}</h2>
      <p style="color:#aaa">${product.description}</p>
      <p><strong>Price: $${(product.price / 100).toFixed(2)}</strong></p>
      <button onclick="addToCart('${product.id}','${product.name}',${product.price})">
        🛒 Add to Cart
      </button>
    </div>

    <h2>Reviews</h2>
    ${reviewsHtml}

    <h2>Write a Review</h2>
    <div class="card">
      <textarea id="review-content" rows="4" placeholder="Your review (HTML allowed for demo — XSS sink)"></textarea>
      <select id="review-rating">
        <option value="5">★★★★★ (5)</option>
        <option value="4">★★★★☆ (4)</option>
        <option value="3">★★★☆☆ (3)</option>
        <option value="2">★★☆☆☆ (2)</option>
        <option value="1">★☆☆☆☆ (1)</option>
      </select>
      <button onclick="submitReview('${product.id}')">Submit Review</button>
      <p id="review-msg"></p>
    </div>

    <script>
      ${reviewScripts}

      function addToCart(productId, name, price) {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existing = cart.find(i => i.productId === productId);
        if (existing) { existing.quantity++; }
        else { cart.push({ productId, name, price, quantity: 1 }); }
        localStorage.setItem('cart', JSON.stringify(cart));
        alert(name + ' added to cart!');
      }

      async function submitReview(productId) {
        const token = localStorage.getItem('shopToken');
        if (!token) { alert('Please log in first.'); return; }
        const content = document.getElementById('review-content').value;
        const rating = document.getElementById('review-rating').value;
        const r = await fetch('/shop/api/products/' + productId + '/reviews', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
          body: JSON.stringify({ content, rating: Number(rating) })
        });
        const data = await r.json();
        if (r.ok) {
          document.getElementById('review-msg').className = 'success';
          document.getElementById('review-msg').textContent = '✓ Review submitted! Reload to see it.';
        } else {
          document.getElementById('review-msg').className = 'error';
          document.getElementById('review-msg').textContent = data.error;
        }
      }
    </script>`
  );
}

function ordersPageHtml(): string {
  return baseHtml(
    "My Orders",
    `<div class="vuln-banner">⚠️ IDOR demo: change the order ID in the URL to access other users' orders via the API</div>
    <h1>My Orders</h1>
    <div id="orders-list"><p style="color:#888">Loading…</p></div>
    <h2>Lookup Any Order by ID (IDOR Demo)</h2>
    <div class="card">
      <p style="color:#aaa;font-size:13px">Enter any order ID to demonstrate IDOR vulnerability:</p>
      <input id="order-id-input" type="text" placeholder="e.g. order-bob-001">
      <button onclick="lookupOrder()">Fetch Order</button>
      <pre id="order-result" style="display:none"></pre>
    </div>
    <script>
      async function loadMyOrders() {
        const token = localStorage.getItem('shopToken');
        if (!token) { document.getElementById('orders-list').innerHTML = '<p>Please <a href="/shop" style="color:#e94560">log in</a> first.</p>'; return; }
        const r = await fetch('/shop/api/orders', { headers:{ Authorization:'Bearer '+token }});
        if (!r.ok) { document.getElementById('orders-list').innerHTML = '<p class="error">Failed to load orders.</p>'; return; }
        const orders = await r.json();
        if (!orders.length) { document.getElementById('orders-list').innerHTML = '<p style="color:#888">No orders yet.</p>'; return; }
        document.getElementById('orders-list').innerHTML = orders.map(o =>
          '<div class="card"><strong>Order: ' + o.id + '</strong><br>' +
          'Total: $' + (o.total/100).toFixed(2) + '<br>' +
          'Date: ' + new Date(o.createdAt).toLocaleDateString() + '</div>'
        ).join('');
      }
      async function lookupOrder() {
        const token = localStorage.getItem('shopToken');
        if (!token) { alert('Please log in first.'); return; }
        const id = document.getElementById('order-id-input').value.trim();
        const r = await fetch('/shop/api/orders/' + id, { headers:{ Authorization:'Bearer '+token }});
        const data = await r.json();
        const pre = document.getElementById('order-result');
        pre.style.display = 'block';
        pre.textContent = 'HTTP ' + r.status + '\\n' + JSON.stringify(data, null, 2);
      }
      loadMyOrders();
    </script>`
  );
}

function checkoutPageHtml(): string {
  return baseHtml(
    "Checkout",
    `<div class="vuln-banner">⚠️ Price Manipulation demo: the client controls the price sent to the server</div>
    <h1>Checkout</h1>
    <div id="cart-view"><p style="color:#888">Loading cart…</p></div>
    <div id="checkout-result"></div>
    <script>
      function renderCart() {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const div = document.getElementById('cart-view');
        if (!cart.length) { div.innerHTML = '<p>Cart is empty. <a href="/shop/products" style="color:#e94560">Browse products →</a></p>'; return; }
        let total = 0;
        const rows = cart.map((item, idx) => {
          total += item.price * item.quantity;
          return '<div class="card" style="display:flex;justify-content:space-between;align-items:center">' +
            '<span>' + item.name + ' × ' + item.quantity + '</span>' +
            '<span>Client price: <input type="number" id="price-' + idx + '" value="' + item.price + '" style="width:80px;display:inline"> cents</span>' +
            '</div>';
        });
        div.innerHTML = rows.join('') +
          '<p><strong>Cart Total: $' + (total/100).toFixed(2) + '</strong></p>' +
          '<p style="color:#aaa;font-size:12px">⚠️ Modify the price fields above — the server will accept them (Price Manipulation vulnerability).</p>' +
          '<button onclick="placeOrder()">Place Order</button>';
      }
      async function placeOrder() {
        const token = localStorage.getItem('shopToken');
        if (!token) { alert('Please log in first.'); return; }
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const items = cart.map((item, idx) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: Number(document.getElementById('price-' + idx).value)
        }));
        const r = await fetch('/shop/api/checkout', {
          method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
          body: JSON.stringify({ items })
        });
        const data = await r.json();
        const resDiv = document.getElementById('checkout-result');
        if (r.ok) {
          localStorage.removeItem('cart');
          resDiv.innerHTML = '<div class="card"><p class="success">✓ Order placed!</p><pre>' + JSON.stringify(data, null, 2) + '</pre></div>';
        } else {
          resDiv.innerHTML = '<p class="error">' + data.error + '</p>';
        }
      }
      renderCart();
    </script>`
  );
}
