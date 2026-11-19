/** Canonical Guide v1 contract. Future Guided Drawing data is compatible with Day 5 DB v1. */
export const DEFAULT_RASTER_STEP_COUNT = 5 as const;
export type GuideMode = 'manual' | 'raster-proposed';

export interface GuideStepV1 {
  id: string;
  assetId: string;              // role === 'guide-step'; same project
  title: string;
  order: number;
  accepted: boolean;            // manually confirmed, not camera-verified
}

export interface GuidePlanV1 {
  version: 1;
  sourceAssetId: string;
  mode: GuideMode;
  currentStep: number;
  reveal: 'cumulative' | 'current-only';
  steps: GuideStepV1[];
  generator?: {
    name: string;
    version: string;
    params: Record<string, unknown>;
  };
}

export function isGuidePlanV1(value: unknown): value is GuidePlanV1 {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<GuidePlanV1>;
  if (p.version !== 1 || typeof p.sourceAssetId !== 'string' || !p.sourceAssetId) return false;
  if (p.mode !== 'manual' && p.mode !== 'raster-proposed') return false;
  if (p.reveal !== 'cumulative' && p.reveal !== 'current-only') return false;
  if (!Array.isArray(p.steps) || p.steps.length < 1 || p.steps.length > 32) return false;
  if (!Number.isInteger(p.currentStep) || p.currentStep! < 0 || p.currentStep! >= p.steps.length) return false;
  const ids = new Set<string>();
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i];
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) ||
        typeof s.assetId !== 'string' || !s.assetId || typeof s.title !== 'string' ||
        s.order !== i || typeof s.accepted !== 'boolean') return false;
    ids.add(s.id);
  }
  if (p.generator !== undefined && (typeof p.generator.name !== 'string' ||
      typeof p.generator.version !== 'string' || !p.generator.params ||
      typeof p.generator.params !== 'object')) return false;
  return true;
}
