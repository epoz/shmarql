/** Debounces project persistence while preserving explicit flush semantics. */

import type { JSONContent } from "@tiptap/core";
import type { LodeonProject } from "../project/contracts";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type ProjectAutosaveOptions = {
  project: LodeonProject;
  saveProject: (project: LodeonProject) => Promise<unknown>;
  delayMs?: number;
  now?: () => string;
  onStatusChange?: (status: AutosaveStatus, error?: unknown) => void;
};

export type ProjectAutosave = {
  schedule: (document: JSONContent) => void;
  flush: () => Promise<void>;
  setProject: (project: LodeonProject) => void;
  destroy: () => void;
};

type ActiveAutosaveState = {
  state: "active";
  timeout?: ReturnType<typeof setTimeout>;
  pendingDocument?: JSONContent;
};

type AutosaveLifecycleState = ActiveAutosaveState | { state: "disposed" };

/**
 * Owns one project's debounced save lifecycle and serialized flush chain.
 * Switching clears pending work, destruction is idempotent, and disposed callbacks cannot
 * persist stale document state. Save failures are surfaced through status without breaking
 * later explicit flushes.
 */
export function createProjectAutosave({
  project,
  saveProject,
  delayMs = 400,
  now = () => new Date().toISOString(),
  onStatusChange
}: ProjectAutosaveOptions): ProjectAutosave {
  let currentProject = project;
  let lifecycle: AutosaveLifecycleState = { state: "active" };
  let lastSave = Promise.resolve();

  async function flush(): Promise<void> {
    if (lifecycle.state === "disposed" || !lifecycle.pendingDocument) {
      return lastSave;
    }

    const document = lifecycle.pendingDocument;
    lifecycle.pendingDocument = undefined;
    currentProject.document = document;
    currentProject.updatedAt = now();
    onStatusChange?.("saving");

    lastSave = lastSave
      .catch(() => undefined)
      .then(() => saveProject(currentProject))
      .then(
        () => onStatusChange?.("saved"),
        (error) => onStatusChange?.("error", error)
      );

    return lastSave;
  }

  function schedule(document: JSONContent): void {
    if (lifecycle.state === "disposed") {
      return;
    }

    currentProject.document = document;
    currentProject.updatedAt = now();
    lifecycle.pendingDocument = document;
    onStatusChange?.("saving");

    if (lifecycle.timeout) {
      clearTimeout(lifecycle.timeout);
    }

    lifecycle.timeout = setTimeout(() => {
      if (lifecycle.state === "disposed") {
        return;
      }
      lifecycle.timeout = undefined;
      void flush();
    }, delayMs);
  }

  function setProject(project: LodeonProject): void {
    if (lifecycle.state === "disposed") {
      return;
    }
    currentProject = project;
    lifecycle.pendingDocument = undefined;

    if (lifecycle.timeout) {
      clearTimeout(lifecycle.timeout);
      lifecycle.timeout = undefined;
    }
  }

  function destroy(): void {
    if (lifecycle.state === "disposed") {
      return;
    }
    if (lifecycle.timeout) {
      clearTimeout(lifecycle.timeout);
    }
    lifecycle = { state: "disposed" };
  }

  return { schedule, flush, setProject, destroy };
}
