import { describe, expect, expectTypeOf, it } from "vitest";
import {
  DEFAULT_VEROVIO_PLAYBACK_SETTINGS,
  EMPTY_VEROVIO_COMPARE_STATE,
  EMPTY_VEROVIO_ITEM_STATUS,
  VEROVIO_COMPARE_PLAYBACK_MODES,
  VEROVIO_DOCUMENT_LAYOUTS,
  VEROVIO_FENCE_NAME,
  VEROVIO_FIXED_SPARQL_VARIABLES,
  VEROVIO_NODE_TYPE_NAME,
  VEROVIO_RENDERER_NAME,
  VEROVIO_SOURCE_MODES,
  VEROVIO_SUPPORTED_FORMATS,
  VEROVIO_TEMPO_MULTIPLIERS,
  VEROVIO_VIEW_MODES,
  type VerovioNodeAttrs,
  type VerovioRenderSpec
} from "@lodeon/nodes/verovio/contracts";
import {
  VEROVIO_COMPARE_FIXTURE,
  VEROVIO_DIRECT_MEI,
  VEROVIO_DIRECT_PAE,
  VEROVIO_FILE_FIXTURE,
  VEROVIO_MULTI_ITEM_FIXTURE,
  VEROVIO_MULTI_PAGE_MEI
} from "./fixtures/verovio";

describe("Verovio Special Node contracts", () => {
  it("VRA-03 persists the honest node-wide volume contract", () => {
    expect(DEFAULT_VEROVIO_PLAYBACK_SETTINGS).toHaveProperty("volume", 0.8);
  });

  it("uses stable node, renderer, fence, format, and result-variable names", () => {
    expect(VEROVIO_NODE_TYPE_NAME).toBe("verovioNode");
    expect(VEROVIO_RENDERER_NAME).toBe("verovio");
    expect(VEROVIO_FENCE_NAME).toBe("lodeon-verovio");
    expect(VEROVIO_SUPPORTED_FORMATS).toEqual(["mei", "pae"]);
    expect(VEROVIO_SOURCE_MODES).toEqual(["direct", "file", "sparql"]);
    expect(VEROVIO_FIXED_SPARQL_VARIABLES).toEqual([
      "data",
      "format",
      "label",
      "resource",
      "resourceLabel"
    ]);
  });

  it("fixes the source and initial playback contracts without autoplay state", () => {
    expect(VEROVIO_FILE_FIXTURE).toEqual({
      name: "incipit.pae",
      format: "pae",
      data: VEROVIO_DIRECT_PAE
    });
    expect(VEROVIO_TEMPO_MULTIPLIERS).toEqual([0.5, 0.75, 1, 1.25, 1.5]);
    expect(DEFAULT_VEROVIO_PLAYBACK_SETTINGS).toEqual({
      tempoMultiplier: 1,
      loop: false,
      volume: 0.8
    });
    expect(DEFAULT_VEROVIO_PLAYBACK_SETTINGS).not.toHaveProperty("autoplay");
  });

  it("keeps Single, List, Grouped, and Compare as equal persisted view modes", () => {
    expect(VEROVIO_VIEW_MODES).toEqual(["single", "list", "grouped", "compare"]);
    expect(VEROVIO_DOCUMENT_LAYOUTS).toEqual(["responsive", "paginated"]);
    expect(EMPTY_VEROVIO_COMPARE_STATE).toEqual({
      aItemId: null,
      bItemId: null,
      synchronizedZoom: true,
      aZoom: 1,
      bZoom: 1,
      playbackMode: "a",
      loopSequence: false,
      tempoMultiplier: 1,
      targetKey: null,
      showTransposed: false
    });
    expect(VEROVIO_COMPARE_PLAYBACK_MODES).toEqual([
      "a",
      "b",
      "aThenB",
      "bThenA"
    ]);
  });

  it("keeps canonical source state separate from the renderer specification", () => {
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("inputData");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("fileName");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("query");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("result");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("knowledgeGraphProfileId");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("items");
    expectTypeOf<VerovioNodeAttrs>().toHaveProperty("viewConfig");

    expectTypeOf<VerovioRenderSpec>().not.toHaveProperty("inputData");
    expectTypeOf<VerovioRenderSpec>().not.toHaveProperty("fileName");
    expectTypeOf<VerovioRenderSpec>().not.toHaveProperty("query");
    expectTypeOf<VerovioRenderSpec>().not.toHaveProperty("result");
    expectTypeOf<VerovioRenderSpec>().not.toHaveProperty(
      "knowledgeGraphProfileId"
    );
    expectTypeOf<VerovioRenderSpec>().toHaveProperty("items");
    expectTypeOf<VerovioRenderSpec>().toHaveProperty("compare");
  });

  it("provides representative MEI, PAE, multi-page, warning, and error fixtures", () => {
    expect(VEROVIO_DIRECT_MEI).toContain("<mei");
    expect(VEROVIO_DIRECT_PAE).toContain("@data:");
    expect(VEROVIO_MULTI_PAGE_MEI).toContain("<pb/>");
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.some(
        (item) => item.status.state === "warning"
      )
    ).toBe(true);
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.some(
        (item) => item.status.state === "error"
      )
    ).toBe(true);
  });

  it("preserves row order, repeated resources, missing resources, and duplicates", () => {
    expect(VEROVIO_MULTI_ITEM_FIXTURE.map((item) => item.id)).toEqual([
      "item-a-1",
      "item-a-2",
      "item-ungrouped-1",
      "item-b-1",
      "item-duplicate-1",
      "item-warning",
      "item-error"
    ]);
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.filter(
        (item) => item.resource === "https://example.org/resource/a"
      )
    ).toHaveLength(3);
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.filter((item) => item.resource === null)
    ).toHaveLength(2);
    expect(VEROVIO_MULTI_ITEM_FIXTURE[0]?.bindings).toEqual(
      VEROVIO_MULTI_ITEM_FIXTURE[4]?.bindings
    );
  });

  it("allows optional fixed bindings and format auto-detection", () => {
    const optionalBindingFixture = VEROVIO_MULTI_ITEM_FIXTURE[2];

    expect(optionalBindingFixture).toMatchObject({
      format: null,
      label: null,
      resource: null,
      resourceLabel: null
    });
    expect(optionalBindingFixture?.data).toBe(VEROVIO_DIRECT_PAE);
  });

  it("keeps Compare candidates explicit and limited to two slots", () => {
    expect(VEROVIO_COMPARE_FIXTURE).toEqual({
      aItemId: "item-a-1",
      bItemId: "item-b-1"
    });
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.some(
        (item) => item.id === VEROVIO_COMPARE_FIXTURE.aItemId
      )
    ).toBe(true);
    expect(
      VEROVIO_MULTI_ITEM_FIXTURE.some(
        (item) => item.id === VEROVIO_COMPARE_FIXTURE.bItemId
      )
    ).toBe(true);
  });

  it("starts items and Compare in non-playing, unvalidated-safe states", () => {
    expect(EMPTY_VEROVIO_ITEM_STATUS).toEqual({
      state: "unvalidated",
      messages: []
    });
    expect(EMPTY_VEROVIO_COMPARE_STATE).not.toHaveProperty("playing");
    expect(EMPTY_VEROVIO_COMPARE_STATE).not.toHaveProperty("progress");
  });
});
