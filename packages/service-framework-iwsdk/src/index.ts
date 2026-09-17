/**
 * The runtime-adapter contract, the snapshot service base and the headless mock
 * moved into `@realitycollective/service-framework` in 1.0.1: none of them ever
 * touched IWSDK, and every host binding needs them. They are re-exported here
 * unchanged so existing imports from this package keep working.
 */
export {
  DEFAULT_CAPABILITIES,
  DEFAULT_SESSION_TIMEOUT_MS,
  MockRuntimeAdapter,
  RUNTIME_ADAPTER_FACETS,
  SnapshotService,
} from "@realitycollective/service-framework";
export type {
  AdapterCapabilities,
  CapabilitiesListener,
  FrameInfo,
  FrameListener,
  RuntimeAdapter,
  RuntimeAdapterFacet,
  ServiceContext,
  SessionFacet,
  SessionFailureReason,
  SessionMode,
  SessionRequestOptions,
  SessionResult,
  SessionState,
  SessionVisibility,
  SnapshotListener,
  Unsubscribe,
} from "@realitycollective/service-framework";

export type {
  CreateSystemLike,
  IWSDKDepthSensingFlagLike,
  IWSDKFeatureFlagLike,
  IWSDKInputSourceLike,
  IWSDKSessionEventListener,
  IWSDKSessionEventType,
  IWSDKSessionLike,
  IWSDKSignalLike,
  IWSDKSystemConstructor,
  IWSDKSystemLike,
  IWSDKWorldLike,
  IWSDKXRFeatureOptionsLike,
  IWSDKXROptionsLike,
} from "./iwsdk-host.js";

export { IWSDK_FEATURE_KEYS, toIWSDKFeatures } from "./iwsdk-features.js";
export type { IWSDKFeatureMapping } from "./iwsdk-features.js";

export { IWSDKAdapter } from "./iwsdk-adapter.js";

export { makeServiceBridgeSystem } from "./service-bridge-system.js";
export type { ServiceBridgeSystemOptions } from "./service-bridge-system.js";

export { startServiceRuntime } from "./bootstrap.js";
export type { ServiceRuntime } from "./bootstrap.js";
