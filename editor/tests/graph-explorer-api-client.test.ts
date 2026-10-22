import { describe, expect, it, vi } from "vitest";
import { expandGraphExplorer } from "@lodeon/nodes/graph-explorer/api-client";

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
    sessionStorage.setItem("lodeon.auth.session", "restricted-session");
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
    sessionStorage.removeItem("lodeon.auth.session");
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
