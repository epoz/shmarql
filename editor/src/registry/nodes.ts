/** Registers Special Node definitions and insertion factories. */

import type { JSONContent } from "@tiptap/core";
import type { LodeonConfig } from "../configuration/schema";
import { createEmbedNodeContent } from "../nodes/embed/node-view";
import { createGraphExplorerNodeContent } from "../nodes/graph-explorer/node-view";
import { createIiifNodeContent } from "../nodes/iiif/node-view";
import { createLeafletNodeContent } from "../nodes/leaflet/node-view";
import { createRawGraphsNodeContent } from "../nodes/rawgraphs/node-view";
import { createSparnaturalNodeContent } from "../nodes/sparnatural/factory";
import { createSparqlNodeContent } from "../nodes/sparql/node-view";
import { createStoryMetadataNodeContent } from "../nodes/story-metadata/node-view";
import { createVisualizationNodeContent } from "../nodes/visualization/node-view";
import { createVerovioNodeContent } from "../nodes/verovio/node-view";
import { normalizeGeoJson } from "../nodes/leaflet/normalization";

type GraphExplorerConfig = LodeonConfig["nodes"]["graphExplorer"]["profiles"][string];

export type SpecialNodeGroup = "content" | "query" | "visualization" | "embed";
export type SpecialNodeKnowledgeGraphUsage = "required" | "mode-dependent" | "none";

export type SpecialNodeInsertContext = {
  config: LodeonConfig;
  knowledgeGraphProfileId?: string;
  sparnaturalConfigId?: string;
  graphExplorerConfig?: GraphExplorerConfig;
};

export type SpecialNodeDefinition = {
  id: string;
  proseMirrorType?: string;
  labelKey: string;
  group: SpecialNodeGroup;
  knowledgeGraphUsage: SpecialNodeKnowledgeGraphUsage;
  descriptionKey: string;
  insertable?: boolean;
  createContent?: (context: SpecialNodeInsertContext, attrs?: Record<string, unknown>) => JSONContent;
  isAvailable?: (config: LodeonConfig) => boolean;
};

export type RegisterSpecialNodeOptions = {
  override?: boolean;
};

export class SpecialNodeRegistry {
  private readonly nodes = new Map<string, SpecialNodeDefinition>();

  register(node: SpecialNodeDefinition, options: RegisterSpecialNodeOptions = {}): void {
    if (this.nodes.has(node.id) && options.override !== true) {
      throw new Error("editor.registry.special_node_duplicate");
    }

    this.nodes.set(node.id, node);
  }

  get(id: string): SpecialNodeDefinition | undefined {
    return this.nodes.get(id);
  }

  getByProseMirrorType(type: string): SpecialNodeDefinition | undefined {
    return this.values().find((node) => node.proseMirrorType === type);
  }

  values(): SpecialNodeDefinition[] {
    return [...this.nodes.values()];
  }
}

export function isSpecialNodeInsertable(node: SpecialNodeDefinition, config: LodeonConfig): boolean {
  const configId = node.id === "visualization" ? "plotly" : node.id === "rawgraphs" ? "rawGraphs" : node.id;
  const nodeConfig = config.nodes[configId as keyof LodeonConfig["nodes"]];
  return (
    nodeConfig?.enabled === true &&
    node.insertable !== false &&
    (node.knowledgeGraphUsage !== "required" || config.knowledgeGraph.profiles.length > 0) &&
    (node.isAvailable?.(config) ?? true)
  );
}

export function createSpecialNodeRegistry(): SpecialNodeRegistry {
  const registry = new SpecialNodeRegistry();

  coreSpecialNodes.forEach((node) => registry.register(node));

  return registry;
}

const coreSpecialNodes: SpecialNodeDefinition[] = [
  {
    id: "richText",
    labelKey: "registry.richText.label",
    group: "content",
    knowledgeGraphUsage: "none",
    descriptionKey: "registry.richText.description",
    insertable: false
  },
  {
    id: "mediaAsset",
    proseMirrorType: "mediaAssetNode",
    labelKey: "registry.mediaAsset.label",
    group: "content",
    knowledgeGraphUsage: "none",
    descriptionKey: "registry.mediaAsset.description"
  },
  {
    id: "embed",
    proseMirrorType: "embedNode",
    labelKey: "registry.embed.label",
    group: "embed",
    knowledgeGraphUsage: "mode-dependent",
    descriptionKey: "registry.embed.description",
    isAvailable: (config) => config.nodes.embed.enabled,
    createContent: ({ config, knowledgeGraphProfileId }, attrs = {}) =>
      createEmbedNodeContent(
        { ...attrs, ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}) },
        config.nodes.embed,
        knowledgeGraphProfileId
      )
  },
  {
    id: "iiif",
    proseMirrorType: "iiifNode",
    labelKey: "registry.iiif.label",
    group: "embed",
    knowledgeGraphUsage: "mode-dependent",
    descriptionKey: "registry.iiif.description",
    isAvailable: (config) => config.nodes.iiif.enabled,
    createContent: ({ config, knowledgeGraphProfileId }, attrs = {}) =>
      createIiifNodeContent(
        { ...attrs, ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}) },
        config.nodes.iiif,
        knowledgeGraphProfileId
      )
  },
  {
    id: "graphExplorer",
    proseMirrorType: "graphExplorerNode",
    labelKey: "registry.graphExplorer.label",
    group: "query",
    knowledgeGraphUsage: "required",
    descriptionKey: "registry.graphExplorer.description",
    createContent: ({ knowledgeGraphProfileId, graphExplorerConfig }, attrs = {}) =>
      createGraphExplorerNodeContent(
        { ...attrs, knowledgeGraphProfileId },
        knowledgeGraphProfileId,
        graphExplorerConfig
      )
  },
  {
    id: "leaflet",
    proseMirrorType: "leafletNode",
    labelKey: "registry.leaflet.label",
    group: "visualization",
    knowledgeGraphUsage: "mode-dependent",
    descriptionKey: "registry.leaflet.description",
    createContent: ({ config, knowledgeGraphProfileId }, attrs = {}) => {
      const featureCollection = normalizeGeoJson(
        attrs.featureCollection ?? { type: "FeatureCollection", features: [] }
      ).featureCollection;
      return createLeafletNodeContent(
        {
          ...attrs,
          featureCollection,
          viewConfig: undefined,
          ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {})
        },
        config.nodes.leaflet,
        knowledgeGraphProfileId
      );
    }
  },
  {
    id: "verovio",
    proseMirrorType: "verovioNode",
    labelKey: "registry.verovio.label",
    group: "visualization",
    knowledgeGraphUsage: "mode-dependent",
    descriptionKey: "registry.verovio.description",
    createContent: ({ config, knowledgeGraphProfileId }, attrs = {}) =>
      createVerovioNodeContent(
        {
          ...attrs,
          viewConfig: undefined,
          ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {})
        },
        config.nodes.verovio,
        knowledgeGraphProfileId
      )
  },
  {
    id: "sparqlSource",
    proseMirrorType: "sparqlNode",
    labelKey: "registry.sparql.label",
    group: "query",
    knowledgeGraphUsage: "required",
    descriptionKey: "registry.sparql.description",
    insertable: false,
    createContent: ({ knowledgeGraphProfileId }, attrs = {}) =>
      createSparqlNodeContent({
        ...attrs,
        ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {})
      })
  },
  {
    id: "sparql",
    proseMirrorType: "sparnaturalNode",
    labelKey: "registry.sparnatural.label",
    group: "query",
    knowledgeGraphUsage: "required",
    descriptionKey: "registry.sparnatural.description",
    createContent: ({ sparnaturalConfigId, knowledgeGraphProfileId }, attrs = {}) =>
      createSparnaturalNodeContent({
        ...attrs,
        configId: sparnaturalConfigId!,
        knowledgeGraphProfileId: knowledgeGraphProfileId!
      })
  },
  {
    id: "visualization",
    proseMirrorType: "visualizationNode",
    labelKey: "registry.visualization.label",
    group: "visualization",
    knowledgeGraphUsage: "mode-dependent",
    descriptionKey: "registry.visualization.description",
    createContent: ({ knowledgeGraphProfileId }, attrs = {}) =>
      createVisualizationNodeContent({
        ...attrs,
        ...(!knowledgeGraphProfileId && attrs.sourceMode === undefined ? { sourceMode: "csv" } : {}),
        ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {})
      })
  },
  {
    id: "rawgraphs",
    proseMirrorType: "rawgraphsNode",
    labelKey: "registry.rawgraphs.label",
    group: "visualization",
    knowledgeGraphUsage: "none",
    descriptionKey: "registry.rawgraphs.description",
    createContent: (_context, attrs = {}) => createRawGraphsNodeContent(attrs)
  },
  {
    id: "storyMetadata",
    proseMirrorType: "storyMetadataNode",
    labelKey: "registry.storyMetadata.label",
    group: "content",
    knowledgeGraphUsage: "none",
    descriptionKey: "registry.storyMetadata.description",
    createContent: (_context, attrs = {}) => createStoryMetadataNodeContent(attrs)
  }
];
