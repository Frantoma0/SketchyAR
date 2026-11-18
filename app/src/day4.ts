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
let fit: 'cover' | 'contain' = 'cover';
let opacity = 50;

function setMessage(message: string): void {
  el('day4-status').textContent = message;
  el('drawing-camera-status').textContent = message;
}
function reflect(): void {
  el<HTMLButtonElement>('btn-day4-open').disabled = entering || drawingOpen || isBusy();
  el<HTMLButtonElement>('btn-day4-exit').disabled = entering;
  el<HTMLButtonElement>('btn-day4-retry').hidden = cameraController.active || entering;
  el('drawing-grid').hidden = !showGrid;
  el<HTMLButtonElement>('btn-day4-grid').textContent = showGrid ? 'Скрий мрежата' : 'Покажи мрежата';
  el<HTMLButtonElement>('btn-day4-fit').textContent = fit === 'cover' ? 'Кадър: запълни' : 'Кадър: побери';
  el<HTMLVideoElement>('drawing-camera').style.objectFit = fit;
  el('drawing-grid').style.opacity = String(opacity / 100);
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

async function enter(): Promise<void> {
  if (entering || drawingOpen || isBusy()) return;
  entering = true;
  drawingOpen = true;
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
  cameraController.stop('drawing-exit');
  el('day4-screen').hidden = true;
  document.body.classList.remove('drawing-open');
  document.body.style.overflow = priorOverflow;
  await cameraController.attach(el<HTMLVideoElement>('camera-preview'));
  setMessage('Drawing затворен; камерата е освободена.');
  D.log('info', 'day4', 'drawing.close');
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
  el('btn-day4-open').addEventListener('click', () => void enter());
  el('btn-day4-exit').addEventListener('click', () => void exit());
  el('btn-day4-retry').addEventListener('click', () => void retry());
  el('btn-day4-grid').addEventListener('click', () => {
    showGrid = !showGrid;
    reflect();
  });
  el('btn-day4-fit').addEventListener('click', () => {
    fit = fit === 'cover' ? 'contain' : 'cover';
    reflect();
    D.log('info', 'day4', 'camera-fit', { fit });
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
