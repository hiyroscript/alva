// A small, dependency-free ZIP writer and reader for the itch.io release.
//
// Writing: the files given, in the order given, each deflated when that
// makes it smaller and stored otherwise, under one fixed timestamp
// (1980-01-01, the format's epoch) and no directory entries, so the same
// files always make the same archive (with the same zlib). No ZIP64: the
// release is far below its 65,535 entries and 4 GB.
//
// Reading: every entry back from the central directory, inflated and its
// CRC-32 checked, so the validation can compare the archive with the
// release folder byte for byte.

import { deflateRawSync, inflateRawSync, constants } from 'node:zlib';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const STORED = 0;
const DEFLATED = 8;
const UTF8_NAMES = 0x0800;
const DOS_TIME = 0;                      // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01

// `entries`: [{ name, data }], `name` a relative path with forward slashes.
export function writeZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const deflated = deflateRawSync(data, { level: constants.Z_BEST_COMPRESSION });
    const method = deflated.length < data.length ? DEFLATED : STORED;
    const body = method === DEFLATED ? deflated : data;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_NAMES, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    // Extra field, comment, disk, internal and external attributes: none.
    header.writeUInt32LE(offset, 42);
    central.push(header, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

// Every entry of a ZIP: [{ name, data, method }], in the central
// directory's order. Throws on anything this writer would not produce
// intact (a bad signature, a size or CRC that does not match).
export function readZip(zip) {
  const endAt = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('not a ZIP: no end of central directory');
  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== 0x02014b50) throw new Error(`entry ${i}: bad central directory header`);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const usize = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const skip = zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    at += 46 + nameLength + skip;

    if (zip.readUInt32LE(localAt) !== 0x04034b50) throw new Error(`${name}: bad local header`);
    const start = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const body = zip.subarray(start, start + size);
    const data = method === DEFLATED ? inflateRawSync(body) : method === STORED ? body : null;
    if (!data) throw new Error(`${name}: unsupported method ${method}`);
    if (data.length !== usize) throw new Error(`${name}: ${data.length} bytes, expected ${usize}`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC-32 mismatch`);
    entries.push({ name, data, method });
  }
  return entries;
}
