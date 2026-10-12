/** Defines the persisted Sparnatural node and query-builder contracts. */

import type { LodeonConfig } from "../../configuration/schema";
import { executeSparqlQuery, type SparqlExecutionResult } from "../sparql/api-client";
import type { SparqlResultPageSize } from "../sparql/result-view";

export const SPARNATURAL_NODE_TYPE_NAME = "sparnaturalNode";

export type SparnaturalQueryJson = Record<string, unknown> | null;

export type SparnaturalNodeAttrs = {
  id: string;
  kind: "sparnatural";
  title: string;
  source: string;
  queryJson: SparnaturalQueryJson;
  configId: string;
  knowledgeGraphProfileId: string;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number];

export type SparnaturalBuilderInput = Pick<
  SparnaturalNodeAttrs,
  "id" | "title" | "source" | "queryJson" | "configId" | "knowledgeGraphProfileId"
>;

export type SparnaturalBuilderOutput = Partial<
  Pick<SparnaturalNodeAttrs, "source" | "queryJson" | "configId" | "knowledgeGraphProfileId">
>;

export type SparnaturalNodeOptions = {
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};
