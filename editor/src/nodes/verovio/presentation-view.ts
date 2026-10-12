/** Renders Verovio List and Grouped presentations. */

import type { VerovioRuntimeConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import type { VerovioDownload, VerovioEngineAdapter } from "./engine";
import { groupVerovioItems, type VerovioItemGroup } from "./normalization";
import { getGlobalVerovioPlaybackCoordinator, type VerovioPlaybackCoordinator } from "./playback";
import {
  VEROVIO_VIEW_MODES,
  type VerovioCompareState,
  type VerovioItem,
  type VerovioRenderSpec,
  type VerovioViewMode
} from "./contracts";
import {
  createVerovioSingleView,
  type VerovioSingleView,
  type VerovioSingleViewChange,
  type VerovioRenderingState
} from "./single-view";
import { createVerovioCompareView } from "./compare-view";
import { verovioItemChoiceLabel as formatItemChoiceLabel } from "./item-label";

export type VerovioPresentationChange = VerovioSingleViewChange & {
  viewMode?: VerovioViewMode;
  compare?: VerovioCompareState;
};

export type VerovioPresentationView = {
  dom: HTMLElement;
  update(spec: VerovioRenderSpec, navigationItems?: VerovioItem[]): void;
  destroy(): void;
};

type VisibilityEntry = Pick<IntersectionObserverEntry, "isIntersecting" | "target"> & {
  boundingClientRect?: Pick<DOMRectReadOnly, "top" | "bottom">;
};

export type VerovioVisibilityObserver = {
  observe(target: Element): void;
  disconnect(): void;
};

export type VerovioPresentationViewOptions = {
  id: string;
  spec: VerovioRenderSpec;
  runtime: VerovioRuntimeConfig;
  i18n: LodeonLocalization;
  engine: VerovioEngineAdapter;
  playback?: VerovioPlaybackCoordinator;
  onChange?(change: VerovioPresentationChange): void;
  formatMessage?(code: string, variables: Record<string, string | number | boolean>): string;
  download?(download: VerovioDownload): void;
  onStateChange?(state: Exclude<VerovioRenderingState, "deferred">): void;
  navigationItems?: VerovioItem[];
  onItemNavigate?(itemId: string): void;
  showCaption?: boolean;
  createVisibilityObserver?(callback: (entries: VisibilityEntry[]) => void): VerovioVisibilityObserver | null;
};

type ActiveView = {
  dom: HTMLElement;
  update(spec: VerovioRenderSpec): void;
  destroy(): void;
};

type ItemEntry = {
  itemId: string;
  shell: HTMLElement;
  view: VerovioSingleView;
};

export function createVerovioPresentationView(
  options: VerovioPresentationViewOptions
): VerovioPresentationView {
  const t = (key: string, values?: Record<string, string | number | boolean>) =>
    options.i18n.t("special-nodes", `verovio.${key}`, values);
  let spec = options.spec;
  let navigationItems = options.navigationItems ?? spec.items;
  let navigationIndexes = itemIndexes(navigationItems);
  let active: ActiveView | null = null;
  let destroyed = false;
  const playback = options.playback ?? getGlobalVerovioPlaybackCoordinator();

  const dom = document.createElement("section");
  dom.className = "ld-verovio-presentation";
  const switcher = document.createElement("div");
  switcher.className = "ld-verovio-view-switcher";
  switcher.setAttribute("role", "group");
  switcher.setAttribute("aria-label", t("aria.viewControl"));
  switcher.addEventListener("keydown", handleViewKeydown);
  const buttons = new Map<VerovioViewMode, HTMLButtonElement>();
  for (const mode of VEROVIO_VIEW_MODES) {
    const control = document.createElement("button");
    control.type = "button";
    control.dataset.viewMode = mode;
    control.textContent = t(`options.view.${mode}`);
    control.addEventListener("click", () => selectMode(mode));
    buttons.set(mode, control);
    switcher.append(control);
  }
  const summary = document.createElement("div");
  summary.className = "ld-verovio-presentation-summary";
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const itemSelector = document.createElement("div");
  itemSelector.className = "ld-embed-selector ld-verovio-item-selector ld-verovio-presentation-item-selector";
  itemSelector.setAttribute("role", "listbox");
  itemSelector.setAttribute("aria-label", t("aria.thumbnailStrip"));
  itemSelector.addEventListener("keydown", handleItemSelectorKeydown);
  const viewport = document.createElement("div");
  viewport.className = "ld-verovio-presentation-viewport";
  const compareBar = document.createElement("div");
  compareBar.className = "ld-verovio-compare-bar";
  compareBar.setAttribute("aria-label", t("aria.compareBar"));
  const caption = document.createElement("p");
  caption.className = "ld-verovio-caption";
  dom.append(switcher, summary, itemSelector, compareBar, viewport, caption);
  render();

  return { dom, update, destroy };

  function update(next: VerovioRenderSpec, nextNavigationItems = next.items): void {
    if (destroyed) return;
    const modeChanged = spec.viewMode !== next.viewMode;
    spec = next;
    navigationItems = nextNavigationItems;
    navigationIndexes = itemIndexes(navigationItems);
    syncHeader();
    if (modeChanged) renderActive();
    else active?.update(spec);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    active?.destroy();
    active = null;
    dom.replaceChildren();
  }

  function render(): void {
    syncHeader();
    renderActive();
  }

  function syncHeader(): void {
    for (const [mode, control] of buttons) {
      const selected = mode === spec.viewMode;
      control.setAttribute("aria-pressed", String(selected));
      control.tabIndex = selected ? 0 : -1;
    }
    const resourceCount = new Set(
      spec.items.flatMap((item) => (item.resource === null ? [] : [item.resource]))
    ).size;
    const visiblePositions = spec.items.flatMap((item) => {
      const index = navigationIndexes.get(item.id) ?? -1;
      return index >= 0 ? [index + 1] : [];
    });
    summary.replaceChildren(
      summaryValue(
        t("status.showingItems", {
          start: visiblePositions.length > 0 ? Math.min(...visiblePositions) : 0,
          end: visiblePositions.length > 0 ? Math.max(...visiblePositions) : 0,
          count: navigationItems.length
        }),
        "items"
      ),
      summaryValue(t("status.resourceCount", { count: resourceCount }), "resources")
    );
    caption.textContent = spec.caption;
    caption.hidden = options.showCaption === false || !spec.caption.trim();
    renderCompareBar();
    renderItemSelector();
  }

  function renderItemSelector(): void {
    itemSelector.hidden = spec.viewMode === "compare" || navigationItems.length < 2;
    itemSelector.replaceChildren(
      ...navigationItems.map((item, index) => {
        const control = document.createElement("button");
        control.type = "button";
        control.className = "ld-embed-selector-item ld-verovio-item-selector-item";
        control.dataset.itemId = item.id;
        control.dataset.active = String(item.id === spec.selectedItemId);
        control.tabIndex = item.id === spec.selectedItemId ? 0 : -1;
        control.setAttribute("role", "option");
        control.setAttribute("aria-selected", String(item.id === spec.selectedItemId));
        control.setAttribute(
          "aria-label",
          t("aria.item", {
            current: index + 1,
            total: navigationItems.length,
            label: navigationItemChoiceLabel(item)
          })
        );
        control.title = navigationItemChoiceLabel(item);
        const title = document.createElement("span");
        title.className = "ld-embed-selector-title";
        title.textContent = item.label || t("status.untitledItem");
        const meta = document.createElement("span");
        meta.className = "ld-embed-selector-meta";
        meta.textContent =
          item.resourceLabel ||
          item.resource ||
          t("status.itemPosition", {
            current: index + 1,
            total: navigationItems.length
          });
        control.append(title, meta);
        control.addEventListener("click", () => {
          navigateToItem(item.id);
        });
        return control;
      })
    );
  }

  function handleItemSelectorKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const focused = (event.target as HTMLElement).closest<HTMLElement>("[data-item-id]");
    const current = Math.max(
      0,
      navigationItems.findIndex(({ id }) => id === focused?.dataset.itemId)
    );
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? navigationItems.length - 1
          : Math.min(Math.max(current + (event.key === "ArrowLeft" ? -1 : 1), 0), navigationItems.length - 1);
    const item = navigationItems[index];
    if (!item) return;
    event.preventDefault();
    navigateToItem(item.id);
    queueMicrotask(() =>
      itemSelector.querySelector<HTMLElement>(`[data-item-id="${cssEscape(item.id)}"]`)?.focus()
    );
  }

  function navigateToItem(itemId: string): void {
    if (options.onItemNavigate) options.onItemNavigate(itemId);
    else emitItemChange({ selectedItemId: itemId });
  }

  function selectMode(mode: VerovioViewMode): void {
    if (mode === spec.viewMode) return;
    spec = { ...spec, viewMode: mode };
    syncHeader();
    renderActive();
    options.onChange?.({ viewMode: mode });
  }

  function handleViewKeydown(event: KeyboardEvent): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const current = VEROVIO_VIEW_MODES.indexOf(spec.viewMode);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? VEROVIO_VIEW_MODES.length - 1
          : (current + (event.key === "ArrowLeft" ? -1 : 1) + VEROVIO_VIEW_MODES.length) %
            VEROVIO_VIEW_MODES.length;
    const mode = VEROVIO_VIEW_MODES[index];
    if (!mode) return;
    event.preventDefault();
    selectMode(mode);
    buttons.get(mode)?.focus();
  }

  function renderActive(): void {
    active?.destroy();
    options.onStateChange?.("loading");
    active =
      spec.viewMode === "compare"
        ? createVerovioCompareView({
            ...sharedOptions(),
            id: options.id,
            spec,
            playback,
            onChange: emitItemChange,
            onCompareToggle: toggleCompareItem,
            onRenderingStateChange: (state) => {
              if (state !== "deferred") options.onStateChange?.(state);
            }
          })
        : spec.viewMode === "single"
          ? createSingle(spec)
          : createCollection(spec, spec.viewMode);
    viewport.replaceChildren(active.dom);
  }

  function createSingle(next: VerovioRenderSpec): ActiveView {
    return createVerovioSingleView({
      ...sharedOptions(),
      id: `${options.id}:single-presentation`,
      spec: next,
      showThumbnailStrip: false,
      onChange: emitItemChange,
      onCompareToggle: toggleCompareItem,
      onRenderingStateChange: (state) => {
        if (state !== "deferred") options.onStateChange?.(state);
      }
    });
  }

  function createCollection(next: VerovioRenderSpec, mode: "list" | "grouped"): ActiveView {
    const root = document.createElement("div");
    root.className = `ld-verovio-${mode}-view`;
    root.dataset.itemCount = String(next.items.length);
    let observer: VerovioVisibilityObserver | null = null;
    let entries: ItemEntry[] = [];
    let currentStructure = "";
    const visibleDistances = new Map<string, number>();
    const pointedItems = new Set<string>();
    let focusedItemId: string | null = null;

    build(next);
    queueMicrotask(() => options.onStateChange?.(collectionState(next.items)));
    return { dom: root, update: updateCollection, destroy: destroyCollection };

    function build(value: VerovioRenderSpec): void {
      currentStructure = structureKey(value.items, mode);
      observer?.disconnect();
      visibleDistances.clear();
      pointedItems.clear();
      focusedItemId = null;
      observer = createVisibilityObserver(handleVisibility);
      for (const entry of entries) entry.view.destroy();
      entries = [];
      const indexes = itemIndexes(value.items);
      const fragment = document.createDocumentFragment();
      if (mode === "list") {
        value.items.forEach((item, index) => fragment.append(createEntry(item, index, value)));
      } else {
        groupVerovioItems(value.items).forEach((group) =>
          fragment.append(createGroup(group, value, indexes))
        );
      }
      root.replaceChildren(fragment);
      for (const entry of entries) observer?.observe(entry.shell);
      if (!observer) for (const entry of entries) entry.view.setRenderingActive(true);
    }

    function updateCollection(value: VerovioRenderSpec): void {
      if (structureKey(value.items, mode) !== currentStructure) {
        build(value);
        return;
      }
      const items = new Map(value.items.map((item) => [item.id, item]));
      const indexes = itemIndexes(value.items);
      entries.forEach((entry) => {
        const item = items.get(entry.itemId);
        if (!item) return;
        entry.view.update({ ...value, items: [item], selectedItemId: item.id });
        entry.shell.dataset.itemIndex = String(itemOrdinal(item, indexes.get(item.id) ?? 0));
      });
    }

    function createGroup(
      group: VerovioItemGroup,
      value: VerovioRenderSpec,
      indexes: Map<string, number>
    ): HTMLElement {
      const section = document.createElement("section");
      section.className = "ld-verovio-resource-group";
      if (group.resource !== null) section.dataset.resource = group.resource;
      else section.dataset.ungrouped = "true";
      const header = document.createElement("header");
      const resource = document.createElement("div");
      resource.className = "ld-verovio-resource-row";
      const groupLabel = group.resourceLabel || group.resource || t("status.ungrouped");
      resource.title = group.resource ?? groupLabel;
      if (group.resource) resource.append(resourceLink(group.resource, groupLabel));
      else resource.textContent = groupLabel;
      const count = document.createElement("span");
      count.className = "ld-verovio-resource-count";
      count.textContent = t("status.itemCount", { count: group.items.length });
      header.append(resource, count);
      const list = document.createElement("div");
      list.className = "ld-verovio-group-items";
      for (const item of group.items) {
        list.append(createEntry(item, indexes.get(item.id) ?? 0, value));
      }
      section.append(header, list);
      return section;
    }

    function createEntry(item: VerovioItem, index: number, value: VerovioRenderSpec): HTMLElement {
      const ordinal = itemOrdinal(item, index);
      const shell = document.createElement("article");
      shell.className = "ld-verovio-collection-item";
      shell.dataset.itemId = item.id;
      shell.dataset.itemIndex = String(ordinal);
      shell.addEventListener("pointerenter", () => {
        pointedItems.add(item.id);
        syncActiveEntries();
      });
      shell.addEventListener("pointerleave", () => {
        pointedItems.delete(item.id);
        syncActiveEntries();
      });
      shell.addEventListener("focusin", () => {
        focusedItemId = item.id;
        syncActiveEntries();
      });
      shell.addEventListener("focusout", (event) => {
        if (event.relatedTarget instanceof Node && shell.contains(event.relatedTarget)) return;
        if (focusedItemId === item.id) focusedItemId = null;
        syncActiveEntries();
      });
      const itemView = createVerovioSingleView({
        ...sharedOptions(),
        id: `${options.id}:${mode}:${item.id}`,
        spec: { ...value, items: [item], selectedItemId: item.id },
        showItemNavigation: false,
        itemOrdinal: ordinal,
        renderingActive: false,
        onChange: emitItemChange,
        onCompareToggle: toggleCompareItem
      });
      const displayLabel = itemChoiceLabel(item);
      shell.setAttribute("aria-label", displayLabel);
      shell.append(itemView.dom);
      entries.push({ itemId: item.id, shell, view: itemView });
      return shell;
    }

    function itemOrdinal(item: VerovioItem, fallbackIndex: number): number {
      const index = navigationIndexes.get(item.id) ?? -1;
      return index >= 0 ? index + 1 : fallbackIndex + 1;
    }

    function handleVisibility(changes: VisibilityEntry[]): void {
      if (destroyed) return;
      for (const change of changes) {
        const entry = entries.find((candidate) => candidate.shell === change.target);
        if (!entry) continue;
        if (change.isIntersecting) visibleDistances.set(entry.itemId, viewportDistance(change));
        else visibleDistances.delete(entry.itemId);
      }
      syncActiveEntries();
    }

    function syncActiveEntries(): void {
      const entryIds = new Set(entries.map(({ itemId }) => itemId));
      const itemsById = new Map(spec.items.map((item) => [item.id, item]));
      const nearest = [...visibleDistances.entries()]
        .sort((left, right) => left[1] - right[1])
        .map(([itemId]) => itemId);
      const playing = entries.find(
        (entry) => playback.activeOwnerId === `${options.id}:${mode}:${entry.itemId}:single`
      )?.itemId;
      const desired = new Set<string>();
      addDesired(playing);
      addDesired(focusedItemId);
      for (const itemId of pointedItems) addDesired(itemId);
      for (const itemId of nearest) {
        if (desired.size >= options.runtime.viewerCacheSize) break;
        addDesired(itemId);
      }
      for (const entry of entries) entry.view.setRenderingActive(desired.has(entry.itemId));

      function addDesired(itemId: string | null | undefined): void {
        if (!itemId || desired.size >= options.runtime.viewerCacheSize) return;
        const item = entryIds.has(itemId) ? itemsById.get(itemId) : undefined;
        if (!item?.format || item.status.state === "error") return;
        desired.add(itemId);
      }
    }

    function destroyCollection(): void {
      observer?.disconnect();
      observer = null;
      visibleDistances.clear();
      pointedItems.clear();
      focusedItemId = null;
      for (const entry of entries) entry.view.destroy();
      entries = [];
      root.replaceChildren();
    }
  }

  function emitItemChange(change: VerovioPresentationChange): void {
    spec = mergeChange(spec, change);
    active?.update(spec);
    options.onChange?.(change);
  }

  function resourceLink(resource: string, label: string): HTMLAnchorElement {
    const link = document.createElement("a");
    link.href = resource;
    link.textContent = label;
    link.title = resource;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  function toggleCompareItem(itemId: string): void {
    let compare = spec.compare;
    if (compare.aItemId === itemId) compare = { ...compare, aItemId: null };
    else if (compare.bItemId === itemId) compare = { ...compare, bItemId: null };
    else if (compare.aItemId === null) compare = { ...compare, aItemId: itemId };
    else if (compare.bItemId === null) compare = { ...compare, bItemId: itemId };
    else return;
    updateCompare(compare);
  }

  function renderCompareBar(): void {
    const a = compareSelect("a", spec.compare.aItemId, spec.compare.bItemId);
    const b = compareSelect("b", spec.compare.bItemId, spec.compare.aItemId);
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = t("actions.clearCompare");
    clear.disabled = !spec.compare.aItemId && !spec.compare.bItemId;
    clear.addEventListener("click", () => updateCompare({ ...spec.compare, aItemId: null, bItemId: null }));
    compareBar.replaceChildren(a.label, b.label, clear);
    compareBar.hidden = spec.viewMode !== "compare";
  }

  function compareSelect(slot: "a" | "b", selected: string | null, excluded: string | null) {
    const label = document.createElement("label");
    const text = document.createElement("span");
    text.textContent = t(`aria.compare${slot.toUpperCase()}`);
    const select = document.createElement("select");
    select.dataset.compareSlot = slot;
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = t("status.compareEmpty");
    select.append(empty);
    for (const item of spec.items) {
      if (item.id === excluded) continue;
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = itemChoiceLabel(item);
      select.append(option);
    }
    select.value = selected ?? "";
    select.addEventListener("change", () =>
      updateCompare({
        ...spec.compare,
        ...(slot === "a" ? { aItemId: select.value || null } : { bItemId: select.value || null })
      })
    );
    label.append(text, select);
    return { label, select };
  }

  function updateCompare(compare: VerovioCompareState): void {
    spec = { ...spec, compare };
    syncHeader();
    active?.update(spec);
    options.onChange?.({ compare });
  }

  function itemChoiceLabel(item: VerovioItem): string {
    return formatItemChoiceLabel(
      spec.items,
      item,
      t("status.untitledItem"),
      (values) => t("status.disambiguatedItem", values),
      t("status.noResource")
    );
  }

  function navigationItemChoiceLabel(item: VerovioItem): string {
    return formatItemChoiceLabel(
      navigationItems,
      item,
      t("status.untitledItem"),
      (values) => t("status.disambiguatedItem", values),
      t("status.noResource")
    );
  }

  function sharedOptions(): Omit<
    VerovioPresentationViewOptions,
    "spec" | "createVisibilityObserver" | "onChange"
  > {
    return {
      id: options.id,
      runtime: options.runtime,
      i18n: options.i18n,
      engine: options.engine,
      playback,
      formatMessage: options.formatMessage,
      download: options.download
    };
  }

  function createVisibilityObserver(
    callback: (entries: VisibilityEntry[]) => void
  ): VerovioVisibilityObserver | null {
    if (options.createVisibilityObserver) {
      return options.createVisibilityObserver(callback) ?? createFallbackVisibilityObserver(callback);
    }
    if (typeof IntersectionObserver === "undefined") return createFallbackVisibilityObserver(callback);
    return new IntersectionObserver(callback, { rootMargin: "600px 0px" });
  }
}

function collectionState(items: VerovioItem[]): "ready" | "warning" | "error" | "empty" {
  if (items.length === 0) return "empty";
  if (items.every((item) => item.status.state === "error")) return "error";
  if (items.some((item) => item.status.state === "error" || item.status.state === "warning"))
    return "warning";
  return "ready";
}

function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function itemIndexes(items: VerovioItem[]): Map<string, number> {
  return new Map(items.map((item, index) => [item.id, index]));
}

function viewportDistance(entry: VisibilityEntry): number {
  if (!entry.boundingClientRect) return 0;
  const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
  if (entry.boundingClientRect.bottom < 0) return -entry.boundingClientRect.bottom;
  if (entry.boundingClientRect.top > viewportHeight) {
    return entry.boundingClientRect.top - viewportHeight;
  }
  return 0;
}

function createFallbackVisibilityObserver(
  callback: (entries: VisibilityEntry[]) => void
): VerovioVisibilityObserver {
  const targets = new Set<Element>();
  let scheduled = false;
  const evaluate = (): void => {
    scheduled = false;
    const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight;
    callback(
      [...targets].map((target) => {
        const bounds = target.getBoundingClientRect();
        return {
          target,
          boundingClientRect: bounds,
          isIntersecting: bounds.bottom >= -600 && bounds.top <= viewportHeight + 600
        };
      })
    );
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(evaluate);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  return {
    observe(target) {
      targets.add(target);
      schedule();
    },
    disconnect() {
      targets.clear();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    }
  };
}

function mergeChange(
  spec: VerovioRenderSpec,
  change: VerovioSingleViewChange & { compare?: VerovioCompareState }
): VerovioRenderSpec {
  return {
    ...spec,
    selectedItemId: change.selectedItemId ?? spec.selectedItemId,
    documentLayout: change.documentLayout ?? spec.documentLayout,
    initialZoom: change.initialZoom ?? spec.initialZoom,
    paginatedPageHeight: change.paginatedPageHeight ?? spec.paginatedPageHeight,
    playback: change.playback ?? spec.playback,
    compare: change.compare ?? spec.compare
  };
}

function summaryValue(label: string, kind: string): HTMLElement {
  const value = document.createElement("span");
  value.dataset.summary = kind;
  value.textContent = label;
  return value;
}

function structureKey(items: VerovioItem[], mode: "list" | "grouped"): string {
  return JSON.stringify(
    items.map((item) => (mode === "grouped" ? [item.id, item.resource, item.resourceLabel] : item.id))
  );
}
