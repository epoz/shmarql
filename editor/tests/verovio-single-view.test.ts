import { describe, expect, it, vi } from "vitest";
import type { LodeonLocalization } from "@lodeon/localization/runtime";
import {
  EMPTY_VEROVIO_COMPARE_STATE,
  type VerovioItem,
  type VerovioRenderSpec
} from "@lodeon/nodes/verovio/contracts";
import type {
  VerovioDocument,
  VerovioEngineAdapter,
  VerovioViewerSettings
} from "@lodeon/nodes/verovio/engine";
import type {
  VerovioPlaybackCoordinator,
  VerovioPlaybackRequest,
  VerovioPlaybackSnapshot
} from "@lodeon/nodes/verovio/playback";
import { createVerovioSingleView } from "@lodeon/nodes/verovio/single-view";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

describe("Verovio Single View", () => {
  it("VRA-02 exposes the current note and measure as accessible playback text", async () => {
    const playback = fakePlayback();
    const view = createVerovioSingleView({
      id: "node-playback-position", spec: renderSpec("item-b-1"), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback
    });
    await settle();
    click(view.dom, ".ld-verovio-playback-controls button");
    await settle();
    playback.lastRequest()?.onUpdate(snapshot({
      ownerId: "node-playback-position:single",
      highlight: { notes: ["note-page-2"], chords: [], rests: [], measure: "measure-page-2", page: 2 }
    }));

    expect(text(view.dom, ".ld-verovio-current-note")).toContain("note-page-2");
    expect(text(view.dom, ".ld-verovio-current-measure")).toContain("measure-page-2");
    expect(required(view.dom, ".ld-verovio-playback-position").getAttribute("aria-live")).toBe("polite");
    view.destroy();
  });

  it("restores the active item, navigates by pointer and keyboard, and never opens inactive items", async () => {
    const engine = fakeEngine();
    const changes: unknown[] = [];
    const view = createVerovioSingleView({
      id: "node-a",
      spec: renderSpec("item-b-1"),
      runtime: defaultConfig.nodes.verovio,
      i18n,
      engine,
      playback: fakePlayback(),
      onChange: (change) => changes.push(change)
    });
    await settle();

    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 4 of 7");
    expect(engine.open).toHaveBeenCalledTimes(1);
    expect(engine.open).toHaveBeenLastCalledWith(
      "node-a:single-viewer",
      expect.objectContaining({ id: "item-b-1" }),
      expect.any(Object)
    );

    click(view.dom, ".ld-verovio-previous-item");
    await settle();
    expect(changes.at(-1)).toEqual({ selectedItemId: "item-ungrouped-1" });
    expect(engine.open).toHaveBeenCalledTimes(1);
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 3 of 7");

    click(view.dom, ".ld-verovio-previous-item");
    await settle();
    expect(engine.open).toHaveBeenCalledTimes(2);
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 2 of 7");

    const strip = required<HTMLElement>(view.dom, ".ld-verovio-item-selector");
    strip.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    await settle();
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 7 of 7");
    expect(changes.at(-1)).toEqual({ selectedItemId: "item-error" });
    expect(engine.open).toHaveBeenCalledTimes(2);
    expect(required<HTMLButtonElement>(view.dom, ".ld-verovio-next-item").disabled).toBe(true);
    expect(required(view.dom, '[data-item-id="item-error"]').getAttribute("aria-selected")).toBe("true");
    view.destroy();
  });

  it("renders resource IRIs as aligned external links and omits a redundant ready chip", async () => {
    const view = createVerovioSingleView({
      id: "node-resource", spec: renderSpec("item-b-1"), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback()
    });
    await settle();
    const link = required<HTMLAnchorElement>(view.dom, ".ld-verovio-resource-row a");
    expect(link.href).toBe("https://example.org/resource/b");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(required(view.dom, ".ld-verovio-resource-row").textContent).toBe("https://example.org/resource/b");
    expect(view.dom.querySelector(".ld-verovio-resource-row dt")).toBeNull();
    expect(view.dom.querySelector(".ld-verovio-item-status-ready")).toBeNull();
    view.destroy();
  });

  it("keeps item and page navigation distinct and enforces both boundaries", async () => {
    const engine = fakeEngine();
    const view = createVerovioSingleView({
      id: "node-pages",
      spec: renderSpec("item-b-1"),
      runtime: defaultConfig.nodes.verovio,
      i18n,
      engine,
      playback: fakePlayback()
    });
    document.body.append(view.dom);
    await settle();

    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 4 of 7");
    expect(text(view.dom, ".ld-verovio-page-position")).toBe("Page 1 of 2");
    expect(required<HTMLButtonElement>(view.dom, ".ld-verovio-previous-page").disabled).toBe(true);
    const nextPage = required<HTMLButtonElement>(view.dom, ".ld-verovio-next-page");
    nextPage.focus();
    nextPage.click();
    expect(text(view.dom, ".ld-verovio-page-position")).toBe("Page 2 of 2");
    expect(required<HTMLButtonElement>(view.dom, ".ld-verovio-next-page").disabled).toBe(true);
    expect(document.activeElement).toBe(required(view.dom, ".ld-verovio-previous-page"));
    expect(view.dom.querySelector('[data-rendered-page="2"]')).not.toBeNull();
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 4 of 7");
    expect(required(view.dom, ".ld-verovio-item-position").getAttribute("aria-live")).toBe("polite");
    expect(required(view.dom, ".ld-verovio-page-position").getAttribute("aria-live")).toBe("polite");
    expect(required(view.dom, ".ld-verovio-playback-status").getAttribute("aria-live")).toBe("polite");
    view.destroy();
    view.dom.remove();
  });

  it("persists viewer/playback settings and follows playback onto the matching notation page", async () => {
    const engine = fakeEngine();
    const playback = fakePlayback();
    const changes: unknown[] = [];
    const view = createVerovioSingleView({
      id: "node-playback",
      spec: renderSpec("item-b-1"),
      runtime: defaultConfig.nodes.verovio,
      i18n,
      engine,
      playback,
      onChange: (change) => changes.push(change)
    });
    await settle();

    const layout = required<HTMLSelectElement>(view.dom, ".ld-verovio-viewer-controls select");
    const pageHeight = required<HTMLInputElement>(view.dom, '.ld-verovio-viewer-controls input[type="number"]');
    expect(pageHeight.value).toBe("1400");
    pageHeight.value = "2200";
    pageHeight.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ documentLayout: "paginated", initialZoom: 1, paginatedPageHeight: 2200 });
    expect((await vi.mocked(engine.open).mock.results[0]?.value)?.settings.paginatedPageHeight).toBe(2200);

    layout.value = "responsive";
    layout.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ documentLayout: "responsive", initialZoom: 1, paginatedPageHeight: 2200 });
    expect(pageHeight.parentElement?.hidden).toBe(true);

    const zoom = required<HTMLInputElement>(view.dom, '.ld-verovio-viewer-controls input[type="range"]');
    zoom.value = "1.5";
    zoom.dispatchEvent(new Event("input", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ documentLayout: "responsive", initialZoom: 1.5, paginatedPageHeight: 2200 });
    expect((await vi.mocked(engine.open).mock.results[0]?.value)?.settings.zoom).toBe(1.5);

    const tempo = required<HTMLSelectElement>(view.dom, '.ld-verovio-playback-controls select');
    tempo.value = "1.25";
    tempo.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ playback: { tempoMultiplier: 1.25, loop: false, volume: 0.8 } });

    const volume = required<HTMLInputElement>(view.dom, ".ld-verovio-volume");
    volume.value = "0.55";
    volume.dispatchEvent(new Event("input", { bubbles: true }));
    expect(changes.at(-1)).toEqual({ playback: { tempoMultiplier: 1.25, loop: false, volume: 0.55 } });

    click(view.dom, ".ld-verovio-playback-controls button");
    await settle();
    const request = playback.lastRequest();
    expect(request?.items).toHaveLength(1);
    expect(request?.volume).toBe(0.55);
    request?.onUpdate(snapshot({ highlight: { notes: ["note-page-2"], chords: [], rests: [], measure: "measure-page-2", page: 2 } }));
    expect(text(view.dom, ".ld-verovio-page-position")).toBe("Page 2 of 2");
    expect(view.dom.querySelector("#note-page-2")?.classList.contains("ld-verovio-playback-highlight")).toBe(true);
    expect(view.dom.querySelector("#measure-page-2")?.classList.contains("ld-verovio-playback-highlight")).toBe(false);
    view.destroy();
    expect(playback.release).toHaveBeenCalledWith("node-playback:single");
    expect(engine.release).toHaveBeenCalledWith("node-playback:single-viewer");
  });

  it("updates thumbnails and falls back deterministically when saved state disappears", async () => {
    const engine = fakeEngine();
    const initial = renderSpec("item-a-2");
    const view = createVerovioSingleView({ id: "node-update", spec: initial, runtime: defaultConfig.nodes.verovio, i18n, engine, playback: fakePlayback() });
    await settle();
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 2 of 7");

    view.update({ ...initial, items: [VEROVIO_MULTI_ITEM_FIXTURE[3]!], selectedItemId: "missing" });
    await settle();
    expect(text(view.dom, ".ld-verovio-item-position")).toBe("Item 1 of 1");
    expect(view.dom.querySelectorAll(".ld-verovio-item-selector-item")).toHaveLength(1);
    expect(required(view.dom, '[data-item-id="item-b-1"]').getAttribute("aria-selected")).toBe("true");
    view.destroy();
  });
});

const i18n: LodeonLocalization = {
  locale: "en", fallbackLocale: "en", strict: false, exists: () => true,
  t: (_namespace, key, values = {}) => {
    const messages: Record<string, string> = {
      "verovio.status.itemPosition": "Item {{current}} of {{total}}",
      "verovio.status.pagePosition": "Page {{current}} of {{total}}",
      "verovio.status.currentNote": "Current note: {{value}}",
      "verovio.status.currentMeasure": "Current measure: {{value}}",
      "verovio.status.untitledItem": "Untitled notation"
    };
    return (messages[key] ?? key.split(".").at(-1) ?? key).replace(/{{(\w+)}}/g, (_match, name: string) => String(values[name] ?? ""));
  }
};

function renderSpec(selectedItemId: string | null): VerovioRenderSpec {
  return {
    renderer: "verovio", items: VEROVIO_MULTI_ITEM_FIXTURE, viewMode: "single", selectedItemId,
    documentLayout: "paginated", initialZoom: 1, paginatedPageHeight: 1400, visibleMetadataFields: ["category"],
    playback: { tempoMultiplier: 1, loop: false, volume: 0.8 }, compare: EMPTY_VEROVIO_COMPARE_STATE, caption: ""
  };
}

function fakeEngine(): VerovioEngineAdapter {
  return {
    version: "6.2.0-test", cachedViewerCount: 0,
    validate: vi.fn(),
    open: vi.fn(async (_key: string, item: VerovioItem, settings: VerovioViewerSettings) => fakeDocument(item, settings)),
    release: vi.fn(), destroy: vi.fn()
  } as VerovioEngineAdapter;
}

function fakeDocument(item: VerovioItem, settings: VerovioViewerSettings): VerovioDocument {
  let currentSettings = settings;
  return {
    itemId: item.id, sourceData: item.data, format: item.format!, targetKey: null,
    get settings() { return currentSettings; },
    pageCount: item.id === "item-b-1" ? 2 : 1,
    renderPage: vi.fn((page: number) => `<svg data-rendered-page="${page}"><g id="measure-page-${page}"><path id="note-page-${page}"/></g></svg>`),
    relayout: vi.fn((next) => { currentSettings = next; }),
    createOriginalDownload: vi.fn(() => ({ blob: new Blob([item.data]), fileName: `${item.id}.mei` })),
    createNormalizedMeiDownload: vi.fn(() => ({ blob: new Blob([item.data]), fileName: `${item.id}.normalized.mei` })),
    renderMidi: vi.fn(() => new Uint8Array([1, 2, 3])), elementsAtTime: vi.fn(), timeForElement: vi.fn(), timesForElement: vi.fn(), pageWithElement: vi.fn(), transpose: vi.fn()
  };
}

function fakePlayback(): VerovioPlaybackCoordinator & { lastRequest(): VerovioPlaybackRequest | null } {
  let request: VerovioPlaybackRequest | null = null;
  let activeOwnerId: string | null = null;
  return {
    get activeOwnerId() { return activeOwnerId; }, snapshot: null,
    play: vi.fn(async (next) => { request = next; activeOwnerId = next.ownerId; }), pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn(), seek: vi.fn(),
    setTempoMultiplier: vi.fn(), setLoop: vi.fn(), setVolume: vi.fn(), release: vi.fn(), handlePageHidden: vi.fn(), destroy: vi.fn(),
    lastRequest: () => request
  };
}

function snapshot(overrides: Partial<VerovioPlaybackSnapshot> = {}): VerovioPlaybackSnapshot {
  return { ownerId: "node-playback:single", itemId: "item-b-1", status: "playing", currentTime: 1, duration: 4, progress: 0.25,
    tempoMultiplier: 1.25, loop: false, volume: 0.8, sequenceIndex: 0, sequenceLength: 1,
    highlight: { notes: [], chords: [], rests: [], measure: null, page: 1 }, ...overrides };
}
function required<T extends Element = Element>(root: ParentNode, selector: string): T { const value = root.querySelector<T>(selector); if (!value) throw new Error(selector); return value; }
function click(root: ParentNode, selector: string): void { required<HTMLButtonElement>(root, selector).click(); }
function text(root: ParentNode, selector: string): string { return required(root, selector).textContent ?? ""; }
async function settle(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }
