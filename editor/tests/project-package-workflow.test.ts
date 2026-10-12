import JSZip from "jszip";
import { fireEvent, waitFor } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { createLocalization } from "@lodeon/localization/runtime";
import {
  createProjectPackageWorkflow,
  type ProjectPackageWorkflowOptions
} from "@lodeon/project/package/workflow";
import { createEmptyProject } from "@lodeon/project/factory";
import { type LodeonProject } from "@lodeon/project/contracts";
import { parseProject, readFileArrayBuffer } from "@lodeon/project/package/parsing";
import { serializeProject, serializeProjectZip } from "@lodeon/project/package/serialization";
import { defaultConfig } from "./fixtures/config";

function createRoot(): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = `
    <input type="file" data-project-import>
    <section data-package-status hidden>
      <p data-package-status-message></p>
      <button data-package-status-close></button>
    </section>
  `;
  return root;
}

function createWorkflowOptions(
  root: HTMLElement,
  project: LodeonProject,
  overrides: Partial<ProjectPackageWorkflowOptions> = {}
): ProjectPackageWorkflowOptions {
  return {
    root,
    config: defaultConfig,
    i18n: createLocalization(defaultConfig),
    getProject: () => project,
    isReady: () => true,
    flushProject: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn(async (savedProject: LodeonProject) => savedProject),
    activateProject: vi.fn().mockResolvedValue(undefined),
    renderError: (_error, fallbackCode) => fallbackCode,
    loadAssetFiles: vi.fn().mockResolvedValue([]),
    saveAssetFiles: vi.fn().mockResolvedValue(undefined),
    downloadBlob: vi.fn(),
    ...overrides
  };
}

describe("project package workflow", () => {
  it("exports a canonical ZIP after flushing pending edits", async () => {
    const root = createRoot();
    const project = createEmptyProject("Private Research");
    const downloadBlob = vi.fn();
    const flushProject = vi.fn().mockResolvedValue(undefined);
    const workflow = createProjectPackageWorkflow(
      createWorkflowOptions(root, project, { downloadBlob, flushProject })
    );

    await workflow.exportProject();

    expect(flushProject).toHaveBeenCalledOnce();
    expect(downloadBlob).toHaveBeenCalledOnce();
    expect(downloadBlob.mock.calls[0]?.[1]).toBe("private-research.lodeon.zip");
    const blob = downloadBlob.mock.calls[0]?.[0] as Blob;
    const zip = await JSZip.loadAsync(await readFileArrayBuffer(blob));
    const exportedProject = parseProject(
      (await zip.file("project.lodeon.json")?.async("string")) ?? ""
    );

    expect(exportedProject.canonical).toBe("prosemirror");
    expect(exportedProject.title).toBe("Private Research");
    expect(await zip.file("story.md")?.async("string")).toContain("Private Research");
    expect(Object.keys(zip.files).some((name) => name.startsWith("chats/"))).toBe(false);
  });

  it("persists and activates an imported project through the injected boundary", async () => {
    const root = createRoot();
    const currentProject = createEmptyProject("Current");
    const importedProject = createEmptyProject("Imported");
    const flushProject = vi.fn().mockResolvedValue(undefined);
    const saveProject = vi.fn(async (project: LodeonProject) => project);
    const activateProject = vi.fn().mockResolvedValue(undefined);
    const saveAssetFiles = vi.fn().mockResolvedValue(undefined);
    const workflow = createProjectPackageWorkflow(
      createWorkflowOptions(root, currentProject, {
        flushProject,
        saveProject,
        activateProject,
        saveAssetFiles,
        now: () => "2026-08-16T09:00:00.000Z"
      })
    );
    const file = new File(
      [await serializeProjectZip(importedProject, "")],
      "imported.lodeon.zip",
      { type: "application/zip" }
    );

    await workflow.importProject(file);

    expect(flushProject).toHaveBeenCalledOnce();
    expect(saveProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: importedProject.id, title: "Imported" })
    );
    expect(saveAssetFiles).toHaveBeenCalledWith([]);
    expect(activateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: importedProject.id })
    );
    expect(root.querySelector("[data-package-status]")?.dataset.state).toBe(
      "success"
    );
  });

  it("does not replace the active project when package parsing fails", async () => {
    const root = createRoot();
    const project = createEmptyProject("Current");
    const saveProject = vi.fn();
    const activateProject = vi.fn();
    const workflow = createProjectPackageWorkflow(
      createWorkflowOptions(root, project, { saveProject, activateProject })
    );

    await workflow.importProject(
      new File(["{}"], "broken.lodeon.json", { type: "application/json" })
    );

    expect(saveProject).not.toHaveBeenCalled();
    expect(activateProject).not.toHaveBeenCalled();
    expect(root.querySelector("[data-package-status]")?.dataset.state).toBe(
      "error"
    );
    expect(root.querySelector("[data-package-status-message]")?.textContent).toBe(
      "project.import.invalid_package"
    );
  });
});
