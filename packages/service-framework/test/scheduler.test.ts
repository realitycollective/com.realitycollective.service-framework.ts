import { ManualScheduler, TimerScheduler } from "../src/index.js";

describe("schedulers", () => {
  it("subscribes, unsubscribes and disposes manual scheduler listeners", () => {
    const scheduler = new ManualScheduler();
    const events: string[] = [];
    const unsubscribe = scheduler.subscribe("tick", (context) => {
      events.push(`${context.source}:${context.frame}`);
    });

    scheduler.emit("tick", {
      timestamp: 1,
      deltaTime: 1,
      frame: 1,
      source: "tick"
    });
    unsubscribe();
    scheduler.emit("tick", {
      timestamp: 2,
      deltaTime: 1,
      frame: 2,
      source: "ignored"
    });
    scheduler.dispose();
    scheduler.emit("tick", {
      timestamp: 3,
      deltaTime: 1,
      frame: 3,
      source: "after-dispose"
    });

    expect(events).toEqual(["tick:1"]);
  });

  it("emits timer-based channels, supports raf bridges and stops idempotently", () => {
    vi.useFakeTimers();

    const events: string[] = [];
    const rafCallbacks: Array<(timestamp: number) => void> = [];
    const cancelAnimationFrameFn = vi.fn();
    const scheduler = new TimerScheduler({
      tickIntervalMs: 10,
      fixedIntervalMs: 20,
      now: () => Date.now(),
      requestAnimationFrameFn: (callback) => {
        rafCallbacks.push(callback);
        return 42;
      },
      cancelAnimationFrameFn
    });

    scheduler.subscribe("startup", () => {
      events.push("startup");
    });
    scheduler.subscribe("tick", (context) => {
      events.push(`tick:${context.frame}`);
    });
    scheduler.subscribe("lateTick", (context) => {
      events.push(`late:${context.frame}`);
    });
    scheduler.subscribe("fixedTick", (context) => {
      events.push(`fixed:${context.frame}`);
    });
    scheduler.subscribe("renderTick", (context) => {
      events.push(`render:${context.frame}:${context.deltaTime}`);
    });

    scheduler.stop();
    scheduler.start();
    scheduler.start();

    vi.advanceTimersByTime(20);
    rafCallbacks[0]?.(33);
    rafCallbacks[1]?.(49);

    scheduler.stop();
    rafCallbacks[0]?.(49);
    scheduler.stop();
    scheduler.dispose();

    expect(events).toContain("startup");
    expect(events.some((event) => event.startsWith("tick:"))).toBe(true);
    expect(events.some((event) => event.startsWith("late:"))).toBe(true);
    expect(events.some((event) => event.startsWith("fixed:"))).toBe(true);
    expect(events.some((event) => event.startsWith("render:"))).toBe(true);
    expect(cancelAnimationFrameFn).toHaveBeenCalledWith(42);

    vi.useRealTimers();
  });

  it("supports default timer scheduler options", () => {
    vi.useFakeTimers();

    const scheduler = new TimerScheduler();
    const events: string[] = [];
    scheduler.subscribe("tick", (context) => {
      events.push(`${context.source}:${context.deltaTime}`);
    });

    scheduler.start();
    vi.advanceTimersByTime(16);
    scheduler.stop();
    scheduler.dispose();

    expect(events[0]?.startsWith("tick:")).toBe(true);

    vi.useRealTimers();
  });

  it("uses configured interval fallbacks when the first timestamps are zero", () => {
    vi.useFakeTimers();

    const events: string[] = [];
    const rafCallbacks: Array<(timestamp: number) => void> = [];
    const scheduler = new TimerScheduler({
      tickIntervalMs: 10,
      fixedIntervalMs: 20,
      now: () => 0,
      requestAnimationFrameFn: (callback) => {
        rafCallbacks.push(callback);
        return 1;
      },
      cancelAnimationFrameFn: () => {}
    });

    scheduler.subscribe("tick", (context) => {
      events.push(`tick:${context.deltaTime}`);
    });
    scheduler.subscribe("fixedTick", (context) => {
      events.push(`fixed:${context.deltaTime}`);
    });
    scheduler.subscribe("renderTick", (context) => {
      events.push(`render:${context.deltaTime}`);
    });

    scheduler.start();
    vi.advanceTimersByTime(20);
    rafCallbacks[0]?.(0);
    scheduler.dispose();

    expect(events).toContain("tick:10");
    expect(events).toContain("fixed:20");
    expect(events).toContain("render:10");

    vi.useRealTimers();
  });
});
