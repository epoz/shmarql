/** Owns the Rawgraphs Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play } from "lucide";
import { Mode, createJSONEditor, type Content } from "vanilla-jsoneditor";
import { renderIcon } from "../../ui/icons";
import type { LodeonConfig } from "../../configuration/schema";
import { renderConfiguredError } from "../../errors/client-error";
import { renderRawGraphsProject, type RawGraphsSummary } from "./renderer";
import { createNodeId } from "../shared/node-id";
import {
  createSpecialNodeHeader,
  createSpecialNodeField,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText
} from "../shared/node-view-controls";

export const RAWGRAPHS_NODE_TYPE_NAME = "rawgraphsNode";

export type RawGraphsNodeAttrs = {
  id: string;
  kind: "rawgraphsVisualization";
  title: string;
  projectJson: string;
  svg: string;
  summary: RawGraphsSummary | null;
  message: string;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export type RawGraphsNodeOptions = {
  errors?: LodeonConfig["errors"];
};

/** Creates canonical RAWGraphs node JSON with normalized project and source state. */
export function createRawGraphsNodeContent(attrs: Partial<RawGraphsNodeAttrs> = {}): JSONContent {
  return { type: RAWGRAPHS_NODE_TYPE_NAME, attrs: normalizeRawGraphsNodeAttrs(attrs) };
}

/** Normalizes extensible RAWGraphs JSON only at the stable node envelope. */
export function normalizeRawGraphsNodeAttrs(attrs: Partial<RawGraphsNodeAttrs> = {}): RawGraphsNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.rawgraphs.label");
  const resolvedAttrs: RawGraphsNodeAttrs = {
    id: attrs.id ?? createNodeId("rawgraphs"),
    kind: "rawgraphsVisualization",
    title: attrs.title ?? defaultTitle,
    projectJson: attrs.projectJson ?? "",
    svg: attrs.svg ?? "",
    summary: attrs.summary ?? null,
    message: attrs.message ?? "",
    viewConfig: {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };

  resolvedAttrs.viewConfig = attrs.viewConfig ?? buildRawGraphsSpec(resolvedAttrs);

  return resolvedAttrs;
}

/** Owns RAWGraphs source editors and render generations so obsolete output cannot update a destroyed NodeView. */
export const RawGraphsNode = Node.create<RawGraphsNodeOptions>({
  name: RAWGRAPHS_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      errors: undefined
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "rawgraphsVisualization" },
      title: { default: translateSpecialNodeText("registry.rawgraphs.label") },
      projectJson: { default: "" },
      svg: { default: "" },
      summary: { default: null },
      message: { default: "" },
      viewConfig: { default: {} },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='rawgraphs']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "rawgraphs",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeRawGraphsNodeAttrs(node.attrs);
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const renderButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const controls = document.createElement("div");
      const fileInput = markNodeViewControl(document.createElement("input"));
      const settings = markNodeViewControl(document.createElement("details"));
      const settingsSummary = document.createElement("summary");
      const projectJsonHost = markNodeViewControl(document.createElement("div"));
      const summary = document.createElement("div");
      const preview = document.createElement("div");
      const footer = document.createElement("div");
      let jsonEditor: ReturnType<typeof createJSONEditor> | null = null;
      let updatingJsonEditor = false;

      container.className = "ld-node ld-rawgraphs-node";
      container.dataset.lodeonNode = "rawgraphs";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.rawgraphs.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.rawgraphs.titleAria"));

      renderButton.className = "ld-node-run-button";
      renderButton.type = "button";
      renderButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.run")}</span>`;
      renderButton.setAttribute("aria-label", translateSpecialNodeText("actions.run"));

      body.className = "ld-node-body";
      controls.className = "ld-rawgraphs-controls";
      fileInput.className = "ld-rawgraphs-file";
      fileInput.type = "file";
      fileInput.accept = ".rawgraphs,application/json";
      fileInput.setAttribute("aria-label", translateSpecialNodeText("fields.rawgraphsProjectFile"));

      settings.className = "ld-visualization-settings ld-rawgraphs-settings";
      settingsSummary.className = "ld-visualization-settings-summary";
      settingsSummary.textContent = translateSpecialNodeText("fields.settings");
      projectJsonHost.className = "ld-jsoneditor-host ld-rawgraphs-jsoneditor-host";
      summary.className = "ld-rawgraphs-summary";
      preview.className = "ld-rawgraphs-preview";
      footer.className = "ld-node-footer";

      controls.append(
        createField(translateSpecialNodeText("fields.project"), fileInput, "ld-rawgraphs-project-field")
      );
      settings.append(settingsSummary, projectJsonHost);
      body.append(controls, preview, summary, footer, settings);

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "rawgraphs",
        labelKey: "nodes.rawgraphs.headerLabel",
        eyebrow: "rawgraphs",
        eyebrowKey: "nodes.rawgraphs.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [renderButton]
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      container.append(header, body);

      const updateAttrs = (attrs: Partial<RawGraphsNodeAttrs>) => {
        const pos = typeof getPos === "function" ? getPos() : null;

        if (typeof pos !== "number") {
          return;
        }

        const nextAttrs = {
          ...currentAttrs,
          ...attrs
        };
        nextAttrs.viewConfig = buildRawGraphsSpec(nextAttrs);
        currentAttrs = nextAttrs;
        dispatchNodeAttrs(editor, getPos, nextAttrs);
      };

      const renderCurrentProject = async () => {
        footer.textContent = translateSpecialNodeText("status.renderingRawgraphs");
        preview.innerHTML = "";

        try {
          const result = await renderRawGraphsProject(preview, currentAttrs.projectJson);
          updateAttrs({
            summary: result.summary,
            svg: result.svg,
            message: translateSpecialNodeText("status.renderedRawgraphs")
          });
          footer.textContent = translateSpecialNodeText("status.renderedRawgraphs");
        } catch (error) {
          const message = renderConfiguredError(
            { errors: this.options.errors },
            error,
            "rawgraphs.render_failed"
          );
          updateAttrs({ message, svg: "", summary: null });
          footer.textContent = message;
          preview.innerHTML = `<div class="ld-visualization-empty ld-visualization-error"></div>`;
          const fallback = preview.querySelector<HTMLElement>(".ld-visualization-empty");
          if (fallback) {
            fallback.textContent = message;
          }
        }
      };

      const renderPreviewFromAttrs = () => {
        preview.innerHTML = "";

        if (currentAttrs.svg) {
          preview.innerHTML = currentAttrs.svg;
        } else {
          preview.innerHTML = '<div class="ld-visualization-empty"></div>';
          const empty = preview.querySelector<HTMLElement>(".ld-visualization-empty");

          if (empty) {
            empty.textContent = translateSpecialNodeText("status.rawgraphsEmptyPreview");
          }
        }
      };

      const renderSummary = () => {
        const item = currentAttrs.summary;

        summary.textContent = item
          ? translateSpecialNodeText("status.rawgraphsSummary", {
              chartName: item.chartName,
              chartId: item.chartId,
              rowCount: item.rowCount,
              columnCount: item.columnCount,
              version: item.version
            })
          : translateSpecialNodeText("status.noRawgraphsRendered");
      };

      const renderJsonEditor = () => {
        const content = jsonContentFromText(currentAttrs.projectJson);

        if (isJsdom()) {
          renderJsonTextareaFallback(content);
          return;
        }

        if (!jsonEditor) {
          projectJsonHost.innerHTML = "";
          jsonEditor = createJSONEditor({
            target: projectJsonHost,
            props: {
              content,
              mode: Mode.tree,
              mainMenuBar: true,
              navigationBar: true,
              statusBar: true,
              onChange: (updatedContent: Content) => {
                if (updatingJsonEditor) {
                  return;
                }
                updateProjectJson(jsonTextFromContent(updatedContent));
              }
            }
          });
          return;
        }

        updatingJsonEditor = true;
        jsonEditor.updateProps({ content, mode: Mode.tree });
        updatingJsonEditor = false;
      };

      const renderJsonTextareaFallback = (content: Content) => {
        projectJsonHost.innerHTML = "";
        const textarea = createJsonTextarea(
          translateSpecialNodeText("fields.rawgraphsProjectJson"),
          jsonTextFromContent(content)
        );

        textarea.addEventListener("input", () => {
          updateProjectJson(textarea.value);
        });
        projectJsonHost.append(textarea);
      };

      const updateProjectJson = (value: string) => {
        updateAttrs({
          projectJson: value,
          svg: "",
          summary: null,
          message: translateSpecialNodeText("status.rawgraphsProjectChanged")
        });
        renderSummary();
        renderPreviewFromAttrs();
        footer.textContent = currentAttrs.message;
      };

      const renderCollapsedState = () => {
        body.hidden = currentAttrs.collapsed;
        container.dataset.collapsed = currentAttrs.collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        collapseButton.innerHTML = renderIcon(currentAttrs.collapsed ? ChevronRight : ChevronDown);
        collapseButton.setAttribute(
          "aria-label",
          currentAttrs.collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.rawgraphs.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.rawgraphs.headerLabel")
              })
        );
        collapseButton.title = currentAttrs.collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
      };

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });

      fileInput.addEventListener("change", () => {
        void (async () => {
          const [file] = Array.from(fileInput.files ?? []);

          if (!file) {
            return;
          }

          const source = await file.text();
          updateAttrs({
            title: currentAttrs.title || file.name.replace(/\.rawgraphs$/i, ""),
            projectJson: source,
            svg: "",
            summary: null,
            message: translateSpecialNodeText("status.rawgraphsFileLoaded", {
              fileName: file.name
            })
          });
          renderJsonEditor();
          renderSummary();
          renderPreviewFromAttrs();
          footer.textContent = currentAttrs.message;
        })();
      });

      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
        renderCollapsedState();
      });

      renderButton.addEventListener("click", () => {
        void renderCurrentProject();
      });

      deleteButton.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : null;

        if (typeof pos === "number") {
          editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run();
        }
      });

      renderSummary();
      renderPreviewFromAttrs();
      renderJsonEditor();
      renderCollapsedState();
      footer.textContent = currentAttrs.message;

      return {
        dom: container,
        stopEvent: isNodeViewControlEvent,
        update: (updatedNode) => {
          if (updatedNode.type.name !== RAWGRAPHS_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeRawGraphsNodeAttrs(updatedNode.attrs);
          title.value = currentAttrs.title;
          if (!projectJsonHost.contains(document.activeElement)) {
            renderJsonEditor();
          }
          renderSummary();
          renderPreviewFromAttrs();
          renderCollapsedState();
          footer.textContent = currentAttrs.message;
          specialHeader.refresh();

          return true;
        },
        destroy: () => {
          void jsonEditor?.destroy();
          jsonEditor = null;
        }
      };
    };
  }
});

function jsonContentFromText(text: string): Content {
  if (!text.trim()) {
    return { json: {} };
  }

  try {
    return { json: JSON.parse(text) };
  } catch {
    return { text };
  }
}

function jsonTextFromContent(content: Content): string {
  if ("text" in content) {
    return content.text;
  }

  return `${JSON.stringify(content.json, null, 2)}\n`;
}

function isJsdom(): boolean {
  return navigator.userAgent.toLowerCase().includes("jsdom");
}

function createJsonTextarea(label: string, value: string): HTMLTextAreaElement {
  const textarea = markNodeViewControl(document.createElement("textarea"));

  textarea.className = "ld-visualization-json ld-rawgraphs-source";
  textarea.value = value;
  textarea.rows = 10;
  textarea.spellcheck = false;
  textarea.placeholder = translateSpecialNodeText("placeholders.rawgraphsProjectJson");
  textarea.setAttribute("aria-label", label);

  return textarea;
}

function buildRawGraphsSpec(attrs: RawGraphsNodeAttrs): Record<string, unknown> {
  return {
    version: 1,
    renderer: "rawgraphs",
    project: attrs.projectJson,
    svg: attrs.svg,
    summary: attrs.summary
  };
}

function createField(labelText: string, input: HTMLElement, className = ""): HTMLElement {
  return createSpecialNodeField(labelText, input, {
    className: "ld-visualization-field",
    additionalClassName: className
  });
}
