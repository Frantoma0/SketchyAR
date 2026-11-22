/** Day 31: pure style-aware cache keys and provenance. Sketch history is intact. */
import { matchesStrokeVariant, strokeVariantKey } from './day30-stroke-variants';
import type { AssetRecord } from './storage/project-store';
import type { SketchUiStyle, SketchUiSelection, SketchUiLine } from './day20-sketch-state';
import type { DetailLevel } from './day29-detail-variants';

export type ProductiveStyle = Extract<SketchUiStyle, 'sketch' | 'manga'>;

export function isProductiveStyle(style: SketchUiSelection): style is ProductiveStyle {
  return style === 'sketch' || style === 'manga';
}

export function appliedProcessedStyle(asset: Pick<AssetRecord, 'params' | 'pipelineVersion'>): ProductiveStyle {
  return asset.params?.style === 'manga' || asset.pipelineVersion?.startsWith('day31-manga-')
    ? 'manga' : 'sketch';
}

export function styledVariantKey(style: ProductiveStyle, detail: DetailLevel, line: SketchUiLine): string {
  return `${style}:${strokeVariantKey(detail, line)}`;
}

export function matchesStyledVariant(asset: Pick<AssetRecord, 'sourceAssetId' | 'pipelineVersion' | 'params' | 'role'> | null | undefined,
    sourceId: string, style: ProductiveStyle, detail: DetailLevel, line: SketchUiLine,
    sketchVersion: string, mangaVersion: string): boolean {
  const version = style === 'manga' ? mangaVersion : sketchVersion;
  return matchesStrokeVariant(asset, sourceId, detail, line, version) &&
    (style === 'manga' ? asset?.params?.style === 'manga' : asset?.params?.style !== 'manga');
}
