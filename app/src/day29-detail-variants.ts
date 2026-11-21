/** Day 29: provenance checks for source-scoped Sketch detail drafts.
 * The legacy V1..V4 PNG has no detail marker and is treated as D3 ONLY
 * when reopening an already applied PNG. New drafts must match exactly.
 */
import type { AssetRecord } from './storage/project-store';

export type DetailLevel = 1 | 2 | 3 | 4 | 5;
export function isDetailLevel(value: unknown): value is DetailLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
export function appliedDetail(asset: Pick<AssetRecord, 'params'> | null | undefined): DetailLevel {
  return isDetailLevel(asset?.params?.detail) ? asset.params.detail : 3;
}
export function matchesDetailVariant(asset: Pick<AssetRecord,
  'sourceAssetId' | 'pipelineVersion' | 'params' | 'role'> | null | undefined,
  expectedSourceId: string, detail: DetailLevel, expectedVersion: string): boolean {
  return Boolean(asset && asset.role === 'processed' &&
    asset.sourceAssetId === expectedSourceId && asset.pipelineVersion === expectedVersion &&
    asset.params?.detail === detail);
}
