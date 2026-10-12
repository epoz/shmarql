/** Constructs the TipTap story editor and its extension lifecycle. */

import { Editor, type JSONContent } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { SparqlNode } from "../nodes/sparql/node-view";
import type { SparnaturalBuilderInput, SparnaturalBuilderOutput } from "../nodes/sparnatural/contracts";
import { SparnaturalNode } from "../nodes/sparnatural/node-view";
import { VisualizationNode } from "../nodes/visualization/node-view";
import { RawGraphsNode } from "../nodes/rawgraphs/node-view";
import { EmbedNode } from "../nodes/embed/node-view";
import { IiifNode } from "../nodes/iiif/node-view";
import { GraphExplorerNode } from "../nodes/graph-explorer/node-view";
import { LeafletNode } from "../nodes/leaflet/node-view";
import { VerovioNode } from "../nodes/verovio/node-view";
import { MediaAssetNode } from "../nodes/media-asset/node-view";
import { StoryMetadataNode } from "../nodes/story-metadata/node-view";
import { setSpecialNodeLocalization } from "../nodes/shared/node-view-controls";
import {
  SemanticBlockFormat,
  SemanticInlineFormat,
  type SemanticFormatLabels
} from "../extensions/semantic-format";
import { SemanticContainer, registerCoreSemanticContainerViews } from "../extensions/semantic-container";
import type {
  SemanticContainerConfig,
  SemanticContainerLabels
} from "../extensions/semantic-container-contract";
import { createEditorExtensionRegistry, type EditorExtensionRegistry } from "../registry/editor";
import type { LodeonAsset, LodeonAssetBlob, LodeonAssetMetadataFieldValue } from "../assets/contracts";
import type { LodeonConfig } from "../configuration/schema";
import type { LodeonLocalization } from "../localization/runtime";
import type { PlotlyDefaults } from "../nodes/visualization/renderer";

type RichTextOptions = LodeonConfig["editor"]["richText"];
type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number] & {
  graphExplorer?: LodeonConfig["nodes"]["graphExplorer"]["profiles"][string];
};

export type StoryEditorOptions = {
  onUpdate?: (document: JSONContent) => void;
  knowledgeGraph?: LodeonConfig["knowledgeGraph"];
  errors?: LodeonConfig["errors"];
  embeds?: LodeonConfig["nodes"]["embed"];
  iiif?: LodeonConfig["nodes"]["iiif"];
  leaflet?: LodeonConfig["nodes"]["leaflet"];
  verovio?: LodeonConfig["nodes"]["verovio"];
  graphExplorerProfiles?: LodeonConfig["nodes"]["graphExplorer"]["profiles"];
  plotlyDefaults?: PlotlyDefaults;
  sparnaturalConfigId?: string;
  knowledgeGraphProfileId?: string;
  resolveAsset?: (assetId: string) => LodeonAsset | undefined;
  loadAssetBlob?: (assetId: string) => Promise<LodeonAssetBlob | null>;
  updateAsset?: (assetId: string, key: string, value: LodeonAssetMetadataFieldValue | undefined) => void;
  openSparnaturalBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
  richText?: RichTextOptions;
  localization?: LodeonLocalization;
  editorRegistry?: EditorExtensionRegistry;
};

export function createStoryEditorRegistry(): EditorExtensionRegistry {
  const editorRegistry = createEditorExtensionRegistry();

  registerCoreSemanticContainerViews(editorRegistry);

  return editorRegistry;
}

export function mountStoryEditor(
  element: HTMLElement,
  content: JSONContent,
  options: StoryEditorOptions = {}
): Editor {
  const resolveKnowledgeGraphProfile = createKnowledgeGraphProfileResolver(
    options.knowledgeGraph,
    options.localization,
    options.graphExplorerProfiles
  );
  const defaultKnowledgeGraphProfileId =
    options.knowledgeGraphProfileId ??
    options.knowledgeGraph?.defaultProfile ??
    options.knowledgeGraph?.profiles[0]?.id;
  const defaultSparnaturalConfigId = options.sparnaturalConfigId ?? "";
  const semanticFormatLabels = resolveSemanticFormatLabels(options.richText, options.localization);
  const semanticContainerLabels = resolveSemanticContainerLabels(options.richText, options.localization);
  const editorRegistry = options.editorRegistry ?? createStoryEditorRegistry();
  setSpecialNodeLocalization(options.localization);

  return new Editor({
    element,
    extensions: [
      StarterKit.configure({
        link: false,
        trailingNode: false,
        underline: false
      }),
      Underline,
      SemanticBlockFormat.configure({
        labels: semanticFormatLabels
      }),
      SemanticInlineFormat.configure({
        labels: semanticFormatLabels
      }),
      SemanticContainer.configure({
        labels: semanticContainerLabels,
        containers: resolveSemanticContainers(options.richText, options.localization),
        editorRegistry
      }),
      Image.configure({
        allowBase64: false
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer nofollow"
        }
      }),
      Table.configure({
        resizable: true
      }),
      TableRow,
      TableHeader,
      TableCell,
      SparqlNode.configure({
        defaultKnowledgeGraphProfileId: defaultKnowledgeGraphProfileId ?? "",
        resolveKnowledgeGraphProfile,
        errors: options.errors
      }),
      SparnaturalNode.configure({
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId: defaultKnowledgeGraphProfileId ?? "",
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors
      }),
      VisualizationNode.configure({
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId,
        resolveKnowledgeGraphProfile,
        plotlyDefaults: options.plotlyDefaults,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors
      }),
      MediaAssetNode.configure({
        resolveAsset: options.resolveAsset ?? (() => undefined),
        loadAssetBlob: options.loadAssetBlob ?? (() => Promise.resolve(null)),
        updateAsset: options.updateAsset ?? (() => undefined)
      }),
      EmbedNode.configure({
        embeds: options.embeds,
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId,
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors
      }),
      IiifNode.configure({
        ...(options.iiif ? { iiif: options.iiif } : {}),
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId,
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors
      }),
      GraphExplorerNode.configure({
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId: defaultKnowledgeGraphProfileId ?? "",
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        plotlyDefaults: options.plotlyDefaults,
        errors: options.errors
      }),
      LeafletNode.configure({
        ...(options.leaflet ? { leaflet: options.leaflet } : {}),
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId,
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors
      }),
      VerovioNode.configure({
        ...(options.verovio ? { verovio: options.verovio } : {}),
        defaultConfigId: defaultSparnaturalConfigId,
        defaultKnowledgeGraphProfileId,
        resolveKnowledgeGraphProfile,
        openBuilder: options.openSparnaturalBuilder,
        errors: options.errors,
        i18n: options.localization
      }),
      StoryMetadataNode,
      RawGraphsNode.configure({
        errors: options.errors
      }),
      ...editorRegistry.getTipTapExtensions()
    ],
    content,
    onUpdate: ({ editor }) => {
      options.onUpdate?.(editor.getJSON());
    },
    editorProps: {
      attributes: {
        class: "story-editor",
        "aria-label": options.localization?.t("editor", "storyEditor.aria") ?? "editor:storyEditor.aria"
      }
    }
  });
}

function resolveSemanticContainerLabels(
  richText: RichTextOptions | undefined,
  localization: LodeonLocalization | undefined
): SemanticContainerLabels {
  const containers = richText?.resolved?.containers ?? {};

  return Object.fromEntries(
    Object.entries(containers).map(([containerId, container]) => [
      containerId,
      localization?.t("editor", container.labelKey) ?? container.labelKey
    ])
  );
}

function resolveSemanticContainers(
  richText: RichTextOptions | undefined,
  localization: LodeonLocalization | undefined
): Record<string, SemanticContainerConfig> {
  const containers = richText?.resolved?.containers ?? {};

  return Object.fromEntries(
    Object.entries(containers).map(([containerId, container]) => [
      containerId,
      {
        label: localization?.t("editor", container.labelKey) ?? container.labelKey,
        editorDisplay: { component: container.editorComponent },
        ui: {
          optionLabel: localization?.t("editor", container.labelKey) ?? container.labelKey,
          fields: Object.entries(container.fields ?? {}).map(([id, field]) => ({
            id,
            label: localization?.t("editor", field.labelKey) ?? field.labelKey,
            type: typeof field.default === "boolean" ? "boolean" : "text",
            default: field.default
          }))
        }
      }
    ])
  );
}

function resolveSemanticFormatLabels(
  richText: RichTextOptions | undefined,
  localization: LodeonLocalization | undefined
): SemanticFormatLabels {
  const formats = richText?.resolved?.formats ?? {};

  return Object.fromEntries(
    Object.entries(formats).map(([formatId, format]) => [
      formatId,
      localization?.t("editor", format.labelKey) ?? format.labelKey
    ])
  );
}

function createKnowledgeGraphProfileResolver(
  knowledgeGraph: LodeonConfig["knowledgeGraph"] | undefined,
  localization: LodeonLocalization | undefined,
  graphExplorerProfiles: LodeonConfig["nodes"]["graphExplorer"]["profiles"] = {}
): (profileId?: string) => KnowledgeGraphProfile {
  return (profileId?: string) => {
    if (profileId && !knowledgeGraph?.profiles.some((entry) => entry.id === profileId)) {
      return {
        id: profileId,
        label:
          localization?.t("special-nodes", "status.missingKnowledgeGraphProfile", {
            profileId
          }) ?? profileId,
        sparqlUrl: `/api/sparql/${encodeURIComponent(profileId)}`
      };
    }

    const profile =
      knowledgeGraph?.profiles.find((entry) => entry.id === profileId) ??
      knowledgeGraph?.profiles.find((entry) => entry.active) ??
      knowledgeGraph?.profiles[0];

    return {
      id: profile?.id ?? "",
      label: profile?.label ?? localization?.t("special-nodes", "aria.knowledgeGraph") ?? "",
      description: profile?.description,
      active: profile?.active,
      sparqlUrl: profile?.sparqlUrl ?? "",
      graphExplorer: profile ? graphExplorerProfiles[profile.id] : undefined
    };
  };
}
