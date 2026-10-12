/** Parses and validates editable visualization JSON drafts. */

import { type Content } from "vanilla-jsoneditor";
import { stringifyPlotlyJson, type PlotlyVisualizationJson } from "./renderer";
import type { VisualizationNodeAttrs } from "./contracts";

export type PlotlyJsonTab = "data" | "layout" | "config";
export type JsonEditorChangeStatus = {
  patchResult?: { json?: unknown };
};

export function readPlotlyJson(attrs: VisualizationNodeAttrs) {
  return {
    dataJson: attrs.plotlyDataJson,
    layoutJson: attrs.layoutJson,
    configJson: attrs.configJson
  };
}

export function createPlotlyJsonDrafts(
  attrs: Pick<VisualizationNodeAttrs, "plotlyDataJson" | "layoutJson" | "configJson">
): Required<PlotlyVisualizationJson> {
  return {
    dataJson: attrs.plotlyDataJson,
    layoutJson: attrs.layoutJson,
    configJson: attrs.configJson
  };
}

export function applyPlotlyJsonAttrsToDrafts(
  drafts: Required<PlotlyVisualizationJson>,
  attrs: Pick<Partial<VisualizationNodeAttrs>, "plotlyDataJson" | "layoutJson" | "configJson">
): void {
  if (typeof attrs.plotlyDataJson === "string") {
    drafts.dataJson = attrs.plotlyDataJson;
  }
  if (typeof attrs.layoutJson === "string") {
    drafts.layoutJson = attrs.layoutJson;
  }
  if (typeof attrs.configJson === "string") {
    drafts.configJson = attrs.configJson;
  }
}

export function getActiveJsonTextFromDrafts(
  drafts: Required<PlotlyVisualizationJson>,
  tab: PlotlyJsonTab
): string {
  if (tab === "data") {
    return drafts.dataJson;
  }
  if (tab === "layout") {
    return drafts.layoutJson;
  }
  return drafts.configJson;
}

export function jsonContentFromText(text: string): Content {
  if (!text.trim()) {
    return { json: {} };
  }

  try {
    return { json: JSON.parse(text) };
  } catch {
    return { text };
  }
}

export function jsonTextFromContent(content: Content): string {
  if ("text" in content) {
    return content.text;
  }

  return stringifyPlotlyJson(content.json);
}

export function contentFromJsonEditorChange(content: Content, status?: JsonEditorChangeStatus): Content {
  if (status?.patchResult && "json" in status.patchResult) {
    return { json: status.patchResult.json };
  }

  return content;
}
