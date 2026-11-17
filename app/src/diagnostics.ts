// DiagnosticsService (Ден 1): ring buffer от събития и измервания, глобални error handlers,
// crash marker за незавършена задача и JSON export. Нищо не напуска устройството сам.
import type { EnvSnapshot } from './env';

export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface DiagEvent {
  sid: string; // session id: различава събития от различни стартирания
  t: string;
  ms: number; // performance.now() от началото на страницата
  level: Level;
  type: string;
  msg: string;
  data?: unknown;
}

export interface Metric {
  sid: string;
  t: string;
  name: string;
  value: number;
  unit: string;
  tags?: Record<string, string | number | boolean>;
}

const LOG_KEY = 'ard.log';
const METRIC_KEY = 'ard.metrics';
const JOB_KEY = 'ard.inflight';
const MAX = 200;
const MAX_DATA_CHARS = 2000;

export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const sessionId = newRequestId();

function load<T>(key: string): T[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

const events: DiagEvent[] = load<DiagEvent>(LOG_KEY); // съдържа и опашката от предишното стартиране
const metrics: Metric[] = load<Metric>(METRIC_KEY);
const listeners = new Set<() => void>();
let env: EnvSnapshot | null = null;
let saveTimer: number | undefined;

export function flush(): void {
  saveTimer = undefined;
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(events.slice(-MAX)));
    localStorage.setItem(METRIC_KEY, JSON.stringify(metrics.slice(-MAX)));
  } catch {
    /* хранилището е недостъпно или пълно: диагностиката остава само в паметта */
  }
}

function changed(): void {
  if (saveTimer === undefined) saveTimer = window.setTimeout(flush, 400);
  listeners.forEach((fn) => fn());
}

function errorReplacer(_key: string, value: unknown): unknown {
  return value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
}

function clip(data: unknown): unknown {
  try {
    const s = JSON.stringify(data, errorReplacer);
    if (s === undefined) return String(data);
    return s.length > MAX_DATA_CHARS ? `${s.slice(0, MAX_DATA_CHARS)}…` : JSON.parse(s);
  } catch {
    return String(data);
  }
}

export function log(level: Level, type: string, msg: string, data?: unknown): void {
  const e: DiagEvent = { sid: sessionId, t: new Date().toISOString(), ms: Math.round(performance.now()), level, type, msg };
  if (data !== undefined) e.data = clip(data);
  events.push(e);
  if (events.length > MAX) events.shift();
  console[level === 'debug' ? 'log' : level](`[${type}] ${msg}`, data ?? '');
  changed();
}

export function recordMetric(name: string, value: number, unit = 'ms', tags?: Metric['tags']): void {
  const m: Metric = { sid: sessionId, t: new Date().toISOString(), name, value: Math.round(value * 100) / 100, unit };
  if (tags) m.tags = tags;
  metrics.push(m);
  if (metrics.length > MAX) metrics.shift();
  log('debug', 'metric', `${name}=${m.value}${unit}`, tags);
}

export async function timed<T>(name: string, fn: () => Promise<T> | T, tags?: Metric['tags']): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    recordMetric(name, performance.now() - t0, 'ms', tags);
  }
}

// ---- crash marker: една тежка задача наведнъж ----
// Остатъчен маркер при следващо стартиране значи "задачата не е приключила" (причина: unknown, НЕ автоматично OOM).
export function beginJob(name: string): string {
  const id = newRequestId();
  try {
    localStorage.setItem(JOB_KEY, JSON.stringify({ id, name, startedAt: new Date().toISOString(), sid: sessionId }));
  } catch {
    /* без маркер */
  }
  log('info', 'job', `begin ${name}`, { id });
  return id;
}

export function endJob(id: string, ok = true): void {
  try {
    const job = JSON.parse(localStorage.getItem(JOB_KEY) ?? 'null') as { id?: string } | null;
    if (job?.id === id) localStorage.removeItem(JOB_KEY);
  } catch {
    /* без маркер */
  }
  log(ok ? 'info' : 'warn', 'job', `end ${id.slice(0, 8)} ok=${ok}`);
}

export function checkPreviousSession(): void {
  try {
    const job = JSON.parse(localStorage.getItem(JOB_KEY) ?? 'null') as Record<string, unknown> | null;
    if (job) {
      log('warn', 'unexpected_stop', `задачата "${String(job.name)}" не е приключила`, { ...job, cause: 'unknown' });
      localStorage.removeItem(JOB_KEY);
    }
  } catch {
    /* без маркер */
  }
}

export function installGlobalHandlers(): void {
  window.addEventListener('error', (e) =>
    log('error', 'window.error', e.message || 'error', { file: e.filename, line: e.lineno, col: e.colno, error: e.error }),
  );
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    log('error', 'unhandledrejection', reason instanceof Error ? reason.message : String(reason), { reason });
  });
  document.addEventListener('visibilitychange', () => {
    log('info', 'lifecycle', `visibility=${document.visibilityState}`);
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', (e) => {
    log('info', 'lifecycle', 'pagehide', { persisted: e.persisted });
    flush();
  });
  window.addEventListener('pageshow', (e) => log('info', 'lifecycle', 'pageshow', { persisted: e.persisted }));
  window.addEventListener('online', () => log('info', 'network', 'online'));
  window.addEventListener('offline', () => log('info', 'network', 'offline'));
}

// ---- четене и export ----
export const getEvents = (): readonly DiagEvent[] => events;

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setEnv(next: EnvSnapshot): void {
  env = next;
}

export function clearLog(): void {
  events.length = 0;
  metrics.length = 0;
  flush();
  changed();
}

// Синхронен, за да може navigator.share() да се вика директно от клик (Safari е строг за user gesture).
export function reportJson(): string {
  return JSON.stringify(
    {
      schema: 1,
      generatedAt: new Date().toISOString(),
      sessionId,
      app: { version: __APP_VERSION__, sha: __BUILD_SHA__, buildTime: __BUILD_TIME__, mode: import.meta.env.MODE },
      env,
      events,
      metrics,
    },
    null,
    2,
  );
}
