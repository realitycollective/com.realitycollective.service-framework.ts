/**
 * A synchronous gzip decoder for the reference fake host. A native app
 * decompresses with its own zlib, which settles at once; the platform's
 * `DecompressionStream` needs real event-loop turns, which the harness's
 * virtual clock does not give. This stands in for the app's zlib, and stays
 * out of the device path: on a device the shell's own `gunzip` is used.
 */
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

interface Huffman {
  counts: number[];
  symbols: number[];
}

function buildHuffman(lengths: number[]): Huffman {
  const counts = new Array<number>(16).fill(0);
  for (const l of lengths) counts[l] = (counts[l] ?? 0) + 1;
  const offsets = new Array<number>(16).fill(0);
  for (let i = 1; i < 16; i += 1) offsets[i] = (offsets[i - 1] ?? 0) + (counts[i - 1] ?? 0);
  const symbols = new Array<number>(lengths.length).fill(0);
  lengths.forEach((l, symbol) => {
    if (l !== 0) symbols[offsets[l]!++] = symbol;
  });
  return { counts, symbols };
}

const FIXED_LITERALS = buildHuffman([...new Array<number>(144).fill(8), ...new Array<number>(112).fill(9), ...new Array<number>(24).fill(7), ...new Array<number>(8).fill(8)]);
const FIXED_DISTANCES = buildHuffman(new Array<number>(30).fill(5));

function inflate(input: Uint8Array, start: number): Uint8Array {
  let pos = start;
  let bitBuf = 0;
  let bitCount = 0;
  const out: number[] = [];
  const bits = (need: number): number => {
    while (bitCount < need) {
      if (pos >= input.length) throw new Error("gunzip: unexpected end of data");
      bitBuf |= input[pos++]! << bitCount;
      bitCount += 8;
    }
    const value = bitBuf & ((1 << need) - 1);
    bitBuf >>>= need;
    bitCount -= need;
    return value;
  };
  const decode = (h: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let len = 1; len < 16; len += 1) {
      code |= bits(1);
      const count = h.counts[len]!;
      if (code - count < first) return h.symbols[index + (code - first)]!;
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw new Error("gunzip: invalid code");
  };
  const codes = (literals: Huffman, distances: Huffman): void => {
    for (;;) {
      const symbol = decode(literals);
      if (symbol < 256) out.push(symbol);
      else if (symbol === 256) return;
      else {
        const s = symbol - 257;
        if (s >= 29) throw new Error("gunzip: invalid length");
        const length = LENGTH_BASE[s]! + bits(LENGTH_EXTRA[s]!);
        const d = decode(distances);
        if (d >= 30) throw new Error("gunzip: invalid distance");
        const distance = DIST_BASE[d]! + bits(DIST_EXTRA[d]!);
        if (distance > out.length) throw new Error("gunzip: distance too far back");
        for (let i = 0; i < length; i += 1) out.push(out[out.length - distance]!);
      }
    }
  };
  let last = 0;
  do {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0;
      bitCount = 0;
      if (pos + 4 > input.length) throw new Error("gunzip: unexpected end of data");
      const len = input[pos]! | (input[pos + 1]! << 8);
      pos += 4;
      if (pos + len > input.length) throw new Error("gunzip: unexpected end of data");
      for (let i = 0; i < len; i += 1) out.push(input[pos + i]!);
      pos += len;
    } else if (type === 1) {
      codes(FIXED_LITERALS, FIXED_DISTANCES);
    } else if (type === 2) {
      const nlen = bits(5) + 257;
      const ndist = bits(5) + 1;
      const ncode = bits(4) + 4;
      const lengths = new Array<number>(19).fill(0);
      for (let i = 0; i < ncode; i += 1) lengths[CODE_LENGTH_ORDER[i]!] = bits(3);
      const lengthCode = buildHuffman(lengths);
      const all: number[] = [];
      while (all.length < nlen + ndist) {
        const symbol = decode(lengthCode);
        if (symbol < 16) all.push(symbol);
        else {
          const previous = symbol === 16 ? all[all.length - 1]! : 0;
          const repeat = symbol === 16 ? 3 + bits(2) : symbol === 17 ? 3 + bits(3) : 11 + bits(7);
          for (let i = 0; i < repeat; i += 1) all.push(previous);
        }
      }
      codes(buildHuffman(all.slice(0, nlen)), buildHuffman(all.slice(nlen)));
    } else {
      throw new Error("gunzip: invalid block type");
    }
  } while (!last);
  return Uint8Array.from(out);
}

/** Decompress gzip bytes, rejecting bytes that are not gzip. */
export function gunzipSync(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) throw new Error("gunzip: not gzip data");
  const flags = bytes[3]!;
  let pos = 10;
  if (flags & 4) pos += 2 + (bytes[pos]! | (bytes[pos + 1]! << 8));
  if (flags & 8) while (bytes[pos++] !== 0) if (pos >= bytes.length) throw new Error("gunzip: bad header");
  if (flags & 16) while (bytes[pos++] !== 0) if (pos >= bytes.length) throw new Error("gunzip: bad header");
  if (flags & 2) pos += 2;
  return inflate(bytes, pos);
}
