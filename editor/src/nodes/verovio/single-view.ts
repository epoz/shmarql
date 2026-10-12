/** Renders the navigable single-item Verovio presentation. */

import type { VerovioRuntimeConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import { VEROVIO_TEMPO_MULTIPLIERS, type VerovioItem, type VerovioRenderSpec } from "./contracts";
import type { VerovioDocument, VerovioDownload, VerovioEngineAdapter, VerovioViewerSettings } from "./engine";
import { verovioItemBaseLabel, verovioItemChoiceLabel as formatItemChoiceLabel } from "./item-label";
import {
  getGlobalVerovioPlaybackCoordinator,
  type VerovioPlayableItem,
  type VerovioPlaybackCoordinator,
  type VerovioPlaybackSnapshot
} from "./playback";

export type VerovioSingleViewChange = {
  selectedItemId?: string;
  documentLayout?: VerovioRenderSpec["documentLayout"];
  initialZoom?: number;
  paginatedPageHeight?: number;
  playback?: VerovioRenderSpec["playback"];
};

export type VerovioRenderingState = "loading" | "ready" | "warning" | "error" | "empty" | "deferred";

export type VerovioSingleView = {
  dom: HTMLElement;
  update(spec: VerovioRenderSpec): void;
  setRenderingActive(active: boolean): void;
  isRenderingReady(): boolean;
  getPlayableItem(): VerovioPlayableItem | null;
  applyPlaybackSnapshot(snapshot: VerovioPlaybackSnapshot | null): void;
  setTransposition(targetKey: string | null): void;
  getTransposition(): string | null;
  destroy(): void;
};

export type VerovioSingleViewOptions = {
  id: string;
  spec: VerovioRenderSpec;
  runtime: VerovioRuntimeConfig;
  i18n: LodeonLocalization;
  engine: VerovioEngineAdapter;
  playback?: VerovioPlaybackCoordinator;
  onChange?(change: VerovioSingleViewChange): void;
  formatMessage?(code: string, variables: Record<string, string | number | boolean>): string;
  download?(download: VerovioDownload): void;
  showItemNavigation?: boolean;
  showThumbnailStrip?: boolean;
  renderingActive?: boolean;
  showPlaybackControls?: boolean;
  itemOrdinal?: number;
  onCompareToggle?(itemId: string): void;
  transpositionTargetKey?: string | null;
  onRenderingReady?(): void;
  onRenderingStateChange?(state: VerovioRenderingState): void;
};

const MIN_WIDTH = 240;

export function createVerovioSingleView(options: VerovioSingleViewOptions): VerovioSingleView {
  const t = (key: string, values?: Record<string, string | number | boolean>) =>
    options.i18n.t("special-nodes", `verovio.${key}`, values);
  const playback = options.playback ?? getGlobalVerovioPlaybackCoordinator();
  const ownerId = `${options.id}:single`;
  const viewerKey = `${options.id}:single-viewer`;
  let spec = options.spec;
  let selectedId = validSelectedId(spec) ?? spec.items[0]?.id ?? null;
  let activeDocument: VerovioDocument | null = null;
  let page = 1;
  let width = 800;
  let generation = 0;
  let destroyed = false;
  let renderingActive = options.renderingActive !== false;
  let removeResize: (() => void) | null = null;

  const dom = element("section", "ld-verovio-single-view");
  dom.style.setProperty("--ld-verovio-highlight", options.runtime.highlightColor);
  dom.setAttribute("aria-label", t("aria.viewControl"));
  const navigation = element("div", "ld-verovio-item-navigation");
  const previousItem = button(t("actions.previousItem"), "ld-verovio-previous-item");
  const position = element("output", "ld-verovio-item-position");
  position.setAttribute("aria-live", "polite");
  const nextItem = button(t("actions.nextItem"), "ld-verovio-next-item");
  navigation.append(previousItem, position, nextItem);
  const thumbnails = element("div", "ld-embed-selector ld-verovio-item-selector");
  thumbnails.setAttribute("role", "listbox");
  thumbnails.setAttribute("aria-label", t("aria.thumbnailStrip"));
  const content = element("article", "ld-verovio-active-item");
  const empty = element("p", "ld-verovio-empty");
  empty.textContent = t("status.noItems");
  dom.append(navigation, thumbnails, content, empty);

  previousItem.addEventListener("click", () => selectOffset(-1));
  nextItem.addEventListener("click", () => selectOffset(1));
  thumbnails.addEventListener("keydown", handleThumbnailKeydown);

  renderNavigation();
  void renderSelected();

  return {
    dom,
    update,
    setRenderingActive,
    isRenderingReady,
    getPlayableItem,
    applyPlaybackSnapshot,
    setTransposition,
    getTransposition,
    destroy
  };

  function update(next: VerovioRenderSpec): void {
    if (destroyed) return;
    const previousId = selectedId;
    const previousItemData = spec.items.find((item) => item.id === previousId);
    const previousLayout = spec.documentLayout;
    const previousZoom = spec.initialZoom;
    const previousPageHeight = spec.paginatedPageHeight;
    const previousMetadataFields = spec.visibleMetadataFields;
    const previousPlayback = spec.playback;
    spec = next;
    selectedId = validSelectedId(next) ?? next.items[0]?.id ?? null;
    if (selectedId && next.selectedItemId !== selectedId) {
      options.onChange?.({ selectedItemId: selectedId });
    }
    renderNavigation();
    syncCompareButton();
    const nextItemData = next.items.find((item) => item.id === selectedId);
    const mustRender =
      previousId !== selectedId ||
      previousItemData !== nextItemData ||
      previousLayout !== next.documentLayout ||
      previousZoom !== next.initialZoom ||
      previousPageHeight !== next.paginatedPageHeight;
    if (mustRender) void renderSelected();
    else {
      if (previousMetadataFields !== next.visibleMetadataFields) syncItemDetails();
      if (previousPlayback !== next.playback) syncPlaybackSettings();
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    generation += 1;
    removeResize?.();
    removeResize = null;
    playback.release(ownerId);
    options.engine.release(viewerKey);
    dom.replaceChildren();
  }

  function setRenderingActive(active: boolean): void {
    if (destroyed || renderingActive === active) return;
    renderingActive = active;
    void renderSelected();
  }

  function getPlayableItem(): VerovioPlayableItem | null {
    return activeDocument
      ? {
          id: activeDocument.itemId,
          midi: activeDocument.renderMidi(),
          timing: activeDocument
        }
      : null;
  }

  function isRenderingReady(): boolean {
    return activeDocument !== null;
  }

  function applyPlaybackSnapshot(snapshot: VerovioPlaybackSnapshot | null): void {
    if (!snapshot || !activeDocument || snapshot.itemId !== activeDocument.itemId) {
      syncPlaybackPosition(null, null);
      return;
    }
    syncPlaybackPositionFromSnapshot(snapshot);
    syncPlaybackPage(snapshot);
  }

  function setTransposition(targetKey: string | null): void {
    if (!activeDocument) return;
    if (activeDocument.targetKey === targetKey) return;
    activeDocument.transpose(targetKey);
    const viewer = content.querySelector<HTMLElement>(".ld-verovio-rendering");
    const pages = content.querySelector<HTMLElement>(".ld-verovio-page-navigation");
    if (viewer && pages) renderPage(viewer, pages);
  }

  function getTransposition(): string | null {
    return activeDocument?.targetKey ?? null;
  }

  function renderNavigation(): void {
    const index = selectedIndex();
    const hasItems = spec.items.length > 0;
    navigation.hidden = !hasItems || options.showItemNavigation === false;
    thumbnails.hidden =
      options.showItemNavigation === false || options.showThumbnailStrip === false || spec.items.length < 2;
    content.hidden = !hasItems;
    empty.hidden = hasItems;
    previousItem.disabled = index <= 0;
    nextItem.disabled = index < 0 || index >= spec.items.length - 1;
    position.textContent = hasItems
      ? t("status.itemPosition", { current: index + 1, total: spec.items.length })
      : "";
    if (options.showItemNavigation === false || options.showThumbnailStrip === false) {
      thumbnails.replaceChildren();
      return;
    }
    thumbnails.replaceChildren(
      ...spec.items.map((item, itemIndex) => {
        const accessibleLabel = itemChoiceLabel(item);
        const control = button("", "ld-embed-selector-item ld-verovio-item-selector-item");
        const itemTitle = element("span", "ld-embed-selector-title");
        const itemMeta = element("span", "ld-embed-selector-meta");
        itemTitle.textContent = verovioItemBaseLabel(item, t("status.untitledItem"));
        itemTitle.title = itemTitle.textContent;
        itemMeta.textContent =
          item.resourceLabel ||
          item.resource ||
          t("status.itemPosition", {
            current: itemIndex + 1,
            total: spec.items.length
          });
        itemMeta.title = itemMeta.textContent;
        control.append(itemTitle, itemMeta);
        control.title = accessibleLabel;
        control.type = "button";
        control.setAttribute("role", "option");
        control.setAttribute(
          "aria-label",
          t("aria.item", {
            current: itemIndex + 1,
            total: spec.items.length,
            label: accessibleLabel
          })
        );
        control.setAttribute("aria-selected", String(item.id === selectedId));
        control.dataset.active = String(item.id === selectedId);
        control.tabIndex = item.id === selectedId ? 0 : -1;
        control.dataset.itemId = item.id;
        control.addEventListener("click", () => select(item.id));
        return control;
      })
    );
  }

  async function renderSelected(): Promise<void> {
    const request = ++generation;
    removeResize?.();
    removeResize = null;
    playback.release(ownerId);
    options.engine.release(viewerKey);
    activeDocument = null;
    page = 1;
    content.replaceChildren();
    const item = selectedItem();
    if (!item) {
      options.onRenderingStateChange?.("empty");
      return;
    }

    const header = element("header", "ld-verovio-item-header");
    const title = element("h4", "ld-verovio-item-title");
    const itemLabel = itemChoiceLabel(item);
    title.textContent =
      options.itemOrdinal === undefined ? itemLabel : `${options.itemOrdinal}. ${itemLabel}`;
    title.title = title.textContent;
    header.append(title);
    if (item.status.state !== "ready") {
      const status = element("span", `ld-verovio-item-status ld-verovio-item-status-${item.status.state}`);
      status.setAttribute("role", item.status.state === "error" ? "alert" : "status");
      status.textContent = statusLabel(item);
      header.append(status);
    }
    if (options.onCompareToggle) {
      const compare = button("", "ld-verovio-compare-toggle");
      compare.dataset.itemId = item.id;
      compare.addEventListener("click", () => options.onCompareToggle?.(item.id));
      header.append(compare);
      syncCompareButton(compare, item.id);
    }
    const details = itemDetails(item);
    const viewerControls = createViewerControls();
    const viewer = element("div", "ld-verovio-rendering");
    viewer.setAttribute("aria-label", t("aria.rendering"));
    const pageNavigation = element("div", "ld-verovio-page-navigation");
    pageNavigation.setAttribute("aria-label", t("aria.pageNavigation"));
    const playbackControls = createPlaybackControls();
    playbackControls.dom.hidden = options.showPlaybackControls === false;
    const source = createSourceDisclosure(item);
    content.append(header, details, viewerControls.dom, viewer, pageNavigation, playbackControls.dom, source);

    if (item.status.state === "error" || !item.format) {
      renderMessages(item, viewer);
      options.onRenderingStateChange?.("error");
      return;
    }
    if (!renderingActive) {
      viewer.dataset.state = "deferred";
      viewer.setAttribute("role", "status");
      viewer.textContent = t("status.deferredRendering");
      pageNavigation.hidden = true;
      options.onRenderingStateChange?.("deferred");
      return;
    }
    viewer.dataset.state = "loading";
    viewer.textContent = t("status.loadingViewer");
    options.onRenderingStateChange?.("loading");
    try {
      const opened = await options.engine.open(viewerKey, item, viewerSettings());
      if (destroyed || request !== generation) return;
      activeDocument = opened;
      if (options.transpositionTargetKey) {
        activeDocument.transpose(options.transpositionTargetKey);
      }
      page = 1;
      renderPage(viewer, pageNavigation);
      syncDocumentControls();
      viewerControls.sync();
      playbackControls.sync(null);
      observeWidth(viewer, request);
      options.onRenderingReady?.();
      options.onRenderingStateChange?.(item.status.state === "warning" ? "warning" : "ready");
    } catch (error) {
      if (destroyed || request !== generation) return;
      viewer.dataset.state = "error";
      viewer.textContent = errorText(error);
      options.onRenderingStateChange?.("error");
    }
  }

  function renderPage(
    viewer: HTMLElement,
    pageNavigation: HTMLElement,
    restoreFocus: "previous" | "next" | null = null
  ): void {
    if (!activeDocument) return;
    page = Math.max(1, Math.min(page, activeDocument.pageCount));
    viewer.dataset.state = "ready";
    viewer.innerHTML = activeDocument.renderPage(page);
    pageNavigation.replaceChildren();
    if (activeDocument.pageCount <= 1) {
      pageNavigation.hidden = true;
      return;
    }
    pageNavigation.hidden = false;
    const previous = button(t("actions.previousPage"), "ld-verovio-previous-page");
    const output = element("output", "ld-verovio-page-position");
    output.setAttribute("aria-live", "polite");
    const next = button(t("actions.nextPage"), "ld-verovio-next-page");
    previous.disabled = page === 1;
    next.disabled = page === activeDocument.pageCount;
    output.textContent = t("status.pagePosition", {
      current: page,
      total: activeDocument.pageCount
    });
    previous.addEventListener("click", () => {
      page -= 1;
      renderPage(viewer, pageNavigation, "previous");
    });
    next.addEventListener("click", () => {
      page += 1;
      renderPage(viewer, pageNavigation, "next");
    });
    pageNavigation.append(previous, output, next);
    if (restoreFocus) {
      const target = restoreFocus === "previous" ? previous : next;
      (target.disabled ? (restoreFocus === "previous" ? next : previous) : target).focus();
    }
  }

  function createViewerControls(): { dom: HTMLElement; sync(): void } {
    const controls = element("div", "ld-verovio-viewer-controls");
    const layoutLabel = element("label", "ld-verovio-control");
    const layoutText = element("span");
    layoutText.textContent = t("fields.documentLayout");
    const layout = documentSelect(
      [
        ["responsive", t("options.documentLayout.responsive")],
        ["paginated", t("options.documentLayout.paginated")]
      ],
      spec.documentLayout
    );
    layoutLabel.append(layoutText, layout);
    const zoomLabel = element("label", "ld-verovio-control");
    const zoomText = element("span");
    zoomText.textContent = t("fields.initialZoom");
    const zoom = document.createElement("input");
    zoom.type = "range";
    zoom.min = "0.25";
    zoom.max = "4";
    zoom.step = "0.25";
    zoom.value = String(spec.initialZoom);
    zoomLabel.append(zoomText, zoom);
    const pageHeightLabel = element("label", "ld-verovio-control");
    const pageHeightText = element("span");
    pageHeightText.textContent = t("fields.paginatedPageHeight");
    const pageHeight = document.createElement("input");
    pageHeight.type = "number";
    pageHeight.min = "100";
    pageHeight.max = "60000";
    pageHeight.step = "100";
    pageHeight.value = String(spec.paginatedPageHeight);
    pageHeightLabel.append(pageHeightText, pageHeight);
    controls.append(layoutLabel, zoomLabel, pageHeightLabel);
    const sync = () => {
      layout.value = spec.documentLayout;
      zoom.value = String(spec.initialZoom);
      pageHeight.value = String(spec.paginatedPageHeight);
      pageHeightLabel.hidden = spec.documentLayout !== "paginated";
    };
    const apply = () => {
      changeViewer(
        layout.value as VerovioRenderSpec["documentLayout"],
        Number(zoom.value),
        Number(pageHeight.value)
      );
      sync();
    };
    layout.addEventListener("change", apply);
    zoom.addEventListener("input", apply);
    pageHeight.addEventListener("change", apply);
    sync();
    return { dom: controls, sync };
  }

  function changeViewer(layout: VerovioRenderSpec["documentLayout"], zoom: number, pageHeight: number): void {
    const boundedZoom = Math.max(0.25, Math.min(4, Number.isFinite(zoom) ? zoom : 1));
    const boundedPageHeight = Math.round(
      Math.max(
        100,
        Math.min(60000, Number.isFinite(pageHeight) ? pageHeight : options.runtime.paginatedPageHeight)
      )
    );
    spec = {
      ...spec,
      documentLayout: layout,
      initialZoom: boundedZoom,
      paginatedPageHeight: boundedPageHeight
    };
    options.onChange?.({
      documentLayout: layout,
      initialZoom: boundedZoom,
      paginatedPageHeight: boundedPageHeight
    });
    if (!activeDocument) return;
    activeDocument.relayout(viewerSettings());
    const viewer = content.querySelector<HTMLElement>(".ld-verovio-rendering");
    const pages = content.querySelector<HTMLElement>(".ld-verovio-page-navigation");
    if (viewer && pages) renderPage(viewer, pages);
  }

  function createPlaybackControls(): {
    dom: HTMLElement;
    sync(snapshot: VerovioPlaybackSnapshot | null): void;
  } {
    const controls = element("div", "ld-verovio-playback-controls");
    controls.setAttribute("aria-label", t("aria.playbackControls"));
    const play = button(t("actions.play"));
    const pause = button(t("actions.pause"));
    const stop = button(t("actions.stop"));
    const restart = button(t("actions.restart"));
    const progress = document.createElement("input");
    progress.type = "range";
    progress.min = "0";
    progress.max = "1";
    progress.step = "0.001";
    progress.value = "0";
    progress.setAttribute("aria-label", t("aria.progress"));
    const tempo = documentSelect(
      VEROVIO_TEMPO_MULTIPLIERS.map((value) => [String(value), `${value}×`]),
      String(spec.playback.tempoMultiplier)
    );
    tempo.setAttribute("aria-label", t("aria.tempo"));
    const loopLabel = element("label");
    const loop = document.createElement("input");
    loop.type = "checkbox";
    loop.checked = spec.playback.loop;
    const loopText = element("span");
    loopText.textContent = t("fields.loop");
    loopLabel.append(loop, loopText);
    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.05";
    volume.value = String(spec.playback.volume);
    volume.className = "ld-verovio-volume";
    volume.setAttribute("aria-label", t("aria.volume"));
    const playbackStatus = element("output", "ld-verovio-playback-status");
    playbackStatus.setAttribute("aria-live", "polite");
    playbackStatus.textContent = t("status.playbackReady");
    const playbackPosition = element("div", "ld-verovio-playback-position");
    playbackPosition.setAttribute("aria-live", "polite");
    const currentNote = element("output", "ld-verovio-current-note");
    const currentMeasure = element("output", "ld-verovio-current-measure");
    playbackPosition.append(currentNote, currentMeasure);
    controls.append(
      play,
      pause,
      stop,
      restart,
      progress,
      tempo,
      loopLabel,
      volume,
      playbackStatus,
      playbackPosition
    );

    play.addEventListener("click", () => void startPlayback(sync));
    pause.addEventListener("click", () => {
      const snapshot = playback.snapshot;
      if (snapshot?.ownerId === ownerId && snapshot.status === "paused")
        runPlaybackAction(() => playback.resume(ownerId));
      else playback.pause(ownerId);
    });
    stop.addEventListener("click", () => playback.stop(ownerId));
    restart.addEventListener("click", () => runPlaybackAction(() => playback.restart(ownerId)));
    progress.addEventListener("change", () => {
      const snapshot = playback.snapshot;
      if (snapshot?.ownerId === ownerId) playback.seek(ownerId, Number(progress.value) * snapshot.duration);
    });
    tempo.addEventListener("change", () => {
      const tempoMultiplier = Number(tempo.value);
      spec = { ...spec, playback: { ...spec.playback, tempoMultiplier } };
      options.onChange?.({ playback: spec.playback });
      if (playback.activeOwnerId === ownerId) playback.setTempoMultiplier(ownerId, tempoMultiplier);
    });
    loop.addEventListener("change", () => {
      spec = { ...spec, playback: { ...spec.playback, loop: loop.checked } };
      options.onChange?.({ playback: spec.playback });
      if (playback.activeOwnerId === ownerId) playback.setLoop(ownerId, loop.checked);
    });
    volume.addEventListener("input", () => {
      spec = { ...spec, playback: { ...spec.playback, volume: Number(volume.value) } };
      options.onChange?.({ playback: spec.playback });
      if (playback.activeOwnerId === ownerId) playback.setVolume(ownerId, spec.playback.volume);
    });
    function sync(snapshot: VerovioPlaybackSnapshot | null): void {
      const owned = snapshot?.ownerId === ownerId;
      play.disabled = !activeDocument;
      progress.value = owned ? String(snapshot.progress) : "0";
      pause.textContent = owned && snapshot.status === "paused" ? t("actions.resume") : t("actions.pause");
      pause.disabled = !owned || snapshot.status === "loading";
      stop.disabled = !owned;
      restart.disabled = !owned;
      playbackStatus.textContent = owned
        ? t(`status.${snapshot.status === "loading" ? "loadingSoundfont" : snapshot.status}`)
        : t("status.playbackReady");
      if (owned) {
        syncPlaybackPositionFromSnapshot(snapshot);
        syncPlaybackPage(snapshot);
      } else syncPlaybackPosition(null, null);
    }
    function runPlaybackAction(action: () => Promise<void>): void {
      void action().catch((error) => {
        playbackStatus.textContent = errorText(error);
      });
    }
    sync(null);
    return { dom: controls, sync };
  }

  async function startPlayback(sync: (snapshot: VerovioPlaybackSnapshot | null) => void): Promise<void> {
    if (!activeDocument) return;
    try {
      await playback.play({
        ownerId,
        items: [
          {
            id: activeDocument.itemId,
            midi: activeDocument.renderMidi(),
            timing: activeDocument
          }
        ],
        tempoMultiplier: spec.playback.tempoMultiplier,
        loop: spec.playback.loop,
        volume: spec.playback.volume,
        onUpdate: sync,
        onError: (error) => {
          const output = content.querySelector<HTMLElement>(".ld-verovio-playback-status");
          if (output) output.textContent = errorText(error);
        }
      });
    } catch (error) {
      const output = content.querySelector<HTMLElement>(".ld-verovio-playback-status");
      if (output) output.textContent = errorText(error);
    }
  }

  function syncPlaybackPage(snapshot: VerovioPlaybackSnapshot): void {
    if (!activeDocument || snapshot.itemId !== activeDocument.itemId) return;
    const target = snapshot.highlight.page;
    const viewer = content.querySelector<HTMLElement>(".ld-verovio-rendering");
    const pages = content.querySelector<HTMLElement>(".ld-verovio-page-navigation");
    if (target && target !== page && viewer && pages) {
      page = target;
      renderPage(viewer, pages);
    }
    applyHighlights(viewer, snapshot);
    syncPlaybackPositionFromSnapshot(snapshot);
  }

  function syncPlaybackPositionFromSnapshot(snapshot: VerovioPlaybackSnapshot): void {
    const currentEvent =
      snapshot.highlight.notes[0] ?? snapshot.highlight.chords[0] ?? snapshot.highlight.rests[0] ?? null;
    syncPlaybackPosition(currentEvent, snapshot.highlight.measure);
  }

  function syncPlaybackPosition(currentEvent: string | null, currentMeasure: string | null): void {
    const note = content.querySelector<HTMLOutputElement>(".ld-verovio-current-note");
    const measure = content.querySelector<HTMLOutputElement>(".ld-verovio-current-measure");
    if (note) note.textContent = currentEvent ? t("status.currentNote", { value: currentEvent }) : "";
    if (measure)
      measure.textContent = currentMeasure ? t("status.currentMeasure", { value: currentMeasure }) : "";
  }

  function createSourceDisclosure(item: VerovioItem): HTMLElement {
    const details = document.createElement("details");
    details.className = "ld-verovio-source";
    const summary = document.createElement("summary");
    summary.textContent = t("actions.showSource");
    const pre = element("pre");
    pre.setAttribute("aria-label", t("aria.sourceData"));
    pre.textContent = item.data;
    const original = button(t("actions.downloadOriginal"));
    const mei = button(t("actions.downloadMei"));
    original.className = "ld-verovio-download-original";
    mei.className = "ld-verovio-download-mei";
    original.disabled = true;
    mei.disabled = true;
    original.addEventListener("click", () => {
      if (activeDocument) performDownload(activeDocument.createOriginalDownload());
    });
    mei.addEventListener("click", () => {
      if (activeDocument) performDownload(activeDocument.createNormalizedMeiDownload());
    });
    details.addEventListener("toggle", () => {
      summary.textContent = t(details.open ? "actions.hideSource" : "actions.showSource");
    });
    details.append(summary, pre, original, mei);
    return details;
  }

  function syncDocumentControls(): void {
    const available = activeDocument !== null;
    const original = content.querySelector<HTMLButtonElement>(".ld-verovio-download-original");
    const mei = content.querySelector<HTMLButtonElement>(".ld-verovio-download-mei");
    if (original) original.disabled = !available;
    if (mei) mei.disabled = !available;
  }

  function itemDetails(item: VerovioItem): HTMLElement {
    const container = element("div", "ld-verovio-item-details");
    if (item.resource) container.append(resourceDetailRow(item.resource));
    const metadata = spec.visibleMetadataFields.flatMap((field) => {
      const binding = item.bindings[field];
      return binding ? [detailRow(field, binding.value)] : [];
    });
    if (metadata.length) {
      const heading = element("h5");
      heading.textContent = t("status.metadata");
      container.append(heading, ...metadata);
    }
    renderMessages(item, container);
    return container;
  }

  function syncItemDetails(): void {
    const item = selectedItem();
    const current = content.querySelector<HTMLElement>(".ld-verovio-item-details");
    if (item && current) current.replaceWith(itemDetails(item));
  }

  function syncPlaybackSettings(): void {
    const controls = content.querySelector<HTMLElement>(".ld-verovio-playback-controls");
    if (!controls) return;
    const tempo = controls.querySelector<HTMLSelectElement>("select");
    const loop = controls.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const volume = controls.querySelector<HTMLInputElement>(".ld-verovio-volume");
    if (tempo) tempo.value = String(spec.playback.tempoMultiplier);
    if (loop) loop.checked = spec.playback.loop;
    if (volume) volume.value = String(spec.playback.volume);
    if (playback.activeOwnerId === ownerId) {
      playback.setTempoMultiplier(ownerId, spec.playback.tempoMultiplier);
      playback.setLoop(ownerId, spec.playback.loop);
      playback.setVolume(ownerId, spec.playback.volume);
    }
  }

  function renderMessages(item: VerovioItem, target: HTMLElement): void {
    if (!item.status.messages.length) return;
    const list = element("ul", "ld-verovio-validation-messages");
    list.setAttribute("aria-label", t("aria.validationMessages"));
    list.setAttribute("role", item.status.state === "error" ? "alert" : "status");
    for (const message of item.status.messages) {
      const entry = document.createElement("li");
      entry.dataset.severity = message.severity;
      entry.textContent = options.formatMessage?.(message.code, message.variables) ?? message.code;
      list.append(entry);
    }
    target.append(list);
  }

  function syncCompareButton(
    control = content.querySelector<HTMLButtonElement>(".ld-verovio-compare-toggle"),
    itemId = selectedId
  ): void {
    if (!control || !itemId) return;
    const selected = spec.compare.aItemId === itemId || spec.compare.bItemId === itemId;
    const full = spec.compare.aItemId !== null && spec.compare.bItemId !== null;
    control.textContent = t(selected ? "actions.removeFromCompare" : "actions.addToCompare");
    control.setAttribute("aria-pressed", String(selected));
    control.disabled = full && !selected;
  }

  function select(id: string): void {
    if (id === selectedId || !spec.items.some((item) => item.id === id)) return;
    selectedId = id;
    options.onChange?.({ selectedItemId: id });
    renderNavigation();
    void renderSelected();
  }

  function selectOffset(offset: number): void {
    const next = spec.items[selectedIndex() + offset];
    if (next) select(next.id);
  }

  function handleThumbnailKeydown(event: KeyboardEvent): void {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    )
      return;
    event.preventDefault();
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? spec.items.length - 1
          : selectedIndex() + (event.key === "ArrowLeft" ? -1 : 1);
    const item = spec.items[index];
    if (item) {
      select(item.id);
      queueMicrotask(() =>
        thumbnails.querySelector<HTMLElement>(`[data-item-id="${cssEscape(item.id)}"]`)?.focus()
      );
    }
  }

  function observeWidth(viewer: HTMLElement, request: number): void {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      if (destroyed || request !== generation || nextWidth < MIN_WIDTH || Math.abs(nextWidth - width) < 1)
        return;
      width = nextWidth;
      if (!activeDocument) return;
      activeDocument.relayout(viewerSettings());
      const pages = content.querySelector<HTMLElement>(".ld-verovio-page-navigation");
      if (pages) renderPage(viewer, pages);
    });
    observer.observe(viewer);
    removeResize = () => observer.disconnect();
  }

  function viewerSettings(): VerovioViewerSettings {
    return {
      documentLayout: spec.documentLayout,
      zoom: spec.initialZoom,
      containerWidth: Math.max(MIN_WIDTH, width),
      paginatedPageHeight: spec.paginatedPageHeight
    };
  }
  function selectedIndex(): number {
    return spec.items.findIndex((item) => item.id === selectedId);
  }
  function selectedItem(): VerovioItem | undefined {
    return spec.items[selectedIndex()];
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
  function statusLabel(item: VerovioItem): string {
    return t(`status.${item.status.state === "unvalidated" ? "notValidated" : item.status.state}`);
  }
  function errorText(error: unknown): string {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "verovio.render_failed";
    return options.formatMessage?.(code, {}) ?? code;
  }
  function performDownload(value: VerovioDownload): void {
    if (options.download) {
      options.download(value);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = value.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

function validSelectedId(spec: VerovioRenderSpec): string | null {
  return spec.selectedItemId && spec.items.some((item) => item.id === spec.selectedItemId)
    ? spec.selectedItemId
    : null;
}
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = ""): HTMLElementTagNameMap[K] {
  const value = document.createElement(tag);
  value.className = className;
  return value;
}
function button(label: string, className = ""): HTMLButtonElement {
  const value = element("button", className);
  value.type = "button";
  value.textContent = label;
  return value;
}
function documentSelect(options: Array<readonly [string, string]>, selected: string): HTMLSelectElement {
  const select = document.createElement("select");
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = selected;
  return select;
}
function detailRow(label: string, value: string): HTMLElement {
  const row = element("dl", "ld-verovio-metadata-row");
  const term = document.createElement("dt");
  term.textContent = label;
  const detail = document.createElement("dd");
  detail.textContent = value;
  row.append(term, detail);
  return row;
}
function resourceDetailRow(resource: string): HTMLElement {
  const row = element("div", "ld-verovio-resource-row");
  const link = document.createElement("a");
  link.href = resource;
  link.textContent = resource;
  link.title = resource;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  row.append(link);
  return row;
}
function cssEscape(value: string): string {
  return typeof globalThis.CSS === "object" && typeof globalThis.CSS.escape === "function"
    ? globalThis.CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
function applyHighlights(viewer: HTMLElement | null, snapshot: VerovioPlaybackSnapshot): void {
  if (!viewer) return;
  for (const highlighted of viewer.querySelectorAll(".ld-verovio-playback-highlight"))
    highlighted.classList.remove("ld-verovio-playback-highlight");
  const ids = [...snapshot.highlight.notes, ...snapshot.highlight.chords, ...snapshot.highlight.rests];
  for (const id of ids)
    viewer.querySelector(`#${cssEscape(id)}`)?.classList.add("ld-verovio-playback-highlight");
}
