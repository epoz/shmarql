/** Owns the Embed Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, WandSparkles } from "lucide";
import type { LodeonConfig } from "../../configuration/schema";
import { renderConfiguredErrorCode } from "../../errors/client-error";
import { defaultEmbedOptions, sanitizeEmbedTokenList, validateEmbedUrl } from "./security";
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
  EmbedCandidate,
  EmbedGalleryReferenceStrip,
  EmbedMetadataItem,
  EmbedNodeAttrs,
  EmbedSourceMode,
  EmbedViewMode
} from "./contracts";
import { loadMissingEmbedMetadata } from "./metadata-cache";
import {
  buildEmbedSpec,
  normalizeSelectedIndex,
  parseEmbedCandidates,
  parseEmbedResultCandidates
} from "./source-projection";

export const EMBED_NODE_TYPE_NAME = "embedNode";

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number];

export type EmbedNodeOptions = {
  embeds: LodeonConfig["nodes"]["embed"];
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId?: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};

/** Creates canonical Embed node JSON through the same attribute normalizer used by its NodeView. */
export function createEmbedNodeContent(
  attrs: Partial<EmbedNodeAttrs> = {},
  embeds?: LodeonConfig["nodes"]["embed"],
  defaultKnowledgeGraphProfileId?: string
): JSONContent {
  return {
    type: EMBED_NODE_TYPE_NAME,
    attrs: normalizeEmbedNodeAttrs(attrs, embeds, defaultKnowledgeGraphProfileId)
  };
}

/** Normalizes persisted Embed attributes without loading remote metadata or content. */
export function normalizeEmbedNodeAttrs(
  attrs: Partial<EmbedNodeAttrs> = {},
  embeds?: LodeonConfig["nodes"]["embed"],
  defaultKnowledgeGraphProfileId?: string
): EmbedNodeAttrs {
  const defaults = embeds ?? defaultEmbedOptions();
  const defaultTitle = translateSpecialNodeText("registry.embed.label");
  const knowledgeGraphProfileId = attrs.knowledgeGraphProfileId ?? defaultKnowledgeGraphProfileId;

  const resolvedAttrs: EmbedNodeAttrs = {
    id: attrs.id ?? createNodeId("embed"),
    kind: "embed",
    title: attrs.title ?? defaultTitle,
    sourceMode: attrs.sourceMode ?? "url",
    url: attrs.url ?? "",
    query: attrs.query ?? "",
    ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}),
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    caption: attrs.caption ?? "",
    aspectRatio: attrs.aspectRatio ?? defaults.defaultAspectRatio,
    height: attrs.height ?? 420,
    viewMode: attrs.viewMode ?? "single",
    galleryReferenceStrip: attrs.galleryReferenceStrip ?? "horizontal",
    selectedIndex: attrs.selectedIndex ?? 0,
    sandbox: attrs.sandbox ?? defaults.sandbox,
    allow: attrs.allow ?? defaults.allow,
    referrerPolicy: attrs.referrerPolicy ?? defaults.referrerPolicy,
    loading: attrs.loading ?? "lazy",
    viewConfig: {},
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };

  resolvedAttrs.viewConfig = attrs.viewConfig ?? buildEmbedSpec(resolvedAttrs);

  return resolvedAttrs;
}

/** Owns Embed authoring state, async query and metadata generations, event isolation, and deterministic editor teardown. */
export const EmbedNode = Node.create<EmbedNodeOptions>({
  name: EMBED_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,

  addOptions() {
    return {
      embeds: defaultEmbedOptions(),
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
      kind: { default: "embed" },
      title: { default: translateSpecialNodeText("registry.embed.label") },
      sourceMode: { default: "url" },
      url: { default: "" },
      query: { default: "" },
      knowledgeGraphProfileId: { default: this.options.defaultKnowledgeGraphProfileId },
      result: { default: null },
      resultPageSize: { default: 10 },
      caption: { default: "" },
      aspectRatio: { default: "16:9" },
      height: { default: 420 },
      viewMode: { default: "single" },
      galleryReferenceStrip: { default: "horizontal" },
      selectedIndex: { default: 0 },
      sandbox: { default: [] },
      allow: { default: [] },
      referrerPolicy: { default: "strict-origin-when-cross-origin" },
      loading: { default: "lazy" },
      viewConfig: { default: {} },
      collapsed: { default: false },
      excludeFromRender: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: "section[data-lodeon-node='embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "embed",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let currentAttrs = normalizeEmbedNodeAttrs(
        node.attrs,
        this.options.embeds,
        this.options.defaultKnowledgeGraphProfileId
      );
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
        className: "ld-embed-sparql-source-editor",
        ariaLabel: translateSpecialNodeText("aria.embedSparqlQuery"),
        placeholder: translateSpecialNodeText("placeholders.embedSparqlQuery")
      });
      const captionInput = markNodeViewControl(document.createElement("input"));
      const viewModeSelect = markNodeViewControl(document.createElement("select"));
      const galleryReferenceStripSelect = markNodeViewControl(document.createElement("select"));
      const heightInput = markNodeViewControl(document.createElement("input"));
      const allowedOrigins = document.createElement("div");
      const preview = document.createElement("div");
      const footer = document.createElement("div");
      const resultFooter = document.createElement("div");
      const resultContainer = document.createElement("div");

      container.className = "ld-node ld-embed-node";
      container.dataset.lodeonNode = "embed";
      container.dataset.nodeId = String(node.attrs.id);
      container.setAttribute("contenteditable", "false");

      title.className = "ld-node-title-input";
      title.type = "text";
      title.value = String(currentAttrs.title ?? translateSpecialNodeText("registry.embed.label"));
      title.setAttribute("aria-label", translateSpecialNodeText("nodes.embed.titleAria"));

      editButton.className = "ld-node-run-button";
      editButton.type = "button";
      editButton.innerHTML = `${renderIcon(WandSparkles)}<span>${translateSpecialNodeText(
        "actions.visualQueryBuilder"
      )}</span>`;
      editButton.setAttribute("aria-label", translateSpecialNodeText("actions.openVisualQueryBuilder"));

      runButton.className = "ld-node-run-button";
      runButton.type = "button";
      runButton.innerHTML = `${renderIcon(Play)}<span>${translateSpecialNodeText("actions.load")}</span>`;
      runButton.setAttribute("aria-label", translateSpecialNodeText("actions.runEmbedQuery"));

      body.className = "ld-node-body";
      controls.className = "ld-embed-controls";
      sourceControls.className = "ld-embed-source-controls";
      allowedOrigins.className = "ld-embed-origins";
      preview.className = "ld-embed-preview";
      footer.className = "ld-node-footer";
      resultFooter.className = "ld-node-footer ld-embed-result-footer";
      resultContainer.className = "ld-sparql-result ld-embed-result";

      sourceModeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.embedSourceMode"));
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
      urlInput.placeholder = translateSpecialNodeText("placeholders.embedUrl");
      urlInput.setAttribute("aria-label", translateSpecialNodeText("aria.embedUrl"));

      captionInput.type = "text";
      captionInput.placeholder = translateSpecialNodeText("placeholders.optionalCaption");
      captionInput.setAttribute("aria-label", translateSpecialNodeText("aria.embedCaption"));

      [
        ["single", translateSpecialNodeText("options.viewMode.single")],
        ["gallery", translateSpecialNodeText("options.viewMode.gallery")]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        viewModeSelect.append(option);
      });
      viewModeSelect.setAttribute("aria-label", translateSpecialNodeText("aria.embedViewMode"));

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
        translateSpecialNodeText("aria.embedGalleryReferenceStrip")
      );

      heightInput.type = "number";
      heightInput.min = "120";
      heightInput.max = "1600";
      heightInput.step = "10";
      heightInput.setAttribute("aria-label", translateSpecialNodeText("aria.embedCustomHeight"));

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
      body.append(controls, sourceControls, allowedOrigins, preview, footer, resultFooter, resultContainer);

      const specialHeader = createSpecialNodeHeader({
        editor,
        getPos,
        label: "embed",
        labelKey: "nodes.embed.headerLabel",
        eyebrow: "embed",
        eyebrowKey: "nodes.embed.eyebrow",
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

      const updateAttrs = (attrs: Partial<EmbedNodeAttrs>) => {
        const pos = typeof getPos === "function" ? getPos() : null;

        if (typeof pos !== "number") {
          return;
        }

        currentAttrs = {
          ...currentAttrs,
          ...attrs
        };
        currentAttrs.viewConfig = buildEmbedSpec(currentAttrs);
        dispatchNodeAttrs(editor, getPos, currentAttrs);
        renderState();
      };

      const renderState = () => {
        const collapsed = Boolean(currentAttrs.collapsed);

        title.value = currentAttrs.title ?? translateSpecialNodeText("registry.embed.label");
        sourceModeSelect.value = currentAttrs.sourceMode ?? "url";
        urlInput.value = currentAttrs.url ?? "";
        if (!queryEditor.hasFocus()) {
          queryEditor.setValue(currentAttrs.query ?? "");
        }
        updateSpecialNodeFieldKnowledgeGraphProfile(
          queryField,
          this.options.resolveKnowledgeGraphProfile(currentAttrs.knowledgeGraphProfileId)
        );
        captionInput.value = currentAttrs.caption ?? "";
        viewModeSelect.value = currentAttrs.viewMode ?? "single";
        galleryReferenceStripSelect.value = currentAttrs.galleryReferenceStrip ?? "horizontal";
        heightInput.value = String(currentAttrs.height ?? 420);
        body.hidden = collapsed;
        container.dataset.collapsed = collapsed ? "true" : "false";
        container.dataset.excludedFromRender = currentAttrs.excludeFromRender ? "true" : "false";
        container.dataset.sourceMode = currentAttrs.sourceMode;
        editButton.hidden = currentAttrs.sourceMode !== "sparql";
        editButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        runButton.disabled =
          currentAttrs.sourceMode === "sparql" && !this.options.defaultKnowledgeGraphProfileId;
        runButton.querySelector("span")!.textContent =
          currentAttrs.sourceMode === "sparql"
            ? translateSpecialNodeText("actions.run")
            : translateSpecialNodeText("actions.load");
        resultFooter.hidden = currentAttrs.sourceMode !== "sparql";
        resultContainer.hidden = currentAttrs.sourceMode !== "sparql";
        renderAllowedOrigins();
        collapseButton.innerHTML = renderIcon(collapsed ? ChevronRight : ChevronDown);
        collapseButton.setAttribute(
          "aria-label",
          collapsed
            ? translateSpecialNodeText("header.expandAria", {
                label: translateSpecialNodeText("nodes.embed.headerLabel")
              })
            : translateSpecialNodeText("header.collapseAria", {
                label: translateSpecialNodeText("nodes.embed.headerLabel")
              })
        );
        collapseButton.title = collapsed
          ? translateSpecialNodeText("header.expandTitle")
          : translateSpecialNodeText("header.collapseTitle");
        renderPreview();
      };

      const renderAllowedOrigins = () => {
        const origins = this.options.embeds.allowedOrigins;

        allowedOrigins.innerHTML = "";
        const label = document.createElement("strong");

        label.textContent = translateSpecialNodeText("status.allowedOrigins");
        allowedOrigins.append(label);

        if (!origins.length) {
          const empty = document.createElement("span");

          empty.textContent = translateSpecialNodeText("status.noAllowedOrigins");
          allowedOrigins.append(empty);
          return;
        }

        const list = document.createElement("div");

        list.className = "ld-embed-origin-list";

        origins.forEach((origin) => {
          const item = document.createElement("span");

          item.className = "ld-embed-origin-chip";
          item.textContent = origin;
          list.append(item);
        });
        allowedOrigins.append(list);
      };

      const renderPreview = () => {
        const renderVersion = `${currentAttrs.id}:${currentAttrs.sourceMode}:${currentAttrs.url}`;
        const candidates =
          currentAttrs.sourceMode === "sparql"
            ? parseEmbedResultCandidates(currentAttrs.result, this.options.embeds.allowedOrigins)
            : parseEmbedCandidates(currentAttrs.url, this.options.embeds.allowedOrigins);
        const allowedCandidates = candidates.filter((candidate) => candidate.validation.status === "allowed");
        const invalidCandidates = candidates.filter(
          (candidate) =>
            candidate.validation.status === "invalid" || candidate.validation.status === "blocked"
        );
        const selectedIndex = normalizeSelectedIndex(currentAttrs.selectedIndex, allowedCandidates.length);
        const activeCandidate = allowedCandidates[selectedIndex];

        preview.innerHTML = "";

        if (currentAttrs.sourceMode === "sparql") {
          renderResult();
        } else {
          resultFooter.textContent = "";
          resultContainer.innerHTML = "";
        }

        if (currentAttrs.sourceMode === "sparql" && !currentAttrs.query.trim()) {
          renderMessage(preview, translateSpecialNodeText("status.embedSparqlHint"));
          footer.textContent = translateSpecialNodeText("status.expectedEmbedUrl");
          return;
        }

        if (currentAttrs.sourceMode === "sparql" && !currentAttrs.result) {
          renderMessage(preview, translateSpecialNodeText("status.embedSparqlRunHint"));
          footer.textContent = translateSpecialNodeText("status.expectedEmbedUrl");
          return;
        }

        if (currentAttrs.result?.status === "error") {
          const message = renderConfiguredErrorCode(
            this.options.errors,
            currentAttrs.result.code,
            currentAttrs.result.variables
          );
          renderMessage(preview, message, true);
          footer.textContent = message;
          return;
        }

        if (!candidates.length) {
          renderMessage(
            preview,
            currentAttrs.sourceMode === "sparql"
              ? translateSpecialNodeText("status.embedMissingResult")
              : translateSpecialNodeText("status.embedExternalUrlHint"),
            currentAttrs.sourceMode === "sparql"
          );
          footer.textContent =
            currentAttrs.sourceMode === "sparql"
              ? translateSpecialNodeText("status.expectedEmbedUrl")
              : translateSpecialNodeText("status.noEmbedUrlConfigured");
          return;
        }

        if (!activeCandidate) {
          const validation =
            invalidCandidates[0]?.validation.status === "invalid" ||
            invalidCandidates[0]?.validation.status === "blocked"
              ? invalidCandidates[0].validation
              : null;
          const message = validation
            ? renderConfiguredErrorCode(this.options.errors, validation.code, validation.variables)
            : renderConfiguredErrorCode(this.options.errors, "embed.origin_blocked");

          renderMessage(preview, message, true);
          footer.textContent = message;
          return;
        }

        if (selectedIndex !== currentAttrs.selectedIndex) {
          currentAttrs.selectedIndex = selectedIndex;
          currentAttrs.viewConfig = buildEmbedSpec(currentAttrs);
          dispatchNodeAttrs(editor, getPos, currentAttrs);
        }

        const validation = activeCandidate.validation;
        const iframe = document.createElement("iframe");
        const selector =
          currentAttrs.viewMode === "gallery" &&
          currentAttrs.galleryReferenceStrip !== "none" &&
          allowedCandidates.length > 1
            ? renderEmbedSelector(
                allowedCandidates,
                selectedIndex,
                currentAttrs.galleryReferenceStrip,
                (nextIndex) => {
                  updateAttrs({ selectedIndex: nextIndex });
                }
              )
            : null;

        iframe.src = validation.status === "allowed" ? validation.url : "";
        iframe.title = currentAttrs.title || translateSpecialNodeText("status.embeddedContent");
        iframe.loading = currentAttrs.loading;
        iframe.referrerPolicy = currentAttrs.referrerPolicy as ReferrerPolicy;
        iframe.setAttribute("sandbox", sanitizeEmbedTokenList(currentAttrs.sandbox).join(" "));
        iframe.allow = sanitizeEmbedTokenList(currentAttrs.allow).join("; ");
        iframe.setAttribute("allowfullscreen", "");
        iframe.className = "ld-embed-iframe";
        applyEmbedSize(iframe, currentAttrs);

        if (selector && currentAttrs.galleryReferenceStrip === "vertical") {
          const layout = document.createElement("div");

          layout.className = "ld-embed-preview-row";
          layout.style.height = iframe.style.height;
          selector.style.height = iframe.style.height;
          layout.append(selector, iframe);
          preview.append(layout);
        } else {
          preview.append(iframe);

          if (selector) {
            preview.append(selector);
          }
        }

        footer.textContent = formatEmbedFooter(
          validation.status === "allowed" ? validation.origin : "",
          allowedCandidates.length,
          invalidCandidates.length
        );

        if (currentAttrs.sourceMode === "url" && allowedCandidates.length > 1) {
          void loadMissingEmbedMetadata(allowedCandidates).then((items) => {
            const nextVersion = `${currentAttrs.id}:${currentAttrs.sourceMode}:${currentAttrs.url}`;

            if (items.length && nextVersion === renderVersion) {
              applyEmbedSelectorMetadata(preview, items);
            }
          });
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

      title.addEventListener("input", () => {
        updateAttrs({ title: title.value });
      });

      urlInput.addEventListener("input", () => {
        updateAttrs({ url: urlInput.value });
      });

      captionInput.addEventListener("input", () => {
        updateAttrs({ caption: captionInput.value });
      });

      sourceModeSelect.addEventListener("change", () => {
        updateAttrs({
          sourceMode: sourceModeSelect.value as EmbedSourceMode,
          selectedIndex: 0,
          result: null
        });
      });

      queryEditor.onChange((value) => {
        updateAttrs({
          query: value,
          selectedIndex: 0,
          result: null
        });
      });

      viewModeSelect.addEventListener("change", () => {
        updateAttrs({ viewMode: viewModeSelect.value as EmbedViewMode });
      });

      galleryReferenceStripSelect.addEventListener("change", () => {
        updateAttrs({
          galleryReferenceStrip: galleryReferenceStripSelect.value as EmbedGalleryReferenceStrip
        });
      });

      heightInput.addEventListener("input", () => {
        updateAttrs({ height: parseEmbedHeight(heightInput.value) });
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
            selectedIndex: 0,
            result: null
          });
        })();
      });

      runButton.addEventListener("click", () => {
        void (async () => {
          if (currentAttrs.sourceMode === "url") {
            renderPreview();
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
          updateAttrs({ result, selectedIndex: 0 });
        })();
      });

      collapseButton.addEventListener("click", () => {
        updateAttrs({ collapsed: !currentAttrs.collapsed });
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

      container.addEventListener("mousedown", (event) => {
        if (isNodeViewControlEvent(event)) {
          event.stopPropagation();
        }
      });

      renderState();

      return {
        dom: container,
        update: (updatedNode) => {
          if (updatedNode.type.name !== EMBED_NODE_TYPE_NAME) {
            return false;
          }

          currentAttrs = normalizeEmbedNodeAttrs(
            updatedNode.attrs,
            this.options.embeds,
            this.options.defaultKnowledgeGraphProfileId
          );
          renderState();
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: (event) =>
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement ||
          event.target instanceof HTMLButtonElement ||
          event.target instanceof HTMLTextAreaElement ||
          isNodeViewControlEvent(event),
        destroy: () => {
          queryEditor.destroy();
        }
      };
    };
  }
});

function parseEmbedHeight(value: string): number {
  const height = Number.parseInt(value, 10);

  if (!Number.isFinite(height)) {
    return 420;
  }

  return Math.min(Math.max(height, 120), 1600);
}

function formatEmbedFooter(origin: string, allowedCount: number, invalidCount: number): string {
  const total = allowedCount + invalidCount;
  const countLabel =
    total === 1 ? translateSpecialNodeText("status.url") : translateSpecialNodeText("status.urls");
  const invalidSuffix =
    invalidCount > 0
      ? translateSpecialNodeText("status.blockedOrInvalid", {
          count: invalidCount
        })
      : "";

  if (total <= 1) {
    return translateSpecialNodeText("status.allowedEmbedSingle", { origin });
  }

  return translateSpecialNodeText("status.allowedEmbedGallery", {
    origin,
    allowedCount,
    total,
    countLabel,
    invalidSuffix
  });
}

function renderEmbedSelector(
  candidates: EmbedCandidate[],
  selectedIndex: number,
  strip: EmbedGalleryReferenceStrip,
  onSelect: (index: number) => void
): HTMLElement {
  const selector = markNodeViewControl(document.createElement("div"));

  selector.className = ["ld-embed-selector", strip === "vertical" ? "ld-embed-selector-vertical" : ""]
    .filter(Boolean)
    .join(" ");

  candidates.forEach((candidate, index) => {
    const button = markNodeViewControl(document.createElement("button"));
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const validation = candidate.validation;

    button.type = "button";
    button.className = "ld-embed-selector-item";
    button.dataset.active = index === selectedIndex ? "true" : "false";
    button.setAttribute("aria-label", translateSpecialNodeText("aria.showEmbed", { index: index + 1 }));
    title.className = "ld-embed-selector-title";
    meta.className = "ld-embed-selector-meta";
    title.textContent = formatEmbedCardTitle(candidate, index + 1);
    meta.textContent = candidate.resource ?? getEmbedUrlSummary(candidate.rawUrl, validation);
    button.dataset.embedUrl = candidate.rawUrl;
    button.append(title, meta);
    button.addEventListener("click", () => onSelect(index));
    selector.append(button);
  });

  return selector;
}

function formatEmbedCardTitle(candidate: EmbedCandidate, index: number): string {
  if (candidate.source === "direct") {
    return candidate.label
      ? translateSpecialNodeText("status.embedCardTitleWithLabel", {
          index,
          label: candidate.label
        })
      : translateSpecialNodeText("status.embedCardTitle", { index });
  }

  return candidate.label || translateSpecialNodeText("status.embedCardTitle", { index });
}

function getEmbedUrlSummary(value: string, validation: ReturnType<typeof validateEmbedUrl>): string {
  try {
    const parsed = new URL(value);
    const distinguishingPart =
      parsed.searchParams.get("entity") ??
      parsed.searchParams.get("v") ??
      parsed.pathname.split("/").filter(Boolean).at(-1) ??
      parsed.pathname;

    if (distinguishingPart && distinguishingPart !== "index.html") {
      return `${parsed.hostname} · ${distinguishingPart}`;
    }

    return validation.status === "allowed" ? validation.origin : value;
  } catch {
    return value;
  }
}

function applyEmbedSelectorMetadata(preview: HTMLElement, items: EmbedMetadataItem[]): void {
  const metadataByUrl = new Map(items.map((item) => [item.url, item]));

  preview
    .querySelectorAll<HTMLButtonElement>(".ld-embed-selector-item[data-embed-url]")
    .forEach((button, index) => {
      const url = button.dataset.embedUrl;
      const title = url ? metadataByUrl.get(url)?.title : "";

      if (!title) {
        return;
      }

      const titleElement = button.querySelector<HTMLElement>(".ld-embed-selector-title");

      if (titleElement) {
        titleElement.textContent = translateSpecialNodeText("status.embedCardTitleWithLabel", {
          index: index + 1,
          label: title
        });
      }
    });
}

function applyEmbedSize(iframe: HTMLIFrameElement, attrs: EmbedNodeAttrs): void {
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.height = `${parseEmbedHeight(String(attrs.height))}px`;
}

function renderMessage(container: HTMLElement, message: string, error = false): void {
  const fallback = document.createElement("div");

  fallback.className = ["ld-visualization-empty", error ? "ld-visualization-error" : ""]
    .filter(Boolean)
    .join(" ");
  fallback.textContent = message;
  container.append(fallback);
}

function createField(
  label: string,
  control: HTMLElement,
  mode?: string,
  knowledgeGraphProfile?: { id: string; label: string }
): HTMLElement {
  const isComplexControl = control.classList.contains("ld-sparql-source-editor");
  return createSpecialNodeField(label, control, {
    className: "ld-embed-field",
    complexControl: isComplexControl,
    modeAttribute: "embedFieldMode",
    mode,
    labelIdPrefix: control.getAttribute("aria-label") ?? "embed-field",
    knowledgeGraphProfile
  });
}
