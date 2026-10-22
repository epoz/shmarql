/** Implements configured semantic rich-text mark behavior. */

import { Extension, Mark, mergeAttributes } from "@tiptap/core";

export type SemanticFormatLabels = Record<string, string>;

export const SemanticBlockFormat = Extension.create<{
  labels: SemanticFormatLabels;
}>({
  name: "semanticBlockFormat",

  addOptions() {
    return {
      labels: {}
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          semanticFormat: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-lodeon-semantic-format"),
            renderHTML: (attributes) => {
              const formatId = attributes.semanticFormat;

              if (typeof formatId !== "string" || !formatId) {
                return {};
              }

              return {
                "data-lodeon-semantic-format": formatId,
                "data-lodeon-format-label": this.options.labels[formatId] ?? formatId
              };
            }
          }
        }
      }
    ];
  }
});

export const SemanticInlineFormat = Mark.create<{
  labels: SemanticFormatLabels;
}>({
  name: "semanticInlineFormat",

  addOptions() {
    return {
      labels: {}
    };
  },

  addAttributes() {
    return {
      format: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-lodeon-semantic-inline-format"),
        renderHTML: (attributes) => {
          const formatId = attributes.format;

          if (typeof formatId !== "string" || !formatId) {
            return {};
          }

          return {
            "data-lodeon-semantic-inline-format": formatId,
            "data-lodeon-format-label": this.options.labels[formatId] ?? formatId
          };
        }
      }
    };
  },

  parseHTML() {
    return [{ tag: "span[data-lodeon-semantic-inline-format]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  }
});
