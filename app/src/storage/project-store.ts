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
  /** Day 23: optional, source-owned derivative selected for Camera. Source stays active. */
  selectedProcessedAssetId?: string;
  /** Last APPLIED style, committed together with Camera selection by Draw.
   * Old v0.23.1-v0.24.0 records may contain a preview-only draft here;
   * selectedProcessedAssetId takes precedence until Draw reconciles the two. */
  editorStyle?: 'sketch' | 'manga' | 'comic' | null;
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
  /** Day 6: optional for backward compatibility with older pixel-based presets. */
  coordinateSpace?: 'normalized-v1';
  sceneWidth?: number;
  sceneHeight?: number;
}
/** The camera transform in normalized scene coordinates (not CSS pixels). */
export type OverlaySnapshot = Pick<OverlayPreset, 'x' | 'y' | 'scale' | 'rotationDeg' |
  'opacityPercent' | 'mirroredOverlay' | 'locked' | 'gridEnabled'> & {
  sceneWidth: number;
  sceneHeight: number;
};

/** Atomic Day 6 save. Verify the expected current source inside the write transaction
 * to stop an old gesture from overwriting a newer photo's preset.
 * Keep one stable preset row per asset instead of appending on every slider event.
 */
export async function saveProjectOverlay(
  projectId: string, expectedAssetId: string, snapshot: OverlaySnapshot,
): Promise<OverlayPreset> {
  for (const value of [snapshot.x, snapshot.y, snapshot.scale, snapshot.rotationDeg,
    snapshot.opacityPercent, snapshot.sceneWidth, snapshot.sceneHeight]) {
    if (!Number.isFinite(value)) throw new Error('Невалидни координати за запис');
  }
  if (snapshot.sceneWidth <= 0 || snapshot.sceneHeight <= 0 || snapshot.scale < 0.25 ||
      snapshot.scale > 2.5 || snapshot.opacityPercent < 0 || snapshot.opacityPercent > 100)
    throw new Error('Стойности извън допустимите граници');
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'overlay_presets'], 'readwrite');
  const finished = txDone(tx);
  const projects = tx.objectStore('projects');
  const presets = tx.objectStore('overlay_presets');
  let updated: OverlayPreset | null = null;
  let validationError: Error | null = null;
  const request = projects.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  request.onsuccess = () => {
    const project = request.result;
    if (!project || project.activeAssetId !== expectedAssetId) {
      validationError = new Error('Снимката е сменена; остарелият запис е отказан.');
      tx.abort();
      return;
    }
    const candidates = presets.index('assetId').getAll(expectedAssetId) as IDBRequest<OverlayPreset[]>;
    candidates.onsuccess = () => {
      const existing = candidates.result.find(p => p.projectId === projectId);
      const timestamp = now();
      updated = {
        ...(existing ?? defaultPreset(projectId, expectedAssetId, timestamp)),
        ...snapshot,
        projectId,
        assetId: expectedAssetId,
        coordinateSpace: 'normalized-v1',
        gridCount: 3,
        updatedAt: timestamp,
      };
      presets.put(updated);
      projects.put({ ...project, updatedAt: timestamp });
    };
  };
  try { await finished; }
  catch (error) { if (validationError) throw validationError; throw error; }
  if (!updated) throw new Error('Preset не беше записан');
  return updated;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}
export interface ProjectWithImage { project: ProjectRecord; source: AssetRecord; preset?: OverlayPreset }
/** Home reflects the bitmap last APPLIED with Draw, not unsaved editor choices.
 * `displayAsset` is that exact processed PNG, never a duplicated thumbnail.
 * The ordinary source thumbnail remains the fallback.
 */
export interface ProjectThumbnail {
  project: ProjectRecord;
  thumbnail?: AssetRecord;
  displayAsset?: AssetRecord;
  displayKind: 'original' | 'sketch';
}

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
  delete project.selectedProcessedAssetId; // old derivative must not attach to the replacement source
  delete project.editorStyle; // replacing the original also resets remembered editor mode
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

/** Day 23: validate the selected derivative on EVERY read. Legacy projects have no selection. */
export async function getSelectedProcessedAsset(project: ProjectRecord, source: AssetRecord): Promise<AssetRecord | null> {
  if (!project.selectedProcessedAssetId) return null;
  if (project.activeAssetId !== source.id || source.projectId !== project.id || source.role !== 'source')
    throw new Error('Несъответстваща оригинална снимка');
  const db = await openProjectDB();
  const asset = await req<AssetRecord | undefined>(db.transaction('assets', 'readonly')
    .objectStore('assets').get(project.selectedProcessedAssetId));
  if (!asset || asset.projectId !== project.id || asset.sourceAssetId !== source.id ||
      asset.role !== 'processed' || asset.mimeType !== 'image/png' ||
      asset.blob?.type !== 'image/png' || !asset.blob || asset.blob.size === 0 || asset.byteSize !== asset.blob.size)
    throw new Error('Избраната скица е невалидна. Оригиналът не е засегнат.');
  return asset;
}

/** Apply Sketch with Draw: atomically commit both the chosen PNG and style.
 * No duplicate bitmap or overlay preset writes. Project/source/PNG identities
 * are checked inside the SAME readwrite transaction.
 */
export async function selectProcessedAsset(projectId: string, sourceId: string,
                                            processedId: string): Promise<void> {
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'assets'], 'readwrite');
  const finished = txDone(tx);
  let invalid = false;
  const projects = tx.objectStore('projects');
  const assets = tx.objectStore('assets');
  const projectRequest = projects.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  projectRequest.onsuccess = () => {
    const project = projectRequest.result;
    if (!project || project.activeAssetId !== sourceId) { invalid = true; tx.abort(); return; }
    const assetRequest = assets.get(processedId) as IDBRequest<AssetRecord | undefined>;
    assetRequest.onsuccess = () => {
      const a = assetRequest.result;
      if (!a || a.projectId !== projectId || a.sourceAssetId !== sourceId ||
          a.role !== 'processed' || a.mimeType !== 'image/png' || a.blob?.type !== 'image/png' || !a.blob ||
          !a.blob.size || a.byteSize !== a.blob.size) { invalid = true; tx.abort(); return; }
      projects.put({ ...project, selectedProcessedAssetId: a.id, editorStyle: 'sketch' });
    };
  };
  try { await finished; } catch (error) {
    if (invalid) throw new Error('Проектът или обработената скица са сменени; изборът е отказан.');
    throw error;
  }
}

/** Legacy v0.23.1 preview-style setter retained for compatibility and old tests.
 * Do not call from current UI: Day 24.1 applies mode ONLY with Draw.
 * The authoritative applied image is selectedProcessedAssetId.
 */
export async function saveProjectEditorStyle(projectId: string, sourceId: string,
                                            style: ProjectRecord['editorStyle']): Promise<void> {
  if (style !== null && style !== 'sketch' && style !== 'manga' && style !== 'comic')
    throw new Error('Невалиден режим на редактора');
  const db = await openProjectDB();
  const tx = db.transaction('projects', 'readwrite');
  const done = txDone(tx);
  let invalid = false;
  const store = tx.objectStore('projects');
  const get = store.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  get.onsuccess = () => {
    const project = get.result;
    if (!project || project.activeAssetId !== sourceId) { invalid = true; tx.abort(); return; }
    store.put({ ...project, editorStyle: style });
  };
  try { await done; } catch (error) {
    if (invalid) throw new Error('Проектът или оригиналът е сменен. Режимът не е записан.');
    throw error;
  }
}

/** Draw with Original: clear only the camera selection, never delete the old PNG.
 * The source image and all overlay presets are preserved. */
export async function selectOriginalForDrawing(projectId: string, sourceId: string): Promise<void> {
  const db = await openProjectDB();
  const tx = db.transaction('projects', 'readwrite');
  const done = txDone(tx);
  let invalid = false;
  const store = tx.objectStore('projects');
  const get = store.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  get.onsuccess = () => {
    const project = get.result;
    if (!project || project.activeAssetId !== sourceId) { invalid = true; tx.abort(); return; }
    const updated = { ...project, editorStyle: null };
    delete updated.selectedProcessedAssetId;
    store.put(updated);
  };
  try { await done; } catch (error) {
    if (invalid) throw new Error('Проектът или оригиналът е сменен. Връщането е отказано.');
    throw error;
  }
}

/** Day 20: read-only newest saved PNG for the current ORIGINAL source.
 * A Day 13 diagnostic processed asset can be compared, but UI choices do not reprocess it.
 * Never silently use processed results from a replaced source.
 */
export async function getLatestProcessedPreview(projectId: string, sourceAssetId: string,
                                                pipelineVersion?: string, detail?: number, line?: 'thin' | 'normal' | 'thick'): Promise<AssetRecord | null> {
  const db = await openProjectDB();
  const found = await req<AssetRecord[]>(db.transaction('assets', 'readonly')
    .objectStore('assets').index('byProjectRole').getAll(IDBKeyRange.only([projectId, 'processed'])));
  return found.filter(a => a.projectId === projectId && a.role === 'processed' &&
    a.sourceAssetId === sourceAssetId && a.mimeType === 'image/png' &&
    (pipelineVersion === undefined || a.pipelineVersion === pipelineVersion) &&
    (detail === undefined || a.params?.detail === detail) &&
    (line === undefined || a.params?.line === line) &&
    a.blob instanceof Blob && a.blob.size > 0 && a.blob.size === a.byteSize)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Day 24.1: Home mirrors EXACTLY the PNG committed by Draw, never the latest
 * generated-but-not-applied editor preview. Existing v0.23 selections are
 * authoritative even if a pre-hotfix preview-only editorStyle disagrees.
 * No duplicate thumbnail, schema bump, or database write is required.
 */
export function selectHomeSketchPreview(project: ProjectRecord, processed: readonly AssetRecord[]): AssetRecord | undefined {
  if (!project.selectedProcessedAssetId) return undefined;
  return processed.find(asset => asset.id === project.selectedProcessedAssetId &&
    asset.projectId === project.id && asset.role === 'processed' &&
    asset.sourceAssetId === project.activeAssetId && asset.mimeType === 'image/png' &&
    asset.blob instanceof Blob && asset.blob.type === 'image/png' &&
    asset.blob.size > 0 && asset.byteSize === asset.blob.size);
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
    // Queue BOTH requests before awaiting: IndexedDB transactions can auto-close
    // after an unrelated await on iPhone Safari.
    const thumbsRequest = req<AssetRecord[]>(index.getAll(IDBKeyRange.only([project.id, 'thumbnail'])));
    const wantsSketch = Boolean(project.selectedProcessedAssetId);
    const processedRequest = wantsSketch
      ? req<AssetRecord[]>(index.getAll(IDBKeyRange.only([project.id, 'processed'])))
      : Promise.resolve([] as AssetRecord[]);
    const [thumbs, processed] = await Promise.all([thumbsRequest, processedRequest]);
    const thumbnail = thumbs.find(asset => asset.sourceAssetId === project.activeAssetId);
    const displayAsset = selectHomeSketchPreview(project, processed);
    return { project, thumbnail, displayAsset,
      displayKind: displayAsset ? 'sketch' as const : 'original' as const };
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
  if (project.editorStyle !== undefined && project.editorStyle !== null &&
      !['sketch', 'manga', 'comic'].includes(project.editorStyle))
    throw new Error('Невалиден режим на редактора');
  if (project.selectedProcessedAssetId) {
    const selected = byId.get(project.selectedProcessedAssetId);
    if (selected?.role !== 'processed' || selected.projectId !== projectId ||
        selected.sourceAssetId !== project.activeAssetId) throw new Error('Невалидна избрана скица');
  }
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


/** Day 7: update only project metadata. No assets or drawing presets are touched. */
export async function renameImageProject(projectId: string, rawTitle: string): Promise<ProjectRecord> {
  const title = rawTitle.trim().replace(/\s+/g, ' ');
  if (!title || title.length > 100 || /[\u0000-\u001F\u007F]/.test(title)) {
    throw new Error('Името трябва да съдържа между 1 и 100 символа.');
  }
  const db = await openProjectDB();
  const tx = db.transaction('projects', 'readwrite');
  const done = txDone(tx);
  let saved: ProjectRecord | undefined;
  let missing = false;
  const request = tx.objectStore('projects').get(projectId) as IDBRequest<ProjectRecord | undefined>;
  request.onsuccess = () => {
    const current = request.result;
    if (!current) { missing = true; tx.abort(); return; }
    // Keep the last edit timestamp stable when the title did not change.
    saved = { ...current, title, updatedAt: title === current.title ? current.updatedAt : now() };
    tx.objectStore('projects').put(saved);
  };
  try { await done; }
  catch (error) { if (missing) throw new Error('Проектът вече не съществува.'); throw error; }
  if (!saved) throw new Error('Неуспешно преименуване на проекта.');
  return saved;
}

/** Day 7: delete a project and ALL dependent records atomically.
 * The database version stays at 1. Queue every delete during active IDB request callbacks;
 * never await between reads and writes within this transaction (important on iOS WebKit).
 * Deliberately includes historical source images and their SHA-256 baselines.
 */
export async function deleteImageProject(projectId: string): Promise<{
  assetsDeleted: number; presetsDeleted: number; hashBaselinesDeleted: number;
}> {
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'assets', 'overlay_presets', 'app_settings'], 'readwrite');
  const done = txDone(tx);
  const projects = tx.objectStore('projects');
  const assets = tx.objectStore('assets');
  const presets = tx.objectStore('overlay_presets');
  const settings = tx.objectStore('app_settings');
  const totals = { assetsDeleted: 0, presetsDeleted: 0, hashBaselinesDeleted: 0 };
  let missing = false;
  const projectRequest = projects.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  projectRequest.onsuccess = () => {
    if (!projectRequest.result) { missing = true; tx.abort(); return; }
    // Exact projectId lookups; never scan or mutate another user's projects.
    const assetRequest = assets.index('projectId').getAll(IDBKeyRange.only(projectId)) as IDBRequest<AssetRecord[]>;
    assetRequest.onsuccess = () => {
      for (const asset of assetRequest.result) {
        assets.delete(asset.id);
        totals.assetsDeleted++;
        if (asset.role === 'source') {
          settings.delete(`day5-source-sha256:${asset.id}`);
          totals.hashBaselinesDeleted++;
        }
      }
    };
    const presetRequest = presets.index('projectId').getAllKeys(IDBKeyRange.only(projectId));
    presetRequest.onsuccess = () => {
      for (const key of presetRequest.result) {
        presets.delete(key);
        totals.presetsDeleted++;
      }
    };
    projects.delete(projectId);
  };
  try { await done; }
  catch (error) { if (missing) throw new Error('Проектът вече не съществува.'); throw error; }
  return totals;
}

/** Read-only G2 preparation: detect assets and presets with no owning project.
 * No automatic deletion of existing data: audit first, repair only with consent.
 */
export async function auditProjectDatabase(): Promise<{
  projects: number; assets: number; presets: number; sourceAssets: number;
  orphanAssetIds: string[]; orphanPresetIds: string[]; brokenSourceLinks: string[];
  invalidProjectIds: string[]; staleHashKeys: string[]; ok: boolean;
}> {
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'assets', 'overlay_presets', 'app_settings'], 'readonly');
  const done = txDone(tx);
  const [projects, assets, presets, settings] = await Promise.all([
    req<ProjectRecord[]>(tx.objectStore('projects').getAll()),
    req<AssetRecord[]>(tx.objectStore('assets').getAll()),
    req<OverlayPreset[]>(tx.objectStore('overlay_presets').getAll()),
    req<AppSetting[]>(tx.objectStore('app_settings').getAll()),
  ]);
  await done;
  const projectIds = new Set(projects.map(p => p.id));
  const byAsset = new Map(assets.map(a => [a.id, a]));
  const orphanAssetIds = assets.filter(a => !projectIds.has(a.projectId)).map(a => a.id);
  const orphanPresetIds = presets.filter(p => !projectIds.has(p.projectId) ||
    byAsset.get(p.assetId)?.projectId !== p.projectId).map(p => p.id);
  const brokenSourceLinks = assets.filter(a => a.sourceAssetId &&
    (byAsset.get(a.sourceAssetId)?.role !== 'source' ||
      byAsset.get(a.sourceAssetId)?.projectId !== a.projectId)).map(a => a.id);
  const invalidProjectIds = projects.filter(p =>
    byAsset.get(p.activeAssetId)?.role !== 'source' ||
    byAsset.get(p.activeAssetId)?.projectId !== p.id ||
    (p.editorStyle !== undefined && p.editorStyle !== null &&
      !['sketch', 'manga', 'comic'].includes(p.editorStyle)) ||
    (p.selectedProcessedAssetId !== undefined &&
      (byAsset.get(p.selectedProcessedAssetId)?.role !== 'processed' ||
       byAsset.get(p.selectedProcessedAssetId)?.projectId !== p.id ||
       byAsset.get(p.selectedProcessedAssetId)?.sourceAssetId !== p.activeAssetId)) ||
    (p.guide !== undefined && (!isGuidePlanV1(p.guide) ||
      byAsset.get(p.guide.sourceAssetId)?.projectId !== p.id ||
      p.guide.steps.some(step => byAsset.get(step.assetId)?.role !== 'guide-step' ||
        byAsset.get(step.assetId)?.projectId !== p.id)))
  ).map(p => p.id);
  const staleHashKeys = settings.filter(s => s.key.startsWith('day5-source-sha256:') &&
    !byAsset.has(s.key.substring('day5-source-sha256:'.length))).map(s => s.key);
  return {
    projects: projects.length, assets: assets.length, presets: presets.length,
    sourceAssets: assets.filter(a => a.role === 'source').length,
    orphanAssetIds, orphanPresetIds, brokenSourceLinks, invalidProjectIds, staleHashKeys,
    ok: !(orphanAssetIds.length || orphanPresetIds.length || brokenSourceLinks.length ||
      invalidProjectIds.length || staleHashKeys.length),
  };
}
