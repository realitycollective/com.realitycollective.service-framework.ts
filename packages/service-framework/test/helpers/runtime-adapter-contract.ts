/**
 * Shared conformance suite for {@link RuntimeAdapter} implementations.
 *
 * Every adapter - the headless mock, the IWSDK adapter, and whatever comes next
 * - must behave the same way at this seam, or a service that works headless
 * will not work on a headset. Rather than each package writing its own version
 * of the same assertions, each one calls this factory with a subject and a way
 * to drive it, and gets the whole suite.
 *
 * This is an in-repo test helper. It is not part of any package's published
 * entry point.
 */
import { describe, expect, it } from "vitest";
import type { AdapterCapabilities, FrameInfo, RuntimeAdapter, SessionState } from "../../src/index.js";

const CAPABILITY_KEYS: readonly (keyof AdapterCapabilities)[] = [
  "immersive",
  "handTracking",
  "planeDetection",
  "passthrough",
];

/** How a test drives the adapter's host, whatever that host happens to be. */
export interface RuntimeAdapterDriver {
  /** Push one frame through the adapter. */
  frame(timestamp: number, delta: number): void;
  /** Make the adapter report these capability flags. */
  capabilities(partial: Partial<AdapterCapabilities>): void;
  /** Make the host hand over a session. Omit if the adapter has no session facet. */
  sessionStart?(): void;
  /** Make the host drop the session from its own side. */
  sessionEnd?(): void;
}

export interface RuntimeAdapterSubject {
  readonly adapter: RuntimeAdapter;
  readonly drive: RuntimeAdapterDriver;
}

/**
 * @param name     shown in the test output, e.g. `"MockRuntimeAdapter"`.
 * @param factory  builds a fresh subject per test. The adapter it returns must
 *                 start with no session.
 */
export function runtimeAdapterContract(name: string, factory: () => RuntimeAdapterSubject): void {
  describe(`RuntimeAdapter contract: ${name}`, () => {
    it("delivers frames to every subscriber", () => {
      const { adapter, drive } = factory();
      const seen: FrameInfo[] = [];
      adapter.onFrame((frame) => seen.push(frame));

      drive.frame(100, 0.5);

      expect(seen).toEqual([{ timestamp: 100, delta: 0.5 }]);
    });

    it("onFrame returns an unsubscribe that stops delivery", () => {
      const { adapter, drive } = factory();
      let calls = 0;
      const unsubscribe = adapter.onFrame(() => calls++);

      drive.frame(1, 0.1);
      unsubscribe();
      drive.frame(2, 0.1);

      expect(calls).toBe(1);
    });

    it("getCapabilities reports every capability flag as a boolean", () => {
      const { adapter } = factory();
      const capabilities = adapter.getCapabilities();

      expect(Object.keys(capabilities).sort()).toEqual([...CAPABILITY_KEYS].sort());

      for (const key of CAPABILITY_KEYS) {
        expect(typeof capabilities[key]).toBe("boolean");
      }
    });

    it("onCapabilitiesChange fires once per change and stops after unsubscribe", () => {
      const { adapter, drive } = factory();
      const seen: AdapterCapabilities[] = [];
      const before = adapter.getCapabilities();
      const unsubscribe = adapter.onCapabilitiesChange((capabilities) => seen.push(capabilities));

      drive.capabilities({ handTracking: !before.handTracking });

      expect(seen).toHaveLength(1);
      expect(seen[0]!.handTracking).toBe(!before.handTracking);
      expect(adapter.getCapabilities().handTracking).toBe(!before.handTracking);

      unsubscribe();
      drive.capabilities({ planeDetection: !before.planeDetection });

      expect(seen).toHaveLength(1);
    });

    if (factory().adapter.session) {
      describe("session facet", () => {
        it("starts in the none state", () => {
          const { adapter } = factory();
          expect(adapter.session!.getState()).toBe("none");
        });

        it("request resolves ok once the host starts a session", async () => {
          const { adapter, drive } = factory();
          const session = adapter.session!;
          const states: SessionState[] = [];
          session.onStateChange((state) => states.push(state));

          const pending = session.request("immersive-vr", { timeoutMs: 1000 });
          drive.sessionStart!();

          expect(await pending).toEqual({ ok: true });
          expect(states).toEqual(["requesting", "active"]);
          expect(session.getState()).toBe("active");
        });

        it("end() returns the adapter to the none state", async () => {
          const { adapter, drive } = factory();
          const session = adapter.session!;

          const pending = session.request("immersive-vr", { timeoutMs: 1000 });
          drive.sessionStart!();
          await pending;

          await session.end();

          expect(session.getState()).toBe("none");
        });

        it("onStateChange returns an unsubscribe that stops delivery", async () => {
          const { adapter, drive } = factory();
          const session = adapter.session!;
          const states: SessionState[] = [];
          const unsubscribe = session.onStateChange((state) => states.push(state));

          unsubscribe();
          const pending = session.request("immersive-vr", { timeoutMs: 1000 });
          drive.sessionStart!();
          await pending;

          expect(states).toEqual([]);
        });

        it("onVisibilityChange returns an unsubscribe", () => {
          const { adapter } = factory();
          const unsubscribe = adapter.session!.onVisibilityChange(() => {});

          expect(typeof unsubscribe).toBe("function");
          expect(() => unsubscribe()).not.toThrow();
        });

        it("follows the host when the session ends from the host side", async () => {
          const { adapter, drive } = factory();
          const session = adapter.session!;

          const pending = session.request("immersive-vr", { timeoutMs: 1000 });
          drive.sessionStart!();
          await pending;

          drive.sessionEnd!();

          expect(session.getState()).toBe("none");
        });
      });
    }
  });
}
