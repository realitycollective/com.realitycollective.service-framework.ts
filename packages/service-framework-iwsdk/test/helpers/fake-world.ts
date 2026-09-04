/**
 * A structural stand-in for an IWSDK `World`, so the adapter tests never import
 * `@iwsdk/core`. Two flavours:
 *
 *   - `"push"` - the visibility signal has `subscribe`, like a real IWSDK world,
 *     so the adapter learns about session changes as they happen.
 *   - `"poll"` - the signal has no `subscribe`, which is what forces the
 *     adapter's polling fallback and `refreshCapabilities()` path.
 */
import type { IWSDKWorldLike } from "../../src/index.js";

type VisibilityListener = (value: unknown) => void;

export interface FakeSession {
  readonly enabledFeatures?: readonly string[];
  readonly environmentBlendMode?: string;
  readonly inputSources: readonly { readonly hand?: unknown }[];
}

interface FakeSignal {
  value: unknown;
  subscribe?: (listener: VisibilityListener) => () => void;
}

interface FakeWorld {
  visibilityState: FakeSignal;
  session: FakeSession | null;
  launchXR?: (options?: unknown) => void;
  exitXR?: () => void;
}

export interface FakeHost {
  /** Pass this to `new IWSDKAdapter(...)`. */
  readonly world: IWSDKWorldLike;
  /** Every options object `launchXR` was called with, in order. */
  readonly launches: unknown[];
  /** Call counts the tests assert on. */
  readonly counters: { exits: number; unsubscribes: number };
  /** Re-notify subscribers with the current visibility value. */
  fire(): void;
  /** Replace the live session and notify. */
  setSession(session: FakeSession | null): void;
  /** Replace the session without notifying, to exercise the polling path. */
  setSessionQuietly(session: FakeSession | null): void;
  /** Change the visibility value and notify. */
  setVisibility(value: unknown): void;
  /** Give the world a `launchXR`; `impl` runs after the call is recorded. */
  enableLaunch(impl?: (options?: unknown) => void): void;
  /** Give the world an `exitXR`; `impl` runs after the call is counted. */
  enableExit(impl?: () => void): void;
}

export function createHost(kind: "push" | "poll" = "push", session: FakeSession | null = null): FakeHost {
  const listeners = new Set<VisibilityListener>();
  const launches: unknown[] = [];
  const counters = { exits: 0, unsubscribes: 0 };

  const subscribe = (listener: VisibilityListener): (() => void) => {
    listeners.add(listener);
    return () => {
      counters.unsubscribes += 1;
      listeners.delete(listener);
    };
  };

  const visibilityState: FakeSignal =
    kind === "push" ? { value: "non-immersive", subscribe } : { value: "non-immersive" };

  const world: FakeWorld = { visibilityState, session };

  const fire = (): void => {
    for (const listener of Array.from(listeners)) {
      listener(visibilityState.value);
    }
  };

  return {
    world,
    launches,
    counters,
    fire,
    setSession(next) {
      world.session = next;
      fire();
    },
    setSessionQuietly(next) {
      world.session = next;
    },
    setVisibility(value) {
      visibilityState.value = value;
      fire();
    },
    enableLaunch(impl) {
      world.launchXR = (options?: unknown) => {
        launches.push(options);
        impl?.(options);
      };
    },
    enableExit(impl) {
      world.exitXR = () => {
        counters.exits += 1;
        impl?.();
      };
    },
  };
}
