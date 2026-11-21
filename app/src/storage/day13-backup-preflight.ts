/** Day 13: non-destructive manifest-v1 preflight for Day 14.
 * NEVER claims a backup was created; NO ZIP or hashes are generated here.
 */
import type { BackupManifestV1, BackupAssetV1 } from './backup-contract';
import type { AssetRecord, AppSetting, OverlayPreset, ProjectRecord } from './project-store';
import { isGuidePlanV1 } from '../domain/guide';

export type BackupPreflight = {
  format: BackupManifestV1['format']; schemaVersion: 1;
  projects: number; assets: number; presets: number; settings: number;
  guideProjects: number; linkedAssets: number; totalAssetBytes: number;
  requiredHashCount: number; status: 'MANIFEST V1 READY — NO BACKUP CREATED';
};
export function inspectBackupInput(projects: ProjectRecord[], assets: AssetRecord[],
                                   presets: OverlayPreset[], settings: AppSetting[]): BackupPreflight {
  const projectIds = new Set(projects.map(p => p.id));
  const assetIds = new Set(assets.map(a => a.id));
  const assetById = new Map(assets.map(a => [a.id, a]));
  if (projectIds.size !== projects.length || assetIds.size !== assets.length) throw new Error('Duplicate IDs');
  for (const project of projects) {
    const active = assetById.get(project.activeAssetId);
    if (active?.role !== 'source' || active.projectId !== project.id) throw new Error('Active source image missing');
    if (project.selectedProcessedAssetId !== undefined) {
      const selected = assetById.get(project.selectedProcessedAssetId);
      if (selected?.role !== 'processed' || selected.projectId !== project.id ||
          selected.sourceAssetId !== project.activeAssetId || selected.mimeType !== 'image/png')
        throw new Error('Invalid selected processed asset');
    }
    if (project.guide) {
      if (!isGuidePlanV1(project.guide)) throw new Error('Invalid guide plan');
      const guideSource = assetById.get(project.guide.sourceAssetId);
      if (guideSource?.role !== 'source' || guideSource.projectId !== project.id ||
          project.guide.steps.some(step => {
            const a = assetById.get(step.assetId);
            return a?.role !== 'guide-step' || a.projectId !== project.id ||
              a.sourceAssetId !== project.guide?.sourceAssetId;
          })) throw new Error('Unresolved guide asset');
    }
  }
  for (const asset of assets) {
    if (!projectIds.has(asset.projectId) ||
        (asset.sourceAssetId && (assetById.get(asset.sourceAssetId)?.projectId !== asset.projectId ||
         assetById.get(asset.sourceAssetId)?.role !== 'source')) ||
        !asset.blob || asset.blob.size !== asset.byteSize)
      throw new Error('Invalid asset provenance or blob');
  }
  for (const preset of presets) {
    if (!projectIds.has(preset.projectId) || assetById.get(preset.assetId)?.projectId !== preset.projectId)
      throw new Error('Unresolved overlay preset');
  }
  return { format: 'sketchyar-backup', schemaVersion: 1,
    projects: projects.length, assets: assets.length, presets: presets.length,
    settings: settings.length, guideProjects: projects.filter(p=>p.guide).length,
    linkedAssets: assets.filter(a => a.sourceAssetId).length,
    totalAssetBytes: assets.reduce((sum,a) => sum+a.byteSize, 0),
    requiredHashCount: assets.length,
    status: 'MANIFEST V1 READY — NO BACKUP CREATED' };
}

/** Day 14 will populate these metadata fields after streaming SHA-256 calculation.
 * This type check ensures sourceAssetId, params, pipelineVersion, modelId and guide
 * survive in the manifest. Do not use before hashes have been calculated.
 */
export function manifestRecordFromVerifiedAsset(asset: AssetRecord, path: string, sha256: string): BackupAssetV1 {
  if (!/^assets\/[a-f0-9-]+\.(png|jpg|jpeg|webp|heic|heif|gif|bin)$/.test(path) || !/^[a-f0-9]{64}$/.test(sha256))
    throw new Error('Invalid backup asset path or SHA-256');
  const { blob: _blob, hashSha256: _storedHash, ...metadata } = asset;
  void _blob; void _storedHash;
  return { ...metadata, path, sha256 };
}

/** Reads current metadata only; no archive, no hash verification and no side effects. */
export async function runDay13BackupPreflight(): Promise<BackupPreflight> {
  const { openProjectDB } = await import('./project-store');
  const db = await openProjectDB();
  const tx = db.transaction(['projects', 'assets', 'overlay_presets', 'app_settings'], 'readonly');
  const complete = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Failed backup preflight transaction'));
  });
  function request<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  const [projects, assets, presets, settings] = await Promise.all([
    request<ProjectRecord[]>(tx.objectStore('projects').getAll()),
    request<AssetRecord[]>(tx.objectStore('assets').getAll()),
    request<OverlayPreset[]>(tx.objectStore('overlay_presets').getAll()),
    request<AppSetting[]>(tx.objectStore('app_settings').getAll()),
  ]);
  await complete;
  return inspectBackupInput(projects, assets, presets, settings);
}
