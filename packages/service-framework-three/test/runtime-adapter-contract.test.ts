/**
 * The WebXR adapter runs the same conformance suite as the headless mock and
 * the IWSDK adapter. If they ever drift, a service that passes its unit tests
 * stops behaving the same way on a headset.
 */
import { WebXRRuntimeAdapter } from "../src/index.js";
import { runtimeAdapterContract } from "../../service-framework/test/helpers/runtime-adapter-contract.js";
import { createFakeXRHost } from "./helpers/fake-webxr.js";

runtimeAdapterContract("WebXRRuntimeAdapter", () => {
  const host = createFakeXRHost();
  const adapter = new WebXRRuntimeAdapter({ xr: host.manager, xrSystem: host.system });

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => host.startSession(),
      sessionEnd: () => host.endSession()
    }
  };
});
