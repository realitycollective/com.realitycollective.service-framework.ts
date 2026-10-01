/**
 * A platform binding only implements the core's contracts. Its public
 * surface is the same kind every binding has: the adapter and the native
 * implementation of `HostIO`, plus types. Helpers stay internal.
 */
import * as binding from "../src/index.js";

describe("service-framework-native public surface", () => {
  it("exports only the adapter and the HostIO implementation at runtime", () => {
    expect(Object.keys(binding).sort()).toEqual(["NativeRuntimeAdapter", "createNativeHostIO"]);
  });
});
