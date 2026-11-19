/** Day 5 advance contract, implemented as ZIP export/verify/restore on Days 13–14.
 *  Strict metadata relationship: project.guide is stored and round-tripped losslessly.
 */
import type { ProjectRecord, AssetRecord, OverlayPreset, AppSetting } from './project-store';
export interface BackupAssetV1 extends Omit<AssetRecord, 'blob' | 'hashSha256'> {
  path: string;           // e.g. assets/<id>.jpg, never untrusted absolute paths
  sha256: string;         // calculated over ORIGINAL blob bytes
}
export interface BackupManifestV1 {
  format: 'sketchyar-backup';
  schemaVersion: 1;
  appVersion: string;
  createdAt: string;
  projects: ProjectRecord[]; // guide?: GuidePlanV1 is preserved, including currentStep
  assets: BackupAssetV1[];
  presets: OverlayPreset[];
  settings: AppSetting[];
  integrity: { algorithm: 'SHA-256' };
}
