/** Canonicalizes assets values without storage, network, or DOM side effects. */

import type { LodeonAsset, LodeonAssetKind, LodeonAssetMetadata, LodeonAssetRights } from "./contracts";
import { createAssetId, getAssetKind, getAssetPath, MIME_TYPE_EXTENSIONS } from "./mime-policy";
import { isNonEmptyMetadataString, normalizeAssetMetadataFields } from "./metadata-schema";

export function normalizeAsset(asset: Partial<LodeonAsset>): LodeonAsset {
  const assetId = typeof asset.assetId === "string" && asset.assetId ? asset.assetId : createAssetId();
  const mimeType = typeof asset.mimeType === "string" ? asset.mimeType : "";
  const kind = normalizeAssetKind(asset.kind, mimeType);
  const normalized: LodeonAsset = {
    assetId,
    kind,
    mimeType,
    path:
      typeof asset.path === "string" && asset.path ? asset.path : getAssetPath({ assetId, kind, mimeType }),
    fileName:
      typeof asset.fileName === "string" && asset.fileName
        ? asset.fileName
        : `${assetId}.${MIME_TYPE_EXTENSIONS[mimeType] ?? "bin"}`,
    originalName: typeof asset.originalName === "string" ? asset.originalName : "",
    size: typeof asset.size === "number" ? Math.max(0, asset.size) : 0,
    createdAt: typeof asset.createdAt === "string" ? asset.createdAt : new Date().toISOString()
  };

  copyStringAssetField(asset, normalized, "title");
  copyStringAssetField(asset, normalized, "alt");
  copyStringAssetField(asset, normalized, "caption");
  copyStringAssetField(asset, normalized, "description");
  copyStringAssetField(asset, normalized, "creator");
  copyStringAssetField(asset, normalized, "credit");
  copyStringAssetField(asset, normalized, "date");
  copyStringAssetField(asset, normalized, "source");
  copyStringAssetField(asset, normalized, "identifier");
  copyStringAssetField(asset, normalized, "relation");
  copyStringAssetField(asset, normalized, "license");
  copyStringAssetField(asset, normalized, "language");
  copyStringAssetField(asset, normalized, "publisher");

  if (Array.isArray(asset.contributors)) {
    normalized.contributors = asset.contributors.filter(isNonEmptyMetadataString);
  }

  if (Array.isArray(asset.subjects)) {
    normalized.subjects = asset.subjects.filter(isNonEmptyMetadataString);
  }

  if (typeof asset.width === "number" && asset.width > 0) {
    normalized.width = Math.round(asset.width);
  }

  if (typeof asset.height === "number" && asset.height > 0) {
    normalized.height = Math.round(asset.height);
  }

  if (typeof asset.duration === "number" && asset.duration > 0) {
    normalized.duration = asset.duration;
  }

  if (asset.rights && typeof asset.rights === "object") {
    normalized.rights = normalizeAssetRights(asset.rights);
  }

  if (asset.metadataFields && typeof asset.metadataFields === "object") {
    normalized.metadataFields = normalizeAssetMetadataFields(asset.metadataFields);
  }

  if (asset.rawMetadata && typeof asset.rawMetadata === "object") {
    normalized.rawMetadata = asset.rawMetadata;
  }

  return normalized;
}

function normalizeAssetKind(kind: unknown, mimeType: string): LodeonAssetKind {
  if (kind === "image" || kind === "video" || kind === "audio") {
    return kind;
  }

  return getAssetKind(mimeType) ?? "image";
}

function copyStringAssetField<K extends keyof LodeonAssetMetadata>(
  source: Partial<LodeonAsset>,
  target: LodeonAsset,
  key: K
): void {
  const value = source[key];

  if (typeof value === "string" && value) {
    Object.assign(target, { [key]: value });
  }
}

function normalizeAssetRights(rights: LodeonAssetRights): LodeonAssetRights {
  const normalized: LodeonAssetRights = {};

  for (const key of [
    "owner",
    "usageTerms",
    "webStatement",
    "certificate",
    "license",
    "morePermissions",
    "attributionName",
    "attributionUrl"
  ] as const) {
    const value = rights[key];

    if (typeof value === "string" && value) {
      normalized[key] = value;
    }
  }

  if (typeof rights.marked === "boolean") {
    normalized.marked = rights.marked;
  }

  return normalized;
}
