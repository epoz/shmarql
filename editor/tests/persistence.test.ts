import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { createProjectAutosave } from "@lodeon/persistence/autosave";
import {
  createProject,
  deleteProject,
  getProjectAssetBlob,
  listProjects,
  listProjectAssetBlobs,
  loadActiveProject,
  saveProject,
  saveProjectAssetBlob,
  saveProjectAssetBlobs,
  setActiveProject
} from "@lodeon/persistence/project-store";
import { createEmptyProject } from "@lodeon/project/factory";
import { LodeonClientError } from "@lodeon/errors/client-error";

describe("local project store", () => {
  it("uses a stable error code when IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);

    await expect(loadActiveProject()).rejects.toMatchObject({
      code: "persistence.indexeddb_unavailable"
    } satisfies Partial<LodeonClientError>);

    vi.unstubAllGlobals();
  });

  it("tracks multiple projects and restores the active one", async () => {
    const factory = new IDBFactory();
    const firstProject = await createProject("First Project", {
      indexedDBFactory: factory
    });
    const secondProject = await createProject("Second Project", {
      indexedDBFactory: factory
    });

    const projects = await listProjects({ indexedDBFactory: factory });
    const activeProject = await loadActiveProject({ indexedDBFactory: factory });

    expect(projects.map((project) => project.title).sort()).toEqual([
      "First Project",
      "Second Project"
    ]);
    expect(activeProject?.id).toBe(secondProject.id);
    expect(activeProject?.id).not.toBe(firstProject.id);
  });

  it("updates the active project when an existing project is saved", async () => {
    const factory = new IDBFactory();
    const firstProject = await createProject("First Project", {
      indexedDBFactory: factory
    });
    await createProject("Second Project", { indexedDBFactory: factory });

    await saveProject(
      { ...firstProject, title: "First Project Updated" },
      { indexedDBFactory: factory }
    );

    const activeProject = await loadActiveProject({ indexedDBFactory: factory });

    expect(activeProject?.id).toBe(firstProject.id);
    expect(activeProject?.title).toBe("First Project Updated");
  });

  it("opens a project by setting it active", async () => {
    const factory = new IDBFactory();
    const firstProject = await createProject("First Project", {
      indexedDBFactory: factory
    });
    await createProject("Second Project", { indexedDBFactory: factory });

    const activeProject = await setActiveProject(firstProject.id, {
      indexedDBFactory: factory
    });

    expect(activeProject?.id).toBe(firstProject.id);
    expect((await loadActiveProject({ indexedDBFactory: factory }))?.id).toBe(
      firstProject.id
    );
  });

  it("deletes the active project and selects another project", async () => {
    const factory = new IDBFactory();
    const firstProject = await createProject("First Project", {
      indexedDBFactory: factory
    });
    const secondProject = await createProject("Second Project", {
      indexedDBFactory: factory
    });

    const nextProject = await deleteProject(secondProject.id, {
      indexedDBFactory: factory
    });

    expect(nextProject?.id).toBe(firstProject.id);
    expect((await listProjects({ indexedDBFactory: factory })).length).toBe(1);
  });

  it("stores project asset blobs separately and removes them with their project", async () => {
    const factory = new IDBFactory();
    const project = await createProject("Asset Project", {
      indexedDBFactory: factory
    });

    await saveProjectAssetBlob(
      {
        projectId: project.id,
        assetId: "asset-one",
        blob: new Blob(["one"], { type: "image/jpeg" }),
        mimeType: "image/jpeg",
        size: 3,
        updatedAt: "2026-07-09T00:00:00Z"
      },
      { indexedDBFactory: factory }
    );
    await saveProjectAssetBlobs(
      [
        {
          projectId: project.id,
          assetId: "asset-two",
          blob: new Blob(["two"], { type: "video/mp4" }),
          mimeType: "video/mp4",
          size: 3,
          updatedAt: "2026-07-09T00:00:00Z"
        }
      ],
      { indexedDBFactory: factory }
    );

    const asset = await getProjectAssetBlob(project.id, "asset-one", {
      indexedDBFactory: factory
    });
    const assets = await listProjectAssetBlobs(project.id, {
      indexedDBFactory: factory
    });

    expect(asset?.assetId).toBe("asset-one");
    expect(asset?.mimeType).toBe("image/jpeg");
    expect(asset?.size).toBe(3);
    expect(assets.map((entry) => entry.assetId).sort()).toEqual([
      "asset-one",
      "asset-two"
    ]);

    await deleteProject(project.id, { indexedDBFactory: factory });

    expect(
      await listProjectAssetBlobs(project.id, { indexedDBFactory: factory })
    ).toEqual([]);
  });
});

describe("project autosave", () => {
  it("debounces document saves", async () => {
    vi.useFakeTimers();

    const project = createEmptyProject("Autosave Project");
    const saveProject = vi.fn().mockResolvedValue(undefined);
    const autosave = createProjectAutosave({
      project,
      saveProject,
      delayMs: 250
    });

    autosave.schedule({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }]
    });
    autosave.schedule({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "B" }] }]
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(saveProject).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveProject).toHaveBeenCalledTimes(1);
    expect(project.document.content?.[0]?.content?.[0]?.text).toBe("B");
    expect(project.updatedAt).toBeTruthy();

    autosave.destroy();
    vi.useRealTimers();
  });

  it("passes save failures to the status callback", async () => {
    const project = createEmptyProject("Autosave Error Project");
    const error = new LodeonClientError("persistence.project_save_failed", {
      externalError: "quota"
    });
    const onStatusChange = vi.fn();
    const autosave = createProjectAutosave({
      project,
      saveProject: vi.fn().mockRejectedValue(error),
      delayMs: 1,
      onStatusChange
    });

    autosave.schedule({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "A" }] }]
    });
    await autosave.flush();

    expect(onStatusChange).toHaveBeenLastCalledWith("error", error);
    autosave.destroy();
  });
});
