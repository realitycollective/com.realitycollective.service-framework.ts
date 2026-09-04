/**
 * The Babylon adapter runs the same conformance suite as the headless mock, the
 * IWSDK adapter and the three.js adapter. If they ever drift, a service that
 * passes its unit tests stops behaving the same way on a headset.
 */
import { BabylonRuntimeAdapter } from "../src/index.js";
import { runtimeAdapterContract } from "../../service-framework/test/helpers/runtime-adapter-contract.js";
import { createFakeBabylonXR } from "./helpers/fake-babylon-xr.js";

runtimeAdapterContract("BabylonRuntimeAdapter", () => {
  const host = createFakeBabylonXR();
  const adapter = new BabylonRuntimeAdapter({ xr: host.experience });

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => {
        host.startSession();
      },
      sessionEnd: () => host.endSession()
    }
  };
});
