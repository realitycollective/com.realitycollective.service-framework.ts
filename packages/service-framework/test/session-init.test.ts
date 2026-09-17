import { describe, it, expect } from "vitest";
import { mergeSessionInit } from "../src/index.js";

describe("mergeSessionInit", () => {
  it("returns the host init untouched when the request names no features", () => {
    const init = { requiredFeatures: ["local-floor"] };

    expect(mergeSessionInit(init)).toBe(init);
    expect(mergeSessionInit(init, {})).toBe(init);
    expect(mergeSessionInit(init, { timeoutMs: 500 })).toBe(init);
    expect(mergeSessionInit(init, { requiredFeatures: [], optionalFeatures: [] })).toBe(init);
    expect(mergeSessionInit(undefined)).toBeUndefined();
  });

  it("appends the request's features to the host's, host entries first", () => {
    const merged = mergeSessionInit(
      { requiredFeatures: ["local-floor"], optionalFeatures: ["layers"] },
      { requiredFeatures: ["hand-tracking"], optionalFeatures: ["anchors"] },
    );

    expect(merged).toEqual({
      requiredFeatures: ["local-floor", "hand-tracking"],
      optionalFeatures: ["layers", "anchors"],
    });
  });

  it("keeps every other member of the host init", () => {
    const merged = mergeSessionInit(
      { domOverlay: { root: "#app" } },
      { requiredFeatures: ["hit-test"] },
    );

    expect(merged).toEqual({ domOverlay: { root: "#app" }, requiredFeatures: ["hit-test"] });
  });

  it("names a feature once when host and request both ask for it", () => {
    const merged = mergeSessionInit(
      { requiredFeatures: ["hand-tracking"] },
      { requiredFeatures: ["hand-tracking", "anchors"] },
    );

    expect(merged).toEqual({ requiredFeatures: ["hand-tracking", "anchors"] });
  });

  it("touches only the list the request named", () => {
    const merged = mergeSessionInit(
      { requiredFeatures: ["local-floor"] },
      { optionalFeatures: ["layers"] },
    );

    expect(merged).toEqual({ requiredFeatures: ["local-floor"], optionalFeatures: ["layers"] });
  });

  it("builds an init where the host supplied none", () => {
    expect(mergeSessionInit(undefined, { optionalFeatures: ["layers"] })).toEqual({
      optionalFeatures: ["layers"],
    });
    expect(mergeSessionInit(null, { requiredFeatures: ["anchors"] })).toEqual({
      requiredFeatures: ["anchors"],
    });
    expect(mergeSessionInit("not an init", { requiredFeatures: ["anchors"] })).toEqual({
      requiredFeatures: ["anchors"],
    });
  });

  it("ignores a host feature list that is not an array", () => {
    const merged = mergeSessionInit(
      { requiredFeatures: "hand-tracking" },
      { requiredFeatures: ["anchors"] },
    );

    expect(merged).toEqual({ requiredFeatures: ["anchors"] });
  });
});
