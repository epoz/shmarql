/** Coordinates exclusive MIDI playback progress and score highlighting. */

import processorUrl from "spessasynth_lib/dist/spessasynth_processor.min.js?url";
import type { WorkletSynthesizer as SpessaWorkletSynthesizer } from "spessasynth_lib";
import { LodeonClientError } from "../../errors/client-error";
import { VEROVIO_TEMPO_MULTIPLIERS, type VerovioComparePlaybackMode } from "./contracts";
import type { VerovioDocument, VerovioTimingElements } from "./engine";

export type VerovioPlayableItem = {
  id: string;
  midi: Uint8Array;
  timing: Pick<VerovioDocument, "elementsAtTime" | "pageWithElement">;
};

export type VerovioPlaybackStatus = "loading" | "playing" | "paused" | "stopped";

export type VerovioPlaybackSnapshot = {
  ownerId: string;
  itemId: string;
  status: VerovioPlaybackStatus;
  currentTime: number;
  duration: number;
  progress: number;
  tempoMultiplier: number;
  loop: boolean;
  volume: number;
  sequenceIndex: number;
  sequenceLength: number;
  highlight: VerovioTimingElements;
};

export type VerovioPlaybackRequest = {
  ownerId: string;
  items: VerovioPlayableItem[];
  tempoMultiplier: number;
  loop: boolean;
  volume: number;
  onUpdate(snapshot: VerovioPlaybackSnapshot | null): void;
  onError?(error: LodeonClientError): void;
};

export type VerovioPlaybackCoordinator = {
  readonly activeOwnerId: string | null;
  readonly snapshot: VerovioPlaybackSnapshot | null;
  play(request: VerovioPlaybackRequest): Promise<void>;
  pause(ownerId: string): void;
  resume(ownerId: string): Promise<void>;
  stop(ownerId: string): void;
  restart(ownerId: string): Promise<void>;
  seek(ownerId: string, timeSeconds: number): void;
  setTempoMultiplier(ownerId: string, value: number): void;
  setLoop(ownerId: string, value: boolean): void;
  setVolume(ownerId: string, value: number): void;
  release(ownerId: string): void;
  handlePageHidden(): void;
  destroy(): Promise<void>;
};

export type MidiPlaybackBackend = {
  readonly currentTime: number;
  readonly duration: number;
  load(item: VerovioPlayableItem): Promise<void>;
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  setLoop(loop: boolean): void;
  setTempoMultiplier(value: number): void;
  setVolume(value: number): void;
  resumeAudio(): Promise<void>;
  onEnded(callback: () => void): () => void;
  onError(callback: (error: unknown) => void): () => void;
  destroy(): Promise<void>;
};

type PlaybackDependencies = {
  createBackend?: () => Promise<MidiPlaybackBackend>;
  setInterval?: (callback: () => void, milliseconds: number) => number;
  clearInterval?: (handle: number) => void;
};

export type SpessaSynthInitializationStage =
  | "importing"
  | "context"
  | "worklet"
  | "synthesizer"
  | "audio"
  | "soundfont-fetch"
  | "soundfont-load"
  | "ready"
  | "sequencer";

type SpessaSynthBackendDependencies = {
  onStage?(stage: SpessaSynthInitializationStage): void;
};

type PlaybackLifecycleTarget = EventTarget & {
  readonly hidden?: boolean;
};

type ActivePlayback = {
  request: VerovioPlaybackRequest;
  sequenceIndex: number;
  status: VerovioPlaybackStatus;
  generation: number;
};

const UPDATE_INTERVAL_MS = 50;
const EMPTY_HIGHLIGHT: VerovioTimingElements = {
  notes: [],
  chords: [],
  rests: [],
  measure: null,
  page: null
};
const DEFAULT_SOUNDFONT_PATH = "assets/verovio/GeneralUserGS.sf3";
const SOUNDFONT_ID = "general-user-gs-2.0.3-beta";
const EVENT_ID = "lodeon-verovio-playback";

let sharedSoundfontPromise: Promise<ArrayBuffer> | null = null;
let soundfontPath = DEFAULT_SOUNDFONT_PATH;
let globalPlaybackCoordinator: VerovioPlaybackCoordinator | null = null;
let removeGlobalPlaybackLifecycle: (() => void) | null = null;

/** Selects the configured local soundfont path without initiating playback or network access. */
export function setVerovioSoundfontPath(path: string): void {
  const normalized = path.trim();
  if (!normalized || normalized === soundfontPath) return;
  soundfontPath = normalized;
  sharedSoundfontPromise = null;
}

/** Returns the story-wide coordinator that enforces one simultaneously playing item. */
export function getGlobalVerovioPlaybackCoordinator(): VerovioPlaybackCoordinator {
  if (!globalPlaybackCoordinator) {
    globalPlaybackCoordinator = createVerovioPlaybackCoordinator();
    removeGlobalPlaybackLifecycle = bindVerovioPlaybackLifecycle(globalPlaybackCoordinator, document, window);
  }
  return globalPlaybackCoordinator;
}

/** Stops audio and destroys the story-wide synthesizer idempotently during teardown. */
export async function destroyGlobalVerovioPlaybackCoordinator(): Promise<void> {
  const coordinator = globalPlaybackCoordinator;
  globalPlaybackCoordinator = null;
  removeGlobalPlaybackLifecycle?.();
  removeGlobalPlaybackLifecycle = null;
  await coordinator?.destroy();
}

/** Binds one NodeView to exclusive playback and releases ownership on destruction. */
export function bindVerovioPlaybackLifecycle(
  coordinator: VerovioPlaybackCoordinator,
  visibilityTarget: PlaybackLifecycleTarget,
  pageTarget: EventTarget = visibilityTarget
): () => void {
  const handleVisibility = (): void => {
    if (visibilityTarget.hidden) coordinator.handlePageHidden();
  };
  const handlePageHide = (): void => coordinator.handlePageHidden();
  visibilityTarget.addEventListener("visibilitychange", handleVisibility);
  pageTarget.addEventListener("pagehide", handlePageHide);
  return () => {
    visibilityTarget.removeEventListener("visibilitychange", handleVisibility);
    pageTarget.removeEventListener("pagehide", handlePageHide);
  };
}

/**
 * Creates the single-playback coordinator. It enforces one audible item across
 * the rendered story and requires asynchronous destruction of Web Audio state.
 */
export function createVerovioPlaybackCoordinator(
  dependencies: PlaybackDependencies = {}
): VerovioPlaybackCoordinator {
  const createBackend = dependencies.createBackend ?? createSpessaSynthBackend;
  const scheduleInterval =
    dependencies.setInterval ?? ((callback, milliseconds) => window.setInterval(callback, milliseconds));
  const cancelInterval = dependencies.clearInterval ?? ((handle) => window.clearInterval(handle));
  let backendPromise: Promise<MidiPlaybackBackend> | null = null;
  let backendInstance: MidiPlaybackBackend | null = null;
  let removeEndedListener: (() => void) | null = null;
  let removeErrorListener: (() => void) | null = null;
  let interval: number | null = null;
  let active: ActivePlayback | null = null;
  let currentSnapshot: VerovioPlaybackSnapshot | null = null;
  let generation = 0;
  let destroyed = false;

  return {
    get activeOwnerId() {
      return active?.request.ownerId ?? null;
    },
    get snapshot() {
      return currentSnapshot;
    },
    play,
    pause,
    resume,
    stop,
    restart,
    seek,
    setTempoMultiplier,
    setLoop,
    setVolume,
    release,
    handlePageHidden,
    destroy
  };

  async function play(request: VerovioPlaybackRequest): Promise<void> {
    ensureCoordinatorAlive();
    const normalized = validatePlaybackRequest(request);
    stopActive(true);
    const playback: ActivePlayback = {
      request: normalized,
      sequenceIndex: 0,
      status: "loading",
      generation: ++generation
    };
    active = playback;
    publishSnapshot(playback, 0, 0, EMPTY_HIGHLIGHT);

    try {
      const backend = await getBackend();
      if (destroyed || active !== playback || playback.generation !== generation) return;
      await backend.resumeAudio();
      if (destroyed || active !== playback || playback.generation !== generation) return;
      configureBackend(backend, playback);
      await loadSequenceItem(backend, playback, 0);
      if (destroyed || active !== playback || playback.generation !== generation) return;
      backend.play();
      playback.status = "playing";
      startUpdates();
      updateSnapshot();
    } catch (error) {
      if (destroyed || active !== playback) return;
      if (active === playback) stopActive(false);
      if (error instanceof LodeonClientError) throw error;
      throw playbackError(playback.request.items[0]?.id ?? "unknown", error);
    }
  }

  function pause(ownerId: string): void {
    const playback = requireOwnership(ownerId);
    if (playback.status !== "playing") return;
    requireReadyBackend().pause();
    playback.status = "paused";
    stopUpdates();
    updateSnapshot();
  }

  async function resume(ownerId: string): Promise<void> {
    const playback = requireOwnership(ownerId);
    if (playback.status === "playing") return;
    const backend = requireReadyBackend();
    try {
      await backend.resumeAudio();
      if (active !== playback) return;
      backend.play();
      playback.status = "playing";
      startUpdates();
      updateSnapshot();
    } catch (error) {
      throw playbackError(currentItem(playback).id, error);
    }
  }

  function stop(ownerId: string): void {
    if (active?.request.ownerId !== ownerId) return;
    stopActive(false);
  }

  async function restart(ownerId: string): Promise<void> {
    const playback = requireOwnership(ownerId);
    const backend = requireReadyBackend();
    try {
      backend.pause();
      await loadSequenceItem(backend, playback, 0);
      if (active !== playback) return;
      await backend.resumeAudio();
      if (active !== playback) return;
      backend.play();
      playback.status = "playing";
      startUpdates();
      updateSnapshot();
    } catch (error) {
      throw playbackError(currentItem(playback).id, error);
    }
  }

  function seek(ownerId: string, timeSeconds: number): void {
    const playback = requireOwnership(ownerId);
    const backend = requireReadyBackend();
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > backend.duration) {
      throw seekError(currentItem(playback).id, timeSeconds, "time_out_of_range");
    }
    try {
      backend.seek(timeSeconds);
      publishSnapshot(
        playback,
        timeSeconds,
        backend.duration,
        currentItem(playback).timing.elementsAtTime(timeSeconds * 1000)
      );
    } catch (error) {
      throw seekError(currentItem(playback).id, timeSeconds, error);
    }
  }

  function setTempoMultiplier(ownerId: string, value: number): void {
    const playback = requireOwnership(ownerId);
    requireTempoMultiplier(value);
    playback.request.tempoMultiplier = value;
    requireReadyBackend().setTempoMultiplier(value);
    updateSnapshot();
  }

  function setLoop(ownerId: string, value: boolean): void {
    const playback = requireOwnership(ownerId);
    playback.request.loop = value;
    requireReadyBackend().setLoop(value && playback.request.items.length === 1);
    updateSnapshot();
  }

  function setVolume(ownerId: string, value: number): void {
    const playback = requireOwnership(ownerId);
    requireVolume(value);
    playback.request.volume = value;
    requireReadyBackend().setVolume(value);
    updateSnapshot();
  }

  function release(ownerId: string): void {
    if (active?.request.ownerId === ownerId) stopActive(true);
  }

  function handlePageHidden(): void {
    if (active) stopActive(false);
  }

  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    stopActive(true);
    removeBackendListeners();
    const pending = backendPromise;
    backendPromise = null;
    backendInstance = null;
    if (pending) {
      try {
        const backend = await pending;
        await backend.destroy();
      } catch {
        // Initialization failures have no usable backend state left to release.
      }
    }
  }

  async function getBackend(): Promise<MidiPlaybackBackend> {
    if (!backendPromise) {
      backendPromise = createBackend()
        .then((backend) => {
          if (destroyed) {
            void backend.destroy();
            throw initializationError("coordinator_destroyed");
          }
          removeEndedListener = backend.onEnded(handleEnded);
          removeErrorListener = backend.onError(handleBackendError);
          backendInstance = backend;
          return backend;
        })
        .catch((error) => {
          backendPromise = null;
          backendInstance = null;
          if (error instanceof LodeonClientError) throw error;
          throw initializationError(error);
        });
    }
    return backendPromise;
  }

  function configureBackend(backend: MidiPlaybackBackend, playback: ActivePlayback): void {
    backend.setTempoMultiplier(playback.request.tempoMultiplier);
    backend.setVolume(playback.request.volume);
    backend.setLoop(playback.request.loop && playback.request.items.length === 1);
  }

  async function loadSequenceItem(
    backend: MidiPlaybackBackend,
    playback: ActivePlayback,
    index: number
  ): Promise<void> {
    playback.sequenceIndex = index;
    await backend.load(playback.request.items[index]);
    backend.seek(0);
  }

  function handleEnded(): void {
    const playback = active;
    if (!playback) return;
    void advanceAfterEnd(playback).catch((error) => {
      if (active === playback) handleBackendError(error);
    });
  }

  async function advanceAfterEnd(playback: ActivePlayback): Promise<void> {
    if (active !== playback) return;
    const backend = requireReadyBackend();
    const nextIndex = playback.sequenceIndex + 1;
    if (nextIndex < playback.request.items.length) {
      await loadSequenceItem(backend, playback, nextIndex);
      if (active !== playback) return;
      backend.play();
      playback.status = "playing";
      updateSnapshot();
      return;
    }
    if (playback.request.items.length > 1 && playback.request.loop) {
      await loadSequenceItem(backend, playback, 0);
      if (active !== playback) return;
      backend.play();
      playback.status = "playing";
      updateSnapshot();
      return;
    }
    stopActive(false);
  }

  function handleBackendError(error: unknown): void {
    const playback = active;
    const itemId = playback ? currentItem(playback).id : "unknown";
    const codedError = playbackError(itemId, error);
    stopActive(false);
    playback?.request.onError?.(codedError);
  }

  function startUpdates(): void {
    stopUpdates();
    interval = scheduleInterval(updateSnapshot, UPDATE_INTERVAL_MS);
  }

  function stopUpdates(): void {
    if (interval === null) return;
    cancelInterval(interval);
    interval = null;
  }

  function updateSnapshot(): void {
    const playback = active;
    const backend = backendInstance;
    if (!playback || !backend) return;
    try {
      const currentTime = boundedTime(backend.currentTime, backend.duration);
      const highlight = currentItem(playback).timing.elementsAtTime(currentTime * 1000);
      publishSnapshot(playback, currentTime, backend.duration, highlight);
    } catch (error) {
      if (active === playback) handleBackendError(error);
    }
  }

  function publishSnapshot(
    playback: ActivePlayback,
    currentTime: number,
    duration: number,
    highlight: VerovioTimingElements
  ): void {
    const item = currentItem(playback);
    const page = playbackPage(item.timing, highlight);
    currentSnapshot = {
      ownerId: playback.request.ownerId,
      itemId: currentItem(playback).id,
      status: playback.status,
      currentTime,
      duration,
      progress: duration > 0 ? currentTime / duration : 0,
      tempoMultiplier: playback.request.tempoMultiplier,
      loop: playback.request.loop,
      volume: playback.request.volume,
      sequenceIndex: playback.sequenceIndex,
      sequenceLength: playback.request.items.length,
      highlight: { ...highlight, page }
    };
    playback.request.onUpdate(currentSnapshot);
  }

  function playbackPage(
    timing: VerovioPlayableItem["timing"],
    highlight: VerovioTimingElements
  ): number | null {
    const elementIds = [
      ...highlight.notes,
      ...highlight.chords,
      ...highlight.rests,
      ...(highlight.measure ? [highlight.measure] : [])
    ];
    for (const xmlId of elementIds) {
      const elementPage = timing.pageWithElement(xmlId);
      if (Number.isInteger(elementPage) && elementPage > 0) return elementPage;
    }
    return highlight.page && highlight.page > 0 ? highlight.page : null;
  }

  function stopActive(superseded: boolean): void {
    const playback = active;
    if (!playback) return;
    generation += 1;
    stopUpdates();
    if (backendPromise) {
      void backendPromise
        .then((backend) => {
          backend.pause();
          backend.seek(0);
          backend.setLoop(false);
        })
        .catch(() => undefined);
    }
    active = null;
    currentSnapshot = null;
    playback.request.onUpdate(null);
    if (!superseded) playback.status = "stopped";
  }

  function removeBackendListeners(): void {
    removeEndedListener?.();
    removeErrorListener?.();
    removeEndedListener = null;
    removeErrorListener = null;
  }

  function requireOwnership(ownerId: string): ActivePlayback {
    if (!active || active.request.ownerId !== ownerId) {
      throw playbackError("unknown", "owner_inactive");
    }
    return active;
  }

  function requireReadyBackend(): MidiPlaybackBackend {
    if (!backendInstance) throw initializationError("backend_not_ready");
    return backendInstance;
  }

  function ensureCoordinatorAlive(): void {
    if (destroyed) throw initializationError("coordinator_destroyed");
  }
}

/** Resolves the explicitly selected sequential Compare playback order without overlap. */
export function verovioComparePlaybackItems(
  mode: VerovioComparePlaybackMode,
  a: VerovioPlayableItem,
  b: VerovioPlayableItem
): VerovioPlayableItem[] {
  switch (mode) {
    case "a":
      return [a];
    case "b":
      return [b];
    case "aThenB":
      return [a, b];
    case "bThenA":
      return [b, a];
  }
}

/** Creates the Web-Audio MIDI backend from controlled local runtime assets. */
export async function createSpessaSynthBackend(
  dependencies: SpessaSynthBackendDependencies = {}
): Promise<MidiPlaybackBackend> {
  let context: AudioContext | null = null;
  let synthesizer: SpessaWorkletSynthesizer | null = null;
  let outputGain: GainNode | null = null;
  try {
    dependencies.onStage?.("context");
    context = new AudioContext();
    const initialResume = context.resume();
    dependencies.onStage?.("importing");
    const { Sequencer, WorkletSynthesizer } = await import("spessasynth_lib");
    dependencies.onStage?.("worklet");
    await context.audioWorklet.addModule(processorUrl);
    dependencies.onStage?.("synthesizer");
    synthesizer = new WorkletSynthesizer(context);
    outputGain = context.createGain();
    synthesizer.connect(outputGain);
    outputGain.connect(context.destination);
    dependencies.onStage?.("audio");
    void initialResume.catch(() => undefined);
    dependencies.onStage?.("soundfont-fetch");
    const soundfont = (await loadSoundfont()).slice(0);
    dependencies.onStage?.("soundfont-load");
    await synthesizer.soundBankManager.addSoundBank(soundfont, SOUNDFONT_ID);
    dependencies.onStage?.("ready");
    await synthesizer.isReady;
    dependencies.onStage?.("sequencer");
    const sequencer = new Sequencer(synthesizer, {
      skipToFirstNoteOn: false,
      initialPlaybackRate: 1
    });
    const endedCallbacks = new Set<() => void>();
    const errorCallbacks = new Set<(error: unknown) => void>();
    let pendingLoad: {
      resolve(): void;
      reject(error: unknown): void;
    } | null = null;
    let loadChain = Promise.resolve();
    sequencer.eventHandler.addEvent("songChange", EVENT_ID, () => {
      pendingLoad?.resolve();
      pendingLoad = null;
    });
    sequencer.eventHandler.addEvent("songEnded", EVENT_ID, () => {
      endedCallbacks.forEach((callback) => callback());
    });
    sequencer.eventHandler.addEvent("midiError", EVENT_ID, (error) => {
      if (pendingLoad) {
        pendingLoad.reject(error);
        pendingLoad = null;
      } else {
        errorCallbacks.forEach((callback) => callback(error));
      }
    });
    let destroyed = false;

    return {
      get currentTime() {
        return sequencer.currentHighResolutionTime;
      },
      get duration() {
        return sequencer.duration;
      },
      load(item) {
        const binary = exactArrayBuffer(item.midi);
        const nextLoad = loadChain
          .catch(() => undefined)
          .then(
            () =>
              new Promise<void>((resolve, reject) => {
                pendingLoad = { resolve, reject };
                try {
                  sequencer.loadNewSongList([{ binary, fileName: `${item.id}.mid` }]);
                } catch (error) {
                  pendingLoad = null;
                  reject(error instanceof Error ? error : new Error(String(error)));
                }
              })
          );
        loadChain = nextLoad;
        return nextLoad;
      },
      play() {
        sequencer.play();
      },
      pause() {
        sequencer.pause();
      },
      seek(timeSeconds) {
        sequencer.currentTime = timeSeconds;
      },
      setLoop(loop) {
        sequencer.loopCount = loop ? -1 : 0;
      },
      setTempoMultiplier(value) {
        sequencer.playbackRate = value;
      },
      setVolume(value) {
        if (outputGain) outputGain.gain.setValueAtTime(value, context!.currentTime);
      },
      async resumeAudio() {
        await context!.resume();
      },
      onEnded(callback) {
        endedCallbacks.add(callback);
        return () => endedCallbacks.delete(callback);
      },
      onError(callback) {
        errorCallbacks.add(callback);
        return () => errorCallbacks.delete(callback);
      },
      async destroy() {
        if (destroyed) return;
        destroyed = true;
        endedCallbacks.clear();
        errorCallbacks.clear();
        pendingLoad?.reject(new Error("backend_destroyed"));
        pendingLoad = null;
        sequencer.eventHandler.removeEvent("songChange", EVENT_ID);
        sequencer.eventHandler.removeEvent("songEnded", EVENT_ID);
        sequencer.eventHandler.removeEvent("midiError", EVENT_ID);
        sequencer.pause();
        synthesizer?.disconnect(outputGain ?? undefined);
        outputGain?.disconnect();
        outputGain = null;
        synthesizer?.destroy();
        synthesizer = null;
        if (context && context.state !== "closed") await context.close();
        context = null;
      }
    };
  } catch (error) {
    outputGain?.disconnect();
    outputGain = null;
    synthesizer?.destroy();
    if (context && context.state !== "closed") await context.close();
    if (error instanceof LodeonClientError) throw error;
    throw initializationError(error);
  }
}

async function loadSoundfont(): Promise<ArrayBuffer> {
  sharedSoundfontPromise ??= fetch(new URL(soundfontPath, document.baseURI))
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .catch((error) => {
      sharedSoundfontPromise = null;
      throw new LodeonClientError(
        "verovio.soundfont_load_failed",
        {
          externalError: externalError(error)
        },
        { cause: error }
      );
    });
  return sharedSoundfontPromise;
}

function validatePlaybackRequest(request: VerovioPlaybackRequest): VerovioPlaybackRequest {
  if (!request.ownerId.trim() || request.items.length < 1 || request.items.length > 2) {
    throw playbackError(request.items[0]?.id ?? "unknown", "request_invalid");
  }
  if (request.items.some((item) => !item.id.trim() || item.midi.byteLength === 0)) {
    throw playbackError(request.items[0]?.id ?? "unknown", "item_invalid");
  }
  requireTempoMultiplier(request.tempoMultiplier);
  requireVolume(request.volume);
  return {
    ...request,
    ownerId: request.ownerId.trim(),
    items: [...request.items]
  };
}

function requireTempoMultiplier(value: number): void {
  if (!(VEROVIO_TEMPO_MULTIPLIERS as readonly number[]).includes(value)) {
    throw playbackError("unknown", "tempo_multiplier_invalid");
  }
}

function requireVolume(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw playbackError("unknown", "volume_invalid");
  }
}

function currentItem(playback: ActivePlayback): VerovioPlayableItem {
  return playback.request.items[playback.sequenceIndex];
}

function boundedTime(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || currentTime < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return currentTime;
  return Math.min(currentTime, duration);
}

function exactArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function externalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function initializationError(error: unknown): LodeonClientError {
  return new LodeonClientError(
    "verovio.playback_initialization_failed",
    {
      externalError: externalError(error)
    },
    { cause: error }
  );
}

function playbackError(itemId: string, error: unknown): LodeonClientError {
  return new LodeonClientError(
    "verovio.playback_failed",
    {
      itemId,
      externalError: externalError(error)
    },
    { cause: error }
  );
}

function seekError(itemId: string, timeSeconds: number, error: unknown): LodeonClientError {
  return new LodeonClientError(
    "verovio.seek_failed",
    {
      itemId,
      timeSeconds,
      externalError: externalError(error)
    },
    { cause: error }
  );
}
