/** SketchyAR Day 14: deliberately restricted ZIP32 (method STORE=0 only).
 * Supports standards-compliant ZIP files without compression or runtime dependencies.
 * Accepted archive content: manifest.json + assets/<UUID>.<extension>.
 * Restricting to STORE avoids inflate/ZIP64 bomb and platform-specific dependency risks.
 * This is intentionally NOT a general-purpose ZIP extractor.
 */
export const ZIP_LIMITS = Object.freeze({ maxArchiveBytes: 64 * 1024 * 1024,
  maxAssetBytes: 24 * 1024 * 1024, maxTotalAssetBytes: 60 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024, maxEntries: 256 });
export type ZipEntryInput = { name: string; blob: Blob; crc: number };
export type CheckedZipEntry = { name: string; data: Uint8Array; crc: number };
const te = new TextEncoder();
const td = new TextDecoder('utf-8', { fatal: true });
const u16 = (v: DataView, p: number, n: number) => v.setUint16(p, n, true);
const u32 = (v: DataView, p: number, n: number) => v.setUint32(p, n >>> 0, true);
const r16 = (v: DataView, p: number) => v.getUint16(p, true);
const r32 = (v: DataView, p: number) => v.getUint32(p, true);
const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_END = 0x06054b50;
const assetPath = /^assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp|heic|heif|gif|bin)$/;
export function isAllowedZipPath(name: string): boolean {
  return name === 'manifest.json' || assetPath.test(name);
}
// ZIP CRC-32 (IEEE), independent of SHA-256 (the latter validates Blob provenance).
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[i] = c >>> 0;
}
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function makeStoredZip(entries: readonly ZipEntryInput[]): Blob {
  if (!entries.length || entries.length > ZIP_LIMITS.maxEntries) throw new Error('ZIP: invalid entry count');
  const seen = new Set<string>();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let position = 0;
  let total = 0;
  for (const item of entries) {
    if (!isAllowedZipPath(item.name) || seen.has(item.name)) throw new Error('ZIP: unsafe/duplicate path');
    seen.add(item.name);
    if (!Number.isInteger(item.blob.size) || item.blob.size < 0 ||
        item.blob.size > (item.name === 'manifest.json' ? ZIP_LIMITS.maxManifestBytes : ZIP_LIMITS.maxAssetBytes))
      throw new Error('ZIP: entry size limit');
    total += item.blob.size;
    const name = te.encode(item.name);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, SIG_LOCAL); u16(lv, 4, 20); u16(lv, 6, 0); u16(lv, 8, 0);
    u32(lv, 14, item.crc); u32(lv, 18, item.blob.size); u32(lv, 22, item.blob.size);
    u16(lv, 26, name.length); local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    u32(cv, 0, SIG_CENTRAL); u16(cv, 4, 20); u16(cv, 6, 20);
    u32(cv, 16, item.crc); u32(cv, 20, item.blob.size); u32(cv, 24, item.blob.size);
    u16(cv, 28, name.length); u32(cv, 42, position); cd.set(name, 46);
    central.push(cd);
    parts.push(local, item.blob);
    position += local.byteLength + item.blob.size;
  }
  if (!seen.has('manifest.json') || total > ZIP_LIMITS.maxTotalAssetBytes + ZIP_LIMITS.maxManifestBytes)
    throw new Error('ZIP: manifest absent or total size exceeded');
  const dirOffset = position;
  for (const cd of central) { parts.push(Uint8Array.from(cd)); position += cd.length; }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, SIG_END); u16(ev, 8, entries.length); u16(ev, 10, entries.length);
  u32(ev, 12, position - dirOffset); u32(ev, 16, dirOffset);
  parts.push(end);
  if (position + 22 > ZIP_LIMITS.maxArchiveBytes) throw new Error('ZIP: archive too large');
  return new Blob(parts, { type: 'application/zip' });
}

/** Strict central-directory + local-header parsing; never decompresses or writes data.
 * Unsupported ZIP64, DEFLATE, encrypted, multi-disk, comments, and extra fields
 * are rejected rather than guessing at their semantics.
 */
export function parseStoredZip(bytes: Uint8Array): Map<string, CheckedZipEntry> {
  if (bytes.length < 22 || bytes.length > ZIP_LIMITS.maxArchiveBytes)
    throw new Error('ZIP: invalid archive length');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (r32(v, end) !== SIG_END || r16(v, end + 4) !== 0 || r16(v, end + 6) !== 0 ||
      r16(v, end + 8) !== r16(v, end + 10) || r16(v, end + 20) !== 0)
    throw new Error('ZIP: invalid EOCD, ZIP64 or multi-disk archive');
  const count = r16(v, end + 10), dirSize = r32(v, end + 12), dirStart = r32(v, end + 16);
  if (!count || count > ZIP_LIMITS.maxEntries || dirStart + dirSize !== end)
    throw new Error('ZIP: invalid central directory limits');
  const result = new Map<string, CheckedZipEntry>();
  let p = dirStart, total = 0;
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > end || r32(v, p) !== SIG_CENTRAL) throw new Error('ZIP: invalid central entry');
    const flags = r16(v, p + 8), method = r16(v, p + 10);
    const crc = r32(v, p + 16), length = r32(v, p + 20), rawLength = r32(v, p + 24);
    const nameLen = r16(v, p + 28), extra = r16(v, p + 30), comment = r16(v, p + 32);
    const off = r32(v, p + 42);
    if (flags !== 0 || method !== 0 || extra !== 0 || comment !== 0 || r16(v, p + 34) !== 0 ||
        length !== rawLength || length === 0xffffffff || off === 0xffffffff ||
        p + 46 + nameLen > end) throw new Error('ZIP: unsupported or unsafe entry');
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (!isAllowedZipPath(name) || result.has(name) ||
        length > (name === 'manifest.json' ? ZIP_LIMITS.maxManifestBytes : ZIP_LIMITS.maxAssetBytes))
      throw new Error('ZIP: unrecognized path, duplicate or oversized asset');
    total += length;
    if (total > ZIP_LIMITS.maxTotalAssetBytes + ZIP_LIMITS.maxManifestBytes) throw new Error('ZIP: total bytes limit');
    if (off + 30 > dirStart || r32(v, off) !== SIG_LOCAL || r16(v, off + 6) !== flags ||
        r16(v, off + 8) !== method || r32(v, off + 14) !== crc ||
        r32(v, off + 18) !== length || r32(v, off + 22) !== rawLength)
      throw new Error('ZIP: local/central header mismatch');
    const localNameLen = r16(v, off + 26), localExtra = r16(v, off + 28);
    const start = off + 30 + localNameLen + localExtra, stop = start + length;
    if (localExtra !== 0 || localNameLen !== nameLen || stop > dirStart ||
        td.decode(bytes.subarray(off + 30, off + 30 + localNameLen)) !== name)
      throw new Error('ZIP: invalid local entry bounds/name');
    const data = bytes.subarray(start, stop);
    if (crc32(data) !== crc) throw new Error('ZIP: CRC mismatch');
    ranges.push([off, stop]);
    result.set(name, { name, data, crc });
    p += 46 + nameLen;
  }
  if (p !== end || !result.has('manifest.json')) throw new Error('ZIP: central directory mismatch');
  ranges.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, stop] of ranges) {
    if (start !== cursor) throw new Error('ZIP: overlapping or hidden entry');
    cursor = stop;
  }
  if (cursor !== dirStart) throw new Error('ZIP: unexpected ZIP payload');
  return result;
}
