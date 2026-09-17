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

  it("skips clearInterval when timer handles are falsy after start", () => {
    const clearCalls: unknown[] = [];
    const scheduler = new TimerScheduler({
      setIntervalFn: (() => 0) as unknown as typeof setInterval,
      clearIntervalFn: ((handle: unknown) => { clearCalls.push(handle); }) as unknown as typeof clearInterval
    });
    scheduler.start();
    scheduler.stop();
    scheduler.dispose();
    expect(clearCalls).toHaveLength(0);
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

describe("scheduler handler lists", () => {
  const context = { timestamp: 1, deltaTime: 1, frame: 1, source: "tick" };

  it("emits to the same handlers on consecutive frames without a change in between", () => {
    const scheduler = new ManualScheduler();
    let calls = 0;
    scheduler.subscribe("tick", () => {
      calls += 1;
    });

    scheduler.emit("tick", context);
    scheduler.emit("tick", context);

    expect(calls).toBe(2);
  });

  it("keeps the list an emit started with when handlers change mid-emit, and rebuilds it for the next one", () => {
    const scheduler = new ManualScheduler();
    const calls: string[] = [];
    let unsubscribeSecond = (): void => undefined;
    scheduler.subscribe("tick", () => {
      calls.push("first");
      // Added during the emit: waits for the next one, exactly as before.
      scheduler.subscribe("tick", () => {
        calls.push("late");
      });
      // Removed during the emit: still called in this one, exactly as before.
      unsubscribeSecond();
    });
    unsubscribeSecond = scheduler.subscribe("tick", () => {
      calls.push("second");
    });

    scheduler.emit("tick", context);
    expect(calls).toEqual(["first", "second"]);

    calls.length = 0;
    scheduler.emit("tick", context);
    expect(calls).toEqual(["first", "late"]);
  });

  it("forgets the cached lists on dispose so a later subscription is honoured", () => {
    const scheduler = new ManualScheduler();
    const calls: string[] = [];
    scheduler.subscribe("tick", () => {
      calls.push("before");
    });
    scheduler.emit("tick", context);
    scheduler.dispose();
    scheduler.subscribe("tick", () => {
      calls.push("after");
    });
    scheduler.emit("tick", context);

    expect(calls).toEqual(["before", "after"]);
  });
});
