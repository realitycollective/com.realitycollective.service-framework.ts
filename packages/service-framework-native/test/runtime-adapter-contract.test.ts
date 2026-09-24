/**
 * The native adapter runs the same conformance suite as the headless mock and
 * the IWSDK, three.js and Babylon.js adapters, against a fake of the host
 * object the native app installs.
 */
import { NativeRuntimeAdapter } from "../src/index.js";
import { runtimeAdapterContract } from "../../service-framework/test/helpers/runtime-adapter-contract.js";
import { createFakeNativeHost } from "./helpers/fake-native-host.js";

runtimeAdapterContract("NativeRuntimeAdapter", () => {
  const host = createFakeNativeHost();
  const adapter = new NativeRuntimeAdapter({ host });

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => host.pushFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => {
        host.setSession({ state: "focused", blendMode: "opaque" });
      },
      sessionEnd: () => host.setSession({ state: "none", blendMode: null })
    }
  };
});
