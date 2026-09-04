/**
 * Structural stand-ins for Babylon's `WebXRExperienceHelper`, its session
 * manager, its `Observable` and an `Engine` render loop, so the adapter tests
 * never import `@babylonjs/core` and never need a browser, WebXR or a headset.
 *
 * The fakes model the real handshake: `enterXRAsync` stays pending until the
 * test hands over a session, entering raises `ENTERING_XR`, `onXRSessionInit`
 * and then `IN_XR`, and ending raises the session's own `end` event,
 * `onXRSessionEnded` and `NOT_IN_XR`, in that order. Flags switch each of those
 * signals off, because an experience that stays silent - an older Babylon, a
 * host that only ever hands over a session manager - is exactly the case the
 * adapter has to survive.
 */
import type {
  BabylonEngineHostLike,
  BabylonObservableLike,
  BabylonObserverLike,
  BabylonXREventListener,
  BabylonXRExperienceLike,
  BabylonXRSessionLike
} from "../../src/index.js";
import { BABYLON_WEBXR_STATE } from "../../src/index.js";

type Listeners = Map<string, Set<BabylonXREventListener>>;

export interface FakeObservable<T> extends BabylonObservableLike<T> {
  /** Fire every observer, in the order they subscribed. */
  notify(value: T): void;
  /** How many observers are still attached. */
  observerCount(): number;
}

export function createFakeObservable<T>(): FakeObservable<T> {
  const observers = new Map<BabylonObserverLike, (value: T) => void>();

  return {
    add(callback) {
      const observer: BabylonObserverLike = {};
      observers.set(observer, callback);
      return observer;
    },
    remove(observer) {
      return observer !== null && observers.delete(observer);
    },
    notify(value) {
      for (const callback of Array.from(observers.values())) {
        callback(value);
      }
    },
    observerCount: () => observers.size
  };
}

export interface FakeSessionOptions {
  readonly enabledFeatures?: readonly string[];
  readonly environmentBlendMode?: string;
  readonly inputSources?: readonly { readonly hand?: unknown }[];
  readonly visibilityState?: unknown;
}

export interface FakeSession extends BabylonXRSessionLike {
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
}

function addListener(listeners: Listeners, type: string, listener: BabylonXREventListener): void {
  const bucket = listeners.get(type) ?? new Set<BabylonXREventListener>();
  bucket.add(listener);
  listeners.set(type, bucket);
}

function removeListener(
  listeners: Listeners,
  type: string,
  listener: BabylonXREventListener
): void {
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

export function createFakeSession(options: FakeSessionOptions = {}): FakeSession {
  const listeners: Listeners = new Map();
  const enabledFeatures = options.enabledFeatures ?? [];
  const environmentBlendMode = options.environmentBlendMode ?? "opaque";
  let inputSources = options.inputSources ?? [];
  // Deliberately `unknown`: a test feeds a value WebXR would never report, to
  // prove the adapter falls back to "hidden" rather than trusting it.
  let visibilityState: unknown = options.visibilityState ?? "visible";

  return {
    enabledFeatures,
    environmentBlendMode,
    get inputSources() {
      return inputSources;
    },
    get visibilityState(): string {
      return visibilityState as string;
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
    }
  };
}

export interface FakeEnterCall {
  readonly mode: string;
  readonly referenceSpaceType: string;
  readonly renderTarget: unknown;
  readonly init: unknown;
}

export interface FakeBabylonXROptions {
  /** Fire `onStateChangedObservable` as the real helper does. Default true. */
  readonly dispatchesStateChanges?: boolean;
  /** Fire `onXRSessionInit` and `onXRSessionEnded`. Default true. */
  readonly dispatchesSessionEvents?: boolean;
  /** Raise `end` on the session itself when it ends. Default true. */
  readonly dispatchesSessionEnd?: boolean;
  /** Clear the manager's session when it ends. Default true. */
  readonly clearsSessionOnEnd?: boolean;
  /** Carry a session manager at all. Default true. */
  readonly withSessionManager?: boolean;
  /** Carry the observables at all. Default true. */
  readonly withObservables?: boolean;
  /** Carry `isSessionSupportedAsync` at all. Default true. */
  readonly withSupportCheck?: boolean;
  /** A session the manager is already presenting before construction. */
  readonly initialSession?: FakeSessionOptions;
}

export interface FakeBabylonXR {
  /** Pass as `xr`; this stands in for `WebXRDefaultExperience.baseExperience`. */
  readonly experience: BabylonXRExperienceLike;
  /** Every `enterXRAsync` call, in order. */
  readonly enters: FakeEnterCall[];
  /** Counts the tests assert on. */
  readonly counters: { supportChecks: number; exits: number };
  /** The session the manager is presenting, or null. */
  session(): FakeSession | null;
  /** Hand a session to whatever `enterXRAsync` call is or will be waiting. */
  startSession(options?: FakeSessionOptions): FakeSession;
  /** Enter XR with no request behind it, as Babylon's own enter-XR UI does. */
  enterExternally(options?: FakeSessionOptions): FakeSession;
  /** End the live session from the host side, as a headset takeoff would. */
  endSession(): void;
  /** Present a session with no signals, as a host that started one alone. */
  presentSession(options?: FakeSessionOptions): FakeSession;
  /** Drop the presented session with no signals at all. */
  clearSession(): void;
  /** Fire one `WebXRState` value by hand. */
  dispatchState(state: number): void;
  /** How many observers the experience still holds, across every observable. */
  observerCount(): number;
  /** Make `isSessionSupportedAsync` resolve false. */
  setSupported(supported: boolean): void;
  /** Make `isSessionSupportedAsync` reject. */
  failSupportCheck(error: unknown): void;
  /** Make `enterXRAsync` reject. */
  failEnter(error: unknown): void;
  /** Make `exitXRAsync` reject. */
  failExit(error: unknown): void;
}

export function createFakeBabylonXR(options: FakeBabylonXROptions = {}): FakeBabylonXR {
  const dispatchesStateChanges = options.dispatchesStateChanges ?? true;
  const dispatchesSessionEvents = options.dispatchesSessionEvents ?? true;
  const dispatchesSessionEnd = options.dispatchesSessionEnd ?? true;
  const clearsSessionOnEnd = options.clearsSessionOnEnd ?? true;
  const withSessionManager = options.withSessionManager ?? true;
  const withObservables = options.withObservables ?? true;
  const withSupportCheck = options.withSupportCheck ?? true;

  const onStateChangedObservable = createFakeObservable<number>();
  const onXRSessionInit = createFakeObservable<BabylonXRSessionLike>();
  const onXRSessionEnded = createFakeObservable<unknown>();

  const enters: FakeEnterCall[] = [];
  const counters = { supportChecks: 0, exits: 0 };
  const queued: FakeSession[] = [];

  let current: FakeSession | null = null;
  let resolveEnter: (() => void) | null = null;
  let supported = true;
  let supportError: unknown;
  let enterError: unknown;
  let exitError: unknown;

  const notifyState = (state: number): void => {
    if (dispatchesStateChanges) {
      onStateChangedObservable.notify(state);
    }
  };

  /** Present a session the way entering XR does: state, init signal, state. */
  const handover = (session: FakeSession): void => {
    current = session;
    notifyState(BABYLON_WEBXR_STATE.ENTERING_XR);

    if (dispatchesSessionEvents) {
      onXRSessionInit.notify(session);
    }

    notifyState(BABYLON_WEBXR_STATE.IN_XR);
  };

  /**
   * A test queues a session as soon as it has called `request`, but the adapter
   * only reaches `enterXRAsync` a microtask later. Pairing the two here is what
   * lets a test drive the whole handshake synchronously.
   */
  const flush = (): void => {
    const session = queued.shift();
    const resolve = resolveEnter;

    if (!session || !resolve) {
      if (session) {
        queued.unshift(session);
      }

      return;
    }

    resolveEnter = null;
    handover(session);
    resolve();
  };

  /** Tear a session down the way Babylon does: session event, then helper. */
  const teardown = (): void => {
    const session = current;

    if (clearsSessionOnEnd) {
      current = null;
    }

    if (dispatchesSessionEnd) {
      session?.dispatch("end");
    }

    if (dispatchesSessionEvents) {
      onXRSessionEnded.notify(undefined);
    }

    notifyState(BABYLON_WEBXR_STATE.NOT_IN_XR);
  };

  const manager: Record<string, unknown> = {
    get session() {
      return current;
    }
  };

  if (withObservables) {
    manager.onXRSessionInit = onXRSessionInit;
    manager.onXRSessionEnded = onXRSessionEnded;
  }

  if (withSupportCheck) {
    manager.isSessionSupportedAsync = async (mode: string): Promise<boolean> => {
      counters.supportChecks += 1;

      if (supportError !== undefined) {
        throw supportError;
      }

      void mode;
      return supported;
    };
  }

  const experience: Record<string, unknown> = {
    enterXRAsync(
      mode: string,
      referenceSpaceType: string,
      renderTarget?: unknown,
      init?: unknown
    ): Promise<unknown> {
      enters.push({ mode, referenceSpaceType, renderTarget, init });

      if (enterError !== undefined) {
        return Promise.reject(enterError);
      }

      return new Promise<unknown>((resolve) => {
        resolveEnter = () => resolve(undefined);
        flush();
      });
    },
    async exitXRAsync(): Promise<void> {
      counters.exits += 1;

      if (exitError !== undefined) {
        throw exitError;
      }

      notifyState(BABYLON_WEBXR_STATE.EXITING_XR);
      teardown();
    }
  };

  if (withObservables) {
    experience.onStateChangedObservable = onStateChangedObservable;
  }

  if (withSessionManager) {
    experience.sessionManager = manager;
  }

  if (options.initialSession) {
    current = createFakeSession(options.initialSession);
  }

  return {
    experience: experience as unknown as BabylonXRExperienceLike,
    enters,
    counters,
    session: () => current,
    startSession(sessionOptions) {
      const session = createFakeSession(sessionOptions);
      queued.push(session);
      flush();

      return session;
    },
    enterExternally(sessionOptions) {
      const session = createFakeSession(sessionOptions);
      handover(session);

      return session;
    },
    endSession: () => teardown(),
    presentSession(sessionOptions) {
      const session = createFakeSession(sessionOptions);
      current = session;
      return session;
    },
    clearSession() {
      current = null;
    },
    dispatchState: (state) => onStateChangedObservable.notify(state),
    observerCount: () =>
      onStateChangedObservable.observerCount() +
      onXRSessionInit.observerCount() +
      onXRSessionEnded.observerCount(),
    setSupported(value) {
      supported = value;
    },
    failSupportCheck(error) {
      supportError = error;
    },
    failEnter(error) {
      enterError = error;
    },
    failExit(error) {
      exitError = error;
    }
  };
}

/** Records the render-loop callback the engine is given, so tests can drive it. */
export interface FakeEngineHost extends BabylonEngineHostLike {
  /** The bound callback, or null once released. */
  callback(): (() => void) | null;
  /** How many times `runRenderLoop` was called. */
  runCalls(): number;
  /** How many times `stopRenderLoop` was called. */
  stopCalls(): number;
  /** Drive one frame; throws if nothing is bound. */
  frame(): void;
}

export function createFakeEngineHost(): FakeEngineHost {
  let bound: (() => void) | null = null;
  let runCalls = 0;
  let stopCalls = 0;

  return {
    runRenderLoop(callback) {
      runCalls += 1;
      bound = callback;
    },
    stopRenderLoop(callback) {
      stopCalls += 1;

      // Babylon identifies a callback by reference, so a mismatched one would
      // leave the loop running. Modelled here so the adapter cannot regress it.
      if (bound === callback) {
        bound = null;
      }
    },
    callback: () => bound,
    runCalls: () => runCalls,
    stopCalls: () => stopCalls,
    frame() {
      if (!bound) {
        throw new Error("No render loop is bound");
      }

      bound();
    }
  };
}
