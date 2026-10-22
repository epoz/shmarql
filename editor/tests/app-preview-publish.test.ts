import { fireEvent, waitFor, within } from "@testing-library/dom";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "@lodeon/application/composition";
import { defaultConfig } from "./fixtures/config";
import { createEmptyProject } from "@lodeon/project/factory";
import { parseProject, readFileArrayBuffer } from "@lodeon/project/package/parsing";
import { serializeProject, serializeProjectZip } from "@lodeon/project/package/serialization";
import { createSparqlNodeContent } from "@lodeon/nodes/sparql/node-view";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import { createVisualizationNodeContent } from "@lodeon/nodes/visualization/node-view";
import { createEmbedNodeContent } from "@lodeon/nodes/embed/node-view";
import { createIiifNodeContent } from "@lodeon/nodes/iiif/node-view";
import {
  createGraphExplorerNodeContent,
  GRAPH_EXPLORER_NODE_TYPE_NAME
} from "@lodeon/nodes/graph-explorer/node-view";
import { LEAFLET_NODE_TYPE_NAME } from "@lodeon/nodes/leaflet/contracts";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { VEROVIO_NODE_TYPE_NAME } from "@lodeon/nodes/verovio/contracts";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import { createRawGraphsNodeContent } from "@lodeon/nodes/rawgraphs/node-view";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";
import { createMediaAssetNodeContent } from "@lodeon/nodes/media-asset/node-view";
import { createStoryMetadataNodeContent } from "@lodeon/nodes/story-metadata/node-view";
import {
  getProjectAssetBlob,
  saveProjectAssetBlob
} from "@lodeon/persistence/project-store";
import { LodeonClientError } from "@lodeon/errors/client-error";
import {
  MockRendererXMLHttpRequest,
  resetAppTestState,
  setCodeEditorValue,
  stubRendererXmlHttpRequest
} from "./fixtures/app-harness";

describe("LODEON app shell", () => {
  afterEach(resetAppTestState);

  it("renders a Shmarql/MkDocs preview through the configured renderer", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const root = document.createElement("div");
    const project = createEmptyProject("Preview Project");
    project.assets = [
      {
        assetId: "preview-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/preview-asset.jpg",
        fileName: "preview-asset.jpg",
        originalName: "preview.jpg",
        size: 5,
        title: "Preview asset",
        alt: "Preview asset",
        createdAt: new Date().toISOString()
      },
      {
        assetId: "preview-video",
        kind: "video",
        mimeType: "video/webm",
        path: "assets/videos/preview-video.webm",
        fileName: "preview-video.webm",
        originalName: "preview-video.webm",
        size: 5,
        title: "Preview video",
        createdAt: new Date().toISOString()
      },
      {
        assetId: "preview-audio",
        kind: "audio",
        mimeType: "audio/ogg",
        path: "assets/audio/preview-audio.ogg",
        fileName: "preview-audio.ogg",
        originalName: "preview-audio.ogg",
        size: 5,
        title: "Preview audio",
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push(
      {
        type: "sparqlNode",
        attrs: {
          id: "preview-culture-query",
          kind: "sparql",
          title: "Culture preview query",
          source: "SELECT ?culture WHERE { ?culture ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          viewConfig: {},
          collapsed: true
        }
      },
      {
        type: "sparnaturalNode",
        attrs: {
          id: "preview-secondary-query",
          kind: "sparnatural",
          title: "Secondary preview query",
          source: "SELECT ?secondary WHERE { ?secondary ?p ?o }",
          queryJson: null,
          configId: "secondaryDefault",
          knowledgeGraphProfileId: "secondary-kg",
          result: null,
          viewConfig: {},
          collapsed: true
        }
      },
      {
        type: "sparqlNode",
        attrs: {
          id: "preview-hidden-query",
          kind: "sparql",
          title: "Hidden preview query",
          source: "SELECT ?hidden WHERE { ?hidden ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          viewConfig: {},
          collapsed: false,
          excludeFromRender: true
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "preview-media",
          kind: "image",
          assetId: "preview-asset",
          title: "Preview asset",
          collapsed: false
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "preview-video-media",
          kind: "video",
          assetId: "preview-video",
          title: "Preview video",
          collapsed: false
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "preview-audio-media",
          kind: "audio",
          assetId: "preview-audio",
          title: "Preview audio",
          collapsed: false
        }
      }
    );
    await saveProjectAssetBlob({
      assetId: "preview-asset",
      projectId: project.id,
      blob: new File(["image"], "preview-asset.jpg", { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    await saveProjectAssetBlob({
      assetId: "preview-video",
      projectId: project.id,
      blob: new File(["video"], "preview-video.webm", { type: "video/webm" }),
      mimeType: "video/webm",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    await saveProjectAssetBlob({
      assetId: "preview-audio",
      projectId: project.id,
      blob: new File(["audio"], "preview-audio.ogg", { type: "audio/ogg" }),
      mimeType: "audio/ogg",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/status")) {
        return new Response(
          JSON.stringify({
            authEnabled: false,
            authenticated: true,
            methods: { token: false, externalProviders: [] },
            capabilities: { publish: true }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (url.endsWith("/api/artefacts/preview-1")) {
        return new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(
        JSON.stringify({
          id: "preview-1",
          url: "/api/artefacts/preview-1/story/lodeon-preview/"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const previewXhr = new MockRendererXMLHttpRequest(
      200,
      JSON.stringify({
        id: "preview-1",
        url: "/api/artefacts/preview-1/story/lodeon-preview/"
      })
    );
    stubRendererXmlHttpRequest(previewXhr);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    view.getByRole("button", { name: "Preview" }).click();

    await waitFor(() => {
      expect(root.querySelector("[data-preview-panel]")?.hasAttribute("hidden")).toBe(
        false
      );
    });
    expect(view.getByText(/Rendering preview/)).toBeTruthy();
    await waitFor(() => {
      expect(previewXhr.body).toBeInstanceOf(FormData);
    });

    await waitFor(() => {
      expect(
        root.querySelector<HTMLIFrameElement>("[data-preview-frame]")?.src
      ).toContain("/api/artefacts/preview-1/story/lodeon-preview/");
    });

    const formData = previewXhr.body as FormData;
    const requestBody = JSON.parse(String(formData.get("payload"))) as {
      title: string;
      markdown: string;
      assets?: Array<Record<string, string>>;
    };

    expect(previewXhr.method).toBe("POST");
    expect(previewXhr.url).toBe("/api/preview");
    expect(previewXhr.body).toBeInstanceOf(FormData);
    expect(requestBody.title).toBe("Preview Project");
    expect(requestBody.markdown).toContain("# Preview Project");
    expect(requestBody.markdown).toContain(
      '```shmarql {title="Culture preview query" kg="culture-kg"}'
    );
    expect(requestBody.markdown).toContain(
      '```shmarql {title="Secondary preview query" kg="secondary-kg"}'
    );
    expect(requestBody.markdown).not.toContain("Hidden preview query");
    expect(requestBody.markdown).not.toContain("SELECT ?hidden WHERE");
    expect(requestBody.markdown).toContain(
      '![Preview asset](assets/images/preview-asset.jpg "Preview asset")'
    );
    expect(requestBody.markdown).toContain(
      '<video controls src="assets/videos/preview-video.webm"></video>'
    );
    expect(requestBody.markdown).toContain(
      '<audio controls src="assets/audio/preview-audio.ogg"></audio>'
    );
    expect(requestBody.assets).toEqual([
      {
        path: "assets/images/preview-asset.jpg",
        mimeType: "image/jpeg",
        fileField: "asset-0"
      },
      {
        path: "assets/videos/preview-video.webm",
        mimeType: "video/webm",
        fileField: "asset-1"
      },
      {
        path: "assets/audio/preview-audio.ogg",
        mimeType: "audio/ogg",
        fileField: "asset-2"
      }
    ]);
    expect(formData.get("asset-0")).toBeInstanceOf(File);
    expect(formData.get("asset-1")).toBeInstanceOf(File);
    expect(formData.get("asset-2")).toBeInstanceOf(File);
    expect(view.getByText("Preview rendered")).toBeTruthy();

    view.getByRole("button", { name: "Close" }).click();

    expect(root.querySelector("[data-preview-panel]")?.hasAttribute("hidden")).toBe(
      true
    );
    expect(
      root.querySelector<HTMLIFrameElement>("[data-preview-frame]")?.hasAttribute("src")
    ).toBe(false);
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith("/api/artefacts/preview-1", {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
      });
    });

    app.destroy();
    root.remove();
  });

  it("publishes Markdown to the configured renderer publish endpoint", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const root = document.createElement("div");
    const project = createEmptyProject("Publish Project");
    project.slug = "E6263";
    project.assets = [
      {
        assetId: "publish-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/publish-asset.jpg",
        fileName: "publish-asset.jpg",
        originalName: "publish.jpg",
        size: 5,
        title: "Publish asset",
        alt: "Publish asset",
        createdAt: new Date().toISOString()
      },
      {
        assetId: "publish-video",
        kind: "video",
        mimeType: "video/mp4",
        path: "assets/videos/publish-video.mp4",
        fileName: "publish-video.mp4",
        originalName: "publish-video.mp4",
        size: 5,
        title: "Publish video",
        createdAt: new Date().toISOString()
      },
      {
        assetId: "publish-audio",
        kind: "audio",
        mimeType: "audio/mpeg",
        path: "assets/audio/publish-audio.mp3",
        fileName: "publish-audio.mp3",
        originalName: "publish-audio.mp3",
        size: 5,
        title: "Publish audio",
        createdAt: new Date().toISOString()
      }
    ];
    project.document.content?.push(
      {
        type: "sparqlNode",
        attrs: {
          id: "publish-hidden-query",
          kind: "sparql",
          title: "Hidden publish query",
          source: "SELECT ?hiddenPublish WHERE { ?hiddenPublish ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          viewConfig: {},
          collapsed: false,
          excludeFromRender: true
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "publish-media",
          kind: "image",
          assetId: "publish-asset",
          title: "Publish asset",
          collapsed: false
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "publish-video-media",
          kind: "video",
          assetId: "publish-video",
          title: "Publish video",
          collapsed: false
        }
      },
      {
        type: "mediaAssetNode",
        attrs: {
          id: "publish-audio-media",
          kind: "audio",
          assetId: "publish-audio",
          title: "Publish audio",
          collapsed: false
        }
      }
    );
    await saveProjectAssetBlob({
      assetId: "publish-asset",
      projectId: project.id,
      blob: new File(["image"], "publish-asset.jpg", { type: "image/jpeg" }),
      mimeType: "image/jpeg",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    await saveProjectAssetBlob({
      assetId: "publish-video",
      projectId: project.id,
      blob: new File(["video"], "publish-video.mp4", { type: "video/mp4" }),
      mimeType: "video/mp4",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    await saveProjectAssetBlob({
      assetId: "publish-audio",
      projectId: project.id,
      blob: new File(["audio"], "publish-audio.mp3", { type: "audio/mpeg" }),
      mimeType: "audio/mpeg",
      size: 5,
      updatedAt: new Date().toISOString()
    });
    const fetcher = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/status")
            ? {
                authEnabled: false,
                authenticated: true,
                methods: { token: false, externalProviders: [] },
                capabilities: { publish: true }
              }
            : {
                slug: "E6263",
                title: "Publish Project",
                path: "story/E6263/index.md",
                url: "/story/E6263/"
              }
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetcher);
    const publishXhr = new MockRendererXMLHttpRequest(
      200,
      JSON.stringify({
        slug: "E6263",
        title: "Publish Project",
        path: "story/E6263/index.md",
        url: "/story/E6263/"
      })
    );
    stubRendererXmlHttpRequest(publishXhr);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    expect((view.getByLabelText("Story slug") as HTMLInputElement).value).toBe(
      "E6263"
    );
    view.getByRole("button", { name: "Publish" }).click();

    await waitFor(() => {
      expect(publishXhr.body).toBeInstanceOf(FormData);
    });

    await waitFor(() => {
      expect(view.getByText("Published")).toBeTruthy();
      expect(view.getAllByRole("link", { name: "/story/E6263/" })).toHaveLength(
        2
      );
    });

    const formData = publishXhr.body as FormData;
    const requestBody = JSON.parse(String(formData.get("payload"))) as {
      title: string;
      slug: string;
      markdown: string;
      assets?: Array<Record<string, string>>;
    };

    expect(publishXhr.method).toBe("POST");
    expect(publishXhr.url).toBe("/api/publish");
    expect(publishXhr.body).toBeInstanceOf(FormData);
    expect(requestBody.title).toBe("Publish Project");
    expect(requestBody.slug).toBe("E6263");
    expect(requestBody.markdown).toContain("# Publish Project");
    expect(requestBody.markdown).toContain(
      '![Publish asset](assets/images/publish-asset.jpg "Publish asset")'
    );
    expect(requestBody.markdown).toContain(
      '<video controls src="assets/videos/publish-video.mp4"></video>'
    );
    expect(requestBody.markdown).toContain(
      '<audio controls src="assets/audio/publish-audio.mp3"></audio>'
    );
    expect(requestBody.markdown).not.toContain("Hidden publish query");
    expect(requestBody.markdown).not.toContain("SELECT ?hiddenPublish WHERE");
    expect(requestBody.assets).toEqual([
      {
        path: "assets/images/publish-asset.jpg",
        mimeType: "image/jpeg",
        fileField: "asset-0"
      },
      {
        path: "assets/videos/publish-video.mp4",
        mimeType: "video/mp4",
        fileField: "asset-1"
      },
      {
        path: "assets/audio/publish-audio.mp3",
        mimeType: "audio/mpeg",
        fileField: "asset-2"
      }
    ]);
    expect(formData.get("asset-0")).toBeInstanceOf(File);
    expect(formData.get("asset-1")).toBeInstanceOf(File);
    expect(formData.get("asset-2")).toBeInstanceOf(File);
    expect(project.published?.url).toBe("/story/E6263/");
    expect(project.publicationHistory).toHaveLength(1);
    expect(project.publicationHistory[0]?.url).toBe("/story/E6263/");
    expect(root.querySelector("[data-published-story]")?.textContent).toContain(
      "/story/E6263/"
    );

    app.destroy();
    root.remove();
  });

  it("publishes a story ZIP package when enabled in metadata", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const root = document.createElement("div");
    const project = createEmptyProject("Package Publish Project");
    project.slug = "package-publish";
    project.publishStoryZip = true;
    project.metadata.description = "Package metadata";
    project.document.content?.push(
      createStoryMetadataNodeContent({ title: "Publication Metadata" })
    );
    const fetcher = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/status")
            ? {
                authEnabled: false,
                authenticated: true,
                methods: { token: false, externalProviders: [] },
                capabilities: { publish: true }
              }
            : {
                slug: "package-publish",
                title: "Package Publish Project",
                path: "story/package-publish/index.md",
                url: "/story/package-publish/",
                packageUrl: "/story/package-publish/package-publish.lodeon.zip"
              }
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetcher);
    const publishXhr = new MockRendererXMLHttpRequest(
      200,
      JSON.stringify({
        slug: "package-publish",
        title: "Package Publish Project",
        path: "story/package-publish/index.md",
        url: "/story/package-publish/",
        packageUrl: "/story/package-publish/package-publish.lodeon.zip"
      })
    );
    stubRendererXmlHttpRequest(publishXhr);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    expect((view.getByLabelText("Publish Story ZIP") as HTMLInputElement).checked).toBe(
      true
    );

    view.getByRole("button", { name: "Publish" }).click();

    await waitFor(() => {
      expect(view.getByText("Published")).toBeTruthy();
      expect(view.getAllByText("URL").length).toBeGreaterThan(0);
      expect(view.getAllByText("ZIP").length).toBeGreaterThan(0);
      expect(
        view.getByRole("link", {
          name: "package-publish.lodeon.zip"
        })
      ).toBeTruthy();
    });

    const formData = publishXhr.body as FormData;
    const requestBody = JSON.parse(String(formData.get("payload"))) as {
      markdown: string;
      assets?: Array<Record<string, string>>;
    };

    expect(requestBody.markdown).toContain("<dt><strong>Download:</strong></dt>");
    expect(requestBody.markdown).toContain(
      '<a href="/story/package-publish/package-publish.lodeon.zip">package-publish.lodeon.zip</a>'
    );
    expect(requestBody.assets).toHaveLength(1);
    expect(requestBody.assets?.[0]).toMatchObject({
      path: "package-publish.lodeon.zip",
      mimeType: "application/zip",
      fileField: "asset-0"
    });
    expect(formData.get("asset-0")).toBeInstanceOf(File);
    expect(project.published?.packageUrl).toBe(
      "/story/package-publish/package-publish.lodeon.zip"
    );

    app.destroy();
    root.remove();
  });

  it("blocks publish when the slug is invalid", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Publish Project");
    const fetcher = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/status")
            ? {
                authEnabled: false,
                authenticated: true,
                methods: { token: false, externalProviders: [] },
                capabilities: { publish: true }
              }
            : {}
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.input(view.getByLabelText("Story slug"), {
      target: { value: "../bad" }
    });
    view.getByRole("button", { name: "Publish" }).click();

    expect(fetcher).not.toHaveBeenCalledWith("/api/publish", expect.any(Object));
    expect(view.getByText(/Invalid publish request/)).toBeTruthy();
    expect(root.textContent).toContain(
      "Publish request validation failed with the following error: invalid_slug"
    );
    expect(
      root.querySelector("[data-publish-status-modal]")?.hasAttribute("hidden")
    ).toBe(false);

    view.getByRole("button", { name: "Dismiss publish status" }).click();
    expect(
      root.querySelector("[data-publish-status-modal]")?.hasAttribute("hidden")
    ).toBe(true);

    app.destroy();
    root.remove();
  });
});
