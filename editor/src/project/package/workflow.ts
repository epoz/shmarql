/** Coordinates the project package user workflow over explicit injected boundaries. */

import type { LodeonConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import { buildProjectMarkdown } from "../../markdown/project-export";
import type { LodeonProject } from "../contracts";
import { type LodeonProjectAssetFile } from "./contracts";
import { createProjectZipFileName } from "./filenames";
import { parseProjectFileWithAssets } from "./parsing";
import { serializeProjectZip } from "./serialization";
import { listProjectAssetBlobs, saveProjectAssetBlobs } from "../../persistence/project-store";

export type ProjectPackageStatus = "idle" | "success" | "error";

export type ProjectPackageAsset = {
  path: string;
  mimeType: string;
  blob: Blob;
};

export type ProjectPackageWorkflowOptions = {
  root: HTMLElement;
  config: LodeonConfig;
  i18n: LodeonLocalization;
  getProject: () => LodeonProject;
  isReady: () => boolean;
  flushProject: () => Promise<void>;
  saveProject: (project: LodeonProject) => Promise<LodeonProject>;
  activateProject: (project: LodeonProject) => Promise<void>;
  renderError: (error: unknown, fallbackCode: string) => string;
  now?: () => string;
  loadAssetFiles?: (project: LodeonProject) => Promise<LodeonProjectAssetFile[]>;
  saveAssetFiles?: (
    files: Array<{
      projectId: string;
      assetId: string;
      blob: Blob;
      mimeType: string;
      size: number;
      updatedAt: string;
    }>
  ) => Promise<void>;
  downloadBlob?: (blob: Blob, fileName: string) => void;
};

export type ProjectPackageWorkflow = {
  exportProject: () => Promise<void>;
  importProject: (file?: File) => Promise<void>;
  createZipAsset: (
    project: LodeonProject,
    markdown: string,
    fileName: string
  ) => Promise<ProjectPackageAsset>;
  setStatus: (message: string, state?: ProjectPackageStatus) => void;
  bindControls: () => () => void;
};

async function collectProjectAssetFiles(project: LodeonProject): Promise<LodeonProjectAssetFile[]> {
  const assetBlobs = project.assets.length > 0 ? await listProjectAssetBlobs(project.id) : [];

  return project.assets.flatMap((asset) => {
    const assetBlob = assetBlobs.find((blob) => blob.assetId === asset.assetId);

    return assetBlob ? [{ asset, blob: assetBlob.blob }] : [];
  });
}

function downloadProjectBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Coordinates import and export as explicit user operations. Imports validate
 * before activation; exports flush pending state before any project package
 * is downloaded.
 */
export function createProjectPackageWorkflow({
  root,
  config,
  i18n,
  getProject,
  isReady,
  flushProject,
  saveProject,
  activateProject,
  renderError,
  now = () => new Date().toISOString(),
  loadAssetFiles = collectProjectAssetFiles,
  saveAssetFiles = saveProjectAssetBlobs,
  downloadBlob = downloadProjectBlob
}: ProjectPackageWorkflowOptions): ProjectPackageWorkflow {
  function setStatus(message: string, state: ProjectPackageStatus = "idle"): void {
    const panel = root.querySelector<HTMLElement>("[data-package-status]");
    const status = root.querySelector<HTMLElement>("[data-package-status-message]");

    if (panel) {
      panel.hidden = message.length === 0;
      panel.dataset.state = state;
    }

    if (status) {
      status.textContent = message;
    }
  }

  async function createZipBlob(project: LodeonProject, markdown: string): Promise<Blob> {
    return serializeProjectZip(project, markdown, await loadAssetFiles(project));
  }

  async function createZipAsset(
    project: LodeonProject,
    markdown: string,
    fileName: string
  ): Promise<ProjectPackageAsset> {
    return {
      path: fileName,
      mimeType: "application/zip",
      blob: await createZipBlob(project, markdown)
    };
  }

  async function exportProject(): Promise<void> {
    try {
      await flushProject();
      const project = getProject();
      const fileName = createProjectZipFileName(project);
      const blob = await createZipBlob(project, buildProjectMarkdown(project, config));

      downloadBlob(blob, fileName);
      setStatus(i18n.t("editor", "packageStatus.exported", { fileName }), "success");
    } catch (error) {
      setStatus(renderError(error, "project.export_failed"), "error");
    }
  }

  async function importProject(file?: File): Promise<void> {
    if (!isReady() || !file) {
      return;
    }

    setStatus(i18n.t("editor", "packageStatus.importing", { fileName: file.name }));

    try {
      await flushProject();
      const importedPackage = await parseProjectFileWithAssets(file);
      const savedProject = await saveProject(importedPackage.project);

      await saveAssetFiles(
        importedPackage.assets.map((assetFile) => ({
          projectId: savedProject.id,
          assetId: assetFile.asset.assetId,
          blob: assetFile.blob,
          mimeType: assetFile.asset.mimeType,
          size: assetFile.blob.size,
          updatedAt: now()
        }))
      );
      await activateProject(savedProject);
      setStatus(
        i18n.t("editor", "packageStatus.imported", {
          title: savedProject.title
        }),
        "success"
      );
    } catch (error) {
      setStatus(renderError(error, "project.import.invalid_package"), "error");
    }
  }

  function bindControls(): () => void {
    const input = root.querySelector<HTMLInputElement>("[data-project-import]");
    const close = root.querySelector<HTMLButtonElement>("[data-package-status-close]");
    const handleImport = () => {
      void importProject(input?.files?.[0]);
      if (input) {
        input.value = "";
      }
    };
    const handleClose = () => setStatus("");

    input?.addEventListener("change", handleImport);
    close?.addEventListener("click", handleClose);

    return () => {
      input?.removeEventListener("change", handleImport);
      close?.removeEventListener("click", handleClose);
    };
  }

  return {
    exportProject,
    importProject,
    createZipAsset,
    setStatus,
    bindControls
  };
}
