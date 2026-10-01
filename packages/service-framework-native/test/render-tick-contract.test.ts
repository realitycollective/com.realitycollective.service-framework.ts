/**
 * The native runtime adapter runs the shared suite. The native app hands each
 * frame a timestamp in milliseconds and a delta in seconds; the driver does
 * the same through the fake host.
 */
import { ManualScheduler } from "@realitycollective/service-framework";
import { NativeRuntimeAdapter } from "../src/index.js";
import { renderTickContract } from "../../service-framework/test/helpers/render-tick-contract.js";
import { createFakeNativeHost } from "./helpers/fake-native-host.js";

renderTickContract("NativeRuntimeAdapter", () => {
  const scheduler = new ManualScheduler();
  // A focused session: services tick only while focused, as on IWSDK.
  const host = createFakeNativeHost({ info: { state: "focused", blendMode: "opaque" } });
  new NativeRuntimeAdapter({ host, scheduler });
  let last: number | undefined;
  return {
    scheduler,
    drive: {
      frame(timestampMs) {
        const deltaS = last === undefined ? 1 / 72 : (timestampMs - last) / 1000;
        last = timestampMs;
        host.pushFrame(timestampMs, deltaS);
      }
    }
  };
});
