/**
 * The native `HostIO` runs the same shared suite as the web one, against a
 * fake of the `io` slice. On device, the native app runs it against the real
 * slice.
 */
import { createWebHostIO } from "@realitycollective/service-framework";
import { createNativeHostIO } from "../src/index.js";
import { hostIOContract } from "../../service-framework/test/helpers/host-io-contract.js";
import { createFakeNativeHost } from "./helpers/fake-native-host.js";

hostIOContract("createNativeHostIO", () => {
  const files = new Map<string, Uint8Array>();
  // The fake app decompresses with the platform's own gzip, as a real one
  // would with its native zlib.
  const platformGunzip = createWebHostIO().gunzip;
  const host = createFakeNativeHost({
    io: {
      fetchBytes: async (url) => {
        const file = files.get(url);
        if (!file) throw new Error(`no such asset: ${url}`);
        return file;
      },
      gunzip: platformGunzip
    }
  });
  return { io: createNativeHostIO(host), drive: { serve: (url, bytes) => files.set(url, bytes) } };
});
