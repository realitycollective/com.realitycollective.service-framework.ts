/**
 * The shipped conformance suite is itself production code, so it is tested like
 * production code: it must pass a conforming adapter, skip its session cases on
 * a host that owns no sessions, and throw a plain `Error` on an adapter that
 * breaks the contract.
 *
 * The suite running against the four real adapters lives in each package's
 * `runtime-adapter-contract.test.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CAPABILITIES,
  runtimeAdapterContractCases,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameListener,
  type RuntimeAdapter,
  type RuntimeAdapterContractCase,
  type RuntimeAdapterSubject,
} from "../src/index.js";

/**
 * An adapter with no session facet - the shape a host that owns no sessions
 * reports, such as a plain render loop. The session cases must pass it without
 * running.
 */
function sessionlessSubject(): RuntimeAdapterSubject {
  const frameListeners = new Set<FrameListener>();
  const capabilityListeners = new Set<CapabilitiesListener>();
  let capabilities: AdapterCapabilities = DEFAULT_CAPABILITIES;

  const adapter: RuntimeAdapter = {
    onFrame(listener) {
      frameListeners.add(listener);
      return () => {
        frameListeners.delete(listener);
      };
    },
    getCapabilities: () => capabilities,
    onCapabilitiesChange(listener) {
      capabilityListeners.add(listener);
      return () => {
        capabilityListeners.delete(listener);
      };
    },
  };

  return {
    adapter,
    drive: {
      frame(timestamp, delta) {
        frameListeners.forEach((listener) => listener({ timestamp, delta }));
      },
      capabilities(partial) {
        capabilities = { ...capabilities, ...partial };
        capabilityListeners.forEach((listener) => listener(capabilities));
      },
    },
  };
}

function contractCase(fragment: string): RuntimeAdapterContractCase {
  const found = runtimeAdapterContractCases().find((entry) => entry.name.includes(fragment));

  if (!found) {
    throw new Error(`no contract case matching "${fragment}"`);
  }

  return found;
}

describe("runtimeAdapterContractCases", () => {
  it("names every case and gives each a runnable function", () => {
    const cases = runtimeAdapterContractCases();

    expect(cases.length).toBeGreaterThan(0);

    for (const entry of cases) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.run).toBe("function");
    }
  });

  it("passes an adapter that owns no sessions, skipping the session cases", async () => {
    for (const entry of runtimeAdapterContractCases()) {
      await entry.run(sessionlessSubject());
    }
  });

  it("throws a plain Error when the adapter breaks the contract", () => {
    const subject = sessionlessSubject();
    const broken: RuntimeAdapterSubject = {
      adapter: subject.adapter,
      drive: { ...subject.drive, frame: () => undefined },
    };

    expect(() => contractCase("delivers each frame").run(broken)).toThrow(
      /every subscriber must get the frame/,
    );
  });
});
