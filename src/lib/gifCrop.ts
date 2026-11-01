import type { CropRect } from "../types";

// Crops an animated GIF without flattening it: a canvas would keep only the first frame.
// Each frame is trimmed to the crop and re-compressed with its own colors, timing, and
// disposal method, so what's left of the picture stays identical to the original, pixel for pixel.

const IMAGE_SEPARATOR = 0x2c;
const EXTENSION = 0x21;
const TRAILER = 0x3b;
const GRAPHIC_CONTROL = 0xf9;
const PLAIN_TEXT = 0x01;
const APPLICATION = 0xff;
/** The extensions that make a GIF loop. */
const LOOP_EXTENSIONS = ["NETSCAPE2.0", "ANIMEXTS1.0"];

const MAX_LZW_CODES = 4096;
const MAX_SUB_BLOCK = 255;
/** No real GIF frame is this big, and a corrupt size could otherwise ask for gigabytes of memory. */
const MAX_FRAME_PIXELS = 100_000_000;
/** Longest stretch of work before letting the page respond again. */
const YIELD_AFTER_MS = 40;

function unreadable(): never {
  throw new Error("That GIF couldn't be read.");
}

const readUint16 = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const uint16Bytes = (value: number) => [value & 0xff, value >> 8];

/** Where the run of sub-blocks starting at `at` ends, past its terminator. Stops at the end of a truncated file. */
function skipSubBlocks(src: Uint8Array, at: number): number {
  let pos = at;
  while (pos < src.length) {
    const size = src[pos];
    pos += size + 1;
    if (size === 0) return pos;
  }
  return src.length;
}

function joinSubBlocks(src: Uint8Array, at: number, end: number): Uint8Array {
  const joined = new Uint8Array(end - at);
  let length = 0;
  let pos = at;
  while (pos < end && src[pos] !== 0) {
    const size = src[pos];
    const block = src.subarray(pos + 1, Math.min(pos + 1 + size, end));
    joined.set(block, length);
    length += block.length;
    pos += size + 1;
  }
  return joined.subarray(0, length);
}

function splitIntoSubBlocks(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const blockCount = Math.ceil(data.length / MAX_SUB_BLOCK);
  const out = new Uint8Array(data.length + blockCount + 1);
  let pos = 0;
  for (let at = 0; at < data.length; at += MAX_SUB_BLOCK) {
    const block = data.subarray(at, at + MAX_SUB_BLOCK);
    out[pos++] = block.length;
    out.set(block, pos);
    pos += block.length;
  }
  out[pos] = 0;
  return out;
}

/** Decompresses a frame to one palette index per pixel. Pixels a truncated file never reached stay `fill`. */
function decodeLzw(data: Uint8Array, minCodeSize: number, pixelCount: number, fill: number): Uint8Array {
  const out = new Uint8Array(pixelCount).fill(fill);
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const prefix = new Uint16Array(MAX_LZW_CODES);
  const suffix = new Uint8Array(MAX_LZW_CODES);
  const stack = new Uint8Array(MAX_LZW_CODES + 1);

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let previous = -1;
  let firstByte = 0;
  let bits = 0;
  let bitCount = 0;
  let pos = 0;
  let written = 0;

  while (written < pixelCount) {
    while (bitCount < codeSize) {
      if (pos >= data.length) return out;
      bits |= data[pos++] << bitCount;
      bitCount += 8;
    }
    const code = bits & ((1 << codeSize) - 1);
    bits >>>= codeSize;
    bitCount -= codeSize;

    if (code === clearCode) {
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
      previous = -1;
      continue;
    }
    if (code === endCode) return out;

    if (previous === -1) {
      if (code > clearCode) return out;
      out[written++] = code;
      previous = code;
      firstByte = code;
      continue;
    }
    if (code > nextCode) return out;

    let stackSize = 0;
    let current = code;
    if (code === nextCode) {
      stack[stackSize++] = firstByte;
      current = previous;
    }
    while (current >= clearCode) {
      stack[stackSize++] = suffix[current];
      current = prefix[current];
    }
    firstByte = current;
    stack[stackSize++] = firstByte;

    if (nextCode < MAX_LZW_CODES) {
      prefix[nextCode] = previous;
      suffix[nextCode] = firstByte;
      nextCode++;
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
    }
    previous = code;
    while (stackSize > 0 && written < pixelCount) out[written++] = stack[--stackSize];
  }
  return out;
}

function encodeLzw(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  // 12 bits is the most any code takes, and the extra room covers the clear and end codes.
  const out = new Uint8Array(Math.ceil(indices.length * 1.5) + 64);
  const table = new Map<number, number>();
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let bits = 0;
  let bitCount = 0;
  let length = 0;

  const emit = (code: number) => {
    bits |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      out[length++] = bits & 0xff;
      bits >>>= 8;
      bitCount -= 8;
    }
  };

  emit(clearCode);
  let current = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const pixel = indices[i];
    const key = (current << 8) | pixel;
    const known = table.get(key);
    if (known !== undefined) {
      current = known;
      continue;
    }
    emit(current);
    if (nextCode < MAX_LZW_CODES) {
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
      table.set(key, nextCode++);
    } else {
      emit(clearCode);
      table.clear();
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }
    current = pixel;
  }
  emit(current);
  emit(endCode);
  if (bitCount > 0) out[length++] = bits & 0xff;
  return out.subarray(0, length);
}

/** For each row of an interlaced frame, which row of its data holds it. */
function interlacedRows(height: number): Uint32Array {
  const rows = new Uint32Array(height);
  let dataRow = 0;
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
    for (let row = start; row < height; row += step) rows[row] = dataRow++;
  }
  return rows;
}

/**
 * A frame the crop doesn't touch still has to take up its time. This one draws a single
 * transparent pixel, and leaves that pixel's spot alone afterwards.
 */
function blankFrame(delayLow: number, delayHigh: number): Uint8Array<ArrayBuffer> {
  const disposal = 1;
  return new Uint8Array([
    EXTENSION, GRAPHIC_CONTROL, 4, (disposal << 2) | 1, delayLow, delayHigh, 0, 0,
    IMAGE_SEPARATOR, 0, 0, 0, 0, 1, 0, 1, 0, 0x80,
    0, 0, 0, 0, 0, 0,
    // Minimum code size 2, then the codes for "clear, pixel 0, end".
    2, 2, 0x44, 0x01, 0,
  ]);
}

export async function cropGif(src: Uint8Array, crop: CropRect): Promise<Uint8Array<ArrayBuffer>> {
  if (src.length < 13 || src[0] !== 0x47 || src[1] !== 0x49 || src[2] !== 0x46) unreadable();
  const screenWidth = readUint16(src, 6);
  const screenHeight = readUint16(src, 8);
  const screenFlags = src[10];

  const cropX = Math.min(crop.x, screenWidth - 1);
  const cropY = Math.min(crop.y, screenHeight - 1);
  const cropWidth = Math.min(crop.width, screenWidth - cropX);
  const cropHeight = Math.min(crop.height, screenHeight - cropY);
  if (cropWidth < 1 || cropHeight < 1) unreadable();

  let pos = 13;
  const parts: Uint8Array<ArrayBuffer>[] = [
    // Version 89a, whatever the original was: blank frames need its transparency.
    new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...uint16Bytes(cropWidth), ...uint16Bytes(cropHeight), screenFlags, src[11], 0]),
  ];
  if (screenFlags & 0x80) {
    const tableSize = 3 << ((screenFlags & 7) + 1);
    parts.push(src.slice(pos, pos + tableSize));
    pos += tableSize;
  }

  let control: Uint8Array | null = null;
  let frameCount = 0;
  let lastYield = performance.now();

  while (pos < src.length) {
    const marker = src[pos++];
    if (marker === TRAILER) break;

    if (marker === EXTENSION) {
      const label = src[pos++];
      const end = skipSubBlocks(src, pos);
      if (label === GRAPHIC_CONTROL && end - pos === 6) {
        control = src.subarray(pos - 2, end);
      } else if (label === APPLICATION && src[pos] === 11) {
        const name = String.fromCharCode(...src.subarray(pos + 1, pos + 12));
        if (LOOP_EXTENSIONS.includes(name)) parts.push(src.slice(pos - 2, end));
      } else if (label === PLAIN_TEXT) {
        // Its control block applied to the text, which is being dropped, not to the next frame.
        control = null;
      }
      pos = end;
      continue;
    }

    if (marker !== IMAGE_SEPARATOR || pos + 9 > src.length) break;
    const frameX = readUint16(src, pos);
    const frameY = readUint16(src, pos + 2);
    const frameWidth = readUint16(src, pos + 4);
    const frameHeight = readUint16(src, pos + 6);
    const frameFlags = src[pos + 8];
    pos += 9;

    let colorTable: Uint8Array<ArrayBuffer> | null = null;
    if (frameFlags & 0x80) {
      const tableSize = 3 << ((frameFlags & 7) + 1);
      colorTable = src.slice(pos, pos + tableSize);
      pos += tableSize;
    }
    const minCodeSize = src[pos++];
    const dataEnd = skipSubBlocks(src, pos);

    const left = Math.max(frameX, cropX);
    const top = Math.max(frameY, cropY);
    const width = Math.min(frameX + frameWidth, cropX + cropWidth) - left;
    const height = Math.min(frameY + frameHeight, cropY + cropHeight) - top;

    if (width <= 0 || height <= 0) {
      parts.push(blankFrame(control?.[4] ?? 0, control?.[5] ?? 0));
    } else {
      if (minCodeSize < 1 || minCodeSize > 8 || frameWidth * frameHeight > MAX_FRAME_PIXELS) unreadable();
      if (control) parts.push(control.slice());
      const hasTransparency = control !== null && (control[3] & 1) === 1;
      const pixels = decodeLzw(joinSubBlocks(src, pos, dataEnd), minCodeSize, frameWidth * frameHeight, hasTransparency ? control![6] : 0);

      const rows = frameFlags & 0x40 ? interlacedRows(frameHeight) : null;
      const cropped = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) {
        const row = y + top - frameY;
        const start = (rows ? rows[row] : row) * frameWidth + left - frameX;
        cropped.set(pixels.subarray(start, start + width), y * width);
      }

      parts.push(
        new Uint8Array([
          IMAGE_SEPARATOR,
          ...uint16Bytes(left - cropX),
          ...uint16Bytes(top - cropY),
          ...uint16Bytes(width),
          ...uint16Bytes(height),
          // The same flags, without interlacing: the rows above are now in display order.
          frameFlags & ~0x40,
        ]),
      );
      if (colorTable) parts.push(colorTable);
      parts.push(new Uint8Array([minCodeSize]), splitIntoSubBlocks(encodeLzw(cropped, minCodeSize)));
    }

    control = null;
    frameCount++;
    pos = dataEnd;

    if (performance.now() - lastYield > YIELD_AFTER_MS) {
      await new Promise((resolve) => setTimeout(resolve));
      lastYield = performance.now();
    }
  }

  if (frameCount === 0) unreadable();
  parts.push(new Uint8Array([TRAILER]));

  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let length = 0;
  for (const part of parts) {
    result.set(part, length);
    length += part.length;
  }
  return result;
}
