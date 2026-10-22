import { describe, expect, it, vi } from "vitest";
import type { LodeonLocalization } from "@lodeon/localization/runtime";
import { EMPTY_VEROVIO_COMPARE_STATE, type VerovioItem, type VerovioRenderSpec } from "@lodeon/nodes/verovio/contracts";
import type { VerovioDocument, VerovioEngineAdapter, VerovioViewerSettings } from "@lodeon/nodes/verovio/engine";
import type { VerovioPlaybackCoordinator, VerovioPlaybackRequest } from "@lodeon/nodes/verovio/playback";
import {
  createVerovioPresentationView,
  type VerovioVisibilityObserver
} from "@lodeon/nodes/verovio/presentation-view";
import { defaultConfig } from "./fixtures/config";
import { VEROVIO_MULTI_ITEM_FIXTURE } from "./fixtures/verovio";

describe("Verovio List and Grouped views", () => {
  it("renders a WYSIWYG caption and explicit compact placeholders for deferred entries", () => {
    const spec = { ...renderSpec("list"), caption: "Editorial note" };
    const view = createVerovioPresentationView({
      id: "presentation-caption", spec, runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback(), createVisibilityObserver: fakeVisibility().create
    });
    expect(text(view.dom, ".ld-verovio-caption")).toBe("Editorial note");
    expect(view.dom.querySelectorAll('[data-state="deferred"]')).toHaveLength(
      spec.items.filter((item) => item.format && item.status.state !== "error").length
    );
    expect(Array.from(view.dom.querySelectorAll('[data-state="deferred"]'))
      .every((entry) => entry.textContent === "Notation rendering will load when this item approaches the visible area.")).toBe(true);
    view.destroy();
  });

  it("disambiguates duplicate item labels with stable position and resource context", () => {
    const duplicate = VEROVIO_MULTI_ITEM_FIXTURE[0]!;
    const items = [
      { ...duplicate, id: "duplicate-a", label: "A very long duplicated incipit label", resource: "https://example.org/a", resourceLabel: "Source A" },
      { ...duplicate, id: "duplicate-b", label: "A very long duplicated incipit label", resource: "https://example.org/b", resourceLabel: "Source B" }
    ];
    const spec = { ...renderSpec("single"), items, selectedItemId: items[0]!.id };
    const view = createVerovioPresentationView({
      id: "presentation-labels", spec, runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback()
    });
    const labels = Array.from(view.dom.querySelectorAll<HTMLButtonElement>(".ld-verovio-item-selector-item"), (item) => item.title);
    expect(labels).toEqual([
      "A very long duplicated incipit label · Item 1 · Source A",
      "A very long duplicated incipit label · Item 2 · Source B"
    ]);
    expect(Array.from(view.dom.querySelectorAll(".ld-verovio-item-selector-item"), (item) => item.getAttribute("title"))).toEqual(labels);
    view.destroy();
  });
  it("VRA-10 reports ready only after the active rendering resolves", async () => {
    const opened = deferred<VerovioDocument>();
    const engine = fakeEngine();
    vi.mocked(engine.open).mockImplementationOnce(() => opened.promise);
    const states: string[] = [];
    const spec = renderSpec("single");
    const view = createVerovioPresentationView({
      id: "presentation-readiness", spec, runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), onStateChange: (state) => states.push(state)
    });
    expect(states).toContain("loading");
    expect(states).not.toContain("ready");

    opened.resolve(fakeDocument(spec.items[0]!, { documentLayout: "paginated", zoom: 1, containerWidth: 800, paginatedPageHeight: 1400 }));
    await settle();
    expect(states.at(-1)).toBe("ready");
    view.destroy();
  });

  it("VRA-01 synchronizes externally updated metadata fields across existing list viewers", async () => {
    const visibility = fakeVisibility();
    const initial = renderSpec("list");
    const engine = fakeEngine();
    const view = createVerovioPresentationView({
      id: "presentation-metadata-update", spec: initial, runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), createVisibilityObserver: visibility.create
    });
    visibility.enter(0, 1);
    await settle();

    const details = required(view.dom, ".ld-verovio-item-details");
    expect(details.textContent).toContain("category");
    expect(details.textContent).toContain("alpha");
    const openCount = vi.mocked(engine.open).mock.calls.length;
    view.update({
      ...initial,
      visibleMetadataFields: [],
      playback: { tempoMultiplier: 1.25, loop: true, volume: 0.4 }
    });

    expect(required(view.dom, ".ld-verovio-item-details").textContent).not.toContain("category");
    expect(Array.from(view.dom.querySelectorAll<HTMLSelectElement>(".ld-verovio-playback-controls select"))
      .every((control) => control.value === "1.25")).toBe(true);
    expect(Array.from(view.dom.querySelectorAll<HTMLInputElement>('.ld-verovio-playback-controls input[type="checkbox"]'))
      .every((control) => control.checked)).toBe(true);
    expect(Array.from(view.dom.querySelectorAll<HTMLInputElement>(".ld-verovio-volume"))
      .every((control) => control.value === "0.4")).toBe(true);
    expect(engine.open).toHaveBeenCalledTimes(openCount);
    view.destroy();
  });

  it("persists segmented view changes and preserves every ordered list item without eager SVG work", async () => {
    const visibility = fakeVisibility();
    const engine = fakeEngine();
    const changes: unknown[] = [];
    const view = createVerovioPresentationView({
      id: "presentation-list", spec: renderSpec("single"), runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), createVisibilityObserver: visibility.create,
      onChange: (change) => changes.push(change)
    });
    await settle();
    vi.mocked(engine.open).mockClear();

    required<HTMLButtonElement>(view.dom, '[data-view-mode="list"]').click();
    await settle();
    expect(changes.at(-1)).toEqual({ viewMode: "list" });
    expect(required(view.dom, '[data-view-mode="list"]').getAttribute("aria-pressed")).toBe("true");
    expect(itemIds(view.dom)).toEqual(VEROVIO_MULTI_ITEM_FIXTURE.map((item) => item.id));
    expect(view.dom.querySelectorAll(".ld-verovio-active-item")).toHaveLength(7);
    expect(view.dom.querySelectorAll(".ld-verovio-source")).toHaveLength(7);
    expect(view.dom.querySelectorAll(".ld-verovio-playback-controls")).toHaveLength(7);
    expect(Array.from(view.dom.querySelectorAll(".ld-verovio-item-title"), (title) => title.textContent?.match(/^\d+\./)?.[0]))
      .toEqual(["1.", "2.", "3.", "4.", "5.", "6.", "7."]);
    expect(view.dom.querySelectorAll(".ld-verovio-list-view > ol, .ld-verovio-list-view > li, .ld-verovio-item-number")).toHaveLength(0);
    expect(required<HTMLButtonElement>(view.dom, '.ld-verovio-collection-item .ld-verovio-playback-controls button').disabled).toBe(true);
    expect(engine.open).not.toHaveBeenCalled();
    expect(text(view.dom, '[data-summary="items"]')).toBe("Showing 1-7 of 7 items");
    expect(text(view.dom, '[data-summary="resources"]')).toBe("3 resources");
    expect(required(view.dom, ".ld-verovio-presentation-summary").getAttribute("aria-live")).toBe("polite");

    visibility.enter(0, 2);
    await settle();
    expect(engine.open).toHaveBeenCalledTimes(2);
    expect(engine.open).toHaveBeenNthCalledWith(1, expect.stringContaining("item-a-1"), expect.objectContaining({ id: "item-a-1" }), expect.any(Object));
    expect(engine.open).toHaveBeenNthCalledWith(2, expect.stringContaining("item-a-2"), expect.objectContaining({ id: "item-a-2" }), expect.any(Object));
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg")).toHaveLength(2);
    expect(required<HTMLButtonElement>(view.dom, '.ld-verovio-collection-item .ld-verovio-playback-controls button').disabled).toBe(false);

    visibility.enter(2, 5);
    await settle();
    expect(engine.open).toHaveBeenCalledTimes(defaultConfig.nodes.verovio.viewerCacheSize);
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg")).toHaveLength(defaultConfig.nodes.verovio.viewerCacheSize);

    visibility.leave(0);
    await settle();
    expect(engine.release).toHaveBeenCalledWith(expect.stringContaining("item-a-1"));
    expect(view.dom.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(7);
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg")).toHaveLength(defaultConfig.nodes.verovio.viewerCacheSize);
    view.destroy();
    expect(visibility.disconnect).toHaveBeenCalled();
  });

  it("VRA-18 releases pointer and focus priority symmetrically within the viewer cache", async () => {
    const visibility = fakeVisibility();
    const engine = fakeEngine();
    const spec = renderSpec("list");
    const view = createVerovioPresentationView({
      id: "presentation-priority", spec,
      runtime: { ...defaultConfig.nodes.verovio, viewerCacheSize: 2 },
      i18n, engine, playback: fakePlayback(), createVisibilityObserver: visibility.create
    });
    const entries = Array.from(view.dom.querySelectorAll<HTMLElement>(".ld-verovio-collection-item"));

    entries[0]!.dispatchEvent(new Event("pointerenter"));
    entries[1]!.dispatchEvent(new Event("pointerenter"));
    entries[2]!.dispatchEvent(new Event("pointerenter"));
    await settle();
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg").length).toBeLessThanOrEqual(2);
    expect(engine.open).toHaveBeenCalledTimes(2);

    entries[0]!.dispatchEvent(new Event("pointerleave"));
    entries[2]!.dispatchEvent(new Event("pointerenter"));
    await settle();
    expect(engine.release).toHaveBeenCalledWith(expect.stringContaining(entries[0]!.dataset.itemId));
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg").length).toBeLessThanOrEqual(2);

    const focusTarget = required<HTMLElement>(entries[3]!, "button");
    focusTarget.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    await settle();
    expect(view.dom.querySelectorAll(".ld-verovio-rendering svg").length).toBeLessThanOrEqual(2);
    focusTarget.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
    await settle();
    expect(engine.release).toHaveBeenCalledWith(expect.stringContaining(entries[3]!.dataset.itemId));
    view.destroy();
  });

  it("groups exact resources in first-occurrence order and keeps duplicates and missing resources", () => {
    const visibility = fakeVisibility();
    const view = createVerovioPresentationView({
      id: "presentation-grouped", spec: renderSpec("grouped"), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback(), createVisibilityObserver: visibility.create
    });

    const groups = Array.from(view.dom.querySelectorAll<HTMLElement>(".ld-verovio-resource-group"));
    expect(groups).toHaveLength(4);
    expect(groups.map((group) => group.querySelector(".ld-verovio-resource-row")?.textContent)).toEqual([
      "Resource A", "Ungrouped", "https://example.org/resource/b", "Resource C"
    ]);
    expect(groups.map((group) => group.querySelectorAll(".ld-verovio-collection-item").length)).toEqual([3, 2, 1, 1]);
    expect(groups.map((group) => group.querySelector(".ld-verovio-resource-count")?.textContent)).toEqual([
      "3 notation items", "2 notation items", "1 notation items", "1 notation items"
    ]);
    expect(itemIds(view.dom)).toEqual([
      "item-a-1", "item-a-2", "item-duplicate-1", "item-ungrouped-1",
      "item-warning", "item-b-1", "item-error"
    ]);
    expect(groups[1]?.dataset.ungrouped).toBe("true");
    expect(groups[0]?.querySelector<HTMLAnchorElement>(".ld-verovio-resource-row a")?.href).toBe("https://example.org/resource/a");
    expect(groups[0]?.querySelector<HTMLAnchorElement>(".ld-verovio-resource-row a")?.rel).toBe("noopener noreferrer");
    expect(view.dom.querySelectorAll("h3")).toHaveLength(0);
    view.destroy();
  });

  it("operates the segmented view control with arrow, Home, and End keys", async () => {
    const changes: unknown[] = [];
    const view = createVerovioPresentationView({
      id: "presentation-keyboard", spec: renderSpec("single"), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback: fakePlayback(), createVisibilityObserver: fakeVisibility().create,
      onChange: (change) => changes.push(change)
    });
    document.body.append(view.dom);
    const switcher = required<HTMLElement>(view.dom, ".ld-verovio-view-switcher");
    switcher.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await settle();
    expect(changes.at(-1)).toEqual({ viewMode: "list" });
    expect(document.activeElement).toBe(required(view.dom, '[data-view-mode="list"]'));
    switcher.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(changes.at(-1)).toEqual({ viewMode: "compare" });
    switcher.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(changes.at(-1)).toEqual({ viewMode: "single" });
    view.destroy();
    view.dom.remove();
  });

  it("keeps all items for large result sets and updates mode, order, and observer ownership atomically", async () => {
    const visibility = fakeVisibility();
    const engine = fakeEngine();
    const base = VEROVIO_MULTI_ITEM_FIXTURE[0]!;
    const many = Array.from({ length: 125 }, (_, index) => ({ ...base, id: `unlimited-${index}`, label: `Item ${index}` }));
    const initial = { ...renderSpec("list"), items: many };
    const view = createVerovioPresentationView({
      id: "presentation-many", spec: initial, runtime: defaultConfig.nodes.verovio,
      i18n, engine, playback: fakePlayback(), createVisibilityObserver: visibility.create
    });
    expect(view.dom.querySelectorAll(".ld-verovio-collection-item")).toHaveLength(125);
    expect(engine.open).not.toHaveBeenCalled();

    const reordered = [many[124]!, many[0]!, many[63]!];
    view.update({ ...initial, items: reordered, viewMode: "grouped" });
    expect(itemIds(view.dom)).toEqual(reordered.map((item) => item.id));
    expect(required(view.dom, '[data-view-mode="grouped"]').getAttribute("aria-pressed")).toBe("true");
    expect(visibility.disconnect).toHaveBeenCalled();
    visibility.enter(0, 3);
    await settle();
    expect(engine.open).toHaveBeenCalledTimes(3);
    view.destroy();
  });

  it("routes node-wide viewer changes to every entry and shares one playback coordinator", async () => {
    const visibility = fakeVisibility();
    const playback = fakePlayback();
    const changes: unknown[] = [];
    const view = createVerovioPresentationView({
      id: "presentation-controls", spec: renderSpec("list"), runtime: defaultConfig.nodes.verovio,
      i18n, engine: fakeEngine(), playback, createVisibilityObserver: visibility.create,
      onChange: (change) => changes.push(change)
    });
    visibility.enter(0, 2);
    await settle();

    const layouts = view.dom.querySelectorAll<HTMLSelectElement>(".ld-verovio-viewer-controls select");
    layouts[0]!.value = "responsive";
    layouts[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(changes.at(-1)).toEqual({ documentLayout: "responsive", initialZoom: 1, paginatedPageHeight: 1400 });
    expect(Array.from(view.dom.querySelectorAll<HTMLSelectElement>(".ld-verovio-viewer-controls select")).every((select) => select.value === "responsive")).toBe(true);

    const playButtons = view.dom.querySelectorAll<HTMLButtonElement>(".ld-verovio-playback-controls button:first-child");
    playButtons[0]!.click();
    playButtons[1]!.click();
    await settle();
    expect(playback.play).toHaveBeenCalledTimes(2);
    expect(playback.play.mock.calls[0]?.[0].ownerId).not.toBe(playback.play.mock.calls[1]?.[0].ownerId);
    view.destroy();
  });
});

const i18n: LodeonLocalization = {
  locale: "en", fallbackLocale: "en", strict: false, exists: () => true,
  t: (_namespace, key, values = {}) => {
    const messages: Record<string, string> = {
      "verovio.status.itemCount": "{{count}} notation items",
      "verovio.status.showingItems": "Showing {{start}}-{{end}} of {{count}} items",
      "verovio.status.resourceCount": "{{count}} resources",
      "verovio.status.ungrouped": "Ungrouped",
      "verovio.status.untitledItem": "Untitled notation",
      "verovio.status.noResource": "No resource",
      "verovio.status.disambiguatedItem": "{{label}} · Item {{position}} · {{resource}}",
      "verovio.status.deferredRendering": "Notation rendering will load when this item approaches the visible area."
    };
    return (messages[key] ?? key.split(".").at(-1) ?? key).replace(/{{(\w+)}}/g, (_match, name: string) => String(values[name] ?? ""));
  }
};

function renderSpec(viewMode: VerovioRenderSpec["viewMode"]): VerovioRenderSpec {
  return { renderer: "verovio", items: VEROVIO_MULTI_ITEM_FIXTURE, viewMode, selectedItemId: "item-a-1",
    documentLayout: "paginated", initialZoom: 1, paginatedPageHeight: 1400, visibleMetadataFields: ["category"], playback: { tempoMultiplier: 1, loop: false, volume: 0.8 },
    compare: EMPTY_VEROVIO_COMPARE_STATE, caption: "" };
}

function fakeVisibility() {
  let callback: ((entries: Array<{ target: Element; isIntersecting: boolean }>) => void) | null = null;
  let targets: Element[] = [];
  const disconnect = vi.fn(() => { targets = []; });
  const create = vi.fn((next: typeof callback): VerovioVisibilityObserver => {
    callback = next; targets = [];
    return { observe: (target) => targets.push(target), disconnect };
  });
  return {
    create, disconnect,
    enter(start: number, count: number) { callback?.(targets.slice(start, start + count).map((target) => ({ target, isIntersecting: true }))); },
    leave(index: number) { const target = targets[index]; if (target) callback?.([{ target, isIntersecting: false }]); }
  };
}

function fakeEngine(): VerovioEngineAdapter {
  return { version: "6.2.0-test", cachedViewerCount: 0, validate: vi.fn(),
    open: vi.fn(async (_key: string, item: VerovioItem, settings: VerovioViewerSettings) => fakeDocument(item, settings)),
    release: vi.fn(), destroy: vi.fn() } as VerovioEngineAdapter;
}
function fakeDocument(item: VerovioItem, settings: VerovioViewerSettings): VerovioDocument {
  return { itemId: item.id, sourceData: item.data, format: item.format!, settings, targetKey: null, pageCount: 1,
    renderPage: () => `<svg data-item="${item.id}"></svg>`, relayout: vi.fn(),
    createOriginalDownload: () => ({ blob: new Blob([item.data]), fileName: `${item.id}.mei` }),
    createNormalizedMeiDownload: () => ({ blob: new Blob([item.data]), fileName: `${item.id}.normalized.mei` }),
    renderMidi: () => new Uint8Array([1]), elementsAtTime: vi.fn(), timeForElement: vi.fn(), timesForElement: vi.fn(), pageWithElement: vi.fn(), transpose: vi.fn() };
}
function fakePlayback(): VerovioPlaybackCoordinator & { play: ReturnType<typeof vi.fn> } {
  let activeOwnerId: string | null = null;
  const play = vi.fn(async (request: VerovioPlaybackRequest) => { activeOwnerId = request.ownerId; });
  return { get activeOwnerId() { return activeOwnerId; }, snapshot: null, play, pause: vi.fn(), resume: vi.fn(), stop: vi.fn(), restart: vi.fn(), seek: vi.fn(),
    setTempoMultiplier: vi.fn(), setLoop: vi.fn(), setVolume: vi.fn(), release: vi.fn(), handlePageHidden: vi.fn(), destroy: vi.fn() };
}
function itemIds(root: ParentNode): string[] { return Array.from(root.querySelectorAll<HTMLElement>(".ld-verovio-collection-item")).map((item) => item.dataset.itemId ?? ""); }
function required<T extends Element = Element>(root: ParentNode, selector: string): T { const value = root.querySelector<T>(selector); if (!value) throw new Error(selector); return value; }
function text(root: ParentNode, selector: string): string { return required(root, selector).textContent ?? ""; }
async function settle(): Promise<void> { await Promise.resolve(); await Promise.resolve(); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
