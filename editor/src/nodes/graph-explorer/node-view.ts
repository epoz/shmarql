/** Owns the Graph Explorer Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, WandSparkles } from "lucide";
import type { LodeonConfig } from "../../configuration/schema";
import { expandGraphExplorer } from "./api-client";
import {
  renderGraphExplorerViewer,
  type GraphExplorerGraphData,
  type GraphExplorerGraphNode,
  type GraphExplorerViewer
} from "./viewer";
import { renderConfiguredError } from "../../errors/client-error";
import { renderIcon } from "../../ui/icons";
import { executeSparqlQuery } from "../sparql/api-client";
import {
  createSpecialNodeHeader,
  createSpecialNodeField,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText,
  updateSpecialNodeFieldKnowledgeGraphProfile
} from "../shared/node-view-controls";
import { createNodeId } from "../shared/node-id";
import { renderSparqlResult } from "../sparql/result-view";
import { createSparqlSourceEditor } from "../sparql/source-editor";
import type { SparnaturalBuilderInput, SparnaturalBuilderOutput } from "../sparnatural/contracts";
import type { PlotlyDefaults } from "../visualization/renderer";
import type {
  GraphExplorerColorScheme,
  GraphExplorerDirection,
  GraphExplorerNodeAttrs,
  GraphExplorerSourceMode
} from "./contracts";
import {
  buildGraphExplorerSpec,
  defaultGraphExplorerColors,
  firstGraphExplorerColorSchemeId,
  getGraphExplorerSpecItems,
  resolveGraphExplorerColors
} from "./spec";

export const GRAPH_EXPLORER_NODE_TYPE_NAME = "graphExplorerNode";

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number] & {
  graphExplorer?: LodeonConfig["nodes"]["graphExplorer"]["profiles"][string];
};

export type GraphExplorerNodeOptions = {
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
  plotlyDefaults?: PlotlyDefaults;
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};

/** Creates canonical Graph Explorer node JSON with profile-bound normalized attributes. */
export function createGraphExplorerNodeContent(
  attrs: Partial<GraphExplorerNodeAttrs> = {},
  defaultKnowledgeGraphProfileId = "",
  graphExplorerDefaults?: KnowledgeGraphProfile["graphExplorer"]
): JSONContent {
  return {
    type: GRAPH_EXPLORER_NODE_TYPE_NAME,
    attrs: normalizeGraphExplorerNodeAttrs(attrs, defaultKnowledgeGraphProfileId, graphExplorerDefaults)
  };
}

/** Normalizes persisted Graph Explorer settings without exposing endpoint configuration. */
export function normalizeGraphExplorerNodeAttrs(
  attrs: Partial<GraphExplorerNodeAttrs> = {},
  defaultKnowledgeGraphProfileId = "",
  graphExplorerDefaults?: KnowledgeGraphProfile["graphExplorer"]
): GraphExplorerNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.graphExplorer.label");
  const resolvedAttrs: GraphExplorerNodeAttrs = {
    id: attrs.id ?? createNodeId("graph-explorer"),
    kind: "graphExplorer",
    title: attrs.title ?? defaultTitle,
    sourceMode: attrs.sourceMode ?? "iri",
    iris: attrs.iris ?? [],
    query: attrs.query ?? "",
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId ?? defaultKnowledgeGraphProfileId,
    resultMapping: attrs.resultMapping ?? {
      iri: "resource",
      label: "label"
    },
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    selectedIndex: attrs.selectedIndex ?? 0,
    direction: attrs.direction ?? graphExplorerDefaults?.defaultDirection ?? "both",
    depth: attrs.depth ?? graphExplorerDefaults?.defaultDepth ?? 1,
    maxNodes: attrs.maxNodes ?? graphExplorerDefaults?.maxNodes ?? 100,
    maxEdgesPerNode: attrs.maxEdgesPerNode ?? graphExplorerDefaults?.maxEdgesPerNode ?? 50,
    showPredicateLabels: attrs.showPredicateLabels ?? graphExplorerDefaults?.showPredicateLabels ?? true,
    showLiterals: attrs.showLiterals ?? graphExplorerDefaults?.includeLiterals ?? true,
    showTypes: attrs.showTypes ?? graphExplorerDefaults?.showTypes ?? true,
    includeBlankNodes: attrs.includeBlankNodes ?? graphExplorerDefaults?.includeBlankNodes ?? true,
    colorScheme:
      attrs.colorScheme ??
      graphExplorerDefaults?.defaultColorScheme ??
      firstGraphExplorerColorSchemeId(graphExplorerDefaults?.colorSchemes),
    height: attrs.height ?? 520,
    caption: attrs.caption ?? "",
    graphData: attrs.graphData ?? null,
    viewConfig: {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };

  resolvedAttrs.viewConfig =
    attrs.viewConfig ?? buildGraphExplorerSpec(resolvedAttrs, graphExplorerDefaults?.colorSchemes);

  return resolvedAttrs;
}

/** Owns the profile-mediated graph viewer, stale expansion guards, event isolation, and viewer destruction. */
export const GraphExplorerNode = Node.create<GraphExplorerNodeOptions>({
  name: GRAPH_EXPLORER_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      defaultConfigId: "",
      defaultKnowledgeGraphProfileId: "",
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: translateSpecialNodeText("aria.knowledgeGraph"),
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery,
      openBuilder: undefined
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "graphExplorer" },
      title: { default: translateSpecialNodeText("registry.graphExplorer.label") },
      sourceMode: { default: "iri" },
      iris: { default: [] },
      query: { default: "" },
      knowledgeGraphProfileId: { default: this.options.defaultKnowledgeGraphProfileId },
      resultMapping: { default: { iri: "resource", label: "label" } },
      result: { default: null },
      resultPageSize: { default: 10 },
      selectedIndex: { default: 0 },
      direction: { default: "both" },
      depth: { default: 1 },
      maxNodes: { default: 100 },
      maxEdgesPerNode: { default: 50 },
      showPredicateLabels: { default: true },
      showLiterals: { default: true },
      showTypes: { default: true },
      includeBlankNodes: { default: true },
      colorScheme: { default: "" },
      height: { default: 520 },
      caption: { default: "" },
      graphData: { default: null },
      viewConfig: { default: {} },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='graph-explorer']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "graph-explorer",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeGraphExplorerNodeAttrs(
        node.attrs,
        this.options.defaultKnowledgeGraphProfileId
      );
      let viewer: GraphExplorerViewer | null = null;
      let suppressNextNodeUpdateRender = false;
      const pendingExpansionIris = new Set<string>();
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const editButton = markNodeViewControl(document.createElement("button"));
      const runButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const controls = document.createElement("div");
      const sourceControls = document.createElement("div");
      const sourceModeSelect = markNodeViewControl(document.createElement("select"));
      const iriInput = markNodeViewControl(document.createElement("textarea"));
      const queryEditor = createSparqlSourceEditor({
        value: currentAttrs.query ?? "",
        className: "ld-graph-explorer-sparql-source-editor",
        ariaLabel: translateSpecialNodeText("aria.graphExplorerSparqlQuery"),
        placeholder: translateSpecialNodeText("placeholders.graphExplorerSparqlQuery")
      });
      const iriMappingInput = markNodeViewControl(document.createElement("input"));
      const labelMappingInput = markNodeViewControl(document.createElement("input"));
      const captionInput = markNodeViewControl(document.createElement("input"));
      const directionSelect = markNodeViewControl(document.createElement("select"));
      const colorSchemeSelect = markNodeViewControl(document.createElement("select"));
      const depthInput = markNodeViewControl(document.createElement("input"));
      const maxNodesInput = markNodeViewControl(document.createElement("input"));
      const maxEdgesInput = markNodeViewControl(document.createElement("input"));
      const heightInput = markNodeViewControl(document.createElement("input"));
      const predicateLabelsInput = markNodeViewControl(document.createElement("input"));
      const literalsInput = markNodeViewControl(document.createElement("input"));
      const typesInput = markNodeViewControl(document.createElement("input"));
      const blankNodesInput = markNodeViewControl(document.createElement("input"));
      const preview = markNodeViewControl(document.createElement("div"));
      const footer = document.createElement("div");
      const resultFooter = document.createElement("div");
      const resultContainer = document.createElement("div");

      container.className = "ld-node ld-graph-explorer-node";
      container.dataset.lodeonNode = "graph-explorer";
      container.dataset.nodeId = String(node.attrs.id);
      container.setAttribute("contenteditable", "false");

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.graphExplorer.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.graphExplorer.titleAria"));

      editButton.className = "ld-node-run-button";
      editButton.type = "button";
      editButton.innerHTML = `${renderIcon(WandSparkles)}<span>${translateSpecialNodeText(
        "actions.visualQueryBuilder"
      )}</span>`;
      editButton.setAttribute("aria-label", translateSpecialNodeText("actions.openVisualQueryBuilder"));

      runButton.className = "ld-node-run-button";
      runButton.type = "button";
      runButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.load")}</span>`;
      runButton.setAttribute("aria-label", translateSpecialNodeText("actions.runGraphExplorerQuery"));

      body.className = "ld-node-body";
      controls.className = "ld-graph-explorer-controls";
      sourceControls.className = "ld-graph-explorer-source-controls";
      preview.className = "ld-graph-explorer-preview";
      footer.className = "ld-node-footer";
      resultFooter.className = "ld-node-footer ld-graph-explorer-result-footer";
      resultContainer.className = "ld-sparql-result ld-graph-explorer-result";

      sourceModeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerSourceMode"));
      [
        ["iri", translateSpecialNodeText("options.sourceMode.iri")],
        ["sparql", translateSpecialNodeText("options.sourceMode.sparql")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        sourceModeSelect.append(option);
      });

      [
        ["both", translateSpecialNodeText("options.graphDirection.both")],
        ["outgoing", translateSpecialNodeText("options.graphDirection.outgoing")],
        ["incoming", translateSpecialNodeText("options.graphDirection.incoming")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        directionSelect.append(option);
      });
      directionSelect.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerDirection"));
      colorSchemeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerColorScheme"));

      iriInput.rows = 3;
      iriInput.placeholder = translateSpecialNodeText("placeholders.graphExplorerIris");
      iriInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerIris"));

      iriMappingInput.type = "text";
      iriMappingInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerIriVariable"));
      labelMappingInput.type = "text";
      labelMappingInput.setAttribute(
        "aria-label",
        translateSpecialNodeText("aria.graphExplorerLabelVariable")
      );

      captionInput.type = "text";
      captionInput.placeholder = translateSpecialNodeText("placeholders.optionalCaption");
      captionInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerCaption"));

      [depthInput, maxNodesInput, maxEdgesInput, heightInput].forEach((input) => {
        input.type = "number";
        input.step = "1";
      });
      depthInput.min = "1";
      depthInput.max = "5";
      maxNodesInput.min = "1";
      maxNodesInput.max = "500";
      maxEdgesInput.min = "1";
      maxEdgesInput.max = "500";
      heightInput.min = "160";
      heightInput.max = "1600";
      heightInput.step = "10";
      depthInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerDepth"));
      maxNodesInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerMaxNodes"));
      maxEdgesInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerMaxEdges"));
      heightInput.setAttribute("aria-label", translateSpecialNodeText("aria.graphExplorerHeight"));

      const checkboxControls: Array<[HTMLInputElement, string]> = [
        [predicateLabelsInput, "aria.graphExplorerShowPredicateLabels"],
        [literalsInput, "aria.graphExplorerShowLiterals"],
        [typesInput, "aria.graphExplorerShowTypes"],
        [blankNodesInput, "aria.graphExplorerIncludeBlankNodes"]
      ];

      checkboxControls.forEach(([input, labelKey]) => {
        input.type = "checkbox";
        input.setAttribute("aria-label", translateSpecialNodeText(labelKey));
      });

      controls.append(
        createField(translateSpecialNodeText("fields.source"), sourceModeSelect),
        createField(translateSpecialNodeText("fields.caption"), captionInput),
        createField(translateSpecialNodeText("fields.direction"), directionSelect),
        createField(translateSpecialNodeText("fields.colorScheme"), colorSchemeSelect),
        createField(translateSpecialNodeText("fields.depth"), depthInput),
        createField(translateSpecialNodeText("fields.maxNodes"), maxNodesInput),
        createField(translateSpecialNodeText("fields.maxEdges"), maxEdgesInput),
        createField(translateSpecialNodeText("fields.height"), heightInput),
        createField(translateSpecialNodeText("fields.predicateLabels"), predicateLabelsInput),
        createField(translateSpecialNodeText("fields.literals"), literalsInput),
        createField(translateSpecialNodeText("fields.types"), typesInput),
        createField(translateSpecialNodeText("fields.blankNodes"), blankNodesInput)
      );
      const queryField = createField(
        translateSpecialNodeText("fields.sparqlQuery"),
        queryEditor.element,
        "sparql",
        this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
      );
      sourceControls.append(
        createField(translateSpecialNodeText("fields.iris"), iriInput, "iri"),
        queryField,
        createField(translateSpecialNodeText("fields.iriVariable"), iriMappingInput, "sparql"),
        createField(translateSpecialNodeText("fields.labelVariable"), labelMappingInput, "sparql")
      );
      body.append(controls, sourceControls, preview, footer, resultFooter, resultContainer);

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "graph-explorer",
        labelKey: "nodes.graphExplorer.headerLabel",
        eyebrow: "graph",
        eyebrowKey: "nodes.graphExplorer.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        collapsed: Boolean(currentAttrs.collapsed),
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [editButton, runButton]
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      container.append(header, body);

      const updateAttrs = (attrs: Partial<GraphExplorerNodeAttrs>, options: { render?: boolean } = {}) => {
        if (typeof getPos !== "function" || typeof getPos() !== "number") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs,
          viewConfig: buildGraphExplorerSpec(
            {
              ...currentAttrs,
              ...attrs
            },
            resolveCurrentGraphExplorerColorSchemes()
          )
        };
        if (options.render === false) {
          suppressNextNodeUpdateRender = true;
        }
        dispatchNodeAttrs(editor, getPos, currentAttrs);
        if (options.render !== false) {
          renderState();
        }
      };

      const destroyViewer = () => {
        if (!viewer) {
          return;
        }

        viewer.destroy();
        viewer = null;
      };

      const loadGraph = async (items: Array<{ iri: string; label?: string }>, mergeWithExisting: boolean) => {
        const iris = items.map((item) => item.iri).filter(Boolean);

        if (!iris.length) {
          renderMessage(preview, translateSpecialNodeText("status.graphExplorerIriHint"));
          return;
        }

        const profile = this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId);

        const hasInteractiveViewer = Boolean(viewer && mergeWithExisting);
        const duplicateExpansion = mergeWithExisting && iris.some((iri) => pendingExpansionIris.has(iri));

        if (duplicateExpansion) {
          return;
        }

        runButton.disabled = true;
        if (mergeWithExisting) {
          iris.forEach((iri) => pendingExpansionIris.add(iri));
          const loadingGraph = markGraphExplorerNodesLoading(
            viewer?.getGraphData() ?? currentAttrs.graphData,
            iris,
            true
          );
          if (viewer && loadingGraph) {
            viewer.update(loadingGraph);
          }
        }
        if (!hasInteractiveViewer) {
          destroyViewer();
          preview.innerHTML = "";
          renderMessage(preview, translateSpecialNodeText("status.loadingGraphExplorer"));
        }
        footer.textContent = translateSpecialNodeText("status.graphExplorerLoadingFooter");

        try {
          const graph = await expandGraphExplorer(
            profile,
            {
              iris,
              direction: currentAttrs.direction,
              depth: currentAttrs.depth,
              maxNodes: currentAttrs.maxNodes,
              maxEdgesPerNode: currentAttrs.maxEdgesPerNode,
              includeLiterals: currentAttrs.showLiterals,
              includeBlankNodes: currentAttrs.includeBlankNodes
            },
            fetch
          );
          const nextGraph = mergeWithExisting
            ? mergeGraphExplorerData(viewer?.getGraphData() ?? currentAttrs.graphData, graph)
            : graph;
          const stableGraph = markGraphExplorerNodesLoading(nextGraph, iris, false) ?? nextGraph;

          if (viewer && mergeWithExisting) {
            currentAttrs = {
              ...currentAttrs,
              graphData: stableGraph,
              viewConfig: buildGraphExplorerSpec(
                {
                  ...currentAttrs,
                  graphData: stableGraph
                },
                resolveCurrentGraphExplorerColorSchemes()
              )
            };
            suppressNextNodeUpdateRender = true;
            dispatchNodeAttrs(editor, getPos, currentAttrs);
            viewer.update(stableGraph);
            footer.textContent = translateSpecialNodeText("status.graphExplorerGraphFooter", {
              nodes: stableGraph.nodes.length,
              edges: stableGraph.edges.length
            });
          } else {
            updateAttrs({ graphData: stableGraph });
          }
        } catch (error) {
          const errorMessage = renderConfiguredError(
            { errors: this.options.errors },
            error,
            "graph_explorer.request_invalid"
          );
          if (viewer && mergeWithExisting) {
            const stableGraph = markGraphExplorerNodesLoading(viewer.getGraphData(), iris, false);
            if (stableGraph) {
              viewer.update(stableGraph);
            }
            footer.textContent = errorMessage;
          } else {
            destroyViewer();
            preview.innerHTML = "";
            renderMessage(preview, errorMessage, true);
          }
        } finally {
          iris.forEach((iri) => pendingExpansionIris.delete(iri));
          runButton.disabled = false;
        }
      };

      const resolveCurrentGraphExplorerColorSchemes = () =>
        this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId).graphExplorer
          ?.colorSchemes ?? {};

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });
      sourceModeSelect.addEventListener("change", () => {
        updateAttrs({
          sourceMode: sourceModeSelect.value as GraphExplorerSourceMode,
          result: null,
          selectedIndex: 0,
          graphData: null
        });
      });
      iriInput.addEventListener("input", () => {
        updateAttrs({ iris: parseDirectIris(iriInput.value), graphData: null });
      });
      queryEditor.onChange((value) => {
        updateAttrs({
          query: value,
          result: null,
          selectedIndex: 0,
          graphData: null
        });
      });
      iriMappingInput.addEventListener("input", () => {
        updateAttrs({
          resultMapping: {
            ...currentAttrs.resultMapping,
            iri: iriMappingInput.value.trim() || "resource"
          },
          selectedIndex: 0,
          graphData: null
        });
      });
      labelMappingInput.addEventListener("input", () => {
        updateAttrs({
          resultMapping: {
            ...currentAttrs.resultMapping,
            label: labelMappingInput.value.trim() || "label"
          },
          graphData: null
        });
      });
      captionInput.addEventListener("input", () => {
        updateAttrs({ caption: captionInput.value });
      });
      directionSelect.addEventListener("change", () => {
        updateAttrs({
          direction: directionSelect.value as GraphExplorerDirection,
          graphData: null
        });
      });
      colorSchemeSelect.addEventListener("change", () => {
        updateAttrs({ colorScheme: colorSchemeSelect.value });
      });
      depthInput.addEventListener("input", () => {
        updateAttrs({ depth: parseGraphNumber(depthInput.value, 1, 5, 1) });
      });
      maxNodesInput.addEventListener("input", () => {
        updateAttrs({ maxNodes: parseGraphNumber(maxNodesInput.value, 1, 500, 100) });
      });
      maxEdgesInput.addEventListener("input", () => {
        updateAttrs({
          maxEdgesPerNode: parseGraphNumber(maxEdgesInput.value, 1, 500, 50)
        });
      });
      heightInput.addEventListener("input", () => {
        updateAttrs({ height: parseGraphNumber(heightInput.value, 160, 1600, 520) });
      });
      predicateLabelsInput.addEventListener("change", () => {
        updateAttrs({ showPredicateLabels: predicateLabelsInput.checked });
      });
      literalsInput.addEventListener("change", () => {
        updateAttrs({ showLiterals: literalsInput.checked });
      });
      typesInput.addEventListener("change", () => {
        updateAttrs({ showTypes: typesInput.checked });
      });
      blankNodesInput.addEventListener("change", () => {
        updateAttrs({ includeBlankNodes: blankNodesInput.checked });
      });
      editButton.addEventListener("click", () => {
        void (async () => {
          const output = await this.options.openBuilder?.({
            id: currentAttrs.id,
            title: currentAttrs.title,
            source: currentAttrs.query,
            queryJson: null,
            configId: this.options.defaultConfigId,
            knowledgeGraphProfileId: currentAttrs.knowledgeGraphProfileId
          });

          if (!output) {
            return;
          }

          updateAttrs({
            query: output.source ?? currentAttrs.query,
            selectedIndex: 0,
            result: null,
            graphData: null
          });
        })();
      });
      runButton.addEventListener("click", () => {
        void (async () => {
          if (currentAttrs.sourceMode === "iri") {
            await loadGraph(getGraphExplorerSpecItems(currentAttrs), false);
            return;
          }

          const query = currentAttrs.query.trim();
          const profile = this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId);

          if (!query) {
            updateAttrs({
              result: {
                status: "error",
                endpointUrl: profile.sparqlUrl,
                executedAt: new Date().toISOString(),
                durationMs: 0,
                code: "sparql.query_empty",
                message: "sparql.query_empty"
              }
            });
            return;
          }

          runButton.disabled = true;
          renderMessage(preview, translateSpecialNodeText("status.runningQueryDots"));
          resultContainer.innerHTML = "";
          footer.textContent = translateSpecialNodeText("status.runQueryPreview");

          const result = await this.options.executeQuery(profile.sparqlUrl, query, fetch);

          runButton.disabled = false;
          currentAttrs = {
            ...currentAttrs,
            result,
            selectedIndex: 0,
            graphData: null
          };
          currentAttrs.viewConfig = buildGraphExplorerSpec(
            currentAttrs,
            resolveCurrentGraphExplorerColorSchemes()
          );
          dispatchNodeAttrs(editor, getPos, currentAttrs);

          if (result.status === "success") {
            await loadGraph(getGraphExplorerSpecItems(currentAttrs), false);
          } else {
            renderState();
          }
        })();
      });
      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
      });
      deleteButton.addEventListener("click", () => {
        if (typeof getPos === "function") {
          const pos = getPos();
          if (typeof pos !== "number") {
            return;
          }

          editor.commands.deleteRange({
            from: pos,
            to: pos + node.nodeSize
          });
        }
      });

      container.addEventListener("mousedown", (event) => {
        if (isNodeViewControlEvent(event)) {
          event.stopPropagation();
        }
      });

      const renderState = () => {
        const collapsed = Boolean(currentAttrs.collapsed);

        title.value = currentAttrs.title || translateSpecialNodeText("registry.graphExplorer.label");
        sourceModeSelect.value = currentAttrs.sourceMode ?? "iri";
        if (document.activeElement !== iriInput) {
          iriInput.value = currentAttrs.iris.join("\n");
        }
        if (!queryEditor.hasFocus()) {
          queryEditor.setValue(currentAttrs.query ?? "");
        }
        updateSpecialNodeFieldKnowledgeGraphProfile(
          queryField,
          this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
        );
        iriMappingInput.value = currentAttrs.resultMapping.iri ?? "resource";
        labelMappingInput.value = currentAttrs.resultMapping.label ?? "label";
        if (document.activeElement !== captionInput) {
          captionInput.value = currentAttrs.caption ?? "";
        }
        directionSelect.value = currentAttrs.direction ?? "both";
        renderGraphExplorerColorSchemeOptions(
          colorSchemeSelect,
          resolveCurrentGraphExplorerColorSchemes(),
          currentAttrs.colorScheme
        );
        if (document.activeElement !== depthInput) {
          depthInput.value = String(currentAttrs.depth ?? 1);
        }
        if (document.activeElement !== maxNodesInput) {
          maxNodesInput.value = String(currentAttrs.maxNodes ?? 100);
        }
        if (document.activeElement !== maxEdgesInput) {
          maxEdgesInput.value = String(currentAttrs.maxEdgesPerNode ?? 50);
        }
        if (document.activeElement !== heightInput) {
          heightInput.value = String(currentAttrs.height ?? 520);
        }
        predicateLabelsInput.checked = Boolean(currentAttrs.showPredicateLabels);
        literalsInput.checked = Boolean(currentAttrs.showLiterals);
        typesInput.checked = Boolean(currentAttrs.showTypes);
        blankNodesInput.checked = Boolean(currentAttrs.includeBlankNodes);
        body.hidden = collapsed;
        container.dataset.collapsed = collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        container.dataset.sourceMode = currentAttrs.sourceMode;
        editButton.hidden = currentAttrs.sourceMode !== "sparql";
        runButton.querySelector("span")!.textContent =
          currentAttrs.sourceMode === "sparql"
            ? translateSpecialNodeText("actions.run")
            : translateSpecialNodeText("actions.load");
        resultFooter.hidden = currentAttrs.sourceMode !== "sparql";
        resultContainer.hidden = currentAttrs.sourceMode !== "sparql";
        collapseButton.setAttribute(
          "aria-label",
          currentAttrs.collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.graphExplorer.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.graphExplorer.headerLabel")
              })
        );
        collapseButton.title = currentAttrs.collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
        collapseButton.innerHTML = renderIcon(currentAttrs.collapsed ? ChevronRight : ChevronDown);
        if (!collapsed) {
          renderPreview();
        } else {
          destroyViewer();
        }
        specialHeader.refresh();
      };

      const renderPreview = () => {
        destroyViewer();
        preview.innerHTML = "";

        if (currentAttrs.sourceMode === "sparql") {
          renderResult();
        } else {
          resultFooter.textContent = "";
          resultContainer.innerHTML = "";
        }

        const items = getGraphExplorerSpecItems(currentAttrs);

        if (!items.length) {
          renderMessage(
            preview,
            currentAttrs.sourceMode === "sparql"
              ? translateSpecialNodeText("status.graphExplorerSparqlHint")
              : translateSpecialNodeText("status.graphExplorerIriHint")
          );
          footer.textContent = translateSpecialNodeText("status.expectedGraphExplorerResource");
          return;
        }

        if (currentAttrs.graphData?.nodes?.length) {
          viewer = renderGraphExplorerViewer(preview, currentAttrs.graphData, {
            height: currentAttrs.height,
            showPredicateLabels: currentAttrs.showPredicateLabels,
            showTypes: currentAttrs.showTypes,
            colorway: this.options.plotlyDefaults?.colorway,
            singleTraceColor: this.options.plotlyDefaults?.singleTraceColor,
            colors: resolveGraphExplorerColors(
              currentAttrs.colorScheme,
              resolveCurrentGraphExplorerColorSchemes()
            ),
            labels: {
              zoomIn: translateSpecialNodeText("actions.graphExplorerZoomIn"),
              zoomOut: translateSpecialNodeText("actions.graphExplorerZoomOut"),
              resetZoom: translateSpecialNodeText("actions.graphExplorerResetZoom"),
              togglePredicateLabels: translateSpecialNodeText("actions.graphExplorerTogglePredicateLabels"),
              expandNode: translateSpecialNodeText("actions.graphExplorerExpandNode"),
              enterFullscreen: translateSpecialNodeText("actions.graphExplorerEnterFullscreen"),
              exitFullscreen: translateSpecialNodeText("actions.graphExplorerExitFullscreen"),
              popupLabel: translateSpecialNodeText("actions.graphExplorerPopupLabel"),
              popupResource: translateSpecialNodeText("actions.graphExplorerPopupResource"),
              popupType: translateSpecialNodeText("actions.graphExplorerPopupType")
            },
            onLayoutChange: (graph) => {
              updateAttrs({ graphData: graph }, { render: false });
            },
            onExpand: (graphNode: GraphExplorerGraphNode) => {
              if (graphNode.kind === "literal") {
                return;
              }

              void loadGraph([{ iri: graphNode.iri ?? graphNode.id }], true);
            }
          });
          footer.textContent = translateSpecialNodeText("status.graphExplorerGraphFooter", {
            nodes: currentAttrs.graphData.nodes.length,
            edges: currentAttrs.graphData.edges.length
          });
          return;
        }

        renderMessage(
          preview,
          translateSpecialNodeText("status.graphExplorerReady", {
            count: items.length
          })
        );
        footer.textContent = translateSpecialNodeText("status.graphExplorerReadyFooter");
      };

      const renderResult = () => {
        renderSparqlResult(resultFooter, resultContainer, currentAttrs.result, {
          pageSize: currentAttrs.resultPageSize,
          errors: this.options.errors,
          onPageSizeChange: (resultPageSize) => {
            updateAttrs({ resultPageSize });
          }
        });
      };

      renderState();

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== GRAPH_EXPLORER_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeGraphExplorerNodeAttrs(
            updatedNode.attrs,
            this.options.defaultKnowledgeGraphProfileId
          );
          if (suppressNextNodeUpdateRender) {
            suppressNextNodeUpdateRender = false;
            return true;
          }
          renderState();
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: (event) =>
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement ||
          event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLTextAreaElement ||
          isNodeViewControlEvent(event),
        destroy: () => {
          destroyViewer();
          queryEditor.destroy();
        }
      };
    };
  }
});

function parseDirectIris(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseGraphNumber(value: string, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function renderGraphExplorerColorSchemeOptions(
  select: HTMLSelectElement,
  colorSchemes: Record<string, GraphExplorerColorScheme>,
  selectedScheme: string
): void {
  const previousValue = select.value;
  select.innerHTML = "";
  const entries = Object.entries(colorSchemes);
  const fallbackColors = defaultGraphExplorerColors();
  const normalizedEntries = entries.length
    ? entries
    : [["basic", { label: "basic", ...fallbackColors }] as [string, GraphExplorerColorScheme]];

  normalizedEntries.forEach(([schemeId, scheme]) => {
    const option = document.createElement("option");

    option.value = schemeId;
    option.textContent = scheme.label || schemeId;
    select.append(option);
  });

  select.value =
    selectedScheme && colorSchemes[selectedScheme]
      ? selectedScheme
      : previousValue && colorSchemes[previousValue]
        ? previousValue
        : normalizedEntries[0][0];
}

function mergeGraphExplorerData(
  existing: GraphExplorerGraphData | null,
  incoming: GraphExplorerGraphData
): GraphExplorerGraphData {
  if (!existing) {
    return incoming;
  }

  const nodes = new Map(existing.nodes.map((node) => [node.id, node]));
  const edges = new Map(existing.edges.map((edge) => [edge.id, edge]));

  incoming.nodes.forEach((node) => {
    nodes.set(node.id, {
      ...nodes.get(node.id),
      ...node,
      start: Boolean(nodes.get(node.id)?.start) || Boolean(node.start)
    });
  });
  incoming.edges.forEach((edge) => {
    edges.set(edge.id, edge);
  });

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    warnings: [...(existing.warnings ?? []), ...(incoming.warnings ?? [])],
    truncated: Boolean(existing.truncated) || Boolean(incoming.truncated)
  };
}

function markGraphExplorerNodesLoading(
  graph: GraphExplorerGraphData | null,
  iris: string[],
  loading: boolean
): GraphExplorerGraphData | null {
  if (!graph) {
    return null;
  }

  const loadingIris = new Set(iris);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => (loadingIris.has(node.iri ?? node.id) ? { ...node, loading } : node))
  };
}

function renderMessage(container: HTMLElement, message: string, error = false): void {
  const fallback = document.createElement("div");

  fallback.className = [
    "ld-visualization-empty",
    "ld-graph-explorer-message",
    error ? "ld-visualization-error" : ""
  ]
    .filter(Boolean)
    .join(" ");
  fallback.textContent = message;
  container.append(fallback);
}

function createField(
  label: string,
  control: HTMLElement,
  mode?: GraphExplorerSourceMode,
  knowledgeGraphProfile?: { id: string; label: string }
): HTMLElement {
  const isComplexControl = control.classList.contains("ld-sparql-source-editor");
  return createSpecialNodeField(label, control, {
    className: "ld-graph-explorer-field",
    complexControl: isComplexControl,
    modeAttribute: "graphExplorerFieldMode",
    mode,
    labelIdPrefix: control.getAttribute("aria-label") ?? "graph-explorer-field",
    knowledgeGraphProfile
  });
}
