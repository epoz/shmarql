/** Renders and binds the global project-selection and asset actions. */

import type { LodeonProject } from "../project/contracts";
import type { createRuntime } from "../application/runtime";

type Runtime = ReturnType<typeof createRuntime>;

export function bindProjectActions(root: HTMLElement, runtime: Runtime): () => void {
  const picker = root.querySelector<HTMLSelectElement>("[data-project-picker]");
  const deleteButton = root.querySelector<HTMLButtonElement>("[data-project-delete]");
  const assetsPanel = root.querySelector<HTMLElement>("[data-project-assets]");
  const handlePicker = () => void runtime.commands.openProject?.(picker?.value ?? "");
  const handleDelete = () => void runtime.commands.deleteCurrentProject?.();
  const handleAssets = (event: MouseEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest("[data-assets-cleanup]")) {
      void runtime.commands.cleanupUnusedAssets?.();
    }
  };
  picker?.addEventListener("change", handlePicker);
  deleteButton?.addEventListener("click", handleDelete);
  assetsPanel?.addEventListener("click", handleAssets);
  return () => {
    picker?.removeEventListener("change", handlePicker);
    deleteButton?.removeEventListener("click", handleDelete);
    assetsPanel?.removeEventListener("click", handleAssets);
  };
}

export async function renderProjectPicker(
  root: HTMLElement,
  runtime: Runtime,
  loadProjects: () => Promise<LodeonProject[]>
): Promise<void> {
  const picker = root.querySelector<HTMLSelectElement>("[data-project-picker]");
  if (!picker) return;
  let projects: LodeonProject[];
  try {
    projects = await loadProjects();
  } catch {
    projects = [runtime.project];
  }
  picker.innerHTML = projects
    .map(
      (project) => `
    <option value="${project.id}" ${project.id === runtime.project.id ? "selected" : ""}>
      ${project.title}
    </option>
  `
    )
    .join("");
}
