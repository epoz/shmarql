/** Owns the Sparql Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight } from "lucide";
import { executeSparqlQuery, type SparqlExecutionResult } from "./api-client";
import type { LodeonConfig } from "../../configuration/schema";
import { renderIcon } from "../../ui/icons";
import {
  createSpecialNodeField,
  createSpecialNodeHeader,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText,
  updateSpecialNodeFieldKnowledgeGraphProfile
} from "../shared/node-view-controls";
import { createNodeId } from "../shared/node-id";
import { renderSparqlResult, type SparqlResultPageSize } from "./result-view";
import { createSparqlSourceEditor } from "./source-editor";

export const SPARQL_NODE_TYPE_NAME = "sparqlNode";

export type SparqlNodeAttrs = {
  id: string;
  kind: "sparql";
  title: string;
  source: string;
  knowledgeGraphProfileId: string;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  viewConfig: Record<string, unknown>;
  collapsed: boolean;
  excludeFromRender: boolean;
};

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number];

export type SparqlNodeOptions = {
  defaultKnowledgeGraphProfileId: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
};

/** Creates canonical SPARQL node JSON with one normalized query source. */
export function createSparqlNodeContent(attrs: Partial<SparqlNodeAttrs> = {}): JSONContent {
  return { type: SPARQL_NODE_TYPE_NAME, attrs: normalizeSparqlNodeAttrs(attrs) };
}

/** Normalizes persisted query and display attributes without executing SPARQL. */
export function normalizeSparqlNodeAttrs(attrs: Partial<SparqlNodeAttrs> = {}): SparqlNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.sparql.label");

  return {
    id: attrs.id ?? createNodeId("sparql"),
    kind: "sparql",
    title: attrs.title ?? defaultTitle,
    source: attrs.source ?? "SELECT ?item ?itemLabel WHERE {\n  ?item a ?type .\n} LIMIT 10",
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId ?? "",
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    viewConfig: attrs.viewConfig ?? {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };
}

/** Owns source-editor controls and query execution callbacks and destroys them with the NodeView. */
export const SparqlNode = Node.create<SparqlNodeOptions>({
  name: SPARQL_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      defaultKnowledgeGraphProfileId: "",
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: translateSpecialNodeText("aria.knowledgeGraph"),
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery
    };
  },

  addAttributes() {
    return {
      id: {
        default: null
      },
      kind: {
        default: "sparql"
      },
      title: {
        default: translateSpecialNodeText("registry.sparql.label")
      },
      source: {
        default: ""
      },
      knowledgeGraphProfileId: {
        default: this.options.defaultKnowledgeGraphProfileId
      },
      result: {
        default: null
      },
      resultPageSize: {
        default: 10
      },
      viewConfig: {
        default: {}
      },
      collapsed: {
        default: false
      },
      excludeFromRender: {
        default: false
      }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='sparql']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "sparql",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeSparqlNodeAttrs(node.attrs);
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const sourceEditor = createSparqlSourceEditor({
        value: String(node.attrs.source ?? ""),
        ariaLabel: translateSpecialNodeText("aria.sparqlQuerySource")
      });
      const sourceField = createSpecialNodeField(
        translateSpecialNodeText("fields.sparqlQuery"),
        sourceEditor.element,
        {
          className: "ld-sparql-field",
          complexControl: true,
          labelIdPrefix: "sparql-query",
          knowledgeGraphProfile: this.options.resolveKnowledgeGraphProfile(
            currentAttrs.knowledgeGraphProfileId
          )
        }
      );
      const runButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const footer = document.createElement("div");
      const resultContainer = document.createElement("div");

      container.className = "ld-node ld-sparql-node";
      container.dataset.lodeonNode = "sparql";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.sparql.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.sparql.titleAria"));

      runButton.className = "ld-node-run-button";
      runButton.type = "button";
      runButton.textContent = translateSpecialNodeText("actions.run");
      runButton.setAttribute("aria-label", translateSpecialNodeText("actions.runSparqlQuery"));

      body.className = "ld-node-body";
      footer.className = "ld-node-footer";
      resultContainer.className = "ld-sparql-result";

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "sparql",
        labelKey: "nodes.sparql.headerLabel",
        eyebrow: "sparql",
        eyebrowKey: "nodes.sparql.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [runButton]
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      body.append(sourceField, footer, resultContainer);
      container.append(header, body);

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
                label: translateSpecialNodeText("nodes.sparql.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.sparql.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
      };

      const updateAttrs = (attrs: Partial<SparqlNodeAttrs>) => {
        if (typeof getPos !== "function") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };

        dispatchNodeAttrs(editor, getPos, currentAttrs);
      };

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });

      sourceEditor.onChange((value) => {
        updateAttrs({ source: value });
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

      runButton.addEventListener("click", () => {
        void (async () => {
          const query = String(currentAttrs.source ?? "");
          const profile = this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId);

          if (!query.trim()) {
            const result: SparqlExecutionResult = {
              status: "error",
              endpointUrl: profile.sparqlUrl,
              executedAt: new Date().toISOString(),
              durationMs: 0,
              code: "sparql.query_empty",
              message: "sparql.query_empty"
            };

            updateAttrs({ result });
            return;
          }

          runButton.disabled = true;
          footer.textContent = translateSpecialNodeText("status.runningQuery");
          resultContainer.innerHTML = "";

          const result = await this.options.executeQuery(profile.sparqlUrl, query, fetch);

          updateAttrs({ result });
          runButton.disabled = false;
        })();
      });

      const renderResult = () => {
        renderSparqlResult(footer, resultContainer, currentAttrs.result, {
          pageSize: currentAttrs.resultPageSize,
          errors: this.options.errors,
          onPageSizeChange: (resultPageSize) => {
            updateAttrs({ resultPageSize });
          }
        });
      };

      renderResult();
      renderCollapsedState();

      return {
        dom: container,
        stopEvent: isNodeViewControlEvent,
        update: (updatedNode) => {
          if (updatedNode.type.name !== SPARQL_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeSparqlNodeAttrs(updatedNode.attrs);
          if (document.activeElement !== title) {
            title.value = String(updatedNode.attrs.title ?? "");
          }
          if (!sourceEditor.hasFocus()) {
            sourceEditor.setValue(String(updatedNode.attrs.source ?? ""));
          }
          updateSpecialNodeFieldKnowledgeGraphProfile(
            sourceField,
            this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
          );
          renderResult();
          renderCollapsedState();
          specialHeader.refresh();
          return true;
        },
        ignoreMutation: () => true,
        destroy: () => {
          sourceEditor.destroy();
        }
      };
    };
  }
});
