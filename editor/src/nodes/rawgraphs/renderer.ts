/** Owns deterministic Rawgraphs Special Node rendering from canonical inputs. */

import type { RawGraphsChartImplementation, RawGraphsProject } from "@rawgraphs/rawgraphs-core";
import { LodeonClientError } from "../../errors/client-error";

export type RawGraphsSummary = {
  version: string;
  chartId: string;
  chartName: string;
  rowCount: number;
  columnCount: number;
};

export type RawGraphsRenderResult = {
  summary: RawGraphsSummary;
  svg: string;
};

let chartImplementationsPromise: Promise<unknown[]> | null = null;

export async function renderRawGraphsProject(
  container: HTMLElement,
  projectJson: string
): Promise<RawGraphsRenderResult> {
  const trimmed = projectJson.trim();

  if (!trimmed) {
    throw new LodeonClientError("rawgraphs.project_empty");
  }

  const [core, chartImplementations] = await Promise.all([
    import("@rawgraphs/rawgraphs-core"),
    loadRawGraphsCharts()
  ]);
  const project = core.deserializeProject(trimmed, chartImplementations);
  const chart = core.chart(project.currentChart, {
    data: project.userData,
    dataTypes: project.dataTypes,
    mapping: project.mapping,
    visualOptions: project.visualOptions
  });

  container.innerHTML = "";
  chart.renderToDOM(container);

  const rendered = container.firstElementChild;

  if (!rendered) {
    throw new LodeonClientError("rawgraphs.render_failed", {
      externalError: "missing_svg"
    });
  }

  return {
    summary: summarizeRawGraphsProject(trimmed, project),
    svg: rendered.outerHTML
  };
}

export async function summarizeRawGraphsProjectJson(projectJson: string): Promise<RawGraphsSummary> {
  const [core, chartImplementations] = await Promise.all([
    import("@rawgraphs/rawgraphs-core"),
    loadRawGraphsCharts()
  ]);
  const project = core.deserializeProject(projectJson, chartImplementations);

  return summarizeRawGraphsProject(projectJson, project);
}

function summarizeRawGraphsProject(projectJson: string, project: RawGraphsProject): RawGraphsSummary {
  const parsed = parseProjectObject(projectJson);
  const chart = project.currentChart;
  const chartId = String(chart.metadata?.id ?? parsed.chart ?? "unknown");
  const chartName = String(chart.metadata?.name ?? chartId);
  const firstRow = project.userData[0] ?? {};

  return {
    version: String(parsed.version ?? "unknown"),
    chartId,
    chartName,
    rowCount: project.userData.length,
    columnCount: Object.keys(firstRow).length
  };
}

function parseProjectObject(projectJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(projectJson);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new LodeonClientError("rawgraphs.project_invalid", {
        externalError: "not_object"
      });
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof LodeonClientError) {
      throw error;
    }

    throw new LodeonClientError("rawgraphs.project_invalid", {
      externalError: error instanceof Error ? error.message : String(error)
    });
  }
}

async function loadRawGraphsCharts(): Promise<unknown[]> {
  if (!chartImplementationsPromise) {
    chartImplementationsPromise = Promise.all([
      import("@rawgraphs/rawgraphs-charts"),
      import("@rawgraphs/rawgraphs-calendar-heatmap")
    ]).then(([chartsModule, calendarModule]) => {
      const chartExports = Object.values(chartsModule).filter(isChartImplementation);
      const calendarHeatmap = (calendarModule as { calendarHeatmap?: unknown }).calendarHeatmap;

      return calendarHeatmap
        ? [...chartExports, calendarHeatmap].filter(isChartImplementation)
        : chartExports;
    });
  }

  return chartImplementationsPromise;
}

function isChartImplementation(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === "object" &&
      "metadata" in value &&
      (value as RawGraphsChartImplementation).metadata?.id
  );
}
