/**
 * The shared conformance suite for bindings that emit the scheduler's
 * `renderTick` channel.
 *
 * A service subscribes to `renderTick` on the core scheduler and never asks
 * which platform drives it. That only holds if every binding - the three.js,
 * Babylon.js, IWSDK and native ones, and the core's `TimerScheduler` - emits
 * the same thing: one tick per frame, counted from 1, with `timestamp` and
 * `deltaTime` in milliseconds. The checks ship as data, like
 * `runtimeAdapterContractCases()`, so a binding written elsewhere proves the
 * same promise.
 *
 * ```ts
 * for (const contractCase of renderTickContractCases()) {
 *   it(contractCase.name, () => contractCase.run(makeSubject()));
 * }
 * ```
 */
import type { LifecycleContext } from "./contracts.js";
import type { IScheduler } from "./contracts.js";

/** How a case moves the binding's clock. */
export interface RenderTickDriver {
  /**
   * Run one frame of the binding's loop with its platform clock reading
   * `timestampMs`. The driver translates that into whatever the platform
   * hands the binding: a timestamp, a clock read, or seconds.
   */
  frame(timestampMs: number): void;
}

/** A binding wired to a scheduler, plus the means to drive its loop. */
export interface RenderTickSubject {
  readonly scheduler: IScheduler;
  readonly drive: RenderTickDriver;
}

/** One check a `renderTick` binding must pass. */
export interface RenderTickContractCase {
  name: string;
  run(subject: RenderTickSubject): void;
}

/** One frame length at 72 Hz, in milliseconds. */
const FRAME_MS = 1000 / 72;
/** How far a converted value may drift through seconds and back. */
const TOLERANCE_MS = 0.01;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Drive `count` frames one `FRAME_MS` apart from `startMs`, and collect the ticks. */
function collect({ scheduler, drive }: RenderTickSubject, count: number, startMs = 5000): LifecycleContext[] {
  const ticks: LifecycleContext[] = [];
  const unsubscribe = scheduler.subscribe("renderTick", (context) => ticks.push(context));
  for (let index = 0; index < count; index += 1) {
    drive.frame(startMs + index * FRAME_MS);
  }
  unsubscribe();
  return ticks;
}

const CASES: readonly RenderTickContractCase[] = [
  {
    name: "emits exactly one renderTick per frame",
    run(subject) {
      const ticks = collect(subject, 3);
      assert(ticks.length === 3, `three frames must emit three renderTicks, got ${String(ticks.length)}`);
    }
  },
  {
    name: "counts frames from 1, one at a time",
    run(subject) {
      const frames = collect(subject, 3).map((tick) => tick.frame);
      assert(
        frames.length === 3 && frames[0] === 1 && frames[1] === 2 && frames[2] === 3,
        `frame must count 1, 2, 3 across three frames, got [${frames.join(", ")}]`
      );
    }
  },
  {
    name: "names its source the same way on every tick",
    run(subject) {
      const sources = collect(subject, 2).map((tick) => tick.source);
      assert(
        typeof sources[0] === "string" && sources[0].length > 0,
        `source must be a non-empty string, got ${JSON.stringify(sources[0])}`
      );
      assert(sources[1] === sources[0], `source must not change between ticks, got ${JSON.stringify(sources)}`);
    }
  },
  {
    name: "reports timestamp as the platform clock in milliseconds",
    run(subject) {
      const [tick] = collect(subject, 1, 5000);
      assert(tick !== undefined, "a frame must emit a renderTick");
      assert(
        Math.abs(tick.timestamp - 5000) <= TOLERANCE_MS,
        `timestamp must be the platform clock in milliseconds (5000), got ${String(tick.timestamp)}`
      );
    }
  },
  {
    name: "reports deltaTime in milliseconds between frames",
    run(subject) {
      const ticks = collect(subject, 3);
      const first = ticks[0];
      assert(
        first !== undefined && Number.isFinite(first.deltaTime) && first.deltaTime >= 0,
        `the first frame's deltaTime must be a finite, non-negative number, got ${String(first?.deltaTime)}`
      );
      for (const tick of ticks.slice(1)) {
        assert(
          Math.abs(tick.deltaTime - FRAME_MS) <= TOLERANCE_MS,
          `deltaTime must be the milliseconds since the previous frame (${FRAME_MS.toFixed(3)}), got ${String(tick.deltaTime)}`
        );
      }
    }
  }
];

/** The shared `renderTick` conformance suite. Build a fresh subject per case. */
export function renderTickContractCases(): readonly RenderTickContractCase[] {
  return CASES;
}
