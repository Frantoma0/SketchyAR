/** Day 30: Sketch detail and stroke are real; Manga/Comic remain placeholders. */
export type SketchUiStyle = 'sketch' | 'manga' | 'comic';
export type SketchUiSelection = SketchUiStyle | null;
export type SketchUiLine = 'thin' | 'normal' | 'thick';
export type SketchUiLineSelection = SketchUiLine | null;
export type SketchUiState = Readonly<{
  style: SketchUiSelection;
  detail: 1 | 2 | 3 | 4 | 5;
  line: SketchUiLineSelection;
}>;
export const DEFAULT_SKETCH_UI: SketchUiState = Object.freeze({
  style: null, detail: 3, line: null,
});
export function setSketchUiStyle(state: SketchUiState, style: string): SketchUiState {
  if (style !== 'sketch' && style !== 'manga' && style !== 'comic') throw new Error('Unknown style');
  // Tap the selected profile again to return to the original image.
  return { ...state, style: state.style === style ? null : style };
}
export function setSketchUiLine(state: SketchUiState, line: string): SketchUiState {
  if (line !== 'thin' && line !== 'normal' && line !== 'thick') throw new Error('Unknown thickness');
  return { ...state, line: state.line === line ? null : line };
}
/** No highlighted thickness means the original Normal contour is used. */
export function effectiveSketchLine(line: SketchUiLineSelection): SketchUiLine {
  return line ?? 'normal';
}
export function setSketchUiDetail(state: SketchUiState, detail: number): SketchUiState {
  if (!Number.isInteger(detail) || detail < 1 || detail > 5) throw new Error('Detail must be 1–5');
  return { ...state, detail: detail as SketchUiState['detail'] };
}
/** Styling is never a signal that a preview has been generated with these settings. */
export function previewCanCompare(sourceReady: boolean, processedReady: boolean): boolean {
  return sourceReady && processedReady;
}
