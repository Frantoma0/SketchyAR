/** Day 21: pure, token-guarded transition between the active camera and read-only editor.
 * This is NOT a project/source migration and does not touch getUserMedia.
 */
export type CameraEditPhase = 'idle' | 'pending' | 'editing';
export interface CameraEditToken { readonly generation: number; readonly projectId: string; }

export class CameraEditTransition {
  private phase: CameraEditPhase = 'idle';
  private generation = 0;
  private projectId: string | null = null;
  get currentPhase(): CameraEditPhase { return this.phase; }
  begin(projectId: string | null, drawingOpen: boolean): CameraEditToken | null {
    if (!drawingOpen || !projectId || this.phase !== 'idle') return null;
    const token = { generation: ++this.generation, projectId };
    this.projectId = projectId;
    this.phase = 'pending';
    return token;
  }
  isPending(token: CameraEditToken, currentProjectId: string | null, drawingOpen: boolean): boolean {
    return drawingOpen && this.phase === 'pending' && this.generation === token.generation &&
      token.projectId === this.projectId && token.projectId === currentProjectId;
  }
  commit(token: CameraEditToken, currentProjectId: string | null, drawingOpen: boolean): boolean {
    if (!this.isPending(token, currentProjectId, drawingOpen)) return false;
    this.phase = 'editing';
    return true;
  }
  get editing(): boolean { return this.phase === 'editing'; }
  end(): void { this.generation++; this.phase = 'idle'; this.projectId = null; }
}

/** Camera snapshot signature for the no-op edit route (not a replacement for IndexedDB). */
export interface DrawingPlacement {
  x: number; y: number; scale: number; rotationDeg: number; opacityPercent: number;
  mirroredOverlay: boolean; locked: boolean; gridEnabled: boolean;
}
export function sameDrawingPlacement(before: DrawingPlacement, after: DrawingPlacement): boolean {
  return before.x === after.x && before.y === after.y && before.scale === after.scale &&
    before.rotationDeg === after.rotationDeg && before.opacityPercent === after.opacityPercent &&
    before.mirroredOverlay === after.mirroredOverlay && before.locked === after.locked &&
    before.gridEnabled === after.gridEnabled;
}
