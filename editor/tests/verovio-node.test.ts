import { Editor, StarterKit } from "@lodeon/test-support/tiptap";
import { fireEvent, waitFor } from "@testing-library/dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalization } from "@lodeon/localization/runtime";
import {
  buildVerovioSpec,
  createVerovioNodeContent,
  VerovioNode,
  type VerovioNodeOptions,
} from "@lodeon/nodes/verovio/node-view";
import { setSpecialNodeLocalization } from "@lodeon/nodes/shared/node-view-controls";
import type {
  VerovioDocument,
  VerovioEngineAdapter,
  VerovioViewerSettings,
} from "@lodeon/nodes/verovio/engine";
import type { VerovioItem } from "@lodeon/nodes/verovio/contracts";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_DIRECT_PAE } from "./fixtures/verovio";
import { VEROVIO_DIRECT_MEI } from "./fixtures/verovio";

const runtime = defaultConfig.nodes.verovio;

describe("Verovio editor node", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setSpecialNodeLocalization(createLocalization(defaultConfig));
  });

  it("uses exactly one Run action plus the contextual SPARQL builder", () => {
    const { editor, host } = createEditor(fakeEngine());
    expect(host.querySelector('[data-verovio-action="validate"]')).toBeNull();
    for (const action of ["builder", "run"]) {
      expect(required(host, `[data-verovio-action='${action}']`).classList.contains("ld-node-run-button")).toBe(true);
    }
    expect(required<HTMLButtonElement>(host, '[data-verovio-action="run"]').hidden).toBe(false);
    expect(required<HTMLButtonElement>(host, '[data-verovio-action="builder"]').hidden).toBe(true);
    editor.destroy();
  });

  it("uses the established flat control grid and keeps every source value isolated", () => {
    const { editor, host } = createEditor(fakeEngine(), {
      inputData: "@data:direct/",
      query: "SELECT ?data WHERE { ?s ?p ?data }",
    });
    expect(host.querySelectorAll(".ld-verovio-control-section, legend")).toHaveLength(0);
    expect(labelled(host, "Visible metadata fields")).not.toBeNull();
    expect(labelled(host, "Caption")).not.toBeNull();
    expect(host.querySelectorAll('[data-verovio-source="direct"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-verovio-source="file"]')).toHaveLength(1);
    expect(host.querySelectorAll('[data-verovio-source="sparql"]')).toHaveLength(1);
    const source = labelled<HTMLSelectElement>(host, "Source");
    expect(required<HTMLTextAreaElement>(host, ".ld-verovio-data").value).toBe("@data:direct/");
    fireEvent.change(source, { target: { value: "sparql" } });
    expect(required(host, ".ld-verovio-sparql-source-editor").textContent).toContain("SELECT ?data");
    fireEvent.change(source, { target: { value: "direct" } });
    expect(required<HTMLTextAreaElement>(host, ".ld-verovio-data").value).toBe("@data:direct/");
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({
      inputData: "@data:direct/",
      query: "SELECT ?data WHERE { ?s ?p ?data }",
    });
    editor.destroy();
  });

  it("VRA-13 keeps view, viewer, playback, and Compare settings out of the authoring form", async () => {
    const { editor, host } = createEditor(fakeEngine());
    const controls = required(host, ".ld-verovio-controls");
    for (const duplicate of [
      "View", "Document layout", "Initial zoom", "Playback speed", "Loop",
      "Synchronize zoom", "Playback sequence", "Loop sequence",
    ]) {
      expect([...controls.querySelectorAll("label")].some((label) => label.textContent?.trim() === duplicate)).toBe(false);
    }

    fireEvent.input(required(host, ".ld-verovio-data"), { target: { value: VEROVIO_DIRECT_PAE } });
    fireEvent.click(required(host, "[data-verovio-action='run']"));
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1));

    const layout = labelled<HTMLSelectElement>(host, "Document layout");
    fireEvent.change(layout, { target: { value: "paginated" } });
    expect(editor.getJSON().content?.[0].attrs?.documentLayout).toBe("paginated");
    const tempo = required<HTMLSelectElement>(host, 'select[aria-label="Playback speed"]');
    fireEvent.change(tempo, { target: { value: "1.25" } });
    expect(editor.getJSON().content?.[0].attrs?.playback.tempoMultiplier).toBe(1.25);
    expect(host.querySelectorAll('select[aria-label="Playback speed"]')).toHaveLength(1);
    editor.destroy();
  });

  it("VRA-07 guards Visual Query Builder busy, stale, failure, and recovery states", async () => {
    const engine = fakeEngine();
    const pending = deferred<{ source: string; knowledgeGraphProfileId: string }>();
    const openBuilder = vi.fn()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValueOnce(new Error("builder failed"))
      .mockResolvedValueOnce({ source: "SELECT ?data WHERE { ?s ?p ?data }", knowledgeGraphProfileId: "kg-recovered" });
    const { editor, host } = createEditor(engine, { sourceMode: "sparql" }, {
      openBuilder,
    });
    const builder = required<HTMLButtonElement>(host, "[data-verovio-action='builder']");
    fireEvent.click(builder);
    await Promise.resolve();
    expect(builder.getAttribute("aria-busy")).toBe("true");
    expect(builder.disabled).toBe(true);
    const sourceMode = labelled<HTMLSelectElement>(host, "Source");
    fireEvent.change(sourceMode, { target: { value: "direct" } });
    expect(builder.hasAttribute("aria-busy")).toBe(false);
    pending.resolve({ source: "SELECT ?stale WHERE {}", knowledgeGraphProfileId: "kg-stale" });
    await Promise.resolve();
    expect(editor.getJSON().content?.[0].attrs?.query).not.toContain("stale");

    fireEvent.change(sourceMode, { target: { value: "sparql" } });
    fireEvent.click(builder);
    await waitFor(() => expect(required(host, ".ld-verovio-status").dataset.state).toBe("error"));
    expect(builder.disabled).toBe(false);
    fireEvent.click(builder);
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.knowledgeGraphProfileId).toBe("kg-recovered"));
    expect(required(host, ".ld-verovio-status").dataset.state).toBe("draft");
    editor.destroy();
  });

  it("VRA-08 marks file-read failures as coded error state and recovers after a valid selection", async () => {
    const engine = fakeEngine();
    const { editor, host } = createEditor(engine, { sourceMode: "file" });
    const input = labelled<HTMLInputElement>(host, "Music notation file");
    const failedRead = deferred<string>();
    const broken = new File(["broken"], "broken.pae", { type: "text/plain" });
    Object.defineProperty(broken, "text", { value: vi.fn(() => failedRead.promise) });
    fireEvent.change(input, { target: { files: [broken] } });
    expect(input.getAttribute("aria-busy")).toBe("true");
    expect(input.disabled).toBe(true);
    failedRead.reject(new Error("read failed"));

    await waitFor(() => expect(required(host, ".ld-verovio-status").dataset.state).toBe("error"));
    expect(input.hasAttribute("aria-busy")).toBe(false);
    expect(required(host, ".ld-verovio-status").textContent).toContain("verovio.file_read_failed");
    const valid = new File([VEROVIO_DIRECT_PAE], "valid.pae", { type: "text/plain" });
    Object.defineProperty(valid, "text", { value: vi.fn().mockResolvedValue(VEROVIO_DIRECT_PAE) });
    fireEvent.change(input, { target: { files: [valid] } });
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.fileName).toBe("valid.pae"));
    expect(required(host, ".ld-verovio-status").dataset.state).not.toBe("error");
    editor.destroy();
  });

  it("VRA-09 identifies the preview as the last validated result while a newer draft is pending", async () => {
    const engine = fakeEngine();
    const { editor, host } = createEditor(engine);
    const data = required<HTMLTextAreaElement>(host, ".ld-verovio-data");
    fireEvent.input(data, { target: { value: VEROVIO_DIRECT_PAE } });
    fireEvent.click(required(host, "[data-verovio-action='run']"));
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1));
    fireEvent.input(data, { target: { value: `${VEROVIO_DIRECT_PAE}\n@comment:new draft` } });

    expect(required(host, ".ld-verovio-preview").dataset.state).toBe("last-valid");
    expect(required(host, ".ld-verovio-status").dataset.state).toBe("draft");
    editor.destroy();
  });

  it("VRA-10 does not declare the published figure ready synchronously", async () => {
    const source = await import("@lodeon/nodes/verovio/shmarql-runtime?raw").then((module) => module.default);
    expect(source).not.toMatch(/status\.dataset\.state\s*=\s*["']ready["']\s*;/);
    expect(source).toMatch(/onRenderingReady|onStateChange|renderingState/);
  });

  it("creates canonical nested defaults and rebuilds its render specification", () => {
    const content = createVerovioNodeContent({
      playback: { tempoMultiplier: 0.75 } as never,
      compare: { synchronizedZoom: false } as never,
      viewConfig: { renderer: "verovio", initialZoom: 99 } as never,
    }, runtime, "culture-kg");

    expect(content.type).toBe("verovioNode");
    expect(content.attrs?.kind).toBe("verovio");
    expect(content.attrs?.knowledgeGraphProfileId).toBe("culture-kg");
    expect(content.attrs?.playback).toEqual({ tempoMultiplier: 0.75, loop: false, volume: runtime.playback.volume });
    expect(content.attrs?.compare).toMatchObject({
      synchronizedZoom: false,
      playbackMode: runtime.compare.playbackMode,
    });
    expect(content.attrs?.viewConfig).toEqual(buildVerovioSpec(content.attrs as never));
    expect(content.attrs?.viewConfig.initialZoom).toBe(runtime.initialZoom);
  });

  it("does not validate or render while typing and atomically replaces the valid item", async () => {
    const engine = fakeEngine();
    const { editor, host } = createEditor(engine);
    const data = required<HTMLTextAreaElement>(host, ".ld-verovio-data");
    const metadata = labelled<HTMLInputElement>(host, "Visible metadata fields");

    fireEvent.input(data, { target: { value: VEROVIO_DIRECT_PAE } });
    fireEvent.input(labelled(host, "Item label"), { target: { value: "Incipit" } });
    fireEvent.input(metadata, { target: { value: "composer," } });
    expect(metadata.value).toBe("composer,");
    fireEvent.input(metadata, { target: { value: "composer, date" } });
    expect(editor.getJSON().content?.[0].attrs?.visibleMetadataFields).toEqual(["composer", "date"]);
    expect(engine.validate).not.toHaveBeenCalled();
    expect(engine.open).not.toHaveBeenCalled();
    expect(editor.getJSON().content?.[0].attrs?.items).toEqual([]);

    fireEvent.click(required(host, "[data-verovio-action='run']"));
    await waitFor(() => expect(engine.validate).toHaveBeenCalledOnce());
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1));
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({
      selectedItemId: expect.any(String),
      items: [{ data: VEROVIO_DIRECT_PAE, format: "pae", label: "Incipit" }],
      viewConfig: { items: [{ data: VEROVIO_DIRECT_PAE, label: "Incipit" }] },
    });
    expect(host.querySelector(".ld-verovio-status")?.textContent).toBe("");
    editor.destroy();
  });

  it("preserves the last valid render on a blocking validation error and supports repeated validation", async () => {
    const engine = fakeEngine();
    vi.mocked(engine.validate)
      .mockResolvedValueOnce({ loaded: true, diagnostics: [{ severity: "warning", externalError: "review" }] })
      .mockResolvedValueOnce({ loaded: false, diagnostics: [{ severity: "error", externalError: "broken" }] })
      .mockResolvedValueOnce({ loaded: true, diagnostics: [] });
    const { editor, host } = createEditor(engine);
    const data = required<HTMLTextAreaElement>(host, ".ld-verovio-data");
    const validate = required<HTMLButtonElement>(host, "[data-verovio-action='run']");
    fireEvent.input(data, { target: { value: VEROVIO_DIRECT_PAE } });
    fireEvent.click(validate);
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1));
    expect(editor.getJSON().content?.[0].attrs?.items[0].status.state).toBe("warning");
    expect(host.querySelector(".ld-verovio-status")?.dataset.state).toBe("warning");
    const validItems = editor.getJSON().content?.[0].attrs?.items;

    fireEvent.input(data, { target: { value: "@clef:G-2\n@data:" } });
    fireEvent.click(validate);
    await waitFor(() => expect(engine.validate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(host.querySelector(".ld-verovio-status")?.dataset.state).toBe("error"));
    expect(editor.getJSON().content?.[0].attrs?.items).toEqual(validItems);

    fireEvent.input(data, { target: { value: VEROVIO_DIRECT_PAE } });
    fireEvent.click(validate);
    await waitFor(() => expect(engine.validate).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(validate.hasAttribute("aria-busy")).toBe(false));
    expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1);
    editor.destroy();
  });

  it("reads supported text files without rendering and ignores stale validation results", async () => {
    const first = deferred<{ loaded: boolean; diagnostics: [] }>();
    const engine = fakeEngine();
    vi.mocked(engine.validate)
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ loaded: true, diagnostics: [] });
    const { editor, host } = createEditor(engine, { sourceMode: "file" });
    const fileInput = labelled<HTMLInputElement>(host, "Music notation file");
    const selected = new File([VEROVIO_DIRECT_PAE], "incipit.pae", { type: "text/plain" });
    Object.defineProperty(selected, "text", { value: vi.fn().mockResolvedValue(VEROVIO_DIRECT_PAE) });
    fireEvent.change(fileInput, { target: { files: [selected] } });
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.fileName).toBe("incipit.pae"));
    expect(engine.validate).not.toHaveBeenCalled();

    const validate = required<HTMLButtonElement>(host, "[data-verovio-action='run']");
    fireEvent.click(validate);
    await waitFor(() => expect(engine.validate).toHaveBeenCalledOnce());
    fireEvent.input(labelled(host, "Item label"), { target: { value: "Newer label" } });
    expect(validate.disabled).toBe(false);
    fireEvent.click(validate);
    await waitFor(() => expect(engine.validate).toHaveBeenCalledTimes(2));
    first.resolve({ loaded: true, diagnostics: [] });
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(1));
    expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Newer label");
    editor.destroy();
  });

  it("uses the shared copy, move, collapse, visibility, and delete controls and cleans up", () => {
    const engine = fakeEngine();
    const host = document.createElement("div");
    const editor = new Editor({
      element: host,
      extensions: [StarterKit, configuredNode(engine)],
      content: {
        type: "doc",
        content: [
          createVerovioNodeContent({ title: "First" }, runtime),
          createVerovioNodeContent({ title: "Second", viewMode: "grouped", collapsed: true }, runtime),
        ],
      },
    });
    const second = host.querySelectorAll<HTMLElement>(".ld-verovio-node")[1]!;
    expect(second.contentEditable).toBe("false");
    expect(second.querySelector(".ld-verovio-preview")?.getAttribute("data-lodeon-node-control")).toBe("true");
    const releasedMouseup = vi.fn();
    second.addEventListener("mouseup", releasedMouseup, { once: true });
    second.querySelector(".ld-verovio-preview")?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(releasedMouseup).toHaveBeenCalledOnce();
    const beforeMutation = editor.getJSON();
    second.querySelector(".ld-verovio-preview")?.append(document.createElement("span"));
    expect(editor.getJSON()).toEqual(beforeMutation);
    expect(second.dataset.collapsed).toBe("true");
    fireEvent.click(second.querySelector("button[title='Expand node']")!);
    expect(editor.getJSON().content?.[1].attrs?.collapsed).toBe(false);
    expect(second.querySelector("button[title='Collapse node']")?.getAttribute("aria-label"))
      .toContain("music notation node");
    fireEvent.click(second.querySelector("button[title='Collapse node']")!);
    expect(second.querySelector("button[title='Expand node']")?.getAttribute("aria-label"))
      .toContain("music notation node");
    fireEvent.click(second.querySelector("button[title='Expand node']")!);
    expect(required(second, '[data-view-mode="grouped"]').getAttribute("aria-pressed")).toBe("true");

    const first = host.querySelectorAll<HTMLElement>(".ld-verovio-node")[0]!;
    fireEvent.click(first.querySelector("button[title='Exclude from rendered output']")!);
    expect(editor.getJSON().content?.[0].attrs?.excludeFromRender).toBe(true);
    fireEvent.click(first.querySelector("button[title='Copy node']")!);
    expect(editor.getJSON().content?.filter((entry) => entry.type === "verovioNode")).toHaveLength(3);
    fireEvent.click(host.querySelector(".ld-verovio-node button[title='Move down']")!);
    expect(editor.getJSON().content?.[1].attrs?.title).toBe("First");
    fireEvent.click(host.querySelector(".ld-verovio-node button[title='Delete node']")!);
    expect(editor.getJSON().content?.filter((entry) => entry.type === "verovioNode")).toHaveLength(2);
    editor.destroy();
    expect(engine.destroy).toHaveBeenCalled();
  });

  it("VRA-11 keeps exact totals in one presentation summary and operational state in one status", async () => {
    const engine = fakeEngine();
    const executeQuery = vi.fn().mockResolvedValue(successResult("https://kg-b.example/sparql", [
      row(VEROVIO_DIRECT_PAE, "First", "urn:resource:b", { composer: literal("Composer B") }),
      row(VEROVIO_DIRECT_MEI, "Second", null, { catalogueNumber: literal("CAT 2") }),
      row(VEROVIO_DIRECT_PAE, "First", "urn:resource:b", { composer: literal("Composer B") }),
    ]));
    const profiles = [
      { id: "kg-a", label: "Graph A", sparqlUrl: "https://kg-a.example/sparql" },
      { id: "kg-b", label: "Graph B", sparqlUrl: "https://kg-b.example/sparql" },
    ];
    const { editor, host } = createEditor(engine, {
      sourceMode: "sparql",
      query: "SELECT ?data ?format ?label ?resource ?resourceLabel ?composer WHERE { ?s ?p ?o }",
      knowledgeGraphProfileId: "kg-b",
      viewMode: "grouped",
    }, {
      executeQuery,
      resolveKnowledgeGraphProfile: (id) => profiles.find((profile) => profile.id === id)!,
    });

    fireEvent.click(required(host, "[data-verovio-action='run']"));
    await waitFor(() => expect(executeQuery).toHaveBeenCalledOnce());
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(3));
    expect(executeQuery).toHaveBeenCalledWith(
      "https://kg-b.example/sparql",
      expect.stringContaining("?data"),
      fetch,
    );
    const items = editor.getJSON().content?.[0].attrs?.items;
    expect(items.map((item: VerovioItem) => item.label)).toEqual(["First", "Second", "First"]);
    expect(items.map((item: VerovioItem) => item.resource)).toEqual(["urn:resource:b", null, "urn:resource:b"]);
    expect(items[0].id).not.toBe(items[2].id);
    expect(items[0].bindings.composer.value).toBe("Composer B");
    expect(items[1].bindings.catalogueNumber.value).toBe("CAT 2");
    expect(editor.getJSON().content?.[0].attrs?.viewMode).toBe("grouped");
    expect(host.querySelector(".ld-verovio-status")?.textContent).toBe("");
    expect(host.querySelector(".ld-verovio-status")?.textContent).not.toContain("3 notation items");
    expect(host.querySelector('[data-summary="items"]')?.textContent).toBe("Showing 1-3 of 3 items");
    expect(host.querySelector('[data-summary="resources"]')?.textContent).toBe("1 resource");
    expect(host.querySelectorAll(".ld-node-footer")).toHaveLength(1);
    expect(host.querySelector(".ld-verovio-result-footer")?.textContent).toContain("3 rows");
    editor.destroy();
  });

  it("derives the SPARQL presentation from the existing result-table page and filter", async () => {
    const engine = fakeEngine();
    const rows = Array.from({ length: 12 }, (_, index) =>
      row(VEROVIO_DIRECT_PAE, `Item ${index + 1}`, `urn:resource:${index + 1}`),
    );
    const executeQuery = vi.fn().mockResolvedValue(successResult(
      "https://generic.example/sparql",
      rows,
    ));
    const { editor, host } = createEditor(engine, {
      sourceMode: "sparql",
      query: "SELECT ?data ?label ?resource WHERE { ?s ?p ?data }",
      knowledgeGraphProfileId: "generic",
      viewMode: "list",
    }, {
      executeQuery,
      resolveKnowledgeGraphProfile: () => ({
        id: "generic",
        label: "Generic graph",
        sparqlUrl: "https://generic.example/sparql",
      }),
    });

    fireEvent.click(required(host, "[data-verovio-action='run']"));
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(12));
    await waitFor(() => expect(host.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(10));
    expect(host.querySelectorAll(".ld-verovio-presentation-item-selector .ld-verovio-item-selector-item")).toHaveLength(12);
    expect(host.querySelector(".ld-verovio-preview .ld-sparql-table-pager")).toBeNull();

    fireEvent.click(host.querySelectorAll<HTMLElement>(
      ".ld-verovio-presentation-item-selector .ld-verovio-item-selector-item",
    )[10]!);
    await waitFor(() => expect(host.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(2));
    expect(host.querySelector(".ld-verovio-preview")?.textContent).toContain("Item 11");
    expect(Array.from(host.querySelectorAll(".ld-verovio-collection-item .ld-verovio-item-title"),
      (title) => title.textContent)).toEqual(["11. Item 11", "12. Item 12"]);
    expect(host.querySelector('[data-summary="items"]')?.textContent).toBe("Showing 11-12 of 12 items");
    expect(required<HTMLInputElement>(host, "input[aria-label='SPARQL result page']").value).toBe("2");
    fireEvent.click(required(host, "[data-view-mode='grouped']"));
    await waitFor(() => expect(host.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(2));
    expect(host.querySelectorAll(".ld-verovio-presentation-item-selector .ld-verovio-item-selector-item")).toHaveLength(12);
    fireEvent.click(required(host, "[data-view-mode='list']"));

    fireEvent.change(required(host, ".ld-sparql-table-toolbar select"), {
      target: { value: "50" },
    });
    await waitFor(() => expect(host.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(12));

    fireEvent.input(required(host, "input[aria-label='Filter SPARQL results']"), {
      target: { value: "Item 12" },
    });
    await waitFor(() => expect(host.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(1));
    expect(host.querySelector(".ld-verovio-preview")?.textContent).toContain("Item 12");
    expect(editor.getJSON().content?.[0].attrs?.items).toHaveLength(12);
    editor.destroy();
  });

  it("preserves the last valid result across query failure and blocking rows, then recovers and supports repeated Run", async () => {
    const engine = fakeEngine();
    const executeQuery = vi.fn()
      .mockResolvedValueOnce(successResult("https://generic.example/sparql", [row(VEROVIO_DIRECT_PAE, "Initial", "urn:initial")]))
      .mockResolvedValueOnce({
        status: "error", endpointUrl: "https://generic.example/sparql",
        executedAt: "2026-08-08T00:00:01Z", durationMs: 4,
        code: "sparql.request_failed", variables: { externalError: "offline" }, message: "sparql.request_failed",
      })
      .mockResolvedValueOnce(successResult("https://generic.example/sparql", [{ label: literal("Missing data") }]))
      .mockResolvedValueOnce(successResult("https://generic.example/sparql", [row(VEROVIO_DIRECT_MEI, "Recovered", "urn:recovered")]))
      .mockResolvedValueOnce(successResult("https://generic.example/sparql", []));
    const { editor, host } = createEditor(engine, {
      sourceMode: "sparql", query: "SELECT ?data WHERE {}", knowledgeGraphProfileId: "generic",
    }, {
      executeQuery,
      resolveKnowledgeGraphProfile: () => ({ id: "generic", label: "Generic graph", sparqlUrl: "https://generic.example/sparql" }),
    });
    const run = required<HTMLButtonElement>(host, "[data-verovio-action='run']");

    fireEvent.click(run);
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Initial"));
    fireEvent.click(run);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(run.hasAttribute("aria-busy")).toBe(false));
    expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Initial");
    expect(host.querySelector(".ld-verovio-status")?.dataset.state).toBe("error");

    fireEvent.click(run);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(run.hasAttribute("aria-busy")).toBe(false));
    expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Initial");
    expect(host.querySelector(".ld-verovio-status")?.textContent).toContain("verovio.sparql_data_missing");

    fireEvent.click(run);
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Recovered"));
    fireEvent.click(run);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items).toEqual([]));
    expect(run.hasAttribute("aria-busy")).toBe(false);
    editor.destroy();
  });

  it("ignores stale query results and applies the Visual Query Builder output without rewriting it", async () => {
    const first = deferred<ReturnType<typeof successResult>>();
    const second = successResult("https://second.example/sparql", [row(VEROVIO_DIRECT_MEI, "Current", "urn:current")]);
    const executeQuery = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(second);
    const formatted = "SELECT ?data ?label\nWHERE {\n  ?incipit <urn:notation> ?data .\n}";
    const openBuilder = vi.fn().mockResolvedValue({ source: formatted, knowledgeGraphProfileId: "kg-second" });
    const engine = fakeEngine();
    const { editor, host } = createEditor(engine, {
      sourceMode: "sparql", query: "SELECT ?data WHERE { ?s ?p ?data }", knowledgeGraphProfileId: "kg-first",
    }, {
      executeQuery,
      openBuilder,
      defaultConfigId: "generic-builder",
      resolveKnowledgeGraphProfile: (id) => ({
        id: id ?? "", label: id ?? "", sparqlUrl: `https://${id === "kg-second" ? "second" : "first"}.example/sparql`,
      }),
    });
    const run = required<HTMLButtonElement>(host, "[data-verovio-action='run']");
    fireEvent.click(run);
    await waitFor(() => expect(executeQuery).toHaveBeenCalledOnce());
    fireEvent.click(required(host, "[data-verovio-action='builder']"));
    await waitFor(() => expect(openBuilder).toHaveBeenCalledOnce());
    expect(editor.getJSON().content?.[0].attrs).toMatchObject({
      query: formatted, knowledgeGraphProfileId: "kg-second",
    });
    expect(openBuilder).toHaveBeenCalledWith(expect.objectContaining({
      configId: "generic-builder", knowledgeGraphProfileId: "kg-first",
    }));
    expect(run.disabled).toBe(false);
    fireEvent.click(run);
    await waitFor(() => expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Current"));
    first.resolve(successResult("https://first.example/sparql", [row(VEROVIO_DIRECT_PAE, "Stale", "urn:stale")]));
    await Promise.resolve();
    expect(editor.getJSON().content?.[0].attrs?.items[0].label).toBe("Current");
    expect(executeQuery).toHaveBeenNthCalledWith(2, "https://second.example/sparql", formatted, fetch);
    editor.destroy();
  });

  it("keeps the Verovio Node implementation free of profile-specific query logic", async () => {
    const source = await import("@lodeon/nodes/verovio/node-view?raw").then((module) => module.default);
    expect(source).not.toMatch(/culture|iconclass|ontology|incipit pattern/i);
    expect(source).not.toMatch(/\bLIMIT\b|resultMapping|mapping/i);
  });
});

function configuredNode(
  engine: VerovioEngineAdapter,
  overrides: Partial<VerovioNodeOptions> = {},
) {
  return VerovioNode.configure({
    verovio: runtime,
    errors: defaultConfig.errors,
    i18n: createLocalization(defaultConfig),
    defaultKnowledgeGraphProfileId: "generic",
    createEngine: () => engine,
    ...overrides,
  });
}

function createEditor(
  engine: VerovioEngineAdapter,
  attrs: Record<string, unknown> = {},
  options: Partial<VerovioNodeOptions> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = new Editor({
    element: host,
    extensions: [StarterKit, configuredNode(engine, options)],
    content: { type: "doc", content: [createVerovioNodeContent(attrs, runtime)] },
  });
  return { editor, host };
}

function literal(value: string) {
  return { type: "literal", value };
}

function row(
  data: string,
  label: string,
  resource: string | null,
  extra: Record<string, ReturnType<typeof literal>> = {},
) {
  return {
    data: literal(data),
    format: literal(data.includes("<mei") ? "mei" : "pae"),
    label: literal(label),
    resource: resource ? { type: "uri", value: resource } : null,
    resourceLabel: resource ? literal(`${label} resource`) : null,
    ...extra,
  };
}

function successResult(endpointUrl: string, rows: ReturnType<typeof row>[] | Array<Record<string, ReturnType<typeof literal> | null>>) {
  return {
    status: "success" as const,
    endpointUrl,
    executedAt: "2026-08-08T00:00:00Z",
    durationMs: 3,
    variables: Array.from(new Set(rows.flatMap((entry) => Object.keys(entry)))),
    rows,
  };
}

function fakeEngine(): VerovioEngineAdapter {
  return {
    version: "6.2.0-test",
    cachedViewerCount: 0,
    validate: vi.fn().mockResolvedValue({ loaded: true, diagnostics: [] }),
    open: vi.fn(async (_key: string, item: VerovioItem, settings: VerovioViewerSettings) => fakeDocument(item, settings)),
    release: vi.fn(),
    destroy: vi.fn(),
  };
}

function fakeDocument(item: VerovioItem, settings: VerovioViewerSettings): VerovioDocument {
  return {
    itemId: item.id, sourceData: item.data, format: item.format!, settings,
    targetKey: null, pageCount: 1, renderPage: () => `<svg data-item="${item.id}"></svg>`,
    relayout: vi.fn(), createOriginalDownload: () => ({ blob: new Blob(), fileName: "original" }),
    createNormalizedMeiDownload: () => ({ blob: new Blob(), fileName: "normalized.mei" }),
    renderMidi: () => new Uint8Array(), elementsAtTime: vi.fn(), timeForElement: vi.fn(),
    timesForElement: vi.fn(), pageWithElement: vi.fn(), transpose: vi.fn(),
  };
}

function labelled<T extends HTMLElement>(root: ParentNode, text: string): T {
  const label = Array.from(root.querySelectorAll("label")).find((candidate) =>
    candidate.querySelector(":scope > span")?.textContent === text,
  );
  const element = label?.querySelector<T>("input, textarea, select");
  if (!element) throw new Error(text);
  return element;
}

function required<T extends Element = Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(selector);
  return element;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => { resolve = next; reject = fail; });
  return { promise, resolve, reject };
}
