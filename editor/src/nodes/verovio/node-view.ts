/** Owns the Verovio Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, WandSparkles } from "lucide";
import type { LodeonConfig, VerovioRuntimeConfig } from "../../configuration/schema";
import {
  LodeonClientError,
  renderConfiguredError,
  renderConfiguredErrorCode
} from "../../errors/client-error";
import type { LodeonLocalization } from "../../localization/runtime";
import {
  EMPTY_VEROVIO_COMPARE_STATE,
  VEROVIO_NODE_TYPE_NAME,
  type VerovioInputFormat,
  type VerovioNodeAttrs,
  type VerovioRenderSpec,
  type VerovioSourceMode
} from "./contracts";
import { createVerovioEngineAdapter, type VerovioEngineAdapter } from "./engine";
import {
  normalizeDirectVerovioInput,
  normalizeVerovioFileInput,
  normalizeVerovioSparqlRows
} from "./normalization";
import { executeSparqlQuery } from "../sparql/api-client";
import {
  createVerovioPresentationView,
  type VerovioPresentationChange,
  type VerovioPresentationView
} from "./presentation-view";
import { renderIcon } from "../../ui/icons";
import {
  createSpecialNodeField,
  createSpecialNodeHeader,
  deleteNode,
  dispatchNodeAttrs,
  isNodeViewControlEvent,
  markNodeViewControl,
  markNodeViewRoot,
  translateSpecialNodeText,
  updateSpecialNodeFieldKnowledgeGraphProfile
} from "../shared/node-view-controls";
import { createNodeId } from "../shared/node-id";
import { renderSparqlResult } from "../sparql/result-view";
import { createSparqlSourceEditor } from "../sparql/source-editor";
import type { SparnaturalBuilderInput, SparnaturalBuilderOutput } from "../sparnatural/contracts";

type KnowledgeGraphProfile = LodeonConfig["knowledgeGraph"]["profiles"][number];

export type VerovioNodeOptions = {
  verovio: VerovioRuntimeConfig;
  errors?: LodeonConfig["errors"];
  i18n?: LodeonLocalization;
  createEngine: (runtime: VerovioRuntimeConfig) => VerovioEngineAdapter;
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId?: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};

/** Creates canonical Verovio node JSON with original notation text as the persisted source. */
export function createVerovioNodeContent(
  attrs: Partial<VerovioNodeAttrs> = {},
  runtime: VerovioRuntimeConfig = defaultVerovioRuntime(),
  defaultKnowledgeGraphProfileId?: string
): JSONContent {
  const knowledgeGraphProfileId = attrs.knowledgeGraphProfileId ?? defaultKnowledgeGraphProfileId;
  const resolved: VerovioNodeAttrs = {
    id: attrs.id ?? createNodeId("verovio"),
    kind: "verovio",
    title: attrs.title ?? translateSpecialNodeText("registry.verovio.label"),
    sourceMode: attrs.sourceMode ?? "direct",
    inputData: attrs.inputData ?? "",
    inputFormat: attrs.inputFormat ?? null,
    inputLabel: attrs.inputLabel ?? "",
    inputResource: attrs.inputResource ?? "",
    inputResourceLabel: attrs.inputResourceLabel ?? "",
    fileName: attrs.fileName ?? "",
    fileData: attrs.fileData ?? "",
    query: attrs.query ?? "",
    ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}),
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    items: attrs.items ?? [],
    viewMode: attrs.viewMode ?? runtime.defaultView,
    selectedItemId: attrs.selectedItemId ?? null,
    documentLayout: attrs.documentLayout ?? runtime.defaultDocumentLayout,
    initialZoom: attrs.initialZoom ?? runtime.initialZoom,
    paginatedPageHeight: attrs.paginatedPageHeight ?? runtime.paginatedPageHeight,
    visibleMetadataFields: attrs.visibleMetadataFields ?? [],
    playback: {
      tempoMultiplier: attrs.playback?.tempoMultiplier ?? runtime.playback.tempoMultiplier,
      loop: attrs.playback?.loop ?? runtime.playback.loop,
      volume: attrs.playback?.volume ?? runtime.playback.volume
    },
    compare: {
      aItemId: attrs.compare?.aItemId ?? EMPTY_VEROVIO_COMPARE_STATE.aItemId,
      bItemId: attrs.compare?.bItemId ?? EMPTY_VEROVIO_COMPARE_STATE.bItemId,
      synchronizedZoom: attrs.compare?.synchronizedZoom ?? runtime.compare.synchronizedZoom,
      aZoom: attrs.compare?.aZoom ?? attrs.initialZoom ?? runtime.initialZoom,
      bZoom: attrs.compare?.bZoom ?? attrs.initialZoom ?? runtime.initialZoom,
      playbackMode: attrs.compare?.playbackMode ?? runtime.compare.playbackMode,
      loopSequence: attrs.compare?.loopSequence ?? runtime.compare.loopSequence,
      tempoMultiplier: attrs.compare?.tempoMultiplier ?? runtime.compare.tempoMultiplier,
      targetKey: attrs.compare?.targetKey ?? EMPTY_VEROVIO_COMPARE_STATE.targetKey,
      showTransposed: attrs.compare?.showTransposed ?? EMPTY_VEROVIO_COMPARE_STATE.showTransposed
    },
    caption: attrs.caption ?? "",
    viewConfig: {} as VerovioRenderSpec,
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };
  resolved.viewConfig = buildVerovioSpec(resolved);
  return { type: VEROVIO_NODE_TYPE_NAME, attrs: resolved };
}

/** Projects normalized Verovio state into the renderer contract without storing derived SVG or MIDI. */
export function buildVerovioSpec(attrs: VerovioNodeAttrs): VerovioRenderSpec {
  return {
    renderer: "verovio",
    items: attrs.items,
    viewMode: attrs.viewMode,
    selectedItemId: attrs.selectedItemId,
    documentLayout: attrs.documentLayout,
    initialZoom: attrs.initialZoom,
    paginatedPageHeight: attrs.paginatedPageHeight,
    visibleMetadataFields: attrs.visibleMetadataFields,
    playback: attrs.playback,
    compare: attrs.compare,
    caption: attrs.caption
  };
}

/** Reads untrusted ProseMirror attributes through the Verovio-owned normalization boundary. */
export function resolveVerovioAttrs(
  attrs: Partial<VerovioNodeAttrs>,
  runtime: VerovioRuntimeConfig
): VerovioNodeAttrs {
  return createVerovioNodeContent(attrs, runtime, attrs.knowledgeGraphProfileId).attrs as VerovioNodeAttrs;
}

/** Owns query, file, rendering, cache, observer, and playback generations and invalidates all work on teardown. */
export const VerovioNode = Node.create<VerovioNodeOptions>({
  name: VEROVIO_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,
  addOptions() {
    return {
      verovio: defaultVerovioRuntime(),
      createEngine: createVerovioEngineAdapter,
      defaultConfigId: "",
      defaultKnowledgeGraphProfileId: undefined,
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: "",
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery,
      openBuilder: undefined
    };
  },
  addAttributes() {
    const defaults = createVerovioNodeContent(
      {},
      this.options.verovio,
      this.options.defaultKnowledgeGraphProfileId
    ).attrs!;
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value }]));
  },
  parseHTML() {
    return [{ tag: "section[data-lodeon-node='verovio']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "verovio",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const options = this.options;
      const engine = options.createEngine(options.verovio);
      const i18n = options.i18n ?? specialNodeLocalization();
      let attrs = resolveVerovioAttrs(node.attrs, options.verovio);
      let presentation: VerovioPresentationView | null = null;
      let validationGeneration = 0;
      let fileGeneration = 0;
      let queryGeneration = 0;
      let builderGeneration = 0;
      let destroyed = false;
      let suppressNextNodeUpdateRender = false;
      let visibleSparqlItemIndexes: number[] | null = null;
      let filteredSparqlItemIndexes: number[] | null = null;
      let requestedVisibleSparqlItemIndex: number | null = null;
      let itemsResultExecutedAt = matchingItemsResultExecutedAt(attrs);

      const root = markNodeViewRoot(document.createElement("section"));
      root.className = "ld-node ld-verovio-node";
      root.dataset.lodeonNode = "verovio";
      const title = control(document.createElement("input"));
      title.type = "text";
      title.className = "ld-node-title-input";
      title.setAttribute("aria-label", t("nodes.verovio.titleAria"));
      const builder = control(document.createElement("button"));
      builder.type = "button";
      builder.className = "ld-node-run-button";
      builder.dataset.verovioAction = "builder";
      builder.innerHTML = `${renderIcon(WandSparkles)}<span>${t("actions.visualQueryBuilder")}</span>`;
      builder.title = t("actions.openVisualQueryBuilder");
      const run = control(document.createElement("button"));
      run.type = "button";
      run.className = "ld-node-run-button";
      run.dataset.verovioAction = "run";
      run.innerHTML = `${renderIcon(Play)}<span>${t("actions.run")}</span>`;
      run.title = t("actions.run");
      run.setAttribute("aria-label", t("actions.run"));

      const body = document.createElement("div");
      body.className = "ld-node-body";
      const controls = document.createElement("div");
      controls.className = "ld-verovio-controls";
      const sourceControls = document.createElement("div");
      sourceControls.className = "ld-verovio-source-controls";
      const sourceMode = select([
        ["direct", "verovio.options.sourceMode.direct"],
        ["file", "verovio.options.sourceMode.file"],
        ["sparql", "verovio.options.sourceMode.sparql"]
      ]);
      sourceMode.querySelector<HTMLOptionElement>('option[value="sparql"]')!.disabled =
        !options.defaultKnowledgeGraphProfileId;
      const format = select([
        ["auto", "verovio.options.format.auto"],
        ["mei", "verovio.options.format.mei"],
        ["pae", "verovio.options.format.pae"]
      ]);
      const data = control(document.createElement("textarea"));
      data.rows = 12;
      data.className = "ld-verovio-data";
      data.placeholder = t("placeholders.verovioData");
      const file = control(document.createElement("input"));
      file.type = "file";
      file.accept = ".mei,.xml,.pae,.txt,application/mei+xml,application/xml,text/xml,text/plain";
      const label = textInput();
      const resource = textInput();
      const resourceLabel = textInput();
      const metadataFields = textInput();
      metadataFields.placeholder = t("placeholders.verovioMetadataFields");
      const caption = textInput();
      const queryEditor = createSparqlSourceEditor({
        value: attrs.query,
        className: "ld-verovio-sparql-source-editor",
        ariaLabel: t("verovio.fields.query"),
        placeholder: t("placeholders.verovioQuery")
      });

      controls.append(
        field("verovio.fields.sourceMode", sourceMode),
        field("verovio.fields.format", format, "input"),
        field("verovio.fields.label", label, "input"),
        field("verovio.fields.resource", resource, "input"),
        field("verovio.fields.resourceLabel", resourceLabel, "input"),
        field("verovio.fields.metadataFields", metadataFields),
        field("verovio.fields.caption", caption)
      );
      const queryField = nonLabelField(
        "verovio.fields.query",
        queryEditor.element,
        "sparql",
        options.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId)
      );
      sourceControls.append(
        field("verovio.fields.notationData", data, "direct"),
        field("verovio.fields.file", file, "file"),
        queryField
      );
      const status = document.createElement("div");
      status.className = "ld-verovio-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      const preview = markNodeViewControl(document.createElement("div"), {
        allowDocumentRelease: true
      });
      preview.className = "ld-verovio-preview";
      const resultFooter = document.createElement("div");
      resultFooter.className = "ld-node-footer ld-verovio-result-footer";
      const resultContainer = document.createElement("div");
      resultContainer.className = "ld-sparql-result ld-verovio-result";
      body.append(controls, sourceControls, status, preview, resultFooter, resultContainer);

      const header = createSpecialNodeHeader({
        editor,
        getPos,
        label: "verovio",
        labelKey: "nodes.verovio.headerLabel",
        eyebrow: "verovio",
        eyebrowKey: "nodes.verovio.eyebrow",
        titleInput: title,
        controls: {
          collapse: true,
          move: true,
          copy: true,
          renderVisibility: true,
          delete: true
        },
        collapsed: attrs.collapsed,
        excludedFromRender: attrs.excludeFromRender,
        primaryActions: [builder, run]
      });
      root.append(header.element, body);

      const update = (patch: Partial<VerovioNodeAttrs>, render = true) => {
        attrs = { ...attrs, ...patch };
        attrs.viewConfig = buildVerovioSpec(attrs);
        suppressNextNodeUpdateRender = true;
        dispatchNodeAttrs(editor, getPos, attrs);
        suppressNextNodeUpdateRender = false;
        if (render) renderState();
      };
      const invalidatePendingValidation = () => {
        validationGeneration += 1;
        run.disabled = false;
        run.removeAttribute("aria-busy");
      };
      const invalidatePendingQuery = () => {
        queryGeneration += 1;
        run.disabled = false;
        run.removeAttribute("aria-busy");
      };
      const invalidatePendingBuilder = () => {
        builderGeneration += 1;
        builder.disabled = false;
        builder.removeAttribute("aria-busy");
      };
      const invalidatePendingFile = () => {
        fileGeneration += 1;
        file.disabled = false;
        file.removeAttribute("aria-busy");
      };
      const setNodeStatus = (state: string, text: string) => {
        status.dataset.state = state;
        status.textContent = text;
        status.setAttribute("role", state === "error" ? "alert" : "status");
        root.dataset.state = state;
      };
      const markDraft = () => {
        setNodeStatus(
          "draft",
          t(
            attrs.items.length > 0
              ? "verovio.status.draftWithLastValid"
              : "verovio.status.draftWithoutRendering"
          )
        );
        preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "draft";
      };
      const bindDraft = (element: HTMLElement, patch: () => Partial<VerovioNodeAttrs>) =>
        element.addEventListener("input", () => {
          invalidatePendingValidation();
          update(patch(), false);
          markDraft();
        });
      title.addEventListener("input", () => update({ title: title.value }, false));
      bindDraft(data, () => ({ inputData: data.value }));
      bindDraft(label, () => ({ inputLabel: label.value }));
      bindDraft(resource, () => ({ inputResource: resource.value }));
      bindDraft(resourceLabel, () => ({ inputResourceLabel: resourceLabel.value }));
      sourceMode.addEventListener("change", () => {
        invalidatePendingValidation();
        invalidatePendingQuery();
        invalidatePendingBuilder();
        invalidatePendingFile();
        update({ sourceMode: sourceMode.value as VerovioSourceMode });
        markDraft();
      });
      format.addEventListener("change", () => {
        invalidatePendingValidation();
        update(
          {
            inputFormat: format.value === "auto" ? null : (format.value as VerovioInputFormat)
          },
          false
        );
        markDraft();
      });
      file.addEventListener("change", () => {
        void (async () => {
          const selected = file.files?.[0];
          if (!selected) return;
          const generation = ++fileGeneration;
          invalidatePendingValidation();
          file.disabled = true;
          file.setAttribute("aria-busy", "true");
          setNodeStatus("running", t("verovio.status.readingFile"));
          try {
            const inputData = await selected.text();
            if (destroyed || generation !== fileGeneration) return;
            update({ fileData: inputData, fileName: selected.name }, false);
            renderState();
            markDraft();
          } catch (caught) {
            if (destroyed || generation !== fileGeneration) return;
            setNodeStatus(
              "error",
              renderConfiguredError(
                { errors: options.errors },
                new LodeonClientError("verovio.file_read_failed", {}, { cause: caught }),
                "verovio.file_read_failed"
              )
            );
            preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
          } finally {
            if (!destroyed && generation === fileGeneration) {
              file.disabled = false;
              file.removeAttribute("aria-busy");
            }
          }
        })();
      });
      queryEditor.onChange((value) => {
        invalidatePendingQuery();
        invalidatePendingBuilder();
        update({ query: value, result: null }, false);
        markDraft();
      });

      builder.addEventListener("click", () => {
        void (async () => {
          if (!options.openBuilder || !attrs.knowledgeGraphProfileId) return;
          const generation = ++builderGeneration;
          builder.disabled = true;
          builder.setAttribute("aria-busy", "true");
          setNodeStatus("running", t("verovio.status.loadingBuilder"));
          try {
            const output = await options.openBuilder({
              id: attrs.id,
              title: attrs.title,
              source: attrs.query,
              queryJson: null,
              configId: options.defaultConfigId,
              knowledgeGraphProfileId: attrs.knowledgeGraphProfileId
            });
            if (destroyed || generation !== builderGeneration) return;
            if (!output) {
              markDraft();
              return;
            }
            const query = output.source ?? attrs.query;
            queryEditor.setValue(query);
            invalidatePendingQuery();
            update(
              {
                query,
                knowledgeGraphProfileId: output.knowledgeGraphProfileId ?? attrs.knowledgeGraphProfileId,
                result: null
              },
              false
            );
            renderState();
            markDraft();
          } catch (caught) {
            if (destroyed || generation !== builderGeneration) return;
            setNodeStatus(
              "error",
              renderConfiguredError({ errors: options.errors }, caught, "verovio.builder_failed")
            );
            preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
          } finally {
            if (!destroyed && generation === builderGeneration) {
              builder.disabled = false;
              builder.removeAttribute("aria-busy");
            }
          }
        })();
      });

      run.addEventListener("click", () => {
        void (async () => {
          if (attrs.sourceMode !== "sparql") {
            await runInput();
            return;
          }
          if (!attrs.knowledgeGraphProfileId) return;
          const generation = ++queryGeneration;
          const query = attrs.query.trim();
          let profile: KnowledgeGraphProfile;
          try {
            profile = options.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId);
          } catch (caught) {
            setNodeStatus(
              "error",
              renderConfiguredError({ errors: options.errors }, caught, "sparql.request_failed")
            );
            preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
            return;
          }
          if (!query) {
            const result = {
              status: "error" as const,
              endpointUrl: profile.sparqlUrl,
              executedAt: new Date().toISOString(),
              durationMs: 0,
              code: "verovio.query_empty",
              message: "verovio.query_empty"
            };
            update({ result }, false);
            setNodeStatus("error", renderConfiguredErrorCode(options.errors, result.code));
            preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
            return;
          }
          run.disabled = true;
          run.setAttribute("aria-busy", "true");
          setNodeStatus(
            "running",
            t("verovio.status.runningQuery", {
              label: profile.label
            })
          );
          try {
            const result = await options.executeQuery(profile.sparqlUrl, query, fetch);
            if (destroyed || generation !== queryGeneration) return;
            if (result.status === "error") {
              update({ result }, false);
              setNodeStatus(
                "error",
                renderConfiguredErrorCode(options.errors, result.code, result.variables)
              );
              preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
              return;
            }
            const items = await normalizeVerovioSparqlRows(result.rows, options.verovio, engine, {
              shouldContinue: () => !destroyed && generation === queryGeneration
            });
            if (destroyed || generation !== queryGeneration) return;
            const blocking = items.flatMap((item) =>
              item.status.state === "error" ? item.status.messages : []
            );
            if (blocking.length > 0) {
              update({ result }, false);
              renderQueryMessages(blocking, "error");
              return;
            }
            const warnings = items.flatMap((item) =>
              item.status.state === "warning" ? item.status.messages : []
            );
            itemsResultExecutedAt = result.executedAt;
            update({
              result,
              items,
              selectedItemId: items[0]?.id ?? null,
              compare: {
                ...attrs.compare,
                aItemId: null,
                bItemId: null,
                showTransposed: false
              }
            });
            renderQueryMessages(warnings, warnings.length > 0 ? "warning" : "ready");
          } catch (caught) {
            if (destroyed || generation !== queryGeneration) return;
            setNodeStatus(
              "error",
              renderConfiguredError({ errors: options.errors }, caught, "sparql.request_failed")
            );
            preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
          } finally {
            if (!destroyed && generation === queryGeneration) {
              run.disabled = false;
              run.removeAttribute("aria-busy");
            }
          }
        })();
      });

      metadataFields.addEventListener("input", () => {
        update({ visibleMetadataFields: commaValues(metadataFields.value) }, false);
      });
      metadataFields.addEventListener("change", () => renderState());
      caption.addEventListener("input", () => update({ caption: caption.value }));

      async function runInput() {
        const generation = ++validationGeneration;
        run.disabled = true;
        run.setAttribute("aria-busy", "true");
        setNodeStatus("validating", t("verovio.status.validating"));
        try {
          const source = {
            data: attrs.sourceMode === "file" ? attrs.fileData : attrs.inputData,
            format: attrs.inputFormat,
            label: attrs.inputLabel,
            resource: attrs.inputResource,
            resourceLabel: attrs.inputResourceLabel
          };
          const item =
            attrs.sourceMode === "file"
              ? await normalizeVerovioFileInput(
                  { ...source, fileName: attrs.fileName },
                  options.verovio,
                  engine
                )
              : await normalizeDirectVerovioInput(source, options.verovio, engine);
          if (destroyed || generation !== validationGeneration) return;
          if (item.status.state === "error") {
            renderValidationStatus(item.status.messages, "error");
            return;
          }
          const compare = {
            ...attrs.compare,
            aItemId: null,
            bItemId: null,
            showTransposed: false
          };
          update({ items: [item], selectedItemId: item.id, compare });
          renderValidationStatus(item.status.messages, item.status.state === "warning" ? "warning" : "ready");
        } catch (caught) {
          if (destroyed || generation !== validationGeneration) return;
          setNodeStatus(
            "error",
            renderConfiguredError({ errors: options.errors }, caught, "verovio.viewer_initialization_failed")
          );
          preview.dataset.state = attrs.items.length > 0 ? "last-valid" : "error";
        } finally {
          if (!destroyed && generation === validationGeneration) {
            run.disabled = false;
            run.removeAttribute("aria-busy");
          }
        }
      }
      header.controls.collapseButton?.addEventListener("click", () =>
        update({ collapsed: !attrs.collapsed })
      );
      header.controls.deleteButton?.addEventListener("click", () => deleteNode(editor, getPos));
      root.addEventListener("mousedown", (event) => {
        if (isNodeViewControlEvent(event)) event.stopPropagation();
      });

      function renderValidationStatus(
        messages: Array<{
          code: string;
          variables: Record<string, string | number | boolean>;
        }>,
        state: "ready" | "warning" | "error"
      ) {
        const rendered = messages.map(({ code, variables }) =>
          renderConfiguredErrorCode(options.errors, code, variables)
        );
        setNodeStatus(state, state === "ready" ? "" : [t(`verovio.status.${state}`), ...rendered].join(" "));
        preview.dataset.state = state === "error" && attrs.items.length > 0 ? "last-valid" : "current";
      }

      function renderQueryMessages(
        messages: Array<{
          code: string;
          variables: Record<string, string | number | boolean>;
        }>,
        state: "ready" | "warning" | "error"
      ) {
        const rendered = messages.map(({ code, variables }) =>
          renderConfiguredErrorCode(options.errors, code, variables)
        );
        setNodeStatus(state, state === "ready" ? "" : [t(`verovio.status.${state}`), ...rendered].join(" "));
        preview.dataset.state = state === "error" && attrs.items.length > 0 ? "last-valid" : "current";
      }

      function presentationChange(change: VerovioPresentationChange) {
        const patch: Partial<VerovioNodeAttrs> = {};
        if (change.viewMode !== undefined) patch.viewMode = change.viewMode;
        if (change.selectedItemId !== undefined) patch.selectedItemId = change.selectedItemId;
        if (change.documentLayout !== undefined) patch.documentLayout = change.documentLayout;
        if (change.initialZoom !== undefined) patch.initialZoom = change.initialZoom;
        if (change.paginatedPageHeight !== undefined) patch.paginatedPageHeight = change.paginatedPageHeight;
        if (change.playback !== undefined) patch.playback = change.playback;
        if (change.compare !== undefined) patch.compare = change.compare;
        update(patch);
      }

      function renderPresentation() {
        if (attrs.collapsed) {
          presentation?.destroy();
          presentation = null;
          preview.replaceChildren();
          return;
        }
        const presentationState = visiblePresentationState(
          attrs,
          visibleSparqlItemIndexes,
          filteredSparqlItemIndexes,
          itemsResultExecutedAt
        );
        if (presentation) {
          presentation.update(presentationState.spec, presentationState.navigationItems);
        } else {
          presentation = createVerovioPresentationView({
            id: attrs.id,
            spec: presentationState.spec,
            navigationItems: presentationState.navigationItems,
            runtime: options.verovio,
            i18n,
            engine,
            onChange: presentationChange,
            onItemNavigate: (itemId) => {
              const index = attrs.items.findIndex((item) => item.id === itemId);
              if (attrs.sourceMode === "sparql" && index >= 0) {
                requestedVisibleSparqlItemIndex = index;
              }
              update({ selectedItemId: itemId });
            },
            formatMessage: (code, variables) => renderConfiguredErrorCode(options.errors, code, variables)
          });
          preview.replaceChildren(presentation.dom);
        }
      }

      function renderState() {
        title.value = attrs.title;
        sourceMode.value = attrs.sourceMode;
        root.dataset.sourceMode = attrs.sourceMode;
        root.dataset.collapsed = attrs.collapsed ? "true" : "false";
        body.hidden = attrs.collapsed;
        const collapseButton = header.controls.collapseButton!;
        collapseButton.innerHTML = renderIcon(attrs.collapsed ? ChevronRight : ChevronDown);
        collapseButton.title = t(attrs.collapsed ? "header.expandTitle" : "header.collapseTitle");
        collapseButton.setAttribute(
          "aria-label",
          t(attrs.collapsed ? "header.expandAria" : "header.collapseAria", {
            label: t("nodes.verovio.headerLabel")
          })
        );
        header.refresh();
        builder.hidden = attrs.sourceMode !== "sparql";
        run.hidden = false;
        builder.disabled = attrs.sourceMode === "sparql" && !options.defaultKnowledgeGraphProfileId;
        run.disabled = attrs.sourceMode === "sparql" && !options.defaultKnowledgeGraphProfileId;
        resultFooter.hidden = attrs.sourceMode !== "sparql";
        resultContainer.hidden = attrs.sourceMode !== "sparql";
        format.value = attrs.inputFormat ?? "auto";
        if (!queryEditor.hasFocus()) queryEditor.setValue(attrs.query);
        updateSpecialNodeFieldKnowledgeGraphProfile(
          queryField,
          options.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId)
        );
        if (document.activeElement !== data) data.value = attrs.inputData;
        label.value = attrs.inputLabel;
        resource.value = attrs.inputResource;
        resourceLabel.value = attrs.inputResourceLabel;
        if (document.activeElement !== metadataFields)
          metadataFields.value = attrs.visibleMetadataFields.join(", ");
        caption.value = attrs.caption;
        if (attrs.sourceMode === "sparql") {
          renderSparqlResult(resultFooter, resultContainer, attrs.result, {
            pageSize: attrs.resultPageSize,
            errors: options.errors,
            onPageSizeChange: (resultPageSize) => update({ resultPageSize }),
            requestedVisibleRowIndex: requestedVisibleSparqlItemIndex,
            onRowIndexesChange: ({ filteredRowIndexes, visibleRowIndexes }) => {
              requestedVisibleSparqlItemIndex = null;
              filteredSparqlItemIndexes = filteredRowIndexes;
              visibleSparqlItemIndexes = visibleRowIndexes;
              renderPresentation();
            }
          });
        } else {
          resultFooter.textContent = "";
          resultContainer.replaceChildren();
        }
        if (!status.dataset.state) {
          setNodeStatus(
            attrs.items.length > 0 ? "ready" : "idle",
            attrs.items.length > 0 ? "" : t("verovio.status.notValidated")
          );
        }
        if (!preview.dataset.state) preview.dataset.state = attrs.items.length > 0 ? "current" : "empty";
        renderPresentation();
      }

      renderState();
      if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
        queueMicrotask(() => {
          if (!destroyed) dispatchNodeAttrs(editor, getPos, attrs);
        });
      }
      return {
        dom: root,
        update(updated) {
          if (updated.type.name !== VEROVIO_NODE_TYPE_NAME) return false;
          attrs = resolveVerovioAttrs(updated.attrs, options.verovio);
          if (suppressNextNodeUpdateRender) {
            suppressNextNodeUpdateRender = false;
            return true;
          }
          itemsResultExecutedAt = matchingItemsResultExecutedAt(attrs);
          renderState();
          return true;
        },
        destroy() {
          destroyed = true;
          validationGeneration += 1;
          fileGeneration += 1;
          queryGeneration += 1;
          builderGeneration += 1;
          presentation?.destroy();
          queryEditor.destroy();
          engine.destroy();
        },
        stopEvent: isNodeViewControlEvent,
        ignoreMutation: () => true
      };
    };
  }
});

function matchingItemsResultExecutedAt(attrs: VerovioNodeAttrs): string | null {
  return attrs.result?.status === "success" && attrs.result.rows.length === attrs.items.length
    ? attrs.result.executedAt
    : null;
}

function visiblePresentationState(
  attrs: VerovioNodeAttrs,
  visibleRowIndexes: number[] | null,
  filteredRowIndexes: number[] | null,
  itemsResultExecutedAt: string | null
): { spec: VerovioRenderSpec; navigationItems: VerovioRenderSpec["items"] } {
  const spec = buildVerovioSpec(attrs);
  if (
    attrs.sourceMode !== "sparql" ||
    attrs.result?.status !== "success" ||
    attrs.result.executedAt !== itemsResultExecutedAt ||
    visibleRowIndexes === null ||
    filteredRowIndexes === null
  ) {
    return { spec, navigationItems: spec.items };
  }

  const itemsAt = (indexes: number[]) =>
    indexes.flatMap((index) => {
      const item = spec.items[index];
      return item ? [item] : [];
    });
  const navigationItems = itemsAt(filteredRowIndexes);
  const items =
    attrs.viewMode === "list" || attrs.viewMode === "grouped" ? itemsAt(visibleRowIndexes) : navigationItems;
  const selectedItemId = items.some(({ id }) => id === spec.selectedItemId)
    ? spec.selectedItemId
    : (items[0]?.id ?? null);

  return { spec: { ...spec, items, selectedItemId }, navigationItems };
}

function specialNodeLocalization(): LodeonLocalization {
  return {
    locale: "en",
    fallbackLocale: "en",
    strict: false,
    t: (_namespace, key, values) => translateSpecialNodeText(key, values),
    exists: () => true
  };
}

function t(key: string, values?: Record<string, string | number | boolean | null | undefined>) {
  return translateSpecialNodeText(key, values);
}

function control<T extends HTMLElement>(element: T): T {
  return markNodeViewControl(element);
}

function textInput(): HTMLInputElement {
  const element = control(document.createElement("input"));
  element.type = "text";
  return element;
}

function select(options: Array<readonly [string, string]>): HTMLSelectElement {
  const element = control(document.createElement("select"));
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label.startsWith("verovio.") ? t(label) : label;
    element.append(option);
  }
  return element;
}

function field(key: string, element: HTMLElement, source?: VerovioSourceMode | "input") {
  const wrapper = document.createElement("label");
  wrapper.className = "ld-verovio-field";
  if (source) wrapper.dataset.verovioSource = source;
  const text = document.createElement("span");
  text.textContent = t(key);
  wrapper.append(text, element);
  return wrapper;
}

function nonLabelField(
  key: string,
  element: HTMLElement,
  source?: VerovioSourceMode,
  knowledgeGraphProfile?: { id: string; label: string }
) {
  return createSpecialNodeField(t(key), element, {
    className: "ld-verovio-field",
    complexControl: true,
    modeAttribute: "verovioSource",
    mode: source,
    labelIdPrefix: element.getAttribute("aria-label") ?? "verovio-field",
    knowledgeGraphProfile
  });
}

function commaValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function defaultVerovioRuntime(): VerovioRuntimeConfig {
  return {
    enabled: true,
    defaultResultPageSize: 10,
    defaultView: "single",
    defaultDocumentLayout: "responsive",
    initialZoom: 1,
    paginatedPageHeight: 1400,
    defaultVisibleMetadataFields: [],
    playback: { tempoMultiplier: 1, loop: false, volume: 0.8 },
    highlightColor: "#D55E00",
    compare: {
      synchronizedZoom: true,
      playbackMode: "a",
      loopSequence: false,
      tempoMultiplier: 1
    },
    viewerCacheSize: 3,
    validationConcurrency: 2,
    maxInputBytesPerItem: 2_097_152
  };
}
