/**
 * tests/lib/http-client.ts
 * Shared minimal HTTP client used by all security tests.
 * Uses only Node.js built-ins — no extra dependencies required.
 */

import http from "node:http";

export interface HttpResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;         // parsed JSON, or raw string if parsing fails
  bodyRaw: string;       // always the raw response text
}

export function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body !== undefined ? JSON.stringify(body) : undefined;

    const reqHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    };
    if (payload) {
      reqHeaders["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port || 80),
        path: parsed.pathname + parsed.search,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          let parsed: unknown;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: parsed,
            bodyRaw: raw,
          });
        });
      }
    );

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export const BASE = "http://localhost:4000/shop/api";

/** Login helper: returns Bearer token or throws */
export async function loginAs(
  email: string,
  password: string
): Promise<{ token: string; userId: string; name: string }> {
  const result = await httpRequest(`${BASE}/auth/login`, "POST", {}, { email, password });
  if (result.status !== 200) {
    throw new Error(
      `Login failed for ${email}: HTTP ${result.status} — ${JSON.stringify(result.body)}`
    );
  }
  const data = result.body as { token: string; user: { id: string; name: string } };
  return { token: data.token, userId: data.user.id, name: data.user.name };
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
