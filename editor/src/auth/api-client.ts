/** Owns the typed auth transport boundary and its protocol normalization. */

import { z } from "zod";
import { LodeonClientError } from "../errors/client-error";
import { problemFromResponse } from "../errors/problem-details";

export type AuthStatus = {
  authEnabled: boolean;
  authenticated: boolean;
  loginMethod?: "token" | "oidc" | "oauth2";
  loginProvider?: string;
  methods: {
    token: boolean;
    externalProviders: Array<{
      id: string;
      label: string;
      icon: string;
      startUrl: string;
    }>;
  };
  capabilities: {
    publish: boolean;
  };
};

export type AuthSession = AuthStatus & {
  session?: string;
};

const authStatusSchema = z
  .object({
    authEnabled: z.boolean(),
    authenticated: z.boolean(),
    loginMethod: z.enum(["token", "oidc", "oauth2"]).optional(),
    loginProvider: z.string().min(1).optional(),
    methods: z
      .object({
        token: z.boolean(),
        externalProviders: z.array(
          z
            .object({
              id: z.string().min(1),
              label: z.string().min(1),
              icon: z.string().min(1),
              startUrl: z.string().min(1)
            })
            .strict()
        )
      })
      .strict(),
    capabilities: z.object({ publish: z.boolean() }).strict()
  })
  .strict();
const authSessionSchema = authStatusSchema.extend({ session: z.string().optional() }).strict();

const authSessionStorageKey = "lodeon.auth.session";
const authStatusUrl = "/api/auth/status";
const authLoginUrl = "/api/auth/login";
const authLogoutUrl = "/api/auth/logout";
const authExternalExchangeUrl = "/api/auth/external/exchange";

/**
 * Reconciles the browser-held bearer session with the authoritative API state.
 * Invalid server sessions are removed; storage access remains best effort.
 */
export async function loadAuthSession(fetcher: typeof fetch = fetch): Promise<AuthSession> {
  const session = readAuthSession();

  try {
    const response = await fetcher(authStatusUrl, {
      headers: authHeaders(session)
    });

    if (!response.ok) {
      clearAuthSession();
      return failClosedAuthStatus();
    }

    const status = authStatusSchema.parse(await response.json());

    if (status.authEnabled && !status.authenticated) {
      clearAuthSession();
      return status;
    }

    return { ...status, session: status.authenticated ? session : undefined };
  } catch {
    clearAuthSession();
    return failClosedAuthStatus();
  }
}

/** Deny protected capabilities when authoritative auth discovery is unavailable. */
function failClosedAuthStatus(): AuthStatus {
  return {
    authEnabled: true,
    authenticated: false,
    methods: { token: false, externalProviders: [] },
    capabilities: { publish: false }
  };
}

/**
 * Exchanges a validated login token for an API session and persists only the
 * returned opaque session value in browser session storage.
 */
export async function loginWithToken(token: string, fetcher: typeof fetch = fetch): Promise<AuthSession> {
  const response = await fetcher(authLoginUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token })
  });

  if (!response.ok) {
    throw await problemFromResponse(response, "auth.login_failed");
  }

  const payload = authSessionSchema.parse(await response.json());

  if (payload.session) {
    writeAuthSession(payload.session);
  }

  return payload;
}

/** Exchanges one callback code and persists only the returned LODEON session. */
export async function exchangeExternalAuthCode(
  code: string,
  fetcher: typeof fetch = fetch
): Promise<AuthSession> {
  const response = await fetcher(authExternalExchangeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ code })
  });

  if (!response.ok) {
    throw await problemFromResponse(response, "auth.external.exchange_invalid");
  }

  const payload = authSessionSchema.parse(await response.json());
  if (!payload.session) {
    throw new LodeonClientError("auth.external.exchange_invalid");
  }
  writeAuthSession(payload.session);
  return payload;
}

/**
 * Removes and consumes the external callback code before runtime configuration
 * is loaded, so personalized discovery uses the newly created session.
 */
export async function completeExternalAuthReturn(
  currentUrl: string,
  replaceUrl: (url: string) => void,
  fetcher: typeof fetch = fetch
): Promise<AuthSession | undefined> {
  const url = new URL(currentUrl);
  const codes = url.searchParams.getAll("authExchange");
  if (codes.length === 0) {
    return undefined;
  }

  url.searchParams.delete("authExchange");
  replaceUrl(`${url.pathname}${url.search}${url.hash}`);
  if (codes.length !== 1 || !codes[0]) {
    throw new LodeonClientError("auth.external.exchange_invalid");
  }
  return exchangeExternalAuthCode(codes[0], fetcher);
}

export async function logout(
  session: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<AuthSession> {
  await fetcher(authLogoutUrl, {
    method: "POST",
    headers: authHeaders(session)
  });
  clearAuthSession();

  return loadAuthSession(fetcher);
}

export function readAuthSession(): string | undefined {
  try {
    return sessionStorage.getItem(authSessionStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeAuthSession(session: string): void {
  try {
    sessionStorage.setItem(authSessionStorageKey, session);
  } catch {
    // Auth session storage is best effort; the server remains authoritative.
  }
}

function clearAuthSession(): void {
  try {
    sessionStorage.removeItem(authSessionStorageKey);
  } catch {
    // Ignored intentionally.
  }
}

export function authHeaders(session: string | undefined): HeadersInit {
  return session ? { Authorization: `Bearer ${session}` } : {};
}

/** Returns headers for the current process-local browser session. */
export function currentAuthHeaders(): HeadersInit {
  return authHeaders(readAuthSession());
}

export function validateLoginToken(token: string): void {
  if (!token) {
    throw new LodeonClientError("auth.token_required");
  }
}
