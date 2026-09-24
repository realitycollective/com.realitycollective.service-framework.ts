/**
 * The shipped `HostIO` suite: the web implementation passes it, and every
 * case fails for an implementation built to break the promise it checks.
 */
import { createWebHostIO, hostIOContractCases, type HostIO, type HostIOSubject } from "../src/index.js";
import { hostIOContract } from "./helpers/host-io-contract.js";

function webSubject(): HostIOSubject {
  const files = new Map<string, Uint8Array>();
  const io = createWebHostIO({
    fetch: async (url) => {
      const file = files.get(url);
      return {
        ok: file !== undefined,
        status: file ? 200 : 404,
        arrayBuffer: async () => new Uint8Array(file ?? []).buffer
      };
    }
  });
  return { io, drive: { serve: (url, bytes) => files.set(url, bytes) } };
}

hostIOContract("createWebHostIO", webSubject);

function broken(patch: Partial<HostIO>): HostIOSubject {
  const subject = webSubject();
  return { io: { ...subject.io, ...patch }, drive: subject.drive };
}

async function runCase(name: string, subject: HostIOSubject): Promise<void> {
  const contractCase = hostIOContractCases().find((entry) => entry.name === name);
  if (!contractCase) throw new Error(`no contract case named "${name}"`);
  await contractCase.run(subject);
}

describe("hostIOContractCases catches a broken HostIO", () => {
  it("names every case", () => {
    expect(hostIOContractCases().map((entry) => entry.name)).toHaveLength(5);
  });

  it("rejects fetchBytes that resolves to something other than a Uint8Array", async () => {
    await expect(
      runCase("fetchBytes returns the bytes served at a URL", broken({ fetchBytes: async () => [1] as unknown as Uint8Array }))
    ).rejects.toThrow(/must resolve to a Uint8Array/);
  });

  it("rejects fetchBytes that returns the wrong bytes", async () => {
    await expect(
      runCase("fetchBytes returns the bytes served at a URL", broken({ fetchBytes: async () => new Uint8Array([1]) }))
    ).rejects.toThrow(/exactly the bytes served/);
  });

  it("rejects fetchBytes that resolves for a missing resource", async () => {
    await expect(
      runCase("fetchBytes rejects a URL that cannot be read", broken({ fetchBytes: async () => new Uint8Array() }))
    ).rejects.toThrow(/must reject when the resource cannot be read/);
  });

  it("rejects gunzip that resolves to something other than a Uint8Array", async () => {
    await expect(
      runCase("gunzip restores gzipped bytes", broken({ gunzip: async () => "x" as unknown as Uint8Array }))
    ).rejects.toThrow(/gunzip must resolve to a Uint8Array/);
  });

  it("rejects gunzip that returns the wrong bytes", async () => {
    await expect(
      runCase("gunzip restores gzipped bytes", broken({ gunzip: async () => new Uint8Array([123, 125]) }))
    ).rejects.toThrow(/must restore the original bytes, got "\{\}"/);
  });

  it("rejects gunzip that accepts bytes which are not gzip", async () => {
    await expect(
      runCase("gunzip rejects bytes that are not gzip", broken({ gunzip: async (bytes) => bytes }))
    ).rejects.toThrow(/must reject bytes that are not valid gzip/);
  });

  it("rejects an implementation the core helpers cannot read JSON through", async () => {
    const plainOnly = broken({ gunzip: async () => new Uint8Array([123, 125]) });
    await expect(runCase("the core helpers read plain and gzipped JSON the same way", plainOnly)).rejects.toThrow(
      /gzipped JSON resource/
    );
    const garbled = broken({ fetchBytes: async () => new Uint8Array([123, 125]) });
    await expect(runCase("the core helpers read plain and gzipped JSON the same way", garbled)).rejects.toThrow(
      /plain JSON resource/
    );
  });

  it("fails loudly when asked for a case that does not exist", async () => {
    await expect(runCase("no such case", webSubject())).rejects.toThrow(/no contract case named/);
  });
});
