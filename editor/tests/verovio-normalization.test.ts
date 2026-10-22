import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "./fixtures/config";
import {
  VEROVIO_DIRECT_MEI,
  VEROVIO_DIRECT_PAE,
  VEROVIO_MULTI_ITEM_FIXTURE,
  VEROVIO_MULTI_PAGE_MEI
} from "./fixtures/verovio";
import {
  detectVerovioFormat,
  groupVerovioItems,
  normalizeDirectVerovioInput,
  normalizeVerovioFileInput,
  normalizeVerovioSparqlRows,
  type VerovioInputValidator
} from "@lodeon/nodes/verovio/normalization";
import type { NormalizedSparqlRow } from "@lodeon/nodes/sparql/api-client";

const literal = (value: string) => ({ type: "literal", value });
const uri = (value: string) => ({ type: "uri", value });
const runtime = defaultConfig.nodes.verovio;
const validValidator: VerovioInputValidator = {
  validate: vi.fn(() => ({ loaded: true, diagnostics: [] }))
};

describe("Verovio item normalization", () => {
  it("detects complete MEI and PAE without changing the source text", async () => {
    const meiWithBom = `\uFEFF  ${VEROVIO_DIRECT_MEI}`;
    expect(detectVerovioFormat(meiWithBom)).toBe("mei");
    expect(detectVerovioFormat(`<!-- source note -->\n<mei:mei xmlns:mei="http://www.music-encoding.org/ns/mei"/>`)).toBe("mei");
    expect(detectVerovioFormat(VEROVIO_DIRECT_PAE)).toBe("pae");
    expect(detectVerovioFormat("C D E F")).toBeNull();

    const item = await normalizeDirectVerovioInput(
      { data: meiWithBom, label: "  Incipit  ", resource: " urn:work:1 " },
      runtime,
      validValidator
    );

    expect(item.data).toBe(meiWithBom);
    expect(item.format).toBe("mei");
    expect(item.label).toBe("Incipit");
    expect(item.resource).toBe("urn:work:1");
    expect(item.bindings).toEqual({});
    expect(item.status).toEqual({ state: "ready", messages: [] });
  });

  it("normalizes file input through the same canonical contract", async () => {
    const first = await normalizeVerovioFileInput(
      { fileName: "incipit.pae", data: VEROVIO_DIRECT_PAE, format: "PAE" },
      runtime,
      validValidator
    );
    const second = await normalizeVerovioFileInput(
      { fileName: "incipit.pae", data: VEROVIO_DIRECT_PAE, format: "pae" },
      runtime,
      validValidator
    );

    expect(first.format).toBe("pae");
    expect(first.data).toBe(VEROVIO_DIRECT_PAE);
    expect(first.id).toBe(second.id);
  });

  it("preserves SPARQL row order, all bindings, and exact duplicate rows", async () => {
    const duplicate: NormalizedSparqlRow = {
      data: literal(VEROVIO_DIRECT_PAE),
      format: literal("pae"),
      label: literal("First notation"),
      resource: uri("https://example.org/resource/a"),
      resourceLabel: literal("Resource A"),
      category: literal("alpha"),
      absent: null
    };
    const rows: NormalizedSparqlRow[] = [
      duplicate,
      {
        data: literal(VEROVIO_MULTI_PAGE_MEI),
        label: literal("Second notation"),
        resource: uri("https://example.org/resource/b"),
        sequence: literal("2")
      },
      { ...duplicate, data: { ...duplicate.data! } }
    ];
    const snapshot = structuredClone(rows);
    const items = await normalizeVerovioSparqlRows(rows, runtime, validValidator);

    expect(items.map(({ label }) => label)).toEqual([
      "First notation",
      "Second notation",
      "First notation"
    ]);
    expect(items[0]?.bindings).toEqual({
      data: duplicate.data,
      format: duplicate.format,
      label: duplicate.label,
      resource: duplicate.resource,
      resourceLabel: duplicate.resourceLabel,
      category: duplicate.category
    });
    expect(items[0]?.bindings).not.toHaveProperty("absent");
    expect(items[1]?.bindings.sequence?.value).toBe("2");
    expect(items[2]?.bindings).toEqual(items[0]?.bindings);
    expect(items[0]?.data).toBe(items[2]?.data);
    expect(items[0]?.id).not.toBe(items[2]?.id);
    expect(items[2]?.id).toBe(`${items[0]?.id}-2`);
    expect(rows).toEqual(snapshot);
  });

  it("validates large SPARQL results with bounded concurrency and preserves order", async () => {
    const gates: Array<ReturnType<typeof deferredValidation>> = [];
    let created = 0;
    let active = 0;
    let maximumActive = 0;
    const validator: VerovioInputValidator = {
      validate: vi.fn(() => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const gate = deferredValidation();
        created += 1;
        gates.push(gate);
        return gate.promise.finally(() => { active -= 1; });
      })
    };
    const rows = Array.from({ length: 12 }, (_, index) => ({
      data: literal(VEROVIO_DIRECT_PAE),
      label: literal(`Item ${index + 1}`)
    }));
    const pending = normalizeVerovioSparqlRows(
      rows,
      { ...runtime, validationConcurrency: 2 },
      validator
    );

    while (created < rows.length) {
      await Promise.resolve();
      for (const gate of gates.splice(0)) gate.resolve({ loaded: true, diagnostics: [] });
    }
    for (const gate of gates.splice(0)) gate.resolve({ loaded: true, diagnostics: [] });
    const items = await pending;

    expect(maximumActive).toBe(2);
    expect(items.map(({ label }) => label)).toEqual(rows.map((row) => row.label.value));
  });

  it("stops scheduling additional validation when a SPARQL run becomes stale", async () => {
    const gates: Array<ReturnType<typeof deferredValidation>> = [];
    let current = true;
    const validator: VerovioInputValidator = {
      validate: vi.fn(() => {
        const gate = deferredValidation();
        gates.push(gate);
        return gate.promise;
      })
    };
    const pending = normalizeVerovioSparqlRows(
      Array.from({ length: 20 }, () => ({ data: literal(VEROVIO_DIRECT_PAE) })),
      { ...runtime, validationConcurrency: 2 },
      validator,
      { shouldContinue: () => current }
    );
    await Promise.resolve();
    expect(validator.validate).toHaveBeenCalledTimes(2);
    current = false;
    for (const gate of gates) gate.resolve({ loaded: true, diagnostics: [] });

    await expect(pending).rejects.toThrow("verovio.normalization_cancelled");
    expect(validator.validate).toHaveBeenCalledTimes(2);
  });

  it("derives ids independently of binding insertion order", async () => {
    const left = {
      data: literal(VEROVIO_DIRECT_MEI),
      label: literal("Ordered"),
      resource: uri("urn:work")
    };
    const right = {
      resource: uri("urn:work"),
      label: literal("Ordered"),
      data: literal(VEROVIO_DIRECT_MEI)
    };

    const [leftItem] = await normalizeVerovioSparqlRows([left], runtime, validValidator);
    const [rightItem] = await normalizeVerovioSparqlRows([right], runtime, validValidator);
    expect(leftItem?.id).toBe(rightItem?.id);
  });

  it("groups by exact resource in first-occurrence order with one Ungrouped group", () => {
    const groups = groupVerovioItems(VEROVIO_MULTI_ITEM_FIXTURE);

    expect(groups.map(({ resource }) => resource)).toEqual([
      "https://example.org/resource/a",
      null,
      "https://example.org/resource/b",
      "https://example.org/resource/c"
    ]);
    expect(groups[0]?.items.map(({ id }) => id)).toEqual([
      "item-a-1",
      "item-a-2",
      "item-duplicate-1"
    ]);
    expect(groups[1]?.items.map(({ id }) => id)).toEqual([
      "item-ungrouped-1",
      "item-warning"
    ]);
    expect(groups.flatMap(({ items }) => items).map(({ id }) => id).sort()).toEqual(
      VEROVIO_MULTI_ITEM_FIXTURE.map(({ id }) => id).sort()
    );
    expect(groups[0]?.resourceLabel).toBe("Resource A");
  });

  it("keeps missing required SPARQL data as a visible errored item", async () => {
    const validator = { validate: vi.fn() } as unknown as VerovioInputValidator;
    const items = await normalizeVerovioSparqlRows(
      [{ label: literal("Missing data"), note: literal("preserved") }],
      runtime,
      validator
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.data).toBe("");
    expect(items[0]?.bindings.note?.value).toBe("preserved");
    expect(items[0]?.status).toMatchObject({
      state: "error",
      messages: [{ code: "verovio.sparql_data_missing", location: { row: 1 } }]
    });
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("keeps an explicitly empty direct input as a visible errored item", async () => {
    const validator = { validate: vi.fn() } as unknown as VerovioInputValidator;
    const item = await normalizeDirectVerovioInput(
      { data: "", format: "mei" }, runtime, validator
    );

    expect(item.status.messages[0]?.code).toBe("verovio.input_missing");
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("rejects unsupported declarations and failed auto-detection per item", async () => {
    const validator = { validate: vi.fn() } as unknown as VerovioInputValidator;
    const items = await normalizeVerovioSparqlRows(
      [
        { data: literal(VEROVIO_DIRECT_MEI), format: literal("musicxml") },
        { data: literal("C D E F") }
      ],
      runtime,
      validator
    );

    expect(items.map(({ status }) => status.messages[0]?.variables.format)).toEqual([
      "musicxml",
      "auto"
    ]);
    expect(items.every(({ status }) =>
      status.state === "error" && status.messages[0]?.code === "verovio.format_unsupported"
    )).toBe(true);
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("accepts controlled SPARQL format values case-insensitively", async () => {
    const [item] = await normalizeVerovioSparqlRows(
      [{ data: literal(VEROVIO_DIRECT_PAE), format: literal(" PAE ") }],
      runtime,
      validValidator
    );

    expect(item?.format).toBe("pae");
    expect(item?.bindings.format?.value).toBe(" PAE ");
  });

  it("measures UTF-8 bytes and never truncates oversized input", async () => {
    const data = `<mei>${"🎵".repeat(20)}</mei>`;
    const validator = { validate: vi.fn() } as unknown as VerovioInputValidator;
    const item = await normalizeDirectVerovioInput(
      { data, format: "mei" },
      { maxInputBytesPerItem: 40 },
      validator
    );

    expect(item.data).toBe(data);
    expect(item.status.messages[0]).toMatchObject({
      code: "verovio.input_too_large",
      variables: { actualBytes: new TextEncoder().encode(data).byteLength, maximumBytes: 40 }
    });
    expect(validator.validate).not.toHaveBeenCalled();
  });

  it("classifies PAE and MEI warnings without blocking rendering", async () => {
    const paeValidator: VerovioInputValidator = {
      validate: () => ({
        loaded: true,
        diagnostics: [{
          severity: "warning",
          externalError: "accidental placement",
          location: { row: 4, column: 8 }
        }]
      })
    };
    const meiValidator: VerovioInputValidator = {
      validate: () => ({
        loaded: true,
        diagnostics: [{ severity: "warning", externalError: "header omitted" }]
      })
    };

    const pae = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_PAE }, runtime, paeValidator
    );
    const mei = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_MEI }, runtime, meiValidator
    );

    expect(pae.status).toMatchObject({
      state: "warning",
      messages: [{
        code: "verovio.pae_warning",
        severity: "warning",
        variables: { row: 4, column: 8 },
        location: { row: 4, column: 8 }
      }]
    });
    expect(mei.status.messages[0]?.code).toBe("verovio.input_warning");
  });

  it("classifies loading failures and thrown engine diagnostics as blocking", async () => {
    const unloaded = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_MEI },
      runtime,
      { validate: () => ({ loaded: false, diagnostics: [] }) }
    );
    const diagnosed = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_MEI },
      runtime,
      {
        validate: () => ({
          loaded: false,
          diagnostics: [{ severity: "error", externalError: "scoreDef missing" }]
        })
      }
    );
    const thrown = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_MEI },
      runtime,
      { validate: () => { throw new Error("engine unavailable"); } }
    );

    for (const item of [unloaded, diagnosed, thrown]) {
      expect(item.status.state).toBe("error");
      expect(item.status.messages[0]?.code).toBe("verovio.input_invalid");
    }
    expect(diagnosed.status.messages[0]?.variables.externalError).toBe("scoreDef missing");
    expect(thrown.status.messages[0]?.variables.externalError).toBe("engine unavailable");
  });

  it("has no DOM, network, TipTap, endpoint, or ontology dependency", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/nodes/verovio/normalization.ts"),
      "utf8"
    );

    for (const forbidden of [
      "document.", "window.", "fetch(", "@tiptap", "sparqlUrl",
      "example.org", "schema.org", "EX_"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function deferredValidation() {
  let resolve!: (value: { loaded: boolean; diagnostics: [] }) => void;
  const promise = new Promise<{ loaded: boolean; diagnostics: [] }>((done) => { resolve = done; });
  return { promise, resolve };
}
