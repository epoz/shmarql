/** Defines persisted Semantic Container attributes and extension contracts. */

import type { NodeViewRendererProps } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import {
  createSpecialNodeHeader,
  isNodeViewControlEvent,
  markNodeViewControl,
  type SpecialNodeHeader
} from "../nodes/shared/node-view-controls";

export type SemanticContainerLabels = Record<string, string>;

export type SemanticContainerField = {
  id: string;
  label?: string;
  type?: string;
  default?: unknown;
};

export type SemanticContainerConfig = {
  label?: string;
  ui?: {
    optionLabel?: string;
    fields?: SemanticContainerField[];
  };
  editorDisplay?: {
    label?: string;
    component?: string;
  };
};

export type SemanticContainerMutation = MutationRecord | { type: "selection"; target: globalThis.Node };

export type SemanticContainerEditorActions = {
  updateAttributes: (attributes: Record<string, unknown>) => void;
  deleteNode: () => void;
  copyNode: () => void;
  moveNode: (direction: "up" | "down") => void;
};

export type SemanticContainerEditorHelpers = {
  bindControl: typeof bindSemanticContainerControl;
  createHeader: typeof createSpecialNodeHeader;
  isControlEvent: typeof isNodeViewControlEvent;
  markControl: typeof markNodeViewControl;
  renderSettingsControls: typeof renderSemanticContainerSettingsControls;
  shouldIgnoreMutation: typeof shouldIgnoreSemanticContainerMutation;
};

export type SemanticContainerEditorViewContext<Config = SemanticContainerConfig> = {
  containerId: string;
  label: string;
  config: Config | undefined;
  labels: Record<string, string>;
  containers: Record<string, Config>;
  createActions: (getCurrentNode: () => NodeViewRendererProps["node"]) => SemanticContainerEditorActions;
  helpers: SemanticContainerEditorHelpers;
};

export const semanticContainerEditorHelpers: SemanticContainerEditorHelpers = {
  bindControl: bindSemanticContainerControl,
  createHeader: createSpecialNodeHeader,
  isControlEvent: isNodeViewControlEvent,
  markControl: markNodeViewControl,
  renderSettingsControls: renderSemanticContainerSettingsControls,
  shouldIgnoreMutation: shouldIgnoreSemanticContainerMutation
};

export function createSemanticContainerActions(
  props: NodeViewRendererProps,
  getCurrentNode: () => NodeViewRendererProps["node"]
): SemanticContainerEditorActions {
  return {
    updateAttributes: (attributes) => {
      const currentNode = getCurrentNode();

      dispatchSemanticContainerAttrs(props, currentNode, {
        ...currentNode.attrs,
        ...attributes
      });
    },
    deleteNode: () => deleteSemanticContainer(props, getCurrentNode()),
    copyNode: () => copySemanticContainer(props),
    moveNode: (direction) => moveSemanticContainer(props, direction)
  };
}

export function shouldIgnoreSemanticContainerMutation(
  mutation: SemanticContainerMutation,
  elements: {
    nodeViewRoot: HTMLElement;
    contentDOM: HTMLElement;
    controlRoots: HTMLElement[];
  }
): boolean {
  if (mutation.type === "selection") {
    return false;
  }

  if (elements.contentDOM.contains(mutation.target)) {
    return false;
  }

  return (
    elements.controlRoots.some((controlRoot) => controlRoot.contains(mutation.target)) ||
    elements.nodeViewRoot.contains(mutation.target)
  );
}

export function bindSemanticContainerMoveControls(
  moveButtons: HTMLElement | undefined,
  actions: SemanticContainerEditorActions
): void {
  const buttons = Array.from(moveButtons?.querySelectorAll<HTMLButtonElement>("button") ?? []);

  bindSemanticContainerControl(buttons[0], () => actions.moveNode("up"));
  bindSemanticContainerControl(buttons[1], () => actions.moveNode("down"));
}

export function bindSemanticContainerControl(button: HTMLElement | undefined, action: () => void): void {
  if (!button) {
    return;
  }

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.detail === 0) {
        action();
      }
    },
    { capture: true }
  );
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  });
}

export function dispatchSemanticContainerAttrs(
  props: NodeViewRendererProps,
  currentNode: NodeViewRendererProps["node"],
  attrs: Record<string, unknown>
): void {
  const position = readSemanticContainerPosition(props);

  if (position === null) {
    return;
  }

  props.view.dispatch(props.view.state.tr.setNodeMarkup(position, currentNode.type, attrs));
}

export function deleteSemanticContainer(
  props: NodeViewRendererProps,
  currentNode: NodeViewRendererProps["node"]
): void {
  const position = readSemanticContainerPosition(props);

  if (position === null) {
    return;
  }

  props.view.dispatch(props.view.state.tr.delete(position, position + currentNode.nodeSize));
}

export function copySemanticContainer(props: NodeViewRendererProps): void {
  const position = readSemanticContainerPosition(props);

  if (position === null) {
    return;
  }

  const node = props.view.state.doc.nodeAt(position);

  if (!node) {
    return;
  }

  const insertPosition = position + node.nodeSize;
  const transaction = props.view.state.tr.insert(insertPosition, node.copy(node.content));

  transaction.setSelection(NodeSelection.create(transaction.doc, insertPosition));
  props.view.dispatch(transaction);
}

export function moveSemanticContainer(props: NodeViewRendererProps, direction: "up" | "down"): void {
  const position = readSemanticContainerPosition(props);

  if (position === null) {
    return;
  }

  const node = props.view.state.doc.nodeAt(position);

  if (!node) {
    return;
  }

  const resolved = props.view.state.doc.resolve(position);
  const parent = resolved.parent;
  const index = resolved.index();

  if (direction === "up") {
    if (index <= 0) {
      return;
    }

    const previous = parent.child(index - 1);
    const previousPosition = position - previous.nodeSize;

    props.view.dispatch(
      props.view.state.tr.replaceWith(
        previousPosition,
        position + node.nodeSize,
        Fragment.fromArray([node, previous])
      )
    );
    return;
  }

  if (index >= parent.childCount - 1) {
    return;
  }

  const next = parent.child(index + 1);

  props.view.dispatch(
    props.view.state.tr.replaceWith(
      position,
      position + node.nodeSize + next.nodeSize,
      Fragment.fromArray([next, node])
    )
  );
}

export function readSemanticContainerPosition(props: NodeViewRendererProps): number | null {
  if (typeof props.getPos !== "function") {
    return null;
  }

  const position = props.getPos();

  return typeof position === "number" ? position : null;
}

export function renderSemanticContainerSettingsControls(
  settings: HTMLElement,
  attrs: Record<string, unknown>,
  updateAttributes: (attributes: Record<string, unknown>) => void,
  fields: SemanticContainerField[]
): void {
  if (settings.contains(settings.ownerDocument.activeElement)) {
    return;
  }

  const controls = createFieldControls(attrs, updateAttributes, fields);
  settings.hidden = controls.length === 0;
  settings.replaceChildren(...controls);
}

function createFieldControls(
  attrs: Record<string, unknown>,
  updateAttributes: (attributes: Record<string, unknown>) => void,
  fields: SemanticContainerField[]
): HTMLElement[] {
  return fields
    .filter((field) => field.id)
    .map((field) => {
      if (field.type === "boolean") {
        return createBooleanFieldControl(attrs, updateAttributes, field);
      }

      return createTextFieldControl(attrs, updateAttributes, field);
    });
}

function createTextFieldControl(
  attrs: Record<string, unknown>,
  updateAttributes: (attributes: Record<string, unknown>) => void,
  field: SemanticContainerField
): HTMLElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  const input = markNodeViewControl(document.createElement("input"));

  label.className = "ld-semantic-container-field";
  text.textContent = field.label ?? field.id;
  input.type = "text";
  input.value = String(attrs[field.id] ?? field.default ?? "");
  input.addEventListener("input", () => {
    updateAttributes({ [field.id]: input.value });
  });
  label.append(text, input);

  return label;
}

function createBooleanFieldControl(
  attrs: Record<string, unknown>,
  updateAttributes: (attributes: Record<string, unknown>) => void,
  field: SemanticContainerField
): HTMLElement {
  const label = document.createElement("label");
  const text = document.createElement("span");
  const input = markNodeViewControl(document.createElement("input"));

  label.className = "ld-semantic-container-field ld-semantic-container-field-boolean";
  text.textContent = field.label ?? field.id;
  input.type = "checkbox";
  input.checked = attrs[field.id] === true;
  input.addEventListener("change", () => {
    updateAttributes({ [field.id]: input.checked });
  });
  label.append(input, text);

  return label;
}

export type { SpecialNodeHeader };
