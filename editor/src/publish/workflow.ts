/** Coordinates the publish user workflow over explicit injected boundaries. */

import type { LodeonConfig } from "../configuration/schema";
import type { LodeonErrorVariables } from "../errors/client-error";
import type { LodeonLocalization } from "../localization/runtime";
import type { LodeonProject } from "../project/contracts";
import { isValidProjectSlug } from "../project/identity";
import { createProjectZipFileName } from "../project/package/filenames";
import type { ProjectPackageWorkflow } from "../project/package/workflow";
import { buildRendererStoryPayload, renderUploadProgressStatus } from "../renderer/story-payload";
import { publishStoryMultipart } from "./api-client";

type PublishStatus = "idle" | "success" | "error";

export type PublishWorkflowOptions = {
  root: HTMLElement;
  config: LodeonConfig;
  i18n: LodeonLocalization;
  getProject: () => LodeonProject;
  getSession: () => string | undefined;
  isAuthorized: () => boolean;
  flushProject: () => Promise<void>;
  touchProject: () => void;
  updateProjectControls: () => void;
  updateSlugStatus: (valid: boolean) => void;
  openAuth: () => void;
  renderError: (error: unknown, fallbackCode: string) => string;
  renderErrorCode: (code: string, variables?: LodeonErrorVariables) => string;
  projectPackages: Pick<ProjectPackageWorkflow, "createZipAsset">;
  now?: () => string;
  buildPayload?: typeof buildRendererStoryPayload;
  publishStory?: typeof publishStoryMultipart;
};

export type PublishWorkflow = {
  publish: () => Promise<void>;
  clearStatus: () => void;
  bindControls: () => () => void;
};

/**
 * Publishes a flushed project and commits local publication metadata only after success.
 * Authentication, package generation, and upload share one operation; remote failure
 * leaves the canonical project unchanged.
 */
export function createPublishWorkflow({
  root,
  config,
  i18n,
  getProject,
  getSession,
  isAuthorized,
  flushProject,
  touchProject,
  updateProjectControls,
  updateSlugStatus,
  openAuth,
  renderError,
  renderErrorCode,
  projectPackages,
  now = () => new Date().toISOString(),
  buildPayload = buildRendererStoryPayload,
  publishStory = publishStoryMultipart
}: PublishWorkflowOptions): PublishWorkflow {
  function setStatus(message: string, url?: string, state: PublishStatus = "idle"): void {
    const panel = root.querySelector<HTMLElement>("[data-publish-status-modal]");
    const status = root.querySelector<HTMLElement>("[data-publish-status]");
    const link = root.querySelector<HTMLAnchorElement>("[data-publish-link]");

    if (panel) {
      panel.hidden = message.length === 0;
      panel.dataset.state = state;
    }
    if (status) {
      status.textContent = message;
    }
    if (link) {
      if (url) {
        link.href = url;
        link.textContent = url;
        link.hidden = false;
      } else {
        link.removeAttribute("href");
        link.textContent = "";
        link.hidden = true;
      }
    }
  }

  async function publish(): Promise<void> {
    const project = getProject();
    if (!isValidProjectSlug(project.slug)) {
      setStatus(renderErrorCode("publish.invalid_request", { reason: "invalid_slug" }), undefined, "error");
      updateSlugStatus(false);
      return;
    }

    const publishingMessage = i18n.t("editor", "publishStatus.publishing");
    setStatus(publishingMessage);
    await flushProject();

    try {
      if (!isAuthorized()) {
        openAuth();
        setStatus(renderErrorCode("publish.login_required"), undefined, "error");
        return;
      }

      const publishedAt = now();
      const packageFileName = createProjectZipFileName(project);
      const nextPublished = {
        url: `/story/${project.slug}/`,
        ...(project.publishStoryZip ? { packageUrl: `/story/${project.slug}/${packageFileName}` } : {}),
        publishedAt
      };
      const publishedProject: LodeonProject = {
        ...project,
        published: nextPublished,
        publicationHistory: [...(project.publicationHistory ?? []), nextPublished].slice(-10),
        updatedAt: publishedAt
      };
      const payload = await buildPayload(publishedProject, config);
      if (project.publishStoryZip) {
        payload.assets.push(
          await projectPackages.createZipAsset(publishedProject, payload.markdown, packageFileName)
        );
      }

      const published = await publishStory(
        config.renderer.publishURL,
        { ...payload, slug: project.slug },
        {
          session: getSession(),
          onUploadProgress: (progress) => {
            setStatus(renderUploadProgressStatus(publishingMessage, progress.percent));
          }
        }
      );
      project.published = {
        url: published.url,
        ...(project.publishStoryZip ? { packageUrl: published.packageUrl ?? nextPublished.packageUrl } : {}),
        publishedAt
      };
      project.publicationHistory = [...(project.publicationHistory ?? []), project.published].slice(-10);
      updateProjectControls();
      touchProject();
      setStatus(i18n.t("editor", "publishStatus.published"), published.url, "success");
    } catch (error) {
      setStatus(renderError(error, "publish.failed"), undefined, "error");
    }
  }

  function bindControls(): () => void {
    const closeButton = root.querySelector<HTMLButtonElement>("[data-publish-status-close]");
    const handleClose = () => setStatus("");

    closeButton?.addEventListener("click", handleClose);
    return () => closeButton?.removeEventListener("click", handleClose);
  }

  return {
    publish,
    clearStatus: () => setStatus(""),
    bindControls
  };
}
