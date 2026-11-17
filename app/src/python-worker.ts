/** SketchyAR Day 2: Pyodide in a module Worker. No code runs until the UI requests it.
 *  This spike intentionally uses the upstream CDN. Offline vendoring is planned for Day 19.
 */
import proxySource from '../../python_engine/ar_drawing/spike_proxy.py?raw';

const PYODIDE_VERSION = '314.0.8';
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

interface PyodideRuntime {
  loadPackage: (name: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
  globals: { set: (name: string, value: unknown) => void };
  version: string;
}
type WorkerCommand = 'init' | 'numpy' | 'opencv' | 'opencv10';
type Incoming = { id: string; command: WorkerCommand };
type Progress = { id: string; kind: 'progress'; stage: string; ms: number };
type Done = { id: string; kind: 'done'; command: WorkerCommand; result: Record<string, unknown> };
type Failure = { id: string; kind: 'error'; command: WorkerCommand; error: string; stack?: string };

const workerScope = self as unknown as {
  postMessage: (message: Progress | Done | Failure) => void;
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
};
let runtimePromise: Promise<PyodideRuntime> | null = null;
let startupReport: Record<string, unknown> | null = null;
let opencvReady = false;

function progress(id: string, stage: string, ms: number): void {
  workerScope.postMessage({ id, kind: 'progress', stage, ms: Math.round(ms) } satisfies Progress);
}

async function ensureRuntime(id: string): Promise<PyodideRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const started = performance.now();
      // Vite must not rewrite this version-pinned, cross-origin dynamic module import.
      const loader = (await import(/* @vite-ignore */ `${PYODIDE_BASE}pyodide.mjs`)) as {
        loadPyodide: (opts: { indexURL: string }) => Promise<PyodideRuntime>;
      };
      progress(id, 'loader', performance.now() - started);
      const pyodide = await loader.loadPyodide({ indexURL: PYODIDE_BASE });
      const coreMs = performance.now() - started;
      progress(id, 'python-runtime', coreMs);
      await pyodide.loadPackage('numpy');
      const numpyMs = performance.now() - started - coreMs;
      progress(id, 'numpy', numpyMs);
      pyodide.globals.set('_sketchyar_proxy_source', proxySource);
      pyodide.runPython(`import types\n_sketchyar_proxy = types.ModuleType('sketchyar_spike_proxy')\nexec(_sketchyar_proxy_source, _sketchyar_proxy.__dict__)`);
      startupReport = {
        pyodideVersion: pyodide.version,
        loaderAndCoreMs: Math.round(coreMs),
        numpyLoadMs: Math.round(numpyMs),
        totalInitMs: Math.round(performance.now() - started),
        source: 'python_engine/ar_drawing/spike_proxy.py',
      };
      return pyodide;
    })().catch((error: unknown) => {
      // Allow another attempt after a transient network failure.
      runtimePromise = null;
      startupReport = null;
      throw error;
    });
  }
  return runtimePromise;
}

function parseJSON(pyodide: PyodideRuntime, pythonCode: string): Record<string, unknown> {
  const data = pyodide.runPython(pythonCode);
  if (typeof data !== 'string') throw new Error('Очакван JSON string от Python');
  return JSON.parse(data) as Record<string, unknown>;
}

function numpyBenchmark(pyodide: PyodideRuntime): Record<string, unknown> {
  // Invokes the SAME Python module and deterministic input as the Windows pytest suite.
  return parseJSON(pyodide, 'import json\njson.dumps(_sketchyar_proxy.benchmark(size=1024, runs=5, seed=173))');
}

async function openCVBenchmark(pyodide: PyodideRuntime, runs: number, id: string): Promise<Record<string, unknown>> {
  if (!opencvReady) {
    const t0 = performance.now();
    await pyodide.loadPackage('opencv-python');
    opencvReady = true;
    progress(id, 'opencv-load', performance.now() - t0);
  }
  // The cv2 workload is not algorithmically equivalent to Gaussian+Sobel.
  // Times are standalone viability measurements, NOT a direct speed comparison.
  return parseJSON(pyodide, `import json, statistics, time, platform\nimport numpy as np\nimport cv2\n_img = (np.random.default_rng(173).random((1024,1024), dtype=np.float32) * 255).astype(np.uint8)\n_out = cv2.Canny(_img, 80, 160)\n_t = []\nfor _ in range(${runs}):\n    _start = time.perf_counter()\n    _out = cv2.Canny(_img, 80, 160)\n    _t.append(round(time.perf_counter() - _start, 6))\njson.dumps({'task': 'opencv_canny_1024', 'runs': ${runs}, 'seconds': _t, 'median_s': round(statistics.median(_t), 6), 'output_checksum': int(_out.sum()), 'opencv': cv2.__version__, 'python': platform.python_version()})`);
}

workerScope.onmessage = async (event: MessageEvent<Incoming>) => {
  const { id, command } = event.data;
  const started = performance.now();
  try {
    const pyodide = await ensureRuntime(id);
    let result: Record<string, unknown>;
    if (command === 'init') result = { ...(startupReport ?? {}), reused: performance.now() - started < 100 };
    else if (command === 'numpy') result = numpyBenchmark(pyodide);
    else if (command === 'opencv') result = await openCVBenchmark(pyodide, 5, id);
    else if (command === 'opencv10') result = await openCVBenchmark(pyodide, 10, id);
    else throw new Error(`Непозната команда: ${command}`);
    workerScope.postMessage({ id, kind: 'done', command, result: { ...result, workerRequestMs: Math.round(performance.now() - started) } } satisfies Done);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    workerScope.postMessage({ id, kind: 'error', command, error: error.message, stack: error.stack } satisfies Failure);
  }
};
