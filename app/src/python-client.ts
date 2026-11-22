/** Typed request/response bridge. One logical task at a time (managed by UI). */
import { newRequestId, log } from './diagnostics';

export type Command = 'init' | 'numpy' | 'opencv' | 'opencv10' | 'day9' | 'day10-512' | 'day10-1024' | 'day11-512' | 'day11-1024' | 'day12-512' | 'day12-1024';
export interface ImageProcessRequest {
  gray: Uint8Array;
  width: number;
  height: number;
  sigma: number;
  low: number;
  high: number;
  detail?: 1 | 2 | 3 | 4 | 5;
  line?: 'thin' | 'normal' | 'thick';
}
export interface ImageProcessResult {
  requestId: string;
  mask: Uint8Array;
  width: number;
  height: number;
  inkPixels: number;
  pipelineVersion: string;
  bridgeVersion: string;
  processingMs: number;
  workerRequestMs: number;
}
type Message =
  | { id: string; kind: 'image-done'; result: Omit<ImageProcessResult, 'requestId'> }
  | { id: string; kind: 'progress'; stage: string; ms: number }
  | { id: string; kind: 'done'; result: Record<string, unknown> }
  | { id: string; kind: 'error'; error: string; stack?: string };

let worker: Worker | null = null;
const pendingImages = new Map<string, {
  resolve: (data: ImageProcessResult) => void;
  reject: (reason: Error) => void;
  timeout: number;
}>();
const pending = new Map<string, {
  resolve: (data: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
  timeout: number;
}>();

function rejectAll(reason: Error): void {
  for (const job of pending.values()) {
    clearTimeout(job.timeout);
    job.reject(reason);
  }
  pending.clear();
  for (const job of pendingImages.values()) {
    clearTimeout(job.timeout);
    job.reject(reason);
  }
  pendingImages.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./python-worker.ts', import.meta.url), { type: 'module', name: 'sketchyar-pyodide' });
  worker.onmessage = (event: MessageEvent<Message>) => {
    const msg = event.data;
    if (msg.kind === 'progress') {
      log('info', 'pyodide.stage', `${msg.stage}: ${msg.ms} ms`, { requestId: msg.id });
      return;
    }
    if (msg.kind === 'image-done') {
      const imageJob = pendingImages.get(msg.id);
      if (!imageJob) return; // stale/cancelled request
      clearTimeout(imageJob.timeout);
      pendingImages.delete(msg.id);
      imageJob.resolve({ ...msg.result, requestId: msg.id });
      return;
    }
    const imageErrorJob = pendingImages.get(msg.id);
    if (imageErrorJob && msg.kind === 'error') {
      clearTimeout(imageErrorJob.timeout);
      pendingImages.delete(msg.id);
      imageErrorJob.reject(new Error(msg.error));
      return;
    }
    const job = pending.get(msg.id);
    if (!job) return;
    clearTimeout(job.timeout);
    pending.delete(msg.id);
    if (msg.kind === 'done') job.resolve(msg.result);
    else job.reject(new Error(msg.error));
  };
  worker.onerror = (event) => {
    const error = new Error(`Worker exception: ${event.message}`);
    log('error', 'pyodide.worker', error.message, { file: event.filename, line: event.lineno });
    rejectAll(error);
    worker?.terminate();
    worker = null;
  };
  worker.onmessageerror = () => {
    const error = new Error('Worker message could not be deserialized');
    log('error', 'pyodide.worker', error.message);
    rejectAll(error);
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export async function runPythonCommand(command: Command): Promise<Record<string, unknown>> {
  const w = ensureWorker();
  const id = newRequestId();
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      const reason = new Error('Pyodide timeout след 180 s; рестартирай Worker и виж диагностиката');
      log('error', 'pyodide.timeout', reason.message, { requestId: id, command });
      entry.reject(reason);
      resetPythonWorker();
    }, 180_000);
    pending.set(id, { resolve, reject, timeout });
    w.postMessage({ id, command });
  });
}

export function resetPythonWorker(): void {
  worker?.terminate();
  worker = null;
  rejectAll(new Error('Pyodide Worker беше рестартиран'));
  log('info', 'pyodide.worker', 'Worker освободен; следващата заявка ще е cold start');
}


/** Day 13 binary grayscale bridge. One-time transfer of <=1 MiB; never log pixels.
 * A consumer must also check source identity before saving or displaying results.
 */
export function runPythonImage(request: ImageProcessRequest): Promise<ImageProcessResult> {
  const { gray, width, height, sigma, low, high, detail = 3, line = 'normal' } = request;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 3 || height < 3 ||
      width > 1024 || height > 1024 || width * height > 1024 * 1024 || gray.byteLength !== width * height)
    return Promise.reject(new Error('Невалиден 8-bit grayscale буфер'));
  if (!['thin', 'normal', 'thick'].includes(line) || !Number.isInteger(detail) || detail < 1 || detail > 5 || ![sigma, low, high].every(Number.isFinite) || sigma < .15 || sigma > 12 || low < 0 || high <= 0 || low > high)
    return Promise.reject(new Error('Невалидни параметри на обработката'));
  const w = ensureWorker();
  const id = newRequestId();
  // Isolate caller-owned bytes; the transfer detaches only this defensive copy.
  const input = gray.slice();
  return new Promise<ImageProcessResult>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const job = pendingImages.get(id);
      if (!job) return;
      pendingImages.delete(id);
      const error = new Error('Day 13 image processing timeout (180 s)');
      job.reject(error);
      resetPythonWorker();
    }, 180_000);
    pendingImages.set(id, { resolve, reject, timeout });
    try {
      w.postMessage({ id, command: 'day13-process', width, height, gray: input, sigma, low, high, detail, line }, [input.buffer]);
    } catch (error) {
      clearTimeout(timeout);
      pendingImages.delete(id);
      reject(error);
    }
  });
}
