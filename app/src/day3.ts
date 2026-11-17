/** Day 3: realistic fullscreen camera + optional 2048px drawing overlay under Pyodide load.
 *  Fixed camera capture resolution makes preview/fullscreen results comparable.
 *  Memory values are buffer-size estimates; Safari process RAM is NOT observable here.
 */
import * as D from './diagnostics';
import { cameraActive, cameraStart, cameraStop, isBusy, setBusy } from './day2';
import { monitorFrames } from './day3-monitor';
import { runPythonCommand } from './python-client';

type Mode = 'off' | 'preview' | 'fullscreen';
type Work = 'idle' | 'numpy' | 'opencv';
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const median = (a: number[]): number => !a.length ? 0 : [...a].sort((x, y) => x-y)[Math.floor((a.length-1)/2)];
let mode: Mode = 'preview';
let testActive = false;
let cancelled = false;
let overlayUrl: string | null = null;
let currentOverlaySize = 0;
let overlayGeneration = 0;
let oldOverflow = '';
let switchingMode = false;

function notify(message: string): void {
  get('day3-status').textContent = message;
  get('day3-full-status').textContent = message;
}
function reflectButtons(): void {
  get('day3-mode').textContent = mode === 'fullscreen' ? 'Цял екран' : mode === 'preview' ? 'Малък прозорец' : 'Камера изключена';
  get<HTMLButtonElement>('btn-day3-stop').disabled = !testActive;
  get<HTMLButtonElement>('btn-day3-full-stop').disabled = !testActive;
  const canSwitch = !testActive && !isBusy() && !switchingMode;
  for (const id of ['btn-day3-preview', 'btn-day3-fullscreen', 'btn-day3-off', 'btn-day3-exit', 'day3-overlay-size']) {
    get<HTMLButtonElement | HTMLSelectElement>(id).disabled = !canSwitch;
  }
}
function exitFullscreen(): void {
  if (mode !== 'fullscreen') return;
  const shell = get('day3-fullscreen');
  const stage = get('camera-stage');
  get('camera-container').append(stage);
  shell.hidden = true;
  document.body.classList.remove('day3-fullscreen-open');
  document.body.style.overflow = oldOverflow;
}
function enterFullscreen(): void {
  const shell = get('day3-fullscreen');
  const stage = get('camera-stage');
  oldOverflow = document.body.style.overflow;
  shell.hidden = false;
  get('day3-full-stage').append(stage);
  document.body.classList.add('day3-fullscreen-open');
  document.body.style.overflow = 'hidden';
}
async function setMode(next: Mode): Promise<void> {
  if (testActive || isBusy() || switchingMode) return;
  switchingMode = true;
  reflectButtons();
  try {
    if (mode === 'fullscreen') exitFullscreen();
    if (next === 'off') cameraStop();
    else if (!cameraActive()) await cameraStart();
    mode = next;
    if (next === 'fullscreen') enterFullscreen();
    const source = get<HTMLVideoElement>('camera-preview').srcObject;
    D.log('info', 'day3.mode', `режим=${mode}`, { cameraSettings: cameraActive() && source instanceof MediaStream ? source.getVideoTracks()[0]?.getSettings() : null });
    notify(`Режим: ${mode === 'fullscreen' ? 'цял екран' : mode === 'preview' ? 'малък прозорец' : 'камера изключена'}.`);
  } finally {
    switchingMode = false;
    reflectButtons();
  }
}

function makeArtwork(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.clearRect(0, 0, size, size); // genuine transparent pixels, no white page
  const s = size / 1024;
  ctx.save(); ctx.scale(s, s);
  ctx.strokeStyle = '#ffdf77';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(135, 760); ctx.bezierCurveTo(180, 490, 360, 220, 515, 280);
  ctx.bezierCurveTo(690, 300, 860, 530, 895, 790);
  ctx.moveTo(265, 660); ctx.bezierCurveTo(330, 480, 440, 450, 540, 440);
  ctx.bezierCurveTo(670, 410, 770, 570, 795, 670);
  ctx.moveTo(175, 760); ctx.lineTo(885, 760);
  ctx.stroke();
  ctx.strokeStyle = '#87edeb'; ctx.lineWidth = 5;
  for (let i = 0; i < 7; i++) {
    const x = 270 + i * 77;
    ctx.beginPath(); ctx.moveTo(x, 750 - i % 2 * 20); ctx.lineTo(x, 580 - (i % 3) * 30); ctx.stroke();
  }
  ctx.restore();
}
async function setOverlay(size: number): Promise<void> {
  const generation = ++overlayGeneration;
  const img = get<HTMLImageElement>('day3-art');
  if (size === 0) {
    img.removeAttribute('src');
    img.hidden = true;
    if (overlayUrl) URL.revokeObjectURL(overlayUrl);
    overlayUrl = null; currentOverlaySize = 0;
    D.log('info', 'day3.overlay', 'изключено');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D не е наличен');
  makeArtwork(context, size);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('PNG не може да се генерира')), 'image/png'));
  canvas.width = canvas.height = 0; // release large 2D surface backing store
  if (generation !== overlayGeneration) return;
  const url = URL.createObjectURL(blob);
  img.src = url;
  img.hidden = false;
  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) { resolve(); return; }
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Overlay не се декодира'));
  });
  if (overlayUrl) URL.revokeObjectURL(overlayUrl);
  overlayUrl = url;
  currentOverlaySize = size;
  D.log('info', 'day3.overlay', `размер=${size}x${size}`, {
    compressedBlobBytes: blob.size,
    oneRgbaBufferEstimateMiB: Math.round(size * size * 4 / 1024 / 1024 * 10) / 10,
    note: 'НЕ е измерена RAM; GPU/process overhead може да е по-висок',
  });
}

async function runTest(work: Work): Promise<void> {
  if (testActive || isBusy()) return;
  // Off mode is allowed to obtain the pure Python baseline; video only for other modes.
  if (mode !== 'off' && !cameraActive()) {
    notify('Камерата не е включена. Избери режим отново.');
    return;
  }
  testActive = true;
  cancelled = false;
  setBusy(true);
  reflectButtons();
  const job = D.beginJob(`day3-${mode}-${work}`);
  const video = get<HTMLVideoElement>('camera-preview');
  const stopFrames = monitorFrames(video, cameraActive());
  const begun = performance.now();
  const targetMs = work === 'idle' ? 12_000 : 20_000;
  const timings: number[] = [];
  let batches = 0;
  let operations = 0;
  let errorMessage: string | null = null;
  let interrupted = false;
  D.log('info', 'day3.test.start', `${mode}/${work}`, { targetMs, overlaySize: currentOverlaySize,
    videoSettings: cameraActive() ? video.srcObject instanceof MediaStream ? video.srcObject.getVideoTracks()[0]?.getSettings() : null : null });
  const onHidden = () => { if (document.hidden) { interrupted = true; cancelled = true; } };
  document.addEventListener('visibilitychange', onHidden);
  try {
    if (work === 'idle') {
      while (performance.now() - begun < targetMs && !cancelled) await sleep(100);
    } else {
      while (performance.now() - begun < targetMs && !cancelled) {
        const start = performance.now();
        const result = await runPythonCommand(work === 'numpy' ? 'numpy' : 'opencv10');
        timings.push(performance.now() - start);
        batches++;
        operations += work === 'numpy' ? 5 : 10;
        if (batches % 5 === 0) notify(`${work}: ${batches} серии / ${operations} обработки…`);
        if (result && typeof result.median_s !== 'number') throw new Error('Липсва median_s в Python резултата');
        await sleep(0); // allow UI to process input/paint between requests
      }
    }
  } catch (error: unknown) {
    errorMessage = error instanceof Error ? error.message : String(error);
    D.log('error', 'day3.test.error', `${mode}/${work}`, { errorMessage });
  } finally {
    document.removeEventListener('visibilitychange', onHidden);
    const ui = stopFrames();
    const result = {
      test: `day3.${work}`, mode, overlayPx: currentOverlaySize,
      cameraActive: cameraActive(),
      plannedDurationMs: targetMs,
      elapsedMs: Math.round(performance.now() - begun),
      batches, operations,
      medianBatchMs: batches ? Math.round(median(timings)) : null,
      maxBatchMs: batches ? Math.round(Math.max(...timings)) : null,
      stoppedManually: cancelled && !interrupted,
      interruptedByBackground: interrupted,
      error: errorMessage,
      validForG1: !cancelled && !interrupted && !errorMessage && ui.videoCallbackCount > 0 && mode !== 'off',
      ui,
    };
    D.log(errorMessage ? 'error' : cancelled ? 'warn' : 'info', 'day3.result', `${mode}/${work}`, result);
    D.recordMetric(`day3.${mode}.${work}.rafP95`, ui.rafP95Ms, 'ms');
    if (ui.videoFps !== null) D.recordMetric(`day3.${mode}.${work}.videoFps`, ui.videoFps, 'fps');
    D.recordMetric(`day3.${mode}.${work}.elapsed`, result.elapsedMs, 'ms');
    get('day3-result').textContent = JSON.stringify(result, null, 2);
    D.endJob(job, !errorMessage && !interrupted);
    notify(errorMessage ? `Грешка: ${errorMessage}` : cancelled ? 'Тестът беше прекъснат — не го използвай за G1.' : `Готово: ${mode}/${work}. Изнеси диагностичния JSON.`);
    testActive = false;
    setBusy(false);
    reflectButtons();
  }
}

export function initDay3(): void {
  const overlaySelect = get<HTMLSelectElement>('day3-overlay-size');
  overlaySelect.addEventListener('change', () => {
    void setOverlay(Number(overlaySelect.value)).catch((err: unknown) => {
      D.log('error', 'day3.overlay', 'overlay failed', err);
      notify(`Грешка при overlay: ${String(err)}`);
    });
  });
  get('btn-day3-off').addEventListener('click', () => void setMode('off').catch(reportModeError));
  get('btn-day3-preview').addEventListener('click', () => void setMode('preview').catch(reportModeError));
  get('btn-day3-fullscreen').addEventListener('click', () => void setMode('fullscreen').catch(reportModeError));
  get('btn-day3-exit').addEventListener('click', () => void setMode('preview').catch(reportModeError));
  get('btn-day3-idle').addEventListener('click', () => void runTest('idle'));
  get('btn-day3-numpy').addEventListener('click', () => void runTest('numpy'));
  get('btn-day3-opencv').addEventListener('click', () => void runTest('opencv'));
  get('btn-day3-full-idle').addEventListener('click', () => void runTest('idle'));
  get('btn-day3-full-numpy').addEventListener('click', () => void runTest('numpy'));
  get('btn-day3-full-opencv').addEventListener('click', () => void runTest('opencv'));
  get('btn-day3-stop').addEventListener('click', () => { cancelled = true; notify('Спиране след текущата Python серия…'); });
  get('btn-day3-full-stop').addEventListener('click', () => { cancelled = true; notify('Спиране след текущата Python серия…'); });
  // No 2048px bitmap allocation at application boot; load it only when selected.
  reflectButtons();
  D.log('info', 'day3', 'fullscreen stress instrumentation ready');
}
function reportModeError(error: unknown): void {
  D.log('error', 'day3', 'mode/overlay failure', error);
  notify(`Грешка: ${error instanceof Error ? error.message : String(error)}`);
}
