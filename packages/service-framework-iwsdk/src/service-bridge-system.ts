/**
 * The single ECS-services bridge. A normal IWSDK system that, each frame:
 *   - maps IWSDK `visibilityState` to manager focus/pause (auto-pause when the
 *     headset is removed), and
 *   - drives the adapter's per-frame fan-out via {@link IWSDKAdapter.emitFrame}.
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
import type { ServiceManager } from "@realitycollective/service-framework";
import type { IWSDKAdapter } from "./iwsdk-adapter.js";
import type { CreateSystemLike, IWSDKWorldLike } from "./iwsdk-host.js";

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
      }
    }
  };
}
