/** Owns the interactive Leaflet Special Node viewer lifecycle and resource cleanup. */

import L, { type Layer } from "leaflet";
import "leaflet.markercluster";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { LodeonClientError } from "../../errors/client-error";
import type { LeafletFeature, LeafletRenderSpec, LeafletRuntimeConfig } from "./contracts";
import { describeFeatureCollection } from "./normalization";

export type LeafletViewerLabels = {
  ariaLabel: string;
  emptyState: string;
  legend: string;
  feature: string;
};

export type LeafletViewerOptions = {
  labels: LeafletViewerLabels;
};

export type LeafletViewer = {
  update: (spec: LeafletRenderSpec, resetView?: boolean) => void;
  invalidateSize: () => void;
  destroy: () => void;
};

const CATEGORY_COLORS = [
  "#0072B2",
  "#D55E00",
  "#009E73",
  "#CC79A7",
  "#E69F00",
  "#56B4E9",
  "#6A3D9A",
  "#666666"
];

/**
 * Creates one Leaflet viewer from canonical features and returns the sole
 * lifecycle owner for map, cluster, spiderfy, and popup resources.
 */
export function renderLeafletViewer(
  host: HTMLElement,
  initialSpec: LeafletRenderSpec,
  runtime: LeafletRuntimeConfig,
  options: LeafletViewerOptions
): LeafletViewer {
  host.innerHTML = "";
  const shell = document.createElement("div");
  const mapHost = document.createElement("div");
  const emptyState = document.createElement("p");
  let destroyed = false;
  let currentSpec = initialSpec;
  let tileLayer: L.TileLayer | null = null;
  let featureLayer: L.LayerGroup | null = null;
  let clusterLayer: L.MarkerClusterGroup | null = null;
  let legendControl: L.Control | null = null;
  let renderedSpecKey = "";
  let activeTileLayerId = "";

  shell.className = "ld-leaflet-viewer-shell";
  mapHost.className = "ld-leaflet-viewer-map";
  mapHost.setAttribute("role", "region");
  mapHost.setAttribute("aria-label", options.labels.ariaLabel);
  emptyState.className = "ld-leaflet-viewer-empty";
  emptyState.textContent = options.labels.emptyState;
  emptyState.hidden = true;
  shell.append(mapHost, emptyState);
  host.append(shell);

  let map: L.Map;

  try {
    map = L.map(mapHost, {
      zoomControl: true,
      attributionControl: true
    });
  } catch (error) {
    host.innerHTML = "";
    throw viewerInitializationError(error);
  }

  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(() => map.invalidateSize({ pan: false }))
      : null;
  resizeObserver?.observe(host);

  try {
    update(initialSpec, true);
  } catch (error) {
    resizeObserver?.disconnect();
    map.remove();
    host.innerHTML = "";
    throw error;
  }

  return {
    update,
    invalidateSize: () => {
      if (!destroyed) {
        map.invalidateSize({ pan: false });
      }
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      resizeObserver?.disconnect();
      removeRenderedLayers();
      if (tileLayer) {
        map.removeLayer(tileLayer);
        tileLayer = null;
      }
      map.remove();
      host.innerHTML = "";
    }
  };

  function update(nextSpec: LeafletRenderSpec, resetView = false): void {
    if (destroyed) {
      return;
    }
    currentSpec = nextSpec;
    shell.style.height = `${Math.max(nextSpec.height, 160)}px`;
    shell.dataset.clustering = nextSpec.clustering.enabled ? "true" : "false";
    mapHost.style.height = "100%";
    syncTileLayer();
    const nextRenderedSpecKey = JSON.stringify({
      featureCollection: nextSpec.featureCollection,
      clustering: nextSpec.clustering,
      legend: nextSpec.legend,
      popupFields: nextSpec.popupFields,
      markerStyle: nextSpec.markerStyle
    });
    if (nextRenderedSpecKey !== renderedSpecKey) {
      const replacement = buildRenderedLayers();
      removeRenderedLayers();
      featureLayer = replacement.featureLayer.addTo(map);
      clusterLayer = replacement.clusterLayer?.addTo(map) ?? null;
      replacement.legendControl?.addTo(map);
      legendControl = replacement.legendControl;
      renderedSpecKey = nextRenderedSpecKey;
    }
    if (resetView) syncInitialView();
    emptyState.hidden = nextSpec.featureCollection.features.length > 0;
    map.invalidateSize({ pan: false });
  }

  function syncTileLayer(): void {
    const tileConfig = runtime.tileLayers[currentSpec.tileLayerId];

    if (!tileConfig) {
      throw new LodeonClientError("leaflet.tile_layer_unavailable", {
        tileLayerId: currentSpec.tileLayerId
      });
    }
    const zoomValues = [currentSpec.zoom, currentSpec.fitBoundsMaxZoom, currentSpec.clustering.disableAtZoom];
    if (
      zoomValues.some((value) => value !== null && (value < tileConfig.minZoom || value > tileConfig.maxZoom))
    ) {
      throw new LodeonClientError("leaflet.geojson_invalid");
    }
    if (tileLayer && activeTileLayerId === currentSpec.tileLayerId) return;
    const replacement = L.tileLayer(tileConfig.urlTemplate, {
      attribution: tileConfig.attribution,
      minZoom: tileConfig.minZoom,
      maxZoom: tileConfig.maxZoom
    });
    replacement.addTo(map);
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = replacement;
    activeTileLayerId = currentSpec.tileLayerId;
  }

  function buildRenderedLayers(): {
    featureLayer: L.LayerGroup;
    clusterLayer: L.MarkerClusterGroup | null;
    legendControl: L.Control | null;
  } {
    const nextFeatureLayer = L.layerGroup();
    let nextClusterLayer: L.MarkerClusterGroup | null = null;
    if (currentSpec.clustering.enabled) {
      const distance = currentSpec.clustering.spiderfyDistanceMultiplier;
      nextClusterLayer = L.markerClusterGroup({
        ...(currentSpec.clustering.disableAtZoom === null
          ? {}
          : { disableClusteringAtZoom: currentSpec.clustering.disableAtZoom }),
        showCoverageOnHover: currentSpec.clustering.showCoverageOnHover,
        spiderfyOnMaxZoom: currentSpec.clustering.spiderfyOnMaxZoom,
        ...(Number.isFinite(distance) ? { spiderfyDistanceMultiplier: distance } : {})
      });
    }

    const geoJsonLayer = L.geoJSON(currentSpec.featureCollection, {
      style: (feature) => featureStyle(resolveCanonicalFeature(feature)),
      pointToLayer: (feature, latLng) => createPointMarker(resolveCanonicalFeature(feature), latLng),
      onEachFeature: (feature, layer) => {
        const popup = createPopup(resolveCanonicalFeature(feature), currentSpec.popupFields);
        if (popup) {
          layer.bindPopup(popup, {
            autoPan: true,
            keepInView: true,
            maxWidth: 420,
            maxHeight: 320,
            className: "ld-leaflet-popup-shell"
          });
        }
      }
    });

    const addLayer = (layer: Layer): void => {
      if (nextClusterLayer && isClusterableMarker(layer)) {
        nextClusterLayer.addLayer(layer);
      } else if (isLayerGroup(layer)) {
        layer.eachLayer(addLayer);
      } else {
        nextFeatureLayer.addLayer(layer);
      }
    };
    geoJsonLayer.eachLayer(addLayer);
    return {
      featureLayer: nextFeatureLayer,
      clusterLayer: nextClusterLayer,
      legendControl: buildLegendControl()
    };
  }

  function resolveCanonicalFeature(feature: GeoJSON.Feature | undefined): LeafletFeature {
    const resolved = currentSpec.featureCollection.features.find((candidate) =>
      Object.is(candidate, feature)
    );
    if (!resolved) {
      throw new LodeonClientError("leaflet.geojson_invalid");
    }
    return resolved;
  }

  function removeRenderedLayers(): void {
    map.closePopup();
    if (clusterLayer) {
      clusterLayer.clearLayers();
      map.removeLayer(clusterLayer);
      clusterLayer = null;
    }
    if (featureLayer) {
      featureLayer.clearLayers();
      map.removeLayer(featureLayer);
      featureLayer = null;
    }
    if (legendControl) {
      map.removeControl(legendControl);
      legendControl = null;
    }
  }

  function createPointMarker(feature: LeafletFeature, latLng: L.LatLng): L.Marker {
    const category = featureCategory(feature);
    const color = categoryColor(category, currentSpec.markerStyle.fillColor);
    const diameter = Math.max(currentSpec.markerStyle.radius * 2, 8);
    const icon = L.divIcon({
      className: "ld-leaflet-marker-icon",
      html: createMarkerHtml(diameter, color, currentSpec.markerStyle),
      iconSize: [diameter, diameter],
      iconAnchor: [diameter / 2, diameter / 2]
    });

    const accessibleLabel = featureAccessibleLabel(feature, options.labels.feature);
    return L.marker(latLng, {
      icon,
      keyboard: true,
      alt: accessibleLabel,
      title: accessibleLabel
    });
  }

  function featureStyle(feature: LeafletFeature): L.PathOptions {
    const color = categoryColor(featureCategory(feature), currentSpec.markerStyle.fillColor);
    return {
      color: currentSpec.markerStyle.color,
      fillColor: color,
      fillOpacity: currentSpec.markerStyle.fillOpacity,
      weight: currentSpec.markerStyle.weight
    };
  }

  function buildLegendControl(): L.Control | null {
    const categories = describeFeatureCollection(currentSpec.featureCollection).categories;

    if (!currentSpec.legend.enabled || categories.length === 0) {
      return null;
    }

    const control = new L.Control({
      position: leafletControlPosition(currentSpec.legend.position)
    });
    control.onAdd = () => {
      const legend = L.DomUtil.create("div", "ld-leaflet-viewer-legend");
      L.DomEvent.disableClickPropagation(legend);
      legend.setAttribute("role", "group");
      legend.setAttribute("aria-label", options.labels.legend);
      const legendTitle = currentSpec.legend.title.trim() || options.labels.legend;
      if (legendTitle) {
        const title = document.createElement("strong");
        title.textContent = legendTitle;
        legend.append(title);
      }
      const list = document.createElement("ul");
      for (const category of categories) {
        const item = document.createElement("li");
        const swatch = document.createElement("span");
        const label = document.createElement("span");
        swatch.className = "ld-leaflet-viewer-legend-swatch";
        swatch.style.backgroundColor = categoryColor(category, currentSpec.markerStyle.fillColor);
        label.textContent = category;
        item.append(swatch, label);
        list.append(item);
      }
      legend.append(list);
      return legend;
    };
    return control;
  }

  function syncInitialView(): void {
    const normalized = describeFeatureCollection(currentSpec.featureCollection);

    if (currentSpec.initialView === "fitBounds" && normalized.bounds) {
      map.fitBounds(normalized.bounds, {
        padding: [16, 16],
        maxZoom: currentSpec.fitBoundsMaxZoom
      });
      return;
    }
    const center = currentSpec.center ?? runtime.defaultCenter;
    const zoom = currentSpec.zoom ?? runtime.defaultZoom;
    map.setView(center, zoom);
  }
}

function isClusterableMarker(layer: Layer): boolean {
  return (
    typeof (layer as L.Marker).getLatLng === "function" && typeof (layer as L.Marker).setLatLng === "function"
  );
}

function isLayerGroup(layer: Layer): layer is L.LayerGroup {
  return typeof (layer as L.LayerGroup).eachLayer === "function" && !isClusterableMarker(layer);
}

function featureAccessibleLabel(feature: LeafletFeature, fallback: string): string {
  for (const key of ["label", "category", "resource"]) {
    const value = feature.properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function createPopup(feature: LeafletFeature, configuredFields: string[]): HTMLElement | null {
  const properties = feature.properties;
  const fields = configuredFields.length ? configuredFields : Object.keys(properties);
  const availableFields = fields.filter(
    (field) => properties[field] !== null && properties[field] !== undefined
  );

  if (availableFields.length === 0) {
    return null;
  }

  const popup = document.createElement("dl");
  popup.className = "ld-leaflet-viewer-popup";

  for (const field of availableFields) {
    const row = document.createElement("div");
    row.className = "ld-leaflet-viewer-popup-row";
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    const value = formatPropertyValue(properties[field]);
    term.textContent = field;

    if (field === "resource" && isSafeResourceUrl(value)) {
      const link = document.createElement("a");
      link.href = value;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = value;
      description.append(link);
    } else {
      description.textContent = value;
    }
    row.append(term, description);
    popup.append(row);
  }

  return popup;
}

function createMarkerHtml(
  diameter: number,
  fillColor: string,
  style: LeafletRenderSpec["markerStyle"]
): string {
  const safeDiameter = Math.max(8, Math.round(diameter));
  return `<span class="ld-leaflet-marker-shape" style="width:${safeDiameter}px;height:${safeDiameter}px;background-color:${escapeCssColor(fillColor)};border:${Math.max(0, style.weight)}px solid ${escapeCssColor(style.color)};opacity:${Math.min(1, Math.max(0, style.fillOpacity))}"></span>`;
}

function categoryColor(category: string, fallback: string): string {
  if (!category) {
    return fallback;
  }
  let hash = 0;
  for (const character of category) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length] ?? fallback;
}

function featureCategory(feature: LeafletFeature): string {
  const category = feature.properties.category;
  return typeof category === "string" ? category.trim() : "";
}

function formatPropertyValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function isSafeResourceUrl(value: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function leafletControlPosition(position: LeafletRenderSpec["legend"]["position"]): L.ControlPosition {
  const positions: Record<LeafletRenderSpec["legend"]["position"], L.ControlPosition> = {
    topLeft: "topleft",
    topRight: "topright",
    bottomLeft: "bottomleft",
    bottomRight: "bottomright"
  };
  return positions[position];
}

function escapeCssColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]+$/i.test(value) ? value : "transparent";
}

function viewerInitializationError(error: unknown): LodeonClientError {
  return new LodeonClientError(
    "leaflet.viewer_initialization_failed",
    { externalError: error instanceof Error ? error.message : String(error) },
    { cause: error }
  );
}
