import type { HostIO } from "@realitycollective/service-framework";
import { getNativeHost, type NativeHost } from "./native-host.js";

/**
 * {@link HostIO} over the native app's `io` slice. Code written against
 * `HostIO`, such as a client's asset loader, runs unchanged on the web with
 * `createWebHostIO()` and on a native host with this.
 */
export function createNativeHostIO(host?: NativeHost): HostIO {
  const io = getNativeHost(host).io;

  if (!io) {
    throw new Error("The native host has no io slice. Install __rcHost.io with fetchBytes and gunzip to read assets.");
  }

  return {
    fetchBytes: (url) => io.fetchBytes(url),
    gunzip: (bytes) => io.gunzip(bytes)
  };
}
