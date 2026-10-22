/** Owns the typed Iiif Special Node transport boundary and its protocol normalization. */

import type { LodeonConfig } from "../../configuration/schema";
import { LodeonClientError } from "../../errors/client-error";

export type IiifImageApiInfo = {
  type: "image-api";
  version: 2 | 3;
  id: string;
  label: string;
  width: number;
  height: number;
  tileSource: string;
  sourceUrl: string;
  raw: Record<string, unknown>;
};

export type IiifManifestInfo = {
  type: "manifest";
  version: 2 | 3;
  id: string;
  label: string;
  width: number;
  height: number;
  tileSource: string;
  sourceUrl: string;
  canvasId: string;
  canvasLabel: string;
  raw: Record<string, unknown>;
};

export type IiifResolvedResource = IiifImageApiInfo | IiifManifestInfo;

export type IiifUrlPolicyResult =
  | { status: "allowed"; url: string; parsedUrl: URL }
  | { status: "empty"; code: string; variables?: Record<string, string> }
  | { status: "invalid"; code: string; variables?: Record<string, string> }
  | { status: "blocked"; code: string; variables?: Record<string, string> };

export async function loadIiifImageApiInfo(
  url: string,
  config: LodeonConfig["nodes"]["iiif"],
  fetcher: typeof fetch = fetch
): Promise<IiifResolvedResource> {
  return (await loadIiifResources(url, config, fetcher))[0];
}

export async function loadIiifResources(
  url: string,
  config: LodeonConfig["nodes"]["iiif"],
  fetcher: typeof fetch = fetch
): Promise<IiifResolvedResource[]> {
  const policy = validateIiifUrl(url, config);

  if (policy.status !== "allowed") {
    throw new LodeonClientError(policy.code, policy.variables);
  }

  const response = await fetcher(policy.url, {
    headers: { Accept: "application/json, application/ld+json" }
  });

  if (!response.ok) {
    throw new LodeonClientError("iiif.fetch_failed", {
      externalError: String(response.status)
    });
  }

  const payload = await response.json();

  return parseIiifResources(payload, policy.url);
}

export function validateIiifUrl(value: string, config: LodeonConfig["nodes"]["iiif"]): IiifUrlPolicyResult {
  const trimmed = value.trim();

  if (!trimmed) {
    return { status: "empty", code: "iiif.url_empty" };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmed);
  } catch {
    return {
      status: "invalid",
      code: "iiif.url_invalid",
      variables: { reason: "invalid_absolute_url" }
    };
  }

  if (config.requireHttps && parsedUrl.protocol !== "https:") {
    return {
      status: "blocked",
      code: "iiif.url_invalid",
      variables: { reason: "https_required" }
    };
  }

  const origin = parsedUrl.origin;

  if (config.originPolicy.blockedOrigins.includes(origin)) {
    return {
      status: "blocked",
      code: "iiif.origin_blocked",
      variables: { origin }
    };
  }

  if (config.originPolicy.mode === "allowList" && !config.originPolicy.allowedOrigins.includes(origin)) {
    return {
      status: "blocked",
      code: "iiif.origin_blocked",
      variables: { origin }
    };
  }

  return { status: "allowed", url: parsedUrl.toString(), parsedUrl };
}

export function parseIiifImageApiInfo(value: unknown, tileSource: string): IiifImageApiInfo {
  if (!isRecord(value)) {
    throw new LodeonClientError("iiif.info_json_invalid", {
      reason: "not_object"
    });
  }

  const context = value["@context"] ?? value.context;
  const protocol = value.protocol;
  const width = value.width;
  const height = value.height;
  const id = value["@id"] ?? value.id ?? tileSource.replace(/\/info\.json$/u, "");
  const label = extractIiifLabel(value.label) || tileSource;

  if (typeof width !== "number" || typeof height !== "number") {
    throw new LodeonClientError("iiif.info_json_invalid", {
      reason: "missing_dimensions"
    });
  }

  if (typeof id !== "string" || !id) {
    throw new LodeonClientError("iiif.info_json_invalid", {
      reason: "missing_id"
    });
  }

  if (!looksLikeIiifImageApi(context, protocol, value.type)) {
    throw new LodeonClientError("iiif.info_json_invalid", {
      reason: "not_image_api"
    });
  }

  return {
    type: "image-api",
    version: detectIiifImageApiVersion(context, value.type),
    id,
    label,
    width,
    height,
    tileSource,
    sourceUrl: tileSource,
    raw: value
  };
}

export function parseIiifResource(value: unknown, sourceUrl: string): IiifResolvedResource {
  return parseIiifResources(value, sourceUrl)[0];
}

export function parseIiifResources(value: unknown, sourceUrl: string): IiifResolvedResource[] {
  if (!isRecord(value)) {
    throw new LodeonClientError("iiif.info_json_invalid", {
      reason: "resource_not_object"
    });
  }

  if (looksLikeIiifPresentationManifest(value)) {
    return parseIiifManifestResources(value, sourceUrl);
  }

  return [parseIiifImageApiInfo(value, sourceUrl)];
}

export function parseIiifManifest(value: Record<string, unknown>, sourceUrl: string): IiifManifestInfo {
  return parseIiifManifestResources(value, sourceUrl)[0];
}

export function parseIiifManifestResources(
  value: Record<string, unknown>,
  sourceUrl: string
): IiifManifestInfo[] {
  const context = value["@context"] ?? value.context;
  const type = value.type ?? value["@type"];
  const id = value.id ?? value["@id"] ?? sourceUrl;

  if (typeof id !== "string" || !id) {
    throw new LodeonClientError("iiif.manifest_invalid", {
      reason: "missing_id"
    });
  }

  if (!looksLikeIiifPresentationManifest(value)) {
    throw new LodeonClientError("iiif.manifest_invalid", {
      reason: "not_manifest"
    });
  }

  const resolvedCanvases = findManifestCanvasesWithImageService(value);

  if (!resolvedCanvases.length) {
    throw new LodeonClientError("iiif.no_image_service", {
      reason: "missing_image_service"
    });
  }

  return resolvedCanvases.map(({ canvas, service }) => ({
    type: "manifest",
    version: detectIiifPresentationVersion(context, type),
    id,
    label: extractIiifLabel(value.label) || sourceUrl,
    width: service.width,
    height: service.height,
    tileSource: service.tileSource,
    sourceUrl,
    canvasId: canvas.id,
    canvasLabel: canvas.label,
    raw: value
  }));
}

function looksLikeIiifPresentationManifest(value: Record<string, unknown>): boolean {
  const context = value["@context"] ?? value.context;
  const type = value.type ?? value["@type"];

  return (
    type === "Manifest" ||
    type === "sc:Manifest" ||
    stringOrArrayContains(context, "iiif.io/api/presentation")
  );
}

function detectIiifPresentationVersion(context: unknown, type: unknown): 2 | 3 {
  if (type === "Manifest" || stringOrArrayContains(context, "/3/")) {
    return 3;
  }
  return 2;
}

function findManifestCanvasesWithImageService(manifest: Record<string, unknown>): Array<{
  canvas: {
    id: string;
    label: string;
    value: Record<string, unknown>;
  };
  service: { tileSource: string; width: number; height: number };
}> {
  const resolved: Array<{
    canvas: {
      id: string;
      label: string;
      value: Record<string, unknown>;
    };
    service: { tileSource: string; width: number; height: number };
  }> = [];

  for (const canvas of findManifestCanvases(manifest)) {
    const service = findImageService(canvas);

    if (service) {
      resolved.push({ canvas, service });
    }
  }

  return resolved;
}

function findManifestCanvases(manifest: Record<string, unknown>): Array<{
  id: string;
  label: string;
  value: Record<string, unknown>;
}> {
  const items = manifest.items;
  const canvases: Array<{
    id: string;
    label: string;
    value: Record<string, unknown>;
  }> = [];

  if (Array.isArray(items)) {
    for (const item of items) {
      if (!isRecord(item)) {
        continue;
      }

      const id = item.id ?? item["@id"] ?? "";

      canvases.push({
        id: typeof id === "string" ? id : "",
        label: extractIiifLabel(item.label) || (typeof id === "string" ? id : ""),
        value: item
      });
    }
  }

  const sequences = manifest.sequences;

  if (Array.isArray(sequences)) {
    for (const sequence of sequences) {
      if (!isRecord(sequence) || !Array.isArray(sequence.canvases)) {
        continue;
      }

      for (const canvas of sequence.canvases) {
        if (!isRecord(canvas)) {
          continue;
        }

        const id = canvas["@id"] ?? canvas.id ?? "";

        canvases.push({
          id: typeof id === "string" ? id : "",
          label: extractIiifLabel(canvas.label) || (typeof id === "string" ? id : ""),
          value: canvas
        });
      }
    }
  }

  if (!canvases.length) {
    throw new LodeonClientError("iiif.no_canvas", {
      reason: "missing_canvas"
    });
  }

  return canvases;
}

function findImageService(canvas: {
  value: Record<string, unknown>;
}): { tileSource: string; width: number; height: number } | null {
  const candidates = collectImageServiceCandidates(canvas.value);

  for (const candidate of candidates) {
    const service = serviceFromCandidate(candidate.value, candidate.width, candidate.height);

    if (service) {
      return service;
    }
  }

  return null;
}

function collectImageServiceCandidates(
  value: unknown,
  inheritedWidth = 0,
  inheritedHeight = 0
): Array<{ value: unknown; width: number; height: number }> {
  if (!isRecord(value)) {
    return [];
  }

  const width = typeof value.width === "number" ? value.width : inheritedWidth;
  const height = typeof value.height === "number" ? value.height : inheritedHeight;
  const candidates: Array<{ value: unknown; width: number; height: number }> = [];
  const service = value.service;

  if (service) {
    const services = Array.isArray(service) ? service : [service];

    candidates.push(
      ...services.map((entry) => ({
        value: entry,
        width,
        height
      }))
    );
  }

  for (const key of ["items", "canvases", "images", "body", "resource", "target"]) {
    const child = value[key];

    if (Array.isArray(child)) {
      for (const entry of child) {
        candidates.push(...collectImageServiceCandidates(entry, width, height));
      }
    } else {
      candidates.push(...collectImageServiceCandidates(child, width, height));
    }
  }

  return candidates;
}

function serviceFromCandidate(
  candidate: unknown,
  inheritedWidth: number,
  inheritedHeight: number
): { tileSource: string; width: number; height: number } | null {
  if (!isRecord(candidate)) {
    return null;
  }

  const id = candidate.id ?? candidate["@id"];
  const width = candidate.width;
  const height = candidate.height;

  if (typeof id !== "string" || !id) {
    return null;
  }

  const normalizedId = id.replace(/\/info\.json$/u, "");
  const tileSource = `${normalizedId}/info.json`;

  return {
    tileSource,
    width: typeof width === "number" ? width : inheritedWidth,
    height: typeof height === "number" ? height : inheritedHeight
  };
}

function extractIiifLabel(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (isRecord(value)) {
    for (const key of ["en", "de", "none", "@none"]) {
      const entry = value[key];

      if (Array.isArray(entry) && typeof entry[0] === "string") {
        return entry[0];
      }
      if (typeof entry === "string") {
        return entry;
      }
    }

    const firstArray = Object.values(value).find(
      (entry) => Array.isArray(entry) && typeof entry[0] === "string"
    );

    if (Array.isArray(firstArray)) {
      return firstArray[0];
    }
  }

  return "";
}

function looksLikeIiifImageApi(context: unknown, protocol: unknown, type: unknown): boolean {
  return (
    stringOrArrayContains(context, "iiif.io/api/image") ||
    (typeof protocol === "string" && protocol.includes("iiif.io/api/image")) ||
    type === "ImageService2" ||
    type === "ImageService3"
  );
}

function detectIiifImageApiVersion(context: unknown, type: unknown): 2 | 3 {
  if (type === "ImageService3" || stringOrArrayContains(context, "/3/")) {
    return 3;
  }
  return 2;
}

function stringOrArrayContains(value: unknown, needle: string): boolean {
  if (typeof value === "string") {
    return value.includes(needle);
  }

  if (Array.isArray(value)) {
    return value.some((entry) => stringOrArrayContains(entry, needle));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
