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
import JSZip from "jszip";
import {
  MockRendererXMLHttpRequest,
  resetAppTestState,
  setCodeEditorValue,
  stubRendererXmlHttpRequest
} from "./fixtures/app-harness";

describe("LODEON app shell", () => {
  afterEach(resetAppTestState);

  it("imports a Project Package v1 file", async () => {
    const root = document.createElement("div");
    const initialProject = createEmptyProject("Initial Project");
    const importedProject = createEmptyProject("Imported Project");
    let savedTitle: string | undefined;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => initialProject,
        saveProject: async (project) => {
          savedTitle = project.title;
          return project;
        },
        listProjects: async () => [importedProject]
      }
    });

    document.body.append(root);
    const view = within(root);
    const file = new File([await serializeProjectZip(importedProject, "")], "story.lodeon.zip", {
      type: "application/zip"
    });
    fireEvent.change(view.getByLabelText("Import project file"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(savedTitle).toBe("Imported Project");
      expect(root.querySelector(".story-editor")?.textContent).toContain(
        "Imported Project"
      );
      expect(view.getByText("Imported Imported Project")).toBeTruthy();
      expect(
        root.querySelector("[data-package-status]")?.hasAttribute("hidden")
      ).toBe(false);
    });

    view.getByRole("button", { name: "Dismiss import/export status" }).click();
    expect(root.querySelector("[data-package-status]")?.hasAttribute("hidden")).toBe(
      true
    );

    app.destroy();
    root.remove();
  });

  it("imports a ZIP Project Package v1 file", async () => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    const root = document.createElement("div");
    const initialProject = createEmptyProject("Initial Project");
    const importedProject = createEmptyProject("Imported ZIP Project");
    let savedTitle: string | undefined;

    importedProject.assets = [
      {
        assetId: "imported-asset",
        kind: "image",
        mimeType: "image/jpeg",
        path: "assets/images/imported-asset.jpg",
        fileName: "imported-asset.jpg",
        originalName: "imported.jpg",
        size: 5,
        title: "Imported asset",
        alt: "Imported asset",
        createdAt: new Date().toISOString()
      }
    ];
    importedProject.document.content?.push(
      createMediaAssetNodeContent({
        assetId: "imported-asset",
        kind: "image",
        title: "Imported asset"
      })
    );

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => initialProject,
        saveProject: async (project) => {
          savedTitle = project.title;
          return project;
        },
        listProjects: async () => [importedProject]
      }
    });

    document.body.append(root);
    const view = within(root);
    const zip = await serializeProjectZip(importedProject, "# Imported ZIP Project\n", [
      {
        asset: importedProject.assets[0]!,
        blob: new Blob(["image"], { type: "image/jpeg" })
      }
    ]);
    const file = new File([zip], "story.lodeon.zip", {
      type: "application/zip"
    });
    fireEvent.change(view.getByLabelText("Import project file"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(savedTitle).toBe("Imported ZIP Project");
      expect(root.querySelector(".story-editor")?.textContent).toContain(
        "Imported ZIP Project"
      );
      expect(view.getByText("Imported Imported ZIP Project")).toBeTruthy();
    });

    const importedAssetBlob = await getProjectAssetBlob(
      importedProject.id,
      "imported-asset"
    );

    expect(importedAssetBlob?.mimeType).toBe("image/jpeg");
    expect(importedAssetBlob?.size).toBe(5);

    app.destroy();
    root.remove();
  });

  it("shows import errors without replacing the active project", async () => {
    const root = document.createElement("div");
    const initialProject = createEmptyProject("Initial Project");
    let savedProject: string | undefined;

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => initialProject,
        saveProject: async (project) => {
          savedProject = project.title;
          return project;
        },
        listProjects: async () => [initialProject]
      }
    });

    document.body.append(root);
    const view = within(root);
    const file = new File(["{}"], "broken.lodeon.json", {
      type: "application/json"
    });

    fireEvent.change(view.getByLabelText("Import project file"), {
      target: { files: [file] }
    });

    await waitFor(() => {
      expect(
        view.getByText(
          "Unsupported project package format The selected file is not a supported LODEON project package. Project package format validation failed with the following error: unsupported_file_type"
        )
      ).toBeTruthy();
    });

    expect(savedProject).toBeUndefined();
    expect(root.querySelector(".story-editor")?.textContent).toContain(
      "Initial Project"
    );

    app.destroy();
    root.remove();
  });

  it("exports the active project as a Project Package v1 file", async () => {
    const root = document.createElement("div");
    const project = createEmptyProject("Exported Project");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:lodeon-export"
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: () => undefined
    });
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:lodeon-export");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    const app = await renderApp(root, defaultConfig, {
      persistence: {
        loadProject: async () => project,
        saveProject: async () => project,
        listProjects: async () => [project]
      }
    });

    document.body.append(root);
    const view = within(root);
    view.getByRole("button", { name: "Export" }).click();
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:lodeon-export");
    expect(view.getByText("Exported exported-project.lodeon.zip")).toBeTruthy();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);

    app.destroy();
    root.remove();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    click.mockRestore();
  });
});
