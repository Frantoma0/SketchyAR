/** SketchyAR Day 8: same-origin Pyodide in a module Worker. No remote runtime fetches.
 *  Build-time preparation (scripts/vendor_day8.py) supplies pinned files and wheel dependencies.
 *  A Service Worker and verified offline cache remain Day 19 work.
 */
import proxySource from '../../python_engine/ar_drawing/spike_proxy.py?raw';
import sketchEngineSource from '../../python_engine/ar_drawing/sketch_engine.py?raw';
import day10TonesSource from '../../python_engine/ar_drawing/day10_tones.py?raw';

const PYODIDE_VERSION = '314.0.8';
// Worker script is in src/ during development and assets/ after Vite build.
// The parent directory is the app base in BOTH cases, including GitHub Pages subpaths.
const PYODIDE_BASE = new URL(`../pyodide/v${PYODIDE_VERSION}/`, self.location.href).href;
if (new URL(PYODIDE_BASE).origin !== self.location.origin) {
  throw new Error('Pyodide must be same-origin');
}

type VendorInventory = {
  pyodideVersion: string;
  packages: string[];
  opencvVendored: boolean;
  files: Record<string, { bytes: number; sha256: string }>;
};
let inventoryPromise: Promise<VendorInventory> | null = null;
async function getInventory(): Promise<VendorInventory> {
  if (!inventoryPromise) {
    inventoryPromise = (async () => {
      const response = await fetch(new URL('inventory.json', PYODIDE_BASE), { cache: 'no-store' });
      if (!response.ok) throw new Error(
        `Липсва локален Pyodide runtime (${response.status}). Изпълни python scripts/vendor_day8.py преди build.`
      );
      const manifest = await response.json() as VendorInventory;
      if (manifest.pyodideVersion !== PYODIDE_VERSION || !manifest.packages.includes('numpy')) {
        throw new Error('Локалните Python пакети не съвпадат с фиксираната версия');
      }
      return manifest;
    })().catch((err: unknown) => { inventoryPromise = null; throw err; });
  }
  return inventoryPromise;
}


interface PyodideRuntime {
  loadPackage: (name: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
  globals: { set: (name: string, value: unknown) => void };
  version: string;
}
type WorkerCommand = 'init' | 'numpy' | 'opencv' | 'opencv10' | 'day9' | 'day10-512' | 'day10-1024';
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
let day9Ready = false;
let day10Ready = false;

function progress(id: string, stage: string, ms: number): void {
  workerScope.postMessage({ id, kind: 'progress', stage, ms: Math.round(ms) } satisfies Progress);
}

async function ensureRuntime(id: string): Promise<PyodideRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const started = performance.now();
      const inventory = await getInventory();
      // Runtime import is deliberately same-origin; Vite must not bundle Pyodide itself.
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
        resourceOrigin: new URL(PYODIDE_BASE).origin,
        pyodideBasePath: new URL(PYODIDE_BASE).pathname,
        selfHosted: true,
        vendoredFileCount: Object.keys(inventory.files).length,
        vendoredBytes: Object.values(inventory.files).reduce((total, file) => total + file.bytes, 0),
        opencvVendored: inventory.opencvVendored,
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

function ensureDay9Module(pyodide: PyodideRuntime): void {
  // Day 9 is deliberately retained unchanged as the performance baseline.
  if (day9Ready) return;
  pyodide.globals.set('_sketchyar_day9_source', sketchEngineSource);
  pyodide.runPython("import types\n_sketchyar_day9 = types.ModuleType('sketchyar_day9')\nexec(_sketchyar_day9_source, _sketchyar_day9.__dict__)");
  day9Ready = true;
}

function day9Benchmark(pyodide: PyodideRuntime): Record<string, unknown> {
  ensureDay9Module(pyodide);
  return parseJSON(pyodide, 'import json\njson.dumps(_sketchyar_day9.benchmark(size=512, runs=3, seed=173))');
}

function day10Benchmark(pyodide: PyodideRuntime, size: 512 | 1024): Record<string, unknown> {
  ensureDay9Module(pyodide);
  if (!day10Ready) {
    // Relative import in Day 10 resolves to the Day 9 module already loaded.
    // No additional Python wheels or CDN requests are needed.
    pyodide.globals.set('_sketchyar_day10_source', day10TonesSource);
    pyodide.runPython([
      'import sys, types',
      '_sketchyar_package = types.ModuleType("ar_drawing")',
      '_sketchyar_package.__path__ = []',
      'sys.modules["ar_drawing"] = _sketchyar_package',
      'sys.modules["ar_drawing.sketch_engine"] = _sketchyar_day9',
      '_sketchyar_day10 = types.ModuleType("ar_drawing.day10_tones")',
      '_sketchyar_day10.__package__ = "ar_drawing"',
      'sys.modules["ar_drawing.day10_tones"] = _sketchyar_day10',
      'exec(_sketchyar_day10_source, _sketchyar_day10.__dict__)',
    ].join('\n'));
    day10Ready = true;
  }
  // Same deterministic module and input on Windows and iPhone.
  return parseJSON(pyodide, `import json\njson.dumps(_sketchyar_day10.benchmark_day10(size=${size}, runs=3, seed=173))`);
}

async function openCVBenchmark(pyodide: PyodideRuntime, runs: number, id: string): Promise<Record<string, unknown>> {
  if (!opencvReady) {
    const inventory = await getInventory();
    if (!inventory.opencvVendored) {
      throw new Error('OpenCV е опционален и не е включен. За benchmark: python scripts/vendor_day8.py --with-opencv, после нов build.');
    }
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
    else if (command === 'day9') result = day9Benchmark(pyodide);
    else if (command === 'day10-512') result = day10Benchmark(pyodide, 512);
    else if (command === 'day10-1024') result = day10Benchmark(pyodide, 1024);
    else if (command === 'opencv') result = await openCVBenchmark(pyodide, 5, id);
    else if (command === 'opencv10') result = await openCVBenchmark(pyodide, 10, id);
    else throw new Error(`Непозната команда: ${command}`);
    workerScope.postMessage({ id, kind: 'done', command, result: { ...result, workerRequestMs: Math.round(performance.now() - started) } } satisfies Done);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    workerScope.postMessage({ id, kind: 'error', command, error: error.message, stack: error.stack } satisfies Failure);
  }
};
