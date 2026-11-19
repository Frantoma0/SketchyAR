/** Typed request/response bridge. One logical task at a time (managed by UI). */
import { newRequestId, log } from './diagnostics';

export type Command = 'init' | 'numpy' | 'opencv' | 'opencv10' | 'day9';
type Message =
  | { id: string; kind: 'progress'; stage: string; ms: number }
  | { id: string; kind: 'done'; result: Record<string, unknown> }
  | { id: string; kind: 'error'; error: string; stack?: string };

let worker: Worker | null = null;
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
