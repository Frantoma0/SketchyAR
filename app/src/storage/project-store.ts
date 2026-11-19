/** Day 5: native IndexedDB adapter. No network dependency for personal offline-first PWA.
 *  Upgrade path to the tiny open-source `idb` wrapper is optional, not required for schema v1.
 *  Important: make all IDB requests in one synchronous task; await only after tx starts.
 */
import { isGuidePlanV1, type GuidePlanV1 } from '../domain/guide';
import { makeThumbnail } from './thumbnail';

export const PROJECT_DB_NAME = 'sketchyar-projects';
export const PROJECT_DB_VERSION = 1;
export const BACKUP_SCHEMA_VERSION = 1;
export type AssetRole = 'source' | 'processed' | 'thumbnail' | 'guide-step';

export interface ProjectRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  activeAssetId: string;
  lastOpenedAt?: string;
  guide?: GuidePlanV1;
}
export interface AssetRecord {
  id: string;
  projectId: string;
  role: AssetRole;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
  sourceAssetId?: string;
  params?: Record<string, unknown>;
  pipelineVersion?: string;
  modelId?: string;
  hashSha256?: string;
  mirroredPixels?: boolean;
  backend?: string;
}
export interface OverlayPreset {
  id: string;
  projectId: string;
  assetId: string;
  name: string;
  updatedAt: string;
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  opacityPercent: number;
  mirroredOverlay: boolean;
  locked: boolean;
  gridEnabled: boolean;
  gridCount: number;
}
export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}
export interface ProjectWithImage { project: ProjectRecord; source: AssetRecord; preset?: OverlayPreset }
export interface ProjectThumbnail { project: ProjectRecord; thumbnail?: AssetRecord }

let dbPromise: Promise<IDBDatabase> | null = null;
const now = () => new Date().toISOString();
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Грешка в IndexedDB'));
  });
}
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Транзакцията е прекъсната'));
    tx.onerror = () => { /* onabort will reject, after the event bubbles */ };
  });
}

export function openProjectDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB не се поддържа')); return; }
    const request = indexedDB.open(PROJECT_DB_NAME, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction!;
      const projects = db.objectStoreNames.contains('projects') ? tx.objectStore('projects') :
        db.createObjectStore('projects', { keyPath: 'id' });
      if (!projects.indexNames.contains('updatedAt')) projects.createIndex('updatedAt', 'updatedAt');
      const assets = db.objectStoreNames.contains('assets') ? tx.objectStore('assets') :
        db.createObjectStore('assets', { keyPath: 'id' });
      if (!assets.indexNames.contains('projectId')) assets.createIndex('projectId', 'projectId');
      if (!assets.indexNames.contains('byProjectRole')) assets.createIndex('byProjectRole', ['projectId', 'role']);
      const presets = db.objectStoreNames.contains('overlay_presets') ? tx.objectStore('overlay_presets') :
        db.createObjectStore('overlay_presets', { keyPath: 'id' });
      if (!presets.indexNames.contains('projectId')) presets.createIndex('projectId', 'projectId');
      if (!presets.indexNames.contains('assetId')) presets.createIndex('assetId', 'assetId');
      if (!db.objectStoreNames.contains('app_settings')) db.createObjectStore('app_settings', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onblocked = () => { dbPromise = null; reject(new Error('Базата е блокирана от друга отворена страница. Затвори другия таб.')); };
    request.onerror = () => { dbPromise = null; reject(request.error ?? new Error('Базата не се отвори')); };
  });
  return dbPromise;
}

function previewAsset(blob: Blob, id: string, projectId: string, sourceAssetId: string,
                      width: number, height: number, timestamp: string): AssetRecord {
  return { id, projectId, role: 'thumbnail', blob, mimeType: blob.type || 'image/jpeg',
    byteSize: blob.size, width, height, createdAt: timestamp, sourceAssetId,
    params: { thumbnailStyle: 'cover-v2' } };
}
function sourceAsset(file: Blob, id: string, projectId: string, width: number, height: number,
                     timestamp: string): AssetRecord {
  return { id, projectId, role: 'source', blob: file, mimeType: file.type || 'application/octet-stream',
    byteSize: file.size, width, height, createdAt: timestamp, mirroredPixels: false };
}
function defaultPreset(projectId: string, sourceId: string, timestamp: string): OverlayPreset {
  return { id: crypto.randomUUID(), projectId, assetId: sourceId, name: 'Начална позиция',
    updatedAt: timestamp, x: 0, y: 0, scale: 1, rotationDeg: 0, opacityPercent: 50,
    mirroredOverlay: false, locked: false, gridEnabled: false, gridCount: 3 };
}

export async function createImageProject(file: File, image: { width: number; height: number },
                                         thumb: { blob: Blob; width: number; height: number }): Promise<ProjectRecord> {
  const db = await openProjectDB();
  const projectId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const timestamp = now();
  const title = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 100) || 'Нова рисунка';
  const project: ProjectRecord = { id: projectId, title, createdAt: timestamp, updatedAt: timestamp,
    activeAssetId: sourceId };
  const tx = db.transaction(['projects', 'assets', 'overlay_presets'], 'readwrite');
  const done = txDone(tx);
  // One atomic transaction: the project cannot be visible without its image and thumbnail.
  tx.objectStore('projects').add(project);
  tx.objectStore('assets').add(sourceAsset(file, sourceId, projectId, image.width, image.height, timestamp));
  tx.objectStore('assets').add(previewAsset(thumb.blob, crypto.randomUUID(), projectId,
    sourceId, thumb.width, thumb.height, timestamp));
  tx.objectStore('overlay_presets').add(defaultPreset(projectId, sourceId, timestamp));
  await done;
  return project;
}

export async function replaceProjectSource(projectId: string, file: File,
                                            image: { width: number; height: number },
                                            thumb: { blob: Blob; width: number; height: number }): Promise<ProjectRecord> {
  const db = await openProjectDB();
  const previous = await req<ProjectRecord | undefined>(db.transaction('projects', 'readonly').objectStore('projects').get(projectId));
  if (!previous) throw new Error('Проектът не е намерен.');
  const sourceId = crypto.randomUUID();
  const timestamp = now();
  const project = { ...previous, activeAssetId: sourceId, updatedAt: timestamp, guide: undefined };
  const tx = db.transaction(['projects', 'assets', 'overlay_presets'], 'readwrite');
  const done = txDone(tx);
  tx.objectStore('projects').put(project);
  tx.objectStore('assets').add(sourceAsset(file, sourceId, projectId, image.width, image.height, timestamp));
  tx.objectStore('assets').add(previewAsset(thumb.blob, crypto.randomUUID(), projectId, sourceId,
    thumb.width, thumb.height, timestamp));
  tx.objectStore('overlay_presets').add(defaultPreset(projectId, sourceId, timestamp));
  // Intentional: older sources remain until the user explicitly deletes them.
  await done;
  return project;
}

export async function getProjectImage(projectId: string): Promise<ProjectWithImage> {
  const db = await openProjectDB();
  // Separate tiny readonly transactions avoid fragile auto-close timing on iOS WebKit.
  const project = await req<ProjectRecord | undefined>(db.transaction('projects', 'readonly')
    .objectStore('projects').get(projectId));
  if (!project) throw new Error('Проектът не е намерен.');
  const source = await req<AssetRecord | undefined>(db.transaction('assets', 'readonly')
    .objectStore('assets').get(project.activeAssetId));
  if (!source || source.role !== 'source' || source.projectId !== project.id || !source.blob)
    throw new Error('В проекта липсва оригиналната снимка.');
  const options = await req<OverlayPreset[]>(db.transaction('overlay_presets', 'readonly')
    .objectStore('overlay_presets').index('assetId').getAll(source.id));
  return { project, source, preset: options.filter(p => p.projectId === project.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] };
}

export async function listProjectThumbnails(): Promise<ProjectThumbnail[]> {
  const db = await openProjectDB();
  const projects = await req<ProjectRecord[]>(db.transaction('projects', 'readonly')
    .objectStore('projects').getAll());
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (projects.length === 0) return [];
  const tx = db.transaction('assets', 'readonly');
  const done = txDone(tx);
  const index = tx.objectStore('assets').index('byProjectRole');
  const pending = projects.map(async project => {
    const thumbs = await req<AssetRecord[]>(index.getAll(IDBKeyRange.only([project.id, 'thumbnail'])));
    return { project, thumbnail: thumbs.find(asset => asset.sourceAssetId === project.activeAssetId) };
  });
  const cards = await Promise.all(pending);
  await done;
  return cards;
}

/** Upgrade pre-Day-5.1 contain/letterboxed thumbnails to cropped square previews.
 * Only thumbnail blobs are rewritten. Never alter full-resolution originals or presets.
 * Migration is idempotent, sequential to keep iPhone WebKit memory use low, and
 * leaves old previews intact if an image cannot be decoded.
 */
export async function upgradeLegacyThumbnails(): Promise<number> {
  const db = await openProjectDB();
  const projects = await req<ProjectRecord[]>(db.transaction('projects', 'readonly')
    .objectStore('projects').getAll());
  let updated = 0;
  for (const project of projects) {
    const thumbs = await req<AssetRecord[]>(db.transaction('assets', 'readonly')
      .objectStore('assets').index('byProjectRole')
      .getAll(IDBKeyRange.only([project.id, 'thumbnail'])));
    const thumbnail = thumbs.find(asset => asset.sourceAssetId === project.activeAssetId);
    if (!thumbnail || thumbnail.params?.thumbnailStyle === 'cover-v2') continue;
    const source = await req<AssetRecord | undefined>(db.transaction('assets', 'readonly')
      .objectStore('assets').get(project.activeAssetId));
    if (!source || source.role !== 'source' || !source.blob) continue;
    const url = URL.createObjectURL(source.blob);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      const result = await makeThumbnail(image);
      const next: AssetRecord = {
        ...thumbnail, blob: result.blob, mimeType: result.blob.type,
        byteSize: result.blob.size, width: result.width, height: result.height,
        params: { ...(thumbnail.params ?? {}), thumbnailStyle: 'cover-v2' },
      };
      const tx = db.transaction('assets', 'readwrite');
      const done = txDone(tx);
      tx.objectStore('assets').put(next);
      await done;
      updated++;
    } catch (error) {
      // Keep the existing thumbnail on a decode/storage error.
      // The project remains available; another load can retry this migration.
      console.warn('[SketchyAR] thumbnail upgrade skipped', project.id, error);
    } finally {
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    }
  }
  return updated;
}

export async function assertProjectIntegrity(projectId: string): Promise<void> {
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'assets', 'overlay_presets'], 'readonly');
  const done = txDone(tx);
  const [project, assets, presets] = await Promise.all([
    req<ProjectRecord | undefined>(tx.objectStore('projects').get(projectId)),
    req<AssetRecord[]>(tx.objectStore('assets').index('projectId').getAll(projectId)),
    req<OverlayPreset[]>(tx.objectStore('overlay_presets').index('projectId').getAll(projectId)),
  ]);
  await done;
  if (!project) throw new Error('Няма такъв проект');
  const byId = new Map(assets.map(a => [a.id, a]));
  if (byId.get(project.activeAssetId)?.role !== 'source') throw new Error('Невалидна активна снимка');
  for (const a of assets) {
    if (!a.blob || a.byteSize !== a.blob.size || a.projectId !== projectId) throw new Error('Повреден asset');
    if (a.sourceAssetId && !byId.has(a.sourceAssetId)) throw new Error('Невалиден sourceAssetId');
  }
  for (const p of presets) {
    if (p.projectId !== projectId || !byId.has(p.assetId)) throw new Error('Невалиден overlay preset');
  }
  if (project.guide !== undefined) {
    if (!isGuidePlanV1(project.guide)) throw new Error('Невалиден guide план');
    if (byId.get(project.guide.sourceAssetId)?.role !== 'source') throw new Error('Липсващ guide source');
    for (const step of project.guide.steps) {
      const asset = byId.get(step.assetId);
      if (asset?.role !== 'guide-step' || asset.sourceAssetId !== project.guide.sourceAssetId)
        throw new Error('Невалиден guide-step asset');
    }
  }
}

export async function getSourceForStorageTest(projectId: string): Promise<Blob> {
  return (await getProjectImage(projectId)).source.blob;
}

/** Explicit Day 5 integrity drill. Call once before force-close to store SHA-256 baseline,
 * then call again after relaunch; a mismatch is a hard failure. Not run on every boot.
 */
export async function verifyStoredSource(projectId: string): Promise<{
  assetId: string; bytes: number; mimeType: string; sha256: string; result: 'baseline-created' | 'match';
}> {
  const { source } = await getProjectImage(projectId);
  // This explicit stress test temporarily allocates one extra ArrayBuffer; keep off the hot path.
  const bytes = await source.blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const key = `day5-source-sha256:${source.id}`;
  const db = await openProjectDB();
  const setting = await req<AppSetting | undefined>(db.transaction('app_settings', 'readonly')
    .objectStore('app_settings').get(key));
  if (setting) {
    if (setting.value !== hex) throw new Error('SHA-256 mismatch след повторно отваряне!');
    return { assetId: source.id, bytes: source.blob.size, mimeType: source.mimeType, sha256: hex, result: 'match' };
  }
  const tx = db.transaction('app_settings', 'readwrite');
  const done = txDone(tx);
  tx.objectStore('app_settings').put({ key, value: hex, updatedAt: now() } satisfies AppSetting);
  await done;
  return { assetId: source.id, bytes: source.blob.size, mimeType: source.mimeType, sha256: hex, result: 'baseline-created' };
}
