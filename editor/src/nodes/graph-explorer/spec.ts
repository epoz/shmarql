/** Projects canonical node state into deterministic renderer specifications. */

import { sparqlRowValue } from "../sparql/api-client";
import type { GraphExplorerColorScheme, GraphExplorerNodeAttrs } from "./contracts";

const DEFAULT_NODE_COLORS = {
  iri: "#0072B2",
  blank: "#E69F00",
  literal: "#FFFFFF"
};

const DEFAULT_EDGE_COLORS = {
  default: "#666666"
};

export function buildGraphExplorerSpec(
  attrs: GraphExplorerNodeAttrs,
  colorSchemes?: Record<string, GraphExplorerColorScheme>
): Record<string, unknown> {
  return {
    renderer: "graphExplorer",
    version: 1,
    sourceMode: attrs.sourceMode,
    iris: attrs.iris,
    query: attrs.query,
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId,
    resultMapping: attrs.resultMapping,
    items: getGraphExplorerSpecItems(attrs),
    resultPageSize: attrs.resultPageSize,
    selectedIndex: attrs.selectedIndex,
    direction: attrs.direction,
    depth: attrs.depth,
    maxNodes: attrs.maxNodes,
    maxEdgesPerNode: attrs.maxEdgesPerNode,
    showPredicateLabels: attrs.showPredicateLabels,
    showLiterals: attrs.showLiterals,
    showTypes: attrs.showTypes,
    includeBlankNodes: attrs.includeBlankNodes,
    colorScheme: attrs.colorScheme,
    colors: resolveGraphExplorerColors(attrs.colorScheme, colorSchemes ?? {}),
    height: attrs.height,
    caption: attrs.caption,
    graphData: attrs.graphData
  };
}

export function firstGraphExplorerColorSchemeId(
  colorSchemes?: Record<string, GraphExplorerColorScheme>
): string {
  return Object.keys(colorSchemes ?? {})[0] ?? "basic";
}

export function resolveGraphExplorerColors(
  colorScheme: string,
  colorSchemes: Record<string, GraphExplorerColorScheme>
): { nodeColors: Record<string, string>; edgeColors: Record<string, string> } {
  const scheme = colorSchemes[colorScheme] ?? colorSchemes[firstGraphExplorerColorSchemeId(colorSchemes)];

  return {
    nodeColors: {
      ...DEFAULT_NODE_COLORS,
      ...(scheme?.nodeColors ?? {})
    },
    edgeColors: {
      ...DEFAULT_EDGE_COLORS,
      ...(scheme?.edgeColors ?? {})
    }
  };
}

export function defaultGraphExplorerColors(): {
  nodeColors: Record<string, string>;
  edgeColors: Record<string, string>;
} {
  return {
    nodeColors: { ...DEFAULT_NODE_COLORS },
    edgeColors: { ...DEFAULT_EDGE_COLORS }
  };
}

export function getGraphExplorerSpecItems(
  attrs: GraphExplorerNodeAttrs
): Array<{ iri: string; label?: string }> {
  if (attrs.sourceMode === "sparql" && attrs.result?.status === "success") {
    return attrs.result.rows.reduce<Array<{ iri: string; label?: string }>>((items, row) => {
      const iri = sparqlRowValue(row, attrs.resultMapping.iri ?? "resource");

      if (iri) {
        items.push({
          iri,
          label: sparqlRowValue(row, attrs.resultMapping.label ?? "label") ?? undefined
        });
      }
      return items;
    }, []);
  }

  return attrs.iris.map((iri) => ({ iri }));
}
