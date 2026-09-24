/**
 * The shipped `renderTick` suite: a conforming binding passes it, and every
 * case fails for a binding built to break the promise it checks.
 */
import { ManualScheduler, renderTickContractCases, type LifecycleContext, type RenderTickSubject } from "../src/index.js";

interface FakeBinding {
  /** Rewrite the tick a conforming binding would emit, or drop it with null. */
  readonly tamper?: (tick: LifecycleContext, index: number) => LifecycleContext | null;
  /** Emit each tick twice. */
  readonly double?: boolean;
}

function binding(fake: FakeBinding = {}): RenderTickSubject {
  const scheduler = new ManualScheduler();
  let frame = 0;
  let last: number | undefined;
  return {
    scheduler,
    drive: {
      frame(timestampMs) {
        frame += 1;
        const honest: LifecycleContext = {
          timestamp: timestampMs,
          deltaTime: last === undefined ? 16 : timestampMs - last,
          frame,
          source: "fake"
        };
        last = timestampMs;
        const tick = fake.tamper ? fake.tamper(honest, frame - 1) : honest;
        if (tick) scheduler.emit("renderTick", tick);
        if (tick && fake.double) scheduler.emit("renderTick", tick);
      }
    }
  };
}

function runCase(name: string, subject: RenderTickSubject): void {
  const contractCase = renderTickContractCases().find((entry) => entry.name === name);
  if (!contractCase) throw new Error(`no contract case named "${name}"`);
  contractCase.run(subject);
}

describe("renderTickContractCases", () => {
  it("passes a conforming binding", () => {
    for (const contractCase of renderTickContractCases()) {
      expect(() => contractCase.run(binding())).not.toThrow();
    }
  });
});

describe("renderTickContractCases catches a broken binding", () => {
  it("rejects a binding that emits twice per frame", () => {
    expect(() => runCase("emits exactly one renderTick per frame", binding({ double: true }))).toThrow(
      /three renderTicks, got 6/
    );
  });

  it("rejects a binding that skips a frame number", () => {
    expect(() =>
      runCase("counts frames from 1, one at a time", binding({ tamper: (tick) => ({ ...tick, frame: tick.frame * 2 }) }))
    ).toThrow(/count 1, 2, 3/);
  });

  it("rejects an empty source and a source that changes", () => {
    expect(() =>
      runCase("names its source the same way on every tick", binding({ tamper: (tick) => ({ ...tick, source: "" }) }))
    ).toThrow(/non-empty string/);
    expect(() =>
      runCase(
        "names its source the same way on every tick",
        binding({ tamper: (tick, index) => ({ ...tick, source: `s${String(index)}` }) })
      )
    ).toThrow(/must not change/);
  });

  it("rejects a timestamp in seconds, and a frame with no tick", () => {
    expect(() =>
      runCase(
        "reports timestamp as the platform clock in milliseconds",
        binding({ tamper: (tick) => ({ ...tick, timestamp: tick.timestamp / 1000 }) })
      )
    ).toThrow(/milliseconds \(5000\), got 5$/);
    expect(() =>
      runCase("reports timestamp as the platform clock in milliseconds", binding({ tamper: () => null }))
    ).toThrow(/must emit a renderTick/);
  });

  it("rejects a delta in seconds, and a first delta that is not a number", () => {
    expect(() =>
      runCase(
        "reports deltaTime in milliseconds between frames",
        binding({ tamper: (tick) => ({ ...tick, deltaTime: tick.deltaTime / 1000 }) })
      )
    ).toThrow(/milliseconds since the previous frame/);
    expect(() =>
      runCase(
        "reports deltaTime in milliseconds between frames",
        binding({ tamper: (tick, index) => (index === 0 ? { ...tick, deltaTime: Number.NaN } : tick) })
      )
    ).toThrow(/first frame's deltaTime/);
  });

  it("fails loudly when asked for a case that does not exist", () => {
    expect(() => runCase("no such case", binding())).toThrow(/no contract case named/);
  });
});
