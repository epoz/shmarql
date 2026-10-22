/** Defines the stable Embed Special Node data contracts without owning runtime behavior. */

import type { SparqlExecutionResult } from "../sparql/api-client";
import type { SparqlResultPageSize } from "../sparql/result-view";
import type { validateEmbedUrl } from "./security";

export type EmbedAspectRatio = "16:9" | "4:3" | "1:1" | "custom";
export type EmbedLoading = "lazy" | "eager";
export type EmbedSourceMode = "url" | "sparql";
export type EmbedViewMode = "single" | "gallery";
export type EmbedGalleryReferenceStrip = "horizontal" | "vertical" | "none";

export type EmbedNodeAttrs = {
  id: string;
  kind: "embed";
  title: string;
  sourceMode: EmbedSourceMode;
  url: string;
  query: string;
  knowledgeGraphProfileId?: string;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  caption: string;
  aspectRatio: EmbedAspectRatio;
  height: number;
  viewMode: EmbedViewMode;
  galleryReferenceStrip: EmbedGalleryReferenceStrip;
  selectedIndex: number;
  sandbox: string[];
  allow: string[];
  referrerPolicy: string;
  loading: EmbedLoading;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export type EmbedCandidate = {
  rawUrl: string;
  source: "direct" | "sparql";
  label?: string;
  resource?: string;
  validation: ReturnType<typeof validateEmbedUrl>;
};

export type EmbedMetadataItem = {
  url: string;
  status: string;
  origin?: string;
  title?: string;
  description?: string;
  message?: string;
};
