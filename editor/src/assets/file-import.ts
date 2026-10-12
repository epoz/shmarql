/** Imports browser files into validated local asset records. */

import { LodeonClientError } from "../errors/client-error";
import type { LodeonAsset, LodeonAssetMetadata } from "./contracts";
import { createAssetId, getAssetKind, getAssetPath, MIME_TYPE_EXTENSIONS } from "./mime-policy";
import { normalizeAsset } from "./normalization";
import { extractJpegXmpMetadata, normalizeXmpMetadata } from "./xmp";

export async function createAssetFromFile(file: File, assetId = createAssetId()): Promise<LodeonAsset> {
  const kind = getAssetKind(file.type);

  if (!kind) {
    throw new LodeonClientError("media.unsupported_type", {
      mimeType: file.type || "unknown"
    });
  }

  const baseAsset = {
    assetId,
    kind,
    mimeType: file.type,
    fileName: `${assetId}.${MIME_TYPE_EXTENSIONS[file.type] ?? "bin"}`,
    originalName: file.name,
    size: file.size,
    createdAt: new Date().toISOString()
  };
  const metadata = await extractAssetMetadata(file);
  const asset: LodeonAsset = {
    ...baseAsset,
    ...metadata,
    path: getAssetPath({
      assetId,
      kind,
      mimeType: file.type
    })
  };

  return normalizeAsset(asset);
}

export async function extractAssetMetadata(file: File): Promise<LodeonAssetMetadata> {
  const dimensions = file.type.startsWith("image/") ? await readImageDimensions(file).catch(() => ({})) : {};
  const mediaMetadata = file.type.startsWith("video/")
    ? await readVideoMetadata(file).catch(() => ({}))
    : file.type.startsWith("audio/")
      ? await readAudioMetadata(file).catch(() => ({}))
      : {};
  const rawXmp = file.type === "image/jpeg" ? await extractJpegXmpMetadata(file).catch(() => ({})) : {};
  const normalizedXmp = normalizeXmpMetadata(rawXmp);

  return {
    ...dimensions,
    ...mediaMetadata,
    ...normalizedXmp
  };
}

function readImageDimensions(file: File): Promise<Pick<LodeonAsset, "width" | "height">> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.addEventListener("load", () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      URL.revokeObjectURL(url);
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(
        new LodeonClientError("media.metadata_read_failed", {
          mediaKind: "image",
          field: "dimensions"
        })
      );
    });
    image.src = url;
  });
}

function readVideoMetadata(file: File): Promise<Pick<LodeonAsset, "width" | "height" | "duration">> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);

    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : undefined
      });
      URL.revokeObjectURL(url);
    });
    video.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(
        new LodeonClientError("media.metadata_read_failed", {
          mediaKind: "video",
          field: "metadata"
        })
      );
    });
    video.src = url;
  });
}

function readAudioMetadata(file: File): Promise<Pick<LodeonAsset, "duration">> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);

    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      resolve({
        duration: Number.isFinite(audio.duration) ? audio.duration : undefined
      });
      URL.revokeObjectURL(url);
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(
        new LodeonClientError("media.metadata_read_failed", {
          mediaKind: "audio",
          field: "metadata"
        })
      );
    });
    audio.src = url;
  });
}
