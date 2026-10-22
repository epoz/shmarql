/** Enforces supported asset MIME types and filename policy. */

import type { LodeonAsset, LodeonAssetKind } from "./contracts";

export const IMAGE_ASSET_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export const VIDEO_ASSET_MIME_TYPES = ["video/mp4", "video/webm"] as const;

export const AUDIO_ASSET_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm"
] as const;

export const LOCAL_ASSET_MIME_TYPES = [
  ...IMAGE_ASSET_MIME_TYPES,
  ...VIDEO_ASSET_MIME_TYPES,
  ...AUDIO_ASSET_MIME_TYPES
] as const;

export const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm"
};

export function createAssetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `asset-${Date.now()}`;
}

export function getAssetKind(mimeType: string): LodeonAssetKind | null {
  if ((IMAGE_ASSET_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "image";
  }

  if ((VIDEO_ASSET_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "video";
  }

  if ((AUDIO_ASSET_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "audio";
  }

  return null;
}

export function isSupportedLocalAssetMimeType(mimeType: string): boolean {
  return getAssetKind(mimeType) !== null;
}

export function getAssetPath(asset: Pick<LodeonAsset, "kind" | "assetId" | "mimeType">): string {
  const extension = MIME_TYPE_EXTENSIONS[asset.mimeType] ?? "bin";
  const directory = asset.kind === "image" ? "images" : asset.kind === "audio" ? "audio" : "videos";

  return `assets/${directory}/${asset.assetId}.${extension}`;
}
