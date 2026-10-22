import { describe, expect, expectTypeOf, it } from "vitest";
import {
  EMPTY_LEAFLET_FEATURE_COLLECTION,
  LEAFLET_NODE_TYPE_NAME,
  type LeafletNodeAttrs,
  type LeafletRenderSpec
} from "@lodeon/nodes/leaflet/contracts";

describe("Leaflet Special Node contracts", () => {
  it("uses a stable node type and empty normalized feature collection", () => {
    expect(LEAFLET_NODE_TYPE_NAME).toBe("leafletNode");
    expect(EMPTY_LEAFLET_FEATURE_COLLECTION).toEqual({
      type: "FeatureCollection",
      features: []
    });
  });

  it("keeps the renderer specification independent from authoring sources", () => {
    expectTypeOf<LeafletRenderSpec>().not.toHaveProperty("query");
    expectTypeOf<LeafletRenderSpec>().not.toHaveProperty("result");
    expectTypeOf<LeafletRenderSpec>().not.toHaveProperty("geoJsonSource");
    expectTypeOf<LeafletRenderSpec>().toHaveProperty("featureCollection");
  });

  it("keeps authoring sources and normalized output in canonical node attrs", () => {
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("query");
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("geoJsonSource");
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("manualPoints");
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("featureCollection");
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("viewConfig");
    expectTypeOf<LeafletNodeAttrs>().toHaveProperty("knowledgeGraphProfileId");
  });
});
