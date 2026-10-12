/** Enforces browser-side Embed URL and origin policy. */

import type { LodeonConfig } from "../../configuration/schema";

export type EmbedValidation =
  | { status: "empty" }
  | { status: "invalid"; code: string; variables?: Record<string, string> }
  | {
      status: "blocked";
      code: string;
      variables?: Record<string, string>;
      origin: string;
    }
  | { status: "allowed"; url: string; origin: string };

export function validateEmbedUrl(url: string, allowedOrigins: string[]): EmbedValidation {
  if (!url.trim()) {
    return { status: "empty" };
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return {
      status: "invalid",
      code: "embed.url_invalid",
      variables: { reason: "invalid_absolute_url" }
    };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      status: "invalid",
      code: "embed.url_invalid",
      variables: { reason: "http_https_required" }
    };
  }

  const allowed = allowedOrigins.map((origin) => normalizeEmbedOrigin(origin)).filter(Boolean);
  const origin = parsed.origin;

  if (!allowed.includes(origin)) {
    return {
      status: "blocked",
      origin,
      code: "embed.origin_blocked",
      variables: { origin }
    };
  }

  return { status: "allowed", url: parsed.toString(), origin };
}

export function normalizeEmbedOrigin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return "";
  }
}

export function sanitizeEmbedTokenList(tokens: unknown): string[] {
  if (!Array.isArray(tokens)) {
    return [];
  }

  return tokens
    .filter((token): token is string => typeof token === "string")
    .map((token) => token.trim())
    .filter((token) => /^[a-zA-Z0-9_-]+$/.test(token));
}

export function defaultEmbedOptions(): LodeonConfig["nodes"]["embed"] {
  return {
    enabled: false,
    defaultResultPageSize: 10,
    allowedOrigins: [],
    sandbox: [],
    allow: [],
    referrerPolicy: "",
    defaultAspectRatio: "custom",
    metadata: { timeoutSeconds: 10, maxResponseBytes: 1_000_000 }
  };
}
