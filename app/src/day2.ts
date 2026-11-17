import * as D from './diagnostics';
import { resetPythonWorker, runPythonCommand, type Command } from './python-client';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let stream: MediaStream | null = null;
let busy = false;

function cameraActive(): boolean {
  return !!stream?.getVideoTracks().some((track) => track.readyState === 'live');
}

function setStatus(value: string): void {
  el('day2-status').textContent = value;
}

function setBusy(value: boolean): void {
  busy = value;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-python]')) button.disabled = value;
}

function cameraStop(): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
  stream = null;
  const video = el<HTMLVideoElement>('camera-preview');
  video.pause();
  video.srcObject = null;
  el('btn-camera').textContent = 'Пусни камера';
  D.log('info', 'camera', 'stop');
}

async function cameraStart(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API не се поддържа');
  // No forced autofocus/exposure constraints; Day 4 will inspect support on this iPhone.
  const next = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  });
  stream = next;
  const video = el<HTMLVideoElement>('camera-preview');
  video.srcObject = next;
  video.playsInline = true;
  video.muted = true;
  try {
    await video.play();
    el('btn-camera').textContent = 'Спри камера';
    const settings = next.getVideoTracks()[0]?.getSettings();
    D.log('info', 'camera', 'start', { settings });
    setStatus('Камерата работи. Можеш да стартираш Pyodide с включена камера.');
  } catch (error) {
    cameraStop();
    throw error;
  }
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function startFrameMonitor(): () => Record<string, number> {
  const intervals: number[] = [];
  const video = el<HTMLVideoElement>('camera-preview');
  let previous = 0;
  let count = 0;
  let rafId = 0;
  let enabled = true;
  let videoFrames = 0;
  let pendingVideoFrame = 0;
  const start = performance.now();
  function raf(now: number): void {
    if (!enabled) return;
    if (previous && !document.hidden) intervals.push(now - previous);
    previous = now;
    count++;
    rafId = requestAnimationFrame(raf);
  }
  rafId = requestAnimationFrame(raf);
  if (cameraActive() && 'requestVideoFrameCallback' in video) {
    const onVideo: VideoFrameRequestCallback = () => {
      if (!enabled) return;
      videoFrames++;
      pendingVideoFrame = video.requestVideoFrameCallback(onVideo);
    };
    pendingVideoFrame = video.requestVideoFrameCallback(onVideo);
  }
  return () => {
    enabled = false;
    cancelAnimationFrame(rafId);
    if (pendingVideoFrame && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(pendingVideoFrame);
    const seconds = Math.max(0.001, (performance.now() - start) / 1000);
    const sorted = [...intervals].sort((a, b) => a - b);
    return {
      rafCallbacks: count,
      rafMedianMs: Math.round(median(intervals) * 10) / 10,
      rafP95Ms: sorted.length ? Math.round(sorted[Math.floor((sorted.length - 1) * 0.95)] * 10) / 10 : 0,
      rafIntervalsOver50Ms: intervals.filter((x) => x > 50).length,
      cameraFramesPerSec: Math.round((videoFrames / seconds) * 10) / 10,
    };
  };
}

async function run(command: Command): Promise<void> {
  if (busy) return;
  setBusy(true);
  const jobId = D.beginJob(`day2-${command}`);
  const t0 = performance.now();
  const stopFrameMonitor = startFrameMonitor();
  setStatus(`Работи ${command}... При първото зареждане на Pyodide е нужен интернет.`);
  try {
    const data = await runPythonCommand(command);
    const elapsed = Math.round(performance.now() - t0);
    const frames = stopFrameMonitor();
    const result = { command, elapsedMs: elapsed, cameraActive: cameraActive(), ...data, ui: frames };
    el('day2-result').textContent = JSON.stringify(result, null, 2);
    D.log('info', 'day2.result', `${command} готово`, result);
    D.recordMetric(`day2.${command}.total`, elapsed, 'ms', { camera: cameraActive() });
    if (typeof data.median_s === 'number') D.recordMetric(`day2.${command}.median`, data.median_s, 's');
    D.recordMetric(`day2.${command}.rafP95`, frames.rafP95Ms, 'ms');
    D.endJob(jobId, true);
    setStatus(`${command} завърши. Виж резултата и експортирай диагностиката.`);
  } catch (error: unknown) {
    const frames = stopFrameMonitor();
    const message = error instanceof Error ? error.message : String(error);
    D.log('error', 'day2.failed', command, { message, frames });
    el('day2-result').textContent = JSON.stringify({ command, error: message, frames }, null, 2);
    D.endJob(jobId, false);
    setStatus(`Неуспех: ${message}`);
  } finally {
    setBusy(false);
  }
}

export function initDay2(): void {
  const video = el<HTMLVideoElement>('camera-preview');
  video.setAttribute('playsinline', '');
  el('btn-camera').addEventListener('click', async () => {
    if (cameraActive()) {
      cameraStop();
      return;
    }
    try { await cameraStart(); }
    catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      D.log('error', 'camera', 'start failed', { message });
      setStatus(`Грешка при камера: ${message}`);
    }
  });
  for (const name of ['init', 'numpy', 'opencv', 'opencv10'] as const) {
    el(`btn-${name}`).addEventListener('click', () => void run(name));
  }
  el('btn-reset-python').addEventListener('click', () => {
    if (busy) return;
    resetPythonWorker();
    setStatus('Worker е освободен. Следващото инициализиране ще е cold start.');
  });
  // Day-2 scope: no robust background/foreground camera restoration yet (Day 4).
  addEventListener('pagehide', cameraStop);
  D.log('info', 'day2', 'camera + Pyodide spike UI готов');
}
