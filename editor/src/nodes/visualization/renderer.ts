/** Owns deterministic Visualization Special Node rendering from canonical inputs. */

import type { Config, Data, Layout } from "plotly.js";
import type { NormalizedTable } from "./table-data";
import type { LodeonConfig } from "../../configuration/schema";
import { LodeonClientError, renderConfiguredError } from "../../errors/client-error";

export type VisualizationType =
  | "table"
  | "bar"
  | "line"
  | "pie"
  | "scatter"
  | "bubble"
  | "horizontalBar"
  | "groupedBar"
  | "stackedBar"
  | "area"
  | "histogram"
  | "box"
  | "heatmap"
  | "treemap"
  | "sunburst"
  | "sankey"
  | "timeline"
  | "map";

export type VisualizationMapping = {
  x?: string;
  y?: string;
  label?: string;
  value?: string;
  color?: string;
  size?: string;
  text?: string;
  group?: string;
  z?: string;
  parent?: string;
  source?: string;
  target?: string;
  start?: string;
  end?: string;
  lat?: string;
  lon?: string;
};

export type PlotlyFigure = {
  data: Data[];
  layout: Partial<Layout>;
  config: Partial<Config>;
};

export type PlotlyDefaults = {
  colorway?: string[];
  singleTraceColor?: string;
  layout?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

export type PlotlyVisualizationJson = {
  dataJson?: string;
  layoutJson?: string;
  configJson?: string;
};

export type PlotlyJsonValidationIssue = {
  code: string;
  variables?: Record<string, string>;
};

export type PlotlyJsonValidation = {
  data?: PlotlyJsonValidationIssue;
  layout?: PlotlyJsonValidationIssue;
  config?: PlotlyJsonValidationIssue;
};

type PlotlyRuntime = {
  react: (
    container: HTMLElement,
    data: Data[],
    layout?: Partial<Layout>,
    config?: Partial<Config>
  ) => Promise<unknown>;
  purge: (container: HTMLElement) => void;
};

const DEFAULT_PLOTLY_COLORWAY = [
  "#000000",
  "#E69F00",
  "#56B4E9",
  "#009E73",
  "#F0E442",
  "#0072B2",
  "#D55E00",
  "#CC79A7"
];

const DEFAULT_SINGLE_TRACE_COLOR = "#0072B2";

type ResolvedPlotlyDefaults = {
  colorway: string[];
  singleTraceColor: string;
  layout: Record<string, unknown>;
  config: Record<string, unknown>;
};

export function buildPlotlyFigure(
  table: NormalizedTable,
  type: VisualizationType,
  mapping: VisualizationMapping,
  plotlyJson: PlotlyVisualizationJson = {},
  plotlyDefaults?: PlotlyDefaults
): PlotlyFigure {
  const defaults = createDefaultPlotlyJson(table, type, mapping, plotlyDefaults);
  const parsedData = parseJsonArray(plotlyJson.dataJson, "dataJson");
  const data =
    parsedData.length > 0
      ? (parsedData as Data[])
      : buildPlotlyData(table, type, mapping, resolvePlotlyDefaults(plotlyDefaults));
  const layout = mergePlotlyObject(defaults.layout, parseJsonObject(plotlyJson.layoutJson, "layoutJson"));
  const config = mergePlotlyObject(defaults.config, parseJsonObject(plotlyJson.configJson, "configJson"));

  return {
    data: sanitizePlotlyValue(data) as Data[],
    layout: sanitizePlotlyValue(layout) as Partial<Layout>,
    config: sanitizePlotlyValue(config) as Partial<Config>
  };
}

export function createDefaultPlotlyJson(
  table: NormalizedTable,
  type: VisualizationType,
  mapping: VisualizationMapping,
  plotlyDefaults?: PlotlyDefaults
): PlotlyFigure {
  const resolvedDefaults = resolvePlotlyDefaults(plotlyDefaults);
  const layout: Partial<Layout> = {
    autosize: true,
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    font: {
      family: "Inter, system-ui, sans-serif",
      color: "#1f2328"
    },
    colorway: resolvedDefaults.colorway,
    margin: { l: 56, r: 32, t: 48, b: 64 },
    showlegend: [
      "pie",
      "scatter",
      "bubble",
      "groupedBar",
      "stackedBar",
      "box",
      "treemap",
      "sunburst",
      "sankey",
      "map"
    ].includes(type),
    xaxis: undefined,
    yaxis: undefined
  };

  if (hasCartesianAxes(type)) {
    layout.xaxis = {
      automargin: true,
      gridcolor: "#e6e6e6",
      zerolinecolor: "#d6d6d6",
      type: type === "timeline" ? "date" : undefined
    };
    layout.yaxis = {
      automargin: true,
      gridcolor: "#e6e6e6",
      zerolinecolor: "#d6d6d6"
    };
  }
  if (type === "groupedBar") {
    layout.barmode = "group";
  }
  if (type === "stackedBar") {
    layout.barmode = "stack";
  }
  if (type === "map") {
    layout.geo = {
      projection: { type: "natural earth" },
      showland: true,
      landcolor: "#fafafa",
      showcountries: true,
      countrycolor: "#d6d6d6"
    };
  }
  if (type === "timeline") {
    layout.margin = { l: 120, r: 32, t: 48, b: 64 };
  }
  const sanitizedLayout: Partial<Layout> = {
    ...layout,
    xaxis: !hasCartesianAxes(type) ? undefined : layout.xaxis,
    yaxis: !hasCartesianAxes(type) ? undefined : layout.yaxis
  };
  const config: Partial<Config> = mergePlotlyObject(
    {
      responsive: true,
      displaylogo: false,
      scrollZoom: false
    },
    resolvedDefaults.config
  );
  const mergedLayout = mergePlotlyObject(
    sanitizedLayout as Record<string, unknown>,
    resolvedDefaults.layout
  ) as Partial<Layout>;

  return {
    data: sanitizePlotlyValue(buildPlotlyData(table, type, mapping, resolvedDefaults)) as Data[],
    layout: sanitizePlotlyValue(mergedLayout) as Partial<Layout>,
    config
  };
}

function resolvePlotlyDefaults(defaults?: PlotlyDefaults): ResolvedPlotlyDefaults {
  const colorway = defaults?.colorway?.length ? defaults.colorway : DEFAULT_PLOTLY_COLORWAY;

  return {
    colorway,
    singleTraceColor: defaults?.singleTraceColor ?? colorway[5] ?? colorway[0] ?? DEFAULT_SINGLE_TRACE_COLOR,
    layout: defaults?.layout ?? {},
    config: defaults?.config ?? {}
  };
}

function colorAt(defaults: ResolvedPlotlyDefaults, index: number): string {
  return defaults.colorway[index % defaults.colorway.length] ?? defaults.singleTraceColor;
}

export function stringifyPlotlyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function validatePlotlyJson(plotlyJson: PlotlyVisualizationJson = {}): PlotlyJsonValidation {
  const validation: PlotlyJsonValidation = {};

  try {
    parseJsonArray(plotlyJson.dataJson, "data");
  } catch (error) {
    validation.data = plotlyValidationIssue(error, "data");
  }

  try {
    parseJsonObject(plotlyJson.layoutJson, "layout");
  } catch (error) {
    validation.layout = plotlyValidationIssue(error, "layout");
  }

  try {
    parseJsonObject(plotlyJson.configJson, "config");
  } catch (error) {
    validation.config = plotlyValidationIssue(error, "config");
  }

  return validation;
}

/**
 * Renders a normalized table through the pinned Plotly boundary and returns a
 * cleanup-capable result; caller-owned containers remain the lifecycle scope.
 */
export function renderVisualization(
  container: HTMLElement,
  table: NormalizedTable | null,
  type: VisualizationType,
  mapping: VisualizationMapping,
  plotlyJson: PlotlyVisualizationJson = {},
  plotlyDefaults?: PlotlyDefaults,
  errors?: LodeonConfig["errors"],
  translate?: (key: string, values?: Record<string, string | number>) => string
): void {
  container.innerHTML = "";

  if (!table || table.columns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ld-visualization-empty";
    empty.textContent = translate?.("status.generateDataPreview") ?? "";
    container.append(empty);
    return;
  }

  let figure: PlotlyFigure;

  try {
    figure = buildPlotlyFigure(table, type, mapping, plotlyJson, plotlyDefaults);
  } catch (error) {
    renderVisualizationError(container, error, errors);
    return;
  }
  const host = document.createElement("div");

  host.className = "ld-plotly-host";
  container.append(host);

  if (isJsdom()) {
    renderStaticFigureSummary(host, figure, translate);
    return;
  }

  renderPlotly(host, figure).catch((error) => {
    renderVisualizationError(container, error, errors);
  });
}

function renderVisualizationError(
  container: HTMLElement,
  error: unknown,
  errors?: LodeonConfig["errors"]
): void {
  container.innerHTML = `<div class="ld-visualization-empty ld-visualization-error"></div>`;
  const fallback = container.querySelector<HTMLElement>(".ld-visualization-empty");

  if (fallback) {
    fallback.textContent = renderConfiguredError({ errors }, error, "visualization.plotly_failed");
  }
}

function renderStaticFigureSummary(
  container: HTMLElement,
  figure: PlotlyFigure,
  translate?: (key: string, values?: Record<string, string | number>) => string
): void {
  const summary = document.createElement("div");

  summary.className = "ld-visualization-empty";
  summary.textContent =
    translate?.(figure.data.length === 1 ? "status.plotlyFigureReadyOne" : "status.plotlyFigureReadyMany", {
      count: figure.data.length
    }) ?? "";
  container.append(summary);
}

function buildPlotlyData(
  table: NormalizedTable,
  type: VisualizationType,
  mapping: VisualizationMapping,
  defaults: ResolvedPlotlyDefaults
): Data[] {
  if (type === "table") {
    return [
      {
        type: "table",
        header: {
          values: table.columns.map((column) => column.name),
          align: "left",
          fill: { color: "#1f2328" },
          font: { color: "#ffffff" }
        },
        cells: {
          values: table.columns.map((column) => table.rows.map((row) => formatValue(row[column.name]))),
          align: "left",
          fill: { color: "#fafafa" }
        }
      } as Data
    ];
  }

  const xKey = mapping.x || mapping.label || table.columns[0]?.name;
  const yKey = mapping.y || mapping.value || table.columns.find((column) => column.type === "number")?.name;
  const groupKey = mapping.group || mapping.color || table.columns[2]?.name;
  const sizeKey = mapping.size || findNumericColumn(table, [yKey]);
  const textKey =
    mapping.text || table.columns.find((column) => column.name !== xKey && column.name !== yKey)?.name;
  const labels = table.rows.map((row) => formatValue(row[xKey ?? ""]));
  const values = table.rows.map((row) => Number(row[yKey ?? ""] ?? 0));

  if (type === "pie") {
    return [
      {
        type: "pie",
        labels,
        values,
        hole: 0.35
      }
    ];
  }

  if (type === "scatter" || type === "bubble") {
    return [
      {
        type: "scatter",
        mode: "markers",
        x: labels,
        y: values,
        text: textKey ? table.rows.map((row) => formatValue(row[textKey])) : labels,
        marker: {
          color: mapping.color
            ? table.rows.map((row) => formatValue(row[mapping.color ?? ""]))
            : defaults.singleTraceColor,
          size:
            type === "bubble"
              ? scaleMarkerSizes(table.rows.map((row) => Number(row[sizeKey ?? yKey ?? ""] ?? 0)))
              : 10,
          opacity: 0.8,
          line: { color: "#ffffff", width: 1 }
        }
      }
    ];
  }

  if (type === "horizontalBar") {
    return [
      {
        type: "bar",
        orientation: "h",
        x: values,
        y: labels,
        marker: { color: defaults.singleTraceColor }
      }
    ];
  }

  if (type === "groupedBar" || type === "stackedBar") {
    return buildGroupedBarData(table, xKey, yKey, groupKey, defaults);
  }

  if (type === "area") {
    return [
      {
        type: "scatter",
        mode: "lines",
        fill: "tozeroy",
        x: labels,
        y: values,
        line: { color: defaults.singleTraceColor, width: 3 }
      }
    ];
  }

  if (type === "histogram") {
    return [
      {
        type: "histogram",
        x: values.some((value) => !Number.isNaN(value)) ? values : labels,
        marker: { color: defaults.singleTraceColor }
      }
    ];
  }

  if (type === "box") {
    return buildBoxData(table, yKey, groupKey, defaults);
  }

  if (type === "heatmap") {
    return buildHeatmapData(table, xKey, mapping.y || table.columns[1]?.name, mapping.z || yKey);
  }

  if (type === "treemap" || type === "sunburst") {
    return [
      {
        type,
        labels,
        parents: table.rows.map((row) => formatValue(row[mapping.parent ?? groupKey ?? ""])),
        values,
        branchvalues: "total"
      }
    ];
  }

  if (type === "sankey") {
    return buildSankeyData(
      table,
      mapping.source || xKey,
      mapping.target || table.columns[1]?.name,
      mapping.value || yKey,
      defaults
    );
  }

  if (type === "timeline") {
    return buildTimelineData(
      table,
      mapping.label || xKey,
      mapping.start || table.columns.find((column) => column.type === "date")?.name || table.columns[1]?.name,
      mapping.end ||
        table.columns.find((column) => column.type === "date" && column.name !== mapping.start)?.name ||
        table.columns[2]?.name,
      defaults
    );
  }

  if (type === "map") {
    return [
      {
        type: "scattergeo",
        mode: "markers",
        lat: table.rows.map((row) => Number(row[mapping.lat ?? "lat"] ?? 0)),
        lon: table.rows.map((row) => Number(row[mapping.lon ?? "lon"] ?? 0)),
        text: table.rows.map((row) => formatValue(row[textKey ?? xKey ?? ""])),
        marker: {
          size: sizeKey ? scaleMarkerSizes(table.rows.map((row) => Number(row[sizeKey] ?? 0))) : 10,
          color: defaults.singleTraceColor,
          opacity: 0.75
        }
      }
    ];
  }

  return [
    {
      type: type === "line" ? "scatter" : "bar",
      mode: type === "line" ? "lines+markers" : undefined,
      x: labels,
      y: values,
      marker: type === "bar" ? { color: defaults.singleTraceColor } : undefined,
      line: type === "line" ? { color: defaults.singleTraceColor, width: 3 } : undefined
    }
  ];
}

function buildGroupedBarData(
  table: NormalizedTable,
  xKey: string | undefined,
  yKey: string | undefined,
  groupKey: string | undefined,
  defaults: ResolvedPlotlyDefaults
): Data[] {
  if (!groupKey) {
    return [
      {
        type: "bar",
        x: table.rows.map((row) => formatValue(row[xKey ?? ""])),
        y: table.rows.map((row) => Number(row[yKey ?? ""] ?? 0)),
        marker: { color: defaults.singleTraceColor }
      }
    ];
  }

  return uniqueValues(table, groupKey).map((group) => {
    const rows = table.rows.filter((row) => formatValue(row[groupKey]) === group);

    return {
      type: "bar",
      name: group,
      x: rows.map((row) => formatValue(row[xKey ?? ""])),
      y: rows.map((row) => Number(row[yKey ?? ""] ?? 0))
    };
  });
}

function buildBoxData(
  table: NormalizedTable,
  yKey: string | undefined,
  groupKey: string | undefined,
  defaults: ResolvedPlotlyDefaults
): Data[] {
  if (!groupKey) {
    return [
      {
        type: "box",
        y: table.rows.map((row) => Number(row[yKey ?? ""] ?? 0)),
        marker: { color: defaults.singleTraceColor }
      }
    ];
  }

  return uniqueValues(table, groupKey).map((group) => ({
    type: "box",
    name: group,
    y: table.rows
      .filter((row) => formatValue(row[groupKey]) === group)
      .map((row) => Number(row[yKey ?? ""] ?? 0))
  }));
}

function buildHeatmapData(
  table: NormalizedTable,
  xKey: string | undefined,
  yKey: string | undefined,
  zKey: string | undefined
): Data[] {
  const xValues = uniqueValues(table, xKey);
  const yValues = uniqueValues(table, yKey);
  const z = yValues.map((yValue) =>
    xValues.map((xValue) => {
      const row = table.rows.find(
        (candidate) =>
          formatValue(candidate[xKey ?? ""]) === xValue && formatValue(candidate[yKey ?? ""]) === yValue
      );

      return Number(row?.[zKey ?? ""] ?? 0);
    })
  );

  return [
    {
      type: "heatmap",
      x: xValues,
      y: yValues,
      z,
      colorscale: "YlOrRd"
    }
  ];
}

function buildSankeyData(
  table: NormalizedTable,
  sourceKey: string | undefined,
  targetKey: string | undefined,
  valueKey: string | undefined,
  defaults: ResolvedPlotlyDefaults
): Data[] {
  const labels = Array.from(
    new Set(
      table.rows.flatMap((row) => [formatValue(row[sourceKey ?? ""]), formatValue(row[targetKey ?? ""])])
    )
  ).filter(Boolean);
  const indexFor = (label: string) => labels.indexOf(label);

  return [
    {
      type: "sankey",
      node: {
        label: labels,
        color: labels.map((_, index) => colorAt(defaults, index))
      },
      link: {
        source: table.rows.map((row) => indexFor(formatValue(row[sourceKey ?? ""]))),
        target: table.rows.map((row) => indexFor(formatValue(row[targetKey ?? ""]))),
        value: table.rows.map((row) => Number(row[valueKey ?? ""] ?? 1))
      }
    }
  ];
}

function buildTimelineData(
  table: NormalizedTable,
  labelKey: string | undefined,
  startKey: string | undefined,
  endKey: string | undefined,
  defaults: ResolvedPlotlyDefaults
): Data[] {
  return [
    {
      type: "bar",
      orientation: "h",
      y: table.rows.map((row) => formatValue(row[labelKey ?? ""])),
      x: table.rows.map((row) => {
        const start = Date.parse(formatValue(row[startKey ?? ""]));
        const end = Date.parse(formatValue(row[endKey ?? ""]));

        return Number.isNaN(start) || Number.isNaN(end) ? 1 : Math.max(end - start, 1);
      }),
      base: table.rows.map((row) => formatValue(row[startKey ?? ""])),
      marker: { color: defaults.singleTraceColor }
    } as Data
  ];
}

async function renderPlotly(container: HTMLElement, figure: PlotlyFigure): Promise<void> {
  const plotlyModule = await import("plotly.js-dist-min");
  const plotly = ("default" in plotlyModule ? plotlyModule.default : plotlyModule) as PlotlyRuntime;

  await plotly.react(
    container,
    figure.data,
    {
      height: container.clientHeight || 352,
      ...figure.layout
    },
    figure.config
  );
}

function isJsdom(): boolean {
  return navigator.userAgent.toLowerCase().includes("jsdom");
}

function formatValue(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function hasCartesianAxes(type: VisualizationType): boolean {
  return !["table", "pie", "treemap", "sunburst", "sankey", "map"].includes(type);
}

function findNumericColumn(
  table: NormalizedTable,
  exclude: Array<string | undefined> = []
): string | undefined {
  return table.columns.find((column) => column.type === "number" && !exclude.includes(column.name))?.name;
}

function uniqueValues(table: NormalizedTable, key: string | undefined): string[] {
  if (!key) {
    return [];
  }

  return Array.from(new Set(table.rows.map((row) => formatValue(row[key])))).filter(Boolean);
}

function scaleMarkerSizes(values: number[]): number[] {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  const max = Math.max(...finiteValues, 1);
  const min = Math.min(...finiteValues, 0);
  const range = Math.max(max - min, 1);

  return values.map((value) => (Number.isFinite(value) ? 10 + ((value - min) / range) * 34 : 10));
}

function parseJsonObject(source: string | undefined, field: string): Record<string, unknown> {
  if (!source?.trim()) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new LodeonClientError("visualization.json_invalid", { field });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LodeonClientError("visualization.json_invalid", { field });
  }

  return parsed as Record<string, unknown>;
}

function parseJsonArray(source: string | undefined, field: string): unknown[] {
  if (!source?.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new LodeonClientError("visualization.json_invalid", { field });
  }

  if (!Array.isArray(parsed)) {
    throw new LodeonClientError("visualization.json_invalid", { field });
  }

  return parsed;
}

function plotlyValidationIssue(error: unknown, field: string): PlotlyJsonValidationIssue {
  if (error instanceof LodeonClientError) {
    return {
      code: error.code,
      variables: Object.fromEntries(
        Object.entries(error.variables).map(([key, value]) => [key, String(value)])
      )
    };
  }

  return {
    code: "visualization.json_invalid",
    variables: { field }
  };
}

function mergePlotlyObject<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  return Object.entries(override).reduce<Record<string, unknown>>(
    (merged, [key, value]) => {
      const baseValue = merged[key];

      merged[key] =
        isPlainObject(baseValue) && isPlainObject(value) ? mergePlotlyObject(baseValue, value) : value;
      return merged;
    },
    { ...base }
  ) as T;
}

function sanitizePlotlyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePlotlyValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, sanitizePlotlyValue(entry)])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
