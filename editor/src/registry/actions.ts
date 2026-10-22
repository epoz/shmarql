/** Registers application actions by stable identifiers. */

import type { ActionRuntime } from "../application/commands";

export type ActionDefinition = {
  id: string;
  labelKey: string;
  descriptionKey: string;
  run: (runtime: ActionRuntime) => void | Promise<void>;
};

export type ActionRegistry = Map<string, ActionDefinition>;

export function createActionRegistry(): ActionRegistry {
  return new Map(
    [
      {
        id: "project.new",
        labelKey: "actions.project.new.label",
        descriptionKey: "actions.project.new.description",
        run: async (runtime: ActionRuntime) => {
          await runtime.commands.createNewProject?.();
        }
      },
      {
        id: "project.import",
        labelKey: "actions.project.import.label",
        descriptionKey: "actions.project.import.description",
        run: () => {
          document.querySelector<HTMLInputElement>("[data-project-import]")?.click();
        }
      },
      {
        id: "project.export",
        labelKey: "actions.project.export.label",
        descriptionKey: "actions.project.export.description",
        run: async (runtime: ActionRuntime) => {
          await runtime.commands.exportProject?.();
        }
      },
      {
        id: "preview.open",
        labelKey: "actions.preview.open.label",
        descriptionKey: "actions.preview.open.description",
        run: async (runtime: ActionRuntime) => {
          await runtime.commands.openPreview?.();
        }
      },
      {
        id: "render.html",
        labelKey: "actions.render.html.label",
        descriptionKey: "actions.render.html.description",
        run: async (runtime: ActionRuntime) => {
          await runtime.commands.publishProject?.();
        }
      }
    ].map((action) => [action.id, action])
  );
}
