/**
 * The shared conformance suite for {@link HostIO} implementations.
 *
 * A service reads assets through `HostIO` and never through a global, so the
 * same service runs on the web (`createWebHostIO()`) and on a native host
 * (`createNativeHostIO()` in `@realitycollective/service-framework-native`).
 * That only holds if every implementation behaves the same way, so the checks
 * ship as data, exactly like `runtimeAdapterContractCases()`: each case
 * returns on success and throws a plain `Error` otherwise, and any runner can
 * host them.
 *
 * ```ts
 * for (const contractCase of hostIOContractCases()) {
 *   it(contractCase.name, () => contractCase.run(makeSubject()));
 * }
 * ```
 *
 * The suite uses no `CompressionStream` or `TextEncoder`, so it runs under a
 * bare engine such as Hermes on a device, against the real host.
 */
import { decodeUtf8, fetchJson, type HostIO } from "./host-io.js";

/** How a case puts a resource where the implementation can read it. */
export interface HostIOContractDriver {
  /** Make `bytes` readable at `url`. */
  serve(url: string, bytes: Uint8Array): void;
}

/** One `HostIO` plus the means to serve resources to it. */
export interface HostIOSubject {
  readonly io: HostIO;
  readonly drive: HostIOContractDriver;
}

/** One check a {@link HostIO} implementation must pass. */
export interface HostIOContractCase {
  name: string;
  run(subject: HostIOSubject): Promise<void>;
}

/** `{"parts":2234}` as UTF-8. */
const JSON_BYTES = new Uint8Array([123, 34, 112, 97, 114, 116, 115, 34, 58, 50, 50, 51, 52, 125]);

/** The same bytes gzipped, fixed so the suite needs no compressor of its own. */
const GZIPPED_JSON = new Uint8Array([
  31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 171, 86, 42, 72, 44, 42, 41, 86, 178, 50, 50, 50, 54, 169, 5, 0, 223, 228,
  65, 160, 14, 0, 0, 0
]);

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function sameBytes(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function rejects(run: () => Promise<unknown>): Promise<boolean> {
  try {
    await run();
    return false;
  } catch {
    return true;
  }
}

const CASES: readonly HostIOContractCase[] = [
  {
    name: "fetchBytes returns the bytes served at a URL",
    async run({ io, drive }) {
      drive.serve("contract/plain.json", JSON_BYTES);
      const bytes = await io.fetchBytes("contract/plain.json");
      assert(bytes instanceof Uint8Array, `fetchBytes must resolve to a Uint8Array, got ${Object.prototype.toString.call(bytes)}`);
      assert(sameBytes(bytes, JSON_BYTES), "fetchBytes must return exactly the bytes served at that URL");
    }
  },
  {
    name: "fetchBytes rejects a URL that cannot be read",
    async run({ io }) {
      assert(
        await rejects(() => io.fetchBytes("contract/missing.bin")),
        "fetchBytes must reject when the resource cannot be read, not resolve to empty bytes"
      );
    }
  },
  {
    name: "gunzip restores gzipped bytes",
    async run({ io }) {
      const bytes = await io.gunzip(GZIPPED_JSON);
      assert(bytes instanceof Uint8Array, "gunzip must resolve to a Uint8Array");
      assert(sameBytes(bytes, JSON_BYTES), `gunzip must restore the original bytes, got "${decodeUtf8(bytes)}"`);
    }
  },
  {
    name: "gunzip rejects bytes that are not gzip",
    async run({ io }) {
      assert(await rejects(() => io.gunzip(JSON_BYTES)), "gunzip must reject bytes that are not valid gzip");
    }
  },
  {
    name: "the core helpers read plain and gzipped JSON the same way",
    async run({ io, drive }) {
      drive.serve("contract/plain.json", JSON_BYTES);
      drive.serve("contract/packed.json", GZIPPED_JSON);
      const plain = await fetchJson<{ parts: number }>(io, "contract/plain.json");
      const packed = await fetchJson<{ parts: number }>(io, "contract/packed.json");
      assert(plain.parts === 2234, "fetchJson must read a plain JSON resource");
      assert(packed.parts === 2234, "fetchJson must read a gzipped JSON resource through gunzip");
    }
  }
];

/** The shared `HostIO` conformance suite. Build a fresh subject per case. */
export function hostIOContractCases(): readonly HostIOContractCase[] {
  return CASES;
}
