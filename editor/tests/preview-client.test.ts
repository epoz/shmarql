import { describe, expect, it, vi } from "vitest";
import { deletePreviewArtefact, renderPreview } from "@lodeon/preview/api-client";

describe("preview client", () => {
  it("rejects malformed successful preview responses", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ id: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    await expect(
      renderPreview("/api/preview", { title: "Preview", markdown: "# Preview" }, fetcher)
    ).rejects.toThrow();
  });

  it("posts Markdown to the configured renderer preview endpoint", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "preview-1",
          url: "/api/artefacts/preview-1/story/lodeon-preview/"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );

    const response = await renderPreview(
      "/api/preview",
      {
        title: "Preview Story",
        markdown: "# Preview Story"
      },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith("/api/preview", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: "Preview Story",
        markdown: "# Preview Story"
      })
    });
    expect(response.url).toBe(
      "/api/artefacts/preview-1/story/lodeon-preview/"
    );
  });

  it("reports oversized preview payloads with a deployment hint", async () => {
    const fetcher = vi.fn(async () =>
      new Response("Request body is too large", {
        status: 413,
        headers: {
          "content-type": "text/plain"
        }
      })
    );

    await expect(
      renderPreview(
        "/api/preview",
        {
          title: "Large Preview Story",
          markdown: "# Large Preview Story"
        },
        fetcher
      )
    ).rejects.toMatchObject({
      code: "preview.payload_too_large",
      variables: {
        externalError: "Request body is too large"
      }
    });
  });

  it("preserves preview Problem Detail codes", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: "preview.invalid_request",
          detail: "missing markdown"
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
      renderPreview(
        "/api/preview",
        {
          title: "Broken Preview Story",
          markdown: ""
        },
        fetcher
      )
    ).rejects.toMatchObject({
      code: "preview.invalid_request",
      variables: {
        externalError: "missing markdown"
      }
    });
  });

  it("deletes preview artefacts through the configured artefact URL", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      })
    );

    await deletePreviewArtefact("/api/artefacts/preview-1", fetcher, "session-1");

    expect(fetcher).toHaveBeenCalledWith("/api/artefacts/preview-1", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer session-1"
      }
    });
  });
});
