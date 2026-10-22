/** Defines the stable Graph Explorer Special Node data contracts without owning runtime behavior. */

import type { SparqlExecutionResult } from "../sparql/api-client";
import type { SparqlResultPageSize } from "../sparql/result-view";
import type { GraphExplorerGraphData } from "./viewer";

export type GraphExplorerSourceMode = "iri" | "sparql";
export type GraphExplorerDirection = "outgoing" | "incoming" | "both";

export type GraphExplorerColorScheme = {
  label?: string;
  nodeColors: Record<string, string>;
  edgeColors: Record<string, string>;
};

export type GraphExplorerNodeAttrs = {
  id: string;
  kind: "graphExplorer";
  title: string;
  sourceMode: GraphExplorerSourceMode;
  iris: string[];
  query: string;
  knowledgeGraphProfileId: string;
  resultMapping: Record<string, string>;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  selectedIndex: number;
  direction: GraphExplorerDirection;
  depth: number;
  maxNodes: number;
  maxEdgesPerNode: number;
  showPredicateLabels: boolean;
  showLiterals: boolean;
  showTypes: boolean;
  includeBlankNodes: boolean;
  colorScheme: string;
  height: number;
  caption: string;
  graphData: GraphExplorerGraphData | null;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};
