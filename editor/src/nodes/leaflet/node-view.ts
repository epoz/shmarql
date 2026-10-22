/** Owns the Leaflet Special Node TipTap NodeView lifecycle and its editor-side mutable state. */

import { Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { ChevronDown, ChevronRight, Play, Plus, Trash2, WandSparkles } from "lucide";
import type { LodeonConfig } from "../../configuration/schema";
import { LodeonClientError, renderConfiguredError } from "../../errors/client-error";
import {
  EMPTY_LEAFLET_FEATURE_COLLECTION,
  LEAFLET_NODE_TYPE_NAME,
  type LeafletManualPoint,
  type LeafletNodeAttrs,
  type LeafletRenderSpec,
  type LeafletRuntimeConfig,
  type LeafletSourceMode
} from "./contracts";
import {
  describeFeatureCollection,
  normalizeGeoJson,
  normalizeManualPoints,
  normalizeSparqlRows
} from "./normalization";
import { renderLeafletViewer, type LeafletViewer } from "./viewer";
import { executeSparqlQuery } from "../sparql/api-client";
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

export type LeafletNodeOptions = {
  leaflet: LeafletRuntimeConfig;
  defaultConfigId: string;
  defaultKnowledgeGraphProfileId?: string;
  resolveKnowledgeGraphProfile: (profileId?: string) => KnowledgeGraphProfile;
  executeQuery: typeof executeSparqlQuery;
  errors?: LodeonConfig["errors"];
  openBuilder?: (attrs: SparnaturalBuilderInput) => Promise<SparnaturalBuilderOutput | null>;
};

/** Creates canonical Leaflet node JSON through the fixed latitude, longitude, and metadata contracts. */
export function createLeafletNodeContent(
  attrs: Partial<LeafletNodeAttrs> = {},
  runtime: LeafletRuntimeConfig = defaultLeafletRuntime(),
  defaultKnowledgeGraphProfileId?: string
): JSONContent {
  const knowledgeGraphProfileId = attrs.knowledgeGraphProfileId ?? defaultKnowledgeGraphProfileId;
  let featureCollection = attrs.featureCollection ?? cloneEmptyCollection();
  try {
    if (!attrs.featureCollection && attrs.geoJsonSource)
      featureCollection = normalizeGeoJson(attrs.geoJsonSource).featureCollection;
    if (!attrs.featureCollection && attrs.manualPoints)
      featureCollection = normalizeManualPoints(attrs.manualPoints).featureCollection;
  } catch {
    /* Invalid authoring input is surfaced by the NodeView. */
  }
  const resolved: LeafletNodeAttrs = {
    id: attrs.id ?? createNodeId("leaflet"),
    kind: "leaflet",
    title: attrs.title ?? translateSpecialNodeText("registry.leaflet.label"),
    sourceMode: attrs.sourceMode ?? "points",
    ...(knowledgeGraphProfileId ? { knowledgeGraphProfileId } : {}),
    query: attrs.query ?? "",
    result: attrs.result ?? null,
    resultPageSize: attrs.resultPageSize ?? 10,
    geoJsonSource: attrs.geoJsonSource ?? "",
    manualPoints: attrs.manualPoints ?? [],
    featureCollection,
    tileLayerId: attrs.tileLayerId ?? runtime.defaultTileLayer,
    height: attrs.height ?? runtime.defaultHeight,
    initialView: attrs.initialView ?? runtime.defaultInitialView,
    center: attrs.center ?? runtime.defaultCenter,
    zoom: attrs.zoom ?? runtime.defaultZoom,
    fitBoundsMaxZoom: attrs.fitBoundsMaxZoom ?? runtime.fitBoundsMaxZoom,
    clustering: { ...runtime.clustering, ...(attrs.clustering ?? {}) },
    legend: { ...runtime.legend, title: "", ...(attrs.legend ?? {}) },
    popupFields: attrs.popupFields ?? ["label", "resource", "category"],
    markerStyle: { ...runtime.marker, ...(attrs.markerStyle ?? {}) },
    caption: attrs.caption ?? "",
    viewConfig: {} as LeafletRenderSpec,
    collapsed: attrs.collapsed ?? false,
    excludeFromRender: attrs.excludeFromRender ?? false
  };
  resolved.viewConfig = buildLeafletSpec(resolved);
  return { type: LEAFLET_NODE_TYPE_NAME, attrs: resolved };
}

/** Projects normalized node state into the complete renderer fence without changing source data. */
export function buildLeafletSpec(attrs: LeafletNodeAttrs): LeafletRenderSpec {
  return {
    renderer: "leaflet",
    featureCollection: attrs.featureCollection,
    tileLayerId: attrs.tileLayerId,
    height: attrs.height,
    initialView: attrs.initialView,
    center: attrs.center,
    zoom: attrs.zoom,
    fitBoundsMaxZoom: attrs.fitBoundsMaxZoom,
    clustering: attrs.clustering,
    legend: attrs.legend,
    popupFields: attrs.popupFields,
    markerStyle: attrs.markerStyle,
    caption: attrs.caption
  };
}

/** Owns query, file, map, clustering, and editor lifecycles and symmetrically releases interaction state. */
export const LeafletNode = Node.create<LeafletNodeOptions>({
  name: LEAFLET_NODE_TYPE_NAME,
  group: "block",
  atom: true,
  selectable: false,
  draggable: true,
  addOptions() {
    return {
      leaflet: defaultLeafletRuntime(),
      defaultConfigId: "",
      defaultKnowledgeGraphProfileId: undefined,
      resolveKnowledgeGraphProfile: () => ({
        id: "",
        label: "",
        sparqlUrl: ""
      }),
      executeQuery: executeSparqlQuery
    };
  },
  addAttributes() {
    const defaults = createLeafletNodeContent(
      {},
      this.options.leaflet,
      this.options.defaultKnowledgeGraphProfileId
    ).attrs!;
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value }]));
  },
  parseHTML() {
    return [{ tag: "section[data-lodeon-node='leaflet']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-lodeon-node": "leaflet",
        "data-node-id": HTMLAttributes.id
      })
    ];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const nodeOptions = this.options;
      let attrs = resolveLeafletAttrs(node.attrs, nodeOptions.leaflet);
      let viewer: LeafletViewer | null = null;
      let suppressNextNodeUpdateRender = false;
      let queryRequestGeneration = 0;
      let builderRequestGeneration = 0;
      let fileRequestGeneration = 0;
      let destroyed = false;
      const root = markNodeViewRoot(document.createElement("section"));
      root.className = "ld-node ld-leaflet-node";
      root.dataset.lodeonNode = "leaflet";
      const title = input("text", "nodes.leaflet.titleAria");
      title.className = "ld-node-title-input";
      const builder = button("actions.visualQueryBuilder", WandSparkles, "actions.openVisualQueryBuilder");
      const run = button("actions.run", Play, "actions.runLeafletQuery");
      run.dataset.leafletAction = "run";
      const body = document.createElement("div");
      body.className = "ld-node-body";
      const controls = document.createElement("div");
      controls.className = "ld-leaflet-controls";
      const sourceMode = select("aria.leafletSourceMode", [
        ["sparql", "options.sourceMode.sparql"],
        ["geojson", "options.sourceMode.geojson"],
        ["points", "options.sourceMode.points"]
      ]);
      sourceMode.querySelector<HTMLOptionElement>('option[value="sparql"]')!.disabled =
        !this.options.defaultKnowledgeGraphProfileId;
      const queryEditor = createSparqlSourceEditor({
        value: attrs.query,
        className: "ld-leaflet-sparql-source-editor",
        ariaLabel: t("aria.leafletSparqlQuery"),
        placeholder: t("placeholders.leafletSparqlQuery")
      });
      const geoJson = markNodeViewControl(document.createElement("textarea"));
      geoJson.rows = 8;
      geoJson.placeholder = t("placeholders.leafletGeoJson");
      const file = input("file", "fields.leafletGeoJsonFile");
      file.accept = ".json,.geojson,application/json,application/geo+json";
      const points = document.createElement("div");
      points.className = "ld-leaflet-points";
      const addPoint = button("actions.addLeafletPoint", Plus, "actions.addLeafletPoint");
      const sourceControls = document.createElement("div");
      sourceControls.className = "ld-leaflet-source-controls";
      const preview = markNodeViewControl(document.createElement("div"), {
        allowDocumentRelease: true
      });
      preview.className = "ld-leaflet-preview";
      const error = document.createElement("div");
      error.className = "ld-leaflet-error";
      error.setAttribute("role", "alert");
      error.setAttribute("aria-live", "assertive");
      const footer = document.createElement("div");
      footer.className = "ld-node-footer";
      footer.setAttribute("role", "status");
      footer.setAttribute("aria-live", "polite");
      const resultFooter = document.createElement("div");
      resultFooter.className = "ld-node-footer ld-leaflet-result-footer";
      const resultContainer = document.createElement("div");
      resultContainer.className = "ld-sparql-result ld-leaflet-result";

      const tile = select(
        "fields.leafletTileLayer",
        Object.entries(this.options.leaflet.tileLayers).map(([id, item]) => [id, item.label])
      );
      const initialView = select("fields.leafletInitialView", [
        ["fitBounds", "options.leafletInitialView.fitBounds"],
        ["configured", "options.leafletInitialView.configured"]
      ]);
      const height = numberInput("fields.height", 160, 1600, 10);
      const centerLat = numberInput("fields.leafletCenterLatitude", -90, 90, "any");
      const centerLon = numberInput("fields.leafletCenterLongitude", -180, 180, "any");
      const zoom = numberInput("fields.leafletZoom", 0, 24, 1);
      const clustering = checkbox("fields.leafletClustering"),
        legend = checkbox("fields.leafletLegend");
      const legendTitle = input("text", "fields.leafletLegendTitle");
      const legendPosition = select(
        "fields.leafletLegendPosition",
        ["topLeft", "topRight", "bottomLeft", "bottomRight"].map((value) => [
          value,
          `options.leafletLegendPosition.${value}`
        ])
      );
      const popupFields = input("text", "fields.leafletPopupFields");
      popupFields.placeholder = t("placeholders.leafletPopupFields");
      const radius = numberInput("fields.leafletMarkerRadius", 1, 40, 1),
        color = input("color", "fields.leafletMarkerColor"),
        fillColor = input("color", "fields.leafletMarkerFillColor"),
        opacity = numberInput("fields.leafletMarkerFillOpacity", 0, 1, 0.1),
        weight = numberInput("fields.leafletMarkerWeight", 0, 20, 1),
        caption = input("text", "fields.caption");
      points.setAttribute("role", "group");
      points.setAttribute("aria-label", t("fields.leafletManualPoints"));
      controls.append(
        field("fields.source", sourceMode),
        field("fields.leafletTileLayer", tile),
        field("fields.height", height),
        field("fields.leafletInitialView", initialView),
        field("fields.leafletCenterLatitude", centerLat),
        field("fields.leafletCenterLongitude", centerLon),
        field("fields.leafletZoom", zoom),
        field("fields.leafletClustering", clustering),
        field("fields.leafletLegend", legend),
        field("fields.leafletLegendTitle", legendTitle),
        field("fields.leafletLegendPosition", legendPosition),
        field("fields.leafletPopupFields", popupFields),
        field("fields.leafletMarkerRadius", radius),
        field("fields.leafletMarkerColor", color),
        field("fields.leafletMarkerFillColor", fillColor),
        field("fields.leafletMarkerFillOpacity", opacity),
        field("fields.leafletMarkerWeight", weight),
        field("fields.caption", caption)
      );
      const queryField = field(
        "fields.sparqlQuery",
        queryEditor.element,
        "sparql",
        nodeOptions.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId)
      );
      sourceControls.append(
        queryField,
        field("fields.leafletGeoJson", geoJson, "geojson"),
        field("fields.leafletGeoJsonFile", file, "geojson"),
        field("fields.leafletManualPoints", points, "points"),
        field("actions.addLeafletPoint", addPoint, "points")
      );
      body.append(controls, sourceControls, error, preview, footer, resultFooter, resultContainer);
      const header = createSpecialNodeHeader({
        editor,
        getPos,
        label: "leaflet",
        labelKey: "nodes.leaflet.headerLabel",
        eyebrow: "map",
        eyebrowKey: "nodes.leaflet.eyebrow",
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

      const update = (patch: Partial<LeafletNodeAttrs>, render = true, resetView = false) => {
        attrs = { ...attrs, ...patch };
        attrs.viewConfig = buildLeafletSpec(attrs);
        suppressNextNodeUpdateRender = true;
        dispatchNodeAttrs(editor, getPos, attrs);
        suppressNextNodeUpdateRender = false;
        if (render) renderState(resetView);
      };
      const normalize = () => {
        try {
          const normalized =
            attrs.sourceMode === "geojson"
              ? normalizeGeoJson(attrs.geoJsonSource)
              : attrs.sourceMode === "points"
                ? normalizeManualPoints(attrs.manualPoints)
                : attrs.result?.status === "success"
                  ? normalizeSparqlRows(attrs.result.rows)
                  : describeFeatureCollection(cloneEmptyCollection());
          error.textContent = "";
          update({ featureCollection: normalized.featureCollection }, true, true);
        } catch (caught) {
          error.textContent = renderConfiguredError(
            { errors: this.options.errors },
            caught,
            "leaflet.geojson_invalid"
          );
          renderPreview();
        }
      };

      title.addEventListener("input", () => update({ title: title.value }, false));
      sourceMode.addEventListener("change", () => {
        update({ sourceMode: sourceMode.value as LeafletSourceMode });
        normalize();
      });
      queryEditor.onChange((value) => {
        queryRequestGeneration += 1;
        update({ query: value, result: null }, false);
      });
      geoJson.addEventListener("input", () => {
        update({ geoJsonSource: geoJson.value }, false);
        normalize();
      });
      file.addEventListener("change", () => {
        void (async () => {
          const selected = file.files?.[0];
          if (!selected) return;
          const generation = ++fileRequestGeneration;
          try {
            const source = await selected.text();
            if (destroyed || generation !== fileRequestGeneration) return;
            update({ geoJsonSource: source }, false);
            normalize();
          } catch (caught) {
            if (destroyed || generation !== fileRequestGeneration) return;
            error.textContent = renderConfiguredError(
              { errors: this.options.errors },
              new LodeonClientError("leaflet.file_read_failed", {}, { cause: caught }),
              "leaflet.file_read_failed"
            );
          }
        })();
      });
      addPoint.addEventListener("click", () => {
        update({
          manualPoints: [
            ...attrs.manualPoints,
            {
              id: createNodeId("point"),
              latitude: 0,
              longitude: 0,
              label: "",
              properties: {}
            }
          ]
        });
        normalize();
      });
      run.addEventListener("click", () => {
        void (async () => {
          if (!attrs.knowledgeGraphProfileId) return;
          const generation = ++queryRequestGeneration;
          const profile = this.options.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId);
          if (!attrs.query.trim()) {
            update({
              result: {
                status: "error",
                endpointUrl: profile.sparqlUrl,
                executedAt: new Date().toISOString(),
                durationMs: 0,
                code: "leaflet.query_empty",
                message: "leaflet.query_empty"
              }
            });
            return;
          }
          run.disabled = true;
          run.setAttribute("aria-busy", "true");
          footer.textContent = t("status.runningQueryDots");
          error.textContent = "";
          try {
            const result = await this.options.executeQuery(profile.sparqlUrl, attrs.query.trim(), fetch);
            if (destroyed || generation !== queryRequestGeneration) return;
            if (result.status === "success") {
              const normalized = normalizeSparqlRows(result.rows);
              update(
                {
                  result,
                  featureCollection: normalized.featureCollection
                },
                true,
                true
              );
            } else {
              update({ result });
            }
          } catch (caught) {
            if (destroyed || generation !== queryRequestGeneration) return;
            error.textContent = renderConfiguredError(
              { errors: this.options.errors },
              caught,
              "sparql.request_failed"
            );
            footer.textContent = t("status.leafletQueryFailed");
          } finally {
            if (!destroyed && generation === queryRequestGeneration) {
              run.disabled = false;
              run.removeAttribute("aria-busy");
            }
          }
        })();
      });
      builder.addEventListener("click", () => {
        void (async () => {
          if (!this.options.openBuilder || !attrs.knowledgeGraphProfileId) return;
          const generation = ++builderRequestGeneration;
          const result = await this.options.openBuilder({
            id: attrs.id,
            title: attrs.title,
            source: attrs.query,
            queryJson: null,
            configId: this.options.defaultConfigId,
            knowledgeGraphProfileId: attrs.knowledgeGraphProfileId
          });
          if (!destroyed && generation === builderRequestGeneration && result?.source) {
            queryEditor.setValue(result.source);
            update({ query: result.source, result: null }, false);
          }
        })();
      });
      const bind = (control: HTMLElement, fn: () => Partial<LeafletNodeAttrs>, resetView = false) =>
        control.addEventListener("input", () => update(fn(), true, resetView));
      bind(tile, () => ({ tileLayerId: tile.value }));
      bind(height, () => ({ height: num(height.value, 520) }));
      bind(
        initialView,
        () => ({
          initialView: initialView.value as LeafletNodeAttrs["initialView"]
        }),
        true
      );
      const centerPatch = () => ({
        center: [num(centerLat.value, 0), num(centerLon.value, 0)] as [number, number]
      });
      bind(centerLat, centerPatch, true);
      bind(centerLon, centerPatch, true);
      bind(zoom, () => ({ zoom: num(zoom.value, 5) }), true);
      bind(clustering, () => ({
        clustering: { ...attrs.clustering, enabled: clustering.checked }
      }));
      bind(legend, () => ({
        legend: { ...attrs.legend, enabled: legend.checked }
      }));
      bind(legendTitle, () => ({
        legend: { ...attrs.legend, title: legendTitle.value }
      }));
      bind(legendPosition, () => ({
        legend: {
          ...attrs.legend,
          position: legendPosition.value as LeafletNodeAttrs["legend"]["position"]
        }
      }));
      const popupFieldsPatch = (): Partial<LeafletNodeAttrs> => ({
        popupFields: parsePopupFields(popupFields.value)
      });
      popupFields.addEventListener("input", () => {
        update(popupFieldsPatch(), false);
      });
      popupFields.addEventListener("change", () => {
        update(popupFieldsPatch(), true);
      });
      bind(radius, () => ({
        markerStyle: { ...attrs.markerStyle, radius: num(radius.value, 7) }
      }));
      bind(color, () => ({
        markerStyle: { ...attrs.markerStyle, color: color.value }
      }));
      bind(fillColor, () => ({
        markerStyle: { ...attrs.markerStyle, fillColor: fillColor.value }
      }));
      bind(opacity, () => ({
        markerStyle: {
          ...attrs.markerStyle,
          fillOpacity: num(opacity.value, 0.8)
        }
      }));
      bind(weight, () => ({
        markerStyle: { ...attrs.markerStyle, weight: num(weight.value, 2) }
      }));
      bind(caption, () => ({ caption: caption.value }));
      header.controls.collapseButton?.addEventListener("click", () =>
        update({ collapsed: !attrs.collapsed })
      );
      header.controls.deleteButton?.addEventListener("click", () => {
        deleteNode(editor, getPos);
      });
      root.addEventListener("mousedown", (event) => {
        if (isNodeViewControlEvent(event)) event.stopPropagation();
      });

      function renderPoints() {
        points.innerHTML = "";
        attrs.manualPoints.forEach((point, index) => {
          const row = document.createElement("div");
          row.className = "ld-leaflet-point";
          (["latitude", "longitude", "label", "resource", "category", "properties"] as const).forEach(
            (key) => {
              const control = input(
                key === "latitude" || key === "longitude" ? "number" : "text",
                `fields.leaflet${cap(key)}`
              );
              control.dataset.pointIndex = String(index);
              control.dataset.pointKey = key;
              control.value =
                key === "properties" ? JSON.stringify(point.properties) : String(point[key] ?? "");
              control.addEventListener("input", () => {
                try {
                  const next = attrs.manualPoints.map((entry, entryIndex) =>
                    entryIndex === index ? updatePoint(entry, key, control.value) : entry
                  );
                  update({ manualPoints: next }, false);
                  normalize();
                } catch (caught) {
                  error.textContent = renderConfiguredError(
                    { errors: nodeOptions.errors },
                    caught,
                    "leaflet.manual_properties_invalid"
                  );
                }
              });
              row.append(field(`fields.leaflet${cap(key)}`, control));
            }
          );
          const remove = button("actions.removeLeafletPoint", Trash2, "actions.removeLeafletPoint");
          remove.dataset.removePoint = String(index);
          remove.addEventListener("click", () => {
            update({
              manualPoints: attrs.manualPoints.filter((_, entryIndex) => entryIndex !== index)
            });
            normalize();
          });
          row.append(remove);
          points.append(row);
        });
      }
      function renderPreview(resetView = false) {
        try {
          const spec = buildLeafletSpec(attrs);
          if (viewer) {
            viewer.update(spec, resetView);
          } else {
            viewer = renderLeafletViewer(preview, spec, nodeOptions.leaflet, {
              labels: {
                ariaLabel: t("aria.leafletMap"),
                emptyState: t("status.leafletEmpty"),
                legend: t("aria.leafletLegend"),
                feature: t("aria.leafletFeature")
              }
            });
          }
          error.textContent = "";
          const summary = describeFeatureCollection(attrs.featureCollection).summary;
          footer.textContent = t("status.leafletSummary", {
            features: summary.featureCount,
            geometries: summary.geometryCount,
            coordinates: summary.coordinateCount
          });
        } catch (caught) {
          error.textContent = renderConfiguredError(
            { errors: nodeOptions.errors },
            caught,
            "leaflet.viewer_initialization_failed"
          );
        }
      }
      function renderResult() {
        renderSparqlResult(resultFooter, resultContainer, attrs.result, {
          pageSize: attrs.resultPageSize,
          errors: nodeOptions.errors,
          onPageSizeChange: (resultPageSize) => update({ resultPageSize })
        });
      }
      function renderState(resetView = false) {
        title.value = attrs.title;
        sourceMode.value = attrs.sourceMode;
        body.hidden = attrs.collapsed;
        root.dataset.collapsed = attrs.collapsed ? "true" : "false";
        root.dataset.sourceMode = attrs.sourceMode;
        header.controls.collapseButton!.innerHTML = renderIcon(attrs.collapsed ? ChevronRight : ChevronDown);
        header.refresh();
        builder.hidden = run.hidden = attrs.sourceMode !== "sparql";
        builder.disabled = run.disabled =
          attrs.sourceMode === "sparql" && !nodeOptions.defaultKnowledgeGraphProfileId;
        resultFooter.hidden = attrs.sourceMode !== "sparql";
        resultContainer.hidden = attrs.sourceMode !== "sparql";
        if (attrs.sourceMode === "points") renderPoints();
        if (!queryEditor.hasFocus()) queryEditor.setValue(attrs.query);
        updateSpecialNodeFieldKnowledgeGraphProfile(
          queryField,
          nodeOptions.resolveKnowledgeGraphProfile(attrs.knowledgeGraphProfileId)
        );
        if (document.activeElement !== geoJson) geoJson.value = attrs.geoJsonSource;
        tile.value = attrs.tileLayerId;
        height.value = String(attrs.height);
        initialView.value = attrs.initialView;
        centerLat.value = String(attrs.center?.[0] ?? "");
        centerLon.value = String(attrs.center?.[1] ?? "");
        zoom.value = String(attrs.zoom ?? "");
        clustering.checked = attrs.clustering.enabled;
        legend.checked = attrs.legend.enabled;
        legendTitle.value = attrs.legend.title;
        legendPosition.value = attrs.legend.position;
        popupFields.value = attrs.popupFields.join(", ");
        radius.value = String(attrs.markerStyle.radius);
        color.value = attrs.markerStyle.color;
        fillColor.value = attrs.markerStyle.fillColor;
        opacity.value = String(attrs.markerStyle.fillOpacity);
        weight.value = String(attrs.markerStyle.weight);
        caption.value = attrs.caption;
        if (attrs.sourceMode === "sparql") renderResult();
        else {
          resultFooter.textContent = "";
          resultContainer.innerHTML = "";
        }
        if (attrs.collapsed) {
          viewer?.destroy();
          viewer = null;
          preview.innerHTML = "";
        } else {
          renderPreview(resetView);
        }
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
          if (updated.type.name !== LEAFLET_NODE_TYPE_NAME) return false;
          attrs = resolveLeafletAttrs(updated.attrs, nodeOptions.leaflet);
          if (suppressNextNodeUpdateRender) {
            suppressNextNodeUpdateRender = false;
            return true;
          }
          renderState();
          return true;
        },
        destroy() {
          destroyed = true;
          queryRequestGeneration += 1;
          builderRequestGeneration += 1;
          fileRequestGeneration += 1;
          viewer?.destroy();
          queryEditor.destroy();
        },
        stopEvent: isNodeViewControlEvent,
        ignoreMutation: () => true
      };
    };
  }
});

/** Reads untrusted ProseMirror attributes through the Leaflet-owned normalization boundary. */
export function resolveLeafletAttrs(
  attrs: Partial<LeafletNodeAttrs>,
  runtime: LeafletRuntimeConfig
): LeafletNodeAttrs {
  return createLeafletNodeContent(attrs, runtime, attrs.knowledgeGraphProfileId).attrs as LeafletNodeAttrs;
}

function t(key: string, values?: Record<string, string | number | boolean | null | undefined>) {
  return translateSpecialNodeText(key, values);
}
function cap(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function parsePopupFields(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function input(type: string, key: string) {
  const element = markNodeViewControl(document.createElement("input"));
  element.type = type;
  element.setAttribute("aria-label", t(key));
  return element;
}
function numberInput(key: string, min: number, max: number, step: number | "any") {
  const element = input("number", key);
  element.min = String(min);
  element.max = String(max);
  element.step = String(step);
  return element;
}
function checkbox(key: string) {
  return input("checkbox", key);
}
function select(key: string, options: Array<[string, string]>) {
  const element = markNodeViewControl(document.createElement("select"));
  element.setAttribute("aria-label", t(key));
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label.includes(".") ? t(label) : label;
    element.append(option);
  });
  return element;
}
function field(
  key: string,
  control: HTMLElement,
  mode?: LeafletSourceMode,
  knowledgeGraphProfile?: { id: string; label: string }
) {
  const complex =
    control instanceof HTMLTextAreaElement ||
    control.classList.contains("ld-sparql-source-editor") ||
    control.classList.contains("ld-leaflet-points");
  return createSpecialNodeField(t(key), control, {
    className: "ld-leaflet-field",
    complexControl: complex,
    modeAttribute: "leafletFieldMode",
    mode,
    labelIdPrefix: control.getAttribute("aria-label") ?? "leaflet-field",
    knowledgeGraphProfile
  });
}
function button(labelKey: string, icon: Parameters<typeof renderIcon>[0], ariaKey: string) {
  const element = markNodeViewControl(document.createElement("button"));
  element.type = "button";
  element.className = "ld-node-run-button";
  element.innerHTML = `${renderIcon(icon)}<span>${t(labelKey)}</span>`;
  element.setAttribute("aria-label", t(ariaKey));
  return element;
}
function num(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function updatePoint(point: LeafletManualPoint, key: string, value: string): LeafletManualPoint {
  if (key === "properties") {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new LodeonClientError("leaflet.manual_properties_invalid");
      }
      return {
        ...point,
        properties: Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]))
      };
    } catch (caught) {
      if (caught instanceof LodeonClientError) throw caught;
      throw new LodeonClientError(
        "leaflet.manual_properties_invalid",
        {},
        {
          cause: caught
        }
      );
    }
  }
  if (key === "latitude" || key === "longitude") return { ...point, [key]: Number(value) };
  return { ...point, [key]: value };
}
function cloneEmptyCollection() {
  return { type: EMPTY_LEAFLET_FEATURE_COLLECTION.type, features: [] };
}
function defaultLeafletRuntime(): LeafletRuntimeConfig {
  return {
    enabled: true,
    defaultResultPageSize: 10,
    defaultTileLayer: "openStreetMap",
    tileLayers: {
      openStreetMap: {
        label: "OpenStreetMap",
        urlTemplate: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: "© OpenStreetMap contributors",
        minZoom: 0,
        maxZoom: 19
      }
    },
    defaultHeight: 520,
    defaultInitialView: "fitBounds",
    defaultCenter: [50, 10],
    defaultZoom: 5,
    fitBoundsMaxZoom: 14,
    defaultPopupFields: [],
    marker: {
      radius: 7,
      color: "#005A8D",
      fillColor: "#0072B2",
      fillOpacity: 0.8,
      weight: 2
    },
    clustering: {
      enabled: true,
      disableAtZoom: null,
      showCoverageOnHover: true,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.5
    },
    legend: { enabled: true, position: "bottomRight" }
  };
}
