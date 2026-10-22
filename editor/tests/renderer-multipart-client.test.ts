import { describe, expect, it, vi } from "vitest";
import { renderPreviewMultipart } from "@lodeon/preview/api-client";
import { publishStoryMultipart } from "@lodeon/publish/api-client";
import {
  buildRendererMultipartFormData,
  postRendererMultipart
} from "@lodeon/renderer/multipart-client";

class MockXMLHttpRequest {
  readonly upload = new EventTarget();
  readonly headers: Record<string, string> = {};
  readonly target = new EventTarget();
  method = "";
  url = "";
  body: Document | XMLHttpRequestBodyInit | null = null;

  constructor(
    readonly status: number,
    readonly responseText: string,
    readonly contentType = "application/json"
  ) {}

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  getResponseHeader(name: string): string | null {
    return name.toLowerCase() === "content-type" ? this.contentType : null;
  }

  addEventListener(type: string, listener: EventListener): void {
    this.target.addEventListener(type, listener);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    this.body = body ?? null;
    this.upload.dispatchEvent(
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 25,
        total: 100
      })
    );
    this.target.dispatchEvent(new Event("load"));
  }
}

describe("renderer multipart client", () => {
  it("builds a shared multipart payload descriptor for renderer assets", async () => {
    const formData = await buildRendererMultipartFormData({
      title: "Multipart Story",
      slug: "E6263",
      markdown: "# Multipart Story",
      publishStoryZip: true,
      packageFileName: "E6263.lodeon.zip",
      assets: [
        {
          path: "assets/images/fixture.jpg",
          mimeType: "image/jpeg",
          blob: new Blob(["image"], { type: "image/jpeg" })
        }
      ]
    });

    const payload = JSON.parse(String(formData.get("payload")));
    const asset = formData.get("asset-0");

    expect(payload).toEqual({
      title: "Multipart Story",
      slug: "E6263",
      markdown: "# Multipart Story",
      publishStoryZip: true,
      packageFileName: "E6263.lodeon.zip",
      assets: [
        {
          path: "assets/images/fixture.jpg",
          mimeType: "image/jpeg",
          fileField: "asset-0"
        }
      ]
    });
    expect(asset).toBeInstanceOf(File);
    expect((asset as File).name).toBe("fixture.jpg");
    expect((asset as File).type).toBe("image/jpeg");
  });

  it("posts renderer multipart requests via XHR with upload progress", async () => {
    const xhr = new MockXMLHttpRequest(
      200,
      JSON.stringify({ id: "preview-1", url: "/preview/preview-1/" })
    );
    const progress = vi.fn();

    const response = await postRendererMultipart<{ id: string; url: string }>(
      "/api/preview",
      {
        title: "Preview Story",
        markdown: "# Preview Story",
        assets: []
      },
      {
        session: "session-1",
        onUploadProgress: progress,
        xhrFactory: () => xhr as unknown as XMLHttpRequest
      },
      "preview.render_failed",
      (value) => {
        if (!value || typeof value !== "object" || !("id" in value) || !("url" in value)) {
          throw new Error("invalid_renderer_response");
        }
        const response = value as { id: unknown; url: unknown };
        if (typeof response.id !== "string" || typeof response.url !== "string") {
          throw new Error("invalid_renderer_response");
        }
        return { id: response.id, url: response.url };
      }
    );

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/preview");
    expect(xhr.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer session-1"
    });
    expect(xhr.body).toBeInstanceOf(FormData);
    expect(progress).toHaveBeenCalledWith({
      loaded: 25,
      total: 100,
      percent: 25
    });
    expect(response.url).toBe("/preview/preview-1/");
  });

  it("rejects successful multipart responses that fail the owner parser", async () => {
    const xhr = new MockXMLHttpRequest(200, JSON.stringify({ id: 42 }));

    await expect(
      postRendererMultipart(
        "/api/preview",
        { title: "Preview Story", markdown: "# Preview Story" },
        { xhrFactory: () => xhr as unknown as XMLHttpRequest },
        "preview.render_failed",
        () => {
          throw new Error("invalid_renderer_response");
        }
      )
    ).rejects.toThrow("invalid_renderer_response");
  });

  it("maps oversized multipart responses to preview and publish codes", async () => {
    const previewXhr = new MockXMLHttpRequest(
      413,
      "Request body is too large",
      "text/plain"
    );
    const publishXhr = new MockXMLHttpRequest(
      413,
      "Request body is too large",
      "text/plain"
    );

    await expect(
      renderPreviewMultipart(
        "/api/preview",
        {
          title: "Large Preview",
          markdown: "# Large Preview"
        },
        {
          xhrFactory: () => previewXhr as unknown as XMLHttpRequest
        }
      )
    ).rejects.toMatchObject({
      code: "preview.payload_too_large"
    });

    await expect(
      publishStoryMultipart(
        "/api/publish",
        {
          title: "Large Publish",
          slug: "E6263",
          markdown: "# Large Publish"
        },
        {
          xhrFactory: () => publishXhr as unknown as XMLHttpRequest
        }
      )
    ).rejects.toMatchObject({
      code: "publish.payload_too_large"
    });
  });
});
