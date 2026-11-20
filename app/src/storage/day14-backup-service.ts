/** SketchyAR Day 14 — local-only, ZIP32 STORE export/verify/atomic restore.
 * No personal image bytes ever leave the device. No schema migration.
 * Real restore is add-only: ANY collision rejects the ENTIRE transaction.
 */
import { isGuidePlanV1 } from '../domain/guide';
import type { BackupManifestV1, BackupAssetV1 } from './backup-contract';
import { inspectBackupInput, manifestRecordFromVerifiedAsset } from './day13-backup-preflight';
import { openProjectDB, type AppSetting, type AssetRecord, type OverlayPreset,
  type ProjectRecord } from './project-store';
import { ZIP_LIMITS, crc32, makeStoredZip, parseStoredZip, type ZipEntryInput } from './day14-zip';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
  'application/octet-stream': 'bin',
};
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const uuid = (x: unknown) => typeof x === 'string' && UUID.test(x);
const text = (x: unknown, max = 400) => typeof x === 'string' && x.length <= max;
const stamp = (x: unknown) => typeof x === 'string' && x.length < 50 && !Number.isNaN(Date.parse(x));
const safeNumber = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const bytesCopy = Uint8Array.from(bytes); // WebCrypto requires a detached-safe BufferSource
  const hash = await crypto.subtle.digest('SHA-256', bytesCopy);
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
};
const read = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error ?? new Error('IndexedDB read failed'));
});
const done = (t: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onabort = () => reject(t.error ?? new Error('IndexedDB transaction aborted'));
});
export interface BackupSnapshot {
  projects: ProjectRecord[]; assets: AssetRecord[]; presets: OverlayPreset[]; settings: AppSetting[];
}
async function snapshot(db: IDBDatabase): Promise<BackupSnapshot> {
  const tx = db.transaction(['projects', 'assets', 'overlay_presets', 'app_settings'], 'readonly');
  const finished = done(tx);
  const projects = tx.objectStore('projects').getAll() as IDBRequest<ProjectRecord[]>;
  const assets = tx.objectStore('assets').getAll() as IDBRequest<AssetRecord[]>;
  const presets = tx.objectStore('overlay_presets').getAll() as IDBRequest<OverlayPreset[]>;
  const settings = tx.objectStore('app_settings').getAll() as IDBRequest<AppSetting[]>;
  const result = await Promise.all([read(projects), read(assets), read(presets), read(settings)]);
  await finished;
  return { projects: result[0], assets: result[1], presets: result[2], settings: result[3] };
}
/** Refuse values that JSON.stringify would silently erase or change (Blob, Date,
 * undefined, non-finite numbers, functions, cycles, deep objects). Backup must
 * round-trip the user's metadata, not silently rewrite it. */
function assertPureJSON(value: unknown, depth = 0, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (depth > 32 || typeof value !== 'object') throw new Error('Неподдържани JSON метаданни');
  if (seen.has(value)) throw new Error('Циклични JSON метаданни');
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
    throw new Error('Неподдържани вложени метаданни');
  seen.add(value);
  const names = Object.keys(value);
  if (names.length > 5000 || Object.getOwnPropertySymbols(value).length ||
      Object.getOwnPropertyNames(value).length !== names.length + (Array.isArray(value) ? 1 : 0) ||
      names.some(k => k === '__proto__' || k === 'constructor' || k === 'prototype'))
    throw new Error('Невалидни JSON ключове');
  for (const key of names) assertPureJSON((value as Record<string, unknown>)[key], depth + 1, seen);
  seen.delete(value);
}
function safeDataJSON(x: unknown, maxBytes: number): Uint8Array {
  assertPureJSON(x);
  const str = JSON.stringify(x);
  if (typeof str !== 'string') throw new Error('Не могат да се архивират не-JSON метаданни');
  const data = encoder.encode(str);
  if (data.byteLength > maxBytes) throw new Error('Прекалено голям manifest');
  return data;
}
function noDuplicates(values: readonly string[], kind: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${kind}`);
}
function validateMetadata(m: unknown): asserts m is BackupManifestV1 {
  if (!isObj(m) || m.format !== 'sketchyar-backup' || m.schemaVersion !== 1 ||
      !text(m.appVersion, 60) || !stamp(m.createdAt) || !isObj(m.integrity) ||
      m.integrity.algorithm !== 'SHA-256' || !Array.isArray(m.projects) ||
      !Array.isArray(m.assets) || !Array.isArray(m.presets) || !Array.isArray(m.settings))
    throw new Error('Неизвестен или невалиден backup manifest v1');
  if (m.projects.length > ZIP_LIMITS.maxEntries || m.assets.length > ZIP_LIMITS.maxEntries - 1 ||
      m.presets.length > 1024 || m.settings.length > 2048)
    throw new Error('Прекалено много записи в manifest');
  const projects = m.projects, assets = m.assets, presets = m.presets, settings = m.settings;
  for (const p of projects) {
    if (!isObj(p) || !uuid(p.id) || !text(p.title, 100) || !p.title ||
        !stamp(p.createdAt) || !stamp(p.updatedAt) || !uuid(p.activeAssetId) ||
        (p.lastOpenedAt !== undefined && !stamp(p.lastOpenedAt)) ||
        (p.guide !== undefined && !isGuidePlanV1(p.guide))) throw new Error('Невалиден project record');
  }
  for (const a of assets) {
    if (!isObj(a) || !uuid(a.id) || !uuid(a.projectId) ||
        !['source','processed','thumbnail','guide-step'].includes(String(a.role)) ||
        typeof a.mimeType !== 'string' || !Object.hasOwn(MIME, a.mimeType) ||
        !Number.isInteger(a.width) || Number(a.width) < 1 || Number(a.width) > 15000 ||
        !Number.isInteger(a.height) || Number(a.height) < 1 || Number(a.height) > 15000 ||
        !Number.isInteger(a.byteSize) || Number(a.byteSize) < 1 || Number(a.byteSize) > ZIP_LIMITS.maxAssetBytes ||
        !stamp(a.createdAt) || !SHA.test(String(a.sha256)) ||
        a.path !== `assets/${a.id}.${MIME[a.mimeType]}` ||
        (a.sourceAssetId !== undefined && !uuid(a.sourceAssetId)) ||
        (a.role !== 'source' && !uuid(a.sourceAssetId)) ||
        (a.role === 'source' && a.sourceAssetId !== undefined) ||
        (a.pipelineVersion !== undefined && !text(a.pipelineVersion, 128)) ||
        (a.modelId !== undefined && !text(a.modelId, 128)) ||
        (a.backend !== undefined && !text(a.backend, 128)) ||
        (a.mirroredPixels !== undefined && typeof a.mirroredPixels !== 'boolean') ||
        (a.params !== undefined && !isObj(a.params)))
      throw new Error('Невалиден asset manifest record');
  }
  for (const p of presets) {
    if (!isObj(p) || !uuid(p.id) || !uuid(p.projectId) || !uuid(p.assetId) ||
        !text(p.name, 200) || !stamp(p.updatedAt) ||
        ![p.x,p.y,p.scale,p.rotationDeg,p.opacityPercent].every(safeNumber) ||
        Number(p.scale) < 0.25 || Number(p.scale) > 2.5 || Number(p.opacityPercent) < 0 || Number(p.opacityPercent) > 100 ||
        typeof p.mirroredOverlay !== 'boolean' || typeof p.locked !== 'boolean' ||
        typeof p.gridEnabled !== 'boolean' || !Number.isInteger(p.gridCount) || p.gridCount !== 3 ||
        (p.coordinateSpace !== undefined && p.coordinateSpace !== 'normalized-v1') ||
        (p.sceneWidth !== undefined && !safeNumber(p.sceneWidth)) ||
        (p.sceneHeight !== undefined && !safeNumber(p.sceneHeight)))
      throw new Error('Невалиден overlay preset');
  }
  for (const s of settings) {
    if (!isObj(s) || !text(s.key, 300) || !s.key || !stamp(s.updatedAt) ||
        !('value' in s)) throw new Error('Невалиден app setting');
  }
  noDuplicates(projects.map(p => p.id), 'projects');
  noDuplicates(assets.map(a => a.id), 'assets');
  noDuplicates(presets.map(p => p.id), 'presets');
  noDuplicates(settings.map(s => s.key), 'settings');
}
export interface BackupBuildResult {
  blob: Blob; manifest: BackupManifestV1; assetBytes: number; filename: string;
}
export async function createBackup(): Promise<BackupBuildResult> {
  const rows = await snapshot(await openProjectDB());
  inspectBackupInput(rows.projects, rows.assets, rows.presets, rows.settings);
  if (!rows.projects.length) throw new Error('Няма проекти за архивиране');
  if (rows.assets.length + 1 > ZIP_LIMITS.maxEntries) throw new Error('Прекалено много assets');
  const entries: ZipEntryInput[] = [];
  const meta: BackupAssetV1[] = [];
  let bytes = 0;
  for (const a of rows.assets) {
    if (!Object.hasOwn(MIME, a.mimeType) || a.byteSize === 0 ||
        a.byteSize > ZIP_LIMITS.maxAssetBytes || (a.blob.type && a.blob.type !== a.mimeType))
      throw new Error(`Неподдържан формат/размер на asset ${a.id}`);
    bytes += a.byteSize;
    if (bytes > ZIP_LIMITS.maxTotalAssetBytes) throw new Error('Лимитът за общите assets е надвишен');
    const raw = new Uint8Array(await a.blob.arrayBuffer());
    const hash = await sha256(raw);
    if (a.hashSha256 && a.hashSha256 !== hash) throw new Error(`Променен source hash: ${a.id}`);
    const path = `assets/${a.id}.${MIME[a.mimeType]}`;
    meta.push(manifestRecordFromVerifiedAsset(a, path, hash));
    entries.push({ name: path, blob: a.blob, crc: crc32(raw) });
  }
  const manifest: BackupManifestV1 = {
    format: 'sketchyar-backup', schemaVersion: 1, appVersion: __APP_VERSION__,
    createdAt: new Date().toISOString(), projects: rows.projects, assets: meta,
    presets: rows.presets, settings: rows.settings, integrity: { algorithm: 'SHA-256' },
  };
  // Ensure export also satisfies the *import* schema before producing any ZIP.
  validateMetadata(manifest);
  const data = safeDataJSON(manifest, ZIP_LIMITS.maxManifestBytes);
  validateMetadata(JSON.parse(decoder.decode(data)));
  const blob = makeStoredZip([{ name: 'manifest.json', blob: new Blob([Uint8Array.from(data)]), crc: crc32(data) }, ...entries]);
  return { blob, manifest, assetBytes: bytes,
    filename: `SketchyAR-backup-${new Date().toISOString().slice(0, 10)}.zip` };
}
export interface VerifiedBackup {
  manifest: BackupManifestV1;
  assets: AssetRecord[];
  archiveSha256: string;
  archiveBytes: number;
  verifiedAt: string;
}
export async function verifyBackup(file: Blob): Promise<VerifiedBackup> {
  if (!file || file.size < 22 || file.size > ZIP_LIMITS.maxArchiveBytes)
    throw new Error('ZIP файлът е празен или твърде голям');
  const data = new Uint8Array(await file.arrayBuffer());
  const files = parseStoredZip(data);
  const manifestFile = files.get('manifest.json');
  if (!manifestFile) throw new Error('Липсва manifest.json');
  const parsed: unknown = JSON.parse(decoder.decode(manifestFile.data));
  assertPureJSON(parsed);
  validateMetadata(parsed);
  const m = parsed;
  if (m.assets.length + 1 !== files.size) throw new Error('ZIP съдържа липсващи или неописани файлове');
  const assets: AssetRecord[] = [];
  let sum = 0;
  for (const a of m.assets) {
    const entry = files.get(a.path);
    if (!entry || a.byteSize !== entry.data.length) throw new Error(`Липсващ/невалиден asset: ${a.id}`);
    sum += a.byteSize;
    if (sum > ZIP_LIMITS.maxTotalAssetBytes) throw new Error('Превишен лимит за assets');
    const hash = await sha256(entry.data);
    if (hash !== a.sha256) throw new Error(`SHA-256 mismatch: ${a.id}`);
    const { path: _path, sha256: _hash, ...rest } = a;
    void _path; void _hash;
    assets.push({ ...rest, blob: new Blob([Uint8Array.from(entry.data)], { type: a.mimeType }), hashSha256: hash });
  }
  const settings = m.settings;
  // Verify day5 baseline settings when present, not just the asset digests.
  const byId = new Map(assets.map(a => [a.id, a]));
  for (const s of settings) {
    if (s.key.startsWith('day5-source-sha256:')) {
      const id = s.key.slice('day5-source-sha256:'.length);
      const asset = byId.get(id);
      if (!asset || asset.role !== 'source' || s.value !== asset.hashSha256)
        throw new Error('Стар или невалиден baseline SHA-256 в settings');
    }
  }
  inspectBackupInput(m.projects, assets, m.presets, settings);
  return { manifest: m, assets, archiveSha256: await sha256(data),
    archiveBytes: data.length, verifiedAt: new Date().toISOString() };
}

/** Atomic add-only restore. No await/Promise microtask between IDB reads and writes:
 * queue writes in the last successful request callback, while tx is still live.
 * Reject all conflicts, including app_settings keys, without changing existing rows.
 */
export async function restoreVerifiedToDB(db: IDBDatabase, verified: VerifiedBackup): Promise<void> {
  const m = verified.manifest;
  inspectBackupInput(m.projects, verified.assets, m.presets, m.settings);
  const tx = db.transaction(['projects', 'assets', 'overlay_presets', 'app_settings'], 'readwrite');
  const finished = done(tx);
  const names = ['projects', 'assets', 'overlay_presets', 'app_settings'] as const;
  const records: Array<readonly (ProjectRecord | AssetRecord | OverlayPreset | AppSetting)[]> =
    [m.projects, verified.assets, m.presets, m.settings];
  const existing: IDBValidKey[][] = [];
  let pending = 4;
  let rejected = false;
  for (let i = 0; i < names.length; i++) {
    const store = tx.objectStore(names[i]);
    const request = store.getAllKeys();
    request.onsuccess = () => {
      if (rejected) return;
      existing[i] = request.result;
      if (--pending !== 0) return;
      for (let j = 0; j < names.length; j++) {
        const key = names[j] === 'app_settings' ? 'key' : 'id';
        const ids = new Set(existing[j].map(String));
        if (records[j].some(r => ids.has(String((r as unknown as Record<string, unknown>)[key])))) {
          rejected = true; tx.abort(); return;
        }
      }
      for (let j = 0; j < names.length; j++) {
        const out = tx.objectStore(names[j]);
        for (const row of records[j]) out.add(row);
      }
    };
    request.onerror = () => { rejected = true; tx.abort(); };
  }
  try { await finished; }
  catch (error) { if (rejected) throw new Error('Restore отказан: ID конфликт или неуспешно прочитане. Няма промени.'); throw error; }
}
export async function restoreBackupToCurrentDB(file: Blob): Promise<VerifiedBackup> {
  // Always verify the actual selected file again; never trust a saved status/button.
  const verified = await verifyBackup(file);
  await restoreVerifiedToDB(await openProjectDB(), verified);
  return verified;
}
const SANDBOX = 'sketchyar-day14-restore-sandbox';
function createTestDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SANDBOX, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const projects = db.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      const assets = db.createObjectStore('assets', { keyPath: 'id' });
      assets.createIndex('projectId', 'projectId'); assets.createIndex('byProjectRole', ['projectId', 'role']);
      const presets = db.createObjectStore('overlay_presets', { keyPath: 'id' });
      presets.createIndex('projectId', 'projectId'); presets.createIndex('assetId', 'assetId');
      db.createObjectStore('app_settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Sandbox IndexedDB error'));
    req.onblocked = () => reject(new Error('Sandbox database is blocked'));
  });
}
function deleteTestDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(SANDBOX);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('Sandbox delete failed'));
    req.onblocked = () => reject(new Error('Sandbox is open elsewhere'));
  });
}
export interface Day14DrillResult {
  status: 'SANDBOX RESTORE PASS'; archiveSha256: string; projects: number;
  assets: number; presets: number; settings: number; hashedBytes: number;
}
export async function runDay14SandboxRestore(file: Blob): Promise<Day14DrillResult> {
  const original = await verifyBackup(file);
  await deleteTestDB(); // ONLY the deliberately isolated Day14 sandbox, never production DB.
  const db = await createTestDB();
  try {
    await restoreVerifiedToDB(db, original);
    const restored = await snapshot(db);
    inspectBackupInput(restored.projects, restored.assets, restored.presets, restored.settings);
    if (restored.projects.length !== original.manifest.projects.length ||
        restored.assets.length !== original.assets.length ||
        restored.presets.length !== original.manifest.presets.length ||
        restored.settings.length !== original.manifest.settings.length)
      throw new Error('Sandbox counts mismatch');
    const want = new Map(original.manifest.assets.map(a => [a.id, a.sha256]));
    let hashedBytes = 0;
    for (const asset of restored.assets) {
      if (await sha256(new Uint8Array(await asset.blob.arrayBuffer())) !== want.get(asset.id))
        throw new Error(`Sandbox hash mismatch ${asset.id}`);
      hashedBytes += asset.byteSize;
    }
    // Compare all non-Blob metadata; includes guide plans and preset transformations.
    const canonical = (items: unknown[], key: string) => JSON.stringify(
      items.slice().sort((a, b) => String((a as Record<string, unknown>)[key])
        .localeCompare(String((b as Record<string, unknown>)[key]))));
    if (canonical(restored.projects, 'id') !== canonical(original.manifest.projects, 'id') ||
        canonical(restored.presets, 'id') !== canonical(original.manifest.presets, 'id') ||
        canonical(restored.settings, 'key') !== canonical(original.manifest.settings, 'key'))
      throw new Error('Sandbox metadata mismatch');
    return { status: 'SANDBOX RESTORE PASS', archiveSha256: original.archiveSha256,
      projects: restored.projects.length, assets: restored.assets.length,
      presets: restored.presets.length, settings: restored.settings.length, hashedBytes };
  } finally {
    db.close();
    await deleteTestDB();
  }
}
