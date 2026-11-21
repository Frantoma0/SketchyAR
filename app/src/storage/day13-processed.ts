/** Day 13: append a derivative PNG without replacing the original source.
 * All identity checks and writes occur in ONE IndexedDB transaction.
 */
import { openProjectDB, type AssetRecord, type ProjectRecord } from './project-store';

export interface ProcessedProvenance {
  sourceAssetId: string;
  pipelineVersion: string;
  params: { sigma: number; low: number; high: number; input: 'grayscale-u8'; maxSide: 1024; detail?: 1 | 2 | 3 | 4 | 5 };
  modelId: 'none';
  backend: 'numpy-pyodide';
}

export async function saveProcessedPng(projectId: string, provenance: ProcessedProvenance,
                                       blob: Blob, width: number, height: number,
                                       selectForDrawing = false): Promise<AssetRecord> {
  if (!blob || blob.type !== 'image/png' || blob.size <= 0 || !Number.isInteger(width) ||
      !Number.isInteger(height) || width < 3 || height < 3 || width > 1024 || height > 1024)
    throw new Error('Невалиден обработен PNG');
  const db = await openProjectDB();
  const date = new Date().toISOString();
  const asset: AssetRecord = {
    id: crypto.randomUUID(), projectId, role: 'processed', blob,
    mimeType: 'image/png', byteSize: blob.size, width, height, createdAt: date,
    sourceAssetId: provenance.sourceAssetId, params: { ...provenance.params },
    pipelineVersion: provenance.pipelineVersion, modelId: provenance.modelId,
    backend: provenance.backend, mirroredPixels: false,
  };
  const tx = db.transaction(['projects', 'assets'], 'readwrite');
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB транзакцията беше прекъсната'));
  });
  const projects = tx.objectStore('projects');
  const assets = tx.objectStore('assets');
  let stale = false;
  const projectReq = projects.get(projectId) as IDBRequest<ProjectRecord | undefined>;
  projectReq.onsuccess = () => {
    const project = projectReq.result;
    if (!project || project.activeAssetId !== provenance.sourceAssetId) {
      stale = true;
      tx.abort();
      return;
    }
    const sourceReq = assets.get(provenance.sourceAssetId) as IDBRequest<AssetRecord | undefined>;
    sourceReq.onsuccess = () => {
      const source = sourceReq.result;
      if (!source || source.role !== 'source' || source.projectId !== projectId) {
        stale = true;
        tx.abort();
        return;
      }
      assets.add(asset);
      // Day 23: the selected derivative pointer is stored with the new asset atomically.
      // Original source remains active and overlay presets remain attached to it.
      if (selectForDrawing) projects.put({ ...project, selectedProcessedAssetId: asset.id, editorStyle: 'sketch' });
      // Keep the source as the project's active image and avoid changing gallery order.
    };
  };
  try { await finished; }
  catch (error) { if (stale) throw new Error('Проектът или оригиналната снимка са сменени; резултатът не е записан.'); throw error; }
  return asset;
}
