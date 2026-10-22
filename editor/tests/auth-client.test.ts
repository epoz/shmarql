import { describe, expect, it, vi } from "vitest";
import {
  completeExternalAuthReturn,
  exchangeExternalAuthCode,
  loadAuthSession,
  loginWithToken,
  logout,
  validateLoginToken
} from "@lodeon/auth/api-client";

describe("auth client", () => {
  it("fails closed for malformed auth status responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ authEnabled: "yes" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(loadAuthSession(fetcher as unknown as typeof fetch)).resolves.toEqual({
      authEnabled: true,
      authenticated: false,
      methods: { token: false, externalProviders: [] },
      capabilities: { publish: false }
    });
  });

  it("fails closed when auth discovery is unavailable", async () => {
    sessionStorage.setItem("lodeon.auth.session", "stale-session");
    const fetcher = vi.fn(async () => new Response("Bad Gateway", { status: 502 }));

    await expect(loadAuthSession(fetcher as unknown as typeof fetch)).resolves.toEqual({
      authEnabled: true,
      authenticated: false,
      methods: { token: false, externalProviders: [] },
      capabilities: { publish: false }
    });
    expect(sessionStorage.getItem("lodeon.auth.session")).toBeNull();
  });

  it("preserves an explicit successful auth-disabled server status", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          authEnabled: false,
          authenticated: true,
          methods: { token: false, externalProviders: [] },
          capabilities: { publish: true }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    await expect(loadAuthSession(fetcher as unknown as typeof fetch)).resolves.toEqual({
      authEnabled: false,
      authenticated: true,
      methods: { token: false, externalProviders: [] },
      capabilities: { publish: true },
      session: undefined
    });
  });

  it("loads auth status and keeps the stored session", async () => {
    sessionStorage.setItem("lodeon.auth.session", "session-1");
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          authEnabled: true,
          authenticated: true,
          loginMethod: "token",
          methods: { token: true, externalProviders: [] },
          capabilities: { publish: false }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const session = await loadAuthSession(fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/status", {
      headers: { Authorization: "Bearer session-1" }
    });
    expect(session.session).toBe("session-1");
    expect(session.authenticated).toBe(true);
  });

  it("stores the server session after token login", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          authEnabled: true,
          authenticated: true,
          loginMethod: "token",
          methods: { token: true, externalProviders: [] },
          capabilities: { publish: false },
          session: "session-2"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const session = await loginWithToken("secret", fetcher as unknown as typeof fetch);

    expect(session.session).toBe("session-2");
    expect(sessionStorage.getItem("lodeon.auth.session")).toBe("session-2");
  });

  it("removes and exchanges one external callback code before discovery", async () => {
    const replacements: string[] = [];
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          authEnabled: true,
          authenticated: true,
          loginMethod: "oidc",
          loginProvider: "institution",
          methods: {
            token: true,
            externalProviders: [
              {
                id: "institution",
                label: "Institution Login",
                icon: "/assets/auth/institution.svg",
                startUrl: "/api/auth/external/institution/start"
              }
            ]
          },
          capabilities: { publish: true },
          session: "external-session"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const session = await completeExternalAuthReturn(
      "https://lodeon.example/lodeon/?view=editor&authExchange=one-time-code#story",
      (url) => replacements.push(url),
      fetcher as unknown as typeof fetch
    );

    expect(replacements).toEqual(["/lodeon/?view=editor#story"]);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/external/exchange", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ code: "one-time-code" })
    });
    expect(session?.loginMethod).toBe("oidc");
    expect(sessionStorage.getItem("lodeon.auth.session")).toBe("external-session");
  });

  it("rejects malformed or unsuccessful external exchanges without storing state", async () => {
    sessionStorage.removeItem("lodeon.auth.session");
    const replacements: string[] = [];
    await expect(
      completeExternalAuthReturn(
        "https://lodeon.example/lodeon/?authExchange=one&authExchange=two",
        (url) => replacements.push(url)
      )
    ).rejects.toMatchObject({ code: "auth.external.exchange_invalid" });
    expect(replacements).toEqual(["/lodeon/"]);

    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "auth.external.exchange_invalid",
          detail: "expired"
        }),
        { status: 401, headers: { "content-type": "application/problem+json" } }
      )
    );
    await expect(
      exchangeExternalAuthCode("expired", fetcher as unknown as typeof fetch)
    ).rejects.toMatchObject({ code: "auth.external.exchange_invalid" });
    expect(sessionStorage.getItem("lodeon.auth.session")).toBeNull();
  });

  it("validates required login tokens with a stable code", () => {
    expect(() => validateLoginToken("")).toThrowError(
      expect.objectContaining({ code: "auth.token_required" })
    );
  });

  it("preserves auth Problem Detail codes on login failure", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "auth.invalid_token",
          detail: "invalid token"
        }),
        {
          status: 401,
          headers: { "content-type": "application/problem+json" }
        }
      )
    );

    await expect(
      loginWithToken("wrong", fetcher as unknown as typeof fetch)
    ).rejects.toMatchObject({
      code: "auth.invalid_token",
      variables: {
        externalError: "invalid token"
      }
    });
  });

  it("clears the local session on logout", async () => {
    sessionStorage.setItem("lodeon.auth.session", "session-3");
    const fetcher = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/logout")
            ? { authenticated: false }
            : {
                authEnabled: true,
                authenticated: false,
                methods: { token: true, externalProviders: [] },
                capabilities: { publish: false }
              }
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const session = await logout("session-3", fetcher as unknown as typeof fetch);

    expect(fetcher).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer session-3" }
    });
    expect(sessionStorage.getItem("lodeon.auth.session")).toBeNull();
    expect(session.authenticated).toBe(false);
  });
});
