/**
 * shop/middleware.ts
 * Authentication middleware for the demo shop.
 * ⚠️  FOR LOCAL SECURITY TRAINING ONLY.
 */

import { Request, Response, NextFunction } from "express";
import { findSession, findUserById } from "./db.js";

export interface AuthRequest extends Request {
  userId?: string;
  userName?: string;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.headers["x-session-token"] as string | undefined) ?? "";

  const session = findSession(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized – please log in first." });
    return;
  }

  const user = findUserById(session.userId);
  if (!user) {
    res.status(401).json({ error: "Session user not found." });
    return;
  }

  req.userId = user.id;
  req.userName = user.name;
  next();
}
