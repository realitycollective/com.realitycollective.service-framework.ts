import { describe, it, expect } from "vitest";
import { IWSDK_FEATURE_KEYS, toIWSDKFeatures } from "../src/index.js";

describe("toIWSDKFeatures", () => {
  it("names the eight features IWSDK models", () => {
    expect(Object.keys(IWSDK_FEATURE_KEYS).sort()).toEqual([
      "anchors",
      "depth-sensing",
      "hand-tracking",
      "hit-test",
      "layers",
      "mesh-detection",
      "plane-detection",
      "unbounded",
    ]);
  });

  it("maps required features as required and optional ones as optional", () => {
    const { features, unmapped } = toIWSDKFeatures({
      requiredFeatures: ["hand-tracking", "anchors", "hit-test", "plane-detection"],
      optionalFeatures: ["mesh-detection", "depth-sensing", "layers", "unbounded"],
    });

    expect(features).toEqual({
      handTracking: { required: true },
      anchors: { required: true },
      hitTest: { required: true },
      planeDetection: { required: true },
      meshDetection: true,
      depthSensing: true,
      layers: true,
      unbounded: true,
    });
    expect(unmapped).toEqual([]);
  });

  it("reports no features at all for a request that names none", () => {
    expect(toIWSDKFeatures()).toEqual({ unmapped: [] });
    expect(toIWSDKFeatures({ timeoutMs: 500 })).toEqual({ unmapped: [] });
  });

  it("takes required over optional when a feature is in both lists", () => {
    const { features } = toIWSDKFeatures({
      requiredFeatures: ["hand-tracking"],
      optionalFeatures: ["hand-tracking"],
    });

    expect(features).toEqual({ handTracking: { required: true } });
  });

  it("collects the strings IWSDK has no key for, once each, and drops them", () => {
    const { features, unmapped } = toIWSDKFeatures({
      requiredFeatures: ["local-floor", "hand-tracking"],
      optionalFeatures: ["dom-overlay", "local-floor"],
    });

    expect(features).toEqual({ handTracking: { required: true } });
    expect(unmapped).toEqual(["dom-overlay", "local-floor"]);
  });

  it("reports no features when every string was unmappable", () => {
    expect(toIWSDKFeatures({ requiredFeatures: ["bounded-floor"] })).toEqual({
      unmapped: ["bounded-floor"],
    });
  });
});
