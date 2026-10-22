/** Owns the Media Asset Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight } from "lucide";
import {
  type LodeonAsset,
  type LodeonAssetBlob,
  type LodeonAssetKind,
  type LodeonAssetMetadataField,
  type LodeonAssetMetadataFieldValue
} from "../../assets/contracts";
import { readAssetMetadataField } from "../../assets/metadata";
import { ASSET_METADATA_TABS } from "../../assets/metadata-schema";
import { renderIcon } from "../../ui/icons";
import {
  createSpecialNodeHeader,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText
} from "../shared/node-view-controls";

export const MEDIA_ASSET_NODE_TYPE_NAME = "mediaAssetNode";

export type MediaAssetNodeAttrs = {
  id: string;
  kind: LodeonAssetKind;
  assetId: string;
  title: string;
  collapsed: boolean;
  excludeFromRender: boolean;
  displayExtendedMetadata: boolean;
};

export type MediaAssetNodeOptions = {
  resolveAsset: (assetId: string) => LodeonAsset | undefined;
  loadAssetBlob: (assetId: string) => Promise<LodeonAssetBlob | null>;
  updateAsset: (assetId: string, key: string, value: LodeonAssetMetadataFieldValue | undefined) => void;
};

/** Creates canonical browser-local Media Asset node JSON for one stable asset id. */
export function createMediaAssetNodeContent(
  attrs: Partial<MediaAssetNodeAttrs> & Pick<MediaAssetNodeAttrs, "assetId">
): JSONContent {
  return { type: MEDIA_ASSET_NODE_TYPE_NAME, attrs: normalizeMediaAssetNodeAttrs(attrs) };
}

/** Normalizes display metadata while keeping binary asset data outside ProseMirror JSON. */
export function normalizeMediaAssetNodeAttrs(attrs: Partial<MediaAssetNodeAttrs> = {}): MediaAssetNodeAttrs {
  const defaultTitle = translateSpecialNodeText("registry.mediaAsset.label");

  return {
    id: attrs.id ?? createMediaAssetNodeId(),
    kind: attrs.kind ?? "image",
    assetId: attrs.assetId ?? "",
    title: attrs.title ?? defaultTitle,
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false,
    displayExtendedMetadata: attrs.displayExtendedMetadata ?? false
  };
}

/** Renders references to browser-owned assets and releases all NodeView controls during editor teardown. */
export const MediaAssetNode = Node.create<MediaAssetNodeOptions>({
  name: MEDIA_ASSET_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      resolveAsset: () => undefined,
      loadAssetBlob: () => Promise.resolve(null),
      updateAsset: () => undefined
    };
  },

  addAttributes() {
    return {
      id: {
        default: null
      },
      kind: {
        default: "image"
      },
      assetId: {
        default: ""
      },
      title: {
        default: translateSpecialNodeText("registry.mediaAsset.label")
      },
      collapsed: {
        default: false
      },
      excludeFromRender: {
        default: false
      },
      displayExtendedMetadata: {
        default: false
      }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='media-asset']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "media-asset",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeMediaAssetNodeAttrs(node.attrs);
      let objectUrl: string | null = null;
      let loadToken = 0;

      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const body = document.createElement("div");
      const preview = document.createElement("div");
      const metadata = document.createElement("dl");
      const metadataEditor = document.createElement("section");
      const tabList = document.createElement("div");
      const tabPanels = document.createElement("div");
      let activeTabId = ASSET_METADATA_TABS[0]?.id ?? "display";

      container.className = "ld-node ld-media-asset-node";
      container.dataset.lodeonNode = "media-asset";
      container.dataset.nodeId = String(node.attrs.id);

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(node.attrs.title ?? translateSpecialNodeText("registry.mediaAsset.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.mediaAsset.titleAria"));

      body.className = "ld-node-body";
      preview.className = "ld-media-asset-preview";
      metadata.className = "ld-media-asset-metadata";
      metadataEditor.className = "ld-media-asset-editor";
      metadataEditor.setAttribute("aria-label", translateSpecialNodeText("fields.mediaAssetMetadata"));
      tabList.className = "ld-media-asset-tabs";
      tabList.setAttribute("role", "tablist");
      tabPanels.className = "ld-media-asset-tab-panels";

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "media-asset",
        labelKey: "nodes.mediaAsset.headerLabel",
        eyebrow: "media-asset",
        eyebrowKey: "nodes.mediaAsset.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: []
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      metadataEditor.append(tabList, tabPanels);
      body.append(preview, metadata, metadataEditor);
      container.append(header, body);

      const updateAttrs = (attrs: Partial<MediaAssetNodeAttrs>) => {
        if (typeof getPos !== "function") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };

        dispatchNodeAttrs(editor, getPos, currentAttrs);
      };

      const revokeObjectUrl = () => {
        if (objectUrl && typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(objectUrl);
          objectUrl = null;
        }
      };

      const renderCollapsedState = () => {
        const collapsed = Boolean(currentAttrs.collapsed);
        body.hidden = collapsed;
        container.dataset.collapsed = collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        collapseButton.innerHTML = renderIcon(collapsed ? ChevronRight : ChevronDown);
        collapseButton.setAttribute(
          "aria-label",
          collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.mediaAsset.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.mediaAsset.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
      };

      const renderMetadata = (asset: LodeonAsset | undefined) => {
        metadata.innerHTML = "";

        if (!asset) {
          metadata.append(
            metadataRow(
              translateSpecialNodeText("fields.status"),
              translateSpecialNodeText("status.assetMetadataUnavailable")
            )
          );
          return;
        }

        metadata.append(
          metadataRow(translateSpecialNodeText("fields.file"), asset.originalName || asset.fileName),
          metadataRow(translateSpecialNodeText("fields.type"), asset.mimeType),
          metadataRow(translateSpecialNodeText("fields.size"), formatBytes(asset.size))
        );

        if (asset.creator) {
          metadata.append(metadataRow(translateSpecialNodeText("fields.creator"), asset.creator));
        }

        if (asset.license) {
          metadata.append(metadataRow(translateSpecialNodeText("fields.license"), asset.license));
        }
      };

      const renderMetadataEditor = (asset: LodeonAsset | undefined) => {
        tabList.innerHTML = "";
        tabPanels.innerHTML = "";

        if (!asset) {
          metadataEditor.hidden = true;
          return;
        }

        metadataEditor.hidden = false;

        for (const tab of ASSET_METADATA_TABS) {
          const tabButton = markNodeViewControl(document.createElement("button"));
          const panel = document.createElement("div");
          const isActive = tab.id === activeTabId;

          tabButton.type = "button";
          tabButton.className = "ld-media-asset-tab";
          tabButton.textContent = translateSpecialNodeText(tab.labelKey);
          tabButton.dataset.active = isActive ? "true" : "false";
          tabButton.dataset.metadataTab = tab.id;
          tabButton.setAttribute("role", "tab");
          tabButton.setAttribute("aria-selected", isActive ? "true" : "false");
          tabButton.addEventListener("click", () => {
            activeTabId = tab.id;
            renderMetadataEditor(this.options.resolveAsset(currentAttrs.assetId));
          });

          panel.className = "ld-media-asset-tab-panel";
          panel.dataset.metadataPanel = tab.id;
          panel.hidden = !isActive;
          panel.setAttribute("role", "tabpanel");

          if (tab.id === "internal") {
            panel.append(createDisplayMetadataInput(currentAttrs, updateAttrs));
          }

          for (const field of tab.fields) {
            panel.append(
              createMetadataInput(asset, field, (value) => {
                this.options.updateAsset(asset.assetId, field.key, value);
                const nextAsset = this.options.resolveAsset(asset.assetId);

                renderMetadata(nextAsset);
              })
            );
          }

          tabList.append(tabButton);
          tabPanels.append(panel);
        }
      };

      const renderPreview = async () => {
        const token = ++loadToken;
        const asset = this.options.resolveAsset(currentAttrs.assetId);
        preview.innerHTML = "";
        renderMetadata(asset);
        renderMetadataEditor(asset);
        revokeObjectUrl();

        if (!asset) {
          preview.textContent = translateSpecialNodeText("status.missingAsset");
          return;
        }

        preview.textContent = translateSpecialNodeText("status.loadingAssetPreview");
        const assetBlob = await this.options.loadAssetBlob(asset.assetId);

        if (token !== loadToken) {
          return;
        }

        preview.innerHTML = "";

        if (!assetBlob) {
          preview.textContent = translateSpecialNodeText("status.missingAssetStorage");
          return;
        }

        if (typeof URL.createObjectURL !== "function") {
          preview.textContent = translateSpecialNodeText("status.unavailableAssetPreview");
          return;
        }

        objectUrl = URL.createObjectURL(assetBlob.blob);

        if (asset.kind === "image") {
          const image = document.createElement("img");

          image.src = objectUrl;
          image.alt = asset.alt ?? asset.title ?? asset.originalName ?? "";
          preview.append(image);
          return;
        }

        if (asset.kind === "audio") {
          const audio = document.createElement("audio");

          audio.src = objectUrl;
          audio.controls = true;
          preview.append(audio);
          return;
        }

        const video = document.createElement("video");

        video.src = objectUrl;
        video.controls = true;
        preview.append(video);
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

      renderCollapsedState();
      void renderPreview();

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== MEDIA_ASSET_NODE_TYPE_NAME) {
            return false;
          }

          const nextAttrs = normalizeMediaAssetNodeAttrs(updatedNode.attrs);
          const assetChanged = nextAttrs.assetId !== currentAttrs.assetId;

          currentAttrs = nextAttrs;
          title.value = String(currentAttrs.title ?? translateSpecialNodeText("registry.mediaAsset.label"));
          renderCollapsedState();
          specialHeader.refresh();

          if (assetChanged) {
            void renderPreview();
          } else {
            const asset = this.options.resolveAsset(currentAttrs.assetId);

            renderMetadata(asset);
            renderMetadataEditor(asset);
          }

          return true;
        },
        destroy: () => {
          loadToken += 1;
          revokeObjectUrl();
        },
        stopEvent: isNodeViewControlEvent,
        ignoreMutation: () => true
      };
    };
  }
});

function createMediaAssetNodeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `media-asset-${Date.now()}`;
}

function metadataRow(label: string, value: string): HTMLElement {
  const fragment = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");

  term.textContent = label;
  description.textContent = value;
  fragment.append(term, description);

  return fragment;
}

function createMetadataInput(
  asset: LodeonAsset,
  field: LodeonAssetMetadataField,
  onChange: (value: LodeonAssetMetadataFieldValue | undefined) => void
): HTMLElement {
  const wrapper = document.createElement("label");
  const label = document.createElement("span");
  const value = readAssetMetadataField(asset, field.key);

  wrapper.className = "ld-media-asset-field";
  label.textContent = translateSpecialNodeText(field.labelKey);
  label.title = translateSpecialNodeText(field.descriptionKey);
  wrapper.append(label);

  if (field.type === "checkbox") {
    const checkbox = markNodeViewControl(document.createElement("input"));
    const control = document.createElement("div");

    checkbox.type = "checkbox";
    checkbox.dataset.metadataField = field.key;
    checkbox.checked = value === true || value === "true";
    checkbox.addEventListener("change", () => onChange(checkbox.checked));
    control.className = "ld-media-asset-checkbox-control";
    control.append(checkbox);
    wrapper.classList.add("ld-media-asset-field-checkbox");
    wrapper.append(control);
    return wrapper;
  }

  const input = markNodeViewControl(document.createElement("input"));
  const emitChange = () => {
    onChange(field.type === "number" ? Number(input.value || 0) : input.value);
  };

  input.type = field.type === "number" ? "number" : "text";
  input.dataset.metadataField = field.key;
  input.value = metadataValueToString(value);
  input.addEventListener("input", emitChange);
  input.addEventListener("change", emitChange);
  wrapper.append(input);

  return wrapper;
}

function createDisplayMetadataInput(
  attrs: MediaAssetNodeAttrs,
  onChange: (attrs: Partial<MediaAssetNodeAttrs>) => void
): HTMLElement {
  const wrapper = document.createElement("label");
  const label = document.createElement("span");
  const checkbox = markNodeViewControl(document.createElement("input"));
  const control = document.createElement("div");

  wrapper.className = "ld-media-asset-field ld-media-asset-field-checkbox";
  label.textContent = translateSpecialNodeText("fields.displayExtendedMetadata");
  label.title = translateSpecialNodeText("status.renderFullAssetMetadata");

  checkbox.type = "checkbox";
  checkbox.dataset.mediaAssetDisplayExtendedMetadata = "true";
  checkbox.checked = Boolean(attrs.displayExtendedMetadata);
  checkbox.addEventListener("change", () => {
    onChange({ displayExtendedMetadata: checkbox.checked });
  });

  control.className = "ld-media-asset-checkbox-control";
  control.append(checkbox);
  wrapper.append(label, control);

  return wrapper;
}

function metadataValueToString(value: LodeonAssetMetadataFieldValue | undefined): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return value ?? "";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
