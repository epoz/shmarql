/** Defines the stable Verovio Special Node data contracts without owning runtime behavior. */

import type { NormalizedSparqlRow, SparqlExecutionResult } from "../sparql/api-client";

export const VEROVIO_NODE_TYPE_NAME = "verovioNode";
export const VEROVIO_RENDERER_NAME = "verovio";
export const VEROVIO_FENCE_NAME = "lodeon-verovio";

export const VEROVIO_SUPPORTED_FORMATS = ["mei", "pae"] as const;
export const VEROVIO_SOURCE_MODES = ["direct", "file", "sparql"] as const;
export const VEROVIO_FIXED_SPARQL_VARIABLES = [
  "data",
  "format",
  "label",
  "resource",
  "resourceLabel"
] as const;
export const VEROVIO_VIEW_MODES = ["single", "list", "grouped", "compare"] as const;
export const VEROVIO_DOCUMENT_LAYOUTS = ["responsive", "paginated"] as const;
export const VEROVIO_COMPARE_PLAYBACK_MODES = ["a", "b", "aThenB", "bThenA"] as const;
export const VEROVIO_TEMPO_MULTIPLIERS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export type VerovioInputFormat = (typeof VEROVIO_SUPPORTED_FORMATS)[number];
export type VerovioFixedSparqlVariable = (typeof VEROVIO_FIXED_SPARQL_VARIABLES)[number];
export type VerovioSourceMode = (typeof VEROVIO_SOURCE_MODES)[number];
export type VerovioViewMode = (typeof VEROVIO_VIEW_MODES)[number];
export type VerovioDocumentLayout = (typeof VEROVIO_DOCUMENT_LAYOUTS)[number];
export type VerovioComparePlaybackMode = (typeof VEROVIO_COMPARE_PLAYBACK_MODES)[number];
export type VerovioValidationSeverity = "warning" | "error";
export type VerovioItemState = "unvalidated" | "ready" | "warning" | "error";

export type VerovioValidationLocation = {
  row?: number;
  column?: number;
  field?: string;
};

export type VerovioValidationMessage = {
  code: string;
  severity: VerovioValidationSeverity;
  variables: Record<string, string | number | boolean>;
  location?: VerovioValidationLocation;
};

export type VerovioItemStatus = {
  state: VerovioItemState;
  messages: VerovioValidationMessage[];
};

export type VerovioItem = {
  id: string;
  data: string;
  format: VerovioInputFormat | null;
  label: string | null;
  resource: string | null;
  resourceLabel: string | null;
  bindings: NormalizedSparqlRow;
  status: VerovioItemStatus;
};

export type VerovioPlaybackSettings = {
  tempoMultiplier: number;
  loop: boolean;
  volume: number;
};

export type VerovioCompareState = {
  aItemId: string | null;
  bItemId: string | null;
  synchronizedZoom: boolean;
  aZoom: number;
  bZoom: number;
  playbackMode: VerovioComparePlaybackMode;
  loopSequence: boolean;
  tempoMultiplier: number;
  targetKey: string | null;
  showTransposed: boolean;
};

export type VerovioRenderSpec = {
  renderer: typeof VEROVIO_RENDERER_NAME;
  items: VerovioItem[];
  viewMode: VerovioViewMode;
  selectedItemId: string | null;
  documentLayout: VerovioDocumentLayout;
  initialZoom: number;
  paginatedPageHeight: number;
  visibleMetadataFields: string[];
  playback: VerovioPlaybackSettings;
  compare: VerovioCompareState;
  caption: string;
};

export type VerovioNodeAttrs = {
  id: string;
  kind: "verovio";
  title: string;
  sourceMode: VerovioSourceMode;
  inputData: string;
  inputFormat: VerovioInputFormat | null;
  inputLabel: string;
  inputResource: string;
  inputResourceLabel: string;
  fileName: string;
  fileData: string;
  query: string;
  knowledgeGraphProfileId?: string;
  result: SparqlExecutionResult | null;
  resultPageSize: 10 | 50 | 100 | 500 | 1000 | "All";
  items: VerovioItem[];
  viewMode: VerovioViewMode;
  selectedItemId: string | null;
  documentLayout: VerovioDocumentLayout;
  initialZoom: number;
  paginatedPageHeight: number;
  visibleMetadataFields: string[];
  playback: VerovioPlaybackSettings;
  compare: VerovioCompareState;
  caption: string;
  viewConfig: VerovioRenderSpec;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export const EMPTY_VEROVIO_ITEM_STATUS: VerovioItemStatus = {
  state: "unvalidated",
  messages: []
};

export const EMPTY_VEROVIO_COMPARE_STATE: VerovioCompareState = {
  aItemId: null,
  bItemId: null,
  synchronizedZoom: true,
  aZoom: 1,
  bZoom: 1,
  playbackMode: "a",
  loopSequence: false,
  tempoMultiplier: 1,
  targetKey: null,
  showTransposed: false
};

export const DEFAULT_VEROVIO_PLAYBACK_SETTINGS: VerovioPlaybackSettings = {
  tempoMultiplier: 1,
  loop: false,
  volume: 0.8
};
