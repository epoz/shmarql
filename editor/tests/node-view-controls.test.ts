import { beforeEach, describe, expect, it } from "vitest";
import { createLocalization } from "@lodeon/localization/runtime";
import {
  createNodeCopyButton,
  createNodeDeleteButton,
  createNodeReorderControls,
  createNodeRenderVisibilityButton,
  createSpecialNodeField,
  createSpecialNodeHeader,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  setNodeRenderVisibilityButtonState,
  setSpecialNodeLocalization,
  updateSpecialNodeFieldKnowledgeGraphProfile
} from "@lodeon/nodes/shared/node-view-controls";
import { defaultConfig } from "./fixtures/config";

describe("interactive node view controls", () => {
  beforeEach(() => {
    setSpecialNodeLocalization(createLocalization(defaultConfig));
  });

  it("marks node view roots and controls as non-contenteditable", () => {
    const root = markNodeViewRoot(document.createElement("section"));
    const textarea = markNodeViewControl(document.createElement("textarea"));

    expect(root.contentEditable).toBe("false");
    expect(textarea.contentEditable).toBe("false");
    expect(textarea.draggable).toBe(false);
    expect(textarea.dataset.lodeonNodeControl).toBe("true");
  });

  it("stops editor event handling for form controls inside node views", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));
    const nested = document.createElement("span");

    textarea.append(nested);
    root.append(textarea);

    const event = new Event("keydown", { bubbles: true });
    Object.defineProperty(event, "target", {
      configurable: true,
      value: nested
    });

    expect(isNodeViewControlEvent(event)).toBe(true);
  });

  it("keeps mouse events from bubbling out of marked controls", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));
    let bubbled = false;

    root.addEventListener("mousedown", () => {
      bubbled = true;
    });
    root.append(textarea);
    textarea.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(bubbled).toBe(false);
  });

  it("prevents drag start from marked controls without bubbling to the node", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));
    let bubbled = false;

    root.addEventListener("dragstart", () => {
      bubbled = true;
    });
    root.append(textarea);

    const event = new Event("dragstart", {
      bubbles: true,
      cancelable: true
    });

    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bubbled).toBe(false);
  });

  it("allows text selection in marked controls while keeping selection events local", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));
    let bubbled = false;

    root.addEventListener("selectstart", () => {
      bubbled = true;
    });
    root.append(textarea);

    const event = new Event("selectstart", {
      bubbles: true,
      cancelable: true
    });

    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(bubbled).toBe(false);
  });

  it("temporarily disables parent node dragging while controls are pressed", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));

    root.dataset.lodeonNode = "sparql";
    root.draggable = true;
    root.append(textarea);

    textarea.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );

    expect(root.draggable).toBe(false);

    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true })
    );

    expect(root.draggable).toBe(true);
  });

  it("keeps parent node dragging disabled while a control is focused", () => {
    const root = document.createElement("section");
    const textarea = markNodeViewControl(document.createElement("textarea"));

    root.dataset.lodeonNode = "sparql";
    root.draggable = true;
    root.append(textarea);

    textarea.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

    expect(root.draggable).toBe(false);

    document.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true })
    );

    expect(root.draggable).toBe(false);

    textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(root.draggable).toBe(true);
  });

  it("marks reorder drag handles for Tiptap drag-handle handling", () => {
    const { dragHandle } = createNodeReorderControls(
      {} as Parameters<typeof createNodeReorderControls>[0],
      false,
      "test node"
    );

    expect(dragHandle.draggable).toBe(true);
    expect(dragHandle.hasAttribute("data-drag-handle")).toBe(true);
  });

  it("creates shared header action buttons as node view controls", () => {
    const copyButton = createNodeCopyButton("test node");
    const deleteButton = createNodeDeleteButton("test node");

    expect(copyButton.dataset.lodeonNodeControl).toBe("true");
    expect(copyButton.getAttribute("aria-label")).toBe("Copy test node");
    expect(copyButton.title).toBe("Copy node");
    expect(deleteButton.dataset.lodeonNodeControl).toBe("true");
    expect(deleteButton.getAttribute("aria-label")).toBe("Delete test node");
    expect(deleteButton.title).toBe("Delete node");
  });

  it("updates shared render visibility button state", () => {
    const button = createNodeRenderVisibilityButton("test node", false);

    expect(button.dataset.excludedFromRender).toBe("false");
    expect(button.getAttribute("aria-label")).toBe(
      "Exclude test node from rendered output"
    );
    expect(button.title).toBe("Exclude from rendered output");

    setNodeRenderVisibilityButtonState(button, "test node", true);

    expect(button.dataset.excludedFromRender).toBe("true");
    expect(button.getAttribute("aria-label")).toBe(
      "Include test node in rendered output"
    );
    expect(button.title).toBe("Include in rendered output");
  });

  it("creates special node headers from the shared control pool", () => {
    const titleInput = markNodeViewControl(document.createElement("input"));
    const runButton = markNodeViewControl(document.createElement("button"));

    titleInput.className = "ld-node-title-input";
    runButton.className = "ld-node-run-button";
    runButton.textContent = "Run";

    const header = createSpecialNodeHeader({
      editor: {} as Parameters<typeof createSpecialNodeHeader>[0]["editor"],
      getPos: false,
      label: "test node",
      eyebrow: "TEST",
      titleInput,
      primaryActions: [runButton],
      controls: {
        collapse: true,
        move: false,
        copy: true,
        renderVisibility: true,
        delete: true
      }
    });

    expect(header.element.className).toBe("ld-node-header");
    expect(header.controls.collapseButton?.title).toBe("Collapse node");
    expect(header.controls.copyButton?.title).toBe("Copy node");
    expect(header.controls.renderVisibilityButton?.title).toBe(
      "Exclude from rendered output"
    );
    expect(header.controls.deleteButton?.title).toBe("Delete node");
    expect(
      Array.from(header.element.children).map((child) => {
        if (child === titleInput) {
          return "title";
        }
        if (child === runButton) {
          return "run";
        }
        return child instanceof HTMLButtonElement
          ? child.title
          : child.textContent || child.className;
      })
    ).toEqual([
      "Collapse node",
      "TEST",
      "title",
      "run",
      "Copy node",
      "Exclude from rendered output",
      "Delete node"
    ]);
  });

  it("creates simple and complex special node fields through one DOM contract", () => {
    const input = document.createElement("input");
    const simple = createSpecialNodeField("Title", input, {
      className: "ld-fixture-field",
      additionalClassName: "ld-extra-field",
      modeAttribute: "fixtureFieldMode",
      mode: "direct"
    });

    expect(simple.tagName).toBe("LABEL");
    expect(simple.className).toBe("ld-fixture-field ld-extra-field");
    expect(simple.dataset.fixtureFieldMode).toBe("direct");
    expect(simple.firstElementChild?.textContent).toBe("Title");
    expect(simple.lastElementChild).toBe(input);

    const editor = document.createElement("div");
    const complex = createSpecialNodeField("Query", editor, {
      className: "ld-fixture-field",
      complexControl: true,
      labelIdPrefix: "fixture-query"
    });

    expect(complex.tagName).toBe("DIV");
    const complexLabel = complex.querySelector<HTMLElement>(".ld-special-node-field-label");
    expect(complexLabel?.id).toMatch(/^fixture-query-/);
    expect(editor.getAttribute("aria-labelledby")).toBe(
      complexLabel?.id
    );

    updateSpecialNodeFieldKnowledgeGraphProfile(complex, {
      id: "fixture-kg",
      label: "Fixture KG"
    });
    const profile = complex.querySelector<HTMLElement>(".ld-special-node-field-profile");
    expect(profile?.textContent).toBe("Fixture KG");
    expect(profile?.title).toBe("fixture-kg");
    updateSpecialNodeFieldKnowledgeGraphProfile(complex, undefined);
    expect(complex.querySelector(".ld-special-node-field-profile")).toBeNull();
  });
});
