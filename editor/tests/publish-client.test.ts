import { describe, expect, it, vi } from "vitest";
import { publishStory } from "@lodeon/publish/api-client";

describe("Publish client", () => {
  it("rejects malformed successful publish responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ slug: "story", url: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      publishStory(
        "/api/publish",
        { title: "Story", slug: "story", markdown: "# Story" },
        fetcher as unknown as typeof fetch
      )
    ).rejects.toThrow();
  });

  it("posts Markdown to the configured renderer publish endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          slug: "E6263",
          title: "Fixture Story",
          path: "story/E6263/index.md",
          url: "/story/E6263/"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    const published = await publishStory(
      "/api/publish",
      {
        title: "Fixture Story",
        slug: "E6263",
        markdown: "# Fixture Story"
      },
      fetcher as unknown as typeof fetch
    );

    expect(fetcher).toHaveBeenCalledWith("/api/publish", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Fixture Story",
        slug: "E6263",
        markdown: "# Fixture Story"
      })
    });
    expect(published.title).toBe("Fixture Story");
    expect(published.url).toBe("/story/E6263/");
  });

  it("accepts the complete canonical Renderer publish response", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          slug: "published-story",
          title: "Published Story",
          path: "story/published-story/index.md",
          url: "/story/published-story/",
          packageUrl: "/story/published-story/published-story.lodeon.zip"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );

    await expect(
      publishStory(
        "/api/publish",
        {
          title: "Published Story",
          slug: "published-story",
          markdown: "# Published Story"
        },
        fetcher as unknown as typeof fetch
      )
    ).resolves.toEqual({
      slug: "published-story",
      title: "Published Story",
      path: "story/published-story/index.md",
      url: "/story/published-story/",
      packageUrl: "/story/published-story/published-story.lodeon.zip"
    });
  });

  it("reports oversized publish payloads with a deployment hint", async () => {
    const fetcher = vi.fn(async () =>
      new Response("Request body is too large", {
        status: 413,
        headers: {
          "content-type": "text/plain"
        }
      })
    );

    await expect(
      publishStory(
        "/api/publish",
        {
          title: "Large Fixture Story",
          slug: "E6263",
          markdown: "# Large Fixture Story"
        },
        fetcher as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      code: "publish.payload_too_large",
      variables: {
        externalError: "Request body is too large"
      }
    });
  });

  it("preserves publish Problem Detail codes", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "publish.invalid_request",
          detail: "invalid slug"
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/problem+json"
          }
        }
      )
    );

    await expect(
      publishStory(
        "/api/publish",
        {
          title: "Broken Fixture Story",
          slug: "",
          markdown: "# Broken Fixture Story"
        },
        fetcher as unknown as typeof fetch
      )
    ).rejects.toMatchObject({
      code: "publish.invalid_request",
      variables: {
        externalError: "invalid slug"
      }
    });
  });
});
