/** Projects canonical Iiif Special Node state into a narrower consumer contract. */

import type { NormalizedSparqlRow, SparqlExecutionResult } from "../sparql/api-client";
import type { IiifNodeAttrs, IiifResultItem } from "./contracts";

export function extractIiifResultItems(
  result: Extract<SparqlExecutionResult, { status: "success" }>,
  mapping: Record<string, string>
): IiifResultItem[] {
  return result.rows.flatMap((row, rowIndex) => {
    const manifestUrl = bindingValue(row, mapping.manifest);
    const imageInfoUrl = bindingValue(row, mapping.imageInfo);
    const url = manifestUrl || imageInfoUrl;

    if (!url) {
      return [];
    }

    return [
      {
        url,
        kind: manifestUrl ? "manifest" : "imageInfo",
        label: bindingValue(row, mapping.label) || bindingValue(row, mapping.resource) || url,
        resource: bindingValue(row, mapping.resource),
        rowIndex
      }
    ];
  });
}

function bindingValue(row: NormalizedSparqlRow, variableName: string | undefined): string {
  if (!variableName) {
    return "";
  }

  return row[variableName]?.value ?? "";
}

export function selectIiifResultItem(
  items: IiifResultItem[],
  selectedItem: Record<string, unknown> | null
): IiifResultItem {
  const selectedUrl = selectedItem && typeof selectedItem.url === "string" ? selectedItem.url : "";

  return items.find((item) => item.url === selectedUrl) ?? items[0];
}

export function extractDirectUrlItems(value: string): IiifResultItem[] {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((url, index) => ({
      url,
      kind: url.includes("/info.json") ? "imageInfo" : "manifest",
      label: url,
      resource: "",
      rowIndex: index
    }));
}

export function buildIiifSpec(attrs: IiifNodeAttrs): Record<string, unknown> {
  return {
    version: 1,
    renderer: "iiif",
    sourceMode: attrs.sourceMode,
    url: attrs.url,
    query: attrs.query,
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId,
    resultMapping: attrs.resultMapping,
    selectedItem: attrs.selectedItem,
    label: attrs.label,
    caption: attrs.caption,
    height: attrs.height,
    viewMode: attrs.viewMode,
    galleryReferenceStrip: attrs.galleryReferenceStrip
  };
}
