/** Coordinates project selection save ordering and teardown. */

import type { JSONContent } from "@tiptap/core";
import type { LodeonAsset } from "../assets/contracts";
import type { LodeonProject } from "../project/contracts";
import { createEmptyProject } from "../project/factory";
import {
  createProject,
  deleteProject,
  listProjects,
  loadActiveProject,
  saveProject,
  setActiveProject
} from "./project-store";
import { createProjectAutosave, type AutosaveStatus, type ProjectAutosave } from "./autosave";

export type LodeonPersistence = {
  loadProject: () => Promise<LodeonProject | null>;
  saveProject: (project: LodeonProject) => Promise<LodeonProject>;
  createProject: (title?: string) => Promise<LodeonProject>;
  listProjects: () => Promise<LodeonProject[]>;
  setActiveProject: (projectId: string) => Promise<LodeonProject | null>;
  deleteProject: (projectId: string) => Promise<LodeonProject | null>;
};

export type InitialProjectResult = {
  project: LodeonProject;
  error?: unknown;
};

export type ProjectLifecycleOptions = {
  initialProject: LodeonProject;
  defaultTitle: string;
  persistence: LodeonPersistence;
  autosaveDelayMs?: number;
  now?: () => string;
  isReady?: () => boolean;
  onAutosaveStatusChange?: (status: AutosaveStatus, error?: unknown) => void;
  onProjectActivated?: (project: LodeonProject) => void | Promise<void>;
};

export type ProjectLifecycle = {
  getProject: () => LodeonProject;
  listProjects: () => Promise<LodeonProject[]>;
  schedule: (document: JSONContent) => void;
  touch: () => void;
  flush: () => Promise<void>;
  createNewProject: () => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  deleteCurrentProject: () => Promise<void>;
  activateProject: (project: LodeonProject) => Promise<void>;
  assignAsset: (asset: LodeonAsset) => void;
  updateAsset: (assetId: string, update: (asset: LodeonAsset) => LodeonAsset) => void;
  replaceAssets: (assets: LodeonAsset[]) => void;
  destroy: () => void;
};

/** Resolves one complete persistence boundary without creating a service locator. */
export function resolveProjectPersistence(overrides: Partial<LodeonPersistence> = {}): LodeonPersistence {
  return {
    loadProject: overrides.loadProject ?? loadActiveProject,
    saveProject: overrides.saveProject ?? saveProject,
    createProject: overrides.createProject ?? createProject,
    listProjects: overrides.listProjects ?? listProjects,
    setActiveProject: overrides.setActiveProject ?? setActiveProject,
    deleteProject: overrides.deleteProject ?? deleteProject
  };
}

/** Loads the selected project or creates one canonical empty project when none exists. */
export async function loadInitialProject(
  persistence: Pick<LodeonPersistence, "loadProject">,
  defaultTitle: string,
  createInitialProject: (() => Promise<LodeonProject>) | undefined = undefined
): Promise<InitialProjectResult> {
  try {
    const persistedProject = await persistence.loadProject();

    return {
      project:
        persistedProject ??
        (createInitialProject ? await createInitialProject() : createEmptyProject(defaultTitle))
    };
  } catch (error) {
    return {
      project: createEmptyProject(defaultTitle),
      error
    };
  }
}

/**
 * Owns active-project switching and persistence ordering. `destroy` must be
 * called to prevent queued saves from outliving the Editor application.
 */
export function createProjectLifecycle({
  initialProject,
  defaultTitle,
  persistence,
  autosaveDelayMs,
  now = () => new Date().toISOString(),
  isReady = () => true,
  onAutosaveStatusChange,
  onProjectActivated
}: ProjectLifecycleOptions): ProjectLifecycle {
  let currentProject = initialProject;
  const autosave: ProjectAutosave = createProjectAutosave({
    project: currentProject,
    saveProject: persistence.saveProject,
    delayMs: autosaveDelayMs,
    now,
    onStatusChange: onAutosaveStatusChange
  });

  function schedule(document: JSONContent): void {
    autosave.schedule(document);
  }

  function touch(): void {
    currentProject.updatedAt = now();
    autosave.schedule(currentProject.document);
  }

  async function activateProject(project: LodeonProject): Promise<void> {
    currentProject = project;
    autosave.setProject(project);
    await onProjectActivated?.(project);
  }

  async function createNewProject(): Promise<void> {
    if (!isReady()) {
      return;
    }
    await autosave.flush();
    await activateProject(await persistence.createProject(defaultTitle));
  }

  async function openProject(projectId: string): Promise<void> {
    if (!isReady()) {
      return;
    }
    await autosave.flush();
    const project = await persistence.setActiveProject(projectId);
    if (project) {
      await activateProject(project);
    }
  }

  async function deleteCurrentProject(): Promise<void> {
    if (!isReady()) {
      return;
    }
    await autosave.flush();
    const project =
      (await persistence.deleteProject(currentProject.id)) ?? (await persistence.createProject(defaultTitle));
    await activateProject(project);
  }

  function assignAsset(asset: LodeonAsset): void {
    currentProject.assets = [
      ...currentProject.assets.filter((entry) => entry.assetId !== asset.assetId),
      asset
    ];
    touch();
  }

  function updateAsset(assetId: string, update: (asset: LodeonAsset) => LodeonAsset): void {
    currentProject.assets = currentProject.assets.map((asset) =>
      asset.assetId === assetId ? update(asset) : asset
    );
    touch();
  }

  function replaceAssets(assets: LodeonAsset[]): void {
    currentProject.assets = assets;
    touch();
  }

  return {
    getProject: () => currentProject,
    listProjects: persistence.listProjects,
    schedule,
    touch,
    flush: autosave.flush,
    createNewProject,
    openProject,
    deleteCurrentProject,
    activateProject,
    assignAsset,
    updateAsset,
    replaceAssets,
    destroy: autosave.destroy
  };
}
