import { describe, expect, it } from "vitest";
import type { GraphExplorerNodeAttrs } from "@lodeon/nodes/graph-explorer/contracts";
import {
  buildGraphExplorerSpec,
  resolveGraphExplorerColors
} from "@lodeon/nodes/graph-explorer/spec";

function graphExplorerAttrs(
  overrides: Partial<GraphExplorerNodeAttrs> = {}
): GraphExplorerNodeAttrs {
  return {
    id: "graph-explorer-test",
    kind: "graphExplorer",
    title: "Test",
    sourceMode: "iri",
    iris: ["https://example.org/a"],
    query: "",
    knowledgeGraphProfileId: "example",
    resultMapping: { iri: "resource", label: "label" },
    result: null,
    resultPageSize: 10,
    selectedIndex: 0,
    direction: "both",
    depth: 1,
    maxNodes: 100,
    maxEdgesPerNode: 50,
    showPredicateLabels: true,
    showLiterals: true,
    showTypes: true,
    includeBlankNodes: true,
    colorScheme: "custom",
    height: 520,
    caption: "",
    graphData: null,
    viewConfig: {},
    collapsed: false,
    excludeFromRender: false,
    ...overrides
  };
}

describe("Graph Explorer renderer specification", () => {
  it("projects direct resources and configured colors without changing persisted values", () => {
    const attrs = graphExplorerAttrs();

    expect(
      buildGraphExplorerSpec(attrs, {
        custom: {
          nodeColors: { iri: "#123456" },
          edgeColors: { default: "#654321" }
        }
      })
    ).toMatchObject({
      renderer: "graphExplorer",
      version: 1,
      items: [{ iri: "https://example.org/a" }],
      direction: "both",
      colors: {
        nodeColors: { iri: "#123456", blank: "#E69F00", literal: "#FFFFFF" },
        edgeColors: { default: "#654321" }
      }
    });
  });

  it("projects SPARQL rows in query order and omits rows without the mapped IRI", () => {
    const attrs = graphExplorerAttrs({
      sourceMode: "sparql",
      result: {
        status: "success",
        endpointUrl: "https://example.org/sparql",
        executedAt: "2026-08-16T00:00:00Z",
        durationMs: 1,
        variables: ["resource", "label"],
        rows: [
          {
            resource: { type: "uri", value: "https://example.org/a" },
            label: { type: "literal", value: "A" }
          },
          { label: { type: "literal", value: "Missing resource" } },
          { resource: { type: "uri", value: "https://example.org/b" } }
        ]
      }
    });

    expect(buildGraphExplorerSpec(attrs)).toMatchObject({
      items: [
        { iri: "https://example.org/a", label: "A" },
        { iri: "https://example.org/b" }
      ]
    });
  });

  it("uses controlled fallback colors when no configured scheme exists", () => {
    expect(resolveGraphExplorerColors("missing", {})).toEqual({
      nodeColors: { iri: "#0072B2", blank: "#E69F00", literal: "#FFFFFF" },
      edgeColors: { default: "#666666" }
    });
  });
});
