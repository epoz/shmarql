/** Owns the typed preview transport boundary and its protocol normalization. */

import { z } from "zod";
import { problemFromResponse } from "../errors/problem-details";
import {
  postRendererMultipart,
  type RendererMultipartUploadOptions,
  type RendererUploadAsset
} from "../renderer/multipart-client";

export type RenderPreviewRequest = {
  title: string;
  markdown: string;
  assets?: RenderAssetPayload[];
};

export type RenderAssetPayload = {
  path: string;
  mimeType: string;
  dataBase64: string;
};

export type RenderPreviewResponse = {
  id: string;
  url: string;
};

const renderPreviewResponseSchema = z.object({ id: z.string(), url: z.string() }).strict();

function parseRenderPreviewResponse(value: unknown): RenderPreviewResponse {
  return renderPreviewResponseSchema.parse(value);
}

export type RenderPreviewMultipartRequest = {
  title: string;
  markdown: string;
  assets?: RendererUploadAsset[];
};

/** Posts one JSON Preview request and validates the returned artifact identity and URL. */
export async function renderPreview(
  previewUrl: string,
  request: RenderPreviewRequest,
  fetcher: typeof fetch = fetch,
  session?: string
): Promise<RenderPreviewResponse> {
  const response = await fetcher(previewUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session}` } : {})
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw await problemFromResponse(response, "preview.render_failed", {
      413: "preview.payload_too_large"
    });
  }

  return parseRenderPreviewResponse(await response.json());
}

/** Uploads a Preview with assets while reusing the canonical Preview response parser. */
export function renderPreviewMultipart(
  previewUrl: string,
  request: RenderPreviewMultipartRequest,
  options: RendererMultipartUploadOptions = {}
): Promise<RenderPreviewResponse> {
  return postRendererMultipart(
    previewUrl,
    request,
    options,
    "preview.render_failed",
    parseRenderPreviewResponse,
    { 413: "preview.payload_too_large" }
  );
}

/** Deletes one server-issued Preview artifact; invalid responses fail as client errors. */
export async function deletePreviewArtefact(
  artefactUrl: string,
  fetcher: typeof fetch = fetch,
  session?: string
): Promise<void> {
  const response = await fetcher(artefactUrl, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      ...(session ? { Authorization: `Bearer ${session}` } : {})
    }
  });

  if (!response.ok && response.status !== 404) {
    throw await problemFromResponse(response, "preview.cleanup_failed");
  }
}
