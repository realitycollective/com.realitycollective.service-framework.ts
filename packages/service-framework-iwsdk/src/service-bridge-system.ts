/**
 * The single ECS-services bridge. A normal IWSDK system that, each frame:
 *   - maps IWSDK `visibilityState` to manager focus/pause (auto-pause when the
 *     headset is removed),
 *   - drives the adapter's per-frame fan-out via {@link IWSDKAdapter.emitFrame},
 *     and
 *   - emits the scheduler's `renderTick` channel, the same one the three.js and
 *     Babylon.js bridges emit, so a service written against the scheduler runs
 *     unchanged under IWSDK.
 *
 * Game logic is only ticked while the session is visible/focused: in the
 * browser / 2D preview the host app shows its own gate (e.g. an "Enter VR"
 * overlay) and the services stay idle until the player enters VR.
 *
 * This is the only place the engine loop touches the service layer; services
 * themselves never see IWSDK. The IWSDK primitives (`createSystem` and the
 * `VisibilityState.Visible` value) are injected so this package never imports
 * `@iwsdk/core` - mirroring how the three.js / Babylon.js bridges keep their
 * engine packages at arm's length.
 */
import type { LifecycleContext, ServiceManager } from "@realitycollective/service-framework";
import type { IWSDKAdapter } from "./iwsdk-adapter.js";
import type { CreateSystemLike, IWSDKWorldLike } from "./iwsdk-host.js";

/** Milliseconds per second, for the IWSDK seconds-to-scheduler-milliseconds conversion. */
const MS_PER_SECOND = 1000;

export interface ServiceBridgeSystemOptions<TVisibility = unknown> {
  /** The passive frame source fanned out to services. */
  readonly adapter: IWSDKAdapter;
  /** The service manager whose focus/pause signals are driven by visibility. */
  readonly manager: ServiceManager;
  /** The IWSDK world whose `visibilityState` is read each frame. */
  readonly world: IWSDKWorldLike<TVisibility>;
  /** IWSDK's `createSystem` factory (from `@iwsdk/core`). */
  readonly createSystem: CreateSystemLike;
  /**
   * The `VisibilityState` value that means the session is visible/focused
   * (IWSDK `VisibilityState.Visible`). The bridge ticks services only while
   * `world.visibilityState.value === visibleState`.
   */
  readonly visibleState: TVisibility;
}

/**
 * Builds the IWSDK `ServiceBridgeSystem` class. Register the returned class with
 * the world (`world.registerSystem(makeServiceBridgeSystem({ ... }))`); IWSDK
 * then calls its `update(delta, time)` once per frame.
 */
export function makeServiceBridgeSystem<TVisibility>(
  options: ServiceBridgeSystemOptions<TVisibility>,
) {
  const { adapter, manager, world, createSystem, visibleState } = options;
  let lastFocused: boolean | undefined;
  let frame = 0;

  return class ServiceBridgeSystem extends createSystem({}) {
    public override update(delta: number, time: number): void {
      const focused = world.visibilityState.value === visibleState;

      if (focused !== lastFocused) {
        lastFocused = focused;
        manager.emitFocusChange(focused);
        manager.emitPauseChange({ paused: !focused });
      }

      // Only run game logic while visible/focused; idle in the 2D/browser
      // preview and while the headset is removed (visible-blurred).
      if (focused) {
        adapter.emitFrame(time, delta);

        // IWSDK reports `delta` in seconds; LifecycleContext.deltaTime is in
        // milliseconds, as the three.js and Babylon.js bridges emit it.
        const context: LifecycleContext = {
          timestamp: time,
          deltaTime: delta * MS_PER_SECOND,
          frame: ++frame,
          source: "iwsdk",
        };

        manager.scheduler.emit("renderTick", context);
      }
    }
  };
}
