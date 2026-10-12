import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/dom";
import { LodeonClientError } from "@lodeon/errors/client-error";
import type {
  LeafletRenderSpec,
  LeafletRuntimeConfig
} from "@lodeon/nodes/leaflet/contracts";

type ViewerModule = typeof import("@lodeon/nodes/leaflet/viewer");

let viewerModule: ViewerModule;
let resizeDisconnects = 0;
let triggerResize = () => {};
let resizeCallbacks = 0;

beforeAll(async () => {
  Object.defineProperty(SVGSVGElement.prototype, "createSVGRect", {
    configurable: true,
    value: () => ({})
  });
  class TestResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      triggerResize = () => {
        resizeCallbacks += 1;
        callback([], this as unknown as ResizeObserver);
      };
    }
    observe(): void {}
    disconnect(): void {
      resizeDisconnects += 1;
    }
  }
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  viewerModule = await import("@lodeon/nodes/leaflet/viewer");
});

beforeEach(() => {
  document.body.innerHTML = "";
  resizeDisconnects = 0;
  resizeCallbacks = 0;
  triggerResize = () => {};
});

describe("Leaflet editor viewer", () => {
  it("renders local tiles, mixed geometry, clustering, popups, and a legend", () => {
    const host = createHost();
    const viewer = viewerModule.renderLeafletViewer(
      host,
      makeSpec(),
      makeRuntime(),
      { labels: { ariaLabel: "Map preview", emptyState: "No places", legend: "Map legend", feature: "Map feature" } }
    );

    expect(host.querySelector(".leaflet-container")).not.toBeNull();
    expect(host.querySelector(".leaflet-tile-pane")).not.toBeNull();
    expect(
      host.querySelector<HTMLElement>(".ld-leaflet-viewer-shell")?.dataset.clustering
    ).toBe("true");
    expect(host.querySelector(".leaflet-overlay-pane svg path")).not.toBeNull();
    expect(host.querySelector(".ld-leaflet-viewer-legend")?.textContent).toContain(
      "Places"
    );
    expect(host.querySelector(".ld-leaflet-viewer-legend")?.textContent).toContain(
      "City"
    );
    expect(host.querySelector(".ld-leaflet-viewer-legend")?.getAttribute("role")).toBe(
      "group"
    );
    expect(host.querySelector(".ld-leaflet-viewer-legend")?.getAttribute("aria-label")).toBe(
      "Map legend"
    );

    viewer.update(
      makeSpec({
        clustering: {
          enabled: false,
          disableAtZoom: null,
          showCoverageOnHover: true,
          spiderfyOnMaxZoom: true,
          spiderfyDistanceMultiplier: 1.5
        }
      })
    );
    const marker = host.querySelector<HTMLElement>(".ld-leaflet-marker-icon");
    expect(marker).not.toBeNull();
    expect(marker?.getAttribute("title")).toBe("<img src=x onerror=alert(1)>");
    marker?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popup = host.querySelector(".ld-leaflet-viewer-popup");
    expect(popup?.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(popup?.querySelector("img")).toBeNull();
    expect(popup?.querySelector<HTMLAnchorElement>("a")?.href).toBe(
      "https://example.org/place/1"
    );

    viewer.destroy();
    expect(host.innerHTML).toBe("");
    expect(resizeDisconnects).toBe(1);
  });

  it("updates layers, legend, dimensions, and configured view", () => {
    const host = createHost();
    const viewer = viewerModule.renderLeafletViewer(
      host,
      makeSpec(),
      makeRuntime(),
      { labels: { ariaLabel: "Map preview", emptyState: "No places", legend: "Map legend", feature: "Map feature" } }
    );
    const nextSpec = makeSpec({
      height: 360,
      initialView: "configured",
      center: [51, 9],
      zoom: 7,
      clustering: {
        enabled: false,
        disableAtZoom: null,
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: false,
        spiderfyDistanceMultiplier: 1.5
      },
      legend: { enabled: false, position: "topLeft", title: "" },
      featureCollection: {
        type: "FeatureCollection",
        features: [pointFeature("second", 9, 51, "Museum")]
      }
    });

    viewer.update(nextSpec, true);
    triggerResize();
    viewer.invalidateSize();

    expect(host.querySelector<HTMLElement>(".ld-leaflet-viewer-shell")?.style.height).toBe(
      "360px"
    );
    expect(host.querySelector(".marker-cluster")).toBeNull();
    expect(host.querySelector(".ld-leaflet-viewer-legend")).toBeNull();
    expect(host.querySelectorAll(".ld-leaflet-marker-icon")).toHaveLength(1);
    expect(resizeCallbacks).toBe(1);
    viewer.destroy();
  });

  it("renders coincident points independently when clustering is disabled", () => {
    const host = createHost();
    const viewer = viewerModule.renderLeafletViewer(
      host,
      makeSpec({
        initialView: "configured",
        center: [41.9028, 12.4964],
        zoom: 10,
        clustering: {
          enabled: false,
          disableAtZoom: null,
          showCoverageOnHover: true,
          spiderfyOnMaxZoom: true,
          spiderfyDistanceMultiplier: 1.5
        },
        featureCollection: {
          type: "FeatureCollection",
          features: [
            pointFeature("opera-1", 12.4964, 41.9028, "Opera"),
            pointFeature("opera-2", 12.4964, 41.9028, "Opera"),
            pointFeature("opera-3", 12.4964, 41.9028, "Opera")
          ]
        }
      }),
      makeRuntime(),
      {
        labels: {
          ariaLabel: "Map preview",
          emptyState: "No places",
          legend: "Map legend",
          feature: "Map feature"
        }
      }
    );
    expect(host.querySelector(".marker-cluster")).toBeNull();
    expect(host.querySelectorAll(".ld-leaflet-marker-icon")).toHaveLength(3);
    viewer.destroy();
  });

  it("shows arbitrary SPARQL result properties selected as popup fields", () => {
    const host = createHost();
    const spec = makeSpec({
      clustering: {
        enabled: false,
        disableAtZoom: null,
        showCoverageOnHover: true,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.5
      },
      popupFields: ["work", "creator", "venue", "location", "year", "itemCount"],
      featureCollection: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: "work-1",
          geometry: { type: "Point", coordinates: [12.4964, 41.9028] },
          properties: {
            work: "Example Work",
            creator: "Example Creator",
            venue: "Example Venue",
            location: "Example City",
            year: "1815",
            itemCount: "3"
          }
        }]
      }
    });
    const viewer = viewerModule.renderLeafletViewer(host, spec, makeRuntime(), {
      labels: {
        ariaLabel: "Map preview",
        emptyState: "No places",
        legend: "Map legend",
        feature: "Map feature"
      }
    });

    host.querySelector<HTMLElement>(".ld-leaflet-marker-icon")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    const popup = host.querySelector(".ld-leaflet-viewer-popup");

    expect(popup?.textContent).toContain("Example Work");
    expect(popup?.textContent).toContain("Example Creator");
    expect(popup?.textContent).toContain("Example Venue");
    expect(popup?.textContent).toContain("Example City");
    expect(popup?.textContent).toContain("1815");
    expect(popup?.textContent).toContain("3");
    expect(popup?.querySelectorAll(".ld-leaflet-viewer-popup-row")).toHaveLength(6);
    viewer.destroy();
  });

  it("shows a localized empty state and falls back to the runtime view", () => {
    const host = createHost();
    const viewer = viewerModule.renderLeafletViewer(
      host,
      makeSpec({
        featureCollection: { type: "FeatureCollection", features: [] },
        center: null,
        zoom: null
      }),
      makeRuntime(),
      { labels: { ariaLabel: "Map preview", emptyState: "No places", legend: "Map legend", feature: "Map feature" } }
    );

    const empty = host.querySelector<HTMLElement>(".ld-leaflet-viewer-empty");
    expect(empty?.hidden).toBe(false);
    expect(empty?.textContent).toBe("No places");
    expect(host.querySelector("[aria-label='Map preview']")).not.toBeNull();
    viewer.destroy();
  });

  it("rejects an unknown tile layer with a structured error and cleans up", () => {
    const host = createHost();

    try {
      viewerModule.renderLeafletViewer(
        host,
        makeSpec({ tileLayerId: "missing" }),
        makeRuntime(),
        { labels: { ariaLabel: "Map preview", emptyState: "No places", legend: "Map legend", feature: "Map feature" } }
      );
      throw new Error("expected LodeonClientError");
    } catch (error) {
      expect(error).toBeInstanceOf(LodeonClientError);
      expect((error as LodeonClientError).code).toBe(
        "leaflet.tile_layer_unavailable"
      );
      expect((error as LodeonClientError).variables).toEqual({
        tileLayerId: "missing"
      });
    }

    expect(host.innerHTML).toBe("");
    expect(resizeDisconnects).toBe(1);
  });

  it("rejects node zoom settings outside the selected tile layer range", () => {
    const host = createHost();
    expect(() => viewerModule.renderLeafletViewer(
      host,
      makeSpec({ zoom: 20 }),
      makeRuntime(),
      { labels: { ariaLabel: "Map preview", emptyState: "No places", legend: "Map legend", feature: "Map feature" } }
    )).toThrowError(LodeonClientError);
    expect(host.innerHTML).toBe("");
  });
});

function createHost(): HTMLElement {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { configurable: true, value: 800 });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: 520 });
  document.body.append(host);
  return host;
}

function makeRuntime(): LeafletRuntimeConfig {
  return {
    enabled: true,
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

function makeSpec(overrides: Partial<LeafletRenderSpec> = {}): LeafletRenderSpec {
  return {
    renderer: "leaflet",
    featureCollection: {
      type: "FeatureCollection",
      features: [
        pointFeature("first", 8, 50, "City"),
        pointFeature("nearby", 8.001, 50.001, "City"),
        {
          type: "Feature",
          id: "area",
          geometry: {
            type: "Polygon",
            coordinates: [[[7, 49], [9, 49], [9, 51], [7, 49]]]
          },
          properties: { label: "Area", category: "Region" }
        }
      ]
    },
    tileLayerId: "openStreetMap",
    height: 520,
    initialView: "fitBounds",
    center: null,
    zoom: null,
    fitBoundsMaxZoom: 14,
    clustering: {
      enabled: true,
      disableAtZoom: null,
      showCoverageOnHover: true,
      spiderfyOnMaxZoom: true,
      spiderfyDistanceMultiplier: 1.5
    },
    legend: { enabled: true, position: "bottomRight", title: "Places" },
    popupFields: ["label", "resource"],
    markerStyle: {
      radius: 7,
      color: "#005A8D",
      fillColor: "#0072B2",
      fillOpacity: 0.8,
      weight: 2
    },
    caption: "",
    ...overrides
  };
}

function pointFeature(
  id: string,
  longitude: number,
  latitude: number,
  category: string
): LeafletRenderSpec["featureCollection"]["features"][number] {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: {
      label: "<img src=x onerror=alert(1)>",
      resource: "https://example.org/place/1",
      category
    }
  };
}
