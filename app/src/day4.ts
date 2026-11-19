/** Day 4.18: Figma camera controls, gallery-first creation, new image button and Home navigation.
 * All camera lifecycle and gesture code remains separate from the decorative SVG assets.
 */
import * as D from './diagnostics';
import { cameraController, type CameraSnapshot } from './camera-controller';
import { isBusy } from './day2';
import { createImageProject, replaceProjectSource, getProjectImage, assertProjectIntegrity } from './storage/project-store';
import { makeThumbnail } from './storage/thumbnail';

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
  el<HTMLButtonElement>('sketch-camera-lock').setAttribute('aria-pressed', String(artworkLocked));
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
}
function initArtworkGestures(): void {
  const stage = el<HTMLElement>('drawing-video-stage');
  const toLocal = (event: PointerEvent): TouchPoint => {
    const rect = stage.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  stage.addEventListener('pointerdown', (event) => {
    if (!drawingOpen || entering || artworkLocked || fingers.size >= 2) return;
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
  if (!drawingOpen || entering) return;
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
}

/** Day 5: reopen an existing source Blob after a true reload/force-close.
 *  Current transform changes are not yet persisted: that is the Day 6 task.
 */
export async function openSavedDrawing(projectId: string): Promise<void> {
  if (entering || drawingOpen || isBusy()) return;
  const img = el<HTMLImageElement>('drawing-user-image');
  let url: string | null = null;
  try {
    await assertProjectIntegrity(projectId);
    const { project, source, preset } = await getProjectImage(projectId);
    const prepared = await preparePreview(source.blob);
    url = prepared.url;
    img.src = url;
    await img.decode();
    const oldUrl = userImageUrl;
    userImageUrl = url;
    url = null;
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    activeProjectId = project.id;
    artworkScale = (preset?.scale ?? 1) * 100;
    artworkX = preset?.x ?? 0;
    artworkY = preset?.y ?? 0;
    artworkAngle = preset?.rotationDeg ?? 0;
    opacity = preset?.opacityPercent ?? 50;
    artworkMirrored = preset?.mirroredOverlay ?? false;
    artworkLocked = preset?.locked ?? false;
    showGrid = preset?.gridEnabled ?? false;
    reflect();
    await openDrawing();
    D.log('info', 'day5', 'project.reopened', { projectId, sourceBytes: source.byteSize });
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    D.log('error', 'day5', 'project.reopen.failed', { projectId, message: String(error) });
    window.alert(`Проектът не можа да бъде отворен: ${String(error)}`);
  }
}

/** Called synchronously by the Homepage tap. The browser's native photo picker
 * opens FIRST; the Drawing view and camera open only after a valid image is chosen.
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
  window.addEventListener('resize', () => { if (drawingOpen) syncDrawingViewport(); }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { if (drawingOpen) syncDrawingViewport(); }, { passive: true });
  el('btn-day4-open').addEventListener('click', () => void openDrawing());
  el('btn-day4-exit').addEventListener('click', () => void exit());
  el('btn-day4-retry').addEventListener('click', () => void retry());
  el('btn-day4-grid').addEventListener('click', () => {
    // Camera-aligned 3x3 viewfinder, never part of the movable image or its opacity.
    showGrid = !showGrid;
    reflect();
  });
  el('btn-day4-center').addEventListener('click', () => {
    artworkScale = 100; artworkX = 0; artworkY = 0; artworkAngle = 0;
    reflect();
    D.log('info', 'day4', 'artwork.centered');
  });
  el('btn-day4-fit').addEventListener('click', () => {
    artworkScale = 100;
    reflect();
    D.log('info', 'day4', 'artwork-scale-reset', { scalePercent: artworkScale });
  });
  el<HTMLInputElement>('day4-scale').addEventListener('input', (event) => {
    artworkScale = Math.max(25, Math.min(250, Number((event.currentTarget as HTMLInputElement).value)));
    reflect();
  });
  el<HTMLInputElement>('day4-scale').addEventListener('change', () => {
    D.log('info', 'day4', 'artwork-scale', { scalePercent: artworkScale });
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
      let savedProjectId = activeProjectId;
      if (isNewDrawing || !savedProjectId) {
        const project = await createImageProject(file, { width: prepared.sourceWidth, height: prepared.sourceHeight }, thumbnail);
        savedProjectId = project.id;
        D.log('info', 'day5', 'project.created', { projectId: project.id, sourceBytes: file.size });
      } else {
        await replaceProjectSource(savedProjectId, file, { width: prepared.sourceWidth, height: prepared.sourceHeight }, thumbnail);
        D.log('info', 'day5', 'project.source.replaced', { projectId: savedProjectId, sourceBytes: file.size });
      }
      activeProjectId = savedProjectId;
      userImageUrl = nextUrl;
      nextUrl = null;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      document.dispatchEvent(new Event('sketchyar:projects:changed'));
      artworkScale = 100;
      artworkX = 0;
      artworkY = 0;
      artworkAngle = 0;
      if (isNewDrawing) {
        showGrid = false; // rule-of-thirds starts off for each new drawing
        artworkLocked = false;
        artworkMirrored = false;
      }
      reflect();
      if (isNewDrawing) await openDrawing();
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
  });
  el<HTMLInputElement>('day4-opacity').addEventListener('change', () => {
    D.log('info', 'day4', 'test-overlay-opacity', { opacity });
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
    if (event.key === 'Escape' && drawingOpen) void exit();
  });
  // Day 5: Back closes the camera but leaves the source safely stored in IndexedDB.
  el<HTMLButtonElement>('sketch-camera-back').addEventListener('click', () => {
    void exit(); // Current temporary image is discarded when leaving Drawing.
  });
  el<HTMLButtonElement>('sketch-camera-change-image').addEventListener('click', () => {
    // Keep the same user-gesture picker and image-loading path used by the former left button.
    // Cancelling leaves the current image and camera untouched.
    el<HTMLButtonElement>('btn-day4-image').click();
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
    D.log('info', 'day4', 'artwork.mirror', { mirrored: artworkMirrored });
  });
  el<HTMLButtonElement>('sketch-camera-lock').addEventListener('click', () => {
    artworkLocked = !artworkLocked;
    clearFingers();
    reflect();
    D.log('info', 'day4', 'artwork.lock', { locked: artworkLocked });
  });
  el<HTMLInputElement>('sketch-camera-opacity').addEventListener('input', (event) => {
    opacity = clamp(Number((event.currentTarget as HTMLInputElement).value), 0, 100);
    reflect();
  });
  el<HTMLInputElement>('sketch-camera-opacity').addEventListener('change', () => {
    D.log('info', 'day4', 'artwork.opacity', { opacity });
  });
  cameraController.subscribe(statusFromController);
  reflect();
  D.log('info', 'day4', 'drawing shell and camera lifecycle ready');
}
