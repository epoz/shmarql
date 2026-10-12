import { describe, expect, it, vi } from "vitest";
import { createLocalization } from "@lodeon/localization/runtime";
import { createEmptyProject } from "@lodeon/project/factory";
import { type LodeonProject } from "@lodeon/project/contracts";
import { createPreviewWorkflow } from "@lodeon/preview/workflow";
import { createPublishWorkflow } from "@lodeon/publish/workflow";
import { buildRendererStoryPayload } from "@lodeon/renderer/story-payload";
import type { ProjectPackageWorkflow } from "@lodeon/project/package/workflow";
import { defaultConfig } from "./fixtures/config";

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <section data-preview-panel hidden><span data-preview-status></span>
      <button data-preview-close></button><iframe data-preview-frame></iframe>
    </section>
    <section data-publish-status-modal hidden><p data-publish-status></p>
      <a data-publish-link hidden></a><button data-publish-status-close></button>
    </section>
  `;
  return root;
}

describe("renderer story payload", () => {
  it("builds the shared Markdown and referenced-asset contract once", async () => {
    const project = createEmptyProject("Shared Payload");
    project.assets = [{
      assetId: "used",
      kind: "image",
      mimeType: "image/png",
      path: "assets/used.png",
      fileName: "used.png",
      originalName: "used.png",
      size: 4,
      createdAt: "2026-08-16T10:00:00.000Z"
    }, {
      assetId: "unused",
      kind: "image",
      mimeType: "image/png",
      path: "assets/unused.png",
      fileName: "unused.png",
      originalName: "unused.png",
      size: 6,
      createdAt: "2026-08-16T10:00:00.000Z"
    }];
    project.document.content?.push({
      type: "mediaAssetNode",
      attrs: { id: "media", kind: "image", assetId: "used", collapsed: false }
    });
    const usedBlob = new Blob(["used"], { type: "image/png" });
    const payload = await buildRendererStoryPayload(project, defaultConfig, {
      loadAssetBlobs: vi.fn().mockResolvedValue([{ 
        projectId: project.id,
        assetId: "used",
        blob: usedBlob,
        mimeType: "image/png",
        size: 4,
        updatedAt: "2026-08-16T10:00:00.000Z"
      }])
    });

    expect(payload.title).toBe("Shared Payload");
    expect(payload.markdown).toContain("# Shared Payload");
    expect(payload.assets).toEqual([{
      path: "assets/used.png",
      mimeType: "image/png",
      blob: usedBlob
    }]);
  });
});

describe("preview workflow", () => {
  it("preserves protected auth gating before renderer execution", async () => {
    const root = createRoot();
    const project = createEmptyProject("Preview");
    const openAuth = vi.fn();
    const renderPreview = vi.fn();
    const flushProject = vi.fn().mockResolvedValue(undefined);
    const workflow = createPreviewWorkflow({
      root,
      config: defaultConfig,
      i18n: createLocalization(defaultConfig),
      getProject: () => project,
      getSession: () => undefined,
      isAuthorized: () => false,
      flushProject,
      openAuth,
      renderError: (_error, fallback) => fallback,
      renderErrorCode: (code) => code,
      renderPreview
    });

    await workflow.open();

    expect(flushProject).toHaveBeenCalledOnce();
    expect(openAuth).toHaveBeenCalledOnce();
    expect(renderPreview).not.toHaveBeenCalled();
    expect(root.querySelector("[data-preview-panel]")?.dataset.state).toBe("error");
    expect(root.querySelector("[data-preview-status]")?.textContent).toBe(
      "preview.login_required"
    );
  });

  it("tracks and deletes the current preview artefact on close", async () => {
    const root = createRoot();
    const project = createEmptyProject("Preview");
    const deletePreview = vi.fn().mockResolvedValue(undefined);
    const workflow = createPreviewWorkflow({
      root,
      config: defaultConfig,
      i18n: createLocalization(defaultConfig),
      getProject: () => project,
      getSession: () => "session-one",
      isAuthorized: () => true,
      flushProject: vi.fn().mockResolvedValue(undefined),
      openAuth: vi.fn(),
      renderError: (_error, fallback) => fallback,
      renderErrorCode: (code) => code,
      buildPayload: vi.fn().mockResolvedValue({
        title: project.title,
        markdown: "# Preview",
        assets: []
      }),
      renderPreview: vi.fn().mockResolvedValue({
        id: "preview-one",
        url: "/api/artefacts/preview-one/story/lodeon-preview/"
      }),
      deletePreview
    });

    await workflow.open();
    await workflow.close();

    expect(deletePreview).toHaveBeenCalledWith(
      "/api/artefacts/preview-one",
      fetch,
      "session-one"
    );
    expect(
      root.querySelector<HTMLIFrameElement>("[data-preview-frame]")?.hasAttribute("src")
    ).toBe(false);
  });

  it("discards and cleans a Preview response that completes after close", async () => {
    const root = createRoot();
    const project = createEmptyProject("Stale Preview");
    let resolvePreview: ((value: { id: string; url: string }) => void) | undefined;
    const renderPreview = vi.fn(
      () =>
        new Promise<{ id: string; url: string }>((resolve) => {
          resolvePreview = resolve;
        })
    );
    const deletePreview = vi.fn().mockResolvedValue(undefined);
    const workflow = createPreviewWorkflow({
      root,
      config: defaultConfig,
      i18n: createLocalization(defaultConfig),
      getProject: () => project,
      getSession: () => "session-one",
      isAuthorized: () => true,
      flushProject: vi.fn().mockResolvedValue(undefined),
      openAuth: vi.fn(),
      renderError: (_error, fallback) => fallback,
      renderErrorCode: (code) => code,
      buildPayload: vi.fn().mockResolvedValue({ title: project.title, markdown: "# Preview", assets: [] }),
      renderPreview,
      deletePreview
    });

    const opening = workflow.open();
    await vi.waitFor(() => expect(renderPreview).toHaveBeenCalledOnce());
    await workflow.close();
    resolvePreview?.({ id: "preview-stale", url: "/api/artefacts/preview-stale/story/lodeon-preview/" });
    await opening;

    expect(root.querySelector<HTMLIFrameElement>("[data-preview-frame]")?.hasAttribute("src")).toBe(false);
    expect(deletePreview).toHaveBeenCalledWith("/api/artefacts/preview-stale", fetch, "session-one");
  });
});

describe("publish workflow", () => {
  it("updates publication state only after a successful renderer response", async () => {
    const root = createRoot();
    const project = createEmptyProject("Publish");
    project.slug = "publish";
    const updateProjectControls = vi.fn();
    const touchProject = vi.fn();
    const publishStory = vi.fn().mockResolvedValue({
      slug: "publish",
      title: "Publish",
      path: "story/publish/index.md",
      url: "/story/publish/"
    });
    const projectPackages = {
      chooseExportMode: vi.fn().mockResolvedValue("withChats"),
      createExportProject: vi.fn((value: LodeonProject) => value),
      createZipAsset: vi.fn()
    } satisfies Pick<
      ProjectPackageWorkflow,
      "chooseExportMode" | "createExportProject" | "createZipAsset"
    >;
    const workflow = createPublishWorkflow({
      root,
      config: defaultConfig,
      i18n: createLocalization(defaultConfig),
      getProject: () => project,
      getSession: () => undefined,
      isAuthorized: () => true,
      flushProject: vi.fn().mockResolvedValue(undefined),
      touchProject,
      updateProjectControls,
      updateSlugStatus: vi.fn(),
      openAuth: vi.fn(),
      renderError: (_error, fallback) => fallback,
      renderErrorCode: (code) => code,
      projectPackages,
      now: () => "2026-08-16T11:00:00.000Z",
      buildPayload: vi.fn().mockResolvedValue({
        title: project.title,
        markdown: "# Publish",
        assets: []
      }),
      publishStory
    });

    await workflow.publish();

    expect(publishStory).toHaveBeenCalledWith(
      defaultConfig.renderer.publishURL,
      { title: "Publish", slug: "publish", markdown: "# Publish", assets: [] },
      expect.objectContaining({ session: undefined })
    );
    expect(project.published).toEqual({
      url: "/story/publish/",
      publishedAt: "2026-08-16T11:00:00.000Z"
    });
    expect(project.publicationHistory).toEqual([project.published]);
    expect(updateProjectControls).toHaveBeenCalledOnce();
    expect(touchProject).toHaveBeenCalledOnce();
  });
});
