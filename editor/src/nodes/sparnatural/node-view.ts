/** Owns the Sparnatural Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, WandSparkles } from "lucide";
import { executeSparqlQuery, type SparqlExecutionResult } from "../sparql/api-client";
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
import { renderSparqlResult } from "../sparql/result-view";
import { createSparqlSourceEditor } from "../sparql/source-editor";
import {
  SPARNATURAL_NODE_TYPE_NAME,
  type SparnaturalNodeAttrs,
  type SparnaturalNodeOptions
} from "./contracts";
import { normalizeSparnaturalNodeAttrs } from "./factory";

function createEmptyQueryError(endpointUrl: string): SparqlExecutionResult {
  return {
    status: "error",
    endpointUrl,
    executedAt: new Date().toISOString(),
    durationMs: 0,
    code: "sparql.query_empty",
    message: "sparql.query_empty"
  };
}

/** Owns the visual-query-builder instance and destroys it with the NodeView while persisting only query state. */
export const SparnaturalNode = Node.create<SparnaturalNodeOptions>({
  name: SPARNATURAL_NODE_TYPE_NAME,
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
      id: {
        default: null
      },
      kind: {
        default: "sparnatural"
      },
      title: {
        default: translateSpecialNodeText("registry.sparnatural.label")
      },
      source: {
        default: ""
      },
      queryJson: {
        default: null
      },
      configId: {
        default: this.options.defaultConfigId
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
    return [{ tag: "section[data-lodeon-node='sparnatural']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "sparnatural",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeSparnaturalNodeAttrs(node.attrs);
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const editButton = markNodeViewControl(document.createElement("button"));
      const runButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const sourceEditor = createSparqlSourceEditor({
        value: String(node.attrs.source ?? ""),
        className: "ld-sparnatural-source-editor",
        ariaLabel: translateSpecialNodeText("aria.querySource"),
        placeholder: translateSpecialNodeText("placeholders.visualQueryBuilderSource")
      });
      const sourceField = createSpecialNodeField(
        translateSpecialNodeText("fields.sparqlQuery"),
        sourceEditor.element,
        {
          className: "ld-sparql-field",
          complexControl: true,
          labelIdPrefix: "sparnatural-query",
          knowledgeGraphProfile: this.options.resolveKnowledgeGraphProfile(
            currentAttrs.knowledgeGraphProfileId
          )
        }
      );
      const footer = document.createElement("div");
      const resultContainer = document.createElement("div");

      container.className = "ld-node ld-sparql-node ld-sparnatural-node";
      container.dataset.lodeonNode = "sparnatural";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.sparnatural.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.sparnatural.titleAria"));

      editButton.className = "ld-node-run-button";
      editButton.type = "button";
      editButton.innerHTML = `${renderIcon(WandSparkles)}<span>${translateSpecialNodeText(
        "actions.visualQueryBuilder"
      )}</span>`;
      editButton.setAttribute("aria-label", translateSpecialNodeText("actions.openVisualQueryBuilder"));

      runButton.className = "ld-node-run-button";
      runButton.type = "button";
      runButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.run")}</span>`;
      runButton.setAttribute("aria-label", translateSpecialNodeText("actions.runQuery"));

      body.className = "ld-node-body";
      footer.className = "ld-node-footer";
      resultContainer.className = "ld-sparql-result";

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "sparnatural",
        labelKey: "nodes.sparnatural.headerLabel",
        eyebrow: "sparnatural",
        eyebrowKey: "nodes.sparnatural.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [editButton, runButton]
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
                label: translateSpecialNodeText("nodes.sparnatural.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.sparnatural.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
      };

      const updateAttrs = (attrs: Partial<SparnaturalNodeAttrs>) => {
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
        updateAttrs({
          source: value,
          queryJson: null,
          result: null
        });
      });

      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
      });

      editButton.addEventListener("click", () => {
        void (async () => {
          const output = await this.options.openBuilder?.({
            id: currentAttrs.id,
            title: currentAttrs.title,
            source: currentAttrs.source,
            queryJson: currentAttrs.queryJson,
            configId: currentAttrs.configId,
            knowledgeGraphProfileId: currentAttrs.knowledgeGraphProfileId
          });

          if (!output) {
            return;
          }

          updateAttrs({
            source: output.source ?? currentAttrs.source,
            queryJson: output.queryJson ?? currentAttrs.queryJson,
            configId: output.configId ?? currentAttrs.configId,
            knowledgeGraphProfileId: output.knowledgeGraphProfileId ?? currentAttrs.knowledgeGraphProfileId,
            result: null
          });
        })();
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
            updateAttrs({ result: createEmptyQueryError(profile.sparqlUrl) });
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
          if (updatedNode.type.name !== SPARNATURAL_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeSparnaturalNodeAttrs(updatedNode.attrs);
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
