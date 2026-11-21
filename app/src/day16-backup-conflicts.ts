/** Day 16 product preflight. Pure collision logic shared by UI and tests.
 * This is advisory only: the Day 14 atomic readwrite transaction checks again.
 */
import type { BackupManifestV1 } from './storage/backup-contract';

export const BACKUP_STORE_NAMES = ['projects', 'assets', 'overlay_presets', 'app_settings'] as const;
export type BackupStoreName = typeof BACKUP_STORE_NAMES[number];
export type ExistingBackupKeys = Record<BackupStoreName, readonly string[]>;

export interface BackupConflicts {
  total: number;
  counts: Record<BackupStoreName, number>;
  canRestore: boolean;
}

export function summarizeBackupConflicts(
  manifest: BackupManifestV1,
  existing: ExistingBackupKeys,
): BackupConflicts {
  const records: Record<BackupStoreName, readonly { id?: string; key?: string }[]> = {
    projects: manifest.projects,
    assets: manifest.assets,
    overlay_presets: manifest.presets,
    app_settings: manifest.settings,
  };
  const counts: BackupConflicts['counts'] = {
    projects: 0, assets: 0, overlay_presets: 0, app_settings: 0,
  };
  for (const name of BACKUP_STORE_NAMES) {
    const keys = new Set(existing[name]);
    const field = name === 'app_settings' ? 'key' : 'id';
    counts[name] = records[name].filter(record => {
      const key = record[field];
      return typeof key === 'string' && keys.has(key);
    }).length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { total, counts, canRestore: total === 0 };
}
