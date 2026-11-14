/**
 * shop/db.ts
 * In-memory database for the intentionally vulnerable demo shop.
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY — do not deploy to production.
 */

export interface User {
  id: string;
  email: string;
  password: string; // plain-text intentionally (training env)
  name: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number; // in cents
  imageEmoji: string;
}

export interface Order {
  id: string;
  userId: string;
  items: { productId: string; quantity: number; priceAtPurchase: number }[];
  total: number;
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  // ⚠️  VULNERABILITY: content is stored & rendered without escaping (Stored XSS)
  content: string;
  rating: number;
  createdAt: string;
}

export interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

export const users: User[] = [
  {
    id: "user-alice",
    email: "alice@example.com",
    password: "Alice123!",
    name: "Alice",
  },
  {
    id: "user-bob",
    email: "bob@example.com",
    password: "Bob123!",
    name: "Bob",
  },
];

export const products: Product[] = [
  {
    id: "prod-001",
    name: "Wireless Headphones",
    description: "Premium over-ear headphones with active noise cancellation.",
    price: 7999, // $79.99
    imageEmoji: "🎧",
  },
  {
    id: "prod-002",
    name: "Mechanical Keyboard",
    description: "Compact TKL layout with tactile blue switches.",
    price: 11999, // $119.99
    imageEmoji: "⌨️",
  },
  {
    id: "prod-003",
    name: "USB-C Hub",
    description: "7-in-1 hub: HDMI, USB-A ×3, SD, MicroSD, PD.",
    price: 3499, // $34.99
    imageEmoji: "🔌",
  },
  {
    id: "prod-004",
    name: "Webcam 1080p",
    description: "Full HD webcam with built-in microphone.",
    price: 5999, // $59.99
    imageEmoji: "📷",
  },
];

// Orders seeded so each user already has one order
export const orders: Order[] = [
  {
    id: "order-alice-001",
    userId: "user-alice",
    items: [{ productId: "prod-001", quantity: 1, priceAtPurchase: 7999 }],
    total: 7999,
    createdAt: "2026-11-01T10:00:00Z",
  },
  {
    id: "order-bob-001",
    userId: "user-bob",
    items: [{ productId: "prod-002", quantity: 1, priceAtPurchase: 11999 }],
    total: 11999,
    createdAt: "2026-11-02T12:30:00Z",
  },
];

export const reviews: Review[] = [];
export const sessions: Session[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function findUserByEmail(email: string): User | undefined {
  return users.find((u) => u.email === email);
}

export function findUserById(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

export function findSession(token: string): Session | undefined {
  return sessions.find(
    (s) => s.token === token && s.expiresAt > Date.now()
  );
}

export function createSession(userId: string): string {
  const token = `tok-${userId}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  sessions.push({ token, userId, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return token;
}

export function deleteSession(token: string): void {
  const idx = sessions.findIndex((s) => s.token === token);
  if (idx !== -1) sessions.splice(idx, 1);
}

export function getOrdersByUser(userId: string): Order[] {
  return orders.filter((o) => o.userId === userId);
}

// ⚠️  VULNERABILITY (IDOR/BOLA): returns any order by id regardless of caller
export function getOrderById(id: string): Order | undefined {
  return orders.find((o) => o.id === id);
}

export function getReviewsByProduct(productId: string): Review[] {
  return reviews.filter((r) => r.productId === productId);
}

let reviewCounter = 1;
export function addReview(review: Omit<Review, "id" | "createdAt">): Review {
  const newReview: Review = {
    ...review,
    id: `review-${reviewCounter++}`,
    createdAt: new Date().toISOString(),
  };
  reviews.push(newReview);
  return newReview;
}

let orderCounter = 100;
export function createOrder(
  userId: string,
  items: { productId: string; quantity: number; priceAtPurchase: number }[],
  total: number
): Order {
  const order: Order = {
    id: `order-${userId.replace("user-", "")}-${orderCounter++}`,
    userId,
    items,
    total,
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  return order;
}

export function resetDatabase(): void {
  orders.length = 0;
  orders.push(
    {
      id: "order-alice-001",
      userId: "user-alice",
      items: [{ productId: "prod-001", quantity: 1, priceAtPurchase: 7999 }],
      total: 7999,
      createdAt: "2026-11-01T10:00:00Z",
    },
    {
      id: "order-bob-001",
      userId: "user-bob",
      items: [{ productId: "prod-002", quantity: 1, priceAtPurchase: 11999 }],
      total: 11999,
      createdAt: "2026-11-02T12:30:00Z",
    }
  );
  reviews.length = 0;
  sessions.length = 0;
  orderCounter = 100;
  reviewCounter = 1;
}
