import { describe, expect, it, vi } from "vitest";
import { expandGraphExplorer } from "@lodeon/nodes/graph-explorer/api-client";

function setAuthCookie(value: string): void {
  document.cookie = `access_token=${encodeURIComponent(value)}; path=/; max-age=604800; samesite=lax`;
}
function clearAuthCookie(): void {
  document.cookie = `access_token=; path=/; max-age=0; samesite=lax`;
}
function getAuthCookie(): string | undefined {
  const prefix = "access_token=";
  const found = (document.cookie || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
}

type GraphExplorerProfile = Parameters<typeof expandGraphExplorer>[0];

const profile = {
  id: "test-kg",
  graphExplorer: { expandUrl: "/api/explorer/test-kg/expand" }
} as GraphExplorerProfile;

const request = {
  iris: ["https://example.org/resource"],
  direction: "both" as const,
  depth: 1,
  maxNodes: 20,
  maxEdgesPerNode: 10,
  includeLiterals: true,
  includeBlankNodes: true
};

describe("Graph Explorer API client", () => {
  it("validates and returns a successful graph envelope", async () => {
    setAuthCookie("restricted-session");
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          profileId: "test-kg",
          nodes: [{ id: "https://example.org/resource", kind: "iri" }],
          edges: []
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const result = await expandGraphExplorer(profile, request, fetcher);

    expect(result.profileId).toBe("test-kg");
    expect(result.nodes).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/explorer/test-kg/expand",
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer restricted-session"
        }
      })
    );
    clearAuthCookie();
  });

  it("rejects malformed successful graph envelopes before viewer use", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, nodes: "not-an-array", edges: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(expandGraphExplorer(profile, request, fetcher)).rejects.toThrow();
  });
});
