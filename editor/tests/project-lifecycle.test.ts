import { describe, expect, it, vi } from "vitest";
import { type LodeonAsset } from "@lodeon/assets/contracts";
import {
  createProjectLifecycle,
  loadInitialProject,
  type LodeonPersistence
} from "@lodeon/persistence/project-lifecycle";
import { createEmptyProject } from "@lodeon/project/factory";
import { type LodeonProject } from "@lodeon/project/contracts";

function createPersistence(
  projects: LodeonProject[] = []
): LodeonPersistence & { savedProjects: LodeonProject[] } {
  const savedProjects: LodeonProject[] = [];

  return {
    savedProjects,
    loadProject: vi.fn().mockResolvedValue(projects[0] ?? null),
    saveProject: vi.fn(async (project: LodeonProject) => {
      savedProjects.push(structuredClone(project));
      return project;
    }),
    createProject: vi.fn(async (title = "Untitled") => createEmptyProject(title)),
    listProjects: vi.fn().mockResolvedValue(projects),
    setActiveProject: vi.fn(async (projectId: string) =>
      projects.find((project) => project.id === projectId) ?? null
    ),
    deleteProject: vi.fn(async (projectId: string) =>
      projects.find((project) => project.id !== projectId) ?? null
    )
  };
}

function createAsset(assetId: string, title: string): LodeonAsset {
  return {
    assetId,
    kind: "image",
    mimeType: "image/png",
    path: `assets/${assetId}.png`,
    fileName: `${assetId}.png`,
    originalName: `${assetId}.png`,
    size: 10,
    createdAt: "2026-08-16T08:00:00.000Z",
    title
  };
}

describe("project lifecycle", () => {
  it("loads the active project and creates a recoverable fallback on failure", async () => {
    const project = createEmptyProject("Loaded");

    await expect(
      loadInitialProject({ loadProject: vi.fn().mockResolvedValue(project) }, "New")
    ).resolves.toEqual({ project });

    const error = new Error("unavailable");
    const fallback = await loadInitialProject(
      { loadProject: vi.fn().mockRejectedValue(error) },
      "New"
    );

    expect(fallback.project.title).toBe("New");
    expect(fallback.error).toBe(error);
  });

  it("uses the configured initial project only when browser persistence is empty", async () => {
    const welcomeProject = createEmptyProject("Welcome to LODEON");
    const persistedProject = createEmptyProject("Persisted");
    const createInitialProject = vi.fn().mockResolvedValue(welcomeProject);

    await expect(
      loadInitialProject(
        { loadProject: vi.fn().mockResolvedValue(null) },
        "New",
        createInitialProject
      )
    ).resolves.toEqual({ project: welcomeProject });
    expect(createInitialProject).toHaveBeenCalledOnce();

    createInitialProject.mockClear();
    await expect(
      loadInitialProject(
        { loadProject: vi.fn().mockResolvedValue(persistedProject) },
        "New",
        createInitialProject
      )
    ).resolves.toEqual({ project: persistedProject });
    expect(createInitialProject).not.toHaveBeenCalled();
  });

  it("flushes pending document changes before switching projects", async () => {
    const first = createEmptyProject("First");
    const second = createEmptyProject("Second");
    const persistence = createPersistence([first, second]);
    const activated: string[] = [];
    const lifecycle = createProjectLifecycle({
      initialProject: first,
      defaultTitle: "New",
      persistence,
      autosaveDelayMs: 60_000,
      now: () => "2026-08-16T09:00:00.000Z",
      onProjectActivated: (project) => activated.push(project.id)
    });

    lifecycle.schedule({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Pending" }] }]
    });
    await lifecycle.openProject(second.id);

    expect(persistence.savedProjects).toHaveLength(1);
    expect(persistence.savedProjects[0]?.id).toBe(first.id);
    expect(persistence.savedProjects[0]?.document.content?.[0]?.content?.[0]?.text)
      .toBe("Pending");
    expect(lifecycle.getProject()).toBe(second);
    expect(activated).toEqual([second.id]);
    lifecycle.destroy();
  });

  it("owns project creation and deletion without duplicating activation logic", async () => {
    const first = createEmptyProject("First");
    const remaining = createEmptyProject("Remaining");
    const persistence = createPersistence([first, remaining]);
    const lifecycle = createProjectLifecycle({
      initialProject: first,
      defaultTitle: "New",
      persistence
    });

    await lifecycle.createNewProject();
    expect(lifecycle.getProject().title).toBe("New");

    await lifecycle.activateProject(first);
    await lifecycle.deleteCurrentProject();
    expect(persistence.deleteProject).toHaveBeenCalledWith(first.id);
    expect(lifecycle.getProject()).toBe(remaining);
    lifecycle.destroy();
  });

  it("assigns and updates assets through the same timestamped autosave path", async () => {
    const project = createEmptyProject("Assets");
    const persistence = createPersistence([project]);
    const lifecycle = createProjectLifecycle({
      initialProject: project,
      defaultTitle: "New",
      persistence,
      autosaveDelayMs: 60_000,
      now: () => "2026-08-16T10:00:00.000Z"
    });

    lifecycle.assignAsset(createAsset("asset-one", "Original"));
    lifecycle.updateAsset("asset-one", (asset) => ({ ...asset, title: "Updated" }));
    lifecycle.replaceAssets([
      createAsset("asset-one", "Updated"),
      createAsset("asset-two", "Second")
    ]);
    await lifecycle.flush();

    expect(lifecycle.getProject().updatedAt).toBe("2026-08-16T10:00:00.000Z");
    expect(lifecycle.getProject().assets.map((asset) => asset.title)).toEqual([
      "Updated",
      "Second"
    ]);
    expect(persistence.savedProjects).toHaveLength(1);
    lifecycle.destroy();
  });

  it("prevents scheduled persistence after lifecycle destruction", async () => {
    vi.useFakeTimers();
    const project = createEmptyProject("Disposed");
    const persistence = createPersistence([project]);
    const lifecycle = createProjectLifecycle({
      initialProject: project,
      defaultTitle: "New",
      persistence,
      autosaveDelayMs: 10
    });

    lifecycle.schedule({ type: "doc", content: [{ type: "paragraph" }] });
    lifecycle.destroy();
    await vi.advanceTimersByTimeAsync(20);
    await lifecycle.flush();

    expect(persistence.saveProject).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
