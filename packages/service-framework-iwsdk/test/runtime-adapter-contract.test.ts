/**
 * The IWSDK adapter runs the same conformance suite as the headless mock. If
 * these two ever drift, a service that passes its unit tests stops behaving the
 * same way on a headset.
 */
import { IWSDKAdapter } from "../src/index.js";
import { runtimeAdapterContract } from "../../service-framework/test/helpers/runtime-adapter-contract.js";
import { createHost } from "./helpers/fake-world.js";

runtimeAdapterContract("IWSDKAdapter", () => {
  const host = createHost("push");
  host.enableLaunch();
  host.enableExit(() => host.setSessionQuietly(null));
  const adapter = new IWSDKAdapter(host.world);

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => host.setSession({ inputSources: [] }),
      sessionEnd: () => host.setSession(null),
    },
  };
});
