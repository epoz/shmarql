/** Constructs canonical Sparnatural Special Node document content. */

import type { JSONContent } from "@tiptap/core";
import { createNodeId } from "../shared/node-id";
import { translateSpecialNodeText } from "../shared/node-view-controls";
import { SPARNATURAL_NODE_TYPE_NAME, type SparnaturalNodeAttrs } from "./contracts";

export function createSparnaturalNodeContent(attrs: Partial<SparnaturalNodeAttrs> = {}): JSONContent {
  return { type: SPARNATURAL_NODE_TYPE_NAME, attrs: normalizeSparnaturalNodeAttrs(attrs) };
}

export function normalizeSparnaturalNodeAttrs(
  attrs: Partial<SparnaturalNodeAttrs> = {}
): SparnaturalNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.sparnatural.label");

  return {
    id: attrs.id ?? createNodeId("sparnatural"),
    kind: "sparnatural",
    title: attrs.title ?? defaultTitle,
    source: attrs.source ?? "",
    queryJson: attrs.queryJson ?? null,
    configId: attrs.configId ?? "",
    knowledgeGraphProfileId: attrs.knowledgeGraphProfileId ?? "",
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    viewConfig: attrs.viewConfig ?? {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };
}
