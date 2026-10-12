/** Owns the Story Metadata Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight } from "lucide";
import { renderIcon } from "../../ui/icons";
import {
  createSpecialNodeHeader,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText
} from "../shared/node-view-controls";
import { createNodeId } from "../shared/node-id";

export const STORY_METADATA_NODE_TYPE_NAME = "storyMetadataNode";

export type StoryMetadataNodeAttrs = {
  id: string;
  kind: "storyMetadata";
  title: string;
  collapsed: boolean;
  excludeFromRender: boolean;
};

/** Creates canonical Story Metadata node JSON for the project-owned metadata projection. */
export function createStoryMetadataNodeContent(attrs: Partial<StoryMetadataNodeAttrs> = {}): JSONContent {
  return { type: STORY_METADATA_NODE_TYPE_NAME, attrs: normalizeStoryMetadataNodeAttrs(attrs) };
}

/** Normalizes node presentation attributes without duplicating canonical project metadata. */
export function normalizeStoryMetadataNodeAttrs(
  attrs: Partial<StoryMetadataNodeAttrs> = {}
): StoryMetadataNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.storyMetadata.label");

  return {
    id: attrs.id ?? createNodeId("story-metadata"),
    kind: "storyMetadata",
    title: attrs.title ?? defaultTitle,
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };
}

/** Renders the configured metadata template while project metadata remains the sole persisted source. */
export const StoryMetadataNode = Node.create({
  name: STORY_METADATA_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "storyMetadata" },
      title: { default: translateSpecialNodeText("registry.storyMetadata.label") },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='story-metadata']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "story-metadata",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeStoryMetadataNodeAttrs(node.attrs);
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const body = document.createElement("div");
      const note = document.createElement("p");

      container.className = "ld-node ld-story-metadata-node";
      container.dataset.lodeonNode = "story-metadata";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.storyMetadata.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.storyMetadata.titleAria"));

      body.className = "ld-node-body";
      note.className = "ld-node-help";
      note.textContent = translateSpecialNodeText("nodes.storyMetadata.help");
      body.append(note);

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "story-metadata",
        labelKey: "nodes.storyMetadata.headerLabel",
        eyebrow: "story-metadata",
        eyebrowKey: "nodes.storyMetadata.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        collapsed: Boolean(currentAttrs.collapsed),
        excludedFromRender: Boolean(currentAttrs.excludeFromRender)
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      container.append(header, body);

      const updateAttrs = (attrs: Partial<StoryMetadataNodeAttrs>) => {
        const pos = typeof getPos === "function" ? getPos() : null;

        if (typeof pos !== "number") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };
        dispatchNodeAttrs(editor, getPos, currentAttrs);
        render();
      };

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });
      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
      });
      deleteButton.addEventListener("click", () => {
        if (typeof getPos === "function") {
          const pos = getPos();
          if (typeof pos !== "number") {
            return;
          }

          editor.commands.deleteRange({
            from: pos,
            to: pos + node.nodeSize
          });
        }
      });
      container.addEventListener("mousedown", (event) => {
        if (isNodeViewControlEvent(event)) {
          return;
        }
      });

      const render = () => {
        title.value = currentAttrs.title || translateSpecialNodeText("registry.storyMetadata.label");
        body.hidden = Boolean(currentAttrs.collapsed);
        collapseButton.setAttribute(
          "aria-label",
          currentAttrs.collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.storyMetadata.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.storyMetadata.headerLabel")
              })
        );
        collapseButton.title = currentAttrs.collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
        collapseButton.innerHTML = renderIcon(currentAttrs.collapsed ? ChevronRight : ChevronDown);
        specialHeader.refresh();
      };

      render();

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== STORY_METADATA_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeStoryMetadataNodeAttrs(updatedNode.attrs);
          render();
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: (event) => isNodeViewControlEvent(event)
      };
    };
  }
});
