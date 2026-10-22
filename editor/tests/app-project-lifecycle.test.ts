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

  it("flushes pending autosave changes from the editor toolbar save button", async () => {
    const root = document.createElement("div");
    const saveProject = vi.fn(async (project) => project);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => null,
        saveProject,
        listProjects: async () => []
      },
      autosaveDelayMs: 10000
    });
    document.body.append(root);
    const view = within(root);

    fireEvent.change(view.getByLabelText("Special Nodes"), {
      target: { value: "sparql" }
    });

    await waitFor(() => {
      expect(root.querySelector(".ld-sparnatural-node")).toBeTruthy();
    });

    fireEvent.click(view.getByRole("button", { name: "Save now" }));

    await waitFor(() => {
      expect(saveProject).toHaveBeenCalledTimes(1);
    });

    app.destroy();
    root.remove();
  });

  it("starts with a new project and shows a configured error when local project loading fails", async () => {
    const root = document.createElement("div");
    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => {
          throw new LodeonClientError("persistence.project_load_failed", {
            externalError: "blocked"
          });
        },
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });
    document.body.append(root);

    expect(
      (within(root).getByLabelText("Project title") as HTMLInputElement).value
    ).toBe("Untitled Data Story");
    await waitFor(() => {
      expect(root.textContent).toContain("The local project could not be loaded");
      expect(root.textContent).toContain(
        "Local project loading failed with the following error: blocked"
      );
    });

    app.destroy();
    root.remove();
  });

  it("restores a persisted project", async () => {
    const root = document.createElement("div");
    const persistedProject = createEmptyProject("Persisted Project");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => persistedProject,
        saveProject: async (project) => project,
        listProjects: async () => [persistedProject]
      }
    });

    document.body.append(root);

    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Persisted Project"
    );

    app.destroy();
    root.remove();
  });

  it("falls back to a new project if loading local persistence fails", async () => {
    const root = document.createElement("div");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => {
          throw new Error("IndexedDB unavailable");
        },
        saveProject: async (project) => project,
        listProjects: async () => []
      }
    });

    document.body.append(root);

    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Untitled Data Story"
    );

    app.destroy();
    root.remove();
  });

  it("creates a new active project from the toolbar", async () => {
    const root = document.createElement("div");
    const initialProject = createEmptyProject("Initial Project");
    const createdProject = createEmptyProject("Created Project");
    let createProjectCalled = false;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => initialProject,
        saveProject: async (project) => project,
        listProjects: async () => [initialProject, createdProject],
        createProject: async () => {
          createProjectCalled = true;
          return createdProject;
        }
      },
      autosaveDelayMs: 1
    });

    document.body.append(root);
    const view = within(root);
    view.getByRole("button", { name: "New" }).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createProjectCalled).toBe(true);
    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Created Project"
    );

    app.destroy();
    root.remove();
  });

  it("opens a selected project from the project picker", async () => {
    const root = document.createElement("div");
    const firstProject = createEmptyProject("First Project");
    const secondProject = createEmptyProject("Second Project");
    let openedProjectId: string | undefined;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => firstProject,
        saveProject: async (project) => project,
        listProjects: async () => [firstProject, secondProject],
        setActiveProject: async (projectId) => {
          openedProjectId = projectId;
          return secondProject;
        }
      }
    });

    document.body.append(root);
    const view = within(root);
    fireEvent.change(view.getByLabelText("Data story"), {
      target: { value: secondProject.id }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(openedProjectId).toBe(secondProject.id);
    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Second Project"
    );

    app.destroy();
    root.remove();
  });

  it("deletes the current project and activates the next project", async () => {
    const root = document.createElement("div");
    const firstProject = createEmptyProject("First Project");
    const secondProject = createEmptyProject("Second Project");
    let deletedProjectId: string | undefined;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => firstProject,
        saveProject: async (project) => project,
        listProjects: async () => [secondProject],
        deleteProject: async (projectId) => {
          deletedProjectId = projectId;
          return secondProject;
        }
      }
    });

    document.body.append(root);
    const view = within(root);
    view.getByRole("button", { name: "Delete current project" }).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(deletedProjectId).toBe(firstProject.id);
    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Second Project"
    );

    app.destroy();
    root.remove();
  });

  it("cleans up unused local assets from the metadata panel", async () => {
    const root = document.createElement("div");
    vi.stubGlobal("indexedDB", new IDBFactory());
    const project = createEmptyProject("Asset Cleanup Project");
    let savedProject = project;

    project.assets = [
      {
        assetId: "used-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/used-asset.jpg",
        fileName: "used-asset.jpg",
        originalName: "used.jpg",
        size: 10,
        createdAt: "2026-07-09T00:00:00Z"
      },
      {
        assetId: "unused-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/unused-asset.jpg",
        fileName: "unused-asset.jpg",
        originalName: "unused.jpg",
        size: 10,
        createdAt: "2026-07-09T00:00:00Z"
      }
    ];
    project.document.content?.push(
      createMediaAssetNodeContent({
        assetId: "used-asset",
        kind: "image",
        title: "Used asset"
      })
    );
    await saveProjectAssetBlob({
      projectId: project.id,
      assetId: "used-asset",
      blob: new NodeBlob(["used"], { type: "image/jpeg" }) as unknown as Blob,
      mimeType: "image/jpeg",
      size: 4,
      updatedAt: "2026-07-09T00:00:00Z"
    });
    await saveProjectAssetBlob({
      projectId: project.id,
      assetId: "unused-asset",
      blob: new NodeBlob(["unused"], { type: "image/jpeg" }) as unknown as Blob,
      mimeType: "image/jpeg",
      size: 6,
      updatedAt: "2026-07-09T00:00:00Z"
    });

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

    expect(view.getByText("Unused")).toBeTruthy();
    view.getByRole("button", { name: "Clean Up Unused Assets" }).click();

    await waitFor(() => {
      expect(savedProject.assets.map((asset) => asset.assetId)).toEqual([
        "used-asset"
      ]);
    });
    expect(root.querySelector("[data-project-assets]")?.textContent).toContain(
      "Unused0"
    );
    expect(await getProjectAssetBlob(project.id, "used-asset")).toBeTruthy();
    expect(await getProjectAssetBlob(project.id, "unused-asset")).toBeNull();

    app.destroy();
    root.remove();
  });

  it("stores editor zoom outside the project document", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Zoom Project");

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async (project) => project,
        listProjects: async () => [project]
      }
    });

    document.body.append(root);
    const view = within(root);
    view.getByRole("button", { name: "Zoom in" }).click();

    expect(localStorage.getItem("lodeon.editorZoom")).toBe("1.05");
    expect(
      root.querySelector<HTMLElement>(".ld-editor-host")?.style.getPropertyValue(
        "--lodeon-editor-zoom"
      )
    ).toBe("1.05");

    app.destroy();
    root.remove();
  });

});
