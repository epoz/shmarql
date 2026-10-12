/** Owns sidebar collapse and persisted application-shell panel sizing. */

import { PanelLeftClose, PanelLeftOpen } from "lucide";
import type { LodeonLocalization } from "../localization/runtime";
import { METADATA_PANEL_COLLAPSED_STORAGE_KEY } from "./project-sidebar";
import { renderIcon } from "./icons";

type PanelKind = "sidebar";

export function bindApplicationLayout(root: HTMLElement, i18n: LodeonLocalization): () => void {
  const cleanups: Array<() => void> = [];
  const toggle = root.querySelector<HTMLButtonElement>("[data-sidebar-toggle]");
  const handleToggle = () => {
    const sidebar = root.querySelector<HTMLElement>("[data-sidebar]");
    if (!sidebar) return;
    const collapsed = sidebar.dataset.collapsed !== "true";
    sidebar.dataset.collapsed = collapsed ? "true" : "false";
    try {
      localStorage.setItem(METADATA_PANEL_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // Browser storage can be unavailable in private or restricted contexts.
    }
    const icon = root.querySelector<HTMLElement>("[data-sidebar-toggle-icon]");
    if (icon) icon.innerHTML = renderIcon(collapsed ? PanelLeftOpen : PanelLeftClose);
    const label = i18n.t("editor", collapsed ? "metadataPanel.expand" : "metadataPanel.collapse");
    toggle?.setAttribute("aria-label", label);
    if (toggle) toggle.title = label;
  };
  toggle?.addEventListener("click", handleToggle);
  cleanups.push(() => toggle?.removeEventListener("click", handleToggle));

  const shell = root.querySelector<HTMLElement>(".ld-app-shell");
  if (shell) {
    restorePanelWidth(shell, "sidebar");
    cleanups.push(
      bindPanelResizeHandle({
        handle: root.querySelector("[data-sidebar-resize]"),
        shell,
        kind: "sidebar",
        min: 240,
        max: 480,
        readNextWidth: (event) => event.clientX
      })
    );
  }
  return () => cleanups.forEach((cleanup) => cleanup());
}

function bindPanelResizeHandle(options: {
  handle: HTMLElement | null;
  shell: HTMLElement;
  kind: PanelKind;
  min: number;
  max: number;
  readNextWidth: (event: PointerEvent) => number;
}): () => void {
  const { handle, shell, kind, min, max, readNextWidth } = options;
  if (!handle) return () => undefined;
  let removeActiveListeners: () => void = () => undefined;
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.dataset.active = "true";
    handle.setPointerCapture(event.pointerId);
    const onPointerMove = (moveEvent: PointerEvent) => {
      setPanelWidth(shell, kind, clamp(readNextWidth(moveEvent), min, max));
    };
    const finish = (upEvent?: PointerEvent) => {
      if (upEvent && handle.hasPointerCapture(upEvent.pointerId)) {
        handle.releasePointerCapture(upEvent.pointerId);
      }
      delete handle.dataset.active;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finish);
      persistPanelWidth(kind, getPanelWidth(shell, kind));
    };
    removeActiveListeners = () => finish();
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", finish);
  };
  handle.addEventListener("pointerdown", onPointerDown);
  return () => {
    removeActiveListeners();
    handle.removeEventListener("pointerdown", onPointerDown);
  };
}

function restorePanelWidth(shell: HTMLElement, kind: PanelKind): void {
  try {
    const value = localStorage.getItem(storageKey(kind));
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
    if (Number.isFinite(parsed)) setPanelWidth(shell, kind, parsed);
  } catch {
    // Panel width restoration is best effort.
  }
}

function setPanelWidth(shell: HTMLElement, kind: PanelKind, width: number): void {
  shell.style.setProperty(cssProperty(kind), `${Math.round(width)}px`);
}

function getPanelWidth(shell: HTMLElement, kind: PanelKind): number {
  const parsed = Number.parseInt(shell.style.getPropertyValue(cssProperty(kind)), 10);
  return Number.isFinite(parsed) ? parsed : 300;
}

function persistPanelWidth(kind: PanelKind, width: number): void {
  try {
    localStorage.setItem(storageKey(kind), String(Math.round(width)));
  } catch {
    // Panel width persistence is best effort.
  }
}

function cssProperty(kind: PanelKind): string {
  return `--lodeon-${kind}-width`;
}

function storageKey(kind: PanelKind): string {
  return `lodeon.${kind}.width`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
