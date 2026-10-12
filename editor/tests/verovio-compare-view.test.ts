import { describe, expect, it, vi } from "vitest";
import type { LodeonLocalization } from "@lodeon/localization/runtime";
import type { VerovioItem, VerovioRenderSpec } from "@lodeon/nodes/verovio/contracts";
import type { VerovioDocument, VerovioEngineAdapter, VerovioViewerSettings } from "@lodeon/nodes/verovio/engine";
import type { VerovioPlaybackCoordinator, VerovioPlaybackRequest } from "@lodeon/nodes/verovio/playback";
import { createVerovioCompareView } from "@lodeon/nodes/verovio/compare-view";
import { createVerovioPresentationView } from "@lodeon/nodes/verovio/presentation-view";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

describe("Verovio Compare Mode", () => {
  it("VRA-04 applies and persists a changed target key while the transposed view is active", async () => {
    const documents = new Map<string, ReturnType<typeof fakeDocument>>();
    const changes: Array<Record<string, unknown>> = [];
    const initial = compareSpec("single", true);
    initial.compare = { ...initial.compare, targetKey: "D", showTransposed: true };
    const view = createVerovioCompareView({
      id: "target-key-live", spec: initial, runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(documents), playback: fakePlayback(), onCompareToggle: vi.fn(),
      onChange: (change) => changes.push(change as Record<string, unknown>)
    });
    await settle();
    const key = required<HTMLSelectElement>(view.dom, '[data-compare-control="target-key"]');
    key.value = "E";
    key.dispatchEvent(new Event("change", { bubbles: true }));

    expect(changes.at(-1)?.compare).toMatchObject({ targetKey: "E", showTransposed: true });
    expect([...documents.values()].every((document) => document.targetKey === "E")).toBe(true);
    view.destroy();
  });

  it("VRA-05 rolls both Compare panes back when the second transposition fails", async () => {
    const documents = new Map<string, ReturnType<typeof fakeDocument>>();
    const engine = fakeEngine(documents);
    vi.mocked(engine.open).mockImplementation(async (_key, item, settings) => {
      const document = fakeDocument(item, settings);
      if (item.id === "item-b-1") {
        document.transpose = vi.fn((targetKey: string | null) => {
          if (targetKey === "D") throw new Error("controlled failure");
          document.targetKey = targetKey;
        });
      }
      documents.set(item.id, document);
      return document;
    });
    const onChange = vi.fn();
    const view = createVerovioCompareView({
      id: "atomic-transposition", spec: compareSpec("single", true), runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), onCompareToggle: vi.fn(), onChange
    });
    await settle();
    const key = required<HTMLSelectElement>(view.dom, '[data-compare-control="target-key"]');
    key.value = "D";
    click(view.dom, '[data-compare-action="transpose"]');

    expect([...documents.values()].map((document) => document.targetKey)).toEqual([null, null]);
    expect(onChange).not.toHaveBeenCalled();
    expect(required(view.dom, ".ld-verovio-compare-status").textContent).toBe("verovio.playback_failed");
    view.destroy();
  });

  it("VRA-06 emits independently changed pane zoom so it can survive rebuild and serialization", async () => {
    const changes: Array<Record<string, unknown>> = [];
    const initial = compareSpec("single", true);
    initial.compare = { ...initial.compare, synchronizedZoom: false };
    const view = createVerovioCompareView({
      id: "persist-independent-zoom", spec: initial, runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback(), onCompareToggle: vi.fn(),
      onChange: (change) => changes.push(change as Record<string, unknown>)
    });
    await settle();
    const zoom = required<HTMLInputElement>(view.dom, '.ld-verovio-compare-a .ld-verovio-viewer-controls input[type="range"]');
    zoom.value = "2";
    zoom.dispatchEvent(new Event("input", { bubbles: true }));

    expect(changes.at(-1)?.compare).toMatchObject({ aZoom: 2, bZoom: 1 });
    view.update({ ...initial, compare: { ...initial.compare, aZoom: 2, bZoom: 1 } });
    const restored = view.dom.querySelectorAll<HTMLInputElement>('.ld-verovio-viewer-controls input[type="range"]');
    expect(restored[0]?.value).toBe("2");
    expect(restored[1]?.value).toBe("1");
    view.destroy();
  });

  it("collects two candidates in every presentation and opens Compare as an equal view mode", async () => {
    for (const mode of ["single", "list", "grouped"] as const) {
      const changes: VerovioRenderSpec["compare"][] = [];
      const viewModes: VerovioRenderSpec["viewMode"][] = [];
      const view = createVerovioPresentationView({
        id: `selection-${mode}`, spec: compareSpec(mode, false), runtime: defaultConfig.nodes.verovio,
        i18n, engine: fakeEngine(), playback: fakePlayback(),
        createVisibilityObserver: (callback) => ({
          observe(target) { callback([{ target, isIntersecting: true }]); }, disconnect() {}
        }),
        onChange(change) {
          if (change.compare) changes.push(change.compare);
          if (change.viewMode) viewModes.push(change.viewMode);
        }
      });
      await settle();

      if (mode === "single") {
        click(view.dom, ".ld-verovio-compare-toggle");
        click(view.dom, ".ld-verovio-next-item");
        await settle();
        click(view.dom, ".ld-verovio-compare-toggle");
      } else {
        const toggles = view.dom.querySelectorAll<HTMLButtonElement>(".ld-verovio-compare-toggle");
        toggles[0]!.click();
        toggles[1]!.click();
      }
      expect(changes.at(-1)).toMatchObject({ aItemId: "item-a-1", bItemId: "item-a-2" });

      const slotB = required<HTMLSelectElement>(view.dom, '[data-compare-slot="b"]');
      slotB.value = "item-b-1";
      slotB.dispatchEvent(new Event("change", { bubbles: true }));
      expect(changes.at(-1)).toMatchObject({ aItemId: "item-a-1", bItemId: "item-b-1" });
      click(view.dom, '[data-view-mode="compare"]');
      await settle();
      expect(view.dom.querySelectorAll(".ld-verovio-compare-pane")).toHaveLength(2);
      expect(viewModes.at(-1)).toBe("compare");
      expect(required<HTMLElement>(view.dom, ".ld-verovio-compare-bar").hidden).toBe(false);
      click(view.dom, `[data-view-mode="${mode}"]`);
      expect(view.dom.querySelector(`.ld-verovio-${mode}-view, .ld-verovio-single-view`)).not.toBeNull();
      expect(viewModes.at(-1)).toBe(mode);
      expect(required<HTMLElement>(view.dom, ".ld-verovio-compare-bar").hidden).toBe(true);
      view.destroy();
    }
  });

  it("synchronizes zoom by default and allows independent Compare zoom", async () => {
    const changes: Array<Record<string, unknown>> = [];
    const view = createVerovioCompareView({
      id: "zoom", spec: compareSpec("single", true), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback(), onCompareToggle: vi.fn(),
      onChange: (change) => changes.push(change as Record<string, unknown>)
    });
    await settle();
    const zooms = () => view.dom.querySelectorAll<HTMLInputElement>('.ld-verovio-viewer-controls input[type="range"]');
    zooms()[0]!.value = "1.5";
    zooms()[0]!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(zooms()[1]!.value).toBe("1.5");
    expect(changes.at(-1)).toMatchObject({
      initialZoom: 1.5,
      compare: { aZoom: 1.5, bZoom: 1.5 }
    });

    const synchronized = required<HTMLInputElement>(view.dom, '[data-compare-control="synchronized-zoom"]');
    synchronized.checked = false;
    synchronized.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes.at(-1)?.compare).toMatchObject({ synchronizedZoom: false });
    const changeCount = changes.length;
    zooms()[0]!.value = "2";
    zooms()[0]!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(zooms()[0]!.value).toBe("2");
    expect(zooms()[1]!.value).toBe("1.5");
    expect(changes).toHaveLength(changeCount + 1);
    expect(changes.at(-1)?.compare).toMatchObject({ aZoom: 2, bZoom: 1.5 });
    view.destroy();
  });

  it("plays A, B, and ordered sequences without simultaneous playback", async () => {
    const playback = fakePlayback();
    const view = createVerovioCompareView({
      id: "sequence", spec: compareSpec("single", true), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback, onCompareToggle: vi.fn(), onChange: vi.fn()
    });
    await settle();
    expect(required(view.dom, ".ld-verovio-compare-status").getAttribute("aria-live")).toBe("polite");
    const mode = required<HTMLSelectElement>(view.dom, '[data-compare-control="playback-mode"]');
    const tempo = required<HTMLSelectElement>(view.dom, '[data-compare-control="tempo"]');
    const loop = required<HTMLInputElement>(view.dom, '[data-compare-control="sequence-loop"]');
    mode.value = "bThenA"; mode.dispatchEvent(new Event("change", { bubbles: true }));
    tempo.value = "1.25"; tempo.dispatchEvent(new Event("change", { bubbles: true }));
    loop.checked = true; loop.dispatchEvent(new Event("change", { bubbles: true }));
    click(view.dom, '[data-compare-action="play"]');
    await settle();
    const request = playback.lastRequest();
    expect(request?.items.map((item) => item.id)).toEqual(["item-b-1", "item-a-1"]);
    expect(request).toMatchObject({ tempoMultiplier: 1.25, loop: true });
    expect(request?.items).toHaveLength(2);
    expect(playback.activeOwnerId).toBe("sequence:compare-playback");
    view.destroy();
    expect(playback.release).toHaveBeenCalledWith("sequence:compare-playback");
  });

  it("transposes both derived views explicitly and restores immutable originals", async () => {
    const documents = new Map<string, ReturnType<typeof fakeDocument>>();
    const engine = fakeEngine(documents);
    const changes: Array<Record<string, unknown>> = [];
    const view = createVerovioCompareView({
      id: "transpose", spec: compareSpec("single", true), runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), onCompareToggle: vi.fn(),
      onChange: (change) => changes.push(change as Record<string, unknown>)
    });
    await settle();
    const key = required<HTMLSelectElement>(view.dom, '[data-compare-control="target-key"]');
    key.value = "D";
    click(view.dom, '[data-compare-action="transpose"]');
    expect(changes.at(-1)?.compare).toMatchObject({ targetKey: "D", showTransposed: true });
    expect([...documents.values()].map((document) => document.transpose)).toEqual([
      expect.any(Function), expect.any(Function)
    ]);
    expect([...documents.values()].every((document) => vi.mocked(document.transpose).mock.calls.some(([target]) => target === "D"))).toBe(true);
    expect(text(view.dom, ".ld-verovio-compare-status")).toContain("D");
    click(view.dom, '[data-compare-action="transpose"]');
    expect([...documents.values()].every((document) => vi.mocked(document.transpose).mock.calls.some(([target]) => target === null))).toBe(true);
    expect(VEROVIO_MULTI_ITEM_FIXTURE[0]?.data).toContain("@data:");
    view.destroy();
  });
});

const i18n: LodeonLocalization = {
  locale: "en", fallbackLocale: "en", strict: false, exists: () => true,
  t: (_namespace, key, values = {}) => {
    const messages: Record<string, string> = {
      "verovio.status.transposedView": "Transposed to {{targetKey}}; original data unchanged",
      "verovio.status.originalView": "Original notation",
      "verovio.status.compareEmpty": "Not selected",
      "verovio.status.compareIncomplete": "Select exactly two notation items to compare."
    };
    return (messages[key] ?? key.split(".").at(-1) ?? key).replace(/{{(\w+)}}/g, (_match, name: string) => String(values[name] ?? ""));
  }
};

function compareSpec(viewMode: VerovioRenderSpec["viewMode"], active: boolean): VerovioRenderSpec {
  return { renderer: "verovio", items: VEROVIO_MULTI_ITEM_FIXTURE, viewMode: active ? "compare" : viewMode, selectedItemId: "item-a-1",
    documentLayout: "paginated", initialZoom: 1, paginatedPageHeight: 1400, visibleMetadataFields: ["category"], playback: { tempoMultiplier: 1, loop: false, volume: 0.8 },
    compare: { aItemId: active ? "item-a-1" : null, bItemId: active ? "item-b-1" : null,
      synchronizedZoom: true, aZoom: 1, bZoom: 1, playbackMode: "a", loopSequence: false, tempoMultiplier: 1, targetKey: null, showTransposed: false }, caption: "" };
}
function fakeEngine(documents = new Map<string, ReturnType<typeof fakeDocument>>()): VerovioEngineAdapter {
  return { version: "6.2.0-test", cachedViewerCount: 0, validate: vi.fn(),
    open: vi.fn(async (_key: string, item: VerovioItem, settings: VerovioViewerSettings) => {
      const document = fakeDocument(item, settings); documents.set(item.id, document); return document;
    }), release: vi.fn(), destroy: vi.fn() } as VerovioEngineAdapter;
}
function fakeDocument(item: VerovioItem, settings: VerovioViewerSettings) {
  let currentSettings = settings;
  const document = { itemId: item.id, sourceData: item.data, format: item.format!, get settings() { return currentSettings; }, targetKey: null as string | null, pageCount: 1,
    renderPage: () => `<svg><g id="measure"><path id="note"/></g></svg>`, relayout: vi.fn((next) => { currentSettings = next; }),
    createOriginalDownload: () => ({ blob: new Blob([item.data]), fileName: `${item.id}.mei` }),
    createNormalizedMeiDownload: () => ({ blob: new Blob([item.data]), fileName: `${item.id}.normalized.mei` }),
    renderMidi: () => new Uint8Array([1]), elementsAtTime: vi.fn(), timeForElement: vi.fn(), timesForElement: vi.fn(), pageWithElement: vi.fn(),
    transpose: vi.fn((targetKey: string | null) => { document.targetKey = targetKey; })
  } satisfies VerovioDocument;
  return document;
}
function fakePlayback(): VerovioPlaybackCoordinator & { lastRequest(): VerovioPlaybackRequest | null; play: ReturnType<typeof vi.fn> } {
  let activeOwnerId: string | null = null;
  let request: VerovioPlaybackRequest | null = null;
  const play = vi.fn(async (next: VerovioPlaybackRequest) => { request = next; activeOwnerId = next.ownerId; });
  const release = vi.fn((ownerId: string) => { if (activeOwnerId === ownerId) activeOwnerId = null; });
  return { get activeOwnerId() { return activeOwnerId; }, snapshot: null, play, pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn(), seek: vi.fn(),
    setTempoMultiplier: vi.fn(), setLoop: vi.fn(), setVolume: vi.fn(), release, handlePageHidden: vi.fn(), destroy: vi.fn(), lastRequest: () => request };
}
function required<T extends Element = Element>(root: ParentNode, selector: string): T { const value = root.querySelector<T>(selector); if (!value) throw new Error(selector); return value; }
function click(root: ParentNode, selector: string): void { required<HTMLButtonElement>(root, selector).click(); }
function text(root: ParentNode, selector: string): string { return required(root, selector).textContent ?? ""; }
async function settle(): Promise<void> { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
