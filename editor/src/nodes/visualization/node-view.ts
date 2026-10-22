/** Owns the Visualization Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, WandSparkles } from "lucide";
import { Mode, createJSONEditor, type Content } from "vanilla-jsoneditor";
import { executeSparqlQuery } from "../sparql/api-client";
import { renderConfiguredError, renderConfiguredErrorCode } from "../../errors/client-error";
import { renderIcon } from "../../ui/icons";
import {
  buildPlotlyFigure,
  renderVisualization,
  validatePlotlyJson,
  type PlotlyJsonValidation,
  type VisualizationType
} from "./renderer";
import { createSparqlSourceEditor } from "../sparql/source-editor";
import { createNodeId } from "../shared/node-id";
import type { VisualizationNodeAttrs, VisualizationNodeOptions, VisualizationSourceMode } from "./contracts";
import { loadVisualizationData } from "./data-source";
import {
  applyPlotlyJsonAttrsToDrafts,
  contentFromJsonEditorChange,
  createPlotlyJsonDrafts,
  getActiveJsonTextFromDrafts,
  jsonContentFromText,
  jsonTextFromContent,
  readPlotlyJson,
  type JsonEditorChangeStatus,
  type PlotlyJsonTab
} from "./json-drafts";
import { completeVisualizationMapping, createPlotlyDefaults } from "./mapping";
import { buildVisualizationSpec } from "./spec";
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

export const VISUALIZATION_NODE_TYPE_NAME = "visualizationNode";

/** Creates canonical Plotly visualization node JSON through its envelope normalizer. */
export function createVisualizationNodeContent(attrs: Partial<VisualizationNodeAttrs> = {}): JSONContent {
  return { type: VISUALIZATION_NODE_TYPE_NAME, attrs: normalizeVisualizationNodeAttrs(attrs) };
}

/** Normalizes the stable visualization envelope while preserving user-defined data and Plotly leaves. */
export function normalizeVisualizationNodeAttrs(
  attrs: Partial<VisualizationNodeAttrs> = {}
): VisualizationNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.visualization.label");
  const resolvedAttrs: VisualizationNodeAttrs = {
    id: attrs.id ?? createNodeId("visualization"),
    kind: "visualization",
    title: attrs.title ?? defaultTitle,
    sourceMode: attrs.sourceMode ?? "sparql",
    source:
      attrs.source ??
      'SELECT ?label ?value WHERE {\n  VALUES (?label ?value) { ("A" 12) ("B" 8) ("C" 15) }\n} LIMIT 10',
    ...(attrs.knowledgeGraphProfileId ? { knowledgeGraphProfileId: attrs.knowledgeGraphProfileId } : {}),
    url: attrs.url ?? "",
    urlFormat: attrs.urlFormat ?? "csv",
    chartType: attrs.chartType ?? "table",
    mapping: attrs.mapping ?? {},
    plotlyDataJson: attrs.plotlyDataJson ?? "",
    layoutJson: attrs.layoutJson ?? "",
    configJson: attrs.configJson ?? "",
    figure: attrs.figure ?? null,
    data: attrs.data ?? null,
    result: attrs.result ?? null,
    message: attrs.message ?? "",
    viewConfig: {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };

  resolvedAttrs.viewConfig = attrs.viewConfig ?? buildVisualizationSpec(resolvedAttrs);

  return resolvedAttrs;
}

/** Owns source editors and render generations and prevents stale visualization updates after teardown. */
export const VisualizationNode = Node.create<VisualizationNodeOptions>({
  name: VISUALIZATION_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      defaultConfigId: "",
      defaultKnowledgeGraphProfileId: undefined,
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: translateSpecialNodeText("aria.knowledgeGraph"),
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery,
      fetchText: fetch.bind(globalThis),
      openBuilder: undefined
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "visualization" },
      title: { default: translateSpecialNodeText("registry.visualization.label") },
      sourceMode: { default: "sparql" },
      source: { default: "" },
      knowledgeGraphProfileId: {
        default: this.options.defaultKnowledgeGraphProfileId
      },
      url: { default: "" },
      urlFormat: { default: "csv" },
      chartType: { default: "table" },
      mapping: { default: {} },
      plotlyDataJson: { default: "" },
      layoutJson: { default: "" },
      configJson: { default: "" },
      figure: { default: null },
      data: { default: null },
      result: { default: null },
      message: { default: "" },
      viewConfig: { default: {} },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='visualization']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "visualization",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeVisualizationNodeAttrs(node.attrs);
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const generateButton = markNodeViewControl(document.createElement("button"));
      const builderButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const controls = document.createElement("div");
      const sourceMode = markNodeViewControl(document.createElement("select"));
      const chartType = markNodeViewControl(document.createElement("select"));
      const sourceEditor = createSparqlSourceEditor({
        value: String(currentAttrs.source ?? ""),
        className: "ld-visualization-source-editor",
        ariaLabel: translateSpecialNodeText("aria.visualizationDataSourceText"),
        placeholder: translateSpecialNodeText("placeholders.visualizationDataSource")
      });
      const url = markNodeViewControl(document.createElement("input"));
      const plotlyControls = document.createElement("div");
      const plotlySettings = markNodeViewControl(document.createElement("details"));
      const plotlySettingsSummary = document.createElement("summary");
      const plotlyTabs = document.createElement("div");
      const plotlyEditorHost = markNodeViewControl(document.createElement("div"));
      const footer = document.createElement("div");
      const resultContainer = document.createElement("div");
      const sourceField = createSpecialNodeField(
        translateSpecialNodeText("fields.data"),
        sourceEditor.element,
        {
          className: "ld-visualization-field ld-visualization-source-field",
          complexControl: true,
          labelIdPrefix: "visualization-data",
          knowledgeGraphProfile: this.options.resolveKnowledgeGraphProfile(
            currentAttrs.knowledgeGraphProfileId
          )
        }
      );
      let activeJsonTab: PlotlyJsonTab = "data";
      let jsonEditor: ReturnType<typeof createJSONEditor> | null = null;
      let updatingJsonEditor = false;
      let jsonEditorDirty = false;
      let plotlyJsonDrafts = createPlotlyJsonDrafts(currentAttrs);
      let jsonValidation: PlotlyJsonValidation = {};

      container.className = "ld-node ld-visualization-node";
      container.dataset.lodeonNode = "visualization";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.visualization.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.visualization.titleAria"));

      builderButton.className = "ld-node-run-button";
      builderButton.type = "button";
      builderButton.innerHTML = `${renderIcon(WandSparkles)}<span>${translateSpecialNodeText(
        "actions.visualQueryBuilder"
      )}</span>`;
      builderButton.setAttribute(
        "aria-label",
        translateSpecialNodeText("actions.openVisualizationQueryBuilder")
      );

      generateButton.className = "ld-node-run-button";
      generateButton.type = "button";
      generateButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.run")}</span>`;
      generateButton.setAttribute("aria-label", translateSpecialNodeText("actions.run"));

      body.className = "ld-node-body";
      controls.className = "ld-visualization-controls";
      plotlyControls.className = "ld-visualization-plotly";
      plotlySettings.className = "ld-visualization-settings";
      plotlySettingsSummary.className = "ld-visualization-settings-summary";
      plotlySettingsSummary.textContent = translateSpecialNodeText("fields.settings");
      plotlyTabs.className = "ld-jsoneditor-tabs";
      plotlyEditorHost.className = "ld-jsoneditor-host";
      footer.className = "ld-node-footer";
      resultContainer.className = "ld-sparql-result ld-visualization-result";

      sourceMode.setAttribute("aria-label", translateSpecialNodeText("aria.visualizationDataSource"));
      addSelectOptions(sourceMode, [
        ["sparql", translateSpecialNodeText("options.visualizationSourceMode.sparql")],
        ["csv", translateSpecialNodeText("options.visualizationSourceMode.csv")],
        ["tsv", translateSpecialNodeText("options.visualizationSourceMode.tsv")],
        ["url", translateSpecialNodeText("options.visualizationSourceMode.url")]
      ]);
      sourceMode.querySelector<HTMLOptionElement>('option[value="sparql"]')!.disabled =
        !this.options.defaultKnowledgeGraphProfileId;

      chartType.setAttribute("aria-label", translateSpecialNodeText("aria.visualizationType"));
      addSelectOptions(chartType, [
        ["table", translateSpecialNodeText("options.visualizationChartType.table")],
        ["bar", translateSpecialNodeText("options.visualizationChartType.bar")],
        ["line", translateSpecialNodeText("options.visualizationChartType.line")],
        ["pie", translateSpecialNodeText("options.visualizationChartType.pie")],
        ["scatter", translateSpecialNodeText("options.visualizationChartType.scatter")],
        ["bubble", translateSpecialNodeText("options.visualizationChartType.bubble")],
        ["horizontalBar", translateSpecialNodeText("options.visualizationChartType.horizontalBar")],
        ["groupedBar", translateSpecialNodeText("options.visualizationChartType.groupedBar")],
        ["stackedBar", translateSpecialNodeText("options.visualizationChartType.stackedBar")],
        ["area", translateSpecialNodeText("options.visualizationChartType.area")],
        ["histogram", translateSpecialNodeText("options.visualizationChartType.histogram")],
        ["box", translateSpecialNodeText("options.visualizationChartType.box")],
        ["heatmap", translateSpecialNodeText("options.visualizationChartType.heatmap")],
        ["treemap", translateSpecialNodeText("options.visualizationChartType.treemap")],
        ["sunburst", translateSpecialNodeText("options.visualizationChartType.sunburst")],
        ["sankey", translateSpecialNodeText("options.visualizationChartType.sankey")],
        ["timeline", translateSpecialNodeText("options.visualizationChartType.timeline")],
        ["map", translateSpecialNodeText("options.visualizationChartType.map")]
      ]);

      url.className = "ld-visualization-url";
      url.type = "url";
      url.placeholder = translateSpecialNodeText("placeholders.visualizationDataUrl");
      url.setAttribute("aria-label", translateSpecialNodeText("aria.visualizationDataUrl"));

      controls.append(
        createField(translateSpecialNodeText("fields.data"), sourceMode),
        createField(translateSpecialNodeText("fields.chart"), chartType)
      );
      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "visualization",
        labelKey: "nodes.visualization.headerLabel",
        eyebrow: "visualization",
        eyebrowKey: "nodes.visualization.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [builderButton, generateButton]
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      body.append(controls, url, sourceField, resultContainer, footer, plotlySettings);
      container.append(header, body);

      const updateAttrs = (attrs: Partial<VisualizationNodeAttrs>) => {
        if (typeof getPos !== "function") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };
        currentAttrs.viewConfig = buildVisualizationSpec(currentAttrs);

        dispatchNodeAttrs(editor, getPos, currentAttrs);
      };

      const renderCollapsedState = () => {
        const collapsed = Boolean(currentAttrs.collapsed);
        body.hidden = collapsed;
        container.dataset.collapsed = collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        collapseButton.innerHTML = renderIcon(collapsed ? ChevronRight : ChevronDown);
        collapseButton.setAttribute(
          "aria-label",
          collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.visualization.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.visualization.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
      };

      const renderState = () => {
        jsonValidation = validatePlotlyJson(readPlotlyJson(currentAttrs));
        title.value = String(currentAttrs.title ?? translateSpecialNodeText("registry.visualization.label"));
        sourceMode.value = currentAttrs.sourceMode;
        chartType.value = currentAttrs.chartType;
        if (document.activeElement !== url) {
          url.value = currentAttrs.url ?? "";
        }
        if (!sourceEditor.hasFocus()) {
          sourceEditor.setValue(String(currentAttrs.source ?? ""));
        }
        sourceEditor.element.hidden = currentAttrs.sourceMode === "url";
        sourceField.hidden = currentAttrs.sourceMode === "url";
        updateSpecialNodeFieldKnowledgeGraphProfile(
          sourceField,
          currentAttrs.sourceMode === "sparql"
            ? this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
            : undefined
        );
        url.hidden = currentAttrs.sourceMode !== "url";
        builderButton.hidden = currentAttrs.sourceMode !== "sparql";
        builderButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        generateButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        renderPlotlyControls();
        renderFooter();
        renderVisualization(
          resultContainer,
          currentAttrs.data,
          currentAttrs.chartType,
          currentAttrs.mapping,
          readPlotlyJson(currentAttrs),
          this.options.plotlyDefaults,
          this.options.errors,
          translateSpecialNodeText
        );
        renderCollapsedState();
      };

      const renderPlotlyControls = () => {
        renderPlotlyTabs();

        if (!plotlyEditorHost.isConnected) {
          plotlySettings.append(plotlySettingsSummary, plotlyControls);
          plotlyControls.append(plotlyTabs, plotlyEditorHost);
        }

        renderJsonEditor();
      };

      const renderPlotlyTabs = () => {
        plotlyTabs.innerHTML = "";

        (
          [
            ["data", translateSpecialNodeText("status.plotlyData")],
            ["layout", translateSpecialNodeText("status.plotlyLayout")],
            ["config", translateSpecialNodeText("status.plotlyConfig")]
          ] as Array<[PlotlyJsonTab, string]>
        ).forEach(([tab, label]) => {
          const button = markNodeViewControl(document.createElement("button"));

          button.type = "button";
          button.className = "ld-jsoneditor-tab";
          button.textContent = label;
          button.dataset.active = activeJsonTab === tab ? "true" : "false";
          button.dataset.invalid = jsonValidation[tab] ? "true" : "false";
          button.setAttribute("aria-label", translateSpecialNodeText("actions.showPlotlyJson", { label }));
          if (jsonValidation[tab]) {
            button.title = renderConfiguredErrorCode(
              this.options.errors,
              jsonValidation[tab]?.code ?? "visualization.json_invalid",
              jsonValidation[tab]?.variables
            );
          }
          button.addEventListener("click", () => {
            activeJsonTab = tab;
            renderPlotlyControls();
          });
          plotlyTabs.append(button);
        });
      };

      const renderJsonEditor = () => {
        jsonValidation = validatePlotlyJson(plotlyJsonDrafts);
        const activeText = getActiveJsonTextFromDrafts(plotlyJsonDrafts, activeJsonTab);
        const content = jsonContentFromText(activeText);
        renderJsonError();

        if (isJsdom()) {
          renderJsonTextareaFallback(activeText);
          return;
        }

        if (!jsonEditor) {
          plotlyEditorHost.innerHTML = "";
          jsonEditor = createJSONEditor({
            target: plotlyEditorHost,
            props: {
              content,
              mode: Mode.tree,
              mainMenuBar: true,
              navigationBar: true,
              statusBar: true,
              onChange: (
                updatedContent: Content,
                _previousContent: Content,
                status?: JsonEditorChangeStatus
              ) => {
                if (updatingJsonEditor) {
                  return;
                }
                updateActivePlotlyContent(contentFromJsonEditorChange(updatedContent, status));
              },
              onBlur: () => {
                syncActiveJsonEditorContent();
              }
            }
          });
          return;
        }

        if (plotlyControls.contains(document.activeElement) && jsonEditorDirty) {
          return;
        }

        updatingJsonEditor = true;
        jsonEditor.updateProps({ content });
        updatingJsonEditor = false;
      };

      const renderJsonTextareaFallback = (value: string) => {
        const existing = plotlyEditorHost.querySelector<HTMLTextAreaElement>("textarea");

        if (
          existing &&
          document.activeElement === existing &&
          existing.getAttribute("aria-label") ===
            translateSpecialNodeText("actions.plotlyJsonAria", {
              label: activeJsonTab
            })
        ) {
          return;
        }

        plotlyEditorHost.innerHTML = "";
        const textarea = createJsonTextarea(
          translateSpecialNodeText("actions.plotlyJsonAria", {
            label: activeJsonTab
          }),
          value
        );

        textarea.addEventListener("input", () => {
          updateActivePlotlyJson(textarea.value);
        });
        plotlyEditorHost.append(textarea);
      };

      const renderJsonError = () => {
        const existing = plotlyControls.querySelector(".ld-jsoneditor-error");
        existing?.remove();

        const message = jsonValidation[activeJsonTab];

        if (!message) {
          return;
        }

        const error = document.createElement("div");
        error.className = "ld-jsoneditor-error";
        error.textContent = renderConfiguredErrorCode(this.options.errors, message.code, message.variables);
        plotlyControls.insertBefore(error, plotlyEditorHost.nextSibling);
      };

      const renderPlotlyPreview = (attrs: VisualizationNodeAttrs, plotlyJson = readPlotlyJson(attrs)) => {
        renderFooter();
        renderVisualization(
          resultContainer,
          attrs.data,
          attrs.chartType,
          attrs.mapping,
          plotlyJson,
          this.options.plotlyDefaults,
          this.options.errors,
          translateSpecialNodeText
        );
      };

      const updateActivePlotlyJson = (value: string) => {
        jsonEditorDirty = true;
        if (activeJsonTab === "data") {
          updatePlotlyJson({ plotlyDataJson: value });
          return;
        }
        if (activeJsonTab === "layout") {
          updatePlotlyJson({ layoutJson: value });
          return;
        }
        updatePlotlyJson({ configJson: value });
      };

      const updateActivePlotlyContent = (content: Content) => {
        updateActivePlotlyJson(jsonTextFromContent(content));
      };

      const syncActiveJsonEditorContent = () => {
        if (!jsonEditor || updatingJsonEditor) {
          return;
        }

        try {
          updateActivePlotlyContent(jsonEditor.get());
        } catch {
          // Tree/table inline edits can temporarily hold invalid text before
          // commit. Keep the last valid Plotly figure until the editor emits a
          // valid content change.
        }
      };

      const updatePlotlyJson = (
        attrs: Pick<Partial<VisualizationNodeAttrs>, "plotlyDataJson" | "layoutJson" | "configJson">
      ) => {
        const nextAttrs = {
          ...currentAttrs,
          ...attrs
        };
        const nextDrafts = {
          ...plotlyJsonDrafts
        };
        applyPlotlyJsonAttrsToDrafts(nextDrafts, attrs);
        plotlyJsonDrafts = nextDrafts;
        const validation = validatePlotlyJson(nextDrafts);
        const firstError = validation.data ?? validation.layout ?? validation.config;

        jsonValidation = validation;
        renderPlotlyTabs();
        renderJsonError();

        if (firstError) {
          updateAttrs({
            figure: currentAttrs.figure,
            message: renderConfiguredErrorCode(this.options.errors, firstError.code, firstError.variables)
          });
          renderPlotlyTabs();
          renderJsonError();
          renderPlotlyPreview(currentAttrs);
          return;
        }

        const figure = nextAttrs.data
          ? buildPlotlyFigure(
              nextAttrs.data,
              nextAttrs.chartType,
              nextAttrs.mapping,
              nextDrafts,
              this.options.plotlyDefaults
            )
          : null;

        updateAttrs({
          ...attrs,
          figure,
          message: nextAttrs.data
            ? translateSpecialNodeText("status.dataShape", {
                rows: nextAttrs.data.rows.length,
                columns: nextAttrs.data.columns.length
              })
            : currentAttrs.message
        });
        renderPlotlyPreview(currentAttrs, nextDrafts);
      };

      const renderFooter = () => {
        const rows = currentAttrs.data?.rows.length ?? 0;
        const columns = currentAttrs.data?.columns.length ?? 0;

        footer.textContent =
          currentAttrs.message ||
          (rows > 0
            ? translateSpecialNodeText("status.dataShape", { rows, columns })
            : translateSpecialNodeText("status.generateDataPreview"));
      };

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });

      sourceMode.addEventListener("change", () => {
        updateAttrs({
          sourceMode: sourceMode.value as VisualizationSourceMode,
          data: null,
          figure: null,
          message: ""
        });
      });

      chartType.addEventListener("change", () => {
        const nextChartType = chartType.value as VisualizationType;
        const defaults = currentAttrs.data
          ? createPlotlyDefaults(
              currentAttrs.data,
              nextChartType,
              completeVisualizationMapping(currentAttrs.data, nextChartType, {}),
              this.options.plotlyDefaults
            )
          : {
              mapping: {},
              plotlyDataJson: "",
              layoutJson: "",
              configJson: "",
              figure: null
            };

        updateAttrs({
          chartType: nextChartType,
          ...defaults,
          message: ""
        });
        plotlyJsonDrafts = createPlotlyJsonDrafts({
          ...currentAttrs,
          ...defaults
        });
        jsonEditorDirty = false;
      });

      sourceEditor.onChange((value) => {
        updateAttrs({
          source: value,
          data: null,
          figure: null,
          result: null,
          message: ""
        });
      });

      url.addEventListener("input", () => {
        updateAttrs({
          url: url.value,
          data: null,
          figure: null,
          result: null,
          message: ""
        });
      });

      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
      });

      deleteButton.addEventListener("click", () => {
        if (typeof getPos !== "function") {
          return;
        }

        const pos = getPos();
        if (typeof pos !== "number") {
          return;
        }
        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
        editor.view.focus();
      });

      builderButton.addEventListener("click", () => {
        void (async () => {
          if (!currentAttrs.knowledgeGraphProfileId) return;
          const output = await this.options.openBuilder?.({
            id: currentAttrs.id,
            title: currentAttrs.title,
            source: currentAttrs.source,
            queryJson: null,
            configId: this.options.defaultConfigId,
            knowledgeGraphProfileId: currentAttrs.knowledgeGraphProfileId
          });

          if (!output) {
            return;
          }

          updateAttrs({
            source: output.source ?? currentAttrs.source,
            knowledgeGraphProfileId: output.knowledgeGraphProfileId ?? currentAttrs.knowledgeGraphProfileId,
            data: null,
            figure: null,
            result: null,
            message: ""
          });
        })();
      });

      generateButton.addEventListener("click", () => {
        void (async () => {
          if (currentAttrs.sourceMode === "sparql" && !currentAttrs.knowledgeGraphProfileId) return;
          const hasExistingFigure = Boolean(currentAttrs.data || currentAttrs.figure);
          const resetJson =
            !hasExistingFigure ||
            window.confirm(translateSpecialNodeText("status.confirmGenerateVisualization"));

          if (!resetJson) {
            footer.textContent = translateSpecialNodeText("status.generationCancelled");
            return;
          }

          generateButton.disabled = true;
          footer.textContent = translateSpecialNodeText("status.generatingVisualization");
          resultContainer.innerHTML = "";

          try {
            const data = await loadVisualizationData(currentAttrs, this.options);
            const mapping = completeVisualizationMapping(data, currentAttrs.chartType, currentAttrs.mapping);
            const defaults = createPlotlyDefaults(
              data,
              currentAttrs.chartType,
              mapping,
              this.options.plotlyDefaults
            );

            updateAttrs({
              data,
              ...defaults,
              message: translateSpecialNodeText("status.dataShape", {
                rows: data.rows.length,
                columns: data.columns.length
              })
            });
            plotlyJsonDrafts = createPlotlyJsonDrafts({
              ...currentAttrs,
              ...defaults
            });
            jsonEditorDirty = false;
          } catch (error) {
            updateAttrs({
              data: null,
              figure: null,
              result: null,
              message: renderConfiguredError(
                { errors: this.options.errors },
                error,
                "visualization.plotly_failed"
              )
            });
          } finally {
            generateButton.disabled = false;
          }
        })();
      });

      renderState();

      return {
        dom: container,
        stopEvent: isNodeViewControlEvent,
        update: (updatedNode) => {
          if (updatedNode.type.name !== VISUALIZATION_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeVisualizationNodeAttrs(updatedNode.attrs);
          if (
            document.activeElement !== title &&
            !sourceEditor.hasFocus() &&
            document.activeElement !== url &&
            !plotlyControls.contains(document.activeElement) &&
            !jsonEditorDirty
          ) {
            plotlyJsonDrafts = createPlotlyJsonDrafts(currentAttrs);
            jsonEditorDirty = false;
            renderState();
          } else {
            jsonValidation = validatePlotlyJson(plotlyJsonDrafts);
            renderPlotlyTabs();
            renderJsonError();
            renderPlotlyPreview(
              currentAttrs,
              jsonValidation.data || jsonValidation.layout || jsonValidation.config
                ? readPlotlyJson(currentAttrs)
                : plotlyJsonDrafts
            );
          }
          specialHeader.refresh();
          return true;
        },
        ignoreMutation: () => true,
        destroy: () => {
          sourceEditor.destroy();
          void jsonEditor?.destroy();
          jsonEditor = null;
        }
      };
    };
  }
});

function isJsdom(): boolean {
  return navigator.userAgent.toLowerCase().includes("jsdom");
}

function addSelectOptions(select: HTMLSelectElement, options: Array<[string, string]>): void {
  options.forEach(([value, label]) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function createField(label: string, control: HTMLElement): HTMLElement {
  return createSpecialNodeField(label, control, {
    className: "ld-visualization-field"
  });
}

function createJsonTextarea(label: string, value: string): HTMLTextAreaElement {
  const textarea = markNodeViewControl(document.createElement("textarea"));

  textarea.className = "ld-visualization-json";
  textarea.value = value;
  textarea.rows = 4;
  textarea.spellcheck = false;
  textarea.placeholder = translateSpecialNodeText("placeholders.plotlyJson");
  textarea.setAttribute("aria-label", label);

  return textarea;
}
