/** Adapts pinned Verovio WASM rendering without replacing canonical notation data. */

import { LodeonClientError } from "../../errors/client-error";
import type { VerovioRuntimeConfig } from "../../configuration/schema";
import type {
  VerovioEngineDiagnostic,
  VerovioEngineValidation,
  VerovioInputValidator
} from "./normalization";
import type { VerovioDocumentLayout, VerovioInputFormat, VerovioItem } from "./contracts";

export type VerovioTimingElements = {
  notes: string[];
  chords: string[];
  rests: string[];
  measure: string | null;
  page: number | null;
};

export type VerovioViewerSettings = {
  documentLayout: VerovioDocumentLayout;
  zoom: number;
  containerWidth: number;
  paginatedPageHeight: number;
};

export type VerovioDownload = {
  blob: Blob;
  fileName: string;
};

export type VerovioDocument = {
  readonly itemId: string;
  readonly sourceData: string;
  readonly format: VerovioInputFormat;
  readonly pageCount: number;
  readonly settings: VerovioViewerSettings;
  readonly targetKey: string | null;
  renderPage(page: number): string;
  relayout(settings: VerovioViewerSettings): void;
  createOriginalDownload(): VerovioDownload;
  createNormalizedMeiDownload(): VerovioDownload;
  renderMidi(): Uint8Array;
  elementsAtTime(milliseconds: number): VerovioTimingElements;
  timeForElement(xmlId: string): number;
  timesForElement(xmlId: string): unknown;
  pageWithElement(xmlId: string): number;
  transpose(targetKey: string | null): void;
};

export type VerovioEngineAdapter = VerovioInputValidator & {
  readonly version: string | null;
  readonly cachedViewerCount: number;
  open(viewerKey: string, item: VerovioItem, settings: VerovioViewerSettings): Promise<VerovioDocument>;
  release(viewerKey: string): void;
  destroy(): void;
};

export type VerovioResizeObserver = {
  disconnect(): void;
  observe(target: Element): void;
};

type Toolkit = {
  destroy(): void;
  getElementsAtTime(milliseconds: number): unknown;
  getLog(): string;
  getMEI(options?: Record<string, unknown>): string;
  getPageCount(): number;
  getPageWithElement(xmlId: string): number;
  getTimeForElement(xmlId: string): number;
  getTimesForElement(xmlId: string): unknown;
  getVersion(): string;
  loadData(data: string): number;
  redoLayout(options?: Record<string, unknown>): void;
  redoPagePitchPosLayout(): void;
  renderToMIDI(): string;
  renderToSVG(page?: number, xmlDeclaration?: boolean): string;
  resetOptions(): void;
  setOptions(options: Record<string, unknown>): boolean;
  validatePAE(data: string | Record<string, unknown>): unknown;
};

type VerovioBindings = {
  createToolkit(): Toolkit;
};

type CacheEntry = {
  item: VerovioItem;
  document: InternalVerovioDocument;
  lastUsed: number;
};

type EngineDependencies = {
  loadBindings?: () => Promise<VerovioBindings>;
  parseSvg?: (source: string) => string;
};

type ResizeObserverFactory = (callback: (entries: ResizeObserverEntry[]) => void) => VerovioResizeObserver;

const MIN_CONTAINER_WIDTH = 240;
const MAX_CONTAINER_WIDTH = 10000;
const RESPONSIVE_PAGE_HEIGHT = 60000;
const BASE_SCALE = 40;
const SAFE_TARGET_KEY = /^[A-Ga-g](?:#|b)?$/;
const EXPECTED_VEROVIO_VERSION = "6.2.0";

let sharedBindingsPromise: Promise<VerovioBindings> | null = null;

/**
 * Adapts the pinned Verovio WASM runtime while keeping original notation data
 * canonical; generated MEI, SVG, MIDI, and timings remain derived artifacts.
 */
export function createVerovioEngineAdapter(
  runtime: VerovioRuntimeConfig,
  dependencies: EngineDependencies = {}
): VerovioEngineAdapter {
  const cache = new Map<string, CacheEntry>();
  const pendingGenerations = new Map<string, number>();
  const loadBindings = dependencies.loadBindings ?? loadSharedVerovioBindings;
  const sanitize = dependencies.parseSvg ?? sanitizeVerovioSvg;
  let accessCounter = 0;
  let generationCounter = 0;
  let destroyed = false;
  let loadedVersion: string | null = null;

  return {
    get version() {
      return loadedVersion;
    },
    get cachedViewerCount() {
      return cache.size;
    },
    validate,
    open,
    release,
    destroy
  };

  async function validate(data: string, format: VerovioInputFormat): Promise<VerovioEngineValidation> {
    ensureAdapterAlive();
    const bindings = await loadBindings();
    ensureAdapterAlive();
    const toolkit = bindings.createToolkit();

    try {
      loadedVersion = requirePinnedVersion(toolkit.getVersion());
      const diagnostics = format === "pae" ? paeDiagnostics(toolkit.validatePAE(data)) : [];
      const loaded = toolkit.loadData(data) === 1;
      diagnostics.push(...logDiagnostics(toolkit.getLog()));
      return { loaded, diagnostics: uniqueDiagnostics(diagnostics) };
    } catch (error) {
      if (error instanceof LodeonClientError && error.code === "verovio.viewer_initialization_failed") {
        throw error;
      }
      return {
        loaded: false,
        diagnostics: [{ severity: "error", externalError: externalError(error) }]
      };
    } finally {
      toolkit.destroy();
    }
  }

  async function open(
    viewerKey: string,
    item: VerovioItem,
    settings: VerovioViewerSettings
  ): Promise<VerovioDocument> {
    ensureAdapterAlive();
    const normalizedViewerKey = requireViewerKey(viewerKey);
    const validatedSettings = validateViewerSettings(settings);
    const existing = cache.get(normalizedViewerKey);

    if (existing && existing.item.data === item.data && existing.item.format === item.format) {
      existing.lastUsed = ++accessCounter;
      existing.document.relayout(validatedSettings);
      return existing.document;
    }
    if (existing) {
      existing.document.destroy();
      cache.delete(normalizedViewerKey);
    }

    const generation = ++generationCounter;
    pendingGenerations.set(normalizedViewerKey, generation);
    const bindings = await loadBindings();
    if (destroyed || pendingGenerations.get(normalizedViewerKey) !== generation) {
      throw viewerInitializationError("stale_generation");
    }

    const toolkit = bindings.createToolkit();
    try {
      loadedVersion = requirePinnedVersion(toolkit.getVersion());
      const document = new InternalVerovioDocument(toolkit, item, validatedSettings, sanitize);
      if (destroyed || pendingGenerations.get(normalizedViewerKey) !== generation) {
        document.destroy();
        throw viewerInitializationError("stale_generation");
      }
      evictToCapacity();
      cache.set(normalizedViewerKey, { item, document, lastUsed: ++accessCounter });
      return document;
    } catch (error) {
      if (!isDestroyedToolkitError(error)) toolkit.destroy();
      if (error instanceof LodeonClientError) throw error;
      throw viewerInitializationError(error);
    } finally {
      if (pendingGenerations.get(normalizedViewerKey) === generation) {
        pendingGenerations.delete(normalizedViewerKey);
      }
    }
  }

  function release(viewerKey: string): void {
    const normalizedViewerKey = requireViewerKey(viewerKey);
    pendingGenerations.delete(normalizedViewerKey);
    const existing = cache.get(normalizedViewerKey);
    if (!existing) return;
    existing.document.destroy();
    cache.delete(normalizedViewerKey);
  }

  function evictToCapacity(): void {
    while (cache.size >= runtime.viewerCacheSize) {
      const oldest = [...cache.entries()].sort(([, left], [, right]) => left.lastUsed - right.lastUsed)[0];
      if (!oldest) return;
      oldest[1].document.destroy();
      cache.delete(oldest[0]);
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    pendingGenerations.clear();
    for (const entry of cache.values()) entry.document.destroy();
    cache.clear();
  }

  function ensureAdapterAlive(): void {
    if (destroyed) throw viewerInitializationError("adapter_destroyed");
  }
}

class InternalVerovioDocument implements VerovioDocument {
  readonly itemId: string;
  readonly sourceData: string;
  readonly format: VerovioInputFormat;
  settings: VerovioViewerSettings;
  targetKey: string | null = null;
  private destroyed = false;

  constructor(
    private readonly toolkit: Toolkit,
    item: VerovioItem,
    settings: VerovioViewerSettings,
    private readonly sanitize: (source: string) => string
  ) {
    if (!item.format || item.status.state === "error") {
      throw new LodeonClientError("verovio.input_invalid", { itemId: item.id });
    }
    this.itemId = item.id;
    this.sourceData = item.data;
    this.format = item.format;
    this.settings = settings;
    this.loadOriginal();
  }

  get pageCount(): number {
    this.ensureAlive();
    return this.toolkit.getPageCount();
  }

  renderPage(page: number): string {
    this.ensureAlive();
    if (!Number.isInteger(page) || page < 1 || page > this.pageCount) {
      throw renderError(this.itemId, "page_out_of_range");
    }
    try {
      return this.sanitize(this.toolkit.renderToSVG(page, false));
    } catch (error) {
      throw renderError(this.itemId, error);
    }
  }

  relayout(settings: VerovioViewerSettings): void {
    this.ensureAlive();
    const validated = validateViewerSettings(settings);
    if (sameSettings(this.settings, validated)) return;
    try {
      this.settings = validated;
      this.toolkit.setOptions(layoutOptions(validated));
      this.toolkit.redoLayout();
    } catch (error) {
      throw renderError(this.itemId, error);
    }
  }

  createOriginalDownload(): VerovioDownload {
    this.ensureAlive();
    return {
      blob: new Blob([this.sourceData], { type: sourceMimeType(this.format) }),
      fileName: `${safeFileStem(this.itemId)}.${this.format === "mei" ? "mei" : "pae"}`
    };
  }

  createNormalizedMeiDownload(): VerovioDownload {
    this.ensureAlive();
    try {
      return {
        blob: new Blob([this.toolkit.getMEI()], {
          type: "application/mei+xml;charset=utf-8"
        }),
        fileName: `${safeFileStem(this.itemId)}.normalized.mei`
      };
    } catch (error) {
      throw new LodeonClientError(
        "verovio.mei_export_failed",
        {
          itemId: this.itemId,
          externalError: externalError(error)
        },
        { cause: error }
      );
    }
  }

  renderMidi(): Uint8Array {
    this.ensureAlive();
    try {
      return decodeBase64(this.toolkit.renderToMIDI());
    } catch (error) {
      throw new LodeonClientError(
        "verovio.midi_generation_failed",
        {
          itemId: this.itemId,
          externalError: externalError(error)
        },
        { cause: error }
      );
    }
  }

  elementsAtTime(milliseconds: number): VerovioTimingElements {
    this.ensureAlive();
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw renderError(this.itemId, "time_out_of_range");
    }
    const value = this.toolkit.getElementsAtTime(milliseconds);
    return normalizeTimingElements(value);
  }

  timeForElement(xmlId: string): number {
    this.ensureAlive();
    return this.toolkit.getTimeForElement(requireXmlId(xmlId, this.itemId));
  }

  timesForElement(xmlId: string): unknown {
    this.ensureAlive();
    return this.toolkit.getTimesForElement(requireXmlId(xmlId, this.itemId));
  }

  pageWithElement(xmlId: string): number {
    this.ensureAlive();
    return this.toolkit.getPageWithElement(requireXmlId(xmlId, this.itemId));
  }

  transpose(targetKey: string | null): void {
    this.ensureAlive();
    if (targetKey !== null && !SAFE_TARGET_KEY.test(targetKey)) {
      throw new LodeonClientError("verovio.transposition_failed", {
        itemId: this.itemId,
        targetKey
      });
    }
    try {
      this.targetKey = targetKey;
      this.loadOriginal();
    } catch (error) {
      if (error instanceof LodeonClientError) throw error;
      throw new LodeonClientError(
        "verovio.transposition_failed",
        {
          itemId: this.itemId,
          targetKey: targetKey ?? "original",
          externalError: externalError(error)
        },
        { cause: error }
      );
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.toolkit.destroy();
  }

  private loadOriginal(): void {
    this.toolkit.resetOptions();
    this.toolkit.setOptions({
      ...layoutOptions(this.settings),
      ...(this.targetKey ? { transpose: this.targetKey } : {})
    });
    if (this.toolkit.loadData(this.sourceData) !== 1) {
      throw new LodeonClientError("verovio.input_invalid", {
        itemId: this.itemId,
        externalError: this.toolkit.getLog()
      });
    }
  }

  private ensureAlive(): void {
    if (this.destroyed) throw renderError(this.itemId, "viewer_evicted");
  }
}

export function validateViewerSettings(settings: VerovioViewerSettings): VerovioViewerSettings {
  if (
    !["responsive", "paginated"].includes(settings.documentLayout) ||
    !Number.isFinite(settings.zoom) ||
    settings.zoom < 0.25 ||
    settings.zoom > 4 ||
    !Number.isFinite(settings.containerWidth) ||
    settings.containerWidth < MIN_CONTAINER_WIDTH ||
    settings.containerWidth > MAX_CONTAINER_WIDTH ||
    !Number.isInteger(settings.paginatedPageHeight) ||
    settings.paginatedPageHeight < 100 ||
    settings.paginatedPageHeight > 60000
  ) {
    throw viewerInitializationError("settings_invalid");
  }
  return { ...settings };
}

export function observeVerovioContainer(
  container: HTMLElement,
  onWidthChange: (width: number) => void,
  createObserver: ResizeObserverFactory = (callback) => new ResizeObserver(callback)
): () => void {
  let lastWidth: number | null = null;
  let active = true;
  const publish = (width: number): void => {
    if (!active || !Number.isFinite(width) || width < MIN_CONTAINER_WIDTH || width === lastWidth) {
      return;
    }
    lastWidth = width;
    onWidthChange(width);
  };
  const observer = createObserver((entries) => {
    const entry = entries.find(({ target }) => target === container);
    if (entry) publish(entry.contentRect.width);
  });

  observer.observe(container);
  publish(container.getBoundingClientRect().width);

  return () => {
    if (!active) return;
    active = false;
    observer.disconnect();
  };
}

export function sanitizeVerovioSvg(source: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "image/svg+xml");
  const root = document.documentElement;

  if (root.localName !== "svg" || document.querySelector("parsererror")) {
    throw renderError("unknown", "svg_invalid");
  }

  for (const element of [
    ...document.querySelectorAll("script, foreignObject, iframe, object, embed, image, audio, video, link")
  ]) {
    element.remove();
  }
  for (const element of [...document.querySelectorAll("*")]) {
    if (
      element.localName === "style" &&
      /(?:url\s*\(|expression\s*\(|@import)/i.test(element.textContent ?? "")
    ) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (
        name.startsWith("on") ||
        /(?:expression\s*\(|@import)/i.test(value) ||
        hasUnsafeCssUrl(value) ||
        (["href", "xlink:href", "src"].includes(name) && !value.startsWith("#"))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return new XMLSerializer().serializeToString(root);
}

function hasUnsafeCssUrl(value: string): boolean {
  if (!/url\s*\(/i.test(value)) return false;
  const matches = [...value.matchAll(/url\s*\(\s*(["']?)(.*?)\1\s*\)/gi)];
  return matches.length === 0 || matches.some((match) => !match[2].trim().startsWith("#"));
}

async function loadSharedVerovioBindings(): Promise<VerovioBindings> {
  sharedBindingsPromise ??= Promise.all([import("verovio/wasm"), import("verovio/esm")])
    .then(async ([wasm, esm]) => {
      const module = await wasm.default();
      return { createToolkit: () => new esm.VerovioToolkit(module) };
    })
    .catch((error) => {
      sharedBindingsPromise = null;
      throw viewerInitializationError(error);
    });
  return sharedBindingsPromise;
}

function layoutOptions(settings: VerovioViewerSettings): Record<string, unknown> {
  return {
    svgViewBox: true,
    pageWidth: Math.round(settings.containerWidth / settings.zoom),
    pageHeight:
      settings.documentLayout === "responsive" ? RESPONSIVE_PAGE_HEIGHT : settings.paginatedPageHeight,
    breaks: settings.documentLayout === "responsive" ? "none" : "auto",
    adjustPageHeight: settings.documentLayout === "responsive",
    scale: Math.round(BASE_SCALE * settings.zoom)
  };
}

function sameSettings(left: VerovioViewerSettings, right: VerovioViewerSettings): boolean {
  return (
    left.documentLayout === right.documentLayout &&
    left.zoom === right.zoom &&
    left.containerWidth === right.containerWidth &&
    left.paginatedPageHeight === right.paginatedPageHeight
  );
}

function logDiagnostics(log: string): VerovioEngineDiagnostic[] {
  return log.split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^\[(Warning|Error)\]\s*(.*)$/i);
    if (!match) return [];
    return [
      {
        severity: match[1].toLowerCase() === "warning" ? "warning" : "error",
        ...(match[2] ? { externalError: match[2] } : {})
      } satisfies VerovioEngineDiagnostic
    ];
  });
}

function paeDiagnostics(value: unknown): VerovioEngineDiagnostic[] {
  const diagnostics: VerovioEngineDiagnostic[] = [];
  collectPaeDiagnostics(value, diagnostics);
  return diagnostics;
}

function collectPaeDiagnostics(value: unknown, output: VerovioEngineDiagnostic[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectPaeDiagnostics(item, output));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const externalError = [record.message, record.text, record.code].find(
    (item): item is string | number => typeof item === "string" || typeof item === "number"
  );
  const row = finiteInteger(record.row ?? record.line);
  const column = finiteInteger(record.column ?? record.col);
  const severityValue = String(record.severity ?? record.type ?? "warning").toLowerCase();

  if (externalError !== undefined || row !== undefined || column !== undefined) {
    output.push({
      severity: severityValue.includes("error") ? "error" : "warning",
      ...(externalError !== undefined ? { externalError: String(externalError) } : {}),
      ...(row !== undefined || column !== undefined
        ? {
            location: {
              ...(row !== undefined ? { row } : {}),
              ...(column !== undefined ? { column } : {})
            }
          }
        : {})
    });
  }
  Object.values(record).forEach((item) => {
    if (item && typeof item === "object") collectPaeDiagnostics(item, output);
  });
}

function uniqueDiagnostics(values: VerovioEngineDiagnostic[]): VerovioEngineDiagnostic[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeTimingElements(value: unknown): VerovioTimingElements {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    notes: stringArray(record.notes),
    chords: stringArray(record.chords),
    rests: stringArray(record.rests),
    measure: typeof record.measure === "string" ? record.measure : null,
    page: finiteInteger(record.page) ?? null
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function requireXmlId(value: string, itemId: string): string {
  const normalized = value.trim();
  if (!normalized) throw renderError(itemId, "element_id_missing");
  return normalized;
}

function requireViewerKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw viewerInitializationError("viewer_key_missing");
  return normalized;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function sourceMimeType(format: VerovioInputFormat): string {
  return format === "mei" ? "application/mei+xml;charset=utf-8" : "text/plain;charset=utf-8";
}

function safeFileStem(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "notation";
}

function externalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function renderError(itemId: string, error: unknown): LodeonClientError {
  return new LodeonClientError(
    "verovio.render_failed",
    {
      itemId,
      externalError: externalError(error)
    },
    { cause: error }
  );
}

function viewerInitializationError(error: unknown): LodeonClientError {
  return new LodeonClientError(
    "verovio.viewer_initialization_failed",
    {
      externalError: externalError(error)
    },
    { cause: error }
  );
}

function requirePinnedVersion(value: string): string {
  if (value !== EXPECTED_VEROVIO_VERSION && !value.startsWith(`${EXPECTED_VEROVIO_VERSION}-`)) {
    throw viewerInitializationError(`version:${value}`);
  }
  return value;
}

function isDestroyedToolkitError(error: unknown): boolean {
  return (
    error instanceof LodeonClientError &&
    error.code === "verovio.viewer_initialization_failed" &&
    error.variables.externalError === "stale_generation"
  );
}
