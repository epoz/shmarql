/** Canonicalizes Leaflet Special Node values without storage, network, or DOM side effects. */

import { LodeonClientError } from "../../errors/client-error";
import type { NormalizedSparqlRow, SparqlBindingValue } from "../sparql/api-client";
import type {
  LeafletBounds,
  LeafletFeature,
  LeafletFeatureCollection,
  LeafletGeometry,
  LeafletGeometryType,
  LeafletManualPoint,
  LeafletNormalizedData
} from "./contracts";

const SUPPORTED_GEOMETRY_TYPES = new Set<LeafletGeometryType>([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
  "GeometryCollection"
]);

type JsonObject = Record<string, unknown>;
type Position = [number, number, ...number[]];

export function normalizeGeoJson(input: string | unknown): LeafletNormalizedData {
  let parsed = input;

  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      throw geoJsonInvalid(error);
    }
  }

  try {
    return describeFeatureCollection(normalizeGeoJsonValue(parsed));
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }
    throw geoJsonInvalid(error);
  }
}

export function normalizeSparqlRows(rows: NormalizedSparqlRow[]): LeafletNormalizedData {
  const features = rows.map((row, index) => normalizeSparqlRow(row, index));

  return describeFeatureCollection(makeFeatureCollection(assignFeatureIds(features)));
}

export function normalizeManualPoints(points: LeafletManualPoint[]): LeafletNormalizedData {
  const features = points.map((point, index): LeafletFeature => {
    const [longitude, latitude] = validateLatitudeLongitude(point.latitude, point.longitude, index);
    const properties: Record<string, unknown> = {
      ...point.properties,
      label: point.label
    };

    if (point.resource) {
      properties.resource = point.resource;
    }
    if (point.category) {
      properties.category = point.category;
    }

    return {
      type: "Feature",
      id: point.id.trim() || undefined,
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties
    };
  });

  return describeFeatureCollection(makeFeatureCollection(assignFeatureIds(features)));
}

export function validateLatitudeLongitude(
  latitudeValue: unknown,
  longitudeValue: unknown,
  index: number
): [number, number] {
  const latitude = parseFiniteNumber(latitudeValue);
  const longitude = parseFiniteNumber(longitudeValue);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new LodeonClientError("leaflet.coordinate_invalid", {
      index: index + 1,
      latitude: printableValue(latitudeValue),
      longitude: printableValue(longitudeValue)
    });
  }

  return [longitude, latitude];
}

export function describeFeatureCollection(
  featureCollection: LeafletFeatureCollection
): LeafletNormalizedData {
  const positions: Position[] = [];
  const geometryTypes: Partial<Record<LeafletGeometryType, number>> = {};
  let geometryCount = 0;

  for (const feature of featureCollection.features) {
    if (feature.geometry) {
      collectGeometryDetails(feature.geometry, positions, geometryTypes);
      geometryCount += countGeometries(feature.geometry);
    }
  }

  const categories = Array.from(
    new Set(
      featureCollection.features
        .map((feature) => feature.properties.category)
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));

  return {
    featureCollection,
    bounds: calculateBounds(positions),
    categories,
    summary: {
      featureCount: featureCollection.features.length,
      geometryCount,
      coordinateCount: positions.length,
      geometryTypes
    }
  };
}

function normalizeGeoJsonValue(value: unknown): LeafletFeatureCollection {
  const object = requireObject(value);

  if (object.type === "FeatureCollection") {
    if (!Array.isArray(object.features)) {
      throw geoJsonInvalid("features");
    }
    return makeFeatureCollection(
      assignFeatureIds(object.features.map((feature, index) => normalizeFeature(feature, index)))
    );
  }

  if (object.type === "Feature") {
    return makeFeatureCollection(assignFeatureIds([normalizeFeature(object, 0)]));
  }

  return makeFeatureCollection(
    assignFeatureIds([
      {
        type: "Feature",
        geometry: normalizeGeometry(object, 0),
        properties: {}
      }
    ])
  );
}

function normalizeFeature(value: unknown, index: number): LeafletFeature {
  const object = requireObject(value);

  if (object.type !== "Feature") {
    throw geoJsonInvalid(`feature:${index + 1}`);
  }

  const id = typeof object.id === "string" || typeof object.id === "number" ? object.id : undefined;
  const properties =
    object.properties === null || object.properties === undefined ? {} : cloneJsonObject(object.properties);

  return {
    type: "Feature",
    id,
    geometry: object.geometry === null ? null : normalizeGeometry(object.geometry, index),
    properties
  };
}

function normalizeGeometry(value: unknown, index: number): LeafletGeometry {
  const object = requireObject(value);
  const type = object.type;

  if (typeof type !== "string" || !SUPPORTED_GEOMETRY_TYPES.has(type as LeafletGeometryType)) {
    throw new LodeonClientError("leaflet.geometry_unsupported", {
      geometryType: typeof type === "string" ? type : printableValue(type)
    });
  }

  if (type === "GeometryCollection") {
    if (!Array.isArray(object.geometries)) {
      throw geoJsonInvalid(`geometry:${index + 1}`);
    }
    return {
      type,
      geometries: object.geometries.map((geometry) => normalizeGeometry(geometry, index))
    };
  }

  return {
    type: type as Exclude<LeafletGeometryType, "GeometryCollection">,
    coordinates: normalizeCoordinates(type as LeafletGeometryType, object.coordinates, index)
  };
}

function normalizeCoordinates(type: LeafletGeometryType, coordinates: unknown, index: number): unknown {
  switch (type) {
    case "Point":
      return normalizePosition(coordinates, index);
    case "MultiPoint":
      return normalizePositionArray(coordinates, index, 1);
    case "LineString":
      return normalizePositionArray(coordinates, index, 2);
    case "MultiLineString":
      return requireNonemptyArray(coordinates).map((line) => normalizePositionArray(line, index, 2));
    case "Polygon":
      return normalizePolygon(coordinates, index);
    case "MultiPolygon":
      return requireNonemptyArray(coordinates).map((polygon) => normalizePolygon(polygon, index));
    case "GeometryCollection":
      throw geoJsonInvalid(`geometry:${index + 1}`);
  }
}

function normalizePolygon(value: unknown, index: number): Position[][] {
  const rings = requireArray(value).map((ring) => normalizePositionArray(ring, index, 4));

  if (rings.length === 0 || rings.some((ring) => !samePosition(ring[0], ring.at(-1)))) {
    throw geoJsonInvalid(`polygon:${index + 1}`);
  }

  return rings;
}

function normalizePositionArray(value: unknown, index: number, minimumLength: number): Position[] {
  const values = requireArray(value);

  if (values.length < minimumLength) {
    throw geoJsonInvalid(`coordinates:${index + 1}`);
  }

  return values.map((position) => normalizePosition(position, index));
}

function normalizePosition(value: unknown, index: number): Position {
  const values = requireArray(value);
  const longitude = parseFiniteNumber(values[0]);
  const latitude = parseFiniteNumber(values[1]);
  const remaining = values.slice(2).map(parseFiniteNumber);

  if (
    values.length < 2 ||
    longitude === null ||
    latitude === null ||
    remaining.some((coordinate) => coordinate === null) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new LodeonClientError("leaflet.coordinate_invalid", {
      index: index + 1,
      latitude: printableValue(values[1]),
      longitude: printableValue(values[0])
    });
  }

  return [longitude, latitude, ...(remaining as number[])];
}

function normalizeSparqlRow(row: NormalizedSparqlRow, index: number): LeafletFeature {
  const geometryValue = bindingText(row.geometry);
  let geometry: LeafletGeometry;

  if (geometryValue) {
    const parsed = parseGeometryLiteral(geometryValue);
    const object = requireObject(parsed);
    if (object.type === "Feature") {
      const normalizedFeature = normalizeFeature(object, index);
      geometry = normalizedFeature.geometry ?? missingSparqlVariables(index);
      Object.entries(normalizedFeature.properties).forEach(([key, value]) => {
        if (!(key in row)) row[key] = { type: "literal", value: String(value) };
      });
    } else {
      geometry = normalizeGeometry(object, index);
    }
  } else {
    const latitude = bindingText(row.latitude);
    const longitude = bindingText(row.longitude);

    if (!latitude || !longitude) {
      return missingSparqlVariables(index);
    }
    const position = validateLatitudeLongitude(latitude, longitude, index);
    geometry = { type: "Point", coordinates: position };
  }

  const properties = Object.fromEntries(
    Object.entries(row).flatMap(([variable, binding]) => {
      if (["geometry", "latitude", "longitude"].includes(variable)) {
        return [];
      }
      const value = bindingText(binding);
      return value ? [[variable, value]] : [];
    })
  );

  return {
    type: "Feature",
    id: bindingText(row.resource) || undefined,
    geometry,
    properties
  };
}

function parseGeometryLiteral(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return parseWktGeometry(value);
  }
}

function parseWktGeometry(value: string): LeafletGeometry {
  try {
    const source = value.trim().replace(/^SRID=\d+\s*;\s*/i, "");
    const parser = new WktParser(source);
    const geometry = parser.parseGeometry();
    parser.requireEnd();
    return geometry;
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }
    throw geoJsonInvalid(error);
  }
}

class WktParser {
  private readonly tokens: string[];
  private index = 0;

  constructor(source: string) {
    this.tokens = source.match(/[A-Za-z]+|[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][-+]?\d+)?|[(),]/g) ?? [];
    const reconstructed = this.tokens.join("").toLowerCase();
    const compactSource = source.replace(/\s+/g, "").toLowerCase();

    if (!this.tokens.length || reconstructed !== compactSource) {
      throw new Error("wkt.token_invalid");
    }
  }

  parseGeometry(): LeafletGeometry {
    const type = this.take().toUpperCase();

    if (this.peek()?.toUpperCase() === "Z" || this.peek()?.toUpperCase() === "M") {
      this.take();
    } else if (this.peek()?.toUpperCase() === "ZM") {
      this.take();
    }

    switch (type) {
      case "POINT":
        return { type: "Point", coordinates: this.parseWrappedPosition() };
      case "MULTIPOINT":
        return { type: "MultiPoint", coordinates: this.parseMultiPoint() };
      case "LINESTRING":
        return { type: "LineString", coordinates: this.parsePositionList() };
      case "MULTILINESTRING":
        return {
          type: "MultiLineString",
          coordinates: this.parseNestedPositionLists()
        };
      case "POLYGON":
        return { type: "Polygon", coordinates: this.parseNestedPositionLists() };
      case "MULTIPOLYGON":
        return { type: "MultiPolygon", coordinates: this.parseMultiPolygon() };
      case "GEOMETRYCOLLECTION":
        return {
          type: "GeometryCollection",
          geometries: this.parseGeometryCollection()
        };
      default:
        throw new LodeonClientError("leaflet.geometry_unsupported", {
          geometryType: type
        });
    }
  }

  requireEnd(): void {
    if (this.index !== this.tokens.length) {
      throw new Error("wkt.trailing_token");
    }
  }

  private parseWrappedPosition(): Position {
    this.expect("(");
    const position = this.parsePosition();
    this.expect(")");
    return position;
  }

  private parseMultiPoint(): Position[] {
    this.expect("(");
    const positions: Position[] = [];
    do {
      if (this.peek() === "(") {
        positions.push(this.parseWrappedPosition());
      } else {
        positions.push(this.parsePosition());
      }
    } while (this.takeComma());
    this.expect(")");
    return positions;
  }

  private parsePositionList(): Position[] {
    this.expect("(");
    const positions = this.parsePositionsUntilClose();
    this.expect(")");
    return positions;
  }

  private parseNestedPositionLists(): Position[][] {
    this.expect("(");
    const values: Position[][] = [];
    do {
      values.push(this.parsePositionList());
    } while (this.takeComma());
    this.expect(")");
    return values;
  }

  private parseMultiPolygon(): Position[][][] {
    this.expect("(");
    const polygons: Position[][][] = [];
    do {
      polygons.push(this.parseNestedPositionLists());
    } while (this.takeComma());
    this.expect(")");
    return polygons;
  }

  private parseGeometryCollection(): LeafletGeometry[] {
    this.expect("(");
    const geometries: LeafletGeometry[] = [];
    do {
      geometries.push(this.parseGeometry());
    } while (this.takeComma());
    this.expect(")");
    return geometries;
  }

  private parsePositionsUntilClose(): Position[] {
    const positions: Position[] = [];
    do {
      positions.push(this.parsePosition());
    } while (this.takeComma());
    return positions;
  }

  private parsePosition(): Position {
    const coordinates: number[] = [];

    while (this.peek() !== undefined && this.peek() !== "," && this.peek() !== ")") {
      const coordinate = Number(this.take());
      if (!Number.isFinite(coordinate)) {
        throw new Error("wkt.coordinate_invalid");
      }
      coordinates.push(coordinate);
    }
    if (coordinates.length < 2) {
      throw new Error("wkt.position_invalid");
    }
    return coordinates as Position;
  }

  private takeComma(): boolean {
    if (this.peek() !== ",") {
      return false;
    }
    this.index += 1;
    return true;
  }

  private expect(token: string): void {
    if (this.take() !== token) {
      throw new Error("wkt.structure_invalid");
    }
  }

  private take(): string {
    const token = this.tokens[this.index];
    if (token === undefined) {
      throw new Error("wkt.unexpected_end");
    }
    this.index += 1;
    return token;
  }

  private peek(): string | undefined {
    return this.tokens[this.index];
  }
}

function assignFeatureIds(features: LeafletFeature[]): LeafletFeature[] {
  const usedIds = new Set<string>();

  return features.map((feature, index) => {
    const baseId = String(feature.id ?? `leaflet-feature-${index + 1}`);
    let id = baseId;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return { ...feature, id };
  });
}

function collectGeometryDetails(
  geometry: LeafletGeometry,
  positions: Position[],
  geometryTypes: Partial<Record<LeafletGeometryType, number>>
): void {
  geometryTypes[geometry.type] = (geometryTypes[geometry.type] ?? 0) + 1;

  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) {
      collectGeometryDetails(child, positions, geometryTypes);
    }
    return;
  }

  collectPositions(geometry.coordinates, positions);
}

function collectPositions(value: unknown, positions: Position[]): void {
  if (!Array.isArray(value)) {
    return;
  }
  if (value.length >= 2 && value.every((item) => typeof item === "number")) {
    positions.push(value as Position);
    return;
  }
  for (const child of value) {
    collectPositions(child, positions);
  }
}

function countGeometries(geometry: LeafletGeometry): number {
  return (
    1 +
    (geometry.type === "GeometryCollection"
      ? (geometry.geometries ?? []).reduce((total, child) => total + countGeometries(child), 0)
      : 0)
  );
}

function calculateBounds(positions: Position[]): LeafletBounds {
  if (positions.length === 0) {
    return null;
  }

  const longitudes = positions.map((position) => position[0]);
  const latitudes = positions.map((position) => position[1]);
  return [
    [Math.min(...latitudes), Math.min(...longitudes)],
    [Math.max(...latitudes), Math.max(...longitudes)]
  ];
}

function makeFeatureCollection(features: LeafletFeature[]): LeafletFeatureCollection {
  return { type: "FeatureCollection", features };
}

function requireObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw geoJsonInvalid("object");
  }
  return value as JsonObject;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw geoJsonInvalid("array");
  }
  return value;
}

function requireNonemptyArray(value: unknown): unknown[] {
  const values = requireArray(value);
  if (values.length === 0) {
    throw geoJsonInvalid("array_empty");
  }
  return values;
}

function cloneJsonObject(value: unknown): Record<string, unknown> {
  const object = requireObject(value);
  try {
    return JSON.parse(JSON.stringify(object)) as Record<string, unknown>;
  } catch (error) {
    throw geoJsonInvalid(error);
  }
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function bindingText(value: SparqlBindingValue | null | undefined): string {
  return value?.value?.trim() ?? "";
}

function samePosition(left: Position | undefined, right: Position | undefined): boolean {
  return Boolean(
    left &&
      right &&
      left.length === right.length &&
      left.every((coordinate, index) => coordinate === right[index])
  );
}

function missingSparqlVariables(index: number): never {
  throw new LodeonClientError("leaflet.sparql_variables_missing", {
    row: index + 1
  });
}

function geoJsonInvalid(error: unknown): LodeonClientError {
  return new LodeonClientError(
    "leaflet.geojson_invalid",
    { externalError: error instanceof Error ? error.message : String(error) },
    { cause: error }
  );
}

function printableValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  return String(value);
}
