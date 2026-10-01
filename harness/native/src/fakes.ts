/**
 * The reference fake as a drivable test host, for a harness run with no
 * native host (Node in CI, or a shell that installs no test host). It is the
 * same in-memory host this package's own suites prove the adapter against,
 * given the four members a shell's test host adds: `hostStart`, `hostEnd`,
 * `injectFrame` and `serveBytes`.
 */
import { createFakeNativeHost } from "../../../packages/service-framework-native/test/helpers/fake-native-host.js";
import { gunzipSync } from "./gunzip.js";
import type { DrivableHost } from "./kits.js";

/** A fresh reference host: no session, no served files. */
export function referenceTestHost(): DrivableHost {
  const files = new Map<string, Uint8Array>();
  const fake = createFakeNativeHost({
    // The host asks nothing of the harness: sessions start only through hostStart.
    answerRequests: false,
    io: {
      fetchBytes: async (url) => {
        const file = files.get(url);
        if (!file) throw new Error(`no such asset: ${url}`);
        return file;
      },
      // The fake app decompresses with its own synchronous zlib, as a real one would.
      gunzip: async (bytes) => gunzipSync(bytes),
    },
  });
  const host = fake as unknown as DrivableHost;
  host.hostStart = (): void => {
    if (fake.getSessionInfo().state === "focused") return;
    fake.setSession({ state: "ready", blendMode: "opaque" });
    fake.setSession({ state: "focused" });
  };
  host.hostEnd = (): void => {
    if (fake.getSessionInfo().state === "none") return;
    fake.setSession({ state: "stopping" });
    fake.setSession({ state: "none", blendMode: null, extensions: [], systemHandTracking: false });
  };
  host.injectFrame = (timestampMs, deltaSeconds): void => fake.pushFrame(timestampMs, deltaSeconds);
  host.serveBytes = (url, bytes): void => {
    files.set(url, bytes);
  };
  return host;
}
