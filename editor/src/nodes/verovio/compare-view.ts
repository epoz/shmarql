/** Renders and coordinates the two-item Verovio Compare view. */

import type { VerovioRuntimeConfig } from "../../configuration/schema";
import type { LodeonLocalization } from "../../localization/runtime";
import {
  VEROVIO_COMPARE_PLAYBACK_MODES,
  VEROVIO_TEMPO_MULTIPLIERS,
  type VerovioCompareState,
  type VerovioRenderSpec
} from "./contracts";
import type { VerovioDownload, VerovioEngineAdapter } from "./engine";
import { verovioComparePlaybackItems, type VerovioPlaybackCoordinator } from "./playback";
import {
  createVerovioSingleView,
  type VerovioSingleView,
  type VerovioSingleViewChange,
  type VerovioRenderingState
} from "./single-view";

export type VerovioCompareView = {
  dom: HTMLElement;
  update(spec: VerovioRenderSpec): void;
  destroy(): void;
};

export type VerovioCompareViewOptions = {
  id: string;
  spec: VerovioRenderSpec;
  runtime: VerovioRuntimeConfig;
  i18n: LodeonLocalization;
  engine: VerovioEngineAdapter;
  playback: VerovioPlaybackCoordinator;
  onChange(change: VerovioSingleViewChange & { compare?: VerovioCompareState }): void;
  onCompareToggle(itemId: string): void;
  formatMessage?(code: string, variables: Record<string, string | number | boolean>): string;
  download?(download: VerovioDownload): void;
  onRenderingStateChange?(state: VerovioRenderingState): void;
};

const TARGET_KEYS = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B"
];

export function createVerovioCompareView(options: VerovioCompareViewOptions): VerovioCompareView {
  const t = (key: string, values?: Record<string, string | number | boolean>) =>
    options.i18n.t("special-nodes", `verovio.${key}`, values);
  const ownerId = `${options.id}:compare-playback`;
  let spec = options.spec;
  let left: VerovioSingleView | null = null;
  let right: VerovioSingleView | null = null;
  let slotIds = "";
  let leftZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.aZoom;
  let rightZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.bZoom;
  let destroyed = false;
  const paneStates = new Map<"a" | "b", VerovioRenderingState>();

  const dom = document.createElement("section");
  dom.className = "ld-verovio-compare-view";
  dom.setAttribute("aria-label", t("aria.compareView"));
  const status = document.createElement("output");
  status.className = "ld-verovio-compare-status";
  status.setAttribute("aria-live", "polite");
  const controls = buildControls();
  const panes = document.createElement("div");
  panes.className = "ld-verovio-compare-panes";
  dom.append(controls.dom, status, panes);
  renderPanes();

  return { dom, update, destroy };

  function update(next: VerovioRenderSpec): void {
    if (destroyed) return;
    const previousCompare = spec.compare;
    const nextSlots = `${next.compare.aItemId ?? ""}|${next.compare.bItemId ?? ""}`;
    const slotsChanged = nextSlots !== slotIds;
    const transpositionChanged =
      spec.compare.targetKey !== next.compare.targetKey ||
      spec.compare.showTransposed !== next.compare.showTransposed;
    spec = next;
    leftZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.aZoom;
    rightZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.bZoom;
    controls.sync();
    if (slotsChanged) renderPanes();
    else {
      left?.update(slotSpec("a", leftZoom));
      right?.update(slotSpec("b", rightZoom));
      if (transpositionChanged) {
        options.playback.release(ownerId);
        const target = spec.compare.showTransposed ? spec.compare.targetKey : null;
        if (!applyTransposition(target)) {
          spec = {
            ...spec,
            compare: {
              ...spec.compare,
              targetKey: previousCompare.targetKey,
              showTransposed: previousCompare.showTransposed
            }
          };
          controls.sync();
          options.onChange({ compare: spec.compare });
        }
      }
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    options.playback.release(ownerId);
    left?.destroy();
    right?.destroy();
    left = null;
    right = null;
    dom.replaceChildren();
  }

  function renderPanes(): void {
    options.playback.release(ownerId);
    left?.destroy();
    right?.destroy();
    left = null;
    right = null;
    panes.replaceChildren();
    paneStates.clear();
    slotIds = `${spec.compare.aItemId ?? ""}|${spec.compare.bItemId ?? ""}`;
    leftZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.aZoom;
    rightZoom = spec.compare.synchronizedZoom ? spec.initialZoom : spec.compare.bZoom;
    const a = itemFor("a");
    const b = itemFor("b");
    if (!a || !b) {
      status.textContent = t("status.compareIncomplete");
      controls.sync();
      return;
    }
    const leftPane = pane("a");
    const rightPane = pane("b");
    left = createItemView("a", leftPane, leftZoom);
    right = createItemView("b", rightPane, rightZoom);
    panes.append(leftPane, rightPane);
    applyTransposition(spec.compare.showTransposed ? spec.compare.targetKey : null);
    controls.sync();
  }

  function createItemView(slot: "a" | "b", paneElement: HTMLElement, zoom: number): VerovioSingleView {
    const view = createVerovioSingleView({
      id: `${options.id}:compare-${slot}`,
      spec: slotSpec(slot, zoom),
      runtime: options.runtime,
      i18n: options.i18n,
      engine: options.engine,
      playback: options.playback,
      showItemNavigation: false,
      showPlaybackControls: false,
      onCompareToggle: options.onCompareToggle,
      transpositionTargetKey: spec.compare.showTransposed ? spec.compare.targetKey : null,
      onRenderingReady: () => {
        controls.sync();
        if (left?.isRenderingReady() && right?.isRenderingReady()) {
          applyTransposition(spec.compare.showTransposed ? spec.compare.targetKey : null);
        }
      },
      onRenderingStateChange: (state) => {
        paneStates.set(slot, state);
        if (paneStates.get("a") === "error" || paneStates.get("b") === "error")
          options.onRenderingStateChange?.("error");
        else if (
          [paneStates.get("a"), paneStates.get("b")].every(
            (value) => value === "ready" || value === "warning"
          )
        ) {
          options.onRenderingStateChange?.(
            [...paneStates.values()].includes("warning") ? "warning" : "ready"
          );
        } else options.onRenderingStateChange?.("loading");
      },
      onChange: (change) => handleItemChange(slot, change),
      formatMessage: options.formatMessage,
      download: options.download
    });
    paneElement.append(view.dom);
    return view;
  }

  function handleItemChange(slot: "a" | "b", change: VerovioSingleViewChange): void {
    if (change.initialZoom !== undefined || change.documentLayout !== undefined) {
      options.playback.release(ownerId);
    }
    if (change.initialZoom !== undefined && !spec.compare.synchronizedZoom) {
      if (slot === "a") leftZoom = change.initialZoom;
      else rightZoom = change.initialZoom;
      changeCompare({ aZoom: leftZoom, bZoom: rightZoom });
      return;
    }
    if (change.initialZoom !== undefined) {
      leftZoom = change.initialZoom;
      rightZoom = change.initialZoom;
      spec = { ...spec, initialZoom: change.initialZoom };
      spec = {
        ...spec,
        compare: {
          ...spec.compare,
          aZoom: change.initialZoom,
          bZoom: change.initialZoom
        }
      };
      left?.update(slotSpec("a", leftZoom));
      right?.update(slotSpec("b", rightZoom));
      options.onChange({ ...change, compare: spec.compare });
      return;
    }
    options.onChange(change);
  }

  function buildControls(): { dom: HTMLElement; sync(): void } {
    const root = document.createElement("div");
    root.className = "ld-verovio-compare-controls";
    root.setAttribute("aria-label", t("aria.playbackControls"));
    const synchronized = checkbox(t("fields.synchronizedZoom"), spec.compare.synchronizedZoom);
    synchronized.input.dataset.compareControl = "synchronized-zoom";
    const mode = select(
      VEROVIO_COMPARE_PLAYBACK_MODES.map((value) => [value, t(`options.comparePlayback.${value}`)]),
      spec.compare.playbackMode
    );
    mode.dataset.compareControl = "playback-mode";
    mode.setAttribute("aria-label", t("fields.comparePlayback"));
    const tempo = select(
      VEROVIO_TEMPO_MULTIPLIERS.map((value) => [String(value), `${value}×`]),
      String(spec.compare.tempoMultiplier)
    );
    tempo.dataset.compareControl = "tempo";
    tempo.setAttribute("aria-label", t("aria.tempo"));
    const sequenceLoop = checkbox(t("fields.sequenceLoop"), spec.compare.loopSequence);
    sequenceLoop.input.dataset.compareControl = "sequence-loop";
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
    const key = select(
      TARGET_KEYS.map((value) => [value, value]),
      spec.compare.targetKey ?? "C"
    );
    key.dataset.compareControl = "target-key";
    key.setAttribute("aria-label", t("fields.targetKey"));
    const transpose = button(
      t(spec.compare.showTransposed ? "actions.showOriginal" : "actions.showTransposed")
    );
    play.dataset.compareAction = "play";
    pause.dataset.compareAction = "pause";
    stop.dataset.compareAction = "stop";
    restart.dataset.compareAction = "restart";
    transpose.dataset.compareAction = "transpose";
    root.append(
      synchronized.label,
      mode,
      tempo,
      sequenceLoop.label,
      play,
      pause,
      stop,
      restart,
      progress,
      key,
      transpose
    );

    synchronized.input.addEventListener("change", () =>
      changeCompare({ synchronizedZoom: synchronized.input.checked })
    );
    mode.addEventListener("change", () =>
      changeCompare({ playbackMode: mode.value as VerovioCompareState["playbackMode"] })
    );
    tempo.addEventListener("change", () => {
      const tempoMultiplier = Number(tempo.value);
      changeCompare({ tempoMultiplier });
      if (options.playback.activeOwnerId === ownerId)
        options.playback.setTempoMultiplier(ownerId, tempoMultiplier);
    });
    sequenceLoop.input.addEventListener("change", () =>
      changeCompare({ loopSequence: sequenceLoop.input.checked })
    );
    play.addEventListener("click", () => void playSequence());
    pause.addEventListener("click", () => {
      const snapshot = options.playback.snapshot;
      if (snapshot?.ownerId === ownerId && snapshot.status === "paused") {
        void options.playback.resume(ownerId).catch((error) => {
          status.textContent = errorText(error);
        });
      } else options.playback.pause(ownerId);
    });
    stop.addEventListener("click", () => options.playback.stop(ownerId));
    restart.addEventListener("click", () => {
      void options.playback.restart(ownerId).catch((error) => {
        status.textContent = errorText(error);
      });
    });
    progress.addEventListener("change", () => {
      const snapshot = options.playback.snapshot;
      if (snapshot?.ownerId === ownerId)
        options.playback.seek(ownerId, Number(progress.value) * snapshot.duration);
    });
    key.addEventListener("change", () => {
      options.playback.release(ownerId);
      if (!spec.compare.showTransposed) {
        changeCompare({ targetKey: key.value });
        return;
      }
      if (applyTransposition(key.value)) changeCompare({ targetKey: key.value });
      else controls.sync();
    });
    transpose.addEventListener("click", () => {
      options.playback.release(ownerId);
      const showTransposed = !spec.compare.showTransposed;
      const target = showTransposed ? key.value : null;
      if (applyTransposition(target)) changeCompare({ targetKey: key.value, showTransposed });
      else controls.sync();
    });

    return { dom: root, sync };

    function sync(): void {
      synchronized.input.checked = spec.compare.synchronizedZoom;
      mode.value = spec.compare.playbackMode;
      tempo.value = String(spec.compare.tempoMultiplier);
      sequenceLoop.input.checked = spec.compare.loopSequence;
      key.value = spec.compare.targetKey ?? "C";
      transpose.textContent = t(
        spec.compare.showTransposed ? "actions.showOriginal" : "actions.showTransposed"
      );
      const ready = left?.isRenderingReady() === true && right?.isRenderingReady() === true;
      play.disabled = !ready;
      key.disabled = !ready;
      transpose.disabled = !ready;
      const owned = options.playback.activeOwnerId === ownerId;
      pause.disabled = !owned;
      stop.disabled = !owned;
      restart.disabled = !owned;
    }

    async function playSequence(): Promise<void> {
      const a = left?.getPlayableItem();
      const b = right?.getPlayableItem();
      if (!a || !b) return;
      try {
        await options.playback.play({
          ownerId,
          items: verovioComparePlaybackItems(spec.compare.playbackMode, a, b),
          tempoMultiplier: spec.compare.tempoMultiplier,
          loop: spec.compare.loopSequence,
          volume: spec.playback.volume,
          onUpdate(snapshot) {
            progress.value = String(snapshot?.progress ?? 0);
            pause.textContent = snapshot?.status === "paused" ? t("actions.resume") : t("actions.pause");
            left?.applyPlaybackSnapshot(snapshot);
            right?.applyPlaybackSnapshot(snapshot);
            sync();
          },
          onError(error) {
            status.textContent = errorText(error);
          }
        });
      } catch (error) {
        status.textContent = errorText(error);
      }
    }
  }

  function applyTransposition(target: string | null): boolean {
    const views = [left, right].filter((view): view is VerovioSingleView => view !== null);
    const previous = views.map((view) => view.getTransposition());
    try {
      for (const view of views) view.setTransposition(target);
      status.textContent = target
        ? t("status.transposedView", { targetKey: target })
        : t("status.originalView");
      return true;
    } catch (error) {
      views.forEach((view, index) => {
        try {
          view.setTransposition(previous[index] ?? null);
        } catch {
          /* Keep the original controlled error visible. */
        }
      });
      status.textContent = errorText(error);
      return false;
    }
  }

  function changeCompare(change: Partial<VerovioCompareState>): void {
    spec = { ...spec, compare: { ...spec.compare, ...change } };
    controls.sync();
    options.onChange({ compare: spec.compare });
  }

  function itemFor(slot: "a" | "b") {
    const id = slot === "a" ? spec.compare.aItemId : spec.compare.bItemId;
    return spec.items.find((item) => item.id === id);
  }
  function slotSpec(slot: "a" | "b", zoom: number): VerovioRenderSpec {
    const item = itemFor(slot);
    return {
      ...spec,
      items: item ? [item] : [],
      selectedItemId: item?.id ?? null,
      initialZoom: zoom
    };
  }
  function pane(slot: "a" | "b"): HTMLElement {
    const value = document.createElement("section");
    value.className = `ld-verovio-compare-pane ld-verovio-compare-${slot}`;
    value.setAttribute("aria-label", t(`aria.compare${slot.toUpperCase()}`));
    return value;
  }
  function errorText(error: unknown): string {
    const code =
      typeof error === "object" && error && "code" in error ? String(error.code) : "verovio.playback_failed";
    return options.formatMessage?.(code, {}) ?? code;
  }
}

function button(label: string): HTMLButtonElement {
  const value = document.createElement("button");
  value.type = "button";
  value.textContent = label;
  return value;
}
function select(values: Array<readonly [string, string]>, selected: string): HTMLSelectElement {
  const value = document.createElement("select");
  for (const [id, label] of values) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    value.append(option);
  }
  value.value = selected;
  return value;
}
function checkbox(labelText: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return { label, input };
}
