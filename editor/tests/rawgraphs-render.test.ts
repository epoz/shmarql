import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRawGraphsProject } from "@lodeon/nodes/rawgraphs/renderer";

describe("RAWGraphs renderer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a RAWGraphs project to SVG", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const host = document.createElement("div");
    const project = {
      version: "1.2",
      userInput: [
        { year: "1762", itemCount: "1" },
        { year: "1768", itemCount: "2" }
      ],
      userInputFormat: "json",
      dataSource: { type: "paste" },
      rawData: [
        ["1762", "1"],
        ["1768", "2"]
      ],
      parseError: null,
      parseOptions: {
        separator: ",",
        thousandsSeparator: ",",
        decimalsSeparator: ".",
        locale: "en",
        stackDimension: undefined,
        unstackedData: null,
        unstackedColumns: null
      },
      dataTypes: {
        year: {
          type: "number",
          locale: "en",
          decimal: ".",
          group: ",",
          numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
        },
        itemCount: {
          type: "number",
          locale: "en",
          decimal: ".",
          group: ",",
          numerals: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
        }
      },
      chart: "rawgraphs.barchart",
      mapping: {
        bars: {
          ids: ["1"],
          value: ["year"],
          isValid: true,
          mappedType: "number"
        },
        size: {
          ids: ["2"],
          value: ["itemCount"],
          isValid: true,
          mappedType: "number",
          config: {
            aggregation: ["sum"]
          }
        }
      },
      visualOptions: {
        width: 640,
        height: 360,
        background: "#ffffff",
        marginTop: 20,
        marginRight: 10,
        marginBottom: 40,
        marginLeft: 50,
        showLegend: false,
        padding: 3,
        barsOrientation: "vertical",
        sortBarsBy: "name",
        useSameScale: true,
        columnsNumber: 0,
        showGrid: false,
        colorScale: {
          scaleType: "ordinal",
          interpolator: "schemeCategory10",
          userScaleValues: [{ range: "#1f77b4", domain: "default" }],
          defaultColor: "#cccccc"
        }
      },
      customChart: null
    };

    const result = await renderRawGraphsProject(host, JSON.stringify(project));

    expect(result.summary.chartId).toBe("rawgraphs.barchart");
    expect(result.summary.rowCount).toBe(2);
    expect(result.svg).toContain("<svg");
    expect(host.querySelector("svg")).toBeTruthy();
  });
});
