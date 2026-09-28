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
  MockRuntimeAdapter,
  runtimeAdapterContractCases,
  type AdapterCapabilities,
  type CapabilitiesListener,
  type FrameListener,
  type RuntimeAdapter,
  type RuntimeAdapterContractCase,
  type RuntimeAdapterSubject,
  type SessionFacet,
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

/**
 * A conforming {@link MockRuntimeAdapter}, with one or more of its session
 * facet methods swapped for a broken one, so a test can prove a new session
 * case fails on the defect it exists for. `makeOverrides` is handed the real
 * mock so a broken method can still call through to the original behaviour.
 * The mock's own facet methods are arrow functions bound to the instance, so
 * copying them keeps working.
 */
function sessionfulSubject(
  makeOverrides: (adapter: MockRuntimeAdapter) => Partial<SessionFacet>,
): RuntimeAdapterSubject {
  const adapter = new MockRuntimeAdapter();
  const session: SessionFacet = { ...adapter.session, ...makeOverrides(adapter) };
  const wrapped: RuntimeAdapter = {
    onFrame: (listener) => adapter.onFrame(listener),
    getCapabilities: () => adapter.getCapabilities(),
    onCapabilitiesChange: (listener) => adapter.onCapabilitiesChange(listener),
    session,
  };

  return {
    adapter: wrapped,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => adapter.simulateSessionStart(),
      sessionEnd: () => adapter.simulateSessionEnd(),
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

  it("throws when getMode() ignores the live session", async () => {
    const subject = sessionfulSubject(() => ({ getMode: () => null }));

    await expect(contractCase("getMode reports the live session's mode").run(subject)).rejects.toThrow(
      /getMode\(\) must report the requested mode/,
    );
  });

  it("throws when isSupported() changes the session state", async () => {
    const subject = sessionfulSubject((adapter) => ({
      isSupported: async (mode) => {
        adapter.simulateSessionStart();
        return adapter.session.isSupported(mode);
      },
    }));

    await expect(contractCase("isSupported answers without changing the state").run(subject)).rejects.toThrow(
      /isSupported\(\) must not change the session state/,
    );
  });

  it("throws when recentre() throws", async () => {
    const subject = sessionfulSubject(() => ({
      recentre: () => {
        throw new Error("recentre exploded");
      },
    }));

    await expect(contractCase("recentre keeps the state").run(subject)).rejects.toThrow(
      /recentre exploded/,
    );
  });

  it("throws when requesting a different mode while active does not end the first session", async () => {
    const subject = sessionfulSubject((adapter) => ({
      // Ignores the requested mode entirely, so a switch never walks through
      // "ending" and getMode() never reports the new mode.
      request: (_mode, options) => adapter.session.request("immersive-vr", options),
    }));

    await expect(
      contractCase("requesting a different mode while active ends the first session").run(subject),
    ).rejects.toThrow(/must end the live session first/);
  });
});
