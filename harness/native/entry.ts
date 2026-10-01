/**
 * The Service Framework's native test harness: one bundle a native host runs,
 * built by the WebXR-to-native conversion pipeline (`rc check`, `rc build`)
 * from this repository's own source, and run under Node against the
 * repository's reference fake host when no native host is installed.
 *
 * Modes (`debug.rc.mode` on a device, `__rcShell.mode` under Node):
 *
 *   kits   run the shared suites (`runtimeAdapterContractCases`,
 *          `renderTickContractCases`, `hostIOContractCases`) over
 *          `NativeRuntimeAdapter` and `createNativeHostIO`, plus a boot with no
 *          global `AbortController`, against the shell's test host
 *          (`__rcShell.testHost`), or the reference fake under Node; one JSON
 *          line per suite and a `done` line with `pass`. The default under Node.
 *   play   the service board over the live `__rcHost`: a `ServiceManager` over a
 *          `NativeRuntimeAdapter` and six real services (see `src/board.ts`),
 *          each owning one visible thing. A text panel shows the lifecycle as it
 *          changes, a row of blocks shows which channels fire and which
 *          capabilities are on. Every change is also logged as a JSON line, a
 *          `status` line once a second, and a packed file is read through
 *          `HostIO` every 10 seconds. The default on a device.
 *
 * The services draw through a small `Display` interface, implemented over the
 * host's `ui`, `scenes` and `interactions` slices (`src/host-display.ts`). The
 * bundle contains no engine and no browser.
 */
import { ServiceManager, TimerScheduler, type TelemetryLevel } from "@realitycollective/service-framework";
import { NativeRuntimeAdapter, createNativeHostIO, type NativeHost } from "@realitycollective/service-framework-native";
import { emit, hasShell, readMode, round, virtualClock } from "./src/prelude.js";
import { runServiceFrameworkKits, shellTestHost } from "./src/kits.js";
import { referenceTestHost } from "./src/fakes.js";
import { BOARD, CAPABILITIES, FRAME_RATE, IO_FLASH, Layout, PULSE, STATS, createBoardProfile, newLiveState, placeAt } from "./src/board.js";
import { HostDisplay, type DisplayHosts } from "./src/host-display.js";
import { lightStage } from "./src/stage-light.js";
import type { Pose } from "./src/display.js";

type Mode = "kits" | "play";
const mode = readMode(hasShell() ? "play" : "kits") as Mode;
const g = globalThis as Record<string, unknown>;

emit("harness", { family: "service-framework", mode, shell: hasShell() });

let done: { pass: boolean } | null = null;
let displayNow = 0;
let lastDisplayMs: number | null = null;

/** The frame entry the shell calls once per frame with the predicted display time in milliseconds. */
function installTick(tick: (displayMs: number, dtMs: number) => void): void {
  g.__rcTick = (displayMs: number): void => {
    const dtMs = lastDisplayMs === null ? 0 : Math.min(100, Math.max(0, displayMs - lastDisplayMs));
    lastDisplayMs = displayMs;
    displayNow = displayMs;
    virtualClock.advance(dtMs);
    tick(displayMs, dtMs);
  };
  g.__rcRenderDone = (): boolean => done !== null;
  g.__rcStatus = (): string => JSON.stringify({ mode, displayMs: round(displayNow, 1), done: done?.pass ?? null });
}

// --- kits ------------------------------------------------------------------------------------
async function runKits(): Promise<void> {
  const shellHost = shellTestHost();
  emit("kits-host", { source: shellHost ? "shell test host (__rcShell.testHost)" : "reference fake" });
  const result = await runServiceFrameworkKits(shellHost ?? referenceTestHost());
  done = { pass: result.pass };
  emit("done", { pass: result.pass, suites: result.suites.length, failures: result.suites.flatMap((s) => s.failures.map((f) => `${s.name}: ${f.name}: ${f.error}`)) });
}

// --- play ------------------------------------------------------------------------------------
const STATUS_EVERY_MS = 1000;
const IO_EVERY_MS = 10_000;
const IO_PATH = "harness.txt";
/** How long to wait for the viewer's pose before placing the board at a default standing pose. */
const PLACE_AFTER_FOCUS_MS = 1500;
const DEFAULT_HEAD: Pose = { position: [0, 1.5, 0], quaternion: [0, 0, 0, 1] };

/** The slices the board draws through, as the host installed them. */
type RootWithSlices = NativeHost & DisplayHosts & { input?: { getHeadPose?(): Pose } };

function play(host: NativeHost): void {
  const root = host as RootWithSlices;
  const state = newLiveState();
  const layout = new Layout();
  const at = (): number => round(displayNow, 1);
  const event = (type: string, fields: Record<string, unknown>): void => emit("event", { at: at(), type, ...fields });

  // The board draws through the host's own slices. A missing slice is logged, and the rest keeps working.
  const display = new HostDisplay({ ui: root.ui, scenes: root.scenes, interactions: root.interactions }, event);

  const scheduler = new TimerScheduler({
    // The timer channels run on the virtual clock the frame loop advances, so they keep going while the session is unfocused.
    now: () => virtualClock.now(),
    setIntervalFn: g.setInterval as typeof setInterval,
    clearIntervalFn: g.clearInterval as typeof clearInterval,
    tickIntervalMs: 50,
    fixedIntervalMs: 33,
  });
  const manager = new ServiceManager({
    scheduler,
    log: (name: string, payload?: Record<string, unknown>, level?: TelemetryLevel) => {
      event("telemetry", { name, level: level ?? "info", payload: payload ?? null });
      state.telemetry.unshift(`${name} ${payload ? JSON.stringify(payload) : ""}`.trim().slice(0, 90));
      state.telemetry.length = Math.min(state.telemetry.length, 3);
    },
  });
  manager.initializeProfile(createBoardProfile({ display, state, layout, emitEvent: event }));

  const adapter = new NativeRuntimeAdapter({ host, scheduler, manager });
  const session = adapter.session!;
  state.session = session.getState();
  state.hostState = host.getSessionInfo().state;
  state.capabilities = adapter.getCapabilities();
  session.onStateChange((next) => {
    state.session = next;
    state.mode = session.getMode();
    event("session", { state: next, mode: state.mode });
  });
  session.onVisibilityChange((next) => {
    state.visibility = next;
    event("visibility", { visibility: next });
  });
  adapter.onCapabilitiesChange((next) => {
    state.capabilities = next;
    event("capabilities", { ...next });
  });

  display.open();
  event("stage", lightStage(g.__rcHost));
  scheduler.start();
  const stats = manager.resolve(STATS);
  const board = manager.resolve(BOARD);
  const capabilities = manager.resolve(CAPABILITIES);
  const pulse = manager.resolve(PULSE);
  const ioFlash = manager.resolve(IO_FLASH);
  const frameRate = manager.resolve(FRAME_RATE);

  const io = host.io ? createNativeHostIO(host) : null;
  const decoder = new (g.TextDecoder as new () => { decode(input?: ArrayBuffer | ArrayBufferView): string })();
  let reads = 0;
  const readPacked = (): void => {
    if (!io) {
      emit("io", { at: at(), ok: false, error: "the host has no io slice" });
      return;
    }
    reads += 1;
    const n = reads;
    io.fetchBytes(IO_PATH).then(
      (bytes) => {
        const text = decoder.decode(bytes).trim();
        state.lastIo = { text: text.length > 60 ? `${text.slice(0, 57)}...` : text, at: displayNow, bytes: bytes.length };
        ioFlash.flash(virtualClock.now());
        emit("io", { at: at(), read: n, ok: true, path: IO_PATH, bytes: bytes.length, text });
      },
      (error: unknown) => emit("io", { at: at(), read: n, ok: false, path: IO_PATH, error: String((error as Error)?.message ?? error) }),
    );
  };

  /**
   * Place the board in front of the viewer a moment after the session gains focus, which on a
   * headset is when it is put on, and again each time focus comes back: a board placed while the
   * headset lay on a desk would sit wherever the desk pointed it. With no head pose from the host
   * it goes to a default standing pose.
   */
  let placeDue: number | null = null;
  let wasFocused = false;
  const tryPlace = (displayMs: number): void => {
    const focused = state.hostState === "focused";
    if (focused && !wasFocused) placeDue = displayMs + PLACE_AFTER_FOCUS_MS;
    wasFocused = focused;
    if (placeDue === null || displayMs < placeDue) return;
    placeDue = null;
    const head = root.input?.getHeadPose?.();
    placeAt(layout, display, head ?? DEFAULT_HEAD);
    pulse.settle();
    frameRate.draw(true);
    event("placed", { head: head ? "viewer" : "default standing pose (the host gave no head pose)", panel: layout.placement!.panel.position.map((n) => round(n)) });
  };

  let nextStatus = STATUS_EVERY_MS;
  let nextIo = IO_EVERY_MS;
  let ticks = 0;
  installTick((displayMs) => {
    ticks += 1;
    state.hostState = host.getSessionInfo().state;
    tryPlace(displayMs);
    if (displayMs >= nextStatus) {
      nextStatus = displayMs + STATUS_EVERY_MS;
      const c = state.capabilities;
      const second = stats.takeSecond();
      board.refresh();
      capabilities.apply();
      emit("status", {
        at: round(displayMs, 1),
        frames: second.frames,
        ticks,
        avgDeltaMs: second.avgDeltaMs === null ? null : round(second.avgDeltaMs, 2),
        session: state.session,
        hostState: state.hostState,
        visibility: state.visibility,
        capabilities: c ? { immersive: c.immersive, handTracking: c.handTracking, planeDetection: c.planeDetection, passthrough: c.passthrough, blend: c.environmentBlendMode } : null,
        channels: { ...stats.counts },
      });
      ticks = 0;
    }
    if (displayMs >= nextIo) {
      nextIo = displayMs + IO_EVERY_MS;
      readPacked();
    }
  });
  emit("play", { session: state.session, hostState: state.hostState, hasIo: io !== null, slices: { ui: !!root.ui, scenes: !!root.scenes, interactions: !!root.interactions?.setWorldPose }, capabilities: state.capabilities });
  readPacked();
}

// --- boot ------------------------------------------------------------------------------------
if (mode === "kits") {
  installTick(() => undefined);
  void runKits().catch((error) => {
    done = { pass: false };
    emit("done", { pass: false, error: String((error as Error)?.stack ?? error) });
  });
} else if (!hasShell()) {
  emit("done", { pass: false, error: `mode "${mode}" needs a native host (__rcHost); under Node use --mode kits` });
  installTick(() => undefined);
  done = { pass: false };
} else {
  play(g.__rcHost as NativeHost);
}

