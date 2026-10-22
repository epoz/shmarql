/** Coalesces and caches safe Embed metadata lookups. */

import { z } from "zod";
import { currentAuthHeaders } from "../../auth/api-client";
import type { EmbedCandidate, EmbedMetadataItem } from "./contracts";

const embedMetadataCache = new Map<string, EmbedMetadataItem>();
const embedMetadataRequests = new Map<string, Promise<EmbedMetadataItem[]>>();

const embedMetadataResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            url: z.string(),
            status: z.string(),
            origin: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            message: z.string().optional()
          })
          .strict()
      )
      .optional()
  })
  .strict();

export function embedMetadataTitle(url: string): string | undefined {
  return embedMetadataCache.get(url)?.title || undefined;
}

/**
 * Coalesces concurrent metadata requests and caches only safe response fields;
 * failed remote lookups become controlled unavailable entries.
 */
export async function loadMissingEmbedMetadata(candidates: EmbedCandidate[]): Promise<EmbedMetadataItem[]> {
  const urls = candidates.map((candidate) => candidate.rawUrl).filter((url) => !embedMetadataCache.has(url));

  if (!urls.length) {
    return [];
  }

  const requestKey = urls.join("\n");
  const existingRequest = embedMetadataRequests.get(requestKey);

  if (existingRequest) {
    return existingRequest;
  }

  const request = globalThis
    .fetch("/api/embed/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...currentAuthHeaders() },
      body: JSON.stringify({ urls })
    })
    .then(async (response) => {
      if (!response.ok) {
        const items = urls.map((url) => ({
          url,
          status: "unavailable",
          title: "",
          description: ""
        }));

        items.forEach((item) => {
          embedMetadataCache.set(item.url, item);
        });
        return items;
      }

      const payload = embedMetadataResponseSchema.parse(await response.json());
      const items = payload.items ?? [];

      items.forEach((item) => {
        if (item.url) {
          embedMetadataCache.set(item.url, item);
        }
      });
      return items;
    })
    .catch(() => {
      const items = urls.map((url) => ({
        url,
        status: "unavailable",
        title: "",
        description: ""
      }));

      items.forEach((item) => {
        embedMetadataCache.set(item.url, item);
      });
      return items;
    })
    .finally(() => {
      embedMetadataRequests.delete(requestKey);
    });

  embedMetadataRequests.set(requestKey, request);
  return request;
}
