/** Day 20: temporary Generator UI choices. No effect on source/processed assets yet. */
export type SketchUiStyle = 'sketch' | 'manga' | 'comic';
export type SketchUiLine = 'thin' | 'normal' | 'thick';
export type SketchUiState = Readonly<{
  style: SketchUiStyle;
  detail: 1 | 2 | 3 | 4 | 5;
  line: SketchUiLine;
}>;
export const DEFAULT_SKETCH_UI: SketchUiState = Object.freeze({
  style: 'sketch', detail: 3, line: 'normal',
});
export function setSketchUiStyle(state: SketchUiState, style: string): SketchUiState {
  if (style !== 'sketch' && style !== 'manga' && style !== 'comic') throw new Error('Unknown style');
  return { ...state, style };
}
export function setSketchUiLine(state: SketchUiState, line: string): SketchUiState {
  if (line !== 'thin' && line !== 'normal' && line !== 'thick') throw new Error('Unknown thickness');
  return { ...state, line };
}
export function setSketchUiDetail(state: SketchUiState, detail: number): SketchUiState {
  if (!Number.isInteger(detail) || detail < 1 || detail > 5) throw new Error('Detail must be 1–5');
  return { ...state, detail: detail as SketchUiState['detail'] };
}
/** Styling is never a signal that a preview has been generated with these settings. */
export function previewCanCompare(sourceReady: boolean, processedReady: boolean): boolean {
  return sourceReady && processedReady;
}
