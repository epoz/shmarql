import { describe, expect, it, vi } from "vitest";
import { LodeonClientError } from "@lodeon/errors/client-error";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_DIRECT_MEI, VEROVIO_DIRECT_PAE } from "./fixtures/verovio";
import {
  createVerovioEngineAdapter,
  observeVerovioContainer,
  sanitizeVerovioSvg,
  validateViewerSettings,
  type VerovioViewerSettings
} from "@lodeon/nodes/verovio/engine";
import type { VerovioItem } from "@lodeon/nodes/verovio/contracts";
import { normalizeDirectVerovioInput } from "@lodeon/nodes/verovio/normalization";

const settings: VerovioViewerSettings = {
  documentLayout: "paginated",
  zoom: 1,
  containerWidth: 800,
  paginatedPageHeight: 1400
};

describe("Verovio engine adapter", () => {
  it("runs the pinned browser engine end to end with auto-detected source", async () => {
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio);
    const item = await normalizeDirectVerovioInput(
      { data: VEROVIO_DIRECT_MEI, label: "Runtime fixture" },
      defaultConfig.nodes.verovio,
      adapter
    );

    expect(item.format).toBe("mei");
    expect(item.status.state).toBe("ready");
    const document = await adapter.open("runtime-viewer", item, settings);
    expect(adapter.version).toMatch(/^6\.2\.0(?:-|$)/);
    expect(document.pageCount).toBeGreaterThan(0);
    expect(document.renderPage(1)).toContain("<svg");
    expect(await readBlob(document.createNormalizedMeiDownload().blob)).toContain("<mei");
    expect(new TextDecoder().decode(document.renderMidi().slice(0, 4))).toBe("MThd");
    expect(document.pageWithElement("note-1")).toBe(1);
    document.transpose("D");
    expect(document.targetKey).toBe("D");
    document.transpose(null);
    expect(document.sourceData).toBe(VEROVIO_DIRECT_MEI);
    adapter.destroy();
    expect(adapter.cachedViewerCount).toBe(0);
  }, 30_000);

  it("observes usable container widths once and disconnects cleanly", () => {
    const container = document.createElement("div");
    const widths: number[] = [];
    let callback!: (entries: ResizeObserverEntry[]) => void;
    const observer = {
      observe: vi.fn(),
      disconnect: vi.fn()
    };
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 800
    } as DOMRect);

    const cleanup = observeVerovioContainer(
      container,
      (width) => widths.push(width),
      (nextCallback) => {
        callback = nextCallback;
        return observer;
      }
    );

    expect(observer.observe).toHaveBeenCalledWith(container);
    expect(widths).toEqual([800]);
    callback([{ target: container, contentRect: { width: 800 } } as ResizeObserverEntry]);
    callback([{ target: container, contentRect: { width: 1000 } } as ResizeObserverEntry]);
    callback([{ target: container, contentRect: { width: 100 } } as ResizeObserverEntry]);
    expect(widths).toEqual([800, 1000]);

    cleanup();
    cleanup();
    callback([{ target: container, contentRect: { width: 1200 } } as ResizeObserverEntry]);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(widths).toEqual([800, 1000]);
  });

  it("loads lazily, validates PAE diagnostics, and destroys validation toolkits", async () => {
    const factory = fakeBindingsFactory({
      paeValidation: { warnings: [{ message: "barline", row: 4, column: 7 }] },
      log: "[Warning] Header omitted"
    });
    const loader = vi.fn(async () => factory.bindings);
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio, {
      loadBindings: loader
    });

    expect(loader).not.toHaveBeenCalled();
    const validation = await adapter.validate(VEROVIO_DIRECT_PAE, "pae");

    expect(loader).toHaveBeenCalledTimes(1);
    expect(validation.loaded).toBe(true);
    expect(validation.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "warning",
        externalError: "barline",
        location: { row: 4, column: 7 }
      }),
      { severity: "warning", externalError: "Header omitted" }
    ]));
    expect(factory.toolkits[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(adapter.version).toBe("6.2.0-test");
    adapter.destroy();
  });

  it("renders sanitized pages and exposes derived downloads, MIDI, timing, and layout", async () => {
    const factory = fakeBindingsFactory();
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio, {
      loadBindings: async () => factory.bindings
    });
    const item = readyItem("item-a", VEROVIO_DIRECT_MEI, "mei");
    const document = await adapter.open("viewer-a", item, settings);
    expect(factory.toolkits[0]?.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({ pageHeight: 1400 }));

    expect(document.sourceData).toBe(VEROVIO_DIRECT_MEI);
    expect(document.pageCount).toBe(2);
    const svg = document.renderPage(1);
    expect(svg).toContain("<svg");
    expect(svg).toContain('href="#glyph"');
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("https://evil.example");

    const original = document.createOriginalDownload();
    const normalized = document.createNormalizedMeiDownload();
    expect(original.fileName).toBe("item-a.mei");
    expect(original.blob.type).toBe("application/mei+xml;charset=utf-8");
    expect(await readBlob(original.blob)).toBe(VEROVIO_DIRECT_MEI);
    expect(normalized.fileName).toBe("item-a.normalized.mei");
    expect(await readBlob(normalized.blob)).toContain("normalized");
    expect(new TextDecoder().decode(document.renderMidi().slice(0, 4))).toBe("MThd");
    expect(document.elementsAtTime(500)).toEqual({
      notes: ["note-1"],
      chords: [],
      rests: [],
      measure: "measure-1",
      page: 1
    });
    expect(document.timeForElement(" note-1 ")).toBe(250);
    expect(document.timesForElement("note-1")).toEqual({ on: [250], off: [750] });
    expect(document.pageWithElement("measure-2")).toBe(2);

    document.relayout({ documentLayout: "responsive", zoom: 1.25, containerWidth: 1000, paginatedPageHeight: 2200 });
    expect(document.settings).toEqual({
      documentLayout: "responsive",
      zoom: 1.25,
      containerWidth: 1000,
      paginatedPageHeight: 2200
    });
    expect(factory.toolkits[0]?.redoLayout).toHaveBeenCalledTimes(1);
    expect(factory.toolkits[0]?.setOptions).toHaveBeenLastCalledWith(expect.objectContaining({
      breaks: "none",
      adjustPageHeight: true,
      scale: 50,
      pageWidth: 800
    }));

    document.transpose("D");
    expect(document.targetKey).toBe("D");
    expect(document.sourceData).toBe(VEROVIO_DIRECT_MEI);
    expect(factory.toolkits[0]?.setOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ transpose: "D" })
    );
    document.transpose(null);
    expect(document.targetKey).toBeNull();
    expect(factory.toolkits[0]?.setOptions).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ transpose: expect.anything() })
    );

    adapter.destroy();
    expect(factory.toolkits[0]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("uses a bounded LRU viewer cache without limiting items", async () => {
    const factory = fakeBindingsFactory();
    const adapter = createVerovioEngineAdapter(
      { ...defaultConfig.nodes.verovio, viewerCacheSize: 2 },
      { loadBindings: async () => factory.bindings }
    );
    const first = await adapter.open("first-viewer", readyItem("first"), settings);
    const second = await adapter.open("second-viewer", readyItem("second"), settings);
    await adapter.open("first-viewer", readyItem("first"), settings);
    const third = await adapter.open("third-viewer", readyItem("third"), settings);

    expect(adapter.cachedViewerCount).toBe(2);
    expect(first.renderPage(1)).toContain("<svg");
    expect(third.renderPage(1)).toContain("<svg");
    expect(() => second.renderPage(1)).toThrowError(LodeonClientError);
    expect(factory.toolkits[1]?.destroy).toHaveBeenCalledTimes(1);

    const reopened = await adapter.open("second-viewer", readyItem("second"), settings);
    expect(reopened.renderPage(1)).toContain("<svg");
    expect(adapter.cachedViewerCount).toBe(2);
    expect(factory.toolkits).toHaveLength(4);
    adapter.destroy();
    expect(factory.toolkits.every((toolkit) =>
      vi.mocked(toolkit.destroy).mock.calls.length === 1
    )).toBe(true);
  });

  it("isolates repeated items by viewer key and releases one viewer explicitly", async () => {
    const factory = fakeBindingsFactory();
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio, {
      loadBindings: async () => factory.bindings
    });
    const item = readyItem("shared-item");
    const left = await adapter.open("node-1:compare-a", item, settings);
    const right = await adapter.open("node-2:single", item, {
      ...settings,
      documentLayout: "responsive"
    });

    left.transpose("D");
    expect(left.targetKey).toBe("D");
    expect(right.targetKey).toBeNull();
    expect(adapter.cachedViewerCount).toBe(2);

    adapter.release("node-1:compare-a");
    expect(adapter.cachedViewerCount).toBe(1);
    expect(() => left.renderPage(1)).toThrowError(LodeonClientError);
    expect(right.renderPage(1)).toContain("<svg");
    adapter.destroy();
  });

  it("rejects stale asynchronous work and cleans every created viewer", async () => {
    const factory = fakeBindingsFactory();
    let resolveBindings!: (value: typeof factory.bindings) => void;
    const pendingBindings = new Promise<typeof factory.bindings>((resolve) => {
      resolveBindings = resolve;
    });
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio, {
      loadBindings: () => pendingBindings
    });
    const pending = adapter.open("stale-viewer", readyItem("stale"), settings);

    adapter.destroy();
    resolveBindings(factory.bindings);

    await expect(pending).rejects.toMatchObject({
      code: "verovio.viewer_initialization_failed"
    });
    expect(factory.toolkits).toHaveLength(0);
    expect(adapter.cachedViewerCount).toBe(0);
  });

  it("rejects invalid settings, inputs, pages, transposition, and SVG", async () => {
    expect(() => validateViewerSettings({ ...settings, zoom: 5 })).toThrowError(
      LodeonClientError
    );
    expect(() => sanitizeVerovioSvg("<html></html>")).toThrowError(
      LodeonClientError
    );

    const factory = fakeBindingsFactory();
    const adapter = createVerovioEngineAdapter(defaultConfig.nodes.verovio, {
      loadBindings: async () => factory.bindings
    });
    await expect(adapter.open("invalid-viewer", {
      ...readyItem("invalid"),
      status: { state: "error", messages: [] }
    }, settings)).rejects.toMatchObject({ code: "verovio.input_invalid" });

    const document = await adapter.open("valid-viewer", readyItem("valid"), settings);
    expect(() => document.renderPage(0)).toThrowError(LodeonClientError);
    expect(() => document.elementsAtTime(-1)).toThrowError(LodeonClientError);
    expect(() => document.timeForElement(" ")).toThrowError(LodeonClientError);
    expect(() => document.transpose("H")).toThrowError(LodeonClientError);
    adapter.destroy();
  });

  it("removes unsafe SVG elements, links, handlers, and CSS while retaining glyph references", () => {
    const sanitized = sanitizeVerovioSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
        <style>@import url(https://evil.example/style.css)</style>
        <defs><path id="glyph" d="M0 0"/></defs>
        <use href="#glyph" onclick="alert(1)"/>
        <path fill="url(#safe-gradient)" stroke="url(https://evil.example/stroke.svg)"/>
        <a xlink:href="https://evil.example"><text>unsafe</text></a>
        <image href="https://evil.example/image.png"/>
        <foreignObject><script>alert(1)</script></foreignObject>
      </svg>
    `);

    expect(sanitized).toContain('href="#glyph"');
    expect(sanitized).not.toContain("onclick");
    expect(sanitized).not.toContain("https://evil.example");
    expect(sanitized).toContain("url(#safe-gradient)");
    expect(sanitized).not.toContain("<style");
    expect(sanitized).not.toContain("<image");
    expect(sanitized).not.toContain("foreignObject");
  });
});

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });
}

function readyItem(
  id: string,
  data = VEROVIO_DIRECT_MEI,
  format: "mei" | "pae" = "mei"
): VerovioItem {
  return {
    id,
    data,
    format,
    label: id,
    resource: null,
    resourceLabel: null,
    bindings: {},
    status: { state: "ready", messages: [] }
  };
}

function fakeBindingsFactory(overrides: {
  paeValidation?: unknown;
  log?: string;
  loadResult?: number;
} = {}) {
  const toolkits: ReturnType<typeof fakeToolkit>[] = [];
  const bindings = {
    createToolkit: () => {
      const toolkit = fakeToolkit(overrides);
      toolkits.push(toolkit);
      return toolkit;
    }
  };
  return { bindings, toolkits };
}

function fakeToolkit(overrides: {
  paeValidation?: unknown;
  log?: string;
  loadResult?: number;
}) {
  return {
    destroy: vi.fn(),
    getElementsAtTime: vi.fn(() => ({
      notes: ["note-1"], measure: "measure-1", page: 1
    })),
    getLog: vi.fn(() => overrides.log ?? ""),
    getMEI: vi.fn(() => "<mei>normalized</mei>"),
    getPageCount: vi.fn(() => 2),
    getPageWithElement: vi.fn(() => 2),
    getTimeForElement: vi.fn(() => 250),
    getTimesForElement: vi.fn(() => ({ on: [250], off: [750] })),
    getVersion: vi.fn(() => "6.2.0-test"),
    loadData: vi.fn(() => overrides.loadResult ?? 1),
    redoLayout: vi.fn(),
    redoPagePitchPosLayout: vi.fn(),
    renderToMIDI: vi.fn(() => btoa("MThd\u0000\u0000\u0000\u0006")),
    renderToSVG: vi.fn(() => `
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><path id="glyph" d="M0 0"/></defs>
        <use href="#glyph" onload="alert(1)"/>
        <script>alert(1)</script>
        <image href="https://evil.example/image.png"/>
      </svg>
    `),
    resetOptions: vi.fn(),
    setOptions: vi.fn(() => true),
    validatePAE: vi.fn(() => overrides.paeValidation ?? {})
  };
}
