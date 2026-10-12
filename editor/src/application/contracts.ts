/** Defines the stable application data contracts without owning runtime behavior. */

import type { LodeonConfig } from "../configuration/schema";
import type { LodeonProject } from "../project/contracts";
import type { LodeonLocalization } from "../localization/runtime";
import type { ActionRegistry } from "../registry/actions";
import type { SpecialNodeRegistry } from "../registry/nodes";
import type { PanelRegistry } from "../registry/panels";
import type { VisualizationRegistry } from "../registry/visualizations";
import type { LodeonRuntimeCommands } from "./commands";

export type LodeonRuntimeEvent = {
  type: string;
  id?: string;
};

export type LodeonRuntime = {
  config: LodeonConfig;
  project: LodeonProject;
  i18n: LodeonLocalization;
  commands: LodeonRuntimeCommands;
  registries: {
    actions: ActionRegistry;
    nodes: SpecialNodeRegistry;
    panels: PanelRegistry;
    visualizations: VisualizationRegistry;
  };
  events: LodeonRuntimeEvent[];
};
