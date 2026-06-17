/**
 * service-framework-iwsdk — minimal usage example
 *
 * Mirrors the three.js / Babylon.js examples, but for the Meta IWSDK frame
 * source. IWSDK owns the render loop, so instead of a bridge that owns
 * `setAnimationLoop` / `runRenderLoop`, the IWSDK shim is a *passive* frame
 * source pumped from inside an IWSDK ECS system, and visibility is mapped to
 * the manager's focus/pause signals (auto-pause when the headset comes off).
 *
 * The mocks below stand in for `@iwsdk/core` so this snippet runs in any
 * Node.js environment. In a real IWSDK app you pass the real primitives:
 *
 *   import { World, createSystem, VisibilityState } from "@iwsdk/core";
 *   const { manager, adapter } = startServiceRuntime(world, createEnergyProfile);
 *   world.registerSystem(
 *     makeServiceBridgeSystem({
 *       adapter, manager, world, createSystem,
 *       visibleState: VisibilityState.Visible,
 *     }),
 *   );
 */

import {
  createServiceProfile,
  createServiceToken,
  type ServiceProfile,
} from "@realitycollective/service-framework";
import {
  IWSDKAdapter,
  SnapshotService,
  makeServiceBridgeSystem,
  startServiceRuntime,
  type CreateSystemLike,
  type IWSDKWorldLike,
  type RuntimeAdapter,
  type ServiceContext,
  type Unsubscribe,
} from "@realitycollective/service-framework-iwsdk";

// ---------------------------------------------------------------------------
// A leaf service that owns its state and decays energy once per frame.
// It depends only on RuntimeAdapter — never on @iwsdk/core — so it is portable
// and unit-testable headless against MockRuntimeAdapter.
// ---------------------------------------------------------------------------

interface EnergySnapshot {
  readonly energy: number;
}

const ENERGY_SERVICE_TOKEN = createServiceToken<EnergyService>("EnergyService");

class EnergyService extends SnapshotService<unknown, EnergySnapshot> {
  private unsubscribe?: Unsubscribe;

  public constructor(
    context: ServiceContext,
    private readonly adapter: RuntimeAdapter,
  ) {
    super(context, { energy: 1 });
  }

  public override initialize(): void {
    this.unsubscribe = this.adapter.onFrame(({ delta }) => {
      const energy = Math.max(0, this.getSnapshot().energy - delta * 0.1);
      this.updateSnapshot({ energy });
    });
  }

  public override destroy(): void {
    this.unsubscribe?.();
  }
}

function createEnergyProfile(adapter: IWSDKAdapter): ServiceProfile {
  return createServiceProfile("iwsdk-example", [
    {
      token: ENERGY_SERVICE_TOKEN,
      useFactory: (context) => new EnergyService(context, adapter),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Mock @iwsdk/core primitives — swap for the real ones in an IWSDK app.
// ---------------------------------------------------------------------------

const VISIBLE: string = "visible";
const HIDDEN: string = "hidden";

const world: IWSDKWorldLike<string> = { visibilityState: { value: VISIBLE } };

const createSystem: CreateSystemLike = () =>
  class {
    public update(_delta: number, _time: number): void {}
  };

// ---------------------------------------------------------------------------
// Bootstrap: stand up the manager + adapter, then wire the bridge system.
// ---------------------------------------------------------------------------

const { manager, adapter } = startServiceRuntime(world, createEnergyProfile);

const ServiceBridgeSystem = makeServiceBridgeSystem({
  adapter,
  manager,
  world,
  createSystem,
  visibleState: VISIBLE,
});

// In a real app: world.registerSystem(ServiceBridgeSystem). Here we construct
// it directly and pump a few frames to simulate IWSDK's loop.
const bridge = new ServiceBridgeSystem();

const energyService = manager.resolve(ENERGY_SERVICE_TOKEN);
energyService.subscribe((snapshot) => console.log(`energy: ${snapshot.energy.toFixed(3)}`));

for (let frame = 1; frame <= 3; frame++) {
  bridge.update(1 / 60, (frame * 1000) / 60);
}

// Headset removed → the bridge stops pumping frames and the manager auto-pauses,
// so energy stops decaying.
(world as IWSDKWorldLike<string> & { visibilityState: { value: string } }).visibilityState.value = HIDDEN;
bridge.update(1 / 60, (4 * 1000) / 60);

console.log("Energy decays only while the session is visible.");
