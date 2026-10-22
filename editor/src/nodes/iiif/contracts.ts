/** Defines the stable Iiif Special Node data contracts without owning runtime behavior. */

import type { SparqlExecutionResult } from "../sparql/api-client";
import type { SparqlResultPageSize } from "../sparql/result-view";

export type IiifSourceMode = "url" | "sparql";
export type IiifViewMode = "single" | "gallery";
export type IiifGalleryReferenceStrip = "horizontal" | "vertical" | "none";

export type IiifNodeAttrs = {
  id: string;
  kind: "iiif";
  title: string;
  sourceMode: IiifSourceMode;
  url: string;
  query: string;
  knowledgeGraphProfileId?: string;
  resultMapping: Record<string, string>;
  selectedItem: Record<string, unknown> | null;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  label: string;
  caption: string;
  height: number;
  viewMode: IiifViewMode;
  galleryReferenceStrip: IiifGalleryReferenceStrip;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export type IiifResultItem = {
  url: string;
  kind: "manifest" | "imageInfo";
  label: string;
  resource: string;
  rowIndex: number;
};
