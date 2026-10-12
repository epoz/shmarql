/** Defines the stable Visualization Special Node data contracts without owning runtime behavior. */

import type { LodeonConfig } from "../../configuration/schema";
import { executeSparqlQuery, type SparqlExecutionResult } from "../sparql/api-client";
import type { SparnaturalBuilderInput, SparnaturalBuilderOutput } from "../sparnatural/contracts";
import type { NormalizedTable } from "./table-data";
import type { PlotlyDefaults, PlotlyFigure, VisualizationMapping, VisualizationType } from "./renderer";

export type VisualizationSourceMode = "sparql" | "csv" | "tsv" | "url";

export type VisualizationNodeAttrs = {
  id: string;
  kind: "visualization";
  title: string;
  sourceMode: VisualizationSourceMode;
  source: string;
  knowledgeGraphProfileId?: string;
  url: string;
  urlFormat: "csv" | "tsv";
  chartType: VisualizationType;
  mapping: VisualizationMapping;
  plotlyDataJson: string;
  layoutJson: string;
  configJson: string;
  figure: PlotlyFigure | null;
  data: NormalizedTable | null;
  result: SparqlExecutionResult | null;
  message: string;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export type VisualizationNodeOptions = {
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId?: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => LodeonConfig["knowledgeGraph"]["profiles"][number];
  executeQuery: typeof executeSparqlQuery;
  fetchText: typeof fetch;
  errors?: LodeonConfig["errors"];
  plotlyDefaults?: PlotlyDefaults;
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};
