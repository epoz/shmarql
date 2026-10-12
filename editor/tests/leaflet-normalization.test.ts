import { describe, expect, it } from "vitest";
import { LodeonClientError } from "@lodeon/errors/client-error";
import {
  normalizeGeoJson,
  normalizeManualPoints,
  normalizeSparqlRows,
  validateLatitudeLongitude
} from "@lodeon/nodes/leaflet/normalization";
import type { NormalizedSparqlRow } from "@lodeon/nodes/sparql/api-client";

const literal = (value: string) => ({ type: "literal", value });
const uri = (value: string) => ({ type: "uri", value });

describe("Leaflet normalization", () => {
  it("normalizes mixed GeoJSON and derives deterministic metadata", () => {
    const result = normalizeGeoJson({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "place",
          geometry: { type: "Point", coordinates: [8.2, 49.9] },
          properties: { category: "City", label: "Mainz" }
        },
        {
          type: "Feature",
          id: "place",
          geometry: {
            type: "GeometryCollection",
            geometries: [
              {
                type: "LineString",
                coordinates: [
                  [7, 48],
                  [9, 50]
                ]
              },
              {
                type: "Polygon",
                coordinates: [
                  [
                    [7, 48],
                    [8, 48],
                    [8, 49],
                    [7, 48]
                  ]
                ]
              }
            ]
          },
          properties: { category: "Region" }
        },
        {
          type: "Feature",
          geometry: null,
          properties: { category: "City" }
        }
      ]
    });

    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual([
      "place",
      "place-2",
      "leaflet-feature-3"
    ]);
    expect(result.bounds).toEqual([
      [48, 7],
      [50, 9]
    ]);
    expect(result.categories).toEqual(["City", "Region"]);
    expect(result.summary).toEqual({
      featureCount: 3,
      geometryCount: 4,
      coordinateCount: 7,
      geometryTypes: {
        Point: 1,
        GeometryCollection: 1,
        LineString: 1,
        Polygon: 1
      }
    });
  });

  it("accepts a serialized geometry and wraps it as a feature collection", () => {
    const result = normalizeGeoJson(
      JSON.stringify({ type: "MultiPoint", coordinates: [[8, 49], [9, 50]] })
    );

    expect(result.featureCollection).toEqual({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "leaflet-feature-1",
          geometry: { type: "MultiPoint", coordinates: [[8, 49], [9, 50]] },
          properties: {}
        }
      ]
    });
  });

  it("normalizes multi-line and multi-polygon coordinate nesting", () => {
    const multiLine = normalizeGeoJson({
      type: "MultiLineString",
      coordinates: [[[7, 48], [8, 49]], [[9, 50], [10, 51]]]
    });
    const multiPolygon = normalizeGeoJson({
      type: "MultiPolygon",
      coordinates: [[[[7, 48], [8, 48], [8, 49], [7, 48]]]]
    });

    expect(multiLine.summary.geometryTypes).toEqual({ MultiLineString: 1 });
    expect(multiLine.summary.coordinateCount).toBe(4);
    expect(multiPolygon.summary.geometryTypes).toEqual({ MultiPolygon: 1 });
    expect(multiPolygon.summary.coordinateCount).toBe(4);
  });

  it("rejects malformed GeoJSON, unsupported geometries, and invalid rings", () => {
    expectClientError(() => normalizeGeoJson("{"), "leaflet.geojson_invalid");
    expectClientError(
      () => normalizeGeoJson({ type: "CircularString", coordinates: [] }),
      "leaflet.geometry_unsupported",
      { geometryType: "CircularString" }
    );
    expectClientError(
      () =>
        normalizeGeoJson({
          type: "Polygon",
          coordinates: [[[8, 49], [9, 49], [9, 50], [8, 50]]]
        }),
      "leaflet.geojson_invalid"
    );
  });

  it("validates coordinate values and geographic ranges", () => {
    expect(validateLatitudeLongitude("49.9", "8.2", 0)).toEqual([8.2, 49.9]);
    expectClientError(
      () => validateLatitudeLongitude(91, 8, 2),
      "leaflet.coordinate_invalid",
      { index: 3, latitude: "91", longitude: "8" }
    );
    expectClientError(
      () => normalizeGeoJson({ type: "Point", coordinates: [181, 49] }),
      "leaflet.coordinate_invalid"
    );
  });

  it("normalizes canonical SPARQL variables and retains popup bindings", () => {
    const rows: NormalizedSparqlRow[] = [
      {
        resource: uri("https://example.org/place/1"),
        latitude: literal("49.9929"),
        longitude: literal("8.2473"),
        geometry: null,
        label: literal("Mainz"),
        category: literal("City"),
        note: literal("Rhine")
      }
    ];
    const result = normalizeSparqlRows(rows);

    expect(result.featureCollection.features[0]).toEqual({
      type: "Feature",
      id: "https://example.org/place/1",
      geometry: { type: "Point", coordinates: [8.2473, 49.9929] },
      properties: {
        label: "Mainz",
        category: "City",
        resource: "https://example.org/place/1",
        note: "Rhine"
      }
    });
    expect(result.categories).toEqual(["City"]);
  });

  it("retains every non-geometric binding from a map query", () => {
    const result = normalizeSparqlRows([
      {
        latitude: literal("41.9028"),
        longitude: literal("12.4964"),
        opera: literal("La clemenza di Tito"),
        composer: literal("Wolfgang Amadeus Mozart"),
        theater: literal("Teatro Argentina"),
        location: literal("Rome"),
        year: literal("1815"),
        itemCount: literal("3")
      }
    ]);

    expect(result.featureCollection.features[0]).toEqual({
      type: "Feature",
      id: "leaflet-feature-1",
      geometry: { type: "Point", coordinates: [12.4964, 41.9028] },
      properties: {
        opera: "La clemenza di Tito",
        composer: "Wolfgang Amadeus Mozart",
        theater: "Teatro Argentina",
        location: "Rome",
        year: "1815",
        itemCount: "3"
      }
    });
  });

  it("prefers canonical GeoJSON geometry and makes duplicate resource ids unique", () => {
    const geometry = JSON.stringify({ type: "Point", coordinates: [11, 48] });
    const rows: NormalizedSparqlRow[] = [
      { resource: uri("urn:place"), geometry: literal(geometry) },
      { resource: uri("urn:place"), geometry: literal(geometry) }
    ];
    const result = normalizeSparqlRows(rows);

    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual([
      "urn:place",
      "urn:place-2"
    ]);
    expect(result.summary.coordinateCount).toBe(2);
  });

  it("normalizes canonical WKT geometries, including collections and SRIDs", () => {
    const rows: NormalizedSparqlRow[] = [
      {
        resource: uri("urn:wkt:1"),
        geometry: literal("SRID=4326;POINT Z (8 49 120)")
      },
      {
        resource: uri("urn:wkt:2"),
        geometry: literal(
          "GEOMETRYCOLLECTION (LINESTRING (7 48, 9 50), POLYGON ((7 48, 8 48, 8 49, 7 48)))"
        )
      }
    ];
    const result = normalizeSparqlRows(rows);

    expect(result.featureCollection.features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [8, 49, 120]
    });
    expect(result.bounds).toEqual([[48, 7], [50, 9]]);
    expect(result.summary.geometryTypes).toEqual({
      Point: 1,
      GeometryCollection: 1,
      LineString: 1,
      Polygon: 1
    });
  });

  it("retains properties from GeoJSON Features returned through ?geometry", () => {
    const result = normalizeSparqlRows([{
      geometry: literal(JSON.stringify({
        type: "Feature",
        geometry: { type: "Point", coordinates: [12.4964, 41.9028] },
        properties: { opera: "Tito Manlio", composer: "Vivaldi" }
      })),
      theater: literal("Teatro Capranica")
    }]);

    expect(result.featureCollection.features[0]?.properties).toEqual({
      opera: "Tito Manlio",
      composer: "Vivaldi",
      theater: "Teatro Capranica"
    });
  });

  it("rejects malformed and unsupported canonical WKT", () => {
    expectClientError(
      () => normalizeSparqlRows([{ geometry: literal("POINT (8)") }]),
      "leaflet.geojson_invalid"
    );
    expectClientError(
      () => normalizeSparqlRows([{ geometry: literal("CIRCULARSTRING (8 49, 9 50)") }]),
      "leaflet.geometry_unsupported",
      { geometryType: "CIRCULARSTRING" }
    );
  });

  it("rejects SPARQL rows without canonical geometry or coordinate pairs", () => {
    expectClientError(
      () => normalizeSparqlRows([{ resource: uri("urn:place"), latitude: literal("49") }]),
      "leaflet.sparql_variables_missing",
      { row: 1 }
    );
    expectClientError(
      () => normalizeSparqlRows([{ lat: literal("49"), lon: literal("8") }]),
      "leaflet.sparql_variables_missing",
      { row: 1 }
    );
  });

  it("normalizes manual points and retains custom popup properties", () => {
    const result = normalizeManualPoints([
      {
        id: "point-a",
        latitude: 50,
        longitude: 8,
        label: "Archive",
        resource: "https://example.org/archive",
        category: "Institution",
        properties: { address: "Example Street" }
      },
      {
        id: "point-a",
        latitude: 51,
        longitude: 9,
        label: "Museum",
        properties: {}
      }
    ]);

    expect(result.featureCollection.features.map((feature) => feature.id)).toEqual([
      "point-a",
      "point-a-2"
    ]);
    expect(result.featureCollection.features[0]?.properties).toEqual({
      address: "Example Street",
      label: "Archive",
      resource: "https://example.org/archive",
      category: "Institution"
    });
    expect(result.bounds).toEqual([[50, 8], [51, 9]]);
  });

  it("returns empty derived metadata for an empty collection", () => {
    const result = normalizeGeoJson({ type: "FeatureCollection", features: [] });

    expect(result.bounds).toBeNull();
    expect(result.categories).toEqual([]);
    expect(result.summary).toEqual({
      featureCount: 0,
      geometryCount: 0,
      coordinateCount: 0,
      geometryTypes: {}
    });
  });
});

function expectClientError(
  callback: () => unknown,
  code: string,
  variables?: Record<string, string | number>
): void {
  try {
    callback();
    throw new Error("expected LodeonClientError");
  } catch (error) {
    expect(error).toBeInstanceOf(LodeonClientError);
    expect((error as LodeonClientError).code).toBe(code);
    if (variables) {
      expect((error as LodeonClientError).variables).toMatchObject(variables);
    }
  }
}
