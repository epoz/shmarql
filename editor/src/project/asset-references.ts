/** Discovers and rewrites stable asset references in project documents. */

import type { JSONContent } from "@tiptap/core";
import type { LodeonAssetLifecycleSummary, LodeonProject } from "./contracts";

export function collectReferencedAssetIds(document: JSONContent): string[] {
  const assetIds = new Set<string>();

  collectAssetIds(document, assetIds);

  return [...assetIds].sort();
}

export function summarizeAssetLifecycle(
  project: Pick<LodeonProject, "assets" | "document">
): LodeonAssetLifecycleSummary {
  const referencedAssetIds = collectReferencedAssetIds(project.document);
  const assetIds = new Set(project.assets.map((asset) => asset.assetId));
  const referencedSet = new Set(referencedAssetIds);

  return {
    referencedAssetIds,
    usedAssets: project.assets.filter((asset) => referencedSet.has(asset.assetId)),
    unusedAssets: project.assets.filter((asset) => !referencedSet.has(asset.assetId)),
    missingAssetIds: referencedAssetIds.filter((assetId) => !assetIds.has(assetId))
  };
}

function collectAssetIds(node: JSONContent, assetIds: Set<string>): void {
  if (node.type === "mediaAssetNode" && typeof node.attrs?.assetId === "string" && node.attrs.assetId) {
    assetIds.add(node.attrs.assetId);
  }

  for (const child of node.content ?? []) {
    collectAssetIds(child, assetIds);
  }
}
