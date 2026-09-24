import {
  concatBytes,
  createWebHostIO,
  decodeUtf8,
  fetchJson,
  fetchMaybeGzipped,
  fetchText,
  isGzip,
  type HostIO
} from "../src/index.js";

const utf8 = (text: string): Uint8Array => {
  // Encoded by hand through encodeURIComponent, so the test does not lean on
  // TextEncoder either.
  const escaped = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let index = 0; index < escaped.length; index += 1) {
    if (escaped[index] === "%") {
      bytes.push(parseInt(escaped.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(escaped.charCodeAt(index));
    }
  }
  return new Uint8Array(bytes);
};

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function memoryIO(files: Record<string, Uint8Array>): HostIO {
  const web = createWebHostIO();
  return {
    fetchBytes: async (url) => {
      const file = files[url];
      if (!file) throw new Error(`missing ${url}`);
      return file;
    },
    gunzip: (bytes) => web.gunzip(bytes)
  };
}

describe("createWebHostIO", () => {
  it("reads bytes through fetch", async () => {
    const io = createWebHostIO({
      fetch: async () => ({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })
    });

    expect([...(await io.fetchBytes("a.bin"))]).toEqual([1, 2, 3]);
  });

  it("rejects a failed response with its status", async () => {
    const io = createWebHostIO({
      fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) })
    });

    await expect(io.fetchBytes("missing.bin")).rejects.toThrow('fetchBytes("missing.bin") failed with status 404.');
  });

  it("uses the global fetch when none is injected", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(new Uint8Array([9]))) as typeof fetch;
    try {
      expect([...(await createWebHostIO().fetchBytes("x"))]).toEqual([9]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("names the missing global when the host has no fetch or DecompressionStream", async () => {
    const { fetch: originalFetch, DecompressionStream: originalStream } = globalThis;
    delete (globalThis as { fetch?: unknown }).fetch;
    delete (globalThis as { DecompressionStream?: unknown }).DecompressionStream;
    try {
      const io = createWebHostIO();
      await expect(io.fetchBytes("x")).rejects.toThrow("This host has no fetch.");
      await expect(io.gunzip(new Uint8Array())).rejects.toThrow("This host has no DecompressionStream.");
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.DecompressionStream = originalStream;
    }
  });

  it("gunzips with DecompressionStream", async () => {
    const payload = utf8("hello, native host");
    const io = createWebHostIO();

    expect(decodeUtf8(await io.gunzip(await gzip(payload)))).toBe("hello, native host");
  });

  it("gunzips a payload larger than one stream chunk", async () => {
    const payload = new Uint8Array(300_000).map((_, index) => index % 251);

    const out = await createWebHostIO().gunzip(await gzip(payload));

    expect(out.length).toBe(payload.length);
    expect(out.every((value, index) => value === payload[index])).toBe(true);
  });
});

describe("byte helpers", () => {
  it("recognises the gzip magic number", async () => {
    expect(isGzip(await gzip(utf8("x")))).toBe(true);
    expect(isGzip(utf8("{}"))).toBe(false);
    expect(isGzip(new Uint8Array([0x1f]))).toBe(false);
  });

  it("joins chunks in order", () => {
    expect([...concatBytes([new Uint8Array([1]), new Uint8Array(), new Uint8Array([2, 3])])]).toEqual([1, 2, 3]);
  });
});

describe("decodeUtf8", () => {
  it("decodes one to four byte sequences and drops a byte-order mark", () => {
    const text = "aé€\u{1f600}";

    expect(decodeUtf8(utf8(text))).toBe(text);
    expect(decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("ok")]))).toBe("ok");
  });

  it("replaces each byte of a malformed sequence with U+FFFD", () => {
    const cases: Array<[number[], string]> = [
      [[0x80], "�"],
      [[0xc0, 0x80], "��"],
      [[0xc3], "�"],
      [[0xe2, 0x82], "��"],
      [[0xe0, 0x80, 0x80], "���"],
      [[0xed, 0xa0, 0x80], "���"],
      [[0xf0, 0x9f, 0x98], "���"],
      [[0xf4, 0x90, 0x80, 0x80], "����"],
      [[0xf8], "�"]
    ];

    for (const [bytes, expected] of cases) {
      expect(decodeUtf8(new Uint8Array(bytes)), bytes.join(",")).toBe(expected);
    }
  });

  it("decodes long text across its internal flush", () => {
    const text = "é".repeat(10_000);

    expect(decodeUtf8(utf8(text))).toBe(text);
  });
});

describe("fetchText and fetchJson", () => {
  it("read plain and gzipped resources the same way", async () => {
    const json = utf8('{"parts":2234}');
    const io = memoryIO({ "plain.json": json, "packed.json": await gzip(json) });

    expect(await fetchJson(io, "plain.json")).toEqual({ parts: 2234 });
    expect(await fetchJson(io, "packed.json")).toEqual({ parts: 2234 });
    expect(await fetchText(io, "plain.json")).toBe('{"parts":2234}');
    expect([...(await fetchMaybeGzipped(io, "packed.json"))]).toEqual([...json]);
  });

  it("passes on a read failure", async () => {
    await expect(fetchText(memoryIO({}), "gone.txt")).rejects.toThrow("missing gone.txt");
  });
});
