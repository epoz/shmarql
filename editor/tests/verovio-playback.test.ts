import { describe, expect, it, vi } from "vitest";
import { LodeonClientError } from "@lodeon/errors/client-error";
import {
  bindVerovioPlaybackLifecycle,
  createVerovioPlaybackCoordinator,
  verovioComparePlaybackItems,
  type MidiPlaybackBackend,
  type VerovioPlayableItem,
  type VerovioPlaybackSnapshot
} from "@lodeon/nodes/verovio/playback";

describe("Verovio global playback coordinator", () => {
  it("provides transport, seeking, tempo, volume, progress, and highlights", async () => {
    const clock = fakeIntervalClock();
    const backend = fakeBackend();
    const updates: Array<VerovioPlaybackSnapshot | null> = [];
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: async () => backend,
      ...clock.dependencies
    });

    await coordinator.play(request("node-a", [playable("item-a")], updates));
    expect(backend.load).toHaveBeenCalledTimes(1);
    expect(backend.play).toHaveBeenCalledTimes(1);
    expect(coordinator.snapshot).toMatchObject({
      ownerId: "node-a",
      itemId: "item-a",
      status: "playing",
      tempoMultiplier: 1,
      volume: 0.8
    });

    backend.currentTimeValue = 2;
    backend.durationValue = 8;
    clock.tick();
    await flushPromises();
    expect(coordinator.snapshot).toMatchObject({
      currentTime: 2,
      duration: 8,
      progress: 0.25,
      highlight: {
        notes: ["item-a-note"],
        measure: "item-a-measure",
        page: 2
      }
    });

    coordinator.pause("node-a");
    expect(coordinator.snapshot?.status).toBe("paused");
    expect(clock.activeCount).toBe(0);
    await coordinator.resume("node-a");
    expect(coordinator.snapshot?.status).toBe("playing");
    coordinator.seek("node-a", 4);
    coordinator.setTempoMultiplier("node-a", 1.5);
    coordinator.setVolume("node-a", 0.5);
    coordinator.setLoop("node-a", true);
    expect(backend.seek).toHaveBeenLastCalledWith(4);
    expect(backend.setTempoMultiplier).toHaveBeenLastCalledWith(1.5);
    expect(backend.setVolume).toHaveBeenLastCalledWith(0.5);
    expect(backend.setLoop).toHaveBeenLastCalledWith(true);

    await coordinator.restart("node-a");
    expect(backend.load).toHaveBeenCalledTimes(2);
    expect(coordinator.snapshot?.sequenceIndex).toBe(0);
    coordinator.stop("node-a");
    expect(coordinator.activeOwnerId).toBeNull();
    expect(updates.at(-1)).toBeNull();
    await coordinator.destroy();
    expect(backend.destroy).toHaveBeenCalledTimes(1);
  });

  it("enforces one active owner across the page and ignores inactive controls", async () => {
    const backend = fakeBackend();
    const firstUpdates: Array<VerovioPlaybackSnapshot | null> = [];
    const secondUpdates: Array<VerovioPlaybackSnapshot | null> = [];
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: async () => backend
    });

    await coordinator.play(request("node-a", [playable("a")], firstUpdates));
    await coordinator.play(request("node-b", [playable("b")], secondUpdates));
    expect(firstUpdates.at(-1)).toBeNull();
    expect(coordinator.activeOwnerId).toBe("node-b");
    expect(backend.pause).toHaveBeenCalled();
    expect(backend.loadedIds).toEqual(["a", "b"]);

    coordinator.stop("node-a");
    expect(coordinator.activeOwnerId).toBe("node-b");
    expect(() => coordinator.pause("node-a")).toThrowError(LodeonClientError);
    coordinator.release("node-b");
    expect(coordinator.activeOwnerId).toBeNull();
    await coordinator.destroy();
  });

  it("orchestrates A, B, A-to-B, B-to-A, and sequence looping without overlap", async () => {
    const backend = fakeBackend();
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: async () => backend
    });
    const a = playable("a");
    const b = playable("b");

    expect(verovioComparePlaybackItems("a", a, b).map(({ id }) => id)).toEqual(["a"]);
    expect(verovioComparePlaybackItems("b", a, b).map(({ id }) => id)).toEqual(["b"]);
    expect(verovioComparePlaybackItems("aThenB", a, b).map(({ id }) => id)).toEqual(["a", "b"]);
    expect(verovioComparePlaybackItems("bThenA", a, b).map(({ id }) => id)).toEqual(["b", "a"]);

    await coordinator.play({
      ...request("compare", [a, b], []),
      loop: true
    });
    expect(backend.loadedIds).toEqual(["a"]);
    expect(backend.setLoop).toHaveBeenLastCalledWith(false);
    backend.end();
    await flushPromises();
    expect(backend.loadedIds).toEqual(["a", "b"]);
    expect(coordinator.snapshot).toMatchObject({ itemId: "b", sequenceIndex: 1 });
    backend.end();
    await flushPromises();
    expect(backend.loadedIds).toEqual(["a", "b", "a"]);
    expect(coordinator.snapshot).toMatchObject({ itemId: "a", sequenceIndex: 0 });
    expect(backend.maxConcurrentPlayCalls).toBe(1);
    await coordinator.destroy();
  });

  it("rejects stale initialization and cleans up page-hide and destruction state", async () => {
    const backend = fakeBackend();
    let resolveBackend!: (backend: MidiPlaybackBackend) => void;
    const pendingBackend = new Promise<MidiPlaybackBackend>((resolve) => {
      resolveBackend = resolve;
    });
    const aUpdates: Array<VerovioPlaybackSnapshot | null> = [];
    const bUpdates: Array<VerovioPlaybackSnapshot | null> = [];
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: () => pendingBackend
    });

    const first = coordinator.play(request("a-owner", [playable("a")], aUpdates));
    const second = coordinator.play(request("b-owner", [playable("b")], bUpdates));
    resolveBackend(backend);
    await Promise.all([first, second]);
    expect(backend.loadedIds).toEqual(["b"]);
    expect(aUpdates.at(-1)).toBeNull();
    expect(coordinator.activeOwnerId).toBe("b-owner");

    coordinator.handlePageHidden();
    expect(coordinator.activeOwnerId).toBeNull();
    await coordinator.destroy();
    await coordinator.destroy();
    expect(backend.destroy).toHaveBeenCalledTimes(1);
    await expect(coordinator.play(request("late", [playable("late")], [])))
      .rejects.toMatchObject({ code: "verovio.playback_initialization_failed" });
  });

  it("stops global playback on hidden-page and page-hide lifecycle events", async () => {
    const backend = fakeBackend();
    const coordinator = createVerovioPlaybackCoordinator({ createBackend: async () => backend });
    const visibilityTarget = Object.assign(new EventTarget(), { hidden: false });
    const pageTarget = new EventTarget();
    const cleanup = bindVerovioPlaybackLifecycle(coordinator, visibilityTarget, pageTarget);

    await coordinator.play(request("visible-owner", [playable("a")], []));
    visibilityTarget.hidden = true;
    visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    expect(coordinator.activeOwnerId).toBeNull();

    visibilityTarget.hidden = false;
    await coordinator.play(request("page-owner", [playable("b")], []));
    pageTarget.dispatchEvent(new Event("pagehide"));
    expect(coordinator.activeOwnerId).toBeNull();

    cleanup();
    await coordinator.play(request("retained-owner", [playable("c")], []));
    pageTarget.dispatchEvent(new Event("pagehide"));
    expect(coordinator.activeOwnerId).toBe("retained-owner");
    await coordinator.destroy();
  });

  it("does not let a superseded MIDI load failure stop the new owner", async () => {
    const backend = fakeBackend();
    let rejectFirstLoad!: (error: unknown) => void;
    let markFirstLoadStarted!: () => void;
    const firstLoadStarted = new Promise<void>((resolve) => {
      markFirstLoadStarted = resolve;
    });
    let loadCalls = 0;
    backend.load.mockImplementation(async (item: VerovioPlayableItem) => {
      backend.loadedIds.push(item.id);
      loadCalls += 1;
      if (loadCalls === 1) {
        markFirstLoadStarted();
        await new Promise<void>((_resolve, reject) => { rejectFirstLoad = reject; });
      }
    });
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: async () => backend
    });

    const first = coordinator.play(request("old-owner", [playable("old")], []));
    await firstLoadStarted;
    const second = coordinator.play(request("new-owner", [playable("new")], []));
    await flushPromises();
    rejectFirstLoad(new Error("superseded load"));
    await Promise.all([first, second]);

    expect(coordinator.activeOwnerId).toBe("new-owner");
    expect(coordinator.snapshot?.itemId).toBe("new");
    await coordinator.destroy();
  });

  it("reports controlled request, seek, initialization, and backend failures", async () => {
    const coordinator = createVerovioPlaybackCoordinator({
      createBackend: async () => { throw new Error("audio denied"); }
    });
    await expect(coordinator.play(request("owner", [playable("a")], [])))
      .rejects.toMatchObject({ code: "verovio.playback_initialization_failed" });

    const backend = fakeBackend();
    const errors: LodeonClientError[] = [];
    const active = createVerovioPlaybackCoordinator({ createBackend: async () => backend });
    await expect(active.play({ ...request("", [playable("a")], []), tempoMultiplier: 2 }))
      .rejects.toMatchObject({ code: "verovio.playback_failed" });
    await active.play({
      ...request("valid", [playable("a")], []),
      onError: (error) => errors.push(error)
    });
    expect(() => active.seek("valid", 20)).toThrowError(LodeonClientError);
    backend.fail(new Error("worklet failed"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("verovio.playback_failed");
    expect(active.activeOwnerId).toBeNull();
    await active.destroy();
  });
});

function request(
  ownerId: string,
  items: VerovioPlayableItem[],
  updates: Array<VerovioPlaybackSnapshot | null>
) {
  return {
    ownerId,
    items,
    tempoMultiplier: 1,
    loop: false,
    volume: 0.8,
    onUpdate: (snapshot: VerovioPlaybackSnapshot | null) => updates.push(snapshot)
  };
}

function playable(id: string): VerovioPlayableItem {
  return {
    id,
    midi: new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
    timing: {
      elementsAtTime: vi.fn(() => ({
        notes: [`${id}-note`],
        chords: [],
        rests: [],
        measure: `${id}-measure`,
        page: 1
      })),
      pageWithElement: vi.fn(() => 2)
    }
  };
}

function fakeBackend() {
  let endedCallback: (() => void) | null = null;
  let errorCallback: ((error: unknown) => void) | null = null;
  let playing = false;
  const backend = {
    currentTimeValue: 0,
    durationValue: 10,
    loadedIds: [] as string[],
    concurrentPlayCalls: 0,
    maxConcurrentPlayCalls: 0,
    get currentTime() { return this.currentTimeValue; },
    get duration() { return this.durationValue; },
    load: vi.fn(async (item: VerovioPlayableItem) => {
      playing = false;
      backend.concurrentPlayCalls = 0;
      backend.loadedIds.push(item.id);
      backend.currentTimeValue = 0;
    }),
    play: vi.fn(() => {
      if (!playing) backend.concurrentPlayCalls += 1;
      playing = true;
      backend.maxConcurrentPlayCalls = Math.max(
        backend.maxConcurrentPlayCalls,
        backend.concurrentPlayCalls
      );
    }),
    pause: vi.fn(() => {
      playing = false;
      backend.concurrentPlayCalls = 0;
    }),
    seek: vi.fn((time: number) => { backend.currentTimeValue = time; }),
    setLoop: vi.fn(),
    setTempoMultiplier: vi.fn(),
    setVolume: vi.fn(),
    resumeAudio: vi.fn(async () => undefined),
    onEnded: vi.fn((callback: () => void) => {
      endedCallback = callback;
      return () => { endedCallback = null; };
    }),
    onError: vi.fn((callback: (error: unknown) => void) => {
      errorCallback = callback;
      return () => { errorCallback = null; };
    }),
    destroy: vi.fn(async () => { playing = false; }),
    end() {
      playing = false;
      backend.concurrentPlayCalls = 0;
      endedCallback?.();
    },
    fail(error: unknown) { errorCallback?.(error); }
  } satisfies MidiPlaybackBackend & {
    currentTimeValue: number;
    durationValue: number;
    loadedIds: string[];
    concurrentPlayCalls: number;
    maxConcurrentPlayCalls: number;
    end(): void;
    fail(error: unknown): void;
  };
  return backend;
}

function fakeIntervalClock() {
  const callbacks = new Map<number, () => void>();
  let nextId = 0;
  return {
    dependencies: {
      setInterval: (callback: () => void) => {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      },
      clearInterval: (id: number) => { callbacks.delete(id); }
    },
    get activeCount() { return callbacks.size; },
    tick() { callbacks.forEach((callback) => callback()); }
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
