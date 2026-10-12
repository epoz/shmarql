import { describe, expect, it } from "vitest";
import { completeVisualizationMapping } from "@lodeon/nodes/visualization/mapping";
import { parseDelimitedTable } from "@lodeon/nodes/visualization/table-data";
import {
  createDefaultPlotlyJson,
  type VisualizationMapping,
  type VisualizationType
} from "@lodeon/nodes/visualization/renderer";

function table(source: string) {
  return parseDelimitedTable(source, ",");
}

describe("Visualization automatic mapping", () => {
  it.each([
    ["count,century\n12,1700\n8,1800", { label: "century", value: "count" }],
    ["century,count\n1700,12\n1800,8", { label: "century", value: "count" }],
    ["category,total\nPrint,12\nManuscript,8", { label: "category", value: "total" }]
  ])("maps pie measures and labels independently of numeric label types", (source, expected) => {
    expect(completeVisualizationMapping(table(source), "pie", {})).toMatchObject(expected);
  });

  it.each<Array<[VisualizationType, string, VisualizationMapping]>>([
    ["bar", "category,total\nPrint,12", { x: "category", y: "total" }],
    ["stackedBar", "category,total,series\nPrint,12,Internal", { x: "category", y: "total", group: "series" }],
    ["scatter", "x,y,label\n1,2,A", { x: "x", y: "y", text: "label" }],
    ["heatmap", "row,column,value\nA,B,4", { x: "row", y: "column", z: "value" }],
    ["treemap", "label,parent,total\nChild,Root,4", { label: "label", parent: "parent", value: "total" }]
  ])("applies the deterministic %s family policy", (chartType, source, expected) => {
    expect(completeVisualizationMapping(table(source), chartType, {})).toMatchObject(expected);
  });

  it("keeps every explicit user mapping authoritative", () => {
    const explicit = { label: "customLabel", value: "customValue", color: "customColor" };

    expect(
      completeVisualizationMapping(table("count,century\n12,1700"), "pie", explicit)
    ).toMatchObject(explicit);
  });

  it("does not mistake a second measure for a grouped-bar series", () => {
    expect(
      completeVisualizationMapping(
        table("category,total,external\nPrint,12,4\nManuscript,8,3"),
        "stackedBar",
        {}
      )
    ).toEqual({ x: "category", y: "total", group: undefined });
  });

  it("renders numeric pie categories as labels and counts as values", () => {
    const data = table("count,century\n12,1700\n8,1800");
    const mapping = completeVisualizationMapping(data, "pie", {});
    const figure = createDefaultPlotlyJson(data, "pie", mapping);

    expect(figure.data[0]).toMatchObject({
      labels: ["1700", "1800"],
      values: [12, 8]
    });
  });

  it("keeps missing values from changing column-role inference", () => {
    expect(
      completeVisualizationMapping(table("category,count\nA,\nB,5"), "pie", {})
    ).toMatchObject({ label: "category", value: "count" });
  });
});
