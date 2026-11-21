/** Day 18 — typed, side-effect-free navigation contract for the Sketch Generator.
 * The route model never touches IndexedDB, the camera, or the network.
 * Day 18 ships the edit-preview route; new-picker staging will be switched on only
 * after a working Generate -> Save -> Draw implementation has passed its gate.
 */
export type SketchEntryIntent =
  'new-drawing' | 'resume-project' | 'edit-sketch' | 'edit-from-camera' | 'change-source';
export type SketchDestination = 'native-picker' | 'camera' | 'generator';
export interface SketchRoutePlan {
  intent: SketchEntryIntent;
  destination: SketchDestination;
  projectId?: string;
  /** An unfinished generator must never replace the existing drawing path. */
  requiresGeneratorGate: boolean;
}
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function planSketchRoute(intent: SketchEntryIntent, projectId?: string): SketchRoutePlan {
  if (intent === 'new-drawing') {
    if (projectId !== undefined) throw new Error('New drawing must not reuse an existing project');
    return { intent, destination: 'native-picker', requiresGeneratorGate: true };
  }
  if (!projectId || !PROJECT_ID.test(projectId)) throw new Error('Invalid project ID for sketch route');
  if (intent === 'resume-project') {
    return { intent, projectId, destination: 'camera', requiresGeneratorGate: false };
  }
  if (intent === 'change-source') {
    return { intent, projectId, destination: 'native-picker', requiresGeneratorGate: true };
  }
  return { intent, projectId, destination: 'generator',
    requiresGeneratorGate: intent === 'edit-from-camera' };
}

export type SketchRouteState =
  | { kind: 'idle' }
  | { kind: 'picker'; token: number }
  | { kind: 'draft'; token: number; file: File }
  | { kind: 'committing'; token: number; file: File }
  | { kind: 'edit'; token: number; projectId: string; intent: 'edit-sketch' | 'edit-from-camera' };

/** In-memory only. A cancelled picker/draft cannot produce a ProjectRecord or orphan asset. */
export class SketchRouteMachine {
  private state: SketchRouteState = { kind: 'idle' };
  private epoch = 0;

  get current(): Readonly<SketchRouteState> { return this.state; }
  beginNewPicker(): number | null {
    if (this.state.kind !== 'idle') return null; // repeated tap: no second picker
    const token = ++this.epoch;
    this.state = { kind: 'picker', token };
    return token;
  }
  acceptPickedFile(token: number, file: File | null): boolean {
    if (this.state.kind !== 'picker' || this.state.token !== token) return false;
    if (!file) { this.state = { kind: 'idle' }; return false; }
    if (!file.type.startsWith('image/') || file.size < 1)
      throw new Error('Only a non-empty image can become a drawing draft');
    this.state = { kind: 'draft', token, file }; // memory-only, no DB writes
    return true;
  }
  openExisting(intent: 'edit-sketch' | 'edit-from-camera', projectId: string): number | null {
    if (this.state.kind !== 'idle') return null;
    planSketchRoute(intent, projectId);
    const token = ++this.epoch;
    this.state = { kind: 'edit', token, intent, projectId };
    return token;
  }
  beginDraftCommit(token: number): File | null {
    if (this.state.kind !== 'draft' || this.state.token !== token) return null;
    const file = this.state.file;
    this.state = { kind: 'committing', token, file };
    return file;
  }
  finishDraftCommit(token: number, saved: boolean): boolean {
    if (this.state.kind !== 'committing' || this.state.token !== token) return false;
    this.state = saved ? { kind: 'idle' } : { kind: 'draft', token, file: this.state.file };
    return true;
  }
  cancel(): boolean {
    if (this.state.kind === 'committing') return false; // commit cannot be interrupted midway
    this.state = { kind: 'idle' };
    ++this.epoch; // stale async image reads lose their generation
    return true;
  }
  /** Is the async result still relevant to the currently visible edit screen? */
  isActive(token: number): boolean {
    return (this.state.kind === 'edit' || this.state.kind === 'draft') && this.state.token === token;
  }
}

/** Legacy projects have no recipe yet; original is always a safe read-only fallback. */
export function choosePreviewRole(hasSelectedProcessedAsset: boolean): 'processed' | 'source' {
  return hasSelectedProcessedAsset ? 'processed' : 'source';
}
