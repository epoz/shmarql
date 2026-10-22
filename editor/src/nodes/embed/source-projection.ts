/** Projects canonical Embed Special Node state into a narrower consumer contract. */

import { sparqlRowValue, type SparqlExecutionResult } from "../sparql/api-client";
import { sanitizeEmbedTokenList, validateEmbedUrl } from "./security";
import type { EmbedCandidate, EmbedNodeAttrs } from "./contracts";
import { embedMetadataTitle } from "./metadata-cache";

export function parseEmbedCandidates(value: string, allowedOrigins: string[]): EmbedCandidate[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((rawUrl) => ({
      rawUrl,
      source: "direct",
      label: embedMetadataTitle(rawUrl),
      validation: validateEmbedUrl(rawUrl, allowedOrigins)
    }));
}

export function parseEmbedResultCandidates(
  result: SparqlExecutionResult | null,
  allowedOrigins: string[]
): EmbedCandidate[] {
  if (!result || result.status === "error") {
    return [];
  }

  return result.rows.reduce<EmbedCandidate[]>((items, row) => {
    const url = sparqlRowValue(row, "embedUrl");

    if (!url) {
      return items;
    }

    items.push({
      rawUrl: url,
      source: "sparql",
      label: sparqlRowValue(row, "label") ?? sparqlRowValue(row, "title") ?? undefined,
      resource: sparqlRowValue(row, "resource") ?? sparqlRowValue(row, "item") ?? undefined,
      validation: validateEmbedUrl(url, allowedOrigins)
    });
    return items;
  }, []);
}

export function getEmbedSpecItems(
  attrs: EmbedNodeAttrs
): Array<{ url: string; label?: string; resource?: string }> {
  if (attrs.sourceMode === "sparql" && attrs.result?.status === "success") {
    return attrs.result.rows.reduce<Array<{ url: string; label?: string; resource?: string }>>(
      (items, row) => {
        const url = sparqlRowValue(row, "embedUrl");

        if (!url) {
          return items;
        }

        items.push({
          url,
          label: sparqlRowValue(row, "label") ?? sparqlRowValue(row, "title") ?? undefined,
          resource: sparqlRowValue(row, "resource") ?? sparqlRowValue(row, "item") ?? undefined
        });
        return items;
      },
      []
    );
  }

  return attrs.url
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((url) => ({
      url,
      label: embedMetadataTitle(url)
    }));
}

export function normalizeSelectedIndex(value: number | undefined, count: number): number {
  if (count <= 0) {
    return 0;
  }

  const selectedIndex = Number.isFinite(value) ? Number(value) : 0;

  return Math.min(Math.max(selectedIndex, 0), count - 1);
}

export function buildEmbedSpec(attrs: EmbedNodeAttrs): Record<string, unknown> {
  const items = getEmbedSpecItems(attrs);
  const urls = items.map((item) => item.url);
  const selectedIndex = normalizeSelectedIndex(attrs.selectedIndex, urls.length);

  return {
    version: 1,
    renderer: "iframe",
    url: urls[selectedIndex] ?? urls[0] ?? "",
    urls,
    items,
    caption: attrs.caption,
    aspectRatio: attrs.aspectRatio,
    height: attrs.height,
    sourceMode: attrs.sourceMode,
    query: attrs.query,
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId,
    resultPageSize: attrs.resultPageSize,
    viewMode: attrs.viewMode,
    galleryReferenceStrip: attrs.galleryReferenceStrip,
    selectedIndex,
    sandbox: sanitizeEmbedTokenList(attrs.sandbox),
    allow: sanitizeEmbedTokenList(attrs.allow),
    referrerPolicy: attrs.referrerPolicy,
    loading: attrs.loading
  };
}
