import { describe, it, expect } from "vitest";
import { DEFAULT_CAPABILITIES, deriveCapabilities } from "../src/index.js";

describe("deriveCapabilities", () => {
  it("reports the all-false defaults when there is no session", () => {
    expect(deriveCapabilities(null)).toEqual(DEFAULT_CAPABILITIES);
    expect(deriveCapabilities(undefined)).toEqual(DEFAULT_CAPABILITIES);
  });

  it("reports immersive and nothing else for a bare session", () => {
    expect(deriveCapabilities({})).toEqual({
      immersive: true,
      handTracking: false,
      planeDetection: false,
      passthrough: false,
    });
  });

  it("reads hand tracking from the enabled feature", () => {
    expect(deriveCapabilities({ enabledFeatures: ["hand-tracking"] }).handTracking).toBe(true);
  });

  it("reads hand tracking from an input source carrying a hand", () => {
    const session = { inputSources: [{}, { hand: {} }] };

    expect(deriveCapabilities(session).handTracking).toBe(true);
  });

  it("reports no hand tracking when no input source carries a hand", () => {
    expect(deriveCapabilities({ inputSources: [{}, { hand: undefined }] }).handTracking).toBe(false);
  });

  it("reads plane detection from the enabled feature", () => {
    const capabilities = deriveCapabilities({ enabledFeatures: ["plane-detection"] });

    expect(capabilities.planeDetection).toBe(true);
    expect(capabilities.handTracking).toBe(false);
  });

  it("reports passthrough for any blend mode other than opaque", () => {
    expect(deriveCapabilities({ environmentBlendMode: "alpha-blend" }).passthrough).toBe(true);
    expect(deriveCapabilities({ environmentBlendMode: "additive" }).passthrough).toBe(true);
  });

  it("reports no passthrough for an opaque or absent blend mode", () => {
    expect(deriveCapabilities({ environmentBlendMode: "opaque" }).passthrough).toBe(false);
    expect(deriveCapabilities({}).passthrough).toBe(false);
  });

  it("derives every flag from a fully featured session", () => {
    const capabilities = deriveCapabilities({
      enabledFeatures: ["hand-tracking", "plane-detection"],
      environmentBlendMode: "additive",
      inputSources: [{ hand: {} }],
    });

    expect(capabilities).toEqual({
      immersive: true,
      handTracking: true,
      planeDetection: true,
      passthrough: true,
    });
  });
});
