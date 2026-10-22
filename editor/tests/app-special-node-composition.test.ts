import { fireEvent, waitFor, within } from "@testing-library/dom";
import { Blob as NodeBlob } from "node:buffer";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "@lodeon/application/composition";
import { defaultConfig } from "./fixtures/config";
import { createEmptyProject } from "@lodeon/project/factory";
import { parseProject, readFileArrayBuffer } from "@lodeon/project/package/parsing";
import { serializeProject, serializeProjectZip } from "@lodeon/project/package/serialization";
import { createSparqlNodeContent } from "@lodeon/nodes/sparql/node-view";
import { createSparnaturalNodeContent } from "@lodeon/nodes/sparnatural/factory";
import { createVisualizationNodeContent } from "@lodeon/nodes/visualization/node-view";
import { createEmbedNodeContent } from "@lodeon/nodes/embed/node-view";
import { createIiifNodeContent } from "@lodeon/nodes/iiif/node-view";
import {
  createGraphExplorerNodeContent,
  GRAPH_EXPLORER_NODE_TYPE_NAME
} from "@lodeon/nodes/graph-explorer/node-view";
import { LEAFLET_NODE_TYPE_NAME } from "@lodeon/nodes/leaflet/contracts";
import { createLeafletNodeContent } from "@lodeon/nodes/leaflet/node-view";
import { VEROVIO_NODE_TYPE_NAME } from "@lodeon/nodes/verovio/contracts";
import { createVerovioNodeContent } from "@lodeon/nodes/verovio/node-view";
import { createRawGraphsNodeContent } from "@lodeon/nodes/rawgraphs/node-view";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";
import { createMediaAssetNodeContent } from "@lodeon/nodes/media-asset/node-view";
import { createStoryMetadataNodeContent } from "@lodeon/nodes/story-metadata/node-view";
import {
  getProjectAssetBlob,
  saveProjectAssetBlob
} from "@lodeon/persistence/project-store";
import { LodeonClientError } from "@lodeon/errors/client-error";
import {
  MockRendererXMLHttpRequest,
  resetAppTestState,
  setCodeEditorValue,
  stubRendererXmlHttpRequest
} from "./fixtures/app-harness";

describe("LODEON app shell", () => {
  afterEach(resetAppTestState);

  it("inserts a SPARQL node from the editor toolbar insert menu", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Node Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);


    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "sparql" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find((node) => node.type === "sparnaturalNode")
      ).toBeTruthy();
    });

    const sparqlNode = savedProject.document.content?.find(
      (node) => node.type === "sparnaturalNode"
    );

    expect(root.querySelector("[data-lodeon-node='sparnatural']")).toBeTruthy();
    expect(sparqlNode?.attrs?.kind).toBe("sparnatural");
    expect(sparqlNode?.attrs?.configId).toBe("culture-kg");

    app.destroy();
    root.remove();
  });

  it("inserts an Embed node from the editor toolbar insert menu when enabled", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Embed Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);

    config.nodes.embed.enabled = true;
    config.nodes.embed.allowedOrigins = ["https://player.example.org"];

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);

    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toContain("Embed Remote Content");

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "embed" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find((node) => node.type === "embedNode")
      ).toBeTruthy();
    });

    const embedNode = savedProject.document.content?.find(
      (node) => node.type === "embedNode"
    );

    expect(root.querySelector("[data-lodeon-node='embed']")).toBeTruthy();
    expect(embedNode?.attrs?.kind).toBe("embed");
    expect(embedNode?.attrs?.aspectRatio).toBe("16:9");
    expect(embedNode?.attrs?.sandbox).toContain("allow-scripts");

    app.destroy();
    root.remove();
  });

  it("inserts an IIIF node from the editor toolbar insert menu when enabled", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("IIIF Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);

    config.nodes.iiif.enabled = true;

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);

    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toContain("IIIF Object");

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "iiif" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find((node) => node.type === "iiifNode")
      ).toBeTruthy();
    });

    const iiifNode = savedProject.document.content?.find(
      (node) => node.type === "iiifNode"
    );

    expect(root.querySelector("[data-lodeon-node='iiif']")).toBeTruthy();
    expect(iiifNode?.attrs?.kind).toBe("iiif");
    expect(iiifNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(iiifNode?.attrs?.viewConfig?.renderer).toBe("iiif");

    app.destroy();
    root.remove();
  });

  it("inserts a Graph Explorer node with the currently selected knowledge graph profile", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Graph Explorer Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);

    localStorage.setItem("lodeon.knowledgeGraphProfileId", "secondary-kg");
    config.knowledgeGraph.profiles = [
      {
        ...config.knowledgeGraph.profiles[0],
        id: "culture-kg",
        label: "Culture KG",
        active: true,
        graphExplorer: {
          enabled: true,
          labelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
          descriptionProperties: ["http://schema.org/description"],
          typeProperties: ["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"],
          predicateLabelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
          defaultDirection: "both",
          defaultDepth: 1,
          maxDepth: 2,
          maxNodes: 100,
          maxEdgesPerNode: 50,
          includeLiterals: false,
          includeBlankNodes: true,
          showPredicateLabels: true,
          showTypes: true,
          defaultColorScheme: "basic",
          colorSchemes: {
            basic: {
              label: "Basic",
              nodeColors: {
                iri: "#0072B2",
                blank: "#E69F00",
                literal: "#FFFFFF"
              },
              edgeColors: {
                default: "#666666"
              }
            }
          },
          resultMapping: {
            iri: ["resource", "item", "iri", "uri"],
            label: ["label", "title"]
          },
          expandUrl: "/api/explorer/culture-kg/expand"
        }
      },
      {
        id: "secondary-kg",
        label: "Secondary KG",
        sparqlUrl: "/api/sparql/secondary-kg",
        graphExplorer: {
          enabled: true,
          labelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
          descriptionProperties: ["http://schema.org/description"],
          typeProperties: ["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"],
          predicateLabelProperties: ["http://www.w3.org/2000/01/rdf-schema#label"],
          defaultDirection: "incoming",
          defaultDepth: 1,
          maxDepth: 2,
          maxNodes: 42,
          maxEdgesPerNode: 12,
          includeLiterals: false,
          includeBlankNodes: true,
          showPredicateLabels: true,
          showTypes: true,
          defaultColorScheme: "basic",
          colorSchemes: {
            basic: {
              label: "Basic",
              nodeColors: {
                iri: "#0072B2",
                blank: "#E69F00",
                literal: "#FFFFFF"
              },
              edgeColors: {
                default: "#666666"
              }
            }
          },
          resultMapping: {
            iri: ["resource"],
            label: ["label"]
          },
          expandUrl: "/api/explorer/secondary-kg/expand"
        }
      }
    ];
    const legacyProfileFixtures = config.knowledgeGraph.profiles as unknown as Array<
      (typeof config.knowledgeGraph.profiles)[number] & {
        graphExplorer: Record<string, unknown>;
      }
    >;
    config.nodes.graphExplorer.profiles = Object.fromEntries(
      legacyProfileFixtures.map((profile) => {
        const { enabled: _enabled, resultMapping: _resultMapping, expandUrl, ...settings } =
          profile.graphExplorer;
        return [profile.id, { ...settings, expandURL: expandUrl }];
      })
    ) as typeof config.nodes.graphExplorer.profiles;
    config.knowledgeGraph.profiles = legacyProfileFixtures.map(({ graphExplorer: _settings, ...profile }) =>
      profile
    );

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);

    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toContain("Graph Explorer");

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "graphExplorer" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find(
          (node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME
        )
      ).toBeTruthy();
    });

    const graphNode = savedProject.document.content?.find(
      (node) => node.type === GRAPH_EXPLORER_NODE_TYPE_NAME
    );

    expect(root.querySelector("[data-lodeon-node='graph-explorer']")).toBeTruthy();
    expect(graphNode?.attrs?.kind).toBe("graphExplorer");
    expect(graphNode?.attrs?.knowledgeGraphProfileId).toBe("secondary-kg");
    expect(graphNode?.attrs?.direction).toBe("incoming");
    expect(graphNode?.attrs?.maxNodes).toBe(42);
    expect(graphNode?.attrs?.viewConfig?.renderer).toBe("graphExplorer");

    app.destroy();
    root.remove();
  });

  it("inserts a Leaflet node with active profile and configured defaults", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Leaflet Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);


    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (nextProject) => {
          savedProject = nextProject;
          return nextProject;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    const nodeSelect = view.getByLabelText("Special Nodes");

    expect(
      Array.from(nodeSelect.querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toContain("Leaflet Map");

    fireEvent.change(nodeSelect, { target: { value: "leaflet" } });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find(
          (node) => node.type === LEAFLET_NODE_TYPE_NAME
        )
      ).toBeTruthy();
    });

    const leafletNode = savedProject.document.content?.find(
      (node) => node.type === LEAFLET_NODE_TYPE_NAME
    );

    expect(root.querySelector("[data-lodeon-node='leaflet']")).toBeTruthy();
    expect(leafletNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(leafletNode?.attrs).not.toHaveProperty("resultMapping");
    expect(leafletNode?.attrs?.tileLayerId).toBe("openStreetMap");
    expect(leafletNode?.attrs?.viewConfig?.renderer).toBe("leaflet");

    app.destroy();
    root.remove();
  });

  it("uses nodes.leaflet.enabled as the Leaflet insertion gate", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Leaflet Disabled Project");
    const config = structuredClone(defaultConfig);
    config.nodes.leaflet.enabled = false;


    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (nextProject) => nextProject,
        listProjects: async () => [project]
      }
    });

    document.body.append(root);
    expect(
      Array.from(
        within(root).getByLabelText("Special Nodes").querySelectorAll("option")
      ).map((option) => option.textContent)
    ).not.toContain("Leaflet Map");

    app.destroy();
    root.remove();
  });

  it("inserts Verovio with the active profile and uses nodes.verovio.enabled as its gate", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Verovio Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (nextProject) => {
          savedProject = nextProject;
          return nextProject;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const select = within(root).getByLabelText("Special Nodes");
    expect(Array.from(select.querySelectorAll("option")).map((option) => option.textContent)).toContain(
      "Music Notation"
    );
    fireEvent.change(select, { target: { value: "verovio" } });
    await waitFor(() => expect(
      savedProject.document.content?.find((node) => node.type === VEROVIO_NODE_TYPE_NAME)
    ).toBeTruthy());
    const node = savedProject.document.content?.find(
      (entry) => entry.type === VEROVIO_NODE_TYPE_NAME
    );
    expect(root.querySelector("[data-lodeon-node='verovio']")).toBeTruthy();
    expect(node?.attrs).toMatchObject({
      kind: "verovio",
      knowledgeGraphProfileId: "culture-kg",
      sourceMode: "direct",
      viewMode: config.nodes.verovio.defaultView,
      documentLayout: config.nodes.verovio.defaultDocumentLayout,
      paginatedPageHeight: config.nodes.verovio.paginatedPageHeight,
      viewConfig: { renderer: "verovio" }
    });
    app.destroy();
    root.remove();

    const disabledRoot = document.createElement("div");
    config.nodes.verovio.enabled = false;
    const disabledApp = await renderApp(disabledRoot, config, {
      persistence: {
        loadProject: async () => createEmptyProject("Disabled Verovio"),
        saveProject: async (nextProject) => nextProject,
        listProjects: async () => []
      }
    });
    document.body.append(disabledRoot);
    expect(Array.from(
      within(disabledRoot).getByLabelText("Special Nodes").querySelectorAll("option")
    ).map((option) => option.textContent)).not.toContain("Music Notation");
    disabledApp.destroy();
    disabledRoot.remove();
  });

  it("inserts a Story Metadata node from the editor toolbar insert menu", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Metadata Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);


    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);

    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toContain("Story Metadata");

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "storyMetadata" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find((node) => node.type === "storyMetadataNode")
      ).toBeTruthy();
    });

    const metadataNode = savedProject.document.content?.find(
      (node) => node.type === "storyMetadataNode"
    );

    expect(root.querySelector("[data-lodeon-node='story-metadata']")).toBeTruthy();
    expect(metadataNode?.attrs?.kind).toBe("storyMetadata");
    expect(metadataNode?.attrs?.excludeFromRender).toBe(false);

    app.destroy();
    root.remove();
  });

  it("inserts a Query node from the editor toolbar insert menu", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Visual Node Project");
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "sparql" }
    });

    await waitFor(() => {
      expect(
        savedProject.document.content?.find(
          (node) => node.type === "sparnaturalNode"
        )
      ).toBeTruthy();
    });

    const sparnaturalNode = savedProject.document.content?.find(
      (node) => node.type === "sparnaturalNode"
    );

    expect(root.querySelector("[data-lodeon-node='sparnatural']")).toBeTruthy();
    expect(root.querySelector("[data-lodeon-node='sparnatural']")?.textContent).toContain(
      "Visual Query Builder"
    );
    expect(sparnaturalNode?.attrs?.kind).toBe("sparnatural");
    expect(sparnaturalNode?.attrs?.configId).toBe("culture-kg");
    expect(sparnaturalNode?.attrs?.knowledgeGraphProfileId).toBe("culture-kg");

    app.destroy();
    root.remove();
  });

  it("inserts a Visualization node and generates a CSV table preview", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Visualization Project");
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "visualization" }
    });

    await waitFor(() => {
      expect(root.querySelector("[data-lodeon-node='visualization']")).toBeTruthy();
    });

    expect(
      Array.from(
        view.getByLabelText("Visualization data source").querySelectorAll("option")
      ).map((option) => option.textContent)
    ).toEqual(["SPARQL", "CSV", "TSV", "URL"]);
    expect(view.queryByLabelText("URL data format")).toBeNull();
    expect(
      Array.from(
        view.getByLabelText("Visualization type").querySelectorAll("option")
      ).map((option) => option.textContent)
    ).toEqual([
      "Table",
      "Bar chart",
      "Line chart",
      "Pie chart",
      "Scatter plot",
      "Bubble chart",
      "Horizontal bar chart",
      "Grouped bar chart",
      "Stacked bar chart",
      "Area chart",
      "Histogram",
      "Box plot",
      "Heatmap",
      "Treemap",
      "Sunburst",
      "Sankey",
      "Timeline",
      "Map"
    ]);

    fireEvent.change(view.getByLabelText("Visualization data source"), {
      target: { value: "csv" }
    });
    setCodeEditorValue(root, "Visualization data source text", "label,value\nA,12\nB,8");
    view.getByRole("button", { name: "Run" }).click();

    await waitFor(() => {
      const visualizationNode = savedProject.document.content?.find(
        (node) => node.type === "visualizationNode"
      );

      expect(visualizationNode?.attrs?.data?.rows).toHaveLength(2);
      expect(visualizationNode?.attrs?.source).toBe("label,value\nA,12\nB,8");
      expect(visualizationNode?.attrs?.figure?.data?.[0]?.type).toBe("table");
      expect(visualizationNode?.attrs?.plotlyDataJson).toContain('"type": "table"');
      expect(visualizationNode?.attrs?.layoutJson).toContain('"autosize": true');
      expect(visualizationNode?.attrs?.configJson).toContain('"responsive": true');
      expect(visualizationNode?.attrs?.viewConfig?.renderer).toBe("plotly");
      expect(visualizationNode?.attrs?.viewConfig?.version).toBe(2);
    });

    expect(view.getByRole("button", { name: "Show Plotly Data JSON" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Show Plotly Layout JSON" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Show Plotly Config JSON" })).toBeTruthy();
    expect(view.getByLabelText("Plotly data JSON")).toBeTruthy();

    view.getByRole("button", { name: "Show Plotly Layout JSON" }).click();
    expect(view.getByLabelText("Plotly layout JSON")).toBeTruthy();

    view.getByRole("button", { name: "Show Plotly Config JSON" }).click();
    expect(view.getByLabelText("Plotly config JSON")).toBeTruthy();
    expect(view.getByText("2 rows, 2 columns")).toBeTruthy();
    expect(root.querySelector("[data-lodeon-node='visualization']")?.textContent).toContain(
      "Plotly"
    );

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    view.getByRole("button", { name: "Run" }).click();
    expect(confirmSpy).toHaveBeenCalledWith(
      "Generate will refresh the data and reset the Plotly JSON defaults for this chart. Continue?"
    );
    expect(view.getByText("Generation cancelled. Existing Plotly JSON was kept.")).toBeTruthy();
    confirmSpy.mockRestore();

    app.destroy();
    root.remove();
  });

  it("marks invalid Visualization Plotly JSON tabs", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Visualization Error Project");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "visualization" }
    });
    fireEvent.change(view.getByLabelText("Visualization data source"), {
      target: { value: "csv" }
    });
    setCodeEditorValue(root, "Visualization data source text", "label,value\nA,12\nB,8");
    view.getByRole("button", { name: "Run" }).click();

    await waitFor(() => {
      expect(view.getByText("2 rows, 2 columns")).toBeTruthy();
    });

    view.getByRole("button", { name: "Show Plotly Config JSON" }).click();
    fireEvent.input(view.getByLabelText("Plotly config JSON"), {
      target: { value: "{" }
    });

    await waitFor(() => {
      expect(
        view.getAllByText(/The visualization JSON is invalid/).length
      ).toBeGreaterThan(0);
    });
    expect(
      view.getByRole("button", { name: "Show Plotly Config JSON" }).dataset.invalid
    ).toBe("true");

    app.destroy();
    root.remove();
  });

  it("inserts image and table nodes from the editor toolbar", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Media Project");
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);

    view.getByRole("button", { name: "Insert image" }).click();
    fireEvent.input(root.querySelector<HTMLInputElement>("[data-image-url]")!, {
      target: { value: "https://example.org/image.jpg" }
    });
    fireEvent.submit(root.querySelector<HTMLFormElement>("[data-image-popover]")!);

    view.getByRole("button", { name: "Insert table" }).click();

    await waitFor(() => {
      const nodes = savedProject.document.content ?? [];
      expect(nodes.find((node) => node.type === "image")?.attrs?.src).toBe(
        "https://example.org/image.jpg"
      );
      expect(nodes.find((node) => node.type === "table")).toBeTruthy();
    });

    expect(root.querySelector(".story-editor img")?.getAttribute("src")).toBe(
      "https://example.org/image.jpg"
    );
    expect(root.querySelector(".story-editor table")).toBeTruthy();

    view.getByRole("button", { name: "Delete row" }).click();
    view.getByRole("button", { name: "Delete column" }).click();

    await waitFor(() => {
      expect(root.querySelectorAll(".story-editor table tr")).toHaveLength(2);
      expect(root.querySelectorAll(".story-editor table tr:first-child > *")).toHaveLength(2);
    });

    app.destroy();
    root.remove();
  });

  it("closes the link and image toolbar popovers consistently", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Popover Project");
    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      }
    });

    document.body.append(root);
    const view = within(root);
    const linkPopover = root.querySelector<HTMLElement>("[data-link-popover]")!;
    const imagePopover = root.querySelector<HTMLElement>("[data-image-popover]")!;

    view.getByRole("button", { name: "Link" }).click();
    expect(linkPopover.hidden).toBe(false);

    view.getByRole("button", { name: "Insert image" }).click();
    expect(linkPopover.hidden).toBe(true);
    expect(imagePopover.hidden).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(imagePopover.hidden).toBe(true);

    view.getByRole("button", { name: "Link" }).click();
    fireEvent.pointerDown(root.querySelector(".story-editor")!);
    expect(linkPopover.hidden).toBe(true);

    view.getByRole("button", { name: "Insert image" }).click();
    view.getByRole("button", { name: "Cancel" }).click();
    expect(imagePopover.hidden).toBe(true);

    app.destroy();
    root.remove();
  });

  it("opens an existing story link in a protected new tab", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Link Project");
    project.document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "LODEON documentation",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.org/documentation"
                  }
                }
              ]
            }
          ]
        }
      ]
    };
    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      }
    });

    document.body.append(root);
    const link = root.querySelector<HTMLAnchorElement>(".story-editor a")!;

    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer nofollow");
    expect(link.href).toBe("https://example.org/documentation");

    app.destroy();
    root.remove();
  });

  it("runs a SPARQL node query and persists normalized results", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Query Project");
    let savedProject = project;
    const config = structuredClone(defaultConfig);
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          head: { vars: ["item", "label"] },
          results: {
            bindings: [
              {
                item: {
                  type: "uri",
                  value: "https://example.org/item/1"
                },
                label: {
                  type: "literal",
                  value: "Item One"
                }
              }
            ]
          }
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/sparql-results+json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, config, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "sparql" }
    });
    const source = "\nSELECT ?item ?itemLabel WHERE {\n  ?item a ?type .\n} LIMIT 10\n";
    setCodeEditorValue(root, "Query source", source);
    view.getByRole("button", { name: "Run query" }).click();

    await waitFor(() => {
      expect(view.getByText("Item One")).toBeTruthy();
    });
    await waitFor(() => {
      const sparqlNode = savedProject.document.content?.find(
        (node) => node.type === "sparnaturalNode"
      );

      expect(sparqlNode?.attrs?.result?.status).toBe("success");
    });

    const sparqlNode = savedProject.document.content?.find(
      (node) => node.type === "sparnaturalNode"
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/sparql/culture-kg",
      expect.objectContaining({
        method: "POST",
        body: source
      })
    );
    expect(sparqlNode?.attrs?.result?.variables).toEqual(["item", "label"]);
    expect(sparqlNode?.attrs?.result?.rows[0].label.value).toBe("Item One");

    fireEvent.change(root.querySelector<HTMLSelectElement>(".ld-sparql-table-toolbar select")!, {
      target: { value: "50" }
    });

    await waitFor(() => {
      const updatedNode = savedProject.document.content?.find(
        (node) => node.type === "sparnaturalNode"
      );

      expect(updatedNode?.attrs?.resultPageSize).toBe(50);
    });

    const editedSource = "SELECT ?edited WHERE { ?edited ?p ?o } LIMIT 1";

    setCodeEditorValue(root, "Query source", editedSource);

    await waitFor(() => {
      const updatedNode = savedProject.document.content?.find(
        (node) => node.type === "sparnaturalNode"
      );

      expect(updatedNode?.attrs?.source).toBe(editedSource);
    });

    app.destroy();
    root.remove();
  });

  it("moves special nodes up and down without changing their attributes", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Reorder Nodes Project");
    project.document.content = [
      {
        type: "sparqlNode",
        attrs: {
          id: "first-query",
          kind: "sparql",
          title: "First query",
          source: "SELECT ?first WHERE { ?first ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          viewConfig: {},
          collapsed: false
        }
      },
      {
        type: "sparqlNode",
        attrs: {
          id: "second-query",
          kind: "sparql",
          title: "Second query",
          source: "SELECT ?second WHERE { ?second ?p ?o }",
          knowledgeGraphProfileId: "secondary-kg",
          result: null,
          viewConfig: {},
          collapsed: false
        }
      }
    ];
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);

    view.getAllByRole("button", { name: "Move SPARQL node down" })[0].click();

    await waitFor(() => {
      expect(savedProject.document.content?.map((node) => node.attrs?.id)).toEqual([
        "second-query",
        "first-query"
      ]);
    });
    expect(savedProject.document.content?.[1]?.attrs).toMatchObject({
      id: "first-query",
      source: "SELECT ?first WHERE { ?first ?p ?o }",
      knowledgeGraphProfileId: "culture-kg"
    });

    view.getAllByRole("button", { name: "Move SPARQL node up" })[1].click();

    await waitFor(() => {
      expect(savedProject.document.content?.map((node) => node.attrs?.id)).toEqual([
        "first-query",
        "second-query"
      ]);
    });
    expect(savedProject.document.content?.[0]?.attrs).toMatchObject({
      id: "first-query",
      source: "SELECT ?first WHERE { ?first ?p ?o }",
      knowledgeGraphProfileId: "culture-kg"
    });

    app.destroy();
    root.remove();
  });

  it("copies special nodes directly below the original with all attributes", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Copy Nodes Project");
    const attrs = {
      id: "copy-query",
      kind: "sparql",
      title: "Copy query",
      source: "SELECT ?copy WHERE { ?copy ?p ?o }",
      knowledgeGraphProfileId: "secondary-kg",
      result: null,
      resultPageSize: 50,
      viewConfig: { renderer: "shmarql" },
      collapsed: false,
      excludeFromRender: true
    };

    project.document.content = [
      {
        type: "sparqlNode",
        attrs
      }
    ];
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);

    view.getByRole("button", { name: "Copy SPARQL node" }).click();

    await waitFor(() => {
      expect(savedProject.document.content?.map((node) => node.type)).toEqual([
        "sparqlNode",
        "sparqlNode"
      ]);
    });
    expect(savedProject.document.content?.[0]?.attrs).toEqual(attrs);
    expect(savedProject.document.content?.[1]?.attrs).toEqual(attrs);

    app.destroy();
    root.remove();
  });

  it("toggles special node render visibility in the editor", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Hide Nodes Project");
    project.document.content = [
      {
        type: "sparqlNode",
        attrs: {
          id: "hide-query",
          kind: "sparql",
          title: "Hide query",
          source: "SELECT ?hidden WHERE { ?hidden ?p ?o }",
          knowledgeGraphProfileId: "culture-kg",
          result: null,
          resultPageSize: 10,
          viewConfig: {},
          collapsed: false,
          excludeFromRender: false
        }
      }
    ];
    let savedProject = project;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => {
          savedProject = project;
          return project;
        },
        listProjects: async () => [project]
      },
      autosaveDelayMs: 1
    });
    document.body.append(root);
    const view = within(root);
    const node = root.querySelector<HTMLElement>("[data-lodeon-node='sparql']");

    view.getByRole("button", {
      name: "Exclude SPARQL node from rendered output"
    }).click();

    await waitFor(() => {
      expect(savedProject.document.content?.[0]?.attrs?.excludeFromRender).toBe(
        true
      );
    });
    expect(node?.dataset.excludedFromRender).toBe("true");
    expect(
      view.getByRole("button", {
        name: "Include SPARQL node in rendered output"
      })
    ).toBeTruthy();

    view.getByRole("button", {
      name: "Include SPARQL node in rendered output"
    }).click();

    await waitFor(() => {
      expect(savedProject.document.content?.[0]?.attrs?.excludeFromRender).toBe(
        false
      );
    });
    expect(node?.dataset.excludedFromRender).toBe("false");

    app.destroy();
    root.remove();
  });

});
