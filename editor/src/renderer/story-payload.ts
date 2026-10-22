/** Builds renderer story payloads from canonical project state. */

import type { LodeonConfig } from "../configuration/schema";
import { buildProjectMarkdown } from "../markdown/project-export";
import { summarizeAssetLifecycle } from "../project/asset-references";
import type { LodeonProject } from "../project/contracts";
import { listProjectAssetBlobs } from "../persistence/project-store";
import type { RendererUploadAsset } from "./multipart-client";

export type RendererStoryPayload = {
  title: string;
  markdown: string;
  assets: RendererUploadAsset[];
};

export type RendererStoryPayloadOptions = {
  loadAssetBlobs?: typeof listProjectAssetBlobs;
};

/** Builds one Preview/Publish payload from canonical Markdown and referenced browser assets. */
export async function buildRendererStoryPayload(
  project: LodeonProject,
  config: LodeonConfig,
  { loadAssetBlobs = listProjectAssetBlobs }: RendererStoryPayloadOptions = {}
): Promise<RendererStoryPayload> {
  const summary = summarizeAssetLifecycle(project);
  const assetBlobs = summary.usedAssets.length > 0 ? await loadAssetBlobs(project.id) : [];
  const assets = summary.usedAssets.flatMap((asset) => {
    const assetBlob = assetBlobs.find((blob) => blob.assetId === asset.assetId);

    return assetBlob ? [{ path: asset.path, mimeType: asset.mimeType, blob: assetBlob.blob }] : [];
  });

  return {
    title: project.title,
    markdown: buildProjectMarkdown(project, config),
    assets
  };
}

export function renderUploadProgressStatus(message: string, percent: number | null): string {
  return percent === null ? message : `${message} ${percent}%`;
}
