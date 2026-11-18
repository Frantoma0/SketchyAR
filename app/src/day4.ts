/** Day 4: a responsive fullscreen Drawing shell. Figma assets are integrated in Day 5,
 *  so this file deliberately contains no permanent UI icons or final visual layout.
 */
import * as D from './diagnostics';
import { cameraController, type CameraSnapshot } from './camera-controller';
import { isBusy } from './day2';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let drawingOpen = false;
let entering = false;
let priorOverflow = '';
let showGrid = true;
let artworkScale = 100;
let userImageUrl: string | null = null;
let opacity = 50;

function setMessage(message: string): void {
  el('day4-status').textContent = message;
  el('drawing-camera-status').textContent = message;
}
function reflect(): void {
  el<HTMLButtonElement>('btn-day4-open').disabled = entering || drawingOpen || isBusy();
  el<HTMLButtonElement>('btn-day4-exit').disabled = entering;
  el<HTMLButtonElement>('btn-day4-retry').hidden = cameraController.active || entering;
  el('drawing-grid').hidden = !showGrid || !!userImageUrl;
  el<HTMLButtonElement>('btn-day4-grid').textContent = userImageUrl ? 'Тестова мрежа' : showGrid ? 'Скрий мрежата' : 'Покажи мрежата';
  // Video remains fixed to cover. Only the artwork can change scale.
  el<HTMLButtonElement>('btn-day4-fit').textContent = 'Размер 100%';
  el('drawing-artwork').style.setProperty('--artwork-scale', String(artworkScale / 100));
  el<HTMLInputElement>('day4-scale').value = String(artworkScale);
  el('day4-scale-number').textContent = `${artworkScale}%`;
  el('drawing-artwork').style.opacity = String(opacity / 100);
  el<HTMLImageElement>('drawing-user-image').hidden = !userImageUrl;
  el('day4-opacity-number').textContent = `${opacity}%`;
  el<HTMLInputElement>('day4-opacity').value = String(opacity);
}
function statusFromController(snapshot: CameraSnapshot): void {
  const names: Record<CameraSnapshot['phase'], string> = {
    stopped: 'Камерата е спряна', starting: 'Камерата се стартира…',
    active: 'Камерата е активна', suspended: 'Камерата е паузирана — ще опитаме възстановяване',
    error: 'Камерата е прекъсната — използвай „Опитай пак“',
  };
  if (drawingOpen) setMessage(names[snapshot.phase]);
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
async function preparePreview(file: File): Promise<{ url: string; width: number; height: number; reduced: boolean }> {
  if (file.size > 40 * 1024 * 1024) throw new Error('Файлът е твърде голям за тестовия импорт (макс. 40 MB).');
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!longest) throw new Error('Празно изображение');
    if (longest <= 2048) {
      return { url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height, reduced: false };
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
    return { url: URL.createObjectURL(result), width, height, reduced: true };
  } finally {
    bitmap.close();
  }
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
  document.body.classList.add('drawing-open');
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
  } finally {
    entering = false;
    reflect();
  }
}

async function exit(): Promise<void> {
  if (!drawingOpen || entering) return;
  drawingOpen = false;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f6f5f2');
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', 'default');
  cameraController.stop('drawing-exit');
  // “Нова рисунка” opens a fresh, temporary drawing. No project has been saved yet.
  if (userImageUrl) {
    URL.revokeObjectURL(userImageUrl);
    userImageUrl = null;
    el<HTMLImageElement>('drawing-user-image').removeAttribute('src');
  }
  showGrid = true;
  artworkScale = 100;
  el('day4-screen').hidden = true;
  document.body.classList.remove('drawing-open');
  document.body.style.overflow = priorOverflow;
  await cameraController.attach(el<HTMLVideoElement>('camera-preview'));
  setMessage('Drawing затворен; камерата е освободена.');
  D.log('info', 'day4', 'drawing.close');
  document.dispatchEvent(new Event('sketchyar:drawing:closed'));
  reflect();
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
  el('btn-day4-open').addEventListener('click', () => void openDrawing());
  el('btn-day4-exit').addEventListener('click', () => void exit());
  el('btn-day4-retry').addEventListener('click', () => void retry());
  el('btn-day4-grid').addEventListener('click', () => {
    if (userImageUrl) {
      URL.revokeObjectURL(userImageUrl);
      userImageUrl = null;
      el<HTMLImageElement>('drawing-user-image').removeAttribute('src');
      showGrid = true;
    } else {
      showGrid = !showGrid;
    }
    reflect();
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
    el<HTMLInputElement>('drawing-image-file').click();
  });
  el<HTMLInputElement>('drawing-image-file').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
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
      userImageUrl = nextUrl;
      nextUrl = null;
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      artworkScale = 100;
      showGrid = false;
      reflect();
      setMessage('Изображението е заредено. Размерът и прозрачността влияят само на него.');
      D.log('info', 'day4', 'drawing.image.loaded', {
        mimeType: file.type, sourceBytes: file.size, width: prepared.width,
        height: prepared.height, reducedTo2048: prepared.reduced,
      });
    } catch (error) {
      if (nextUrl) URL.revokeObjectURL(nextUrl);
      if (previousUrl) img.src = previousUrl;
      else img.removeAttribute('src');
      setMessage(`Неуспешно зареждане на изображение: ${String(error)}`);
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
  cameraController.subscribe(statusFromController);
  reflect();
  D.log('info', 'day4', 'drawing shell and camera lifecycle ready');
}
