import { BENCH_SCHEMA, IMAGE_SIZES, MODEL_ID, MODEL_CACHE, RUNTIME_CACHE,
  TFJS_URL, MODEL_URL, validSize, fitToMaxSide, planInference, blendWeight, summarizeRuns } from './bench-utils.mjs';

const get = id => document.getElementById(id);
const install = get('install');
const remove = get('remove');
const runButton = get('run');
const series = get('series');
const exportButton = get('export');
const savePng = get('save-png');
const photoInput = get('photo');
const output = get('result');
const image = get('original');
let tf = null;
let model = null;
let photoUrl = null;
let sourceReady = false;
let busy = false;
let runtimeMs = null;
let modelLoadMs = null;
let modelOrigin = 'unknown';
let estimatedModelBytes = null;
let lastError = null;
let offlineReady = false;
const runs = [];
const measured = {};
const startedAt = new Date().toISOString();
const CHECKPOINT_KEY = 'sketchyar-ai-lab-anonymous-checkpoint-v2';
let webglContextLost = false;
/** Persist only bounded numerical diagnostics. A Safari renderer kill cannot be caught;
 * a checkpoint lets the next page load report an interrupted experiment. */
function saveCheckpoint(pending = null) {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({
      schema: BENCH_SCHEMA, runs: runs.slice(-60), pending,
      savedAt: new Date().toISOString(),
    }));
  } catch { /* Private browsing/quota: testing still works. */ }
}
function restoreCheckpoint() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null');
    if (!saved || saved.schema !== BENCH_SCHEMA) return;
    if (Array.isArray(saved.runs)) for (const record of saved.runs.slice(-60)) {
      if (record && ['ok','failed','interrupted'].includes(record.status) && IMAGE_SIZES.includes(record.longSide)) runs.push(record);
    }
    if (saved.pending && IMAGE_SIZES.includes(saved.pending.longSide)) {
      runs.push({status:'interrupted', longSide:saved.pending.longSide,
        mode:saved.pending.mode ?? 'unknown', completedTiles:saved.pending.completedTiles ?? 0,
        tileCount:saved.pending.tileCount ?? null,
        error:'Тестът е прекъснат преди запис на резултата. Safari може да е презаредил страницата или да е загубил WebGL контекста.'});
      text('run-status', `Предишният тест (${saved.pending.longSide} px) е прекъснат. Данните са запазени в анонимния отчет; провери по-безопасен размер.`);
    }
    if (runs.length) updateMetrics();
    saveCheckpoint(null);
  } catch { /* Invalid/outdated cache is ignored. */ }
}
window.addEventListener('webglcontextlost', event => {
  // The lightweight capability probe deliberately releases its own context.
  // Ignore that event; only a real runtime context loss invalidates the model.
  if (event.target?.dataset?.aiLabProbe === '1') return;
  event.preventDefault();
  webglContextLost = true;
  lastError = 'WebGL контекстът е загубен. Презареди AI Lab; моделът се пази в IndexedDB.';
  text('run-status', lastError);
  updateMetrics();
}, true);


function milliseconds(t) { return Math.round(t * 10) / 10; }
function text(id, message) { get(id).textContent = message; }
function errorText(err) { return err instanceof Error ? `${err.name}: ${err.message}` : String(err); }
function setBusy(value) {
  busy = value;
  install.disabled = value;
  remove.disabled = value;
  get('synthetic').disabled = value;
  photoInput.disabled = value;
  runButton.disabled = value || !sourceReady || !model;
  series.disabled = value || !sourceReady || !model;
}

function captureEnvironment() {
  const nav = navigator;
  let gl = null;
  let maxTextureSize = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.dataset.aiLabProbe = '1';
    gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  } catch { /* browser may reject WebGL contexts */ }
  const env = {
    userAgent: nav.userAgent,
    language: nav.language,
    logicalCores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    webgl: Boolean(gl),
    webgpuApiPresent: Boolean(nav.gpu),
    maxWebglTexture: maxTextureSize,
    standaloneDisplay: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    onlineHint: nav.onLine,
  };
  try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
  return env;
}
const env = captureEnvironment();
text('capabilities', `WebGL: ${env.webgl ? 'да' : 'НЕ'} · WebGPU API: ${env.webgpuApiPresent ? 'да' : 'не'} · максимална текстура: ${env.maxWebglTexture ?? 'неизвестно'} px · ядра: ${env.logicalCores ?? 'неизвестно'}.`);

async function updateStorage() {
  const message = [];
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate) {
      measured.storageUsage = estimate.usage ?? null;
      measured.storageQuota = estimate.quota ?? null;
      message.push(`Съхранение: ${estimate.usage ? (estimate.usage / 1048576).toFixed(1) : '?'} / ${estimate.quota ? (estimate.quota / 1048576).toFixed(1) : '?'} MiB`);
    }
  } catch { /* not always supported on iOS */ }
  try {
    const models = tf?.io?.listModels ? await tf.io.listModels() : null;
    if (models) message.push(models[MODEL_CACHE] ? 'AI модел: записан локално' : 'AI модел: няма запис в IndexedDB');
  } catch { /* not an installation proof */ }
  try { offlineReady = Boolean((await caches.open(RUNTIME_CACHE)).match && await (await caches.open(RUNTIME_CACHE)).match(TFJS_URL)); } catch { offlineReady = false; }
  message.push(`TensorFlow.js библиотека в кеш: ${offlineReady ? 'да' : 'не'}`);
  text('storage', message.join(' · '));
}
restoreCheckpoint();
void updateStorage();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(err => {
    text('storage', `SW на тестовата страница не е наличен: ${errorText(err)}`);
  });
}

async function loadTensorFlow() {
  if (!env.webgl) throw new Error('Това устройство не предоставя WebGL контекст; прекратявам тежкия AI тест.');
  if (tf && tf.getBackend() === 'webgl') return;
  if (tf) {
    const ok = await tf.setBackend('webgl');
    if (!ok) throw new Error('WebGL backend не успя да се възстанови');
    await tf.ready();
    measured.backend = tf.getBackend();
    return;
  }
  text('model-status', 'Зареждам TensorFlow.js в паметта на телефона…');
  const t0 = performance.now();
  const cache = await caches.open(RUNTIME_CACHE);
  let response = await cache.match(TFJS_URL);
  let source = 'local-cache';
  if (!response) {
    source = 'network';
    response = await fetch(TFJS_URL, { mode: 'cors' });
    if (!response.ok) throw new Error(`TensorFlow.js download HTTP ${response.status}`);
    try { await cache.put(TFJS_URL, response.clone()); } catch { /* storage may be restricted */ }
  }
  // Load cached UMD script from a same-origin blob, not from a remote script tag.
  // This allows subsequent runs while offline without a global service worker.
  const jsBlob = await response.blob();
  const scriptURL = URL.createObjectURL(jsBlob);
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptURL;
      script.onload = () => { script.remove(); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error('TensorFlow.js скриптът не се изпълни')); };
      document.head.append(script);
    });
  } finally { URL.revokeObjectURL(scriptURL); }
  tf = globalThis.tf;
  if (!tf?.loadGraphModel || !tf?.registerOp) throw new Error('Този TensorFlow.js пакет не предоставя нужния GraphModel/converter API');
  if (env.webgl) {
    const enabled = await tf.setBackend('webgl');
    if (!enabled) throw new Error('WebGL backend не стартира на това устройство');
  } else {
    throw new Error('Липсва WebGL. Не стартирам тежкия AI на CPU автоматично.');
  }
  await tf.ready();
  runtimeMs = milliseconds(performance.now() - t0);
  measured.tfjsSource = source;
  measured.tfjsVersion = tf.version?.tfjs ?? null;
  measured.backend = tf.getBackend();
  text('model-status', `TensorFlow.js ${measured.tfjsVersion ?? ''} е зареден (${source}, ${runtimeMs} ms).`);
  registerMirrorPad();
}

/** AnimeGAN.js original 2020 graph includes a MirrorPad graph op.
 * Its reflect paddings are 0/1 on 4-D NHWC tensors. No global tensor leaks.
 */
function registerMirrorPad() {
  const pad = async node => {
    if (node.attrs?.mode !== 'reflect') throw new Error('MirrorPad: expected reflect');
    const padding = await node.inputs[1].array();
    if (node.inputs[0].rank !== 4 || !Array.isArray(padding) || padding.length !== 4)
      throw new Error('MirrorPad: expected NHWC tensor and 4x2 padding');
    return tf.tidy(() => {
      let current = node.inputs[0];
      for (let axis = 0; axis < 4; axis++) {
        const [before, after] = padding[axis];
        if (!Number.isInteger(before) || !Number.isInteger(after) || before < 0 || after < 0 || before > 1 || after > 1)
          throw new Error('MirrorPad: unsupported padding');
        if (!before && !after) continue;
        const left = [0, 0, 0, 0];
        const right = [0, 0, 0, 0];
        const extent = [-1, -1, -1, -1];
        left[axis] = 1;
        right[axis] = current.shape[axis] - 2;
        extent[axis] = 1;
        const chunks = [];
        if (before) chunks.push(current.slice(left, extent));
        chunks.push(current);
        if (after) chunks.push(current.slice(right, extent));
        current = tf.concat(chunks, axis);
      }
      return current;
    });
  };
  tf.registerOp('MirrorPad', pad);
}

async function loadModel() {
  if (webglContextLost) throw new Error('WebGL контекстът е загубен. Презареди тази страница преди нов тест.');
  if (model) return;
  await loadTensorFlow();
  const t0 = performance.now();
  text('model-status', 'Търся вече инсталирания AI модел в локалната база…');
  try {
    model = await tf.loadGraphModel(MODEL_CACHE);
    modelOrigin = 'indexeddb-cache';
    measured.indexedDbModelSaved = true;
  } catch {
    text('model-status', 'Изтеглям модела от GitHub — без изпращане на снимки…');
    if (!navigator.onLine) throw new Error('Моделът не е инсталиран; първото зареждане изисква интернет');
    model = await tf.loadGraphModel(MODEL_URL, {
      onProgress: fraction => text('model-status', `Изтегляне на AI теглата: ${Math.round(fraction * 100)}%…`),
    });
    modelOrigin = 'github-direct';
    try {
      const saved = await model.save(MODEL_CACHE);
      estimatedModelBytes = saved?.modelArtifactsInfo?.weightDataBytes ?? null;
      measured.indexedDbModelSaved = true;
    } catch (err) {
      measured.indexedDbModelSaved = false;
      measured.indexedDbSaveError = errorText(err);
    }
  }
  modelLoadMs = milliseconds(performance.now() - t0);
  measured.modelInput = Array.isArray(model.inputs) ? model.inputs.map(x => ({name: x.name, shape: x.shape})) : null;
  measured.modelOrigin = modelOrigin;
  text('model-status', `Моделът е зареден: ${modelOrigin}; ${modelLoadMs} ms. ${measured.indexedDbModelSaved === false ? 'ВНИМАНИЕ: локалното запазване не успя.' : ''}`);
  await updateStorage();
  setBusy(false);
}

function checkTfMemory() {
  try {
    const m = tf.memory();
    return { numBytes: m.numBytes ?? null, numTensors: m.numTensors ?? null, unreliable: m.unreliable ?? true, reasons: m.reasons ?? [] };
  } catch { return { numBytes: null, numTensors: null, unreliable: true, reasons: ['tf.memory unavailable'] }; }
}

/** A bounded graph call. All intermediate inference tensors are released, even if it throws. */
async function inferCanvas(buffer, destination = null) {
  const preStart = performance.now();
  const input = tf.tidy(() => tf.browser.fromPixels(buffer).toFloat().div(255).expandDims(0));
  let answer = null;
  let rawResult = null;
  let processed = null;
  try {
    const inferenceStart = performance.now();
    answer = await model.executeAsync({test: input});
    rawResult = Array.isArray(answer) ? answer[0] : answer;
    const inferenceMs = milliseconds(performance.now() - inferenceStart);
    if (!rawResult?.shape || rawResult.shape.length !== 4) throw new Error('Моделът върна неочакван tensor');
    const outputStart = performance.now();
    processed = tf.tidy(() => rawResult.squeeze([0]).add(1).div(2).clipByValue(0, 1));
    const h = processed.shape[0], w = processed.shape[1];
    if (h !== buffer.height || w !== buffer.width || processed.shape[2] !== 3)
      throw new Error(`Моделът промени размера на плочката (${w}×${h}).`);
    let pixels = null;
    if (destination) {
      destination.width = w; destination.height = h;
      await tf.browser.toPixels(processed, output);
    } else {
      // In tiled mode return just RGBA bytes; never grow the GPU inference texture.
      pixels = await tf.browser.toPixels(processed);
    }
    const renderMs = milliseconds(performance.now() - outputStart);
    return {pixels, inferenceMs, renderMs, prepareMs: milliseconds(inferenceStart - preStart)};
  } finally {
    input.dispose();
    processed?.dispose();
    const outputs = Array.isArray(answer) ? answer : answer ? [answer] : [];
    for (const tensor of outputs) tensor?.dispose?.();
  }
}

/** Larger pictures are generated as a mosaic of separately inferred, overlapping
 * tiles. This increases output resolution WITHOUT raising peak inference area.
 * It is an experimental workaround; differences/seams can remain at boundaries. */
async function runTiled(side, width, height, tiles, totalStart, pending) {
  const full = document.createElement('canvas');
  full.width = width; full.height = height;
  const fullCtx = full.getContext('2d');
  if (!fullCtx) throw new Error('Canvas 2D не е наличен');
  fullCtx.drawImage(image, 0, 0, width, height);
  const small = document.createElement('canvas');
  const smallCtx = small.getContext('2d', {willReadFrequently:true});
  if (!smallCtx) throw new Error('Canvas 2D не е наличен');
  const weights = new Float32Array(width * height);
  const sums = new Float32Array(width * height * 3);
  let inferenceMs = 0, renderMs = 0, prepareMs = 0;
  let peakTfBytes = 0;
  try {
    for(let i=0; i<tiles.length; i++) {
      if (webglContextLost) throw new Error('WebGL контекстът е загубен');
      const tile=tiles[i];
      text('run-status', `${side} px · обработвам плочка ${i+1}/${tiles.length} (${tile.width}×${tile.height}).`);
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      small.width=tile.width; small.height=tile.height;
      smallCtx.drawImage(full, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height);
      const computed=await inferCanvas(small);
      inferenceMs+=computed.inferenceMs;
      renderMs+=computed.renderMs;
      prepareMs+=computed.prepareMs;
      const px=computed.pixels;
      if (!px || px.length !== tile.width*tile.height*4) throw new Error('Невалиден RGBA резултат от AI плочката');
      for(let yy=0;yy<tile.height;yy++) {
        const wy=blendWeight(yy,tile.height,tile.topOverlap,tile.bottomOverlap);
        for(let xx=0;xx<tile.width;xx++) {
          const wx=blendWeight(xx,tile.width,tile.leftOverlap,tile.rightOverlap);
          const weight=wx*wy;
          const destination=(tile.y+yy)*width+tile.x+xx;
          const src=(yy*tile.width+xx)*4;
          weights[destination]+=weight;
          sums[destination*3]+=px[src]*weight;
          sums[destination*3+1]+=px[src+1]*weight;
          sums[destination*3+2]+=px[src+2]*weight;
        }
      }
      const mem=checkTfMemory();
      if (Number.isFinite(mem.numBytes)) peakTfBytes=Math.max(peakTfBytes,mem.numBytes);
      saveCheckpoint({...pending,completedTiles:i+1});
      await tf.nextFrame();
    }
    output.width=width; output.height=height;
    const ctx=output.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D за резултата не е наличен');
    const imageData=ctx.createImageData(width,height);
    const pixels=imageData.data;
    for(let i=0;i<weights.length;i++) {
      const inv=1/Math.max(1e-6,weights[i]);
      pixels[i*4]=Math.round(sums[i*3]*inv);
      pixels[i*4+1]=Math.round(sums[i*3+1]*inv);
      pixels[i*4+2]=Math.round(sums[i*3+2]*inv);
      pixels[i*4+3]=255;
    }
    ctx.putImageData(imageData,0,0);
    return {status:'ok',longSide:side,width,height,mode:'tiled',tileCount:tiles.length,
      maxTilePixels:Math.max(...tiles.map(t=>t.width*t.height)),
      inferenceMs:milliseconds(inferenceMs),renderMs:milliseconds(renderMs),
      prepareMs:milliseconds(prepareMs),totalMs:milliseconds(performance.now()-totalStart),
      peakTfBytesAfterTile:peakTfBytes};
  } finally {
    full.width=0;full.height=0;small.width=0;small.height=0;
  }
}

async function runOne(side) {
  if (webglContextLost) throw new Error('WebGL контекстът е загубен. Презареди тази страница преди нов тест.');
  if (!model || !image.complete || !image.naturalWidth) throw new Error('Избери снимка и зареди модела');
  validSize(side);
  const { width,height }=fitToMaxSide(image.naturalWidth,image.naturalHeight,side);
  const plan=planInference(width,height,side);
  const pending={longSide:side,mode:plan.mode,tileCount:plan.tiles.length,completedTiles:0,startedAt:new Date().toISOString()};
  saveCheckpoint(pending);
  const totalStart=performance.now();
  if(plan.mode==='tiled') return runTiled(side,width,height,plan.tiles,totalStart,pending);
  const buffer=document.createElement('canvas');
  buffer.width=width;buffer.height=height;
  const ctx=buffer.getContext('2d',{willReadFrequently:true});
  if (!ctx) throw new Error('Canvas 2D не е наличен');
  ctx.drawImage(image,0,0,width,height);
  try {
    const result=await inferCanvas(buffer,output);
    return {status:'ok',longSide:side,width,height,mode:'direct',tileCount:1,
      inferenceMs:result.inferenceMs,renderMs:result.renderMs,prepareMs:result.prepareMs,
      totalMs:milliseconds(performance.now()-totalStart)};
  } finally {buffer.width=0;buffer.height=0;}
}

async function runBench(sizes) {
  if (busy || !model || !sourceReady) return;
  setBusy(true);
  savePng.disabled=true;
  let currentSide=null;
  try {
    for(const side of sizes) {
      currentSide=side;
      text('run-status', `Изчислявам ${side} px с автоматичен лимит за всяка AI операция…`);
      await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
      const result=await runOne(side);
      const memory=checkTfMemory();
      result.tfBytesAfterRun=memory.numBytes;
      result.tfTensorsAfterRun=memory.numTensors;
      result.tfMemoryUnreliable=memory.unreliable;
      runs.push(result);
      saveCheckpoint(null);
      updateMetrics();
      text('run-status', `${side} px (${result.mode==='tiled'?`${result.tileCount} плочки`:'една операция'}): ${result.totalMs} ms общо. Междинната GPU памет не е измерена.`);
    }
    savePng.disabled=false;
  } catch(err) {
    lastError=errorText(err);
    runs.push({status:'failed',longSide:currentSide,error:lastError});
    saveCheckpoint(null);
    updateMetrics();
    const lost=webglContextLost || /webgl|context lost|out of memory/i.test(lastError);
    text('run-status', `Неуспешна AI обработка: ${lastError}. ${lost?'Презареди AI Lab, за да създадеш нов WebGL контекст.':'Пробвай 128 или 192 px.'}`);
    if(lost) { model=null; setBusy(false); }
  } finally {setBusy(false);}
}

function report() {
  return {
    schema: BENCH_SCHEMA,
    createdAt: startedAt,
    generatedAt: new Date().toISOString(),
    model: {id: MODEL_ID, origin: modelOrigin, url: MODEL_URL, approxWeightBytes: estimatedModelBytes,
      loadMs: modelLoadMs, runtimeMs, tfjsSource: measured.tfjsSource ?? null,
      tfjsVersion: measured.tfjsVersion ?? null,
      backend: measured.backend ?? null, savedToIndexedDb: measured.indexedDbModelSaved ?? null},
    device: env,
    storage: {usage: measured.storageUsage ?? null, quota: measured.storageQuota ?? null,
      tfjsCached: offlineReady},
    runs,
    summary: summarizeRuns(runs),
    lastError,
    note: 'No photos, filenames, source image bytes, or rendered images are exported. 384/512 use separately inferred overlapping tiles, not a larger single model execution. tf.memory excludes peak iPhone GPU/RAM use. Interrupted status does not establish the cause of Safari restart.',
  };
}
function updateMetrics() {
  text('metrics', JSON.stringify({modelLoadMs, tfjsRuntimeLoadMs: runtimeMs, modelOrigin,
    backend: measured.backend, runs, summary: summarizeRuns(runs), storageBytes: measured.storageUsage ?? null,
    caveat: 'tfBytesAfterRun is NOT total iPhone memory'}, null, 2));
  exportButton.disabled = false;
}

install.addEventListener('click', () => {
  if (busy) return;
  setBusy(true);
  void loadModel().catch(err => {
    lastError = errorText(err);
    text('model-status', `Не успях да заредя AI модела: ${lastError}`);
    updateMetrics();
    setBusy(false);
  });
});
remove.addEventListener('click', () => {
  if (busy || !confirm('Да изтрия локално запазения AI модел? Личните проекти няма да се променят.')) return;
  setBusy(true);
  void (async () => {
    model?.dispose(); model = null;
    if (!tf) await loadTensorFlow();
    try { await tf.io.removeModel(MODEL_CACHE); } catch { /* may not exist */ }
    measured.indexedDbModelSaved = false;
    text('model-status', 'Локалният модел е изтрит. Натисни Инсталирай за повторно зареждане.');
    await updateStorage();
  })().catch(err => text('model-status', errorText(err))).finally(() => setBusy(false));
});

function applyLocalImage(src, revokeOld) {
  if (photoUrl && revokeOld) URL.revokeObjectURL(photoUrl);
  photoUrl = src;
  sourceReady = false;
  image.onload = () => {
    sourceReady = true;
    text('run-status', `Локалното изображение е готово (${image.naturalWidth} × ${image.naturalHeight}).`);
    setBusy(false);
  };
  image.onerror = () => {
    sourceReady = false;
    text('run-status', 'Safari не успя да декодира снимката. Пробвай JPG или PNG.');
    setBusy(false);
  };
  image.src = src;
  savePng.disabled = true;
}
photoInput.addEventListener('change', () => {
  const f = photoInput.files?.[0];
  if (!f) return;
  if (!f.type.startsWith('image/') && !/\.(heic|heif)$/i.test(f.name)) {
    text('run-status', 'Избери изображение.'); return;
  }
  applyLocalImage(URL.createObjectURL(f), true);
});
get('synthetic').addEventListener('click', () => {
  const canvas = document.createElement('canvas');
  canvas.width = 480; canvas.height = 480;
  const c = canvas.getContext('2d');
  const grad = c.createLinearGradient(0, 0, 480, 480);
  grad.addColorStop(0, '#d4d8e7'); grad.addColorStop(1, '#edbc91');
  c.fillStyle = grad; c.fillRect(0,0,480,480);
  c.fillStyle = '#43392e'; c.fillRect(150, 70, 180, 260);
  c.fillStyle = '#edc6a4'; c.beginPath(); c.ellipse(240,215,100,122,0,0,Math.PI*2); c.fill();
  c.fillStyle = '#29231f'; c.fillRect(190,202,22,10); c.fillRect(265,202,22,10);
  c.strokeStyle = '#6b3d33'; c.lineWidth=4; c.beginPath(); c.arc(240,264,30,0.15,Math.PI-.15); c.stroke();
  if (photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
  applyLocalImage(canvas.toDataURL('image/png'), false);
});
runButton.addEventListener('click', () => { void runBench([validSize(get('size').value)]); });
series.addEventListener('click', () => { void runBench([128, 256]); });
savePng.addEventListener('click', () => { output.toBlob(blob => {if (!blob) return; download(blob, 'sketchyar-ai-animegan-result.png');}, 'image/png'); });
exportButton.addEventListener('click', () => {
  const json = JSON.stringify(report(), null, 2);
  download(new Blob([json], {type:'application/json'}), 'sketchyar-iphone-ai-benchmark.json');
});
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
