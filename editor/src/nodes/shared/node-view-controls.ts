/** Provides shared lifecycle-safe controls for Special Node NodeViews. */

import type { Editor } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Trash2
} from "lucide";
import type { LodeonLocalization } from "../../localization/runtime";
import { renderIcon } from "../../ui/icons";

export const NODE_VIEW_CONTROL_SELECTOR = "input, textarea, button, select, [data-lodeon-node-control]";

const NODE_VIEW_ROOT_SELECTOR = "[data-lodeon-node]";
let activeSpecialNodeI18n: LodeonLocalization | undefined;

const NODE_VIEW_CONTROL_EVENTS = [
  "beforeinput",
  "input",
  "keydown",
  "keyup",
  "keypress",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
  "selectstart",
  "pointerdown",
  "pointerup",
  "pointermove",
  "compositionstart",
  "compositionupdate",
  "compositionend",
  "select",
  "focusin",
  "focusout"
];

type SuspendedDragState = {
  draggable: boolean;
  draggableAttribute: string | null;
};

const suspendedNodeDrags = new WeakMap<HTMLElement, SuspendedDragState>();
const focusedNodeControls = new WeakMap<HTMLElement, number>();

export function markNodeViewRoot<T extends HTMLElement>(element: T): T {
  element.contentEditable = "false";
  return element;
}

export function markNodeViewControl<T extends HTMLElement>(
  element: T,
  options: { allowDocumentRelease?: boolean } = {}
): T {
  element.contentEditable = "false";
  element.draggable = false;
  element.dataset.lodeonNodeControl = "true";

  NODE_VIEW_CONTROL_EVENTS.forEach((eventName) => {
    element.addEventListener(eventName, (event) => {
      if (eventName === "mousedown" || eventName === "pointerdown") {
        suspendNodeDragForControl(element);
      }
      if (eventName === "focusin") {
        suspendNodeDragWhileFocused(element);
      }
      if (eventName === "focusout") {
        restoreNodeDragAfterFocus(element);
      }
      if (!options.allowDocumentRelease || !["mouseup", "pointerup", "pointercancel"].includes(eventName)) {
        event.stopPropagation();
      }
    });
  });
  element.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  return element;
}

export function setSpecialNodeLocalization(i18n: LodeonLocalization | undefined): void {
  activeSpecialNodeI18n = i18n;
}

function suspendNodeDragWhileFocused(control: HTMLElement): void {
  const root = control.closest<HTMLElement>(NODE_VIEW_ROOT_SELECTOR);

  if (!root) {
    return;
  }

  const focusCount = focusedNodeControls.get(root) ?? 0;

  focusedNodeControls.set(root, focusCount + 1);
  suspendNodeDrag(root);
}

function restoreNodeDragAfterFocus(control: HTMLElement): void {
  const root = control.closest<HTMLElement>(NODE_VIEW_ROOT_SELECTOR);

  if (!root) {
    return;
  }

  const focusCount = Math.max((focusedNodeControls.get(root) ?? 1) - 1, 0);

  if (focusCount > 0) {
    focusedNodeControls.set(root, focusCount);
    return;
  }

  focusedNodeControls.delete(root);
  restoreNodeDrag(root);
}

function suspendNodeDragForControl(control: HTMLElement): void {
  const root = control.closest<HTMLElement>(NODE_VIEW_ROOT_SELECTOR);

  if (!root) {
    return;
  }

  suspendNodeDrag(root);

  const restore = () => restoreNodeDrag(root);
  const ownerDocument = control.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;

  ["mouseup", "pointerup", "pointercancel", "dragend"].forEach((eventName) => {
    ownerDocument.addEventListener(eventName, restore, {
      capture: true,
      once: true
    });
  });
  ownerWindow?.addEventListener("blur", restore, { once: true });
}

function suspendNodeDrag(root: HTMLElement): void {
  if (suspendedNodeDrags.has(root)) {
    root.draggable = false;
    return;
  }

  suspendedNodeDrags.set(root, {
    draggable: root.draggable,
    draggableAttribute: root.getAttribute("draggable")
  });
  root.draggable = false;
}

function restoreNodeDrag(root: HTMLElement): void {
  if (focusedNodeControls.has(root)) {
    return;
  }

  const state = suspendedNodeDrags.get(root);

  if (!state) {
    return;
  }

  suspendedNodeDrags.delete(root);
  root.draggable = state.draggable;

  if (state.draggableAttribute === null && !state.draggable) {
    root.removeAttribute("draggable");
  } else if (state.draggableAttribute !== null) {
    root.setAttribute("draggable", state.draggableAttribute);
  }
}

export function isNodeViewControlEvent(event: Event): boolean {
  const target = event.target;

  return target instanceof HTMLElement && Boolean(target.closest(NODE_VIEW_CONTROL_SELECTOR));
}

type NodePositionResolver = (() => number | undefined) | boolean;

export function dispatchNodeAttrs(
  editor: Editor,
  getPos: NodePositionResolver,
  attrs: Record<string, unknown>
): void {
  if (typeof getPos !== "function") {
    return;
  }

  const position = getPos();

  if (typeof position !== "number") {
    return;
  }

  const transaction = editor.view.state.tr.setNodeMarkup(position, undefined, attrs);

  editor.view.dispatch(transaction);
}

export function deleteNode(editor: Editor, getPos: NodePositionResolver): boolean {
  if (typeof getPos !== "function") return false;
  const pos = getPos();
  if (typeof pos !== "number") return false;
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  editor.view.focus();
  return true;
}

type NodeHeaderIconButtonOptions = {
  ariaLabel: string;
  icon: Parameters<typeof renderIcon>[0];
  title: string;
};

export function createNodeHeaderIconButton({
  ariaLabel,
  icon,
  title
}: NodeHeaderIconButtonOptions): HTMLButtonElement {
  const button = markNodeViewControl(document.createElement("button"));

  button.className = "ld-node-icon-button";
  button.type = "button";
  button.innerHTML = renderIcon(icon);
  button.setAttribute("aria-label", ariaLabel);
  button.title = title;

  return button;
}

export function createNodeCopyButton(label: string): HTMLButtonElement {
  return createNodeHeaderIconButton({
    ariaLabel: specialNodeText("header.copyAria", { label }),
    icon: Copy,
    title: specialNodeText("header.copyTitle")
  });
}

export function createNodeDeleteButton(label: string): HTMLButtonElement {
  return createNodeHeaderIconButton({
    ariaLabel: specialNodeText("header.deleteAria", { label }),
    icon: Trash2,
    title: specialNodeText("header.deleteTitle")
  });
}

export function createNodeRenderVisibilityButton(
  label: string,
  excludedFromRender: boolean
): HTMLButtonElement {
  const button = createNodeHeaderIconButton({
    ariaLabel: "",
    icon: excludedFromRender ? EyeOff : Eye,
    title: ""
  });

  setNodeRenderVisibilityButtonState(button, label, excludedFromRender);

  return button;
}

export function setNodeRenderVisibilityButtonState(
  button: HTMLButtonElement,
  label: string,
  excludedFromRender: boolean
): void {
  button.innerHTML = renderIcon(excludedFromRender ? EyeOff : Eye);
  button.setAttribute(
    "aria-label",
    excludedFromRender
      ? specialNodeText("header.includeAria", { label })
      : specialNodeText("header.excludeAria", { label })
  );
  button.title = excludedFromRender
    ? specialNodeText("header.includeTitle")
    : specialNodeText("header.excludeTitle");
  button.dataset.excludedFromRender = excludedFromRender ? "true" : "false";
}

type MoveDirection = "up" | "down";

type SpecialNodeHeaderControlName = "collapse" | "move" | "copy" | "renderVisibility" | "delete";

type SpecialNodeHeaderOptions = {
  editor: Editor;
  getPos: NodePositionResolver;
  label: string;
  labelKey?: string;
  eyebrow: string;
  eyebrowKey?: string;
  titleInput: HTMLElement;
  controls: Record<SpecialNodeHeaderControlName, boolean>;
  primaryActions?: HTMLElement[];
  collapsed?: boolean;
  excludedFromRender?: boolean;
};

type SpecialNodeHeaderControls = {
  collapseButton?: HTMLButtonElement;
  copyButton?: HTMLButtonElement;
  deleteButton?: HTMLButtonElement;
  dragHandle?: HTMLElement;
  moveButtons?: HTMLElement;
  renderVisibilityButton?: HTMLButtonElement;
};

export type SpecialNodeHeader = {
  element: HTMLDivElement;
  controls: SpecialNodeHeaderControls;
  refresh: () => void;
};

export function createSpecialNodeHeader({
  editor,
  getPos,
  label,
  labelKey,
  eyebrow,
  eyebrowKey,
  titleInput,
  controls,
  primaryActions = [],
  collapsed = false,
  excludedFromRender = false
}: SpecialNodeHeaderOptions): SpecialNodeHeader {
  const header = document.createElement("div");
  const eyebrowElement = document.createElement("span");
  const headerControls: SpecialNodeHeaderControls = {};
  const refreshCallbacks: Array<() => void> = [];

  header.className = "ld-node-header";
  eyebrowElement.className = "ld-node-eyebrow";
  const resolvedLabel = labelKey ? specialNodeText(labelKey) : label;
  eyebrowElement.textContent = eyebrowKey ? specialNodeText(eyebrowKey) : eyebrow;

  if (controls.move) {
    const reorderControls = createNodeReorderControls(editor, getPos, resolvedLabel);

    headerControls.dragHandle = reorderControls.dragHandle;
    headerControls.moveButtons = reorderControls.moveButtons;
    refreshCallbacks.push(reorderControls.refresh);
    header.append(reorderControls.dragHandle);
  }

  if (controls.collapse) {
    const collapseButton = createNodeHeaderIconButton({
      ariaLabel: collapsed
        ? specialNodeText("header.expandAria", { label: resolvedLabel })
        : specialNodeText("header.collapseAria", { label: resolvedLabel }),
      icon: collapsed ? ChevronRight : ChevronDown,
      title: collapsed ? specialNodeText("header.expandTitle") : specialNodeText("header.collapseTitle")
    });

    headerControls.collapseButton = collapseButton;
    header.append(collapseButton);
  }

  header.append(eyebrowElement, titleInput, ...primaryActions);

  if (headerControls.moveButtons) {
    header.append(headerControls.moveButtons);
  }

  if (controls.copy) {
    const copyButton = createNodeCopyButton(resolvedLabel);

    copyButton.addEventListener("click", () => {
      copyNode(editor, getPos);
      refreshCallbacks.forEach((refresh) => refresh());
    });
    headerControls.copyButton = copyButton;
    header.append(copyButton);
  }

  if (controls.renderVisibility) {
    const renderVisibilityButton = createNodeRenderVisibilityButton(resolvedLabel, excludedFromRender);
    const refreshRenderVisibilityButton = () => {
      const attrs = getCurrentNodeAttrs(editor, getPos);

      setNodeRenderVisibilityButtonState(
        renderVisibilityButton,
        resolvedLabel,
        Boolean(attrs?.excludeFromRender)
      );
    };

    renderVisibilityButton.addEventListener("click", () => {
      const attrs = getCurrentNodeAttrs(editor, getPos);

      if (!attrs) {
        return;
      }

      dispatchNodeAttrs(editor, getPos, {
        ...attrs,
        excludeFromRender: !attrs.excludeFromRender
      });
      refreshRenderVisibilityButton();
    });
    refreshCallbacks.push(refreshRenderVisibilityButton);
    headerControls.renderVisibilityButton = renderVisibilityButton;
    header.append(renderVisibilityButton);
  }

  if (controls.delete) {
    const deleteButton = createNodeDeleteButton(resolvedLabel);

    headerControls.deleteButton = deleteButton;
    header.append(deleteButton);
  }

  return {
    element: header,
    controls: headerControls,
    refresh: () => {
      refreshCallbacks.forEach((refresh) => refresh());
    }
  };
}

export function createNodeReorderControls(
  editor: Editor,
  getPos: NodePositionResolver,
  label: string
): { dragHandle: HTMLElement; moveButtons: HTMLElement; refresh: () => void } {
  const dragHandle = document.createElement("span");
  const moveButtons = document.createElement("div");
  const moveUpButton = markNodeViewControl(document.createElement("button"));
  const moveDownButton = markNodeViewControl(document.createElement("button"));

  dragHandle.className = "ld-node-drag-handle";
  dragHandle.contentEditable = "false";
  dragHandle.draggable = true;
  dragHandle.setAttribute("data-drag-handle", "");
  dragHandle.innerHTML = renderIcon(GripVertical);
  dragHandle.setAttribute("aria-label", specialNodeText("header.dragAria", { label }));
  dragHandle.title = specialNodeText("header.dragTitle", { label });

  moveButtons.className = "ld-node-move-buttons";
  moveButtons.contentEditable = "false";

  moveUpButton.className = "ld-node-icon-button";
  moveUpButton.type = "button";
  moveUpButton.innerHTML = renderIcon(ArrowUp);
  moveUpButton.setAttribute("aria-label", specialNodeText("header.moveUpAria", { label }));
  moveUpButton.title = specialNodeText("header.moveUpTitle");

  moveDownButton.className = "ld-node-icon-button";
  moveDownButton.type = "button";
  moveDownButton.innerHTML = renderIcon(ArrowDown);
  moveDownButton.setAttribute("aria-label", specialNodeText("header.moveDownAria", { label }));
  moveDownButton.title = specialNodeText("header.moveDownTitle");

  moveUpButton.addEventListener("click", () => {
    moveNode(editor, getPos, "up");
    refresh();
  });

  moveDownButton.addEventListener("click", () => {
    moveNode(editor, getPos, "down");
    refresh();
  });

  const refresh = () => {
    moveUpButton.disabled = !canMoveNode(editor, getPos, "up");
    moveDownButton.disabled = !canMoveNode(editor, getPos, "down");
  };

  moveButtons.append(moveUpButton, moveDownButton);
  refresh();

  return { dragHandle, moveButtons, refresh };
}

function getCurrentNodeAttrs(editor: Editor, getPos: NodePositionResolver): Record<string, unknown> | null {
  if (typeof getPos !== "function") {
    return null;
  }

  const pos = getPos();

  if (typeof pos !== "number") {
    return null;
  }

  const node = editor.state.doc.nodeAt(pos);

  return node ? { ...node.attrs } : null;
}

function copyNode(editor: Editor, getPos: NodePositionResolver): boolean {
  const context = resolveMovableNode(editor, getPos);

  if (!context) {
    return false;
  }

  const { node, pos } = context;
  const insertPos = pos + node.nodeSize;
  const scrollSnapshot = captureScrollSnapshot(editor.view.dom);
  const transaction = editor.state.tr.insert(insertPos, node.copy(node.content));

  transaction.setSelection(NodeSelection.create(transaction.doc, insertPos));
  editor.view.dispatch(transaction.scrollIntoView());
  restoreScrollSnapshot(scrollSnapshot);
  editor.view.focus();

  return true;
}

function canMoveNode(editor: Editor, getPos: NodePositionResolver, direction: MoveDirection): boolean {
  const context = resolveMovableNode(editor, getPos);

  if (!context) {
    return false;
  }

  if (direction === "up") {
    return context.index > 0;
  }

  return context.index < context.parent.childCount - 1;
}

function moveNode(editor: Editor, getPos: NodePositionResolver, direction: MoveDirection): boolean {
  const context = resolveMovableNode(editor, getPos);

  if (!context) {
    return false;
  }

  const { index, node, parent, pos } = context;

  if (direction === "up") {
    if (index <= 0) {
      return false;
    }

    const previous = parent.child(index - 1);
    const previousPos = pos - previous.nodeSize;
    const scrollSnapshot = captureScrollSnapshot(editor.view.dom);
    const transaction = editor.state.tr.replaceWith(
      previousPos,
      pos + node.nodeSize,
      Fragment.fromArray([node, previous])
    );

    editor.view.dispatch(transaction);
    restoreScrollSnapshot(scrollSnapshot);
    return true;
  }

  if (index >= parent.childCount - 1) {
    return false;
  }

  const next = parent.child(index + 1);
  const scrollSnapshot = captureScrollSnapshot(editor.view.dom);
  const transaction = editor.state.tr.replaceWith(
    pos,
    pos + node.nodeSize + next.nodeSize,
    Fragment.fromArray([next, node])
  );

  editor.view.dispatch(transaction);
  restoreScrollSnapshot(scrollSnapshot);
  return true;
}

function resolveMovableNode(
  editor: Editor,
  getPos: NodePositionResolver
): {
  index: number;
  node: NonNullable<ReturnType<Editor["state"]["doc"]["nodeAt"]>>;
  parent: ReturnType<Editor["state"]["doc"]["resolve"]>["parent"];
  pos: number;
} | null {
  if (typeof getPos !== "function") {
    return null;
  }

  const pos = getPos();

  if (typeof pos !== "number") {
    return null;
  }

  const node = editor.state.doc.nodeAt(pos);

  if (!node) {
    return null;
  }

  const resolved = editor.state.doc.resolve(pos);

  return {
    index: resolved.index(),
    node,
    parent: resolved.parent,
    pos
  };
}

type ScrollSnapshot = Array<{
  element: Element;
  left: number;
  top: number;
}>;

function captureScrollSnapshot(anchor: HTMLElement): ScrollSnapshot {
  const snapshot: ScrollSnapshot = [];
  let current: HTMLElement | null = anchor;

  while (current) {
    if (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth) {
      snapshot.push({
        element: current,
        left: current.scrollLeft,
        top: current.scrollTop
      });
    }

    current = current.parentElement;
  }

  const scrollingElement = anchor.ownerDocument.scrollingElement;

  if (scrollingElement) {
    snapshot.push({
      element: scrollingElement,
      left: scrollingElement.scrollLeft,
      top: scrollingElement.scrollTop
    });
  }

  return snapshot;
}

function restoreScrollSnapshot(snapshot: ScrollSnapshot): void {
  const restore = () => {
    for (const item of snapshot) {
      item.element.scrollLeft = item.left;
      item.element.scrollTop = item.top;
    }
  };

  restore();
  requestAnimationFrame(restore);
}

export function translateSpecialNodeText(
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>
): string {
  return activeSpecialNodeI18n?.t("special-nodes", key, values) ?? key;
}

export function createSpecialNodeField(
  label: string,
  control: HTMLElement,
  options: {
    className: string;
    additionalClassName?: string;
    complexControl?: boolean;
    modeAttribute?: string;
    mode?: string;
    labelIdPrefix?: string;
    knowledgeGraphProfile?: { id: string; label: string };
  }
): HTMLElement {
  const wrapper = options.complexControl ? document.createElement("div") : document.createElement("label");
  const heading = document.createElement("span");
  const labelElement = document.createElement("span");

  wrapper.className = [options.className, options.additionalClassName].filter(Boolean).join(" ");
  if (options.mode && options.modeAttribute) {
    wrapper.dataset[options.modeAttribute] = options.mode;
  }
  heading.className = "ld-special-node-field-heading";
  labelElement.className = "ld-special-node-field-label";
  labelElement.textContent = label;
  if (options.complexControl) {
    const labelId = `${options.labelIdPrefix ?? "special-node-field"}-${Math.random().toString(36).slice(2)}`;
    labelElement.id = labelId;
    control.setAttribute("aria-labelledby", labelId);
  }
  heading.append(labelElement);
  wrapper.append(heading, control);
  updateSpecialNodeFieldKnowledgeGraphProfile(wrapper, options.knowledgeGraphProfile);
  return wrapper;
}

/** Updates the compact KG profile metadata attached to a SPARQL field heading. */
export function updateSpecialNodeFieldKnowledgeGraphProfile(
  wrapper: HTMLElement,
  profile: { id: string; label: string } | undefined
): void {
  const heading = wrapper.querySelector<HTMLElement>(":scope > .ld-special-node-field-heading");
  if (!heading) return;

  let profileElement = heading.querySelector<HTMLElement>(".ld-special-node-field-profile");
  if (!profile) {
    profileElement?.remove();
    return;
  }
  if (!profileElement) {
    profileElement = document.createElement("span");
    profileElement.className = "ld-special-node-field-profile";
    heading.append(profileElement);
  }
  profileElement.textContent = profile.label;
  profileElement.title = profile.id;
  profileElement.dataset.knowledgeGraphProfileId = profile.id;
}

function specialNodeText(
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>
): string {
  return translateSpecialNodeText(key, values);
}
