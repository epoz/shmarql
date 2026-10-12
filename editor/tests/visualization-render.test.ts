import { describe, expect, it } from "vitest";
import { createDefaultPlotlyJson, type VisualizationType } from "@lodeon/nodes/visualization/renderer";
import { parseDelimitedTable } from "@lodeon/nodes/visualization/table-data";

describe("Visualization Plotly defaults", () => {
  const table = parseDelimitedTable(
    [
      "label,value,group,size,parent,source,target,start,end,lat,lon",
      "A,12,G1,30,,Org,Project,2024-01-01,2024-02-01,49.9,8.2",
      "B,8,G2,20,A,Project,Output,2024-02-01,2024-03-01,50.1,8.4",
      "C,15,G1,40,A,Org,Output,2024-03-01,2024-04-01,50.2,8.6"
    ].join("\n"),
    ","
  );

  const cases: Array<[VisualizationType, string]> = [
    ["table", "table"],
    ["bar", "bar"],
    ["line", "scatter"],
    ["pie", "pie"],
    ["scatter", "scatter"],
    ["bubble", "scatter"],
    ["horizontalBar", "bar"],
    ["groupedBar", "bar"],
    ["stackedBar", "bar"],
    ["area", "scatter"],
    ["histogram", "histogram"],
    ["box", "box"],
    ["heatmap", "heatmap"],
    ["treemap", "treemap"],
    ["sunburst", "sunburst"],
    ["sankey", "sankey"],
    ["timeline", "bar"],
    ["map", "scattergeo"]
  ];

  it.each(cases)("creates a %s default Plotly figure", (type, traceType) => {
    const figure = createDefaultPlotlyJson(table, type, {
      x: "label",
      y: "value",
      label: "label",
      value: "value",
      group: "group",
      size: "size",
      parent: "parent",
      source: "source",
      target: "target",
      start: "start",
      end: "end",
      lat: "lat",
      lon: "lon"
    });

    expect(figure.data.length).toBeGreaterThan(0);
    expect(figure.data[0]?.type).toBe(traceType);
    expect(figure.config.responsive).toBe(true);
  });

  it("sets layout modes for grouped and stacked bars", () => {
    expect(createDefaultPlotlyJson(table, "groupedBar", {}).layout.barmode).toBe(
      "group"
    );
    expect(createDefaultPlotlyJson(table, "stackedBar", {}).layout.barmode).toBe(
      "stack"
    );
  });

  it("adds geo layout for map defaults", () => {
    expect(createDefaultPlotlyJson(table, "map", {}).layout.geo).toBeTruthy();
  });

  it("uses colorblind-safe Okabe-Ito colors by default", () => {
    const figure = createDefaultPlotlyJson(table, "bar", {
      x: "label",
      y: "value"
    });

    expect(figure.layout.colorway).toEqual([
      "#000000",
      "#E69F00",
      "#56B4E9",
      "#009E73",
      "#F0E442",
      "#0072B2",
      "#D55E00",
      "#CC79A7"
    ]);
    expect(figure.data[0]?.marker).toEqual({ color: "#0072B2" });
  });

  it("applies configured Plotly defaults", () => {
    const figure = createDefaultPlotlyJson(
      table,
      "bar",
      {
        x: "label",
        y: "value"
      },
      {
        colorway: ["#111111", "#222222"],
        singleTraceColor: "#abcdef",
        layout: {
          paper_bgcolor: "#f5f5f5",
          font: {
            color: "#333333"
          }
        },
        config: {
          displaylogo: true
        }
      }
    );

    expect(figure.layout.colorway).toEqual(["#111111", "#222222"]);
    expect(figure.layout.paper_bgcolor).toBe("#f5f5f5");
    expect(figure.layout.font).toEqual({
      family: "Inter, system-ui, sans-serif",
      color: "#333333"
    });
    expect(figure.config.displaylogo).toBe(true);
    expect(figure.config.responsive).toBe(true);
    expect(figure.data[0]?.marker).toEqual({ color: "#abcdef" });
  });
});
