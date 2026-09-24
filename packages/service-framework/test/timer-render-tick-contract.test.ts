/**
 * The core's `TimerScheduler` drives services when no engine binding does, so
 * it passes the same `renderTick` suite every binding passes. The driver
 * stands in for the browser: each frame it fires the timer's interval
 * callbacks, as a browser would between frames, then hands the pending
 * animation-frame callback the platform clock. The other channels firing is
 * what shows a render frame count that is shared with them.
 */
import { TimerScheduler, type RenderTickSubject } from "../src/index.js";
import { renderTickContract } from "./helpers/render-tick-contract.js";

function timerSubject(): RenderTickSubject {
  let pending: FrameRequestCallback | undefined;
  const intervals: Array<() => void> = [];
  const scheduler = new TimerScheduler({
    setIntervalFn: ((callback: () => void) => intervals.push(callback)) as unknown as typeof setInterval,
    clearIntervalFn: (() => undefined) as unknown as typeof clearInterval,
    requestAnimationFrameFn: (callback) => {
      pending = callback;
      return 1;
    },
    cancelAnimationFrameFn: () => undefined
  });
  scheduler.start();
  return {
    scheduler,
    drive: {
      frame(timestampMs) {
        for (const interval of intervals) interval();
        const callback = pending;
        pending = undefined;
        callback?.(timestampMs);
      }
    }
  };
}

renderTickContract("TimerScheduler", timerSubject);
