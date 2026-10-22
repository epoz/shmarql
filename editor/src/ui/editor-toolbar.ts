/** Renders and binds the configured Editor toolbar. */

import type { Editor } from "@tiptap/core";
import type { LodeonRuntime } from "../application/contracts";

type FormatCommand =
  | "undo"
  | "redo"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "link"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule"
  | "image"
  | "table"
  | "addColumnAfter"
  | "deleteColumn"
  | "addRowAfter"
  | "deleteRow"
  | "deleteTable"
  | "zoomOut"
  | "zoomReset"
  | "zoomIn";

const editorZoomStorageKey = "lodeon.editorZoom";
const zoomMin = 0.85;
const zoomMax = 1.25;
const zoomStep = 0.05;

export function bindEditorToolbar(
  root: HTMLElement,
  editor: Editor,
  runtime: LodeonRuntime,
  options: { onManualSave?: () => void } = {}
): () => void {
  const linkPopover = root.querySelector<HTMLElement>("[data-link-popover]");
  const linkInput = root.querySelector<HTMLInputElement>("[data-link-url]");
  const imagePopover = root.querySelector<HTMLElement>("[data-image-popover]");
  const imageInput = root.querySelector<HTMLInputElement>("[data-image-url]");
  const updateToolbarState = () => updateFormatButtonStates(root, editor, runtime);
  const closePopovers = () => {
    hideToolbarPopover(linkPopover);
    hideToolbarPopover(imagePopover);
  };
  const handleDocumentPointerDown = (event: PointerEvent) => {
    const target = event.target;

    if (!(target instanceof Node)) {
      return;
    }

    if (!linkPopover?.contains(target) && !imagePopover?.contains(target)) {
      closePopovers();
    }
  };
  const handleDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      closePopovers();
      editor.commands.focus();
    }
  };

  applyEditorZoom(root, readEditorZoom());

  root.querySelectorAll<HTMLButtonElement>("[data-format-command]").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      runFormatCommand(editor, button.dataset.formatCommand as FormatCommand, root);
    });
  });

  const manualSaveButton = root.querySelector<HTMLButtonElement>("[data-manual-save]");
  manualSaveButton?.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  manualSaveButton?.addEventListener("click", (event) => {
    event.preventDefault();
    options.onManualSave?.();
  });

  root.querySelector<HTMLSelectElement>("[data-node-insert-select]")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    const nodeId = select.value;

    if (nodeId) {
      runtime.commands.insertNode?.(nodeId);
      select.value = "";
    }
  });

  root.querySelector<HTMLSelectElement>("[data-block-select]")?.addEventListener("change", (event) => {
    const select = event.currentTarget as HTMLSelectElement;
    applyBlockType(editor, select.value);
    updateToolbarState();
  });

  root
    .querySelector<HTMLSelectElement>("[data-semantic-block-select]")
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      applySemanticBlockFormat(editor, runtime, select.value);
      updateToolbarState();
    });

  root
    .querySelector<HTMLSelectElement>("[data-semantic-inline-select]")
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      applySemanticInlineFormat(editor, select.value);
      updateToolbarState();
    });

  root
    .querySelector<HTMLSelectElement>("[data-semantic-container-select]")
    ?.addEventListener("change", (event) => {
      const select = event.currentTarget as HTMLSelectElement;
      applySemanticContainer(editor, runtime, select.value);
      select.value = "";
      updateToolbarState();
    });

  root.querySelector<HTMLFormElement>("[data-link-popover]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const href = linkInput?.value.trim() ?? "";

    if (href.length === 0) {
      editor.chain().focus().unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    closePopovers();
    updateToolbarState();
  });

  root.querySelector<HTMLButtonElement>("[data-link-remove]")?.addEventListener("click", () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    closePopovers();
    updateToolbarState();
  });

  root.querySelector<HTMLFormElement>("[data-image-popover]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const src = imageInput?.value.trim() ?? "";

    if (src.length > 0) {
      editor.chain().focus().setImage({ src }).run();
    }

    closePopovers();
    updateToolbarState();
  });

  root.querySelectorAll<HTMLButtonElement>("[data-toolbar-popover-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      closePopovers();
      editor.commands.focus();
    });
  });

  document.addEventListener("pointerdown", handleDocumentPointerDown);
  document.addEventListener("keydown", handleDocumentKeyDown);

  editor.on("selectionUpdate", updateToolbarState);
  editor.on("update", updateToolbarState);
  updateToolbarState();

  return () => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
    document.removeEventListener("keydown", handleDocumentKeyDown);
    editor.off("selectionUpdate", updateToolbarState);
    editor.off("update", updateToolbarState);
  };
}

function runFormatCommand(editor: Editor, command: FormatCommand, root: HTMLElement): void {
  if (command === "bold") {
    editor.chain().focus().toggleBold().run();
  }
  if (command === "italic") {
    editor.chain().focus().toggleItalic().run();
  }
  if (command === "underline") {
    editor.chain().focus().toggleUnderline().run();
  }
  if (command === "strike") {
    editor.chain().focus().toggleStrike().run();
  }
  if (command === "undo") {
    editor.chain().focus().undo().run();
  }
  if (command === "redo") {
    editor.chain().focus().redo().run();
  }
  if (command === "link") {
    const previousHref = editor.getAttributes("link").href as string | undefined;
    showLinkPopover(root, previousHref ?? "");
    return;
  }
  if (command === "bulletList") {
    editor.chain().focus().toggleBulletList().run();
  }
  if (command === "orderedList") {
    editor.chain().focus().toggleOrderedList().run();
  }
  if (command === "blockquote") {
    editor.chain().focus().toggleBlockquote().run();
  }
  if (command === "codeBlock") {
    editor.chain().focus().toggleCodeBlock().run();
  }
  if (command === "horizontalRule") {
    editor.chain().focus().setHorizontalRule().run();
  }
  if (command === "image") {
    showImagePopover(root);
    return;
  }
  if (command === "table") {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }
  if (command === "addColumnAfter") {
    editor.chain().focus().addColumnAfter().run();
  }
  if (command === "deleteColumn") {
    editor.chain().focus().deleteColumn().run();
  }
  if (command === "addRowAfter") {
    editor.chain().focus().addRowAfter().run();
  }
  if (command === "deleteRow") {
    editor.chain().focus().deleteRow().run();
  }
  if (command === "deleteTable") {
    editor.chain().focus().deleteTable().run();
  }
  if (command === "zoomOut") {
    changeEditorZoom(root, -zoomStep);
  }
  if (command === "zoomReset") {
    setEditorZoom(root, 1);
  }
  if (command === "zoomIn") {
    changeEditorZoom(root, zoomStep);
  }
}

function updateFormatButtonStates(root: HTMLElement, editor: Editor, runtime: LodeonRuntime): void {
  root.querySelectorAll<HTMLButtonElement>("[data-format-command]").forEach((button) => {
    const command = button.dataset.formatCommand as FormatCommand | undefined;

    if (!command) {
      return;
    }

    button.dataset.active = isCommandActive(editor, command) ? "true" : "false";
    button.disabled = isCommandDisabled(editor, command);
  });

  const tableTools = root.querySelector<HTMLElement>("[data-table-tools]");
  if (tableTools) {
    tableTools.hidden = !editor.isActive("table");
  }

  const blockSelect = root.querySelector<HTMLSelectElement>("[data-block-select]");
  if (blockSelect) {
    blockSelect.value = getActiveBlockType(editor);
  }

  const semanticBlockSelect = root.querySelector<HTMLSelectElement>("[data-semantic-block-select]");
  if (semanticBlockSelect) {
    updateSemanticBlockSelect(semanticBlockSelect, editor, runtime);
  }

  const semanticInlineSelect = root.querySelector<HTMLSelectElement>("[data-semantic-inline-select]");
  if (semanticInlineSelect) {
    semanticInlineSelect.value = getActiveSemanticInlineFormat(editor);
  }
}

function isCommandActive(editor: Editor, command: FormatCommand): boolean {
  if (command === "bold") {
    return editor.isActive("bold");
  }
  if (command === "italic") {
    return editor.isActive("italic");
  }
  if (command === "underline") {
    return editor.isActive("underline");
  }
  if (command === "strike") {
    return editor.isActive("strike");
  }
  if (command === "link") {
    return editor.isActive("link");
  }
  if (command === "bulletList") {
    return editor.isActive("bulletList");
  }
  if (command === "orderedList") {
    return editor.isActive("orderedList");
  }
  if (command === "blockquote") {
    return editor.isActive("blockquote");
  }
  if (command === "codeBlock") {
    return editor.isActive("codeBlock");
  }

  return false;
}

function isCommandDisabled(editor: Editor, command: FormatCommand): boolean {
  if (command === "undo") {
    return !editor.can().undo();
  }
  if (command === "redo") {
    return !editor.can().redo();
  }
  if (command === "addColumnAfter") {
    return !editor.can().addColumnAfter();
  }
  if (command === "deleteColumn") {
    return !editor.can().deleteColumn();
  }
  if (command === "addRowAfter") {
    return !editor.can().addRowAfter();
  }
  if (command === "deleteRow") {
    return !editor.can().deleteRow();
  }
  if (command === "deleteTable") {
    return !editor.can().deleteTable();
  }

  return false;
}

function applyBlockType(editor: Editor, value: string): void {
  if (value === "paragraph") {
    editor.chain().focus().setParagraph().run();
    return;
  }

  const [, level] = value.split(":");
  const headingLevel = Number(level);

  if ([1, 2, 3, 4, 5, 6].includes(headingLevel)) {
    editor
      .chain()
      .focus()
      .toggleHeading({ level: headingLevel as 1 | 2 | 3 | 4 | 5 | 6 })
      .run();
  }
}

function getActiveBlockType(editor: Editor): string {
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    if (editor.isActive("heading", { level })) {
      return `heading:${level}`;
    }
  }

  return "paragraph";
}

function applySemanticBlockFormat(editor: Editor, runtime: LodeonRuntime, formatId: string): void {
  const blockType = getActiveSemanticBlockType(editor);
  if (!blockType) {
    return;
  }

  if (!isSemanticBlockFormatAllowed(runtime, formatId, blockType)) {
    return;
  }

  const attrs = { semanticFormat: formatId || null };

  if (blockType === "heading") {
    editor.chain().focus().updateAttributes("heading", attrs).run();
    return;
  }

  editor.chain().focus().updateAttributes("paragraph", attrs).run();
}

function updateSemanticBlockSelect(select: HTMLSelectElement, editor: Editor, runtime: LodeonRuntime): void {
  const blockType = getActiveSemanticBlockType(editor);
  const activeFormat = getActiveSemanticBlockFormat(editor);
  let activeFormatAllowed = false;

  Array.from(select.options).forEach((option) => {
    const allowed = blockType !== null && isSemanticBlockFormatAllowed(runtime, option.value, blockType);
    option.disabled = !allowed;

    if (option.value === activeFormat && allowed) {
      activeFormatAllowed = true;
    }
  });

  select.disabled = blockType === null;
  select.value = activeFormatAllowed ? activeFormat : "";
}

function getActiveSemanticBlockType(editor: Editor): "heading" | "paragraph" | null {
  if (editor.isActive("heading")) {
    return "heading";
  }
  if (editor.isActive("paragraph")) {
    return "paragraph";
  }
  return null;
}

function isSemanticBlockFormatAllowed(
  runtime: LodeonRuntime,
  formatId: string,
  blockType: "heading" | "paragraph"
): boolean {
  if (!formatId) {
    return true;
  }

  const format = runtime.config.editor?.richText?.resolved?.formats?.[formatId];
  if (!format || format.scope !== "block") {
    return false;
  }

  const appliesTo = format.appliesTo ?? [];
  return appliesTo.length === 0 || appliesTo.includes(blockType);
}

function getActiveSemanticBlockFormat(editor: Editor): string {
  const headingFormat = editor.getAttributes("heading").semanticFormat;
  if (typeof headingFormat === "string") {
    return headingFormat;
  }

  const paragraphFormat = editor.getAttributes("paragraph").semanticFormat;
  return typeof paragraphFormat === "string" ? paragraphFormat : "";
}

function applySemanticInlineFormat(editor: Editor, formatId: string): void {
  if (!formatId) {
    editor.chain().focus().unsetMark("semanticInlineFormat").run();
    return;
  }

  editor.chain().focus().setMark("semanticInlineFormat", { format: formatId }).run();
}

function getActiveSemanticInlineFormat(editor: Editor): string {
  const format = editor.getAttributes("semanticInlineFormat").format;
  return typeof format === "string" ? format : "";
}

function applySemanticContainer(editor: Editor, runtime: LodeonRuntime, containerId: string): void {
  if (!containerId) {
    return;
  }

  const attrs = createSemanticContainerAttrs(runtime, containerId);
  const wrapped = editor.chain().focus().wrapIn("semanticContainer", attrs).run();

  if (!wrapped) {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "semanticContainer",
        attrs,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: runtime.i18n.t("editor", "toolbar.format.containerContent")
              }
            ]
          }
        ]
      })
      .run();
  }
}

function createSemanticContainerAttrs(runtime: LodeonRuntime, containerId: string): Record<string, unknown> {
  const container = runtime.config.editor?.richText?.resolved?.containers?.[containerId];
  const attrs: Record<string, unknown> = {
    semanticContainer: containerId
  };

  if (!container || typeof container !== "object") {
    return attrs;
  }

  const ui = (container as Record<string, unknown>).ui;
  if (!ui || typeof ui !== "object") {
    return attrs;
  }

  const fields = (ui as Record<string, unknown>).fields;
  if (!Array.isArray(fields)) {
    return attrs;
  }

  fields.forEach((field) => {
    if (!field || typeof field !== "object") {
      return;
    }

    const record = field as Record<string, unknown>;
    const id = record.id;

    if (typeof id === "string") {
      attrs[id] = record.default ?? null;
    }
  });

  return attrs;
}

function showLinkPopover(root: HTMLElement, href: string): void {
  const popover = root.querySelector<HTMLElement>("[data-link-popover]");
  const input = root.querySelector<HTMLInputElement>("[data-link-url]");

  if (!popover || !input) {
    return;
  }

  hideToolbarPopovers(root);
  input.value = href;
  popover.hidden = false;
  input.focus();
  input.select();
}

function hideToolbarPopover(popover: HTMLElement | null): void {
  if (popover) {
    popover.hidden = true;
  }
}

function showImagePopover(root: HTMLElement): void {
  const popover = root.querySelector<HTMLElement>("[data-image-popover]");
  const input = root.querySelector<HTMLInputElement>("[data-image-url]");

  if (!popover || !input) {
    return;
  }

  hideToolbarPopovers(root);
  input.value = "";
  popover.hidden = false;
  input.focus();
}

function hideToolbarPopovers(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-link-popover], [data-image-popover]").forEach((popover) => {
    hideToolbarPopover(popover);
  });
}

function changeEditorZoom(root: HTMLElement, delta: number): void {
  setEditorZoom(root, readEditorZoom() + delta);
}

function setEditorZoom(root: HTMLElement, value: number): void {
  const nextZoom = Math.min(zoomMax, Math.max(zoomMin, value));
  localStorage.setItem(editorZoomStorageKey, nextZoom.toFixed(2));
  applyEditorZoom(root, nextZoom);
}

function readEditorZoom(): number {
  const stored = Number(localStorage.getItem(editorZoomStorageKey));

  if (Number.isFinite(stored) && stored >= zoomMin && stored <= zoomMax) {
    return stored;
  }

  return 1;
}

function applyEditorZoom(root: HTMLElement, value: number): void {
  const editorHost = root.querySelector<HTMLElement>(".ld-editor-host");
  editorHost?.style.setProperty("--lodeon-editor-zoom", value.toFixed(2));
}
