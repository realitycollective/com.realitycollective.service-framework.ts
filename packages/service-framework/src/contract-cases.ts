/**
 * The shared conformance suite for {@link RuntimeAdapter} implementations.
 *
 * Every adapter - the headless mock, the IWSDK adapter, the three.js and
 * Babylon.js adapters, and whatever comes next - must behave the same way at
 * this seam, or a service that works headless will not work on a headset.
 *
 * The suite ships as data rather than as a test file, and is runner-free on
 * purpose. It used to be an in-repo vitest helper, which meant an adapter
 * written outside this repository had no way to prove it conformed: the checks
 * existed but were not published. Each case now returns silently on success and
 * throws a plain `Error` describing the failure otherwise, so any runner can
 * host it. A whole suite is three lines:
 *
 * ```ts
 * for (const contractCase of runtimeAdapterContractCases()) {
 *   it(contractCase.name, () => contractCase.run(makeSubject()));
 * }
 * ```
 *
 * Build a fresh subject per case. The session cases drive a session through its
 * whole lifecycle, so a subject reused across them starts in the wrong state.
 */
import {
  DEFAULT_CAPABILITIES,
  type AdapterCapabilities,
  type FrameInfo,
  type RuntimeAdapter,
  type SessionFacet,
  type SessionState,
  type SessionVisibility,
} from "./runtime-adapter.js";

/** How a case drives the adapter's host, whatever that host happens to be. */
export interface RuntimeAdapterDriver {
  /** Push one frame through the adapter. */
  frame(timestamp: number, delta: number): void;
  /**
   * Make the adapter report these capability flags. Wire it to the adapter's
   * sticky `setCapabilities` override, which every adapter must expose; see
   * {@link RuntimeAdapter}.
   */
  capabilities(partial: Partial<AdapterCapabilities>): void;
  /** Make the host hand over a session. Omit if the adapter has no session facet. */
  sessionStart?(): void;
  /** Make the host drop the session from its own side. */
  sessionEnd?(): void;
}

/** One adapter plus the means to drive its host, as a case receives it. */
export interface RuntimeAdapterSubject {
  readonly adapter: RuntimeAdapter;
  readonly drive: RuntimeAdapterDriver;
}

/**
 * One check a {@link RuntimeAdapter} implementation must pass. `run` returns
 * silently on success and throws an `Error` describing the failure otherwise,
 * so any test runner can host it. Some cases are asynchronous, so a runner must
 * await whatever `run` returns.
 */
export interface RuntimeAdapterContractCase {
  name: string;
  run(subject: RuntimeAdapterSubject): void | Promise<void>;
}

/** The whole suite, in a stable order. */
export function runtimeAdapterContractCases(): readonly RuntimeAdapterContractCase[] {
  return CASES;
}

/** Read off the defaults, so a new capability key joins the contract with it. */
const CAPABILITY_KEYS: readonly string[] = Object.keys(DEFAULT_CAPABILITIES).sort();

const BOOLEAN_CAPABILITY_KEYS: readonly (keyof AdapterCapabilities)[] = [
  "immersive",
  "handTracking",
  "planeDetection",
  "passthrough",
];

const BLEND_MODE_VALUES: readonly unknown[] = [null, "opaque", "alpha-blend", "additive"];

/** Long enough that a slow host is not failed, short enough to fail fast. */
const REQUEST_TIMEOUT_MS = 1000;

/** A subject's session facet with the driver hooks that exercise it. */
interface SessionProbe {
  readonly session: SessionFacet;
  readonly start: () => void;
  readonly end: () => void;
}

const CASES: readonly RuntimeAdapterContractCase[] = [
  {
    name: "delivers each frame to every subscriber",
    run({ adapter, drive }) {
      const first: FrameInfo[] = [];
      const second: FrameInfo[] = [];
      adapter.onFrame(collector(first));
      adapter.onFrame(collector(second));

      drive.frame(100, 0.5);

      for (const seen of [first, second]) {
        assert(
          seen.length === 1,
          `every subscriber must get the frame exactly once, one got it ${String(seen.length)} time(s)`,
        );
      }

      for (const frame of [...first, ...second]) {
        assert(
          frame.timestamp === 100 && frame.delta === 0.5,
          `the frame must arrive unchanged, got ${JSON.stringify(frame)}`,
        );
      }
    },
  },
  {
    name: "onFrame returns an unsubscribe that stops delivery",
    run({ adapter, drive }) {
      const seen: FrameInfo[] = [];
      const unsubscribe = adapter.onFrame(collector(seen));
      assert(typeof unsubscribe === "function", "onFrame() must return an unsubscribe function");

      drive.frame(1, 0.1);
      unsubscribe();
      drive.frame(2, 0.1);

      assert(
        seen.length === 1,
        `an unsubscribed frame listener must stop being called, it ran ${String(seen.length)} time(s)`,
      );
    },
  },
  {
    name: "getCapabilities reports exactly the contract capability keys",
    run({ adapter }) {
      const capabilities = adapter.getCapabilities();
      const keys = Object.keys(capabilities).sort();

      assert(
        keys.length === CAPABILITY_KEYS.length &&
          keys.every((key, index) => key === CAPABILITY_KEYS[index]),
        `getCapabilities() must return exactly [${CAPABILITY_KEYS.join(", ")}], got [${keys.join(", ")}]`,
      );

      for (const key of BOOLEAN_CAPABILITY_KEYS) {
        assert(
          typeof capabilities[key] === "boolean",
          `capabilities.${key} must be a boolean, got ${typeof capabilities[key]}`,
        );
      }

      assert(
        BLEND_MODE_VALUES.includes(capabilities.environmentBlendMode),
        `capabilities.environmentBlendMode must be null or a WebXR blend mode, got ${String(capabilities.environmentBlendMode)}`,
      );
    },
  },
  {
    name: "onCapabilitiesChange fires once per change and stops after unsubscribe",
    run({ adapter, drive }) {
      const seen: AdapterCapabilities[] = [];
      const before = adapter.getCapabilities();
      const unsubscribe = adapter.onCapabilitiesChange(collector(seen));
      assert(
        typeof unsubscribe === "function",
        "onCapabilitiesChange() must return an unsubscribe function",
      );

      drive.capabilities({ handTracking: !before.handTracking });

      assert(
        seen.length === 1,
        `one capability change must produce one callback, it produced ${String(seen.length)}`,
      );

      const announced = seen[0];
      assert(
        announced !== undefined && announced.handTracking === !before.handTracking,
        "the callback must carry the capabilities that changed",
      );
      assert(
        adapter.getCapabilities().handTracking === !before.handTracking,
        "getCapabilities() must report the change the callback announced",
      );

      unsubscribe();
      drive.capabilities({ planeDetection: !before.planeDetection });

      assert(
        seen.length === 1,
        `an unsubscribed capability listener must stop being called, it ran ${String(seen.length)} time(s)`,
      );
    },
  },
  {
    name: "session: a fresh adapter starts in the none state",
    run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      assert(
        probe.session.getState() === "none",
        `a fresh adapter must report state "none", got "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: request resolves ok once the host starts a session",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const states: SessionState[] = [];
      probe.session.onStateChange(collector(states));

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      const result = await pending;

      assert(
        result.ok,
        `request() must resolve ok once the host starts a session, got ${JSON.stringify(result)}`,
      );
      assert(
        states.length === 2 && states[0] === "requesting" && states[1] === "active",
        `request() must walk "requesting" then "active", got [${states.join(", ")}]`,
      );
      assert(
        probe.session.getState() === "active",
        `getState() must report "active" while a session is live, got "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: end() returns the adapter to the none state",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      await pending;

      await probe.session.end();

      assert(
        probe.session.getState() === "none",
        `end() must return the adapter to "none", got "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: onStateChange returns an unsubscribe that stops delivery",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const states: SessionState[] = [];
      const unsubscribe = probe.session.onStateChange(collector(states));
      assert(
        typeof unsubscribe === "function",
        "onStateChange() must return an unsubscribe function",
      );

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      await pending;

      const whileSubscribed = states.length;
      assert(whileSubscribed > 0, "a subscribed state listener must be told about a transition");

      unsubscribe();
      await probe.session.end();

      assert(
        states.length === whileSubscribed,
        `an unsubscribed state listener must stop being called, it ran ${String(states.length - whileSubscribed)} more time(s)`,
      );
    },
  },
  {
    name: "session: onVisibilityChange returns an unsubscribe that can be called",
    run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const seen: SessionVisibility[] = [];
      const unsubscribe = probe.session.onVisibilityChange(collector(seen));
      assert(
        typeof unsubscribe === "function",
        "onVisibilityChange() must return an unsubscribe function",
      );

      unsubscribe();
    },
  },
  {
    name: "session: follows the host when the session ends from the host side",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      await pending;

      probe.end();

      assert(
        probe.session.getState() === "none",
        `a session dropped by the host must return the adapter to "none", got "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: getMode reports the live session's mode and null otherwise",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      assert(
        probe.session.getMode() === null,
        `getMode() must report null before a session exists, got "${String(probe.session.getMode())}"`,
      );

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      await pending;

      assert(
        probe.session.getMode() === "immersive-vr",
        `getMode() must report the requested mode once the session is live, got "${String(probe.session.getMode())}"`,
      );

      await probe.session.end();

      assert(
        probe.session.getMode() === null,
        `getMode() must report null once the session has ended, got "${String(probe.session.getMode())}"`,
      );
    },
  },
  {
    name: "session: isSupported answers without changing the state",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const before = probe.session.getState();
      const result = await probe.session.isSupported("immersive-vr");

      assert(
        typeof result === "boolean",
        `isSupported() must resolve a boolean, got ${typeof result}`,
      );
      assert(
        probe.session.getState() === before,
        `isSupported() must not change the session state, was "${before}", now "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: recentre keeps the state and never throws",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      probe.session.recentre();

      assert(
        probe.session.getState() === "none",
        `recentre() must not change the session state, got "${probe.session.getState()}"`,
      );

      const pending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      await pending;

      probe.session.recentre();

      assert(
        probe.session.getState() === "active",
        `recentre() must not change the session state, got "${probe.session.getState()}"`,
      );
    },
  },
  {
    name: "session: requesting a different mode while active ends the first session and starts the second",
    async run(subject) {
      const probe = sessionOf(subject);

      if (!probe) {
        return;
      }

      const states: SessionState[] = [];
      probe.session.onStateChange(collector(states));

      const firstPending = probe.session.request("immersive-vr", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      const firstResult = await firstPending;

      assert(firstResult.ok, `the first request must resolve ok, got ${JSON.stringify(firstResult)}`);
      assert(
        probe.session.getMode() === "immersive-vr",
        `getMode() must report the first session's mode once it is active, got "${String(probe.session.getMode())}"`,
      );

      states.length = 0;

      const secondPending = probe.session.request("immersive-ar", { timeoutMs: REQUEST_TIMEOUT_MS });
      probe.start();
      const secondResult = await secondPending;

      assert(
        secondResult.ok,
        `requesting a different mode while active must resolve ok once the host hands over the new session, got ${JSON.stringify(secondResult)}`,
      );
      assert(
        states.includes("ending"),
        `requesting a different mode while active must end the live session first, saw [${states.join(", ")}]`,
      );
      assert(
        states[states.length - 1] === "active",
        `requesting a different mode while active must land back on "active", saw [${states.join(", ")}]`,
      );
      assert(
        probe.session.getMode() === "immersive-ar",
        `getMode() must report the new mode once the switch completes, got "${String(probe.session.getMode())}"`,
      );
    },
  },
];

/**
 * The session facet with the hooks that drive it, or `null` when this subject
 * has none. A host that owns no sessions is conformant - `session` is an
 * optional facet - so its session cases pass without running.
 */
function sessionOf(subject: RuntimeAdapterSubject): SessionProbe | null {
  const session = subject.adapter.session;
  const start = subject.drive.sessionStart;
  const end = subject.drive.sessionEnd;

  if (!session || !start || !end) {
    return null;
  }

  return { session, start, end };
}

/** One listener that records what it is given, shared by every case. */
function collector<TValue>(into: TValue[]): (value: TValue) => void {
  return (value) => {
    into.push(value);
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}
