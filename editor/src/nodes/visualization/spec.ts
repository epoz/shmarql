/** Projects canonical node state into deterministic renderer specifications. */

import type { VisualizationNodeAttrs } from "./contracts";

export function buildVisualizationSpec(attrs: VisualizationNodeAttrs): Record<string, unknown> {
  return {
    version: 2,
    renderer: "plotly",
    sourceMode: attrs.sourceMode,
    source: attrs.source,
    url: attrs.url,
    urlFormat: attrs.urlFormat,
    chartType: attrs.chartType,
    mapping: attrs.mapping,
    plotlyDataJson: attrs.plotlyDataJson,
    layoutJson: attrs.layoutJson,
    configJson: attrs.configJson,
    data: attrs.data,
    figure: attrs.figure
  };
}
