/** Defines the stable Leaflet Special Node data contracts without owning runtime behavior. */

import type { LodeonConfig } from "../../configuration/schema";
import type { SparqlExecutionResult } from "../sparql/api-client";
import type { SparqlResultPageSize } from "../sparql/result-view";

export const LEAFLET_NODE_TYPE_NAME = "leafletNode";

export type LeafletSourceMode = "sparql" | "geojson" | "points";
export type LeafletInitialView = "fitBounds" | "configured";
export type LeafletGeometryType =
  | "Point"
  | "MultiPoint"
  | "LineString"
  | "MultiLineString"
  | "Polygon"
  | "MultiPolygon"
  | "GeometryCollection";

export type LeafletGeometry = {
  type: LeafletGeometryType;
  coordinates?: unknown;
  geometries?: LeafletGeometry[];
};

export type LeafletFeature = {
  type: "Feature";
  id?: string | number;
  geometry: LeafletGeometry | null;
  properties: Record<string, unknown>;
};

export type LeafletFeatureCollection = {
  type: "FeatureCollection";
  features: LeafletFeature[];
};

export type LeafletBounds = [[number, number], [number, number]] | null;

export type LeafletGeometrySummary = {
  featureCount: number;
  geometryCount: number;
  coordinateCount: number;
  geometryTypes: Partial<Record<LeafletGeometryType, number>>;
};

export type LeafletNormalizedData = {
  featureCollection: LeafletFeatureCollection;
  bounds: LeafletBounds;
  categories: string[];
  summary: LeafletGeometrySummary;
};

export type LeafletManualPoint = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  resource?: string;
  category?: string;
  properties: Record<string, string>;
};

export type LeafletClusterSettings = {
  enabled: boolean;
  disableAtZoom: number | null;
  showCoverageOnHover: boolean;
  spiderfyOnMaxZoom: boolean;
  spiderfyDistanceMultiplier: number;
};

export type LeafletLegendSettings = {
  enabled: boolean;
  position: "topLeft" | "topRight" | "bottomLeft" | "bottomRight";
  title: string;
};

export type LeafletMarkerStyle = {
  radius: number;
  color: string;
  fillColor: string;
  fillOpacity: number;
  weight: number;
};

export type LeafletRenderSpec = {
  renderer: "leaflet";
  featureCollection: LeafletFeatureCollection;
  tileLayerId: string;
  height: number;
  initialView: LeafletInitialView;
  center: [number, number] | null;
  zoom: number | null;
  fitBoundsMaxZoom: number;
  clustering: LeafletClusterSettings;
  legend: LeafletLegendSettings;
  popupFields: string[];
  markerStyle: LeafletMarkerStyle;
  caption: string;
};

export type LeafletNodeAttrs = {
  id: string;
  kind: "leaflet";
  title: string;
  sourceMode: LeafletSourceMode;
  knowledgeGraphProfileId?: string;
  query: string;
  result: SparqlExecutionResult | null;
  resultPageSize: SparqlResultPageSize;
  geoJsonSource: string;
  manualPoints: LeafletManualPoint[];
  featureCollection: LeafletFeatureCollection;
  tileLayerId: string;
  height: number;
  initialView: LeafletInitialView;
  center: [number, number] | null;
  zoom: number | null;
  fitBoundsMaxZoom: number;
  clustering: LeafletClusterSettings;
  legend: LeafletLegendSettings;
  popupFields: string[];
  markerStyle: LeafletMarkerStyle;
  caption: string;
  viewConfig: LeafletRenderSpec;
  collapsed: boolean;
  excludeFromRender: boolean;
};

export type LeafletRuntimeConfig = LodeonConfig["nodes"]["leaflet"];

export const EMPTY_LEAFLET_FEATURE_COLLECTION: LeafletFeatureCollection = {
  type: "FeatureCollection",
  features: []
};
