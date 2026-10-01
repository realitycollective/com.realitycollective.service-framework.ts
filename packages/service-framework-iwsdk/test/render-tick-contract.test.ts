/**
 * The IWSDK service bridge runs the shared suite. IWSDK calls a system's
 * `update(delta, time)` with both values in seconds; the driver does the same.
 */
import { ServiceManager } from "@realitycollective/service-framework";
import { IWSDKAdapter, makeServiceBridgeSystem, type CreateSystemLike } from "../src/index.js";
import { renderTickContract } from "../../service-framework/test/helpers/render-tick-contract.js";

const createSystem: CreateSystemLike = () =>
  class {
    public update(_delta: number, _time: number): void {}
  };

renderTickContract("IWSDK service bridge system", () => {
  const world = { visibilityState: { value: "visible" } };
  const manager = new ServiceManager();
  const System = makeServiceBridgeSystem({
    adapter: new IWSDKAdapter(world),
    manager,
    world,
    createSystem,
    visibleState: "visible"
  });
  const system = new System();
  let last: number | undefined;
  return {
    scheduler: manager.scheduler,
    drive: {
      frame(timestampMs) {
        const deltaS = last === undefined ? 1 / 72 : (timestampMs - last) / 1000;
        last = timestampMs;
        system.update(deltaS, timestampMs / 1000);
      }
    }
  };
});
