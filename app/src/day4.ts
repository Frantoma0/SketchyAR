/** Day 4.18: Figma camera controls, gallery-first creation, new image button and Home navigation.
 * All camera lifecycle and gesture code remains separate from the decorative SVG assets.
 */
import * as D from './diagnostics';
import { cameraController, type CameraSnapshot } from './camera-controller';
import { isBusy } from './day2';
import { createImageProject, replaceProjectSource, getProjectImage, getSelectedProcessedAsset, assertProjectIntegrity, saveProjectOverlay, type ProjectRecord, type OverlayPreset, type OverlaySnapshot } from './storage/project-store';
import { makeThumbnail } from './storage/thumbnail';
import { CameraEditTransition, sameDrawingPlacement, type CameraEditToken } from './day21-camera-navigation';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let drawingOpen = false;
let entering = false;
let priorOverflow = '';
let showGrid = false;
let artworkScale = 100;
let artworkX = 0;
let artworkY = 0;
let artworkAngle = 0;
let userImageUrl: string | null = null;
let opacity = 50;
let artworkLocked = false;
let artworkMirrored = false;
let pendingNewDrawing = false;
let activeProjectId: string | null = null;
let activeAssetId: string | null = null;
// Day 21: the editor overlays the existing camera; never call getUserMedia again on return.
const cameraEditTransition = new CameraEditTransition();
type CameraSketchEditOpener = (
  projectId: string, trigger: HTMLButtonElement, stillCurrent: () => boolean,
  onClosed: () => void
) => Promise<boolean>;
let cameraSketchEditOpener: CameraSketchEditOpener | null = null;
// New photo -> editor before ever opening/asking permission for the camera.
let newDrawingEditorOpener: ((project: Pick<ProjectRecord, 'id' | 'title'>) => boolean) | null = null;
export function registerNewDrawingEditor(openEditor: (project: Pick<ProjectRecord, 'id' | 'title'>) => boolean): void {
  newDrawingEditorOpener = openEditor;
}
let changeMenuOpen = false;
function closeCameraChangeMenu(): void {
  const menu = document.getElementById('sketch-camera-change-menu');
  const trigger = document.getElementById('sketch-camera-change-image');
  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute('aria-expanded', 'false');
  changeMenuOpen = false;
}
function toggleCameraChangeMenu(): void {
  if (!drawingOpen || entering || cameraEditTransition.currentPhase !== 'idle') return;
  changeMenuOpen = !changeMenuOpen;
  el<HTMLElement>('sketch-camera-change-menu').hidden = !changeMenuOpen;
  el<HTMLButtonElement>('sketch-camera-change-image').setAttribute('aria-expanded', String(changeMenuOpen));
  if (changeMenuOpen) el<HTMLButtonElement>('sketch-camera-menu-edit').focus();
}

export function registerCameraSketchEditor(openEditor: CameraSketchEditOpener): void {
  cameraSketchEditOpener = openEditor;
}


/** Day 6: debounce continuous gestures, serialize IndexedDB transactions, and
 * flush at explicit user checkpoints. No new object store or network service.
 */
type QueuedPreset = { projectId: string; assetId: string; snapshot: OverlaySnapshot; fingerprint: string };
const SAVE_DELAY_MS = 350;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: QueuedPreset | null = null;
let saveChain: Promise<void> = Promise.resolve();
let latestCommittedFingerprint: string | null = null;
let sceneSize: { width: number; height: number } | null = null;

function cameraSceneSize(): { width: number; height: number } {
  const rect = el<HTMLElement>('drawing-video-stage').getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || window.innerWidth),
    height: Math.max(1, rect.height || window.innerHeight),
  };
}
function snapshotOverlay(): OverlaySnapshot {
  const size = cameraSceneSize();
  return {
    x: artworkX / size.width,
    y: artworkY / size.height,
    scale: artworkScale / 100,
    rotationDeg: artworkAngle,
    opacityPercent: opacity,
    mirroredOverlay: artworkMirrored,
    locked: artworkLocked,
    gridEnabled: showGrid,
    sceneWidth: size.width,
    sceneHeight: size.height,
  };
}
function schedulePresetSave(): void {
  if (!activeProjectId || !activeAssetId || !drawingOpen) return;
  const snapshot = snapshotOverlay();
  const next: QueuedPreset = {
    projectId: activeProjectId, assetId: activeAssetId, snapshot,
    fingerprint: JSON.stringify([activeProjectId, activeAssetId, snapshot.x, snapshot.y,
      snapshot.scale, snapshot.rotationDeg, snapshot.opacityPercent,
      snapshot.mirroredOverlay, snapshot.locked, snapshot.gridEnabled]),
  };
  if (next.fingerprint === latestCommittedFingerprint && !pendingSave) return;
  pendingSave = next;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { void flushPresetSave().catch(() => {}); }, SAVE_DELAY_MS);
}
function flushPresetSave(): Promise<void> {
  if (saveTimer !== null) { window.clearTimeout(saveTimer); saveTimer = null; }
  const toWrite = pendingSave;
  pendingSave = null;
  if (!toWrite) return saveChain;
  // Every write waits for the previous one. A snapshot never overtakes a later one.
  saveChain = saveChain.catch(() => {}).then(async () => {
    try {
      await saveProjectOverlay(toWrite.projectId, toWrite.assetId, toWrite.snapshot);
      latestCommittedFingerprint = toWrite.fingerprint;
      D.log('info', 'day6', 'preset.saved', {
        projectId: toWrite.projectId, assetId: toWrite.assetId,
        xNormalized: Number(toWrite.snapshot.x.toFixed(4)),
        yNormalized: Number(toWrite.snapshot.y.toFixed(4)),
        opacity: toWrite.snapshot.opacityPercent, locked: toWrite.snapshot.locked,
      });
      // Home refreshes its gallery on re-entry; avoid re-rendering all cards per drag.
    } catch (error) {
      // Keep the failed snapshot available for a manual retry/next lifecycle checkpoint.
      if (!pendingSave) pendingSave = toWrite;
      D.log('error', 'day6', 'preset.save.failed', { message: String(error), projectId: toWrite.projectId });
      if (drawingOpen) el('sketch-camera-status').textContent = 'Неуспешен автоматичен запис — провери хранилището.';
      throw error;
    }
  });
  return saveChain;
}
/** Normalize position to scene dimensions without moving the image when the
 * PWA viewport changes. Older Day 5 presets remain in CSS pixels. */
function restorePreset(preset: OverlayPreset | undefined): void {
  const size = cameraSceneSize();
  artworkX = (preset?.x ?? 0) * (preset?.coordinateSpace === 'normalized-v1' ? size.width : 1);
  artworkY = (preset?.y ?? 0) * (preset?.coordinateSpace === 'normalized-v1' ? size.height : 1);
  artworkScale = (preset?.scale ?? 1) * 100;
  artworkAngle = preset?.rotationDeg ?? 0;
  opacity = preset?.opacityPercent ?? 50;
  artworkMirrored = preset?.mirroredOverlay ?? false;
  artworkLocked = preset?.locked ?? false;
  showGrid = preset?.gridEnabled ?? false;
  sceneSize = size;
  pendingSave = null;
  latestCommittedFingerprint = null;
  reflect();
}
function syncScenePosition(): void {
  if (!drawingOpen) return;
  const size = cameraSceneSize();
  if (sceneSize && (sceneSize.width !== size.width || sceneSize.height !== size.height)) {
    artworkX *= size.width / sceneSize.width;
    artworkY *= size.height / sceneSize.height;
    reflect();
    schedulePresetSave();
  }
  sceneSize = size;
}


/** iOS Home Screen sometimes reports a smaller dynamic viewport than the
 *  full physical viewport. Keep the camera behind the system safe areas too;
 *  interactive controls use CSS env(safe-area-inset-*).
 */
function syncDrawingViewport(): void {
  const surface = el<HTMLElement>('day4-screen');
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  const visible = Math.max(window.innerHeight, document.documentElement.clientHeight,
    window.visualViewport?.height ?? 0);
  const target = standalone ? Math.max(visible, window.screen.height) : visible;
  surface.style.height = `${target}px`;
}

function setMessage(message: string): void {
  el('day4-status').textContent = message;
  el('drawing-camera-status').textContent = message;
}
function reflect(): void {
  el<HTMLButtonElement>('btn-day4-open').disabled = entering || drawingOpen || isBusy();
  el<HTMLButtonElement>('btn-day4-exit').disabled = entering;
  el<HTMLButtonElement>('btn-day4-retry').hidden = cameraController.active || entering;
  el('drawing-grid').hidden = !showGrid;
  el<HTMLButtonElement>('btn-day4-grid').textContent = showGrid ? 'Скрий мрежата 3×3' : 'Покажи мрежата 3×3';
  // Video remains fixed to cover. Only the artwork can change scale.
  el<HTMLButtonElement>('btn-day4-fit').textContent = 'Размер 100%';
  el('drawing-artwork').style.setProperty('--artwork-scale', String(artworkScale / 100));
  el('drawing-artwork').style.setProperty('--artwork-x', `${artworkX}px`);
  el('drawing-artwork').style.setProperty('--artwork-y', `${artworkY}px`);
  el('drawing-artwork').style.setProperty('--artwork-angle', `${artworkAngle}deg`);
  el('drawing-artwork').style.setProperty('--artwork-mirror', artworkMirrored ? '-1' : '1');
  el<HTMLInputElement>('day4-scale').value = String(artworkScale);
  el('day4-scale-number').textContent = `${artworkScale}%`;
  el('drawing-artwork').style.opacity = String(opacity / 100);
  el<HTMLImageElement>('drawing-user-image').hidden = !userImageUrl;
  el('day4-opacity-number').textContent = `${opacity}%`;
  el<HTMLInputElement>('day4-opacity').value = String(opacity);
  el<HTMLInputElement>('sketch-camera-opacity').value = String(opacity);
  el('sketch-camera-opacity-value').textContent = `${opacity}%`;
  el<HTMLElement>('sketch-camera-opacity').closest<HTMLElement>('.sketch-camera-slider-wrap')?.style.setProperty('--opacity-percent', `${opacity}%`);
  const lockButton = el<HTMLButtonElement>('sketch-camera-lock');
  lockButton.setAttribute('aria-pressed', String(artworkLocked));
  // Swap the two original graphite SVG exports. An unlocked drawing displays
  // the open padlock (action: lock); a locked drawing shows the closed padlock
  // (action: unlock). The state remains owned by artworkLocked, not the image.
  const lockImage = lockButton.querySelector<HTMLImageElement>('img');
  const iconName = artworkLocked ? 'locked.svg' : 'lock.svg';
  if (lockImage && lockImage.dataset.icon !== iconName) {
    lockImage.src = `${import.meta.env.BASE_URL}ui/camera/${iconName}`;
    lockImage.dataset.icon = iconName;
  }
  lockButton.setAttribute('aria-label', artworkLocked ? 'Отключи позицията на рисунката' : 'Заключи позицията на рисунката');
  lockButton.title = artworkLocked ? 'Отключи рисунката' : 'Заключи рисунката';
  el<HTMLButtonElement>('sketch-camera-mirror').setAttribute('aria-pressed', String(artworkMirrored));
  el<HTMLButtonElement>('sketch-camera-grid').setAttribute('aria-pressed', String(showGrid));
  el<HTMLButtonElement>('sketch-camera-reset').disabled = artworkLocked;
  el('drawing-video-stage').classList.toggle('artwork-locked', artworkLocked);
}
function statusFromController(snapshot: CameraSnapshot): void {
  const names: Record<CameraSnapshot['phase'], string> = {
    stopped: 'Камерата е спряна', starting: 'Камерата се стартира…',
    active: 'Камерата е активна', suspended: 'Камерата е паузирана — ще опитаме възстановяване',
    error: 'Камерата е прекъсната — използвай „Опитай пак“',
  };
  if (drawingOpen) {
    setMessage(names[snapshot.phase]);
    const status = el('sketch-camera-status');
    status.textContent = snapshot.phase === 'error' ? names[snapshot.phase] : '';
  }
  reflect();
}
function safeAreaSnapshot(): Record<string, unknown> {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;pointer-events:none;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
  document.body.append(probe);
  const styles = getComputedStyle(probe);
  const result = {
    top: styles.paddingTop, right: styles.paddingRight,
    bottom: styles.paddingBottom, left: styles.paddingLeft,
    viewportWidth: innerWidth, viewportHeight: innerHeight,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
    dpr: window.devicePixelRatio,
    orientation: screen.orientation?.type ?? 'unknown',
  };
  probe.remove();
  return result;
}

/** Keep temporary previews reasonably small. This is not the final Day 5 import pipeline.
 *  Canvas re-encoding preserves alpha. The source bitmap is released promptly.
 */
async function preparePreview(file: Blob): Promise<{ url: string; width: number; height: number; sourceWidth: number; sourceHeight: number; reduced: boolean }> {
  if (file.size > 40 * 1024 * 1024) throw new Error('Файлът е твърде голям за тестовия импорт (макс. 40 MB).');
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) throw new Error('Празно изображение');
    if (longest <= 2048) {
      return { url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height, sourceWidth: bitmap.width, sourceHeight: bitmap.height, reduced: false };
    }
    const factor = 2048 / longest;
    const width = Math.max(1, Math.round(bitmap.width * factor));
    const height = Math.max(1, Math.round(bitmap.height * factor));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D не е наличен');
    ctx.drawImage(bitmap, 0, 0, width, height);
    const result = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Неуспешно мащабиране')), 'image/png');
    });
    canvas.width = 0; canvas.height = 0;
    return { url: URL.createObjectURL(result), width, height, sourceWidth: bitmap.width, sourceHeight: bitmap.height, reduced: true };
  } finally {
    bitmap.close();
  }
}

type TouchPoint = { x: number; y: number };
type DragOrigin = { point: TouchPoint; x: number; y: number };
type PinchOrigin = {
  midpoint: TouchPoint;
  distance: number;
  angle: number;
  scale: number;
  rotation: number;
  center: TouchPoint;
};
const fingers = new Map<number, TouchPoint>();
let dragOrigin: DragOrigin | null = null;
let pinchOrigin: PinchOrigin | null = null;

function midpoint(a: TouchPoint, b: TouchPoint): TouchPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function fingerDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function fingerAngle(a: TouchPoint, b: TouchPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
function artworkBaseCenter(): TouchPoint {
  const rect = el('drawing-video-stage').getBoundingClientRect();
  return { x: rect.width * 0.5, y: rect.height * 0.48 };
}
function rebaseFingers(): void {
  const values = [...fingers.values()];
  dragOrigin = null;
  pinchOrigin = null;
  if (values.length === 1) {
    dragOrigin = { point: { ...values[0] }, x: artworkX, y: artworkY };
  } else if (values.length >= 2) {
    const [a, b] = values;
    const base = artworkBaseCenter();
    pinchOrigin = {
      midpoint: midpoint(a, b), distance: Math.max(8, fingerDistance(a, b)),
      angle: fingerAngle(a, b), scale: artworkScale, rotation: artworkAngle,
      center: { x: base.x + artworkX, y: base.y + artworkY },
    };
  }
}
function clearFingers(): void {
  fingers.clear();
  dragOrigin = null;
  pinchOrigin = null;
}
/** The image stays under the two-finger midpoint while scaling and rotating.
 *  Camera frames and page scroll are never part of this transform.
 */
function updateArtworkGesture(): void {
  if (artworkLocked) return;
  const values = [...fingers.values()];
  if (values.length === 1 && dragOrigin) {
    artworkX = dragOrigin.x + values[0].x - dragOrigin.point.x;
    artworkY = dragOrigin.y + values[0].y - dragOrigin.point.y;
  } else if (values.length >= 2 && pinchOrigin) {
    const [a, b] = values;
    const mid = midpoint(a, b);
    const targetScale = clamp(pinchOrigin.scale * fingerDistance(a, b) / pinchOrigin.distance, 25, 250);
    const zoom = targetScale / pinchOrigin.scale;
    let delta = fingerAngle(a, b) - pinchOrigin.angle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const dx = pinchOrigin.center.x - pinchOrigin.midpoint.x;
    const dy = pinchOrigin.center.y - pinchOrigin.midpoint.y;
    const cos = Math.cos(delta), sin = Math.sin(delta);
    const center = {
      x: mid.x + zoom * (dx * cos - dy * sin),
      y: mid.y + zoom * (dx * sin + dy * cos),
    };
    const base = artworkBaseCenter();
    artworkX = center.x - base.x;
    artworkY = center.y - base.y;
    artworkScale = targetScale;
    artworkAngle = pinchOrigin.rotation + delta * 180 / Math.PI;
  }
  reflect();
  schedulePresetSave();
}
function initArtworkGestures(): void {
  const stage = el<HTMLElement>('drawing-video-stage');
  const toLocal = (event: PointerEvent): TouchPoint => {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  stage.addEventListener('pointerdown', (event) => {
    if (!drawingOpen || entering || cameraEditTransition.currentPhase !== 'idle' || artworkLocked || fingers.size >= 2) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    fingers.set(event.pointerId, toLocal(event));
    try { stage.setPointerCapture(event.pointerId); } catch { /* iOS may cancel a capture */ }
    rebaseFingers();
  });
  stage.addEventListener('pointermove', (event) => {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    fingers.set(event.pointerId, toLocal(event));
    updateArtworkGesture();
  });
  const finish = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId)) return;
    event.preventDefault();
    fingers.delete(event.pointerId);
    rebaseFingers(); // one remaining finger continues without a sudden jump
    if (fingers.size === 0) {
      void flushPresetSave().catch(() => {});
      D.log('info', 'day4', 'artwork.gesture', {
        x: Math.round(artworkX), y: Math.round(artworkY),
        scale: Math.round(artworkScale), rotation: Math.round(artworkAngle),
      });
    }
  };
  stage.addEventListener('pointerup', finish);
  stage.addEventListener('pointercancel', finish);
  stage.addEventListener('lostpointercapture', finish);
  // WebKit touch-action is the primary guard. This protects older iOS paths.
  stage.addEventListener('touchmove', (event) => {
    if (drawingOpen) event.preventDefault();
  }, { passive: false });
}

export async function openDrawing(): Promise<void> {
  if (entering || drawingOpen || isBusy()) return;
  entering = true;
  drawingOpen = true;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#090b0c');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', 'black-translucent');
  document.dispatchEvent(new Event('sketchyar:drawing:opened'));
  const screen = el('day4-screen');
  priorOverflow = document.body.style.overflow;
  screen.hidden = false;
  syncDrawingViewport();
  document.body.classList.add('drawing-open');
  document.documentElement.classList.add('drawing-open');
  document.body.style.overflow = 'hidden';
  sceneSize = cameraSceneSize();
  reflect();
  D.log('info', 'day4', 'drawing.open', { safeArea: safeAreaSnapshot() });
  try {
    await cameraController.start(el<HTMLVideoElement>('drawing-camera'), 'drawing-open');
    if (!cameraController.active) setMessage('Камерата не е активна. Натисни „Опитай пак“.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    D.log('error', 'day4', 'drawing.camera.failed', { message });
    setMessage(`Камера: ${message}`);
    el('sketch-camera-status').textContent = `Камера: ${message}`;
  } finally {
    entering = false;
    reflect();
  }
}

async function exit(): Promise<void> {
  if (!drawingOpen || entering || cameraEditTransition.editing) return;
  cameraEditTransition.end();
  el<HTMLElement>('day4-screen').inert = false;
  closeCameraChangeMenu();
  // Explicit Back/Save: persist outstanding gestures BEFORE clearing active IDs.
  // iOS can suspend a backgrounded tab; do not depend on pagehide alone.
  let saveError: unknown = null;
  try { await flushPresetSave(); } catch (error) { saveError = error; }
  drawingOpen = false;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f6f5f2');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', 'black-translucent');
  cameraController.stop('drawing-exit');
  // Day 5: the image and its original Blob remain stored; only this temporary preview is released.
  if (userImageUrl) {
    URL.revokeObjectURL(userImageUrl);
    userImageUrl = null;
    el<HTMLImageElement>('drawing-user-image').removeAttribute('src');
  }
  showGrid = false;
  pendingNewDrawing = false;
  activeProjectId = null;
  activeAssetId = null;
  pendingSave = null;
  latestCommittedFingerprint = null;
  sceneSize = null;
  // A failed save was reported at Back; do not block the next independent project.
  saveChain = saveChain.catch(() => {});
  artworkLocked = false;
  artworkMirrored = false;
  artworkScale = 100;
  artworkX = 0;
  artworkY = 0;
  artworkAngle = 0;
  el('day4-screen').hidden = true;
  document.body.classList.remove('drawing-open');
  document.documentElement.classList.remove('drawing-open');
  clearFingers();
  document.body.style.overflow = priorOverflow;
  await cameraController.attach(el<HTMLVideoElement>('camera-preview'));
  setMessage('Drawing затворен; камерата е освободена.');
  D.log('info', 'day4', 'drawing.close');
  document.dispatchEvent(new Event('sketchyar:drawing:closed'));
  reflect();
  if (saveError) window.alert('Последните промени не можаха да се запазят. Провери локалното хранилище, преди да продължиш.');
}

/** Day 6: reopen an original Blob with its saved overlay preset. */
export async function openSavedDrawing(projectId: string): Promise<void> {
  if (entering || drawingOpen || isBusy()) return;
  const img = el<HTMLImageElement>('drawing-user-image');
  let url: string | null = null;
  try {
    await assertProjectIntegrity(projectId);
    const { project, source, preset } = await getProjectImage(projectId);
    const selectedSketch = await getSelectedProcessedAsset(project, source);
    const prepared = await preparePreview(selectedSketch?.blob ?? source.blob);
    url = prepared.url;
    img.src = url;
    await img.decode();
    const oldUrl = userImageUrl;
    userImageUrl = url;
    url = null;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    activeProjectId = project.id;
    activeAssetId = source.id;
    // Avoid displaying the image in a temporary position while opening the camera.
    img.style.visibility = 'hidden';
    try { await openDrawing(); restorePreset(preset); }
    finally { img.style.visibility = ''; }
    D.log('info', 'day6', 'project.restored', {
      projectId, sourceBytes: source.byteSize, processedSelected: Boolean(selectedSketch),
      presetSpace: preset?.coordinateSpace ?? 'css-px',
      locked: artworkLocked, opacity, scale: artworkScale,
    });
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    D.log('error', 'day5', 'project.reopen.failed', { projectId, message: String(error) });
    window.alert(`Проектът не можа да бъде отворен: ${String(error)}`);
  }
}

/** Day 23: when editor sits over the active camera, swap ONLY the overlay bitmap.
 * Preserve the ongoing camera stream, camera placement and source-linked preset.
 */
export async function applySketchToActiveCamera(projectId: string, sourceId: string,
                                                png: Blob): Promise<boolean> {
  if (!drawingOpen || activeProjectId !== projectId || activeAssetId !== sourceId ||
      !cameraEditTransition.editing) return false;
  if (png.type !== 'image/png' || !png.size) throw new Error('Невалидна скица за камерата');
  const image = el<HTMLImageElement>('drawing-user-image');
  const oldURL = userImageUrl;
  const nextURL = URL.createObjectURL(png);
  try {
    image.src = nextURL;
    await image.decode();
    if (!drawingOpen || activeProjectId !== projectId || activeAssetId !== sourceId ||
        !cameraEditTransition.editing) {
      if (oldURL) image.src = oldURL;
      else image.removeAttribute('src');
      return false;
    }
    userImageUrl = nextURL;
    if (oldURL) URL.revokeObjectURL(oldURL);
    reflect(); // unchanged position/size/opacity/mirror/lock/grid
    D.log('info', 'day23', 'drawing.sketch.applied', { projectId, sourceId, bytes: png.size });
    return true;
  } catch (error) {
    if (userImageUrl !== nextURL) {
      if (oldURL) image.src = oldURL;
      else image.removeAttribute('src');
    }
    throw error;
  } finally {
    if (userImageUrl !== nextURL) URL.revokeObjectURL(nextURL);
  }
}

/** Day 23.1: apply the ORIGINAL source in the already-running camera.
 * All gesture and opacity state remain untouched; never start a second stream. */
export async function applyOriginalToActiveCamera(projectId: string, sourceId: string,
                                                  source: Blob): Promise<boolean> {
  if (!drawingOpen || activeProjectId !== projectId || activeAssetId !== sourceId ||
      !cameraEditTransition.editing) return false;
  if (!source || source.size <= 0 || !source.type.startsWith('image/'))
    throw new Error('Невалидна оригинална снимка');
  // preparePreview handles large photographs without changing the stored Blob.
  const prepared = await preparePreview(source);
  const nextURL = prepared.url;
  const image = el<HTMLImageElement>('drawing-user-image');
  const oldURL = userImageUrl;
  try {
    image.src = nextURL;
    await image.decode();
    if (!drawingOpen || activeProjectId !== projectId || activeAssetId !== sourceId ||
        !cameraEditTransition.editing) {
      if (oldURL) image.src = oldURL;
      else image.removeAttribute('src');
      return false;
    }
    userImageUrl = nextURL;
    if (oldURL) URL.revokeObjectURL(oldURL);
    reflect();
    D.log('info', 'day23.1', 'drawing.original.applied', { projectId, sourceId });
    return true;
  } catch (error) {
    if (userImageUrl !== nextURL) {
      if (oldURL) image.src = oldURL;
      else image.removeAttribute('src');
    }
    throw error;
  } finally {
    if (userImageUrl !== nextURL) URL.revokeObjectURL(nextURL);
  }
}

/** Called synchronously by the Homepage tap. The browser's native photo picker
 * opens FIRST; the new project enters Edit before Camera is started.
 * Cancelling the picker does not start a camera session or show the old demo grid.
 */
export function requestNewDrawing(): void {
  if (drawingOpen || entering || isBusy()) return;
  const input = el<HTMLInputElement>('drawing-image-file');
  pendingNewDrawing = true;
  input.value = ''; // selecting the same photo again must still trigger change
  D.log('info', 'day4', 'drawing.picker.open', { source: 'home' });
  try { input.click(); }
  catch (error) {
    pendingNewDrawing = false;
    D.log('warn', 'day4', 'drawing.picker.failed', { message: String(error) });
    window.alert('Неуспешно отваряне на галерията. Опитай отново.');
  }
}

/** Read-only camera -> sketch editor. Flush the exact current preset BEFORE navigation.
 * The camera and drawing overlay stay mounted and keep the same stream/Blob URL.
 * If saving or source loading fails, preserve the visible camera and old positioning.
 */
async function enterCameraSketchEditor(): Promise<void> {
  closeCameraChangeMenu();
  const token: CameraEditToken | null = cameraEditTransition.begin(activeProjectId, drawingOpen && !entering);
  if (!token) {
    el('sketch-camera-status').textContent = 'Избери изображение, преди да променяш скицата.';
    return;
  }
  const sourceId = activeAssetId;
  const before = snapshotOverlay();
  const screen = el<HTMLElement>('day4-screen');
  screen.inert = true; // block gestures and camera controls during async save + editor
  clearFingers();
  const stillCurrent = (): boolean => cameraEditTransition.isPending(token, activeProjectId, drawingOpen) &&
    activeAssetId === sourceId;
  const restore = (): void => {
    screen.inert = false;
    const same = sameDrawingPlacement(before, snapshotOverlay());
    D.log(same ? 'info' : 'warn', 'day21', 'camera.editor.returned', {
      projectId: token.projectId, placementUnchanged: same,
      reusedCamera: true, sourceUnchanged: activeAssetId === sourceId,
    });
    cameraEditTransition.end();
    // Reuse the existing video session; do not reacquire camera hardware.
    el<HTMLButtonElement>('sketch-camera-change-image').focus();
  };
  try {
    await flushPresetSave();
    if (!stillCurrent()) return;
    if (!cameraSketchEditOpener) throw new Error('Редакторът не е готов');
    const opened = await cameraSketchEditOpener(token.projectId,
      el<HTMLButtonElement>('sketch-camera-change-image'), stillCurrent, restore);
    if (!stillCurrent()) return;
    if (!opened || !cameraEditTransition.commit(token, activeProjectId, drawingOpen))
      throw new Error('Редакторът не можа да бъде отворен');
    D.log('info', 'day21', 'camera.editor.opened', { projectId: token.projectId,
      assetId: sourceId, reusedCamera: true });
  } catch (error) {
    D.log('warn', 'day21', 'camera.editor.failed', { message: String(error) });
    el('sketch-camera-status').textContent = 'Редакторът не можа да се отвори. Камерата и рисунката са запазени.';
  } finally {
    if (cameraEditTransition.currentPhase === 'pending') {
      cameraEditTransition.end();
      screen.inert = false;
      el<HTMLButtonElement>('sketch-camera-change-image').focus();
    }
  }
}

async function retry(): Promise<void> {
  if (!drawingOpen || entering) return;
  entering = true;
  reflect();
  try {
    await cameraController.start(el<HTMLVideoElement>('drawing-camera'), 'drawing-retry');
  } catch (error: unknown) {
    setMessage(`Неуспешно възстановяване: ${String(error)}`);
  } finally {
    entering = false;
    reflect();
  }
}

export function initDay4(): void {
  initArtworkGestures();
  window.addEventListener('resize', () => { if (drawingOpen) { syncDrawingViewport(); syncScenePosition(); } }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { if (drawingOpen) { syncDrawingViewport(); syncScenePosition(); } }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void flushPresetSave().catch(() => {}); });
  window.addEventListener('pagehide', () => { void flushPresetSave().catch(() => {}); });
  el('btn-day4-open').addEventListener('click', () => void openDrawing());
  el('btn-day4-exit').addEventListener('click', () => void exit());
  el('btn-day4-retry').addEventListener('click', () => void retry());
  el('btn-day4-grid').addEventListener('click', () => {
    // Camera-aligned 3x3 viewfinder, never part of the movable image or its opacity.
    showGrid = !showGrid;
    reflect();
    schedulePresetSave();
  });
  el('btn-day4-center').addEventListener('click', () => {
    artworkScale = 100; artworkX = 0; artworkY = 0; artworkAngle = 0;
    reflect();
    schedulePresetSave();
    D.log('info', 'day4', 'artwork.centered');
  });
  el('btn-day4-fit').addEventListener('click', () => {
    artworkScale = 100;
    reflect();
    schedulePresetSave();
    D.log('info', 'day4', 'artwork-scale-reset', { scalePercent: artworkScale });
  });
  el<HTMLInputElement>('day4-scale').addEventListener('input', (event) => {
    artworkScale = Math.max(25, Math.min(250, Number((event.currentTarget as HTMLInputElement).value)));
    reflect();
    schedulePresetSave();
  });
  el<HTMLInputElement>('day4-scale').addEventListener('change', () => {
    D.log('info', 'day4', 'artwork-scale', { scalePercent: artworkScale });
    void flushPresetSave().catch(() => {});
  });
  el<HTMLButtonElement>('btn-day4-image').addEventListener('click', () => {
    const input = el<HTMLInputElement>('drawing-image-file');
    pendingNewDrawing = false;
    input.value = '';
    input.click();
  });
  el<HTMLInputElement>('drawing-image-file').addEventListener('cancel', () => {
    pendingNewDrawing = false;
    D.log('info', 'day4', 'drawing.picker.cancelled');
  });
  el<HTMLInputElement>('drawing-image-file').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const isNewDrawing = pendingNewDrawing;
    pendingNewDrawing = false;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Избери файл с изображение.');
      input.value = '';
      return;
    }
    const img = el<HTMLImageElement>('drawing-user-image');
    const previousUrl = userImageUrl;
    let nextUrl: string | null = null;
    try {
      const prepared = await preparePreview(file);
      nextUrl = prepared.url;
      img.src = nextUrl;
      await img.decode();
      // Commit the original Blob + tiny preview in one IndexedDB transaction.
      // If storage fails, preserve the previous image and don't create an orphan project.
      const thumbnail = await makeThumbnail(img);
      // Complete pending writes on the old image before changing its active asset.
      await flushPresetSave();
      let savedProjectId = activeProjectId;
      let savedSourceId: string | null = null;
      let createdProject: ProjectRecord | null = null;
      if (isNewDrawing || !savedProjectId) {
        const project = await createImageProject(file, { width: prepared.sourceWidth, height: prepared.sourceHeight }, thumbnail);
        savedProjectId = project.id;
        savedSourceId = project.activeAssetId;
        createdProject = project;
        D.log('info', 'day5', 'project.created', { projectId: project.id, sourceBytes: file.size });
      } else {
        const project = await replaceProjectSource(savedProjectId, file, { width: prepared.sourceWidth, height: prepared.sourceHeight }, thumbnail);
        savedSourceId = project.activeAssetId;
        D.log('info', 'day5', 'project.source.replaced', { projectId: savedProjectId, sourceBytes: file.size });
      }
      if (isNewDrawing && createdProject) {
        // The temporary preview only created the thumbnail. Do not change the
        // active camera image/preset and do not call openDrawing/getUserMedia.
        if (previousUrl) img.src = previousUrl;
        else img.removeAttribute('src');
        if (nextUrl) { URL.revokeObjectURL(nextUrl); nextUrl = null; }
        document.dispatchEvent(new Event('sketchyar:projects:changed'));
        if (!newDrawingEditorOpener?.(createdProject)) {
          D.log('warn', 'day30.1', 'new-project.editor.unavailable', { projectId: createdProject.id });
          window.alert('Рисунката е записана. Отвори нейния молив от началния екран, за да редактираш.');
        } else D.log('info', 'day30.1', 'new-project.editor.opened', { projectId: createdProject.id });
        return;
      }
      activeProjectId = savedProjectId;
      activeAssetId = savedSourceId;
      latestCommittedFingerprint = null;
      pendingSave = null;
      userImageUrl = nextUrl;
      nextUrl = null;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      document.dispatchEvent(new Event('sketchyar:projects:changed'));
      artworkScale = 100;
      artworkX = 0;
      artworkY = 0;
      artworkAngle = 0;
      opacity = 50;
      // New source = new transform and unlocked position, even when replacing a photo.
      showGrid = false;
      artworkLocked = false;
      artworkMirrored = false;
      reflect();
      // New drawings enter Edit above; replacing a camera photo stays on Camera.
      sceneSize = cameraSceneSize();
      schedulePresetSave();
      void flushPresetSave().catch(() => {});
      setMessage('Изображението е заредено. Мрежата 3×3 управлява само визьора на камерата.');
      D.log('info', 'day4', 'drawing.image.loaded', {
        mimeType: file.type, sourceBytes: file.size, width: prepared.sourceWidth,
        height: prepared.sourceHeight, reducedTo2048: prepared.reduced,
      });
    } catch (error) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (previousUrl) img.src = previousUrl;
      else img.removeAttribute('src');
      setMessage(`Неуспешно зареждане/записване на изображение: ${String(error)}`);
      el('sketch-camera-status').textContent = `Снимката не можа да бъде записана: ${String(error)}`;
      if (isNewDrawing) window.alert('Снимката не можа да бъде заредена или записана. Провери свободното място и опитай отново.');
      D.log('warn', 'day4', 'drawing.image.failed', { message: String(error) });
    } finally { input.value = ''; }
  });
  el<HTMLInputElement>('day4-opacity').addEventListener('input', (event) => {
    opacity = Math.max(0, Math.min(100, Number((event.currentTarget as HTMLInputElement).value)));
    reflect();
    schedulePresetSave();
  });
  el<HTMLInputElement>('day4-opacity').addEventListener('change', () => {
    D.log('info', 'day4', 'test-overlay-opacity', { opacity });
    void flushPresetSave().catch(() => {});
  });
  el('btn-day4-capabilities').addEventListener('click', () => {
    const snapshot = cameraController.snapshot;
    const info = {
      settings: snapshot.settings,
      focusMode: snapshot.capabilities?.focusMode ?? null,
      exposureMode: snapshot.capabilities?.exposureMode ?? null,
      supportedFocus: snapshot.supportedConstraints?.focusMode ?? null,
      supportedExposure: snapshot.supportedConstraints?.exposureMode ?? null,
    };
    el('day4-capabilities').textContent = JSON.stringify(info, null, 2);
    D.log('info', 'day4', 'camera-capability-report', info);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !drawingOpen) return;
    if (cameraEditTransition.editing || cameraEditTransition.currentPhase === 'pending') return;
    if (changeMenuOpen) { event.preventDefault(); closeCameraChangeMenu(); el<HTMLButtonElement>('sketch-camera-change-image').focus(); return; }
    void exit();
  });
  // Day 5: Back closes the camera but leaves the source safely stored in IndexedDB.
  el<HTMLButtonElement>('sketch-camera-back').addEventListener('click', () => {
    void exit(); // Current temporary image is discarded when leaving Drawing.
  });
  // Day 21: two explicit actions; preserve the original native picker unchanged.
  el<HTMLButtonElement>('sketch-camera-change-image').addEventListener('click', toggleCameraChangeMenu);
  el<HTMLButtonElement>('sketch-camera-menu-edit').addEventListener('click', () => {
    void enterCameraSketchEditor();
  });
  el<HTMLButtonElement>('sketch-camera-menu-source').addEventListener('click', () => {
    closeCameraChangeMenu();
    // Synchronous forwarding within the same user tap — required for the iOS file picker.
    el<HTMLButtonElement>('btn-day4-image').click();
  });
  document.addEventListener('pointerdown', event => {
    if (!changeMenuOpen) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (el<HTMLElement>('sketch-camera-change-menu').contains(target) ||
        el<HTMLElement>('sketch-camera-change-image').contains(target)) return;
    closeCameraChangeMenu();
  });
  el<HTMLButtonElement>('sketch-camera-grid').addEventListener('click', () => {
    el<HTMLButtonElement>('btn-day4-grid').click();
  });
  el<HTMLButtonElement>('sketch-camera-reset').addEventListener('click', () => {
    if (!artworkLocked) el<HTMLButtonElement>('btn-day4-center').click();
  });
  el<HTMLButtonElement>('sketch-camera-mirror').addEventListener('click', () => {
    if (artworkLocked) return;
    artworkMirrored = !artworkMirrored;
    reflect();
    schedulePresetSave();
    void flushPresetSave().catch(() => {});
    D.log('info', 'day4', 'artwork.mirror', { mirrored: artworkMirrored });
  });
  el<HTMLButtonElement>('sketch-camera-lock').addEventListener('click', () => {
    artworkLocked = !artworkLocked;
    clearFingers();
    reflect();
    schedulePresetSave();
    void flushPresetSave().catch(() => {});
    D.log('info', 'day4', 'artwork.lock', { locked: artworkLocked });
  });
  el<HTMLInputElement>('sketch-camera-opacity').addEventListener('input', (event) => {
    opacity = clamp(Number((event.currentTarget as HTMLInputElement).value), 0, 100);
    reflect();
    schedulePresetSave();
  });
  el<HTMLInputElement>('sketch-camera-opacity').addEventListener('change', () => {
    D.log('info', 'day4', 'artwork.opacity', { opacity });
    void flushPresetSave().catch(() => {});
  });
  cameraController.subscribe(statusFromController);
  reflect();
  D.log('info', 'day4', 'drawing shell and camera lifecycle ready');
}
