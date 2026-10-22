/** Coordinates the preview user workflow over explicit injected boundaries. */

import type { LodeonConfig } from "../configuration/schema";
import type { LodeonLocalization } from "../localization/runtime";
import type { LodeonProject } from "../project/contracts";
import { buildRendererStoryPayload, renderUploadProgressStatus } from "../renderer/story-payload";
import { deletePreviewArtefact, renderPreviewMultipart } from "./api-client";

type PreviewStatus = "idle" | "success" | "error";

export type PreviewWorkflowOptions = {
  root: HTMLElement;
  config: LodeonConfig;
  i18n: LodeonLocalization;
  getProject: () => LodeonProject;
  getSession: () => string | undefined;
  isAuthorized: () => boolean;
  flushProject: () => Promise<void>;
  openAuth: () => void;
  renderError: (error: unknown, fallbackCode: string) => string;
  renderErrorCode: (code: string) => string;
  buildPayload?: typeof buildRendererStoryPayload;
  renderPreview?: typeof renderPreviewMultipart;
  deletePreview?: typeof deletePreviewArtefact;
};

export type PreviewWorkflow = {
  open: () => Promise<void>;
  close: () => Promise<void>;
  clearStatus: () => void;
  bindControls: () => () => void;
};

function previewCleanupUrl(url: string): string | null {
  const match = url.match(/^(.*\/artefacts\/[^/]+)(?:\/.*)?$/);
  return match?.[1] ?? null;
}

/**
 * Coordinates authorization, project flushing, upload, display, and artifact cleanup.
 * Request generations prevent a closed or superseded Preview from mutating the iframe;
 * cleanup is best effort because authoring must remain available when deletion fails.
 */
export function createPreviewWorkflow({
  root,
  config,
  i18n,
  getProject,
  getSession,
  isAuthorized,
  flushProject,
  openAuth,
  renderError,
  renderErrorCode,
  buildPayload = buildRendererStoryPayload,
  renderPreview = renderPreviewMultipart,
  deletePreview = deletePreviewArtefact
}: PreviewWorkflowOptions): PreviewWorkflow {
  let requestGeneration = 0;

  function setStatus(message: string, state: PreviewStatus = "idle"): void {
    const status = root.querySelector<HTMLElement>("[data-preview-status]");
    const panel = root.querySelector<HTMLElement>("[data-preview-panel]");

    if (status) {
      status.textContent = message;
    }
    if (panel) {
      panel.dataset.state = state;
    }
  }

  async function cleanup(): Promise<void> {
    const panel = root.querySelector<HTMLElement>("[data-preview-panel]");
    const cleanupUrl = panel?.dataset.previewCleanupUrl;

    if (!panel || !cleanupUrl) {
      return;
    }

    delete panel.dataset.previewCleanupUrl;
    try {
      await deletePreview(cleanupUrl, fetch, getSession());
    } catch {
      // Preview cleanup remains best effort and never blocks later authoring.
    }
  }

  function showPanel(): void {
    const panel = root.querySelector<HTMLElement>("[data-preview-panel]");
    const frame = root.querySelector<HTMLIFrameElement>("[data-preview-frame]");

    if (panel) {
      panel.hidden = false;
    }
    frame?.removeAttribute("src");
  }

  function showPreview(url: string): void {
    const panel = root.querySelector<HTMLElement>("[data-preview-panel]");
    const frame = root.querySelector<HTMLIFrameElement>("[data-preview-frame]");

    if (panel) {
      panel.hidden = false;
      panel.dataset.previewCleanupUrl = previewCleanupUrl(url) ?? "";
    }
    if (frame) {
      frame.src = url;
    }
  }

  async function open(): Promise<void> {
    const generation = ++requestGeneration;
    await cleanup();
    if (generation !== requestGeneration) {
      return;
    }
    showPanel();
    const renderingMessage = i18n.t("editor", "previewPanel.rendering");
    setStatus(renderingMessage);
    await flushProject();
    if (generation !== requestGeneration) {
      return;
    }

    try {
      if (!isAuthorized()) {
        openAuth();
        setStatus(renderErrorCode("preview.login_required"), "error");
        return;
      }

      const preview = await renderPreview(
        config.renderer.previewURL,
        await buildPayload(getProject(), config),
        {
          session: getSession(),
          onUploadProgress: (progress) => {
            setStatus(renderUploadProgressStatus(renderingMessage, progress.percent));
          }
        }
      );
      if (generation !== requestGeneration) {
        const cleanupUrl = previewCleanupUrl(preview.url);
        if (cleanupUrl) {
          try {
            await deletePreview(cleanupUrl, fetch, getSession());
          } catch {
            // Stale Preview cleanup is best effort and cannot replace the active result.
          }
        }
        return;
      }
      showPreview(preview.url);
      setStatus(i18n.t("editor", "previewPanel.rendered"), "success");
    } catch (error) {
      if (generation !== requestGeneration) {
        return;
      }
      setStatus(renderError(error, "preview.render_failed"), "error");
    }
  }

  async function close(): Promise<void> {
    requestGeneration += 1;
    const panel = root.querySelector<HTMLElement>("[data-preview-panel]");
    const frame = root.querySelector<HTMLIFrameElement>("[data-preview-frame]");

    if (panel) {
      panel.hidden = true;
    }
    frame?.removeAttribute("src");
    await cleanup();
  }

  function bindControls(): () => void {
    const closeButton = root.querySelector<HTMLButtonElement>("[data-preview-close]");
    const handleClose = () => void close();

    closeButton?.addEventListener("click", handleClose);
    return () => closeButton?.removeEventListener("click", handleClose);
  }

  return {
    open,
    close,
    clearStatus: () => setStatus(""),
    bindControls
  };
}
