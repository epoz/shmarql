/** Sends renderer payloads and assets through the typed multipart boundary. */

import { problemFromResponse } from "../errors/problem-details";

export type RendererUploadAsset = {
  path: string;
  mimeType: string;
  blob: Blob;
};

export type RendererMultipartRequest = {
  title: string;
  slug?: string;
  markdown: string;
  assets?: RendererUploadAsset[];
  project?: unknown;
  publishStoryZip?: boolean;
  packageFileName?: string;
};

export type RendererUploadProgress = {
  loaded: number;
  total: number | null;
  percent: number | null;
};

export type RendererMultipartUploadOptions = {
  session?: string;
  onUploadProgress?: (progress: RendererUploadProgress) => void;
  xhrFactory?: () => XMLHttpRequest;
};

export type RendererResponseParser<TResponse> = (value: unknown) => TResponse;

type RendererMultipartAssetDescriptor = {
  path: string;
  mimeType: string;
  fileField: string;
};

type RendererMultipartPayload = {
  title: string;
  slug?: string;
  markdown: string;
  assets: RendererMultipartAssetDescriptor[];
  project?: unknown;
  publishStoryZip?: boolean;
  packageFileName?: string;
};

/**
 * Builds the Renderer multipart contract while keeping binary assets outside JSON.
 * Asset references and payload fields remain explicit parts and no credentials are serialized.
 */
export async function buildRendererMultipartFormData(request: RendererMultipartRequest): Promise<FormData> {
  const formData = new FormData();
  const assets = request.assets ?? [];
  const assetDescriptors = assets.map((asset, index) => ({
    path: asset.path,
    mimeType: asset.mimeType,
    fileField: `asset-${index}`
  }));
  const payload: RendererMultipartPayload = {
    title: request.title,
    ...(request.slug ? { slug: request.slug } : {}),
    markdown: request.markdown,
    assets: assetDescriptors,
    ...(request.project === undefined ? {} : { project: request.project }),
    ...(request.publishStoryZip === undefined ? {} : { publishStoryZip: request.publishStoryZip }),
    ...(request.packageFileName ? { packageFileName: request.packageFileName } : {})
  };

  formData.append("payload", JSON.stringify(payload));
  for (const [index, asset] of assets.entries()) {
    await appendFormDataBlob(formData, `asset-${index}`, asset);
  }

  return formData;
}

/**
 * Uploads Renderer multipart data and requires an owner-supplied response parser.
 * Transport progress is observational; malformed success payloads fail before domain use.
 */
export function postRendererMultipart<TResponse>(
  url: string,
  request: RendererMultipartRequest,
  options: RendererMultipartUploadOptions = {},
  fallbackCode: string,
  parseResponse: RendererResponseParser<TResponse>,
  statusCodeMap: Record<number, string> = {}
): Promise<TResponse> {
  const xhr = options.xhrFactory?.() ?? new XMLHttpRequest();

  return new Promise<TResponse>((resolve, reject) => {
    void buildRendererMultipartFormData(request).then((formData) => {
      xhr.open("POST", url);
      xhr.setRequestHeader("Accept", "application/json");

      if (options.session) {
        xhr.setRequestHeader("Authorization", `Bearer ${options.session}`);
      }

      xhr.upload.addEventListener("progress", (event) => {
        options.onUploadProgress?.({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : null,
          percent:
            event.lengthComputable && event.total > 0 ? Math.round((event.loaded / event.total) * 100) : null
        });
      });

      xhr.addEventListener("load", () => {
        void handleMultipartLoad(xhr, fallbackCode, statusCodeMap, parseResponse).then(resolve, reject);
      });
      xhr.addEventListener("error", () => {
        reject(new Error("renderer.upload.network_error"));
      });
      xhr.addEventListener("abort", () => {
        reject(new Error("renderer.upload.aborted"));
      });
      xhr.send(formData);
    }, reject);
  });
}

async function handleMultipartLoad<TResponse>(
  xhr: XMLHttpRequest,
  fallbackCode: string,
  statusCodeMap: Record<number, string>,
  parseResponse: RendererResponseParser<TResponse>
): Promise<TResponse> {
  const response = new Response(xhr.responseText, {
    status: xhr.status,
    headers: {
      "content-type": xhr.getResponseHeader("content-type") ?? ""
    }
  });

  if (xhr.status < 200 || xhr.status >= 300) {
    throw await problemFromResponse(response, fallbackCode, statusCodeMap);
  }

  return parseResponse(JSON.parse(xhr.responseText) as unknown);
}

function fileNameFromPath(path: string): string {
  return path.split("/").filter(Boolean).at(-1) || "asset";
}

async function appendFormDataBlob(
  formData: FormData,
  field: string,
  asset: RendererUploadAsset
): Promise<void> {
  const fileName = fileNameFromPath(asset.path);

  try {
    formData.append(field, asset.blob, fileName);
    return;
  } catch (error) {
    const blob = await cloneFormDataBlob(asset.blob, asset.mimeType, fileName);

    try {
      formData.append(field, blob, fileName);
      return;
    } catch {
      throw error;
    }
  }
}

async function cloneFormDataBlob(blob: Blob, mimeType: string, fileName: string): Promise<Blob> {
  const blobLike = blob as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    type?: string;
  };
  const type = blobLike.type || mimeType;
  const fileConstructor =
    typeof File !== "undefined"
      ? File
      : typeof window !== "undefined" && window.File
        ? window.File
        : undefined;
  const blobConstructor =
    typeof Blob !== "undefined"
      ? Blob
      : typeof window !== "undefined" && window.Blob
        ? window.Blob
        : undefined;

  if (typeof blobLike.arrayBuffer !== "function") {
    return blobConstructor ? new blobConstructor([blob], { type }) : blob;
  }

  const buffer = await blobLike.arrayBuffer();

  if (blobConstructor) {
    return new blobConstructor([buffer], { type });
  }

  if (fileConstructor) {
    return new fileConstructor([buffer], fileName, { type });
  }

  return blob;
}
