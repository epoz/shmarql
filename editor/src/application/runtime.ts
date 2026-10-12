/** Constructs the browser runtime and coordinates its long-lived application state. */

import type { LodeonConfig } from "../configuration/schema";
import type { LodeonProject } from "../project/contracts";
import { createActionRegistry } from "../registry/actions";
import { createSpecialNodeRegistry } from "../registry/nodes";
import { createPanelRegistry } from "../registry/panels";
import { createVisualizationRegistry } from "../registry/visualizations";
import { createLocalization } from "../localization/runtime";
import type { LodeonRuntime } from "./contracts";
import type { LodeonRuntimeCommands } from "./commands";

export function createRuntime(
  config: LodeonConfig,
  project: LodeonProject,
  commands: LodeonRuntimeCommands = {}
): LodeonRuntime {
  const specialNodeRegistry = createSpecialNodeRegistry();

  return {
    config,
    project,
    i18n: createLocalization(config),
    commands,
    registries: {
      actions: createActionRegistry(),
      nodes: specialNodeRegistry,
      panels: createPanelRegistry(),
      visualizations: createVisualizationRegistry()
    },
    events: []
  };
}
