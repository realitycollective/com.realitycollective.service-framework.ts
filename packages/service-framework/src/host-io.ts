/**
 * Byte-level I/O a service needs from its host, written once so the same
 * service code runs on the web and on a native host.
 *
 * A browser has `fetch` and `DecompressionStream`. A native host that embeds a
 * bare engine, such as Hermes, has neither, and supplies its own through the
 * native binding. Services take a {@link HostIO} and never reach for a global,
 * so they do not care which one they were given.
 *
 * This is transport only. Decoding an image, a sound or a model is the
 * engine's job, and stays with the engine.
 */
export interface HostIO {
  /** Read a resource as bytes. Rejects when it cannot be read. */
  fetchBytes(url: string): Promise<Uint8Array>;
  /** Decompress gzip bytes. Rejects when the bytes are not valid gzip. */
  gunzip(bytes: Uint8Array): Promise<Uint8Array>;
}

/** The globals {@link createWebHostIO} reads, injectable for tests. */
export interface WebHostIOOptions {
  readonly fetch?: (url: string) => Promise<{ readonly ok: boolean; readonly status: number; arrayBuffer(): Promise<ArrayBuffer> }>;
  readonly DecompressionStream?: new (format: "gzip") => {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
  };
}

/**
 * {@link HostIO} over the browser's `fetch` and `DecompressionStream`. The
 * globals are read when a method is called, not when this is created, so a
 * host without them fails only if it actually uses them.
 */
export function createWebHostIO(options: WebHostIOOptions = {}): HostIO {
  return {
    async fetchBytes(url) {
      const fetchFn = options.fetch ?? (globalThis as { fetch?: WebHostIOOptions["fetch"] }).fetch;
      if (!fetchFn) {
        throw new Error("This host has no fetch. Use the HostIO its binding provides.");
      }
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`fetchBytes("${url}") failed with status ${String(response.status)}.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    async gunzip(bytes) {
      const Decompressor =
        options.DecompressionStream ??
        (globalThis as { DecompressionStream?: WebHostIOOptions["DecompressionStream"] }).DecompressionStream;
      if (!Decompressor) {
        throw new Error("This host has no DecompressionStream. Use the HostIO its binding provides.");
      }
      const stream = new Decompressor("gzip");
      const writer = stream.writable.getWriter();
      // Written and read concurrently: a stream with a small buffer stalls a
      // write until its output is read. Awaiting both together means bytes
      // that are not gzip reject once, with neither side left unhandled.
      const written = writer.write(bytes).then(() => writer.close());
      const read = (async () => {
        const chunks: Uint8Array[] = [];
        const reader = stream.readable.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return chunks;
          chunks.push(value);
        }
      })();
      const [, chunks] = await Promise.all([written, read]);
      return concatBytes(chunks);
    }
  };
}

/** Whether these bytes start with the gzip magic number. */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/** Join byte chunks into one array. */
export function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const joined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

/**
 * Decode UTF-8 bytes to a string, with no dependency on `TextDecoder`, which
 * Hermes lacks. A leading byte-order mark is dropped. Each byte of a
 * malformed sequence decodes to U+FFFD.
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let index = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const codes: number[] = [];
  let text = "";

  const continuation = (at: number): number => {
    const byte = bytes[at];
    return byte !== undefined && (byte & 0xc0) === 0x80 ? byte & 0x3f : -1;
  };

  while (index < bytes.length) {
    const lead = bytes[index] as number;
    let code = 0xfffd;
    let size = 1;

    if (lead < 0x80) {
      code = lead;
    } else if (lead >= 0xc2 && lead <= 0xdf) {
      const b1 = continuation(index + 1);
      if (b1 >= 0) {
        code = ((lead & 0x1f) << 6) | b1;
        size = 2;
      }
    } else if (lead >= 0xe0 && lead <= 0xef) {
      const b1 = continuation(index + 1);
      const b2 = continuation(index + 2);
      const value = ((lead & 0x0f) << 12) | (b1 << 6) | b2;
      if (b1 >= 0 && b2 >= 0 && value >= 0x800 && (value < 0xd800 || value > 0xdfff)) {
        code = value;
        size = 3;
      }
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      const b1 = continuation(index + 1);
      const b2 = continuation(index + 2);
      const b3 = continuation(index + 3);
      const value = ((lead & 0x07) << 18) | (b1 << 12) | (b2 << 6) | b3;
      if (b1 >= 0 && b2 >= 0 && b3 >= 0 && value >= 0x10000 && value <= 0x10ffff) {
        code = value;
        size = 4;
      }
    }

    codes.push(code);
    index += size;

    // Flush in slices so String.fromCodePoint never meets a huge argument list.
    if (codes.length >= 4096) {
      text += String.fromCodePoint(...codes);
      codes.length = 0;
    }
  }

  return text + String.fromCodePoint(...codes);
}

/**
 * Read bytes through {@link HostIO}, gunzipping them first when they carry
 * the gzip magic number. Hosts differ on whether they undo a
 * `Content-Encoding: gzip` for you, so this gives the same bytes on both.
 */
export async function fetchMaybeGzipped(io: HostIO, url: string): Promise<Uint8Array> {
  const bytes = await io.fetchBytes(url);
  return isGzip(bytes) ? io.gunzip(bytes) : bytes;
}

/** Read a UTF-8 text resource through {@link HostIO}. */
export async function fetchText(io: HostIO, url: string): Promise<string> {
  return decodeUtf8(await fetchMaybeGzipped(io, url));
}

/** Read a JSON resource through {@link HostIO}. */
export async function fetchJson<T = unknown>(io: HostIO, url: string): Promise<T> {
  return JSON.parse(await fetchText(io, url)) as T;
}
