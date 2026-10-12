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

  it("updates the slug from the title until the slug is edited manually", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Initial Project");
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
    const title = view.getByLabelText("Project title");
    const slug = view.getByLabelText("Story slug") as HTMLInputElement;

    fireEvent.input(title, { target: { value: "New " } });

    expect((title as HTMLInputElement).value).toBe("New ");
    expect(slug.value).toBe("new");

    fireEvent.input(title, { target: { value: "New Story Title" } });

    expect(slug.value).toBe("new-story-title");

    fireEvent.input(slug, { target: { value: "E6263" } });
    fireEvent.input(title, { target: { value: "Another Title" } });

    expect(slug.value).toBe("E6263");

    await waitFor(() => {
      expect(savedProject.slug).toBe("E6263");
    });

    app.destroy();
    root.remove();
  });

  it("persists story metadata from the sidebar", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Authored Project");
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
    view.getByRole("button", { name: "Add Contributor" }).click();
    fireEvent.input(view.getByLabelText("Contributor 1 name"), {
      target: { value: "Ada Author" }
    });
    fireEvent.change(view.getByLabelText("Contributor 1 role"), {
      target: { value: "editor" }
    });
    fireEvent.input(view.getByLabelText("Contributor 1 affiliation"), {
      target: { value: "Example Institute" }
    });
    view.getByRole("button", { name: "Add Identifier" }).click();
    fireEvent.input(view.getByLabelText("Contributor 1 identifier 1 type"), {
      target: { value: "ORCID" }
    });
    fireEvent.input(view.getByLabelText("Contributor 1 identifier 1 value"), {
      target: { value: "0000-0002-1825-0097" }
    });
    fireEvent.input(view.getByLabelText("Contributor 1 identifier 1 URL"), {
      target: { value: "https://orcid.org/0000-0002-1825-0097" }
    });
    view.getByRole("button", { name: "Toggle contributor 1" }).click();
    expect(root.querySelector<HTMLElement>("[data-contributor-id]")?.dataset.collapsed).toBe(
      "true"
    );
    expect(localStorage.getItem("lodeon.metadata.cards.collapsed")).toContain(
      "contributor:"
    );
    expect(view.getByText("Ada Author")).toBeTruthy();
    view.getByRole("button", { name: "Toggle contributor 1" }).click();
    fireEvent.input(view.getByLabelText("Story description"), {
      target: { value: "A compact project abstract." }
    });
    fireEvent.input(view.getByLabelText("Story keywords"), {
      target: { value: "music, graph, music" }
    });
    fireEvent.input(view.getByLabelText("Story language"), {
      target: { value: "de" }
    });
    fireEvent.input(view.getByLabelText("Story license"), {
      target: { value: "CC BY 4.0" }
    });
    view.getByRole("button", { name: "Add PID" }).click();
    fireEvent.input(view.getByLabelText("Persistent identifier 1 type"), {
      target: { value: "DOI" }
    });
    fireEvent.input(view.getByLabelText("Persistent identifier 1 value"), {
      target: { value: "10.1234/lodeon.story" }
    });
    fireEvent.input(view.getByLabelText("Persistent identifier 1 URL"), {
      target: { value: "https://doi.org/10.1234/lodeon.story" }
    });
    view.getByRole("button", { name: "Toggle PID 1" }).click();
    expect(root.querySelector<HTMLElement>("[data-pid-id]")?.dataset.collapsed).toBe(
      "true"
    );
    expect(localStorage.getItem("lodeon.metadata.cards.collapsed")).toContain(
      "pid:"
    );
    expect(view.getByText("https://doi.org/10.1234/lodeon.story")).toBeTruthy();
    view.getByRole("button", { name: "Toggle PID 1" }).click();

    await waitFor(() => {
      expect(savedProject.metadata.contributors[0]?.name).toBe("Ada Author");
      expect(savedProject.metadata.contributors[0]?.role).toBe("editor");
      expect(savedProject.metadata.contributors[0]?.affiliation).toBe("Example Institute");
      expect(savedProject.metadata.contributors[0]?.identifiers[0]).toEqual(
        expect.objectContaining({
          type: "ORCID",
          value: "0000-0002-1825-0097",
          url: "https://orcid.org/0000-0002-1825-0097"
        })
      );
      expect(savedProject.metadata.description).toBe("A compact project abstract.");
      expect(savedProject.metadata.keywords).toEqual(["music", "graph"]);
      expect(savedProject.metadata.language).toBe("de");
      expect(savedProject.metadata.license).toBe("CC BY 4.0");
      expect(savedProject.metadata.persistentIdentifiers[0]).toEqual(
        expect.objectContaining({
          type: "DOI",
          value: "10.1234/lodeon.story",
          url: "https://doi.org/10.1234/lodeon.story"
        })
      );
    });

    app.destroy();
    root.remove();
  });

});
