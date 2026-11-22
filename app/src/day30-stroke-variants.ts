/** Day 30: exact (source, engine, detail, stroke) cache and applied metadata. */
import type { AssetRecord } from './storage/project-store';
import type { DetailLevel } from './day29-detail-variants';
import type { SketchUiLine } from './day20-sketch-state';

export function isSketchStroke(value: unknown): value is SketchUiLine {
  return value === 'thin' || value === 'normal' || value === 'thick';
}

/** Historical V1–V4/D29 PNGs have no stroke field and reopen as Normal. */
export function appliedStroke(asset: Pick<AssetRecord, 'params'> | null | undefined): SketchUiLine {
  return isSketchStroke(asset?.params?.line) ? asset.params.line : 'normal';
}

export function strokeVariantKey(detail: DetailLevel, line: SketchUiLine): string {
  return `${detail}:${line}`;
}

export function matchesStrokeVariant(asset: Pick<AssetRecord,
  'sourceAssetId' | 'pipelineVersion' | 'params' | 'role'> | null | undefined,
  sourceId: string, detail: DetailLevel, line: SketchUiLine, pipelineVersion: string): boolean {
  return Boolean(asset && asset.role === 'processed' && asset.sourceAssetId === sourceId &&
    asset.pipelineVersion === pipelineVersion && asset.params?.detail === detail &&
    asset.params?.line === line);
}
