/**
 * Non-React bootstrap for an IWSDK client: build the adapter, stand up the
 * ServiceManager from the app's profile, and start it. The caller registers
 * {@link makeServiceBridgeSystem} with the IWSDK world to pump per-frame ticks.
 */
import { ServiceManager } from "@realitycollective/service-framework";
import type { ServiceProfile } from "@realitycollective/service-framework";
import { IWSDKAdapter } from "./iwsdk-adapter.js";
import type { IWSDKWorldLike } from "./iwsdk-host.js";

export interface ServiceRuntime {
  readonly manager: ServiceManager;
  readonly adapter: IWSDKAdapter;
}

/**
 * @param world           the IWSDK world (owns the loop / XR session).
 * @param profileFactory  builds the app service graph from the adapter, e.g.
 *                        `(adapter) => createServiceProfile("my-app", [...])`.
 */
export function startServiceRuntime(
  world: IWSDKWorldLike,
  profileFactory: (adapter: IWSDKAdapter) => ServiceProfile,
): ServiceRuntime {
  const adapter = new IWSDKAdapter(world);
  const manager = new ServiceManager();
  manager.initializeProfile(profileFactory(adapter));
  manager.start();
  return { manager, adapter };
}
