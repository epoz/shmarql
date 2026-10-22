/** Renders the central story-authoring workspace. */

import {
  Bold,
  Code2,
  Columns3,
  Heading,
  Image,
  Italic,
  LayoutTemplate,
  Link,
  List,
  ListOrdered,
  Minus,
  PanelLeftClose,
  PanelTopClose,
  Quote,
  Redo2,
  RotateCcw,
  Rows3,
  Save,
  Strikethrough,
  Table,
  Underline,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut
} from "lucide";
import type { LodeonRuntime } from "../application/contracts";
import { isSpecialNodeInsertable } from "../registry/nodes";
import { renderIcon } from "./icons";

export function renderEditorWorkspace(runtime: LodeonRuntime): string {
  const t = (key: string) => runtime.i18n.t("editor", key);
  const specialNodes = runtime.registries.nodes
    .values()
    .filter((node) => isSpecialNodeInsertable(node, runtime.config))
    .map((node) => {
      const label = runtime.i18n.t("special-nodes", node.labelKey);

      return `<option value="${escapeHtml(node.id)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  const blockFormatOptions = formatSemanticOptions(runtime, "block");
  const inlineFormatOptions = formatSemanticOptions(runtime, "inline");
  const containerOptions = formatSemanticContainerOptions(runtime);

  return `
    <main class="ld-editor-workspace">
      <section class="ld-editor-panel" aria-label="${escapeAttribute(t("storyEditor.panelAria"))}">
        <div class="control-group ld-editor-toolbar" data-editor-toolbar>
          <div class="button-group">
            <button
              class="ld-autosave-button"
              type="button"
              data-manual-save
              title="${escapeAttribute(t("toolbar.autosave.saveNow"))}"
              aria-label="${escapeAttribute(t("toolbar.autosave.saveNow"))}"
            >
              ${renderIcon(Save)}
              <span class="ld-autosave-status" data-autosave-status data-state="saved">${escapeHtml(t("toolbar.autosave.saved"))}</span>
            </button>
          </div>
          <div class="button-group">
            ${formatButton("undo", t("toolbar.format.undo"), renderIcon(Undo2))}
            ${formatButton("redo", t("toolbar.format.redo"), renderIcon(Redo2))}
            ${formatButton("zoomOut", t("toolbar.format.zoomOut"), renderIcon(ZoomOut))}
            ${formatButton("zoomReset", t("toolbar.format.zoomReset"), renderIcon(RotateCcw))}
            ${formatButton("zoomIn", t("toolbar.format.zoomIn"), renderIcon(ZoomIn))}
          </div>
          <div class="button-group">
            <label class="ld-toolbar-select-label">
              ${renderIcon(Heading)}
              <select data-block-select aria-label="${escapeAttribute(t("toolbar.format.blockType"))}">
                <option value="paragraph">${escapeHtml(t("toolbar.format.paragraph"))}</option>
                <option value="heading:1">${escapeHtml(t("toolbar.format.heading1"))}</option>
                <option value="heading:2">${escapeHtml(t("toolbar.format.heading2"))}</option>
                <option value="heading:3">${escapeHtml(t("toolbar.format.heading3"))}</option>
                <option value="heading:4">${escapeHtml(t("toolbar.format.heading4"))}</option>
                <option value="heading:5">${escapeHtml(t("toolbar.format.heading5"))}</option>
                <option value="heading:6">${escapeHtml(t("toolbar.format.heading6"))}</option>
              </select>
            </label>
          </div>
          ${
            blockFormatOptions
              ? `
          <div class="button-group">
            <label class="ld-toolbar-select-label">
              <span class="ld-toolbar-text-icon">Aa</span>
              <select data-semantic-block-select aria-label="${escapeAttribute(t("toolbar.format.blockFormat"))}">
                <option value="">${escapeHtml(t("toolbar.format.blockStyle"))}</option>
                ${blockFormatOptions}
              </select>
            </label>
          </div>
          `
              : ""
          }
          <div class="button-group">
            ${formatButton("bold", t("toolbar.format.bold"), renderIcon(Bold))}
            ${formatButton("italic", t("toolbar.format.italic"), renderIcon(Italic))}
            ${formatButton("underline", t("toolbar.format.underline"), renderIcon(Underline))}
            ${formatButton("strike", t("toolbar.format.strike"), renderIcon(Strikethrough))}
            ${formatButton("link", t("toolbar.format.link"), renderIcon(Link))}
          </div>
          ${
            inlineFormatOptions
              ? `
          <div class="button-group">
            <label class="ld-toolbar-select-label">
              <span class="ld-toolbar-text-icon">T</span>
              <select data-semantic-inline-select aria-label="${escapeAttribute(t("toolbar.format.inlineFormat"))}">
                <option value="">${escapeHtml(t("toolbar.format.inlineStyle"))}</option>
                ${inlineFormatOptions}
              </select>
            </label>
          </div>
          `
              : ""
          }
          <div class="button-group">
            ${formatButton("bulletList", t("toolbar.format.bulletList"), renderIcon(List))}
            ${formatButton("orderedList", t("toolbar.format.orderedList"), renderIcon(ListOrdered))}
            ${formatButton("blockquote", t("toolbar.format.blockquote"), renderIcon(Quote))}
          </div>
          <div class="button-group">
            ${formatButton("codeBlock", t("toolbar.format.codeBlock"), renderIcon(Code2))}
            ${formatButton("horizontalRule", t("toolbar.format.horizontalRule"), renderIcon(Minus))}
          </div>
          <div class="button-group">
            ${formatButton("image", t("toolbar.format.insertImage"), renderIcon(Image))}
            ${formatButton("table", t("toolbar.format.insertTable"), renderIcon(Table))}
          </div>
          <div class="button-group ld-table-tools" data-table-tools hidden>
            ${formatButton("addColumnAfter", t("toolbar.format.addColumnAfter"), renderIcon(Columns3))}
            ${formatButton("deleteColumn", t("toolbar.format.deleteColumn"), renderIcon(PanelLeftClose))}
            ${formatButton("addRowAfter", t("toolbar.format.addRowAfter"), renderIcon(Rows3))}
            ${formatButton("deleteRow", t("toolbar.format.deleteRow"), renderIcon(PanelTopClose))}
            ${formatButton("deleteTable", t("toolbar.format.deleteTable"), renderIcon(Minus))}
          </div>
          ${
            containerOptions
              ? `
          <div class="button-group ld-semantic-container-tools">
            <label class="ld-toolbar-select-label">
              ${renderIcon(LayoutTemplate)}
              <select data-semantic-container-select aria-label="${escapeAttribute(t("toolbar.format.specialBlocks"))}">
                <option value="">${escapeHtml(t("toolbar.format.specialBlocks"))}</option>
                ${containerOptions}
              </select>
            </label>
          </div>
          `
              : ""
          }
          <div class="button-group ld-node-tools">
            <label class="ld-toolbar-select-label">
              ${renderIcon(WandSparkles)}
              <select data-node-insert-select aria-label="${escapeAttribute(t("toolbar.format.specialNodes"))}">
                <option value="">${escapeHtml(t("toolbar.format.specialNodes"))}</option>
                ${specialNodes}
              </select>
            </label>
          </div>
          <form class="ld-link-popover" data-link-popover hidden>
            <label>
              <span>${escapeHtml(t("toolbar.linkPopover.urlLabel"))}</span>
              <input type="url" data-link-url placeholder="${escapeAttribute(t("toolbar.linkPopover.urlPlaceholder"))}" />
            </label>
            <button class="ld-button" type="submit">${escapeHtml(t("toolbar.linkPopover.apply"))}</button>
            <button class="ld-button" type="button" data-link-remove>${escapeHtml(t("toolbar.linkPopover.remove"))}</button>
            <button class="ld-button" type="button" data-toolbar-popover-cancel>${escapeHtml(t("toolbar.popover.cancel"))}</button>
          </form>
          <form class="ld-link-popover" data-image-popover hidden>
            <label>
              <span>${escapeHtml(t("toolbar.imagePopover.urlLabel"))}</span>
              <input type="url" data-image-url placeholder="${escapeAttribute(t("toolbar.imagePopover.urlPlaceholder"))}" />
            </label>
            <button class="ld-button" type="submit">${escapeHtml(t("toolbar.imagePopover.insert"))}</button>
            <button class="ld-button" type="button" data-toolbar-popover-cancel>${escapeHtml(t("toolbar.popover.cancel"))}</button>
          </form>
        </div>
        <div id="story-editor" class="ld-editor-host"></div>
      </section>
    </main>
  `;
}

function formatButton(command: string, label: string, icon: string): string {
  const safeLabel = escapeAttribute(label);
  return `
    <button type="button" data-format-command="${command}" title="${safeLabel}" aria-label="${safeLabel}">
      ${icon}
    </button>
  `;
}

function formatSemanticOptions(runtime: LodeonRuntime, scope: "block" | "inline"): string {
  const formats = runtime.config.editor?.richText?.resolved?.formats ?? {};

  return Object.entries(formats)
    .filter(([, format]) => format.scope === scope)
    .map(([formatId, format]) => {
      const label = runtime.i18n.t("editor", format.labelKey);
      return `<option value="${escapeHtml(formatId)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function formatSemanticContainerOptions(runtime: LodeonRuntime): string {
  const containers = runtime.config.editor?.richText?.resolved?.containers ?? {};

  return Object.entries(containers)
    .map(([containerId, container]) => {
      const label = runtime.i18n.t("editor", container.labelKey);
      return `<option value="${escapeHtml(containerId)}">${escapeHtml(label)}</option>`;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
