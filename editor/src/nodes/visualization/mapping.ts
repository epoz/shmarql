/** Maps result variables to visualization dimensions and defaults. */

import {
  buildPlotlyFigure,
  createDefaultPlotlyJson,
  stringifyPlotlyJson,
  type PlotlyDefaults,
  type VisualizationMapping,
  type VisualizationType
} from "./renderer";
import type { NormalizedTable } from "./table-data";
import type { VisualizationNodeAttrs } from "./contracts";

type MappingContext = {
  columns: string[];
  numeric: string[];
  dates: string[];
  measure: string | undefined;
};

type MappingPolicy = (context: MappingContext) => VisualizationMapping;

const MEASURE_NAMES =
  /^(?:count|total|value|values|amount|quantity|number|frequency|size|score|percentage|percent|ratio)$/;

function normalizedName(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function firstOther(columns: string[], ...excluded: Array<string | undefined>): string | undefined {
  return columns.find((column) => !excluded.includes(column));
}

function namedColumn(context: MappingContext, ...names: string[]): string | undefined {
  const normalizedNames = names.map(normalizedName);
  return context.columns.find((column) =>
    normalizedNames.some((name) => normalizedName(column).includes(name))
  );
}

function categoryColumn(context: MappingContext, ...excluded: Array<string | undefined>): string | undefined {
  return firstOther(context.columns, ...excluded);
}

function groupColumn(context: MappingContext, ...excluded: Array<string | undefined>): string | undefined {
  return context.columns.find((column) => !excluded.includes(column) && !context.numeric.includes(column));
}

function buildMappingContext(data: NormalizedTable): MappingContext {
  const columns = data.columns.map((column) => column.name);
  const numeric = data.columns.filter((column) => column.type === "number").map((column) => column.name);
  const dates = data.columns.filter((column) => column.type === "date").map((column) => column.name);
  const namedMeasure = numeric.find((column) => MEASURE_NAMES.test(normalizedName(column)));
  const measure = namedMeasure ?? (numeric.length > 1 && numeric[0] === columns[0] ? numeric[1] : numeric[0]);

  return { columns, numeric, dates, measure };
}

const cartesianPolicy: MappingPolicy = (context) => ({
  x: categoryColumn(context, context.measure),
  y: context.measure
});

const groupedPolicy: MappingPolicy = (context) => {
  const x = categoryColumn(context, context.measure);
  return {
    x,
    y: context.measure,
    group: groupColumn(context, context.measure, x)
  };
};

const mappingPolicies: Record<VisualizationType, MappingPolicy> = {
  table: () => ({}),
  bar: cartesianPolicy,
  line: cartesianPolicy,
  horizontalBar: cartesianPolicy,
  area: cartesianPolicy,
  histogram: (context) => ({ x: context.measure ?? context.columns[0] }),
  groupedBar: groupedPolicy,
  stackedBar: groupedPolicy,
  box: (context) => ({
    y: context.measure,
    group: categoryColumn(context, context.measure)
  }),
  pie: (context) => ({
    label: categoryColumn(context, context.measure),
    value: context.measure
  }),
  scatter: (context) => ({
    x: context.numeric[0] ?? context.columns[0],
    y: context.numeric[1] ?? context.numeric[0],
    text: firstOther(context.columns, context.numeric[0], context.numeric[1])
  }),
  bubble: (context) => ({
    x: context.numeric[0] ?? context.columns[0],
    y: context.numeric[1] ?? context.numeric[0],
    size: context.numeric[2] ?? context.numeric[1] ?? context.numeric[0],
    text: firstOther(context.columns, ...context.numeric)
  }),
  heatmap: (context) => {
    const x = categoryColumn(context, context.measure);
    return {
      x,
      y: categoryColumn(context, context.measure, x),
      z: context.measure
    };
  },
  treemap: (context) => {
    const label = categoryColumn(context, context.measure);
    return {
      label,
      parent: categoryColumn(context, context.measure, label),
      value: context.measure
    };
  },
  sunburst: (context) => {
    const label = categoryColumn(context, context.measure);
    return {
      label,
      parent: categoryColumn(context, context.measure, label),
      value: context.measure
    };
  },
  sankey: (context) => ({
    source: namedColumn(context, "source", "from") ?? context.columns[0],
    target: namedColumn(context, "target", "to") ?? context.columns[1],
    value: context.measure
  }),
  timeline: (context) => ({
    label: categoryColumn(context, ...context.dates),
    start: namedColumn(context, "start", "begin") ?? context.dates[0] ?? context.columns[1],
    end: namedColumn(context, "end", "finish") ?? context.dates[1] ?? context.columns[2]
  }),
  map: (context) => ({
    lat: namedColumn(context, "latitude", "lat"),
    lon: namedColumn(context, "longitude", "lon", "lng"),
    label: context.columns[0],
    size: context.measure
  })
};

export function completeVisualizationMapping(
  data: NormalizedTable,
  chartType: VisualizationType,
  mapping: VisualizationMapping
): VisualizationMapping {
  const explicitMapping = Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => typeof value === "string" && value.length > 0)
  );

  return {
    ...mappingPolicies[chartType](buildMappingContext(data)),
    ...explicitMapping
  };
}

export function createPlotlyDefaults(
  data: NormalizedTable,
  chartType: VisualizationType,
  mapping: VisualizationMapping,
  plotlyDefaults?: PlotlyDefaults
): Pick<VisualizationNodeAttrs, "mapping" | "plotlyDataJson" | "layoutJson" | "configJson" | "figure"> {
  const defaults = createDefaultPlotlyJson(data, chartType, mapping, plotlyDefaults);

  return {
    mapping,
    plotlyDataJson: stringifyPlotlyJson(defaults.data),
    layoutJson: stringifyPlotlyJson(defaults.layout),
    configJson: stringifyPlotlyJson(defaults.config),
    figure: buildPlotlyFigure(
      data,
      chartType,
      mapping,
      {
        dataJson: stringifyPlotlyJson(defaults.data),
        layoutJson: stringifyPlotlyJson(defaults.layout),
        configJson: stringifyPlotlyJson(defaults.config)
      },
      plotlyDefaults
    )
  };
}
