/** Owns the Iiif Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal,
  Home,
  Maximize,
  Play,
  RotateCcw,
  RotateCw,
  WandSparkles,
  ZoomIn,
  ZoomOut,
  type IconNode
} from "lucide";
import type { LodeonConfig } from "../../configuration/schema";
import { renderConfiguredError, renderConfiguredErrorCode } from "../../errors/client-error";
import {
  loadIiifImageApiInfo,
  loadIiifResources,
  validateIiifUrl,
  type IiifResolvedResource
} from "./api-client";
import { executeSparqlQuery } from "../sparql/api-client";
import { renderIcon } from "../../ui/icons";
import {
  createSpecialNodeHeader,
  createSpecialNodeField,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText,
  updateSpecialNodeFieldKnowledgeGraphProfile
} from "../shared/node-view-controls";
import type { SparnaturalBuilderInput, SparnaturalBuilderOutput } from "../sparnatural/contracts";
import { renderSparqlResult } from "../sparql/result-view";
import { createNodeId } from "../shared/node-id";
import { createSparqlSourceEditor } from "../sparql/source-editor";
import type {
  IiifGalleryReferenceStrip,
  IiifNodeAttrs,
  IiifResultItem,
  IiifSourceMode,
  IiifViewMode
} from "./contracts";
import { defaultIiifOptions, defaultIiifResultMapping } from "./configuration";
import {
  buildIiifSpec,
  extractDirectUrlItems,
  extractIiifResultItems,
  selectIiifResultItem
} from "./source-projection";

export const IIIF_NODE_TYPE_NAME = "iiifNode";

export type IiifNodeOptions = {
  iiif: LodeonConfig["nodes"]["iiif"];
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId?: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => LodeonConfig["knowledgeGraph"]["profiles"][number];
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};

type OpenSeadragonFactory = (options: {
  element: HTMLElement;
  tileSources: unknown;
  drawer?: string | string[];
  prefixUrl?: string;
  autoHideControls?: boolean;
  showNavigator?: boolean;
  showNavigationControl?: boolean;
  sequenceMode?: boolean;
  showReferenceStrip?: boolean;
  referenceStripScroll?: "horizontal" | "vertical";
  referenceStripPosition?: "BOTTOM_LEFT" | "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_RIGHT";
  referenceStripHeight?: number;
  referenceStripWidth?: number;
  showSequenceControl?: boolean;
  navImages?: Record<string, Record<string, string>>;
  gestureSettingsMouse?: Record<string, unknown>;
}) => { destroy: () => void };

declare global {
  var __lodeonOpenSeadragonFactory: OpenSeadragonFactory | undefined;
}

/** Creates canonical IIIF node JSON through the shared persisted-attribute contract. */
export function createIiifNodeContent(
  attrs: Partial<IiifNodeAttrs> = {},
  iiif?: LodeonConfig["nodes"]["iiif"],
  defaultKnowledgeGraphProfileId?: string
): JSONContent {
  return {
    type: IIIF_NODE_TYPE_NAME,
    attrs: normalizeIiifNodeAttrs(attrs, iiif, defaultKnowledgeGraphProfileId)
  };
}

/** Normalizes IIIF sources and display state without fetching remote manifests. */
export function normalizeIiifNodeAttrs(
  attrs: Partial<IiifNodeAttrs> = {},
  iiif?: LodeonConfig["nodes"]["iiif"],
  defaultKnowledgeGraphProfileId?: string
): IiifNodeAttrs {
  const defaultIiif = iiif ?? defaultIiifOptions();
  const defaultTitle = translateSpecialNodeText("registry.iiif.label");
  const knowledgeGraphProfileId = attrs.knowledgeGraphProfileId ?? defaultKnowledgeGraphProfileId;
  const resolvedAttrs: IiifNodeAttrs = {
    id: attrs.id ?? createNodeId("iiif"),
    kind: "iiif",
    title: attrs.title ?? defaultTitle,
    sourceMode: attrs.sourceMode ?? "url",
    url: attrs.url ?? "",
    query: attrs.query ?? "",
    ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}),
    resultMapping: attrs.resultMapping ?? defaultIiifResultMapping(),
    selectedItem: attrs.selectedItem ?? null,
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    label: attrs.label ?? "",
    caption: attrs.caption ?? "",
    height: attrs.height ?? defaultIiif.defaultHeight,
    viewMode: attrs.viewMode ?? defaultIiif.defaultViewMode,
    galleryReferenceStrip: attrs.galleryReferenceStrip ?? defaultIiif.defaultGalleryReferenceStrip,
    viewConfig: {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };

  resolvedAttrs.viewConfig = attrs.viewConfig ?? buildIiifSpec(resolvedAttrs);

  return resolvedAttrs;
}

/** Owns IIIF source generations and OpenSeadragon lifecycle, rejecting stale callbacks after update or teardown. */
export const IiifNode = Node.create<IiifNodeOptions>({
  name: IIIF_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      iiif: defaultIiifOptions(),
      defaultConfigId: "",
      defaultKnowledgeGraphProfileId: undefined,
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: translateSpecialNodeText("aria.knowledgeGraph"),
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery,
      openBuilder: undefined
    };
  },

  addAttributes() {
    return {
      id: { default: null },
      kind: { default: "iiif" },
      title: { default: translateSpecialNodeText("registry.iiif.label") },
      sourceMode: { default: "url" },
      url: { default: "" },
      query: { default: "" },
      knowledgeGraphProfileId: {
        default: this.options.defaultKnowledgeGraphProfileId
      },
      resultMapping: { default: defaultIiifResultMapping() },
      selectedItem: { default: null },
      result: { default: null },
      resultPageSize: { default: 10 },
      label: { default: "" },
      caption: { default: "" },
      height: { default: this.options.iiif.defaultHeight },
      viewMode: { default: this.options.iiif.defaultViewMode },
      galleryReferenceStrip: {
        default: this.options.iiif.defaultGalleryReferenceStrip
      },
      viewConfig: { default: {} },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='iiif']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "iiif",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeIiifNodeAttrs(
        node.attrs,
        this.options.iiif,
        this.options.defaultKnowledgeGraphProfileId
      );
      let viewer: { destroy: () => void } | null = null;
      let loadVersion = 0;
      const container = markNodeViewRoot(document.createElement("section"));
      const title = markNodeViewControl(document.createElement("input"));
      const editButton = markNodeViewControl(document.createElement("button"));
      const runButton = markNodeViewControl(document.createElement("button"));
      const body = document.createElement("div");
      const controls = document.createElement("div");
      const sourceControls = document.createElement("div");
      const sourceModeSelect = markNodeViewControl(document.createElement("select"));
      const urlInput = markNodeViewControl(document.createElement("textarea"));
      const queryEditor = createSparqlSourceEditor({
        value: currentAttrs.query ?? "",
        className: "ld-iiif-sparql-source-editor",
        ariaLabel: translateSpecialNodeText("aria.iiifSparqlQuery"),
        placeholder: translateSpecialNodeText("placeholders.iiifSparqlQuery")
      });
      const captionInput = markNodeViewControl(document.createElement("input"));
      const viewModeSelect = markNodeViewControl(document.createElement("select"));
      const galleryReferenceStripSelect = markNodeViewControl(document.createElement("select"));
      const heightInput = markNodeViewControl(document.createElement("input"));
      const preview = document.createElement("div");
      const footer = document.createElement("div");
      const resultFooter = document.createElement("div");
      const resultContainer = document.createElement("div");

      container.className = "ld-node ld-iiif-node";
      container.dataset.lodeonNode = "iiif";
      container.dataset.nodeId = String(node.attrs.id);
      container.setAttribute("contenteditable", "false");

      title.className = "ld-node-title-input";
      title.type = "text";
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.iiif.titleAria"));

      editButton.className = "ld-node-run-button";
      editButton.type = "button";
      editButton.innerHTML = `${renderIcon(WandSparkles)}<span>${translateSpecialNodeText(
        "actions.visualQueryBuilder"
      )}</span>`;
      editButton.setAttribute("aria-label", translateSpecialNodeText("actions.openVisualQueryBuilder"));

      runButton.className = "ld-node-run-button";
      runButton.type = "button";
      runButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.run")}</span>`;
      runButton.setAttribute("aria-label", translateSpecialNodeText("actions.runIiifQuery"));

      body.className = "ld-node-body";
      controls.className = "ld-iiif-controls";
      sourceControls.className = "ld-iiif-source-controls";
      preview.className = "ld-iiif-preview";
      footer.className = "ld-node-footer";
      resultFooter.className = "ld-node-footer ld-iiif-result-footer";
      resultContainer.className = "ld-sparql-result ld-iiif-result";

      sourceModeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.iiifSourceMode"));
      [
        ["url", translateSpecialNodeText("options.sourceMode.url")],
        ["sparql", translateSpecialNodeText("options.sourceMode.sparql")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        sourceModeSelect.append(option);
      });
      sourceModeSelect.querySelector<HTMLOptionElement>('option[value="sparql"]')!.disabled =
        !this.options.defaultKnowledgeGraphProfileId;

      urlInput.rows = 3;
      urlInput.placeholder = "https://example.org/iiif/3/object/info.json";
      urlInput.placeholder = translateSpecialNodeText("placeholders.iiifUrl");
      urlInput.setAttribute("aria-label", translateSpecialNodeText("aria.iiifUrl"));

      captionInput.type = "text";
      captionInput.placeholder = translateSpecialNodeText("placeholders.optionalCaption");
      captionInput.setAttribute("aria-label", translateSpecialNodeText("aria.iiifCaption"));

      [
        ["single", translateSpecialNodeText("options.viewMode.single")],
        ["gallery", translateSpecialNodeText("options.viewMode.gallery")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        viewModeSelect.append(option);
      });
      viewModeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.iiifViewMode"));

      [
        ["horizontal", translateSpecialNodeText("options.galleryReferenceStrip.horizontal")],
        ["vertical", translateSpecialNodeText("options.galleryReferenceStrip.vertical")],
        ["none", translateSpecialNodeText("options.galleryReferenceStrip.none")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        galleryReferenceStripSelect.append(option);
      });
      galleryReferenceStripSelect.setAttribute(
        "aria-label",
        translateSpecialNodeText("aria.iiifGalleryReferenceStrip")
      );

      heightInput.type = "number";
      heightInput.min = "160";
      heightInput.max = "1600";
      heightInput.step = "10";
      heightInput.setAttribute("aria-label", translateSpecialNodeText("aria.iiifViewerHeight"));

      const galleryReferenceStripField = createField(
        translateSpecialNodeText("fields.galleryStrip"),
        galleryReferenceStripSelect
      );

      controls.append(
        createField(translateSpecialNodeText("fields.source"), sourceModeSelect),
        createField(translateSpecialNodeText("fields.caption"), captionInput),
        createField(translateSpecialNodeText("fields.view"), viewModeSelect),
        galleryReferenceStripField,
        createField(translateSpecialNodeText("fields.height"), heightInput)
      );
      const queryField = createField(
        translateSpecialNodeText("fields.sparqlQuery"),
        queryEditor.element,
        "sparql",
        this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
      );
      sourceControls.append(createField(translateSpecialNodeText("fields.url"), urlInput, "url"), queryField);
      body.append(controls, sourceControls, preview, footer, resultFooter, resultContainer);

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "iiif",
        labelKey: "nodes.iiif.headerLabel",
        eyebrow: "iiif",
        eyebrowKey: "nodes.iiif.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        excludedFromRender: Boolean(currentAttrs.excludeFromRender),
        primaryActions: [editButton, runButton]
      });
      const header = specialHeader.element;
      const collapseButton = specialHeader.controls.collapseButton!;
      const deleteButton = specialHeader.controls.deleteButton!;

      container.append(header, body);

      const updateAttrs = (attrs: Partial<IiifNodeAttrs>) => {
        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };
        currentAttrs.viewConfig = buildIiifSpec(currentAttrs);
        dispatchNodeAttrs(editor, getPos, currentAttrs);
      };

      const destroyViewer = () => {
        if (!viewer) {
          return;
        }

        viewer.destroy();
        viewer = null;
      };

      const renderState = () => {
        const collapsed = Boolean(currentAttrs.collapsed);

        title.value = currentAttrs.title ?? translateSpecialNodeText("registry.iiif.label");
        sourceModeSelect.value = currentAttrs.sourceMode ?? "url";
        if (document.activeElement !== urlInput) {
          urlInput.value = currentAttrs.url ?? "";
        }
        if (!queryEditor.hasFocus()) {
          queryEditor.setValue(currentAttrs.query ?? "");
        }
        updateSpecialNodeFieldKnowledgeGraphProfile(
          queryField,
          this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
        );
        if (document.activeElement !== captionInput) {
          captionInput.value = currentAttrs.caption ?? "";
        }
        viewModeSelect.value = currentAttrs.viewMode ?? this.options.iiif.defaultViewMode;
        galleryReferenceStripSelect.value =
          currentAttrs.galleryReferenceStrip ?? this.options.iiif.defaultGalleryReferenceStrip;
        galleryReferenceStripField.hidden = currentAttrs.viewMode !== "gallery";
        if (document.activeElement !== heightInput) {
          heightInput.value = String(currentAttrs.height ?? this.options.iiif.defaultHeight);
        }
        editButton.hidden = currentAttrs.sourceMode !== "sparql";
        editButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        runButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        runButton.querySelector("span")!.textContent =
          currentAttrs.sourceMode === "sparql"
            ? translateSpecialNodeText("actions.run")
            : translateSpecialNodeText("actions.load");
        body.hidden = collapsed;
        resultFooter.hidden = currentAttrs.sourceMode !== "sparql";
        resultContainer.hidden = currentAttrs.sourceMode !== "sparql";
        container.dataset.collapsed = collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        container.dataset.sourceMode = currentAttrs.sourceMode;
        collapseButton.innerHTML = renderIcon(collapsed ? ChevronRight : ChevronDown);
        collapseButton.setAttribute(
          "aria-label",
          collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.iiif.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.iiif.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
        if (
          document.activeElement !== urlInput &&
          !queryEditor.hasFocus() &&
          document.activeElement !== heightInput
        ) {
          void renderPreview();
        }
      };

      const renderPreview = async () => {
        const currentLoad = ++loadVersion;
        destroyViewer();
        preview.innerHTML = "";

        if (currentAttrs.sourceMode === "sparql") {
          await renderSparqlPreview(currentLoad);
          renderResult();
          return;
        }

        resultFooter.textContent = "";
        resultContainer.innerHTML = "";
        const directItems = extractDirectUrlItems(currentAttrs.url);

        if (!directItems.length) {
          renderMessage(preview, renderConfiguredErrorCode(this.options.errors, "iiif.url_empty"));
          return;
        }

        if (currentAttrs.viewMode === "gallery") {
          await renderGalleryViewer(directItems, currentLoad);
          return;
        }

        const selected = selectIiifResultItem(directItems, currentAttrs.selectedItem);
        const validation = validateIiifUrl(selected.url, this.options.iiif);

        if (validation.status !== "allowed") {
          const message = renderConfiguredErrorCode(
            this.options.errors,
            validation.code,
            validation.variables
          );
          renderMessage(preview, message, true);
          footer.textContent = message;
          return;
        }

        renderMessage(preview, translateSpecialNodeText("status.loadingIiifResource"));
        footer.textContent = validation.url;

        try {
          const info = await loadIiifImageApiInfo(selected.url, this.options.iiif);

          if (currentLoad !== loadVersion) {
            return;
          }

          await renderViewer(info.tileSource);
          if (directItems.length > 1) {
            preview.prepend(
              createIiifResultSelector(directItems, selected, (item) => {
                updateAttrs({ selectedItem: item });
              })
            );
          }
          footer.textContent = formatIiifFooter(info);
        } catch (error) {
          if (currentLoad !== loadVersion) {
            return;
          }

          const message = renderConfiguredError({ errors: this.options.errors }, error, "iiif.fetch_failed");

          renderMessage(preview, message, true);
          footer.textContent = message;
        }
      };

      const renderResult = () => {
        renderSparqlResult(resultFooter, resultContainer, currentAttrs.result, {
          pageSize: currentAttrs.resultPageSize,
          errors: this.options.errors,
          onPageSizeChange: (resultPageSize) => {
            updateAttrs({ resultPageSize });
          }
        });
      };

      const renderViewer = async (
        tileSources: unknown,
        options: {
          sequenceMode?: boolean;
          showReferenceStrip?: boolean;
          referenceStripScroll?: "horizontal" | "vertical";
          referenceStripPosition?: "BOTTOM_LEFT" | "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_RIGHT";
          referenceStripHeight?: number;
          referenceStripWidth?: number;
        } = {}
      ) => {
        preview.innerHTML = "";
        const viewerHost = document.createElement("div");
        const openSeadragon = await loadOpenSeadragonFactory();

        viewerHost.className = "ld-iiif-viewer";
        viewerHost.style.height = `${parseIiifHeight(
          String(currentAttrs.height),
          this.options.iiif.defaultHeight
        )}px`;
        preview.append(viewerHost);
        viewer = openSeadragon({
          element: viewerHost,
          tileSources,
          drawer: ["canvas", "html"],
          autoHideControls: false,
          showNavigator: false,
          showNavigationControl: true,
          showSequenceControl: Boolean(options.sequenceMode),
          prefixUrl: "",
          navImages: createOpenSeadragonNavImages(),
          ...options,
          gestureSettingsMouse: {
            clickToZoom: true,
            dblClickToZoom: true,
            scrollToZoom: true
          }
        });
      };

      const renderSparqlPreview = async (currentLoad: number) => {
        const result = currentAttrs.result;

        if (!currentAttrs.query.trim()) {
          renderMessage(preview, translateSpecialNodeText("status.iiifSparqlHint"));
          footer.textContent = translateSpecialNodeText("status.expectedIiifUrl");
          return;
        }

        if (!result) {
          renderMessage(preview, translateSpecialNodeText("status.iiifSparqlRunHint"));
          footer.textContent = translateSpecialNodeText("status.expectedIiifUrl");
          return;
        }

        if (result.status === "error") {
          renderMessage(
            preview,
            renderConfiguredErrorCode(this.options.errors, result.code, result.variables),
            true
          );
          return;
        }

        const items = extractIiifResultItems(result, currentAttrs.resultMapping);

        if (!items.length) {
          renderMessage(preview, translateSpecialNodeText("status.iiifMissingResult"), true);
          return;
        }

        const selected = selectIiifResultItem(items, currentAttrs.selectedItem);

        preview.innerHTML = "";
        if (currentAttrs.viewMode === "gallery") {
          await renderGalleryViewer(items, currentLoad);
          return;
        }

        if (items.length > 1) {
          preview.append(
            createIiifResultSelector(items, selected, (item) => {
              updateAttrs({ selectedItem: item });
            })
          );
        }

        renderMessage(preview, translateSpecialNodeText("status.loadingIiifResource"));

        try {
          const info = await loadIiifImageApiInfo(selected.url, this.options.iiif);

          if (currentLoad !== loadVersion) {
            return;
          }

          await renderViewer(info.tileSource);
          if (items.length > 1) {
            preview.prepend(
              createIiifResultSelector(items, selected, (item) => {
                updateAttrs({ selectedItem: item });
              })
            );
          }
          footer.textContent = translateSpecialNodeText("status.iiifResourcesFooter", {
            count: items.length,
            rows: result.rows.length,
            details: formatIiifFooter(info)
          });
        } catch (error) {
          if (currentLoad !== loadVersion) {
            return;
          }

          const message = renderConfiguredError({ errors: this.options.errors }, error, "iiif.fetch_failed");

          renderMessage(preview, message, true);
          footer.textContent = message;
        }
      };

      const renderGalleryViewer = async (items: IiifResultItem[], currentLoad: number) => {
        renderMessage(
          preview,
          translateSpecialNodeText("status.loadingIiifResources", {
            count: items.length
          })
        );
        footer.textContent = translateSpecialNodeText("status.loadingIiifResources", {
          count: items.length
        });

        try {
          const resources = (
            await Promise.all(items.map((item) => loadIiifResources(item.url, this.options.iiif)))
          ).flat();

          if (currentLoad !== loadVersion) {
            return;
          }

          if (!resources.length) {
            renderMessage(preview, translateSpecialNodeText("status.noIiifGalleryImages"), true);
            footer.textContent = translateSpecialNodeText("status.noIiifGalleryImages");
            return;
          }

          const referenceStrip = currentAttrs.galleryReferenceStrip ?? "horizontal";

          await renderViewer(
            resources.map((resource) => resource.tileSource),
            {
              sequenceMode: true,
              showReferenceStrip: referenceStrip !== "none",
              referenceStripScroll: referenceStrip === "vertical" ? "vertical" : "horizontal",
              referenceStripPosition: referenceStrip === "vertical" ? "TOP_LEFT" : "BOTTOM_LEFT",
              referenceStripWidth: referenceStrip === "vertical" ? 130 : undefined,
              referenceStripHeight: referenceStrip === "vertical" ? undefined : 100
            }
          );
          footer.textContent = formatIiifGalleryFooter(resources, items.length);
        } catch (error) {
          if (currentLoad !== loadVersion) {
            return;
          }

          const message = renderConfiguredError({ errors: this.options.errors }, error, "iiif.fetch_failed");

          renderMessage(preview, message, true);
          footer.textContent = message;
        }
      };

      const renderMessage = (target: HTMLElement, text: string, error = false) => {
        target.innerHTML = "";
        const message = document.createElement("div");

        message.className = ["ld-visualization-empty", error ? "ld-visualization-error" : ""]
          .filter(Boolean)
          .join(" ");
        message.textContent = text;
        target.append(message);
      };

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });

      sourceModeSelect.addEventListener("change", () => {
        updateAttrs({
          sourceMode: sourceModeSelect.value as IiifSourceMode,
          selectedItem: null,
          result: null
        });
      });

      urlInput.addEventListener("input", () => {
        urlInput.rows = Math.max(3, urlInput.value.split("\n").length + 1);
        updateAttrs({ url: urlInput.value, selectedItem: null });
      });

      urlInput.addEventListener("blur", () => {
        void renderPreview();
      });

      queryEditor.onChange((value) => {
        updateAttrs({
          query: value,
          selectedItem: null,
          result: null
        });
      });

      queryEditor.element.addEventListener("focusout", () => {
        void renderPreview();
      });

      captionInput.addEventListener("input", () => {
        updateAttrs({ caption: captionInput.value });
      });

      viewModeSelect.addEventListener("change", () => {
        updateAttrs({ viewMode: viewModeSelect.value as IiifViewMode });
      });

      galleryReferenceStripSelect.addEventListener("change", () => {
        updateAttrs({
          galleryReferenceStrip: galleryReferenceStripSelect.value as IiifGalleryReferenceStrip
        });
      });

      heightInput.addEventListener("input", () => {
        updateAttrs({
          height: parseIiifHeight(heightInput.value, this.options.iiif.defaultHeight)
        });
      });

      heightInput.addEventListener("blur", () => {
        void renderPreview();
      });

      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
      });

      editButton.addEventListener("click", () => {
        void (async () => {
          if (!currentAttrs.knowledgeGraphProfileId) return;
          const output = await this.options.openBuilder?.({
            id: currentAttrs.id,
            title: currentAttrs.title,
            source: currentAttrs.query,
            queryJson: null,
            configId: this.options.defaultConfigId,
            knowledgeGraphProfileId: currentAttrs.knowledgeGraphProfileId
          });

          if (!output) {
            return;
          }

          updateAttrs({
            query: output.source ?? currentAttrs.query,
            knowledgeGraphProfileId: output.knowledgeGraphProfileId ?? currentAttrs.knowledgeGraphProfileId,
            selectedItem: null,
            result: null
          });
        })();
      });

      runButton.addEventListener("click", () => {
        void (async () => {
          if (currentAttrs.sourceMode === "url") {
            void renderPreview();
            return;
          }
          if (!currentAttrs.knowledgeGraphProfileId) return;

          const query = currentAttrs.query.trim();
          const profile = this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId);

          if (!query) {
            updateAttrs({
              result: {
                status: "error",
                endpointUrl: profile.sparqlUrl,
                executedAt: new Date().toISOString(),
                durationMs: 0,
                code: "sparql.query_empty",
                message: "sparql.query_empty"
              }
            });
            return;
          }

          runButton.disabled = true;
          renderMessage(preview, translateSpecialNodeText("status.runningQueryDots"));
          resultContainer.innerHTML = "";
          footer.textContent = translateSpecialNodeText("status.knowledgeGraphStatus", {
            label: profile.label
          });

          const result = await this.options.executeQuery(profile.sparqlUrl, query, fetch);

          runButton.disabled = false;
          updateAttrs({ result, selectedItem: null });
        })();
      });

      deleteButton.addEventListener("click", () => {
        if (typeof getPos !== "function") {
          return;
        }

        const pos = getPos();
        if (typeof pos !== "number") {
          return;
        }

        editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
        editor.view.focus();
      });

      renderState();

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== IIIF_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeIiifNodeAttrs(
            updatedNode.attrs,
            this.options.iiif,
            this.options.defaultKnowledgeGraphProfileId
          );
          renderState();
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: isNodeViewControlEvent,
        destroy: () => {
          loadVersion += 1;
          queryEditor.destroy();
          destroyViewer();
        }
      };
    };
  }
});

function createIiifResultSelector(
  items: IiifResultItem[],
  selectedItem: IiifResultItem,
  onSelect: (item: IiifResultItem) => void
): HTMLElement {
  const wrapper = document.createElement("label");
  const label = document.createElement("span");
  const select = markNodeViewControl(document.createElement("select"));

  wrapper.className = "ld-iiif-result-selector";
  label.textContent = translateSpecialNodeText("fields.iiifResult");
  select.setAttribute("aria-label", translateSpecialNodeText("aria.iiifResult"));

  items.forEach((item) => {
    const option = document.createElement("option");
    const suffix = item.resource ? ` · ${item.resource}` : "";

    option.value = item.url;
    option.textContent = `${item.label}${suffix}`;
    select.append(option);
  });

  select.value = selectedItem.url;
  select.addEventListener("change", () => {
    const item = items.find((entry) => entry.url === select.value);

    if (item) {
      onSelect(item);
    }
  });

  wrapper.append(label, select);
  return wrapper;
}

function parseIiifHeight(value: string, fallback: number): number {
  const height = Number.parseInt(value, 10);

  if (!Number.isFinite(height)) {
    return fallback;
  }

  return Math.min(Math.max(height, 160), 1600);
}

function formatIiifFooter(info: IiifResolvedResource): string {
  const dimensions = info.width > 0 && info.height > 0 ? ` · ${info.width} x ${info.height}` : "";

  if (info.type === "manifest") {
    return translateSpecialNodeText("status.iiifManifestFooter", {
      version: info.version,
      label: info.label,
      canvasLabel: info.canvasLabel,
      dimensions
    });
  }

  return translateSpecialNodeText("status.iiifImageFooter", {
    version: info.version,
    dimensions
  });
}

function formatIiifGalleryFooter(resources: IiifResolvedResource[], sourceCount: number): string {
  const imageLabel =
    resources.length === 1
      ? translateSpecialNodeText("status.image")
      : translateSpecialNodeText("status.images");
  const sourceLabel =
    sourceCount === 1
      ? translateSpecialNodeText("status.source")
      : translateSpecialNodeText("status.sources");

  return translateSpecialNodeText("status.iiifGalleryFooter", {
    count: resources.length,
    imageLabel,
    sourceCount,
    sourceLabel
  });
}

function createOpenSeadragonNavImages(): Record<string, Record<string, string>> {
  return {
    zoomIn: createOpenSeadragonButtonImage(ZoomIn),
    zoomOut: createOpenSeadragonButtonImage(ZoomOut),
    home: createOpenSeadragonButtonImage(Home),
    fullpage: createOpenSeadragonButtonImage(Maximize),
    rotateleft: createOpenSeadragonButtonImage(RotateCcw),
    rotateright: createOpenSeadragonButtonImage(RotateCw),
    flip: createOpenSeadragonButtonImage(FlipHorizontal),
    previous: createOpenSeadragonButtonImage(ChevronLeft),
    next: createOpenSeadragonButtonImage(ChevronRight)
  };
}

function createOpenSeadragonButtonImage(icon: IconNode): Record<string, string> {
  return {
    REST: createOpenSeadragonButtonDataUrl(icon, "#ffffff", "#2f3742", "#111827"),
    GROUP: createOpenSeadragonButtonDataUrl(icon, "#f7f8fa", "#2f3742", "#111827"),
    HOVER: createOpenSeadragonButtonDataUrl(icon, "#eef6ff", "#0072B2", "#0f172a"),
    DOWN: createOpenSeadragonButtonDataUrl(icon, "#dbeafe", "#0072B2", "#0f172a")
  };
}

function createOpenSeadragonButtonDataUrl(
  icon: IconNode,
  fill: string,
  border: string,
  stroke: string
): string {
  const iconSvg = renderIcon(icon, {
    class: undefined,
    height: "20",
    stroke,
    width: "20",
    x: "6",
    y: "6"
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="5" fill="${fill}" fill-opacity=".96" stroke="${border}" stroke-width="1.4"/>${iconSvg}</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function createField(
  label: string,
  control: HTMLElement,
  mode?: IiifSourceMode,
  knowledgeGraphProfile?: { id: string; label: string }
): HTMLElement {
  const isComplexControl =
    control instanceof HTMLTextAreaElement || control.classList.contains("ld-sparql-source-editor");
  return createSpecialNodeField(label, control, {
    className: "ld-iiif-field",
    complexControl: isComplexControl,
    modeAttribute: "iiifFieldMode",
    mode,
    labelIdPrefix: control.getAttribute("aria-label") ?? "iiif-field",
    knowledgeGraphProfile
  });
}

async function loadOpenSeadragonFactory(): Promise<OpenSeadragonFactory> {
  if (globalThis.__lodeonOpenSeadragonFactory) {
    return globalThis.__lodeonOpenSeadragonFactory;
  }

  const module = await import("openseadragon");

  return module.default;
}
