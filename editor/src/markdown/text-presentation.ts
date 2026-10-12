/** Renders configured rich-text marks and textual ProseMirror content. */

import { LodeonClientError } from "../errors/client-error";
import type { MarkdownExportConfig } from "./contracts";

export function markdownLabel(config: MarkdownExportConfig, key: string): string {
  const value = config.markdownLabels?.[key];

  if (typeof value === "string" && value) {
    return value;
  }

  throw new LodeonClientError("markdown.label_missing", { key });
}

export function escapeLinkLabel(value: string): string {
  return value.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\");
}
