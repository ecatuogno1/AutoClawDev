import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { NextFunction, Request, Response } from "express";
import { getSessionSecretPath } from "./paths.js";

export const SESSION_COOKIE_NAME = "autoclawdev_session";

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const segment of (header ?? "").split(";")) {
    const [rawKey, ...rest] = segment.trim().split("=");
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

export function getSessionSecret(): string {
  const secretPath = getSessionSecretPath();
  if (existsSync(secretPath)) {
    return readFileSync(secretPath, "utf-8").trim();
  }

  mkdirSync(dirname(secretPath), { recursive: true });
  const secret = randomBytes(24).toString("hex");
  writeFileSync(secretPath, `${secret}\n`, "utf-8");
  return secret;
}

function requestToken(req: Request): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] ?? req.header("x-autoclaw-token") ?? undefined;
}

function messageToken(message: Pick<IncomingMessage, "headers">): string | undefined {
  const cookies = parseCookies(message.headers.cookie);
  const headerValue = message.headers["x-autoclaw-token"];
  return cookies[SESSION_COOKIE_NAME] ?? (typeof headerValue === "string" ? headerValue : undefined);
}

function ensureSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
  });
}

export function sessionAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const secret = getSessionSecret();
  const token = requestToken(req);

  if (token !== secret) {
    ensureSessionCookie(res, secret);
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    if (token !== secret) {
      res.status(401).json({
        error: "Missing or invalid local session token",
      });
      return;
    }
  }

  next();
}

export function requestHasValidSession(
  req: Pick<IncomingMessage, "headers">,
): boolean {
  return messageToken(req) === getSessionSecret();
}
