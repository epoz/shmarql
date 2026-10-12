/** Declares the ambient TypeScript surface for rawgraphs. */

declare module "@rawgraphs/rawgraphs-core" {
  export function deserializeProject(source: string, charts: unknown[]): RawGraphsProject;
  export function chart(chartImplementation: unknown, config: RawGraphsChartConfig): RawGraphsChart;

  export type RawGraphsProject = {
    userInput: unknown;
    userData: Array<Record<string, unknown>>;
    userDataType: string;
    dataTypes: Record<string, unknown>;
    currentChart: RawGraphsChartImplementation;
    mapping: Record<string, unknown>;
    visualOptions: Record<string, unknown>;
  };

  export type RawGraphsChartImplementation = {
    metadata?: {
      id?: string;
      name?: string;
    };
    rawCustomChart?: unknown;
  };

  export type RawGraphsChartConfig = {
    data: Array<Record<string, unknown>>;
    dataTypes?: Record<string, unknown>;
    mapping?: Record<string, unknown>;
    visualOptions?: Record<string, unknown>;
  };

  export type RawGraphsChart = {
    renderToDOM(node: HTMLElement, dataReady?: unknown): unknown;
  };
}

declare module "@rawgraphs/rawgraphs-charts" {
  const charts: Record<string, unknown>;
  export default charts;
}

declare module "@rawgraphs/rawgraphs-calendar-heatmap" {
  export const calendarHeatmap: unknown;
}
