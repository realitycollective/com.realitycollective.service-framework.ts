/**
 * An in-memory `__rcHost`, standing in for the native app. Tests drive it the
 * way the app would: push frames, move the session through OpenXR states, and
 * answer or ignore session requests.
 */
import type { NativeHost, NativeIOHost, NativeSessionInfo } from "../../src/index.js";

export interface FakeNativeHost extends NativeHost {
  /** Every requestSession call, in order. */
  readonly requests: Array<{ mode: string; optionsJson: string }>;
  endCalls: number;
  frameSubscribers(): number;
  sessionSubscribers(): number;
  pushFrame(timestampMs: number, deltaS: number): void;
  setSession(patch: Partial<NativeSessionInfo>): void;
}

export interface FakeNativeHostOptions {
  /** Start a session as soon as one is requested. Default true. */
  readonly answerRequests?: boolean;
  /** End the session as soon as it is asked to. Default true. */
  readonly answerEnd?: boolean;
  readonly io?: NativeIOHost;
  readonly info?: Partial<NativeSessionInfo>;
}

const NO_SESSION: NativeSessionInfo = {
  state: "none",
  extensions: [],
  systemHandTracking: false,
  blendMode: null
};

export function createFakeNativeHost(options: FakeNativeHostOptions = {}): FakeNativeHost {
  const frameListeners = new Set<(timestampMs: number, deltaS: number) => void>();
  const sessionListeners = new Set<(info: NativeSessionInfo) => void>();
  let info: NativeSessionInfo = { ...NO_SESSION, ...options.info };

  const host: FakeNativeHost = {
    requests: [],
    endCalls: 0,
    ...(options.io ? { io: options.io } : {}),
    onFrame(callback) {
      frameListeners.add(callback);
      return () => {
        frameListeners.delete(callback);
      };
    },
    getSessionInfo: () => info,
    onSessionChange(callback) {
      sessionListeners.add(callback);
      return () => {
        sessionListeners.delete(callback);
      };
    },
    requestSession(mode, optionsJson) {
      host.requests.push({ mode, optionsJson });
      if (options.answerRequests ?? true) {
        host.setSession({ state: "ready" });
        host.setSession({ state: "focused", blendMode: mode === "immersive-ar" ? "alpha-blend" : "opaque" });
      }
    },
    endSession() {
      host.endCalls += 1;
      if (options.answerEnd ?? true) {
        host.setSession({ state: "stopping" });
        host.setSession({ ...NO_SESSION });
      }
    },
    frameSubscribers: () => frameListeners.size,
    sessionSubscribers: () => sessionListeners.size,
    pushFrame(timestampMs, deltaS) {
      frameListeners.forEach((listener) => listener(timestampMs, deltaS));
    },
    setSession(patch) {
      info = { ...info, ...patch };
      sessionListeners.forEach((listener) => listener(info));
    }
  };

  return host;
}
