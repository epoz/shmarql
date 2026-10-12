/** Implements the configurable Semantic Container TipTap extension. */

import { Node, mergeAttributes, type NodeViewRendererProps } from "@tiptap/core";
import { ChevronDown, ChevronRight } from "lucide";
import { translateSpecialNodeText } from "../nodes/shared/node-view-controls";
import {
  bindSemanticContainerMoveControls,
  createSemanticContainerActions,
  semanticContainerEditorHelpers,
  type SemanticContainerConfig,
  type SemanticContainerEditorViewContext,
  type SemanticContainerLabels
} from "./semantic-container-contract";
import { CORE_SEMANTIC_CONTAINER_VIEW, type EditorExtensionRegistry } from "../registry/editor";
import { renderIcon } from "../ui/icons";

export const SemanticContainer = Node.create<{
  labels: SemanticContainerLabels;
  containers: Record<string, SemanticContainerConfig>;
  editorRegistry?: EditorExtensionRegistry;
}>({
  name: "semanticContainer",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,

  addOptions() {
    return {
      labels: {},
      containers: {},
      editorRegistry: undefined
    };
  },

  addAttributes() {
    return {
      semanticContainer: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lodeon-semantic-container"),
        renderHTML: (attributes) => {
          const containerId = attributes.semanticContainer;

          if (typeof containerId !== "string" || !containerId) {
            return {};
          }

          return {
            "data-lodeon-semantic-container": containerId,
            "data-lodeon-container-label": this.options.labels[containerId] ?? containerId
          };
        }
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lodeon-container-title"),
        renderHTML: (attributes) =>
          typeof attributes.title === "string" && attributes.title
            ? { "data-lodeon-container-title": attributes.title }
            : {}
      },
      summary: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lodeon-container-summary"),
        renderHTML: (attributes) =>
          typeof attributes.summary === "string" && attributes.summary
            ? { "data-lodeon-container-summary": attributes.summary }
            : {}
      },
      open: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lodeon-container-open") === "true",
        renderHTML: (attributes) => (attributes.open === true ? { "data-lodeon-container-open": "true" } : {})
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
    return [{ tag: "div[data-lodeon-semantic-container]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return (props) => {
      const containerId = readContainerId(props.node.attrs.semanticContainer);
      const label = this.options.labels[containerId] ?? containerId;
      const config = this.options.containers[containerId];
      const componentId = readSemanticContainerViewComponentId(config);
      const view =
        this.options.editorRegistry?.getSemanticContainerView<SemanticContainerConfig>(componentId);

      if (!view) {
        throw new Error("editor.registry.semantic_container_component_missing");
      }

      return view.create(props, {
        containerId,
        label,
        config,
        labels: this.options.labels,
        containers: this.options.containers,
        createActions: (getCurrentNode) => createSemanticContainerActions(props, getCurrentNode),
        helpers: semanticContainerEditorHelpers
      });
    };
  }
});

function createSemanticContainerNodeView(
  props: NodeViewRendererProps,
  context: SemanticContainerEditorViewContext<SemanticContainerConfig>
) {
  const dom = document.createElement("section");
  const title = context.helpers.markControl(document.createElement("input"));
  const body = document.createElement("div");
  const settings = document.createElement("div");
  const contentDOM = document.createElement("div");
  let currentNode = props.node;

  dom.className = "ld-node ld-semantic-container";
  dom.dataset.lodeonNode = "semantic-container";
  title.className = "ld-node-title-input";
  title.type = "text";
  title.setAttribute("aria-label", translateSpecialNodeText("nodes.semanticContainer.titleAria"));
  body.className = "ld-node-body";
  settings.className = "ld-semantic-container-settings";
  contentDOM.className = "ld-node-content ld-semantic-container-content";
  settings.contentEditable = "false";

  const actions = context.createActions(() => currentNode);

  const containerId = readContainerId(currentNode.attrs.semanticContainer);
  const specialHeader = context.helpers.createHeader({
    editor: props.editor,
    getPos: props.getPos,
    label: "semantic-container",
    labelKey: "nodes.semanticContainer.headerLabel",
    eyebrow: context.labels[containerId] ?? containerId,
    titleInput: title,
    controls: {
      collapse: true,
      move: true,
      copy: true,
      renderVisibility: true,
      delete: true
    },
    collapsed: Boolean(currentNode.attrs.collapsed),
    excludedFromRender: Boolean(currentNode.attrs.excludeFromRender)
  });
  const header = specialHeader.element;
  const collapseButton = specialHeader.controls.collapseButton!;
  const deleteButton = specialHeader.controls.deleteButton!;

  header.contentEditable = "false";
  body.append(settings, contentDOM);
  dom.append(header, body);

  const render = () => {
    const containerId = readContainerId(currentNode.attrs.semanticContainer);
    const config = context.containers[containerId];
    const label = context.labels[containerId] ?? containerId;

    dom.dataset.lodeonSemanticContainer = containerId;
    dom.dataset.lodeonContainerLabel = label;
    const titleValue =
      typeof currentNode.attrs.title === "string" && currentNode.attrs.title
        ? currentNode.attrs.title
        : label;
    if (typeof currentNode.attrs.title === "string" && currentNode.attrs.title) {
      dom.dataset.lodeonContainerTitle = currentNode.attrs.title;
    } else {
      delete dom.dataset.lodeonContainerTitle;
    }
    const summary = currentNode.attrs.summary;
    if (typeof summary === "string" && summary) {
      dom.dataset.lodeonContainerSummary = summary;
    } else {
      delete dom.dataset.lodeonContainerSummary;
    }
    if (currentNode.attrs.open === true) {
      dom.dataset.lodeonContainerOpen = "true";
    } else {
      delete dom.dataset.lodeonContainerOpen;
    }
    dom.dataset.collapsed = currentNode.attrs.collapsed ? "true" : "false";
    dom.dataset.excludedFromRender = currentNode.attrs.excludeFromRender ? "true" : "false";
    if (title.ownerDocument.activeElement !== title) {
      title.value = titleValue;
    }
    body.hidden = Boolean(currentNode.attrs.collapsed);
    collapseButton.innerHTML = renderIcon(currentNode.attrs.collapsed ? ChevronRight : ChevronDown);
    collapseButton.setAttribute(
      "aria-label",
      currentNode.attrs.collapsed
        ? translateSpecialNodeText("header.expandAria", {
            label: translateSpecialNodeText("nodes.semanticContainer.headerLabel")
          })
        : translateSpecialNodeText("header.collapseAria", {
            label: translateSpecialNodeText("nodes.semanticContainer.headerLabel")
          })
    );
    collapseButton.title = currentNode.attrs.collapsed
      ? translateSpecialNodeText("header.expandTitle")
      : translateSpecialNodeText("header.collapseTitle");
    context.helpers.renderSettingsControls(
      settings,
      currentNode.attrs,
      actions.updateAttributes,
      config?.ui?.fields ?? []
    );
  };

  render();

  context.helpers.bindControl(collapseButton, () => {
    actions.updateAttributes({
      collapsed: !currentNode.attrs.collapsed
    });
  });

  context.helpers.bindControl(deleteButton, actions.deleteNode);
  title.addEventListener("input", () => {
    actions.updateAttributes({
      title: title.value.trim() ? title.value : null
    });
  });
  context.helpers.bindControl(specialHeader.controls.copyButton, actions.copyNode);
  context.helpers.bindControl(specialHeader.controls.renderVisibilityButton, () => {
    actions.updateAttributes({
      excludeFromRender: !currentNode.attrs.excludeFromRender
    });
  });
  bindSemanticContainerMoveControls(specialHeader.controls.moveButtons, actions);

  return {
    dom,
    contentDOM,
    stopEvent: (event: Event) => context.helpers.isControlEvent(event),
    update: (node: typeof props.node) => {
      if (node.type !== currentNode.type) {
        return false;
      }
      currentNode = node;
      render();
      specialHeader.refresh();
      return true;
    },
    ignoreMutation: (mutation: MutationRecord | { type: "selection"; target: globalThis.Node }) =>
      context.helpers.shouldIgnoreMutation(mutation, {
        nodeViewRoot: dom,
        contentDOM,
        controlRoots: [header, settings]
      })
  };
}

export function registerCoreSemanticContainerViews(registry: EditorExtensionRegistry): void {
  if (registry.getSemanticContainerView(CORE_SEMANTIC_CONTAINER_VIEW)) {
    return;
  }

  registry.registerSemanticContainerView<SemanticContainerConfig>({
    id: CORE_SEMANTIC_CONTAINER_VIEW,
    create: createSemanticContainerNodeView
  });
}

function readContainerId(value: unknown): string {
  return typeof value === "string" && value ? value : "semantic-container";
}

function readSemanticContainerViewComponentId(config: SemanticContainerConfig | undefined): string {
  return typeof config?.editorDisplay?.component === "string" && config.editorDisplay.component
    ? config.editorDisplay.component
    : CORE_SEMANTIC_CONTAINER_VIEW;
}
