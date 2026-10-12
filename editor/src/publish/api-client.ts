/** Owns the typed publish transport boundary and its protocol normalization. */

import { z } from "zod";
import { problemFromResponse } from "../errors/problem-details";
import {
  postRendererMultipart,
  type RendererMultipartUploadOptions,
  type RendererUploadAsset
} from "../renderer/multipart-client";

export type PublishStoryRequest = {
  title: string;
  slug: string;
  markdown: string;
  assets?: PublishAssetPayload[];
};

export type PublishAssetPayload = {
  path: string;
  mimeType: string;
  dataBase64: string;
};

export type PublishStoryResponse = {
  slug: string;
  title: string;
  path: string;
  url: string;
  packageUrl?: string;
};

const publishStoryResponseSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    path: z.string(),
    url: z.string(),
    packageUrl: z.string().optional()
  })
  .strict();

function parsePublishStoryResponse(value: unknown): PublishStoryResponse {
  return publishStoryResponseSchema.parse(value);
}

export type PublishStoryMultipartRequest = {
  title: string;
  slug: string;
  markdown: string;
  assets?: RendererUploadAsset[];
  project?: unknown;
  publishStoryZip?: boolean;
  packageFileName?: string;
};

/** Posts a JSON publication and validates the stable published-story response. */
export async function publishStory(
  publishUrl: string,
  request: PublishStoryRequest,
  fetcher: typeof fetch = fetch,
  session?: string
): Promise<PublishStoryResponse> {
  const response = await fetcher(publishUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session}` } : {})
    },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw await problemFromResponse(response, "publish.failed", {
      413: "publish.payload_too_large"
    });
  }

  return parsePublishStoryResponse(await response.json());
}

/** Uploads publication assets while reusing the canonical Publish response parser. */
export function publishStoryMultipart(
  publishUrl: string,
  request: PublishStoryMultipartRequest,
  options: RendererMultipartUploadOptions = {}
): Promise<PublishStoryResponse> {
  return postRendererMultipart(publishUrl, request, options, "publish.failed", parsePublishStoryResponse, {
    413: "publish.payload_too_large"
  });
}
