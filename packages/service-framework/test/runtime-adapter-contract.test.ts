import { describe, it, expect } from "vitest";
import { MockRuntimeAdapter, RUNTIME_ADAPTER_FACETS } from "../src/index.js";
import { runtimeAdapterContract } from "./helpers/runtime-adapter-contract.js";

runtimeAdapterContract("MockRuntimeAdapter", () => {
  const adapter = new MockRuntimeAdapter();

  return {
    adapter,
    drive: {
      frame: (timestamp, delta) => adapter.emitFrame(timestamp, delta),
      capabilities: (partial) => adapter.setCapabilities(partial),
      sessionStart: () => adapter.simulateSessionStart(),
      sessionEnd: () => adapter.simulateSessionEnd(),
    },
  };
});

describe("RUNTIME_ADAPTER_FACETS", () => {
  it("names at least one facet", () => {
    expect(RUNTIME_ADAPTER_FACETS.length).toBeGreaterThan(0);
  });

  it("is implemented in full by MockRuntimeAdapter", () => {
    const adapter = new MockRuntimeAdapter();

    for (const facet of RUNTIME_ADAPTER_FACETS) {
      expect(adapter[facet]).toBeDefined();
    }
  });
});
