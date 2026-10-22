/** Registers Editor panels by stable identifiers. */

export type PanelDefinition = {
  id: string;
  labelKey: string;
  descriptionKey: string;
};

export type PanelRegistry = Map<string, PanelDefinition>;

export function createPanelRegistry(): PanelRegistry {
  const panels: PanelDefinition[] = [
    {
      id: "project.metadata",
      labelKey: "panels.projectMetadata.label",
      descriptionKey: "panels.projectMetadata.description"
    },
    {
      id: "project.story",
      labelKey: "panels.projectStory.label",
      descriptionKey: "panels.projectStory.description"
    }
  ];

  return new Map(panels.map((panel) => [panel.id, panel]));
}
