/** SketchyAR Day 8: same-origin Pyodide in a module Worker. No remote runtime fetches.
 *  Build-time preparation (scripts/vendor_day8.py) supplies pinned files and wheel dependencies.
 *  A Service Worker and verified offline cache remain Day 19 work.
 */
import proxySource from '../../python_engine/ar_drawing/spike_proxy.py?raw';
import sketchEngineSource from '../../python_engine/ar_drawing/sketch_engine.py?raw';
import day10TonesSource from '../../python_engine/ar_drawing/day10_tones.py?raw';
import day11Source from '../../python_engine/ar_drawing/day11_morphology.py?raw';
import day12Source from '../../python_engine/ar_drawing/day12_edges.py?raw';
import day13Source from '../../python_engine/ar_drawing/day13_bridge.py?raw';

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
type WorkerCommand = 'init' | 'numpy' | 'opencv' | 'opencv10' | 'day9' | 'day10-512' | 'day10-1024' | 'day11-512' | 'day11-1024' | 'day12-512' | 'day12-1024' | 'day13-process';
type Incoming = { id: string; command: WorkerCommand; width?: number; height?: number;
  gray?: Uint8Array; sigma?: number; low?: number; high?: number };
type Progress = { id: string; kind: 'progress'; stage: string; ms: number };
type Done = { id: string; kind: 'done'; command: WorkerCommand; result: Record<string, unknown> };
type ImageDone = { id: string; kind: 'image-done'; result: {
  mask: Uint8Array; width: number; height: number; inkPixels: number;
  pipelineVersion: string; bridgeVersion: string; processingMs: number; workerRequestMs: number;
} };
type Failure = { id: string; kind: 'error'; command: WorkerCommand; error: string; stack?: string };

const workerScope = self as unknown as {
  postMessage: (message: Progress | Done | Failure | ImageDone, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<Incoming>) => void) | null;
};
let runtimePromise: Promise<PyodideRuntime> | null = null;
let startupReport: Record<string, unknown> | null = null;
let opencvReady = false;
let day9Ready = false;
let day10Ready = false;
let day11Ready = false;
let day12Ready = false;
let day13Ready = false;

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

function ensureDay11Module(pyodide: PyodideRuntime): void {
  ensureDay9Module(pyodide);
  if (!day11Ready) {
    // Reuse the existing NumPy runtime and Day 9 grayscale conversion.
    pyodide.globals.set('_sketchyar_day11_source', day11Source);
    pyodide.runPython([
      'import sys, types',
      'if "ar_drawing" not in sys.modules:',
      '    _day11_package = types.ModuleType("ar_drawing")',
      '    _day11_package.__path__ = []',
      '    sys.modules["ar_drawing"] = _day11_package',
      'sys.modules["ar_drawing.sketch_engine"] = _sketchyar_day9',
      '_sketchyar_day11 = types.ModuleType("ar_drawing.day11_morphology")',
      '_sketchyar_day11.__package__ = "ar_drawing"',
      'sys.modules["ar_drawing.day11_morphology"] = _sketchyar_day11',
      'exec(_sketchyar_day11_source, _sketchyar_day11.__dict__)',
    ].join('\n'));
    day11Ready = true;
  }
}

function day11Benchmark(pyodide: PyodideRuntime, size: 512 | 1024): Record<string, unknown> {
  ensureDay11Module(pyodide);
  return parseJSON(pyodide, `import json\njson.dumps(_sketchyar_day11.benchmark_day11(size=${size}, runs=3, seed=173))`);
}

function ensureDay12Module(pyodide: PyodideRuntime): void {
  ensureDay11Module(pyodide);
  if (!day12Ready) {
    pyodide.globals.set('_sketchyar_day12_source', day12Source);
    pyodide.runPython([
      'import sys, types',
      '_sketchyar_day12 = types.ModuleType("ar_drawing.day12_edges")',
      '_sketchyar_day12.__package__ = "ar_drawing"',
      'sys.modules["ar_drawing.day12_edges"] = _sketchyar_day12',
      'exec(_sketchyar_day12_source, _sketchyar_day12.__dict__)',
    ].join('\n'));
    day12Ready = true;
  }
}

function day12Benchmark(pyodide: PyodideRuntime, size: 512 | 1024): Record<string, unknown> {
  ensureDay12Module(pyodide);
  return parseJSON(pyodide, `import json\njson.dumps(_sketchyar_day12.benchmark_day12(size=${size}, runs=3, seed=173))`);
}

/** A binary bridge with explicit object lifetime. No photo bytes enter diagnostics. */
function day13Process(pyodide: PyodideRuntime, event: Incoming): ImageDone['result'] {
  const { width, height, sigma, low, high, gray } = event;
  if (!(gray instanceof Uint8Array) || !Number.isInteger(width) || !Number.isInteger(height) ||
      !width || !height || width > 1024 || height > 1024 ||
      width * height !== gray.byteLength || ![sigma, low, high].every(v => typeof v === 'number' && Number.isFinite(v)))
    throw new Error('Невалиден входен grayscale буфер за Day 13');
  ensureDay12Module(pyodide);
  if (!day13Ready) {
    pyodide.globals.set('_sketchyar_day13_source', day13Source);
    pyodide.runPython([
      'import sys, types',
      '_sketchyar_day13 = types.ModuleType("ar_drawing.day13_bridge")',
      '_sketchyar_day13.__package__ = "ar_drawing"',
      'sys.modules["ar_drawing.day13_bridge"] = _sketchyar_day13',
      'exec(_sketchyar_day13_source, _sketchyar_day13.__dict__)',
    ].join('\n'));
    day13Ready = true;
  }
  const t0 = performance.now();
  pyodide.globals.set('_sketchyar_input_gray', gray);
  let output: unknown;
  try {
    // Typed-array .to_py() exposes a bytes-like buffer (memoryview in Pyodide).
    // The Python method validates all dimensions, thresholds and buffer length.
    pyodide.runPython(`_sketchyar_gray_py = _sketchyar_input_gray.to_py()
_sketchyar_day13_result = _sketchyar_day13.process_gray8(_sketchyar_gray_py, ${width}, ${height}, sigma=${sigma}, low=${low}, high=${high})`);
    output = pyodide.runPython('_sketchyar_day13_result.ink');
    const asProxy = output as { toJs?: () => unknown; destroy?: () => void };
    const converted = typeof asProxy?.toJs === 'function' ? asProxy.toJs() : output;
    const mask = converted instanceof Uint8Array ? converted :
      converted instanceof ArrayBuffer ? new Uint8Array(converted) : null;
    if (!mask || mask.byteLength !== width * height)
      throw new Error('Pyodide returned invalid mask bytes');
    const metadata = parseJSON(pyodide, [
      'import json',
      'json.dumps({"inkPixels": _sketchyar_day13_result.ink_pixels,',
      ' "pipelineVersion": _sketchyar_day13_result.engine_version,',
      ' "bridgeVersion": _sketchyar_day13_result.bridge_version})',
    ].join('\n'));
    return {
      mask: mask.slice(), width, height,
      inkPixels: Number(metadata.inkPixels),
      pipelineVersion: String(metadata.pipelineVersion),
      bridgeVersion: String(metadata.bridgeVersion),
      processingMs: Math.round(performance.now() - t0),
      workerRequestMs: 0,
    };
  } finally {
    (output as { destroy?: () => void } | undefined)?.destroy?.();
    // Release both JS proxy and large Python buffers between image requests.
    pyodide.runPython('del _sketchyar_input_gray\n' +
      'globals().pop("_sketchyar_gray_py", None)\n' +
      'globals().pop("_sketchyar_day13_result", None)');
  }
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
    if (command === 'day13-process') {
      const processed = day13Process(pyodide, event.data);
      processed.workerRequestMs = Math.round(performance.now() - started);
      workerScope.postMessage({ id, kind: 'image-done', result: processed }, [processed.mask.buffer]);
      return;
    }
    let result: Record<string, unknown>;
    if (command === 'init') result = { ...(startupReport ?? {}), reused: performance.now() - started < 100 };
    else if (command === 'numpy') result = numpyBenchmark(pyodide);
    else if (command === 'day9') result = day9Benchmark(pyodide);
    else if (command === 'day10-512') result = day10Benchmark(pyodide, 512);
    else if (command === 'day10-1024') result = day10Benchmark(pyodide, 1024);
    else if (command === 'day11-512') result = day11Benchmark(pyodide, 512);
    else if (command === 'day11-1024') result = day11Benchmark(pyodide, 1024);
    else if (command === 'day12-512') result = day12Benchmark(pyodide, 512);
    else if (command === 'day12-1024') result = day12Benchmark(pyodide, 1024);
    else if (command === 'opencv') result = await openCVBenchmark(pyodide, 5, id);
    else if (command === 'opencv10') result = await openCVBenchmark(pyodide, 10, id);
    else throw new Error(`Непозната команда: ${command}`);
    workerScope.postMessage({ id, kind: 'done', command, result: { ...result, workerRequestMs: Math.round(performance.now() - started) } } satisfies Done);
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    workerScope.postMessage({ id, kind: 'error', command, error: error.message, stack: error.stack } satisfies Failure);
  }
};
