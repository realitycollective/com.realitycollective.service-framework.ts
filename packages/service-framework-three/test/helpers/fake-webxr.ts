/**
 * Structural stand-ins for `navigator.xr` and a three.js `renderer.xr`, so the
 * adapter tests never import `three` and never need a browser, WebXR or a
 * headset.
 *
 * The fakes model the real handshake: `requestSession` stays pending until the
 * test hands over a session, `setSession` is what makes the manager present it,
 * and ending a session raises the session's `end` event and then the manager's
 * `sessionend`, in that order, which is what three.js does. Flags switch off
 * each of those signals, because a host that stays silent is exactly the case
 * the adapter has to survive.
 */
import type {
  WebXREventListener,
  WebXRManagerEventType,
  WebXRManagerLike,
  WebXRSessionLike,
  WebXRSystemLike
} from "../../src/index.js";

type Listeners = Map<string, Set<WebXREventListener>>;

export interface FakeSessionOptions {
  readonly enabledFeatures?: readonly string[];
  readonly environmentBlendMode?: string;
  readonly inputSources?: readonly { readonly hand?: unknown }[];
  readonly visibilityState?: unknown;
  /** `end()` rejects with this instead of resolving. */
  readonly endRejects?: unknown;
}

export interface FakeSession extends WebXRSessionLike {
  /** Always present on a fake, so the shape needs no optional handling. */
  readonly enabledFeatures: readonly string[];
  readonly environmentBlendMode: string;
  readonly inputSources: readonly { readonly hand?: unknown }[];
  readonly visibilityState: string;
  /** How many listeners are still attached, across every event type. */
  listenerCount(): number;
  /** Raise one of the session's own events. */
  dispatch(type: string): void;
  /** Change what `visibilityState` reports, then raise `visibilitychange`. */
  setVisibility(value: unknown): void;
  /** Replace the input sources, then raise `inputsourceschange`. */
  setInputSources(inputSources: readonly { readonly hand?: unknown }[]): void;
  /** How many times `end()` was called. */
  endCalls(): number;
}

export interface FakeXRHostOptions {
  /** Raise `sessionstart` and `sessionend` on the manager. Default true. */
  readonly dispatchesManagerEvents?: boolean;
  /** Raise `end` on the session when the host ends it. Default true. */
  readonly dispatchesSessionEnd?: boolean;
  /** Clear the manager's session when the host ends it. Default true. */
  readonly clearsSessionOnEnd?: boolean;
  /** A session the manager is already presenting before construction. */
  readonly initialSession?: FakeSessionOptions;
}

export interface FakeXRHost {
  /** Pass as `xr`. */
  readonly manager: WebXRManagerLike;
  /** Pass as `xrSystem`. */
  readonly system: WebXRSystemLike;
  /** Every `requestSession` call, in order. */
  readonly requests: { readonly mode: string; readonly init: unknown }[];
  /** Counts the tests assert on. */
  readonly counters: { supportChecks: number; setSessions: number };
  /** The session the manager is presenting, or null. */
  session(): FakeSession | null;
  /** Hand a session to whatever `requestSession` call is or will be waiting. */
  startSession(options?: FakeSessionOptions): void;
  /** End the live session from the host side, as a headset takeoff would. */
  endSession(): void;
  /** Present a session with no events, as a host that started one on its own. */
  presentSession(options?: FakeSessionOptions): FakeSession;
  /** Drop the presented session with no events at all. */
  clearSession(): void;
  /** Raise a manager event by hand. */
  dispatchManagerEvent(type: WebXRManagerEventType): void;
  /** How many listeners the manager still holds. */
  managerListenerCount(): number;
  /** Make `isSessionSupported` resolve false. */
  setSupported(supported: boolean): void;
  /** Make `isSessionSupported` reject. */
  failSupportCheck(error: unknown): void;
  /** Make `requestSession` reject. */
  failRequest(error: unknown): void;
  /** Make `setSession` reject. */
  failSetSession(error: unknown): void;
}

function addListener(listeners: Listeners, type: string, listener: WebXREventListener): void {
  const bucket = listeners.get(type) ?? new Set<WebXREventListener>();
  bucket.add(listener);
  listeners.set(type, bucket);
}

function removeListener(listeners: Listeners, type: string, listener: WebXREventListener): void {
  listeners.get(type)?.delete(listener);
}

function dispatch(listeners: Listeners, type: string): void {
  for (const listener of Array.from(listeners.get(type) ?? [])) {
    listener();
  }
}

function countListeners(listeners: Listeners): number {
  let total = 0;

  for (const bucket of listeners.values()) {
    total += bucket.size;
  }

  return total;
}

/**
 * @param onEnd runs when `end()` resolves, so the host can tear the session
 *              down exactly as it does for a host-side end.
 */
export function createFakeSession(
  options: FakeSessionOptions = {},
  onEnd?: () => void
): FakeSession {
  const listeners: Listeners = new Map();
  const enabledFeatures = options.enabledFeatures ?? [];
  const environmentBlendMode = options.environmentBlendMode ?? "opaque";
  let inputSources = options.inputSources ?? [];
  // Deliberately `unknown`: a test feeds a value WebXR would never report, to
  // prove the adapter falls back to "hidden" rather than trusting it.
  let visibilityState: unknown = options.visibilityState ?? "visible";
  let endCalls = 0;

  const session: FakeSession = {
    enabledFeatures,
    environmentBlendMode,
    get inputSources() {
      return inputSources;
    },
    get visibilityState(): string {
      return visibilityState as string;
    },
    async end() {
      endCalls += 1;

      if (options.endRejects !== undefined) {
        throw options.endRejects;
      }

      onEnd?.();
    },
    addEventListener(type, listener) {
      addListener(listeners, type, listener);
    },
    removeEventListener(type, listener) {
      removeListener(listeners, type, listener);
    },
    listenerCount: () => countListeners(listeners),
    dispatch: (type) => dispatch(listeners, type),
    setVisibility(value) {
      visibilityState = value;
      dispatch(listeners, "visibilitychange");
    },
    setInputSources(next) {
      inputSources = next;
      dispatch(listeners, "inputsourceschange");
    },
    endCalls: () => endCalls
  };

  return session;
}

export function createFakeXRHost(options: FakeXRHostOptions = {}): FakeXRHost {
  const dispatchesManagerEvents = options.dispatchesManagerEvents ?? true;
  const dispatchesSessionEnd = options.dispatchesSessionEnd ?? true;
  const clearsSessionOnEnd = options.clearsSessionOnEnd ?? true;

  const managerListeners: Listeners = new Map();
  const requests: { readonly mode: string; readonly init: unknown }[] = [];
  const counters = { supportChecks: 0, setSessions: 0 };
  const pending: ((session: FakeSession) => void)[] = [];
  const queued: FakeSession[] = [];

  let current: FakeSession | null = null;
  let supported = true;
  let supportError: unknown;
  let requestError: unknown;
  let setSessionError: unknown;

  /** Tear a session down the way the host does: session event, then manager. */
  const finish = (session: FakeSession): void => {
    if (current === session && clearsSessionOnEnd) {
      current = null;
    }

    if (dispatchesSessionEnd) {
      session.dispatch("end");
    }

    if (dispatchesManagerEvents) {
      dispatch(managerListeners, "sessionend");
    }
  };

  const makeSession = (sessionOptions?: FakeSessionOptions): FakeSession => {
    const session: FakeSession = createFakeSession(sessionOptions, () => finish(session));
    return session;
  };

  if (options.initialSession) {
    current = makeSession(options.initialSession);
  }

  const flush = (): void => {
    while (queued.length > 0 && pending.length > 0) {
      const resolve = pending.shift();
      const session = queued.shift();

      if (resolve && session) {
        resolve(session);
      }
    }
  };

  const manager: WebXRManagerLike = {
    async setSession(session) {
      counters.setSessions += 1;

      if (setSessionError !== undefined) {
        throw setSessionError;
      }

      current = session as FakeSession;

      if (dispatchesManagerEvents) {
        dispatch(managerListeners, "sessionstart");
      }
    },
    getSession: () => current,
    addEventListener(type, listener) {
      addListener(managerListeners, type, listener);
    },
    removeEventListener(type, listener) {
      removeListener(managerListeners, type, listener);
    }
  };

  const system: WebXRSystemLike = {
    async isSessionSupported(mode) {
      counters.supportChecks += 1;

      if (supportError !== undefined) {
        throw supportError;
      }

      void mode;
      return supported;
    },
    requestSession(mode, init) {
      requests.push({ mode, init });

      if (requestError !== undefined) {
        return Promise.reject(requestError);
      }

      return new Promise<WebXRSessionLike>((resolve) => {
        pending.push(resolve);
        flush();
      });
    }
  };

  return {
    manager,
    system,
    requests,
    counters,
    session: () => current,
    startSession(sessionOptions) {
      queued.push(makeSession(sessionOptions));
      flush();
    },
    endSession() {
      if (current) {
        finish(current);
      }
    },
    presentSession(sessionOptions) {
      const session = makeSession(sessionOptions);
      current = session;
      return session;
    },
    clearSession() {
      current = null;
    },
    dispatchManagerEvent(type) {
      dispatch(managerListeners, type);
    },
    managerListenerCount: () => countListeners(managerListeners),
    setSupported(value) {
      supported = value;
    },
    failSupportCheck(error) {
      supportError = error;
    },
    failRequest(error) {
      requestError = error;
    },
    failSetSession(error) {
      setSessionError = error;
    }
  };
}

/** Records the animation-loop callback a host is given, so tests can drive it. */
export interface FakeAnimationLoopHost {
  setAnimationLoop(callback: ((timestamp: number) => void) | null): void;
  /** The bound callback, or null once released. */
  callback(): ((timestamp: number) => void) | null;
  /** How many times `setAnimationLoop` was called. */
  calls(): number;
  /** Drive one frame; throws if nothing is bound. */
  frame(timestamp: number): void;
}

export function createFakeAnimationLoopHost(): FakeAnimationLoopHost {
  let bound: ((timestamp: number) => void) | null = null;
  let calls = 0;

  return {
    setAnimationLoop(callback) {
      calls += 1;
      bound = callback;
    },
    callback: () => bound,
    calls: () => calls,
    frame(timestamp) {
      if (!bound) {
        throw new Error("No animation loop is bound");
      }

      bound(timestamp);
    }
  };
}
