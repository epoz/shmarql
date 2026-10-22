import { Editor, StarterKit } from "@lodeon/test-support/tiptap";
import { fireEvent, waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLeafletSpec,
  createLeafletNodeContent,
  LeafletNode
} from "@lodeon/nodes/leaflet/node-view";
import { defaultConfig } from "./fixtures/config";
import { createLocalization } from "@lodeon/localization/runtime";
import { setSpecialNodeLocalization } from "@lodeon/nodes/shared/node-view-controls";

const runtime = defaultConfig.nodes.leaflet!;

describe("Leaflet editor node", () => {
  beforeEach(() => {
    setSpecialNodeLocalization(createLocalization(defaultConfig));
    document.body.innerHTML = "";
    Object.defineProperty(SVGSVGElement.prototype, "createSVGRect", {
      configurable: true,
      value: () => ({})
    });
  });
  it("creates a canonical node without result-mapping state", () => {
    const content = createLeafletNodeContent({}, runtime, "culture-kg");

    expect(content.type).toBe("leafletNode");
    expect(content.attrs?.kind).toBe("leaflet");
    expect(content.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(content.attrs).not.toHaveProperty("resultMapping");
    expect(content.attrs?.viewConfig.renderer).toBe("leaflet");
  });

  it("merges nested stored settings with runtime defaults and rebuilds viewConfig", () => {
    const content = createLeafletNodeContent({
      clustering: { enabled: true } as never,
      legend: { enabled: false } as never,
      markerStyle: { radius: 11 } as never,
      viewConfig: { renderer: "leaflet", height: 1 } as never
    }, runtime);

    expect(content.attrs?.clustering).toEqual({
      ...runtime.clustering,
      enabled: true
    });
    expect(content.attrs?.legend).toEqual({
      ...runtime.legend,
      enabled: false,
      title: ""
    });
    expect(content.attrs?.markerStyle).toEqual({ ...runtime.marker, radius: 11 });
    expect(content.attrs?.viewConfig.height).toBe(runtime.defaultHeight);
    expect(content.attrs?.viewConfig.clustering.spiderfyDistanceMultiplier).toBe(
      runtime.clustering.spiderfyDistanceMultiplier
    );
  });

  it("deletes the Leaflet node through the shared header control", () => {
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [StarterKit, LeafletNode.configure({ leaflet: runtime })],
      content: { type: "doc", content: [createLeafletNodeContent({}, runtime)] }
    });

    fireEvent.click(host.querySelector("button[title='Delete node']")!);
    expect(editor.getJSON().content ?? []).not.toContainEqual(
      expect.objectContaining({ type: "leafletNode" })
    );
    editor.destroy();
  });

  it("normalizes supplied manual points and mirrors presentation settings", () => {
    const content = createLeafletNodeContent(
      {
        sourceMode: "points",
        manualPoints: [
          {
            id: "weimar",
            latitude: 50.9795,
            longitude: 11.3235,
            label: "Weimar",
            category: "place",
            properties: { note: "Goethe" }
          }
        ],
        height: 640,
        caption: "Literary places"
      },
      runtime
    );

    expect(content.attrs?.featureCollection.features).toHaveLength(1);
    expect(content.attrs?.featureCollection.features[0].geometry.coordinates).toEqual([
      11.3235,
      50.9795
    ]);
    expect(buildLeafletSpec(content.attrs as never)).toMatchObject({
      renderer: "leaflet",
      height: 640,
      caption: "Literary places"
    });
  });

  it("runs a SPARQL source and stores its normalized map features", async () => {
    const executeQuery = vi.fn().mockResolvedValue({
      status: "success",
      endpointUrl: "https://example.org/sparql",
      executedAt: "2026-08-07T00:00:00Z",
      variables: ["latitude", "longitude", "label"],
      rows: [
        {
          latitude: { type: "literal", value: "50.9795" },
          longitude: { type: "literal", value: "11.3235" },
          label: { type: "literal", value: "Weimar" }
        }
      ],
      durationMs: 3
    });
    const host = document.createElement("div");
    const content = createLeafletNodeContent(
      { sourceMode: "sparql", query: "SELECT * WHERE {}" },
      runtime,
      "culture-kg"
    );
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery,
          errors: defaultConfig.errors
        })
      ],
      content: { type: "doc", content: [content] }
    });
    const queryEditor = host.querySelector(".ld-leaflet-sparql-source-editor");
    const sourceControls = host.querySelector(".ld-leaflet-source-controls");

    expect(sourceControls?.contains(queryEditor)).toBe(true);
    expect(queryEditor?.parentElement?.tagName).not.toBe("LABEL");

    fireEvent.click(host.querySelector("[data-leaflet-action='run']")!);

    await waitFor(() => expect(executeQuery).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(editor.getJSON().content?.[0].attrs?.featureCollection.features).toHaveLength(1)
    );
    expect(editor.getJSON().content?.[0].attrs?.featureCollection.features[0].properties.label).toBe(
      "Weimar"
    );

    fireEvent.click(host.querySelector("[data-leaflet-action='run']")!);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(host.querySelector(".ld-node-footer")?.textContent).toContain("1 features")
    );
    expect(host.querySelector(".ld-node-footer")?.textContent).not.toContain(
      "Running query"
    );

    editor.destroy();
  });

  it("renders a stored SPARQL snapshot without rerunning its query", () => {
    const executeQuery = vi.fn();
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(host, "clientHeight", { configurable: true, value: 520 });
    document.body.append(host);
    const content = createLeafletNodeContent({
      sourceMode: "sparql",
      query: "SELECT ?latitude ?longitude ?label WHERE { ?place ?p ?label }",
      result: {
        status: "success",
        endpointUrl: "https://example.org/sparql",
        executedAt: "2026-08-08T00:00:00Z",
        durationMs: 4,
        variables: ["latitude", "longitude", "label"],
        rows: []
      },
      featureCollection: {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          id: "weimar",
          geometry: { type: "Point", coordinates: [11.3235, 50.9795] },
          properties: { label: "Weimar", category: "Literary place" }
        }]
      },
      clustering: {
        enabled: false,
        disableAtZoom: null,
        showCoverageOnHover: true,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.5
      }
    }, runtime, "culture-kg");
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery,
          errors: defaultConfig.errors
        })
      ],
      content: { type: "doc", content: [content] }
    });

    expect(executeQuery).not.toHaveBeenCalled();
    expect(host.querySelectorAll(".ld-leaflet-marker-icon")).toHaveLength(1);
    expect(host.querySelector(".ld-leaflet-viewer-legend")?.textContent).toContain(
      "Literary place"
    );
    expect(host.querySelector(".ld-node-footer")?.textContent).toContain("1 features");

    const mapBeforeTyping = host.querySelector(".leaflet-container");
    const queryEditor = host.querySelector<HTMLDivElement>(
      ".ld-leaflet-sparql-source-editor"
    ) as HTMLDivElement & {
      __lodeonCodeMirrorView?: {
        state: { doc: { length: number } };
        dispatch: (spec: { changes: { from: number; insert: string } }) => void;
      };
    };

    queryEditor.__lodeonCodeMirrorView?.dispatch({
      changes: {
        from: queryEditor.__lodeonCodeMirrorView.state.doc.length,
        insert: "\n# edited"
      }
    });

    expect(editor.getJSON().content?.[0].attrs?.query).toContain("# edited");
    expect(host.querySelector(".leaflet-container")).toBe(mapBeforeTyping);

    const mouseupAtDocument = vi.fn();
    document.addEventListener("mouseup", mouseupAtDocument, { once: true });
    host.querySelector(".ld-leaflet-preview")?.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true })
    );
    expect(mouseupAtDocument).toHaveBeenCalledOnce();

    editor.destroy();
  });

  it("stores every map presentation control in the render specification", () => {
    const host = document.createElement("div");
    const configuredRuntime = {
      ...runtime,
      tileLayers: {
        ...runtime.tileLayers,
        monochrome: {
          label: "Monochrome",
          urlTemplate: "https://tiles.example.org/{z}/{x}/{y}.png",
          attribution: "Example",
          minZoom: 1,
          maxZoom: 18
        }
      }
    };
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: configuredRuntime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery: vi.fn(),
          errors: defaultConfig.errors
        })
      ],
      content: {
        type: "doc",
        content: [createLeafletNodeContent({ sourceMode: "sparql" }, configuredRuntime)]
      }
    });
    const input = (label: string) =>
      host.querySelector<HTMLInputElement>(`input[aria-label='${label}']`)!;
    const select = (label: string) =>
      host.querySelector<HTMLSelectElement>(`select[aria-label='${label}']`)!;

    fireEvent.input(select("Tile layer"), { target: { value: "monochrome" } });
    fireEvent.input(input("Height"), { target: { value: "640" } });
    fireEvent.input(select("Initial view"), { target: { value: "configured" } });
    fireEvent.input(input("Center latitude"), { target: { value: "41.9028" } });
    fireEvent.input(input("Center longitude"), { target: { value: "12.4964" } });
    fireEvent.input(input("Zoom"), { target: { value: "8" } });
    fireEvent.input(input("Cluster points"), { target: { checked: false } });
    fireEvent.input(input("Show legend"), { target: { checked: true } });
    fireEvent.input(input("Legend title"), { target: { value: "Composers" } });
    fireEvent.input(select("Legend position"), { target: { value: "topLeft" } });
    const popupFields = input("Popup fields");
    fireEvent.input(popupFields, { target: { value: "opera," } });
    expect(popupFields.value).toBe("opera,");
    fireEvent.input(popupFields, { target: { value: "opera, composer" } });
    expect(popupFields.value).toBe("opera, composer");
    expect(editor.getJSON().content?.[0].attrs?.popupFields).toEqual([
      "opera",
      "composer"
    ]);
    fireEvent.input(popupFields, {
      target: { value: "work, creator, venue, location, year, itemCount" }
    });
    fireEvent.input(input("Marker radius"), { target: { value: "10" } });
    fireEvent.input(input("Marker border"), { target: { value: "#112233" } });
    fireEvent.input(input("Marker fill"), { target: { value: "#445566" } });
    fireEvent.input(input("Marker opacity"), { target: { value: "0.6" } });
    fireEvent.input(input("Marker border width"), { target: { value: "3" } });
    fireEvent.input(input("Caption"), { target: { value: "Research venues" } });

    expect(editor.getJSON().content?.[0].attrs?.viewConfig).toMatchObject({
      tileLayerId: "monochrome",
      height: 640,
      initialView: "configured",
      center: [41.9028, 12.4964],
      zoom: 8,
      clustering: { enabled: false },
      legend: { enabled: true, title: "Composers", position: "topLeft" },
      popupFields: ["work", "creator", "venue", "location", "year", "itemCount"],
      markerStyle: {
        radius: 10,
        color: "#112233",
        fillColor: "#445566",
        fillOpacity: 0.6,
        weight: 3
      },
      caption: "Research venues"
    });
    editor.destroy();
  });

  it("normalizes pasted GeoJSON through the authoring NodeView", async () => {
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery: vi.fn(),
          errors: defaultConfig.errors
        })
      ],
      content: {
        type: "doc",
        content: [createLeafletNodeContent({ sourceMode: "geojson" }, runtime)]
      }
    });
    const geoJson = host.querySelector<HTMLTextAreaElement>(
      "textarea[placeholder^='Paste a GeoJSON']"
    )!;

    fireEvent.input(geoJson, {
      target: {
        value: JSON.stringify({
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            geometry: { type: "Point", coordinates: [11.3235, 50.9795] },
            properties: { label: "Weimar", category: "Literary place" }
          }]
        })
      }
    });

    await waitFor(() =>
      expect(editor.getJSON().content?.[0].attrs?.featureCollection.features).toHaveLength(1)
    );
    expect(editor.getJSON().content?.[0].attrs?.featureCollection.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [11.3235, 50.9795] },
      properties: { label: "Weimar", category: "Literary place" }
    });
    expect(host.querySelector(".ld-node-footer")?.textContent).toContain("1 features");

    editor.destroy();
  });

  it("announces localized query validation and execution failures", async () => {
    const executeQuery = vi.fn().mockResolvedValue({
      status: "error",
      endpointUrl: "https://example.org/sparql",
      executedAt: "2026-08-07T00:00:00Z",
      durationMs: 3,
      code: "sparql.request_failed",
      variables: { externalError: "endpoint unavailable" },
      message: "sparql.request_failed"
    });
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery,
          errors: defaultConfig.errors
        })
      ],
      content: {
        type: "doc",
        content: [createLeafletNodeContent({ sourceMode: "sparql" }, runtime)]
      }
    });
    const run = host.querySelector<HTMLButtonElement>("[data-leaflet-action='run']")!;
    const alert = host.querySelector<HTMLElement>(".ld-leaflet-error")!;
    const result = host.querySelector<HTMLElement>(".ld-leaflet-result")!;
    const resultStatus = host.querySelector<HTMLElement>(
      ".ld-leaflet-result-footer"
    )!;
    const status = host.querySelector<HTMLElement>(
      ".ld-node-footer:not(.ld-leaflet-result-footer)"
    )!;

    expect(alert.getAttribute("role")).toBe("alert");
    expect(status.getAttribute("role")).toBe("status");
    fireEvent.click(run);
    expect(executeQuery).not.toHaveBeenCalled();
    expect(result.textContent).toContain("The map query is empty");

    editor.commands.updateAttributes("leafletNode", {
      query: "SELECT * WHERE { ?s ?p ?o }"
    });
    fireEvent.click(run);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(result.textContent).toContain("The SPARQL request failed")
    );
    expect(resultStatus.textContent).toContain("Query failed");
    expect(alert.textContent).toBe("");
    expect(run.hasAttribute("aria-busy")).toBe(false);

    editor.destroy();
  });

  it("reports invalid manual popup-property JSON instead of ignoring it", () => {
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery: vi.fn(),
          errors: defaultConfig.errors
        })
      ],
      content: {
        type: "doc",
        content: [createLeafletNodeContent({
          sourceMode: "points",
          manualPoints: [{
            id: "mainz",
            latitude: 49.99,
            longitude: 8.27,
            label: "Mainz",
            properties: {}
          }]
        }, runtime)]
      }
    });
    const properties = host.querySelector<HTMLInputElement>(
      "input[aria-label='Popup properties (JSON)']"
    )!;
    const points = host.querySelector<HTMLElement>(".ld-leaflet-points")!;

    expect(points.getAttribute("role")).toBe("group");
    expect(points.getAttribute("aria-label")).toBe("Manual points");
    fireEvent.input(properties, { target: { value: "{broken" } });
    expect(host.querySelector(".ld-leaflet-error")?.textContent).toContain(
      "The popup properties are invalid"
    );
    expect(editor.getJSON().content?.[0].attrs?.manualPoints[0].properties).toEqual({});

    fireEvent.input(properties, { target: { value: '{"source":"Archive"}' } });
    expect(editor.getJSON().content?.[0].attrs?.manualPoints[0].properties).toEqual({
      source: "Archive"
    });
    fireEvent.click(host.querySelector("button[data-remove-point]")!);
    expect(editor.getJSON().content?.[0].attrs?.manualPoints).toHaveLength(0);

    editor.destroy();
  });

  it("reports browser file-read failures through the Leaflet error registry", async () => {
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [
        StarterKit,
        LeafletNode.configure({
          leaflet: runtime,
          defaultConfigId: "culture",
          defaultKnowledgeGraphProfileId: "culture-kg",
          resolveKnowledgeGraphProfile: () =>
            defaultConfig.knowledgeGraph.profiles[0],
          executeQuery: vi.fn(),
          errors: defaultConfig.errors
        })
      ],
      content: {
        type: "doc",
        content: [createLeafletNodeContent({ sourceMode: "geojson" }, runtime)]
      }
    });
    const fileInput = host.querySelector<HTMLInputElement>(
      "input[aria-label='GeoJSON file']"
    )!;
    const unreadableFile = {
      text: vi.fn().mockRejectedValue(new Error("read failed"))
    };

    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [unreadableFile]
    });
    fireEvent.change(fileInput);

    await waitFor(() =>
      expect(host.querySelector(".ld-leaflet-error")?.textContent).toContain(
        "The GeoJSON file could not be read"
      )
    );

    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [{
        text: vi.fn().mockResolvedValue(JSON.stringify({
          type: "Point",
          coordinates: [8.2473, 49.9929]
        }))
      }]
    });
    fireEvent.change(fileInput);
    await waitFor(() =>
      expect(editor.getJSON().content?.[0].attrs?.featureCollection.features).toHaveLength(1)
    );
    expect(host.querySelector(".ld-leaflet-error")?.textContent).toBe("");
    editor.destroy();
  });
});
