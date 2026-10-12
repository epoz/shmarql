/** Registers visualization definitions and renderer mappings. */

export type VisualizationDefinition = {
  id: string;
  labelKey: string;
  descriptionKey: string;
};

export type VisualizationRegistry = Map<string, VisualizationDefinition>;

export function createVisualizationRegistry(): VisualizationRegistry {
  const visualizations: VisualizationDefinition[] = [
    {
      id: "table",
      labelKey: "visualizations.table.label",
      descriptionKey: "visualizations.table.description"
    },
    {
      id: "barChart",
      labelKey: "visualizations.barChart.label",
      descriptionKey: "visualizations.barChart.description"
    },
    {
      id: "map",
      labelKey: "visualizations.map.label",
      descriptionKey: "visualizations.map.description"
    }
  ];

  return new Map(visualizations.map((visualization) => [visualization.id, visualization]));
}
