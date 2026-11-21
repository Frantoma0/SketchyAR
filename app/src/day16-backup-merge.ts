/** SketchyAR Day 16 merge preview and transaction planner.
 * Only NEW complete project groups are imported. Existing projects and all their
 * dependencies remain untouched, regardless of whether the archive differs.
 * Never use this advisory preview as the final concurrency check: run the same
 * planner again INSIDE the production IndexedDB readwrite transaction.
 */
import type { BackupManifestV1 } from './storage/backup-contract';
import type { ExistingBackupKeys } from './day16-backup-conflicts';

const SOURCE_HASH_PREFIX = 'day5-source-sha256:';

export interface BackupMergePlan {
  projectIds: string[];
  assetIds: string[];
  presetIds: string[];
  settingKeys: string[];
  alreadyPresentProjects: number;
  blockedNewProjects: number;
  existingSettingsKept: number;
  canRestore: boolean;
}

/** All referenced asset/preset rows for a project are treated as ONE unit.
 * If any child ID already belongs to another destination record, skip the
 * entire new project. Never create a project with missing or foreign children.
 * Missing global settings are appended only when at least one project is added.
 */
export function planBackupMerge(manifest: BackupManifestV1, existing: ExistingBackupKeys): BackupMergePlan {
  const projects = new Set(existing.projects);
  const assets = new Set(existing.assets);
  const presets = new Set(existing.overlay_presets);
  const settings = new Set(existing.app_settings);
  const assetByProject = new Map<string, typeof manifest.assets>();
  const presetByProject = new Map<string, typeof manifest.presets>();
  for (const a of manifest.assets) {
    const list = assetByProject.get(a.projectId) ?? [];
    list.push(a);
    assetByProject.set(a.projectId, list);
  }
  for (const preset of manifest.presets) {
    const list = presetByProject.get(preset.projectId) ?? [];
    list.push(preset);
    presetByProject.set(preset.projectId, list);
  }
  const projectIds: string[] = [];
  const assetIds: string[] = [];
  const presetIds: string[] = [];
  let alreadyPresentProjects = 0;
  let blockedNewProjects = 0;
  for (const project of manifest.projects) {
    if (projects.has(project.id)) { alreadyPresentProjects++; continue; }
    const children = assetByProject.get(project.id) ?? [];
    const layouts = presetByProject.get(project.id) ?? [];
    // Source baseline metadata must belong to the same imported source asset.
    // A colliding baseline key would otherwise risk mismatched source hashes.
    const baselineCollision = children.some(a =>
      a.role === 'source' && settings.has(`${SOURCE_HASH_PREFIX}${a.id}`));
    if (children.some(a => assets.has(a.id)) || layouts.some(p => presets.has(p.id)) || baselineCollision) {
      blockedNewProjects++;
      continue;
    }
    projectIds.push(project.id);
    assetIds.push(...children.map(a => a.id));
    presetIds.push(...layouts.map(p => p.id));
  }
  const acceptedAssets = new Set(assetIds);
  const settingKeys = projectIds.length ? manifest.settings.filter(s => {
    if (settings.has(s.key)) return false;
    if (!s.key.startsWith(SOURCE_HASH_PREFIX)) return true;
    return acceptedAssets.has(s.key.slice(SOURCE_HASH_PREFIX.length));
  }).map(s => s.key) : [];
  return {
    projectIds, assetIds, presetIds, settingKeys, alreadyPresentProjects,
    blockedNewProjects,
    existingSettingsKept: manifest.settings.filter(s => settings.has(s.key)).length,
    canRestore: projectIds.length > 0,
  };
}
