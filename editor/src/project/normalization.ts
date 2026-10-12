/** Canonicalizes project values without storage, network, or DOM side effects. */

import type { LodeonAsset } from "../assets/contracts";
import { normalizeAsset } from "../assets/normalization";
import type { LodeonProject, LodeonPublicationEntry } from "./contracts";
import { createProjectId, normalizeProjectSlug } from "./identity";
import { normalizeProjectMetadata } from "./metadata";

/** Returns the canonical current project shape without accepting legacy project formats. */
export function normalizeProject(project: LodeonProject): LodeonProject {
  const now = new Date().toISOString();
  // Projects imported from a full LODEON instance may carry Assistant chats and memory; drop them.
  const canonical: LodeonProject & { assistant?: unknown } = { ...project };
  delete canonical.assistant;

  return {
    ...canonical,
    id: project.id ?? createProjectId(),
    slug: normalizeProjectSlug(project.slug ?? "", project.title ?? ""),
    metadata: normalizeProjectMetadata(project.metadata),
    publishStoryZip: Boolean(project.publishStoryZip),
    publicationHistory: normalizePublicationHistory(project.publicationHistory),
    assets: normalizeAssets(project.assets),
    createdAt: project.createdAt ?? now,
    updatedAt: project.updatedAt ?? now
  };
}

function normalizePublicationHistory(value: unknown): LodeonPublicationEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => ({
      url: typeof entry.url === "string" ? entry.url : "",
      packageUrl: typeof entry.packageUrl === "string" ? entry.packageUrl : undefined,
      publishedAt: typeof entry.publishedAt === "string" ? entry.publishedAt : ""
    }))
    .filter((entry) => entry.url && entry.publishedAt)
    .slice(-10);
}

function normalizeAssets(value: unknown): LodeonAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((asset): asset is Partial<LodeonAsset> => Boolean(asset && typeof asset === "object"))
    .map(normalizeAsset)
    .filter((asset) => asset.assetId && asset.path && asset.mimeType)
    .slice(0, 500);
}
