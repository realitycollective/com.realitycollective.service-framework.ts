/**
 * The service board: real services, registered in one profile and resolved by
 * token, each owning one visible thing. They talk to a `Display` and to the
 * framework's own contracts only, so the board holds no engine code.
 *
 * - `StatsService` counts every scheduler channel and the frames per second.
 * - `BoardService` writes the panel's text lines. It depends on `StatsService`.
 * - `SpinService` turns a cube in `render`, which the adapter drives only in a
 *   focused session: the cube freezes when the session is paused or unfocused.
 * - `PulseService` hops a cube once a second from `fixedUpdate`, a timer
 *   channel that keeps running while unfocused.
 * - `CapabilityBlocksService` shows a block per capability flag.
 * - `IoFlashService` shows a block for a moment after each byte I/O read.
 */
import {
  BaseService,
  createServiceProfile,
  createServiceToken,
  type AdapterCapabilities,
  type FocusChangeContext,
  type LifecycleContext,
  type PauseChangeContext,
  type ServiceActivationContext,
  type ServiceProfile,
  type ServiceToken,
} from "@realitycollective/service-framework";
import { BLOCK_IDS, FPS_BAR, ROW } from "./blocks.js";
import { LINES, placeBoard, quatMul, quatY, type BoardPlacement, type Display, type Pose } from "./display.js";

/** What the person sees on the panel, gathered by the entry from the adapter and the host. */
export interface LiveState {
  session: string;
  mode: string | null;
  visibility: string;
  hostState: string;
  focused: boolean | null;
  paused: boolean | null;
  capabilities: AdapterCapabilities | null;
  /** The last three telemetry records, newest first. */
  telemetry: string[];
  lastIo: { text: string; at: number; bytes: number } | null;
}

export function newLiveState(): LiveState {
  return { session: "none", mode: null, visibility: "unknown", hostState: "none", focused: null, paused: null, capabilities: null, telemetry: [], lastIo: null };
}

/** Shared by the services that need the board's place in the world. Null until the viewer's pose is known. */
export class Layout {
  placement: BoardPlacement | null = null;
}

export type Channel = "tick" | "lateTick" | "fixedTick" | "renderTick";

export class StatsService extends BaseService {
  public readonly counts: Record<Channel, number> = { tick: 0, lateTick: 0, fixedTick: 0, renderTick: 0 };
  /** The last full second: `renderTick` calls, and their mean `deltaTime` in milliseconds. */
  public lastSecond: { frames: number; avgDeltaMs: number | null } = { frames: 0, avgDeltaMs: null };
  private frames = 0;
  private deltaSum = 0;

  public constructor(context: ServiceActivationContext, private readonly state: LiveState, private readonly emitEvent: (type: string, fields: Record<string, unknown>) => void) {
    super(context);
  }

  public override update(): void {
    this.counts.tick += 1;
  }

  public override lateUpdate(): void {
    this.counts.lateTick += 1;
  }

  public override fixedUpdate(): void {
    this.counts.fixedTick += 1;
  }

  public override render(context: LifecycleContext): void {
    this.counts.renderTick += 1;
    this.frames += 1;
    this.deltaSum += context.deltaTime;
  }

  public override onFocusChange(context: FocusChangeContext): void {
    this.state.focused = context.focused;
    this.emitEvent("focus", { focused: context.focused });
  }

  public override onPauseChange(context: PauseChangeContext): void {
    this.state.paused = context.paused;
    this.emitEvent("pause", { paused: context.paused });
  }

  /** Close the current second: what it counted, ready for the next. */
  public takeSecond(): { frames: number; avgDeltaMs: number | null } {
    this.lastSecond = { frames: this.frames, avgDeltaMs: this.frames ? this.deltaSum / this.frames : null };
    this.frames = 0;
    this.deltaSum = 0;
    return this.lastSecond;
  }
}

const REFRESH_MS = 200;
const yesNo = (v: boolean | null): string => (v === null ? "unknown" : v ? "yes" : "no");
const on = (v: boolean | undefined): string => (v === undefined ? "unknown" : v ? "ON" : "off");

export class BoardService extends BaseService {
  private readonly last = new Map<string, string>();
  private nextAt = 0;

  public constructor(context: ServiceActivationContext, private readonly display: Display, private readonly state: LiveState, private readonly stats: StatsService) {
    super(context);
  }

  public override start(): void {
    this.refresh();
  }

  /** The timer channel: the panel keeps updating while the session is unfocused. */
  public override update(context: LifecycleContext): void {
    if (context.timestamp < this.nextAt) return;
    this.nextAt = context.timestamp + REFRESH_MS;
    this.refresh();
  }

  /**
   * Text is written only when a FACT changes (the session, visibility, focus,
   * pause, a capability, a telemetry record, the first file read). A native
   * host redraws the whole panel on its render thread for every text change,
   * about half a second for this panel on a Quest 3, so a line that changed
   * every frame held the app at two frames a second. The figures that move
   * all the time are shown by blocks (the frame-rate marker, the spinning and
   * hopping cubes), and the panel carries a fixed legend for them.
   */
  public refresh(): void {
    const s = this.state;
    const c = s.capabilities;
    const fact = (line: string, text: string): void => {
      this.set(line, text);
    };
    fact(LINES.session, `session: ${s.session}${s.mode ? ` (${s.mode})` : ""}, host ${s.hostState}`);
    fact(LINES.visibility, `visibility: ${s.visibility}`);
    fact(LINES.focus, `focused: ${yesNo(s.focused)}`);
    fact(LINES.pause, `paused: ${yesNo(s.paused)}`);
    fact(LINES.immersive, `immersive: ${on(c?.immersive)}  (blue sphere)`);
    fact(LINES.handTracking, `handTracking: ${on(c?.handTracking)}  (green cylinder: put the controllers down)`);
    fact(LINES.planeDetection, `planeDetection: ${on(c?.planeDetection)}  (purple slab)`);
    fact(LINES.passthrough, `passthrough: ${on(c?.passthrough)}${c?.environmentBlendMode ? `, ${c.environmentBlendMode}` : ""}  (pink ring)`);
    LINES.telemetry.forEach((line, i) => fact(line, s.telemetry[i] ?? "-"));
    fact(LINES.io, s.lastIo ? `file read ok, ${s.lastIo.bytes} bytes: ${s.lastIo.text}` : "no file read yet (the yellow gem flashes on each read)");
  }

  private set(line: string, text: string): boolean {
    if (this.last.get(line) === text) return false;
    this.last.set(line, text);
    this.display.setText(line, text);
    return true;
  }
}

/** The frame-rate marker: slides along its bar to the last full second's `renderTick` count. Driven from a timer channel, so it falls to the left end when frames stop. */
export class FrameRateService extends BaseService {
  private lastFrames = -1;

  public constructor(context: ServiceActivationContext, private readonly display: Display, private readonly layout: Layout, private readonly stats: StatsService) {
    super(context);
  }

  public override update(): void {
    this.draw(false);
  }

  /** Place the bar and the marker. `force` after the board gets its place. */
  public draw(force: boolean): void {
    const placement = this.layout.placement;
    if (!placement) return;
    const frames = this.stats.lastSecond.frames;
    if (!force && frames === this.lastFrames) return;
    this.lastFrames = frames;
    const { panel, right } = placement;
    const y = panel.position[1] - FPS_BAR.drop;
    if (force) this.display.setPose(BLOCK_IDS.fpsTrack, { position: [panel.position[0], y, panel.position[2]], quaternion: panel.quaternion });
    const across = (Math.min(1, Math.max(0, frames / FPS_BAR.fullScale)) - 0.5) * FPS_BAR.length;
    this.display.setPose(BLOCK_IDS.fps, { position: [panel.position[0] + right[0] * across, y, panel.position[2] + right[1] * across], quaternion: panel.quaternion });
  }
}

/** Turns in `render`: it moves only while `renderTick` fires. */
export class SpinService extends BaseService {
  private angle = 0;

  public constructor(context: ServiceActivationContext, private readonly display: Display, private readonly layout: Layout) {
    super(context);
  }

  public override render(context: LifecycleContext): void {
    this.angle = (this.angle + (context.deltaTime / 1000) * 2) % (Math.PI * 2);
    this.draw();
  }

  public get currentAngle(): number {
    return this.angle;
  }

  public draw(): void {
    const base = this.layout.placement?.block(BLOCK_IDS.spin);
    if (!base) return;
    this.display.setPose(BLOCK_IDS.spin, { position: base.position, quaternion: quatMul(base.quaternion, quatY(this.angle)) });
  }
}

/** Hops once a second from `fixedUpdate`: it keeps going while the session is unfocused. */
export class PulseService extends BaseService {
  private lastKey = "";

  public constructor(context: ServiceActivationContext, private readonly display: Display, private readonly layout: Layout) {
    super(context);
  }

  public override fixedUpdate(context: LifecycleContext): void {
    const base = this.layout.placement?.block(BLOCK_IDS.pulse);
    if (!base) return;
    const phase = (context.timestamp % 1000) / 1000;
    const hop = phase < 0.3 ? Math.sin((Math.PI * phase) / 0.3) * 0.12 : 0;
    const key = hop.toFixed(4);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.display.setPose(BLOCK_IDS.pulse, { position: [base.position[0], base.position[1] + hop, base.position[2]], quaternion: base.quaternion });
  }

  /** Put the block at rest once the board has a place. */
  public settle(): void {
    this.lastKey = "";
  }
}

/** One block per capability flag: shown while the flag is true. */
export class CapabilityBlocksService extends BaseService {
  public constructor(context: ServiceActivationContext, private readonly display: Display, private readonly state: LiveState) {
    super(context);
  }

  public override start(): void {
    this.apply();
  }

  /** The tick channel keeps the blocks honest even if a capability change was missed. */
  public override update(): void {
    this.apply();
  }

  public apply(): void {
    const c = this.state.capabilities;
    this.display.setShown(BLOCK_IDS.immersive, c?.immersive === true);
    this.display.setShown(BLOCK_IDS.handTracking, c?.handTracking === true);
    this.display.setShown(BLOCK_IDS.planeDetection, c?.planeDetection === true);
    this.display.setShown(BLOCK_IDS.passthrough, c?.passthrough === true);
  }
}

const FLASH_MS = 700;

/** Shown for a moment after each byte I/O read completes. */
export class IoFlashService extends BaseService {
  private until = 0;
  private shown = false;

  public constructor(context: ServiceActivationContext, private readonly display: Display) {
    super(context);
  }

  public override start(): void {
    this.display.setShown(BLOCK_IDS.io, false);
  }

  public flash(now: number): void {
    this.until = now + FLASH_MS;
    this.set(true);
  }

  public override update(context: LifecycleContext): void {
    if (this.shown && context.timestamp >= this.until) this.set(false);
  }

  private set(shown: boolean): void {
    if (shown === this.shown && !shown) return;
    this.shown = shown;
    this.display.setShown(BLOCK_IDS.io, shown);
  }
}

export const STATS: ServiceToken<StatsService> = createServiceToken<StatsService>("board.stats");
export const BOARD: ServiceToken<BoardService> = createServiceToken<BoardService>("board.panel");
export const SPIN: ServiceToken<SpinService> = createServiceToken<SpinService>("board.spin");
export const PULSE: ServiceToken<PulseService> = createServiceToken<PulseService>("board.pulse");
export const CAPABILITIES: ServiceToken<CapabilityBlocksService> = createServiceToken<CapabilityBlocksService>("board.capabilities");
export const IO_FLASH: ServiceToken<IoFlashService> = createServiceToken<IoFlashService>("board.io-flash");
export const FRAME_RATE: ServiceToken<FrameRateService> = createServiceToken<FrameRateService>("board.frame-rate");

export interface BoardOptions {
  readonly display: Display;
  readonly state: LiveState;
  readonly layout: Layout;
  readonly emitEvent: (type: string, fields: Record<string, unknown>) => void;
}

/** The board's profile: seven services, two of which depend on the stats service (the panel and the frame-rate marker). */
export function createBoardProfile(options: BoardOptions): ServiceProfile {
  const { display, state, layout, emitEvent } = options;
  const ctx = (c: unknown): ServiceActivationContext => c as ServiceActivationContext;
  return createServiceProfile("service-board", [
    { token: STATS, useFactory: (c) => new StatsService(ctx(c), state, emitEvent) },
    { token: BOARD, dependencies: [STATS], useFactory: (c, stats) => new BoardService(ctx(c), display, state, stats as StatsService) },
    { token: SPIN, useFactory: (c) => new SpinService(ctx(c), display, layout) },
    { token: PULSE, useFactory: (c) => new PulseService(ctx(c), display, layout) },
    { token: CAPABILITIES, useFactory: (c) => new CapabilityBlocksService(ctx(c), display, state) },
    { token: IO_FLASH, useFactory: (c) => new IoFlashService(ctx(c), display) },
    { token: FRAME_RATE, dependencies: [STATS], useFactory: (c, stats) => new FrameRateService(ctx(c), display, layout, stats as StatsService) },
  ]);
}

/** Place the board once: work out its poses from the viewer, tell the display and put every block at rest. */
export function placeAt(layout: Layout, display: Display, head: Pose): BoardPlacement {
  const placement = placeBoard(head, ROW);
  layout.placement = placement;
  display.placePanel(placement.panel);
  for (const id of ROW) display.setPose(id, placement.block(id));
  return placement;
}
