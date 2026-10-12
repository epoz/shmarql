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

  it("renders the workbench title", async () => {
    const root = document.createElement("div");
    vi.stubGlobal("fetch", async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/auth/status")
            ? {
                authEnabled: false,
                authenticated: true,
                methods: { token: false, externalProviders: [] },
                capabilities: { publish: true }
              }
            : {}
        ),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);
    const view = within(root);

    // shmarql's page template provides the site header; the editor shows no LODEON logo.
    expect(root.querySelector(".ld-brand")).toBeNull();
    expect(view.getByRole("navigation", { name: "Primary actions" })).toBeTruthy();
    expect(view.getByRole("button", { name: "New" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Import" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(view.getByLabelText("Knowledge graph")).toBeTruthy();
    expect(view.getByText("Select")).toBeTruthy();
    expect(view.getByLabelText("Data story")).toBeTruthy();
    expect(view.getByRole("button", { name: "Delete current project" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Switch to night theme" })).toBeNull();
    expect(view.getByLabelText("Project title")).toBeTruthy();
    expect(view.getByText("Metadata")).toBeTruthy();
    expect(view.getByLabelText("Story slug")).toBeTruthy();
    expect(view.getByRole("button", { name: "Add Contributor" })).toBeTruthy();
    expect(view.getByLabelText("Story description")).toBeTruthy();
    expect(view.getByLabelText("Story keywords")).toBeTruthy();
    expect(view.getByLabelText("Story language")).toBeTruthy();
    expect(view.getByLabelText("Story license")).toBeTruthy();
    expect(view.getByRole("button", { name: "Add PID" })).toBeTruthy();
    expect(
      Array.from(
        root.querySelectorAll(
          ".ld-metadata-panel > .ld-field > span, .ld-metadata-panel > .ld-metadata-section > span, .ld-metadata-panel > .ld-metadata-section > .ld-metadata-section-header > span"
        )
      ).map((element) => element.textContent)
    ).toEqual([
      "Contributors",
      "Description",
      "Keywords",
      "Language",
      "License",
      "Persistent Identifiers",
      "Slug",
      "Publish Story ZIP",
      "Published story",
      "Local assets"
    ]);
    expect(view.getByText("not yet published")).toBeTruthy();
    expect(view.getByLabelText("Project metadata")).toBeTruthy();
    expect(root.querySelector<HTMLElement>("[data-sidebar]")?.dataset.collapsed).toBe(
      "true"
    );
    expect(view.getByRole("button", { name: "Open about LODEON" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Open help" })).toBeTruthy();
    expect(root.querySelector(".ld-topbar [data-theme-toggle]")).toBeNull();
    expect(view.getByLabelText("Resize metadata panel")).toBeTruthy();
    expect(view.queryByLabelText("Resize assistant panel")).toBeNull();
    expect(root.querySelector<HTMLButtonElement>("[data-auth-button]")?.hidden).toBe(
      true
    );
    expect(view.getByRole("button", { name: "Undo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Redo" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Underline" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Strikethrough" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Insert image" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Insert table" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Zoom out" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Reset zoom" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Zoom in" })).toBeTruthy();
    expect(view.getByLabelText("Block type")).toBeTruthy();
    expect(view.getByRole("button", { name: "Save now" })).toBeTruthy();
    expect(view.getByLabelText("Special Nodes")).toBeTruthy();
    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).toEqual([
      "Special Nodes",
      "Media Asset",
      "Embed Remote Content",
      "IIIF Object",
      "Graph Explorer",
      "Leaflet Map",
      "Music Notation",
      "SPARQL Query",
      "Plotly Visualization",
      "RAWGraphs Visualization",
      "Story Metadata"
    ]);
    expect(
      Array.from(view.getByLabelText("Special Nodes").querySelectorAll("option")).map(
        (option) => option.textContent
      )
    ).not.toContain("SPARQL");
    expect(root.querySelector("[data-autosave-status]")?.textContent).toBe("Saved");
    expect(root.querySelector(".ld-editor-toolbar [data-autosave-status]")).toBeTruthy();
    expect(root.querySelector(".ld-topbar [data-autosave-status]")).toBeNull();
    const toolbarGroups = Array.from(
      root.querySelectorAll<HTMLElement>(".ld-editor-toolbar > .button-group")
    );
    expect(
      toolbarGroups.at(-2)?.querySelector("select")?.getAttribute("aria-label")
    ).toBe("Special Blocks");
    expect(
      toolbarGroups.at(-1)?.querySelector("select")?.getAttribute("aria-label")
    ).toBe("Special Nodes");
    expect(
      root
        .querySelector(".ld-topbar nav > :last-child [data-markdown-modal-trigger='help']")
        ?.getAttribute("aria-label")
    ).toBe("Open help");
    expect(root.querySelector(".story-editor")).toBeTruthy();
    expect(root.querySelector("[data-assistant-panel]")).toBeNull();

    app.destroy();
    root.remove();
  });

  it("persists the metadata panel collapsed state", async () => {
    const firstRoot = document.createElement("div");
    const firstApp = await renderApp(firstRoot, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(firstRoot);

    expect(
      firstRoot.querySelector<HTMLElement>("[data-sidebar]")?.dataset.collapsed
    ).toBe("true");
    within(firstRoot).getByRole("button", { name: "Expand metadata panel" }).click();
    expect(
      firstRoot.querySelector<HTMLElement>("[data-sidebar]")?.dataset.collapsed
    ).toBe("false");
    expect(localStorage.getItem("lodeon.metadata.collapsed")).toBe("false");
    firstApp.destroy();
    firstRoot.remove();

    const secondRoot = document.createElement("div");
    const secondApp = await renderApp(secondRoot, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(secondRoot);

    expect(
      secondRoot.querySelector<HTMLElement>("[data-sidebar]")?.dataset.collapsed
    ).toBe("false");
    within(secondRoot).getByRole("button", { name: "Collapse metadata panel" }).click();
    expect(localStorage.getItem("lodeon.metadata.collapsed")).toBe("true");

    secondApp.destroy();
    secondRoot.remove();
  });

  it("loads About and Help modal content from public Markdown files", async () => {
    const root = document.createElement("div");
    const fetcher = vi.fn(async (url: string) =>
      new Response(
        url.endsWith("/about.md")
          ? "# About LODEON\n\nLocal-first authoring."
          : "# LODEON Help\n\n- Write tmp\n- Publish Markdown",
        {
          status: 200,
          headers: { "content-type": "text/markdown" }
        }
      )
    );
    vi.stubGlobal("fetch", fetcher);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);
    const view = within(root);

    view.getByRole("button", { name: "Open about LODEON" }).click();

    await waitFor(() => {
      expect(root.querySelector(".ld-modal-badge")).toBeTruthy();
      expect(root.querySelector<HTMLImageElement>(".ld-modal-badge")?.src).toContain(
        "/lodeon/assets/lodeon-badge.png"
      );
      expect(view.getByRole("heading", { name: "About LODEON" })).toBeTruthy();
      expect(view.getByText("Local-first authoring.")).toBeTruthy();
    });

    view.getByRole("button", { name: "Close modal" }).click();
    view.getByRole("button", { name: "Open help" }).click();

    await waitFor(() => {
      expect(view.getByRole("heading", { name: "LODEON Help" })).toBeTruthy();
      expect(view.getByText("Write tmp")).toBeTruthy();
    });

    expect(fetcher).toHaveBeenCalledWith("/lodeon/content/about.md");
    expect(fetcher).toHaveBeenCalledWith("/lodeon/content/help.md");

    app.destroy();
    root.remove();
  });

  it("limits semantic block formats to configured block types", async () => {
    const root = document.createElement("div");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);
    const view = within(root);
    const blockStyleSelect = view.getByLabelText(
      "Block format"
    ) as HTMLSelectElement;
    const introOption = Array.from(blockStyleSelect.options).find(
      (option) => option.value === "intro-paragraph"
    );
    const overlineOption = Array.from(blockStyleSelect.options).find(
      (option) => option.value === "story-overline"
    );

    await waitFor(() => {
      expect(introOption?.disabled).toBe(true);
      expect(overlineOption?.disabled).toBe(false);
    });

    fireEvent.change(blockStyleSelect, {
      target: { value: "intro-paragraph" }
    });

    await waitFor(() => {
      expect(root.innerHTML).not.toContain('data-lodeon-format-label="Intro"');
      expect(blockStyleSelect.value).toBe("");
    });

    fireEvent.change(blockStyleSelect, {
      target: { value: "story-overline" }
    });

    await waitFor(() => {
      expect(root.innerHTML).toContain('data-lodeon-format-label="Overline"');
      expect(blockStyleSelect.value).toBe("story-overline");
    });

    app.destroy();
    root.remove();
  });

  it("inserts configured semantic containers from the toolbar", async () => {
    const root = document.createElement("div");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);
    const view = within(root);
    const containerSelect = view.getByLabelText("Special Blocks") as HTMLSelectElement;

    expect(
      Array.from(containerSelect.options).map((option) => option.textContent)
    ).toEqual(["Special Blocks", "Tile", "Details"]);

    fireEvent.change(containerSelect, {
      target: { value: "details-plain" }
    });

    await waitFor(() => {
      expect(root.innerHTML).toContain(
        'data-lodeon-semantic-container="details-plain"'
      );
      expect(root.innerHTML).toContain('data-lodeon-container-label="Details"');
      expect(root.innerHTML).toContain('data-lodeon-container-summary="Details"');
    });

    fireEvent.input(view.getByLabelText("Summary"), {
      target: { value: "Updated details" }
    });
    fireEvent.click(view.getByLabelText("Open by default"));

    await waitFor(() => {
      expect(root.innerHTML).toContain(
        'data-lodeon-container-summary="Updated details"'
      );
      expect(root.innerHTML).toContain('data-lodeon-container-open="true"');
    });

    const semanticContainer = root.querySelector<HTMLElement>(
      ".ld-semantic-container"
    );
    expect(semanticContainer).toBeTruthy();
    const semanticContainerView = within(semanticContainer!);
    const wrapBlockTitle = semanticContainerView.getByLabelText(
      "Special block title"
    ) as HTMLInputElement;

    expect(wrapBlockTitle.value).toBe("Details");

    fireEvent.input(wrapBlockTitle, {
      target: { value: "Custom details title" }
    });

    await waitFor(() => {
      expect(semanticContainer?.dataset.lodeonContainerTitle).toBe(
        "Custom details title"
      );
    });

    fireEvent.click(
      semanticContainerView.getByRole("button", { name: /Collapse/ })
    );

    await waitFor(() => {
      expect(semanticContainer?.dataset.collapsed).toBe("true");
    });

    fireEvent.click(
      semanticContainerView.getByRole("button", { name: /Exclude/ })
    );

    await waitFor(() => {
      expect(semanticContainer?.dataset.excludedFromRender).toBe("true");
    });

    expect(containerSelect.value).toBe("");

    app.destroy();
    root.remove();
  });

  it("keeps focused semantic container settings fields stable while typing", async () => {
    const root = document.createElement("div");
    const app = await renderApp(root, defaultConfig);
    document.body.append(root);
    const view = within(root);
    const containerSelect = view.getByLabelText("Special Blocks") as HTMLSelectElement;

    fireEvent.change(containerSelect, {
      target: { value: "details-plain" }
    });

    await waitFor(() => {
      expect(root.innerHTML).toContain(
        'data-lodeon-semantic-container="details-plain"'
      );
    });

    const summaryInput = view.getByLabelText("Summary") as HTMLInputElement;

    summaryInput.focus();
    fireEvent.input(summaryInput, {
      target: { value: "Updated while focused" }
    });

    await waitFor(() => {
      const semanticContainer = root.querySelector<HTMLElement>(
        ".ld-semantic-container"
      );

      expect(semanticContainer?.dataset.lodeonContainerSummary).toBe(
        "Updated while focused"
      );
    });

    expect(document.activeElement).toBe(summaryInput);
    expect(view.getByLabelText("Summary")).toBe(summaryInput);

    app.destroy();
    root.remove();
  });

  it("does not render empty semantic container settings controls", async () => {
    const root = document.createElement("div");
    const app = await renderApp(root, defaultConfig);
    document.body.append(root);
    const view = within(root);
    const containerSelect = view.getByLabelText("Special Blocks") as HTMLSelectElement;

    fireEvent.change(containerSelect, {
      target: { value: "metadata-tile" }
    });

    await waitFor(() => {
      expect(root.innerHTML).toContain(
        'data-lodeon-semantic-container="metadata-tile"'
      );
    });

    const semanticContainer = root.querySelector<HTMLElement>(
      ".ld-semantic-container"
    );
    const settings = semanticContainer?.querySelector<HTMLElement>(
      ".ld-semantic-container-settings"
    );

    expect(settings).toBeTruthy();
    expect(settings?.hidden).toBe(true);

    app.destroy();
    root.remove();
  });

  it("always uses the light theme of the shmarql site", async () => {
    localStorage.setItem("lodeon.theme", "night");
    const root = document.createElement("div");
    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });

    expect(document.documentElement.dataset.theme).toBe("day");

    app.destroy();
  });

});
