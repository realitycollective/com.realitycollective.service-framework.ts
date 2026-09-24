/**
 * Public entry point of the native binding, with the same kinds of export as
 * the IWSDK, three.js and Babylon.js bindings: the runtime adapter and its
 * options, the structural types of the host object the native app installs,
 * and the native implementation of the core's `HostIO`. Reading the global
 * and deriving capabilities stay internal.
 */
export type { NativeHost, NativeIOHost, NativeSessionInfo } from "./native-host.js";
export { NativeRuntimeAdapter } from "./native-runtime-adapter.js";
export type { NativeRuntimeAdapterOptions } from "./native-runtime-adapter.js";
export { createNativeHostIO } from "./native-host-io.js";
