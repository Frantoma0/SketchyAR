import './styles.css';
import * as D from './diagnostics';
import { probeEnv, type EnvSnapshot } from './env';
import { debugWanted, enableDebug, toggleDebug } from './debug';
import { initDay2 } from './day2';
import { initDay3 } from './day3';
import { initDay4 } from './day4';

D.installGlobalHandlers();
D.checkPreviousSession();
D.log('info', 'bootstrap', 'start', {
  version: __APP_VERSION__,
  sha: __BUILD_SHA__,
  buildTime: __BUILD_TIME__,
  mode: import.meta.env.MODE,
});

if (debugWanted()) {
  enableDebug().then(
    () => D.log('info', 'debug', 'Eruda е включена'),
    (err: unknown) => D.log('error', 'debug', 'Eruda не се зареди', err),
  );
}

document.getElementById('app')!.innerHTML = `
<main>
  <header>
    <h1>SketchyAR</h1>
    <button id="ver" class="ver" type="button" aria-label="Версия на приложението"></button>
  </header>
  <p class="lead">Ден 4: Camera Controller и реална fullscreen основа на Drawing екрана. Тестовете от Дни 2–3 са запазени.</p>
  <section><h2>Build</h2><dl id="build"></dl></section>
  <section><h2>Среда</h2><dl id="env"><dt>Зареждане</dt><dd>…</dd></dl></section>
  <section><h2>Възможности на устройството</h2><ul id="caps" class="caps"></ul></section>
  <section id="day4">
    <h2>Ден 4 — Drawing основа</h2>
    <p class="hint">Нов fullscreen Drawing изглед с един Camera Controller, автоматична пауза при background и възстановяване при връщане. Управлява камерата независимо от Python. Контролите и мрежата са временни до Figma имплементацията.</p>
    <div class="actions">
      <button class="act" id="btn-day4-open" type="button">Отвори Drawing</button>
      <button class="act" id="btn-day4-capabilities" type="button">Провери камерата</button>
    </div>
    <p id="day4-status" role="status" aria-live="polite">Готово за тест на Ден 4.</p>
    <pre id="day4-capabilities" class="benchmark-result" aria-label="Контроли на камерата">Няма проверка.</pre>
  </section>
  <div id="day4-screen" class="drawing-screen" role="dialog" aria-modal="true" aria-label="SketchyAR Drawing" hidden>
    <div class="drawing-video-stage">
      <video id="drawing-camera" autoplay muted playsinline aria-label="Камера за рисуване"></video>
      <div id="drawing-grid" class="drawing-overlay-grid" aria-hidden="true">
        <div class="drawing-guide-frame"></div>
      </div>
    </div>
    <div class="drawing-top-controls">
      <button class="drawing-btn" id="btn-day4-exit" type="button" aria-label="Изход от Drawing">← Назад</button>
      <span class="drawing-title">SketchyAR · Drawing</span>
    </div>
    <div class="drawing-bottom-controls">
      <p id="drawing-camera-status" class="drawing-camera-status" role="status" aria-live="polite">Камерата се стартира…</p>
      <div class="drawing-controls-row">
        <button class="drawing-btn" id="btn-day4-retry" type="button">Опитай пак</button>
        <button class="drawing-btn" id="btn-day4-fit" type="button">Кадър: запълни</button>
        <button class="drawing-btn" id="btn-day4-grid" type="button">Скрий мрежата</button>
      </div>
      <label class="drawing-slider-label" for="day4-opacity">Прозрачност на тестовия слой <strong id="day4-opacity-number">50%</strong></label>
      <input id="day4-opacity" type="range" min="0" max="100" value="50" step="1" />
      <p class="drawing-note">Временен тестов слой — реална снимка, жестове и PNG контроли добавяме след Figma.</p>
    </div>
  </div>
  <section id="day2">
    <h2>Ден 2 — Camera + Python Spike</h2>
    <p class="hint">Работи само след натискане на бутон. Първото зареждане изисква интернет; Pyodide още не е част от офлайн кеша.</p>
    <div id="camera-container" class="camera-container"><div id="camera-stage" class="camera-stage"><video id="camera-preview" autoplay muted playsinline></video><img id="day3-art" class="day3-art" alt="Тестов полупрозрачен контур" hidden /></div></div>
    <div class="actions"><button class="act" id="btn-camera" type="button">Пусни камера</button></div>
    <p class="hint">Изпълни последователно: инициализация → NumPy proxy → OpenCV Canny → 10× Canny. Остави камерата включена за комбинираните тестове. Измерванията ще се запишат в JSON.</p>
    <div class="actions">
      <button class="act" id="btn-init" data-python type="button">1. Стартирай Pyodide</button>
      <button class="act" id="btn-numpy" data-python type="button">2. NumPy 5×</button>
      <button class="act" id="btn-opencv" data-python type="button">3. cv2.Canny 5×</button>
      <button class="act" id="btn-opencv10" data-python type="button">4. cv2.Canny 10×</button>
      <button class="act" id="btn-reset-python" type="button">Освободи Python Worker</button>
    </div>
    <p id="day2-status" role="status" aria-live="polite">Готово за тест.</p>
    <pre id="day2-result" class="benchmark-result" aria-label="Резултат от измерването">Няма измервания.</pre>
  </section>
  <section id="day3">
    <h2>Ден 3 — Fullscreen Camera + Stress Test</h2>
    <p class="hint">Сравняваме един и същ поток (цел 1280×720, 30 FPS) в три режима. „Цял екран“ е CSS immersive режим в PWA — не променя резолюцията на камерата. Измерваме плавността, не процесната RAM.</p>
    <div class="actions">
      <button class="act" id="btn-day3-off" type="button">Камера OFF</button>
      <button class="act" id="btn-day3-preview" type="button">Малък прозорец</button>
      <button class="act" id="btn-day3-fullscreen" type="button">Камера на цял екран</button>
    </div>
    <p class="hint">Режим: <strong id="day3-mode">Малък прозорец</strong>. Промени тестовия overlay само между измерванията:</p>
    <label class="day3-label" for="day3-overlay-size">Тестов контур: </label>
    <select id="day3-overlay-size" class="day3-select"><option value="0" selected>Изключен</option><option value="1024">1024 px / прозрачен PNG</option><option value="2048">2048 px / прозрачен PNG</option></select>
    <p class="hint">Препоръчителна последователност: OFF baseline → мини preview → 2048 px overlay → fullscreen baseline → fullscreen 20s NumPy → fullscreen 20s OpenCV. Пусни измерванията и с камера на малък прозорец за сравнение.</p>
    <div class="actions">
      <button class="act" id="btn-day3-idle" data-python type="button">12s без Python</button>
      <button class="act" id="btn-day3-numpy" data-python type="button">20s NumPy натоварване</button>
      <button class="act" id="btn-day3-opencv" data-python type="button">20s OpenCV натоварване</button>
      <button class="act" id="btn-day3-stop" type="button" disabled>Спри теста</button>
    </div>
    <p class="hint">При background/foreground резултатът се маркира като прекъснат. За „истински cold start“ затвори от app switcher, отвори Home Screen отново и стартирай Pyodide.</p>
    <p id="day3-status" role="status" aria-live="polite">Готово за тест на Ден 3.</p>
    <pre id="day3-result" class="benchmark-result" aria-label="Измервания от Ден 3">Няма резултати.</pre>
  </section>
  <div id="day3-fullscreen" class="day3-fullscreen" hidden role="dialog" aria-modal="true" aria-label="Камера на цял екран">
    <div id="day3-full-stage" class="day3-full-stage"></div>
    <div class="day3-full-hud">
      <div class="day3-hud-head"><strong>SketchyAR • Fullscreen</strong><button class="act" id="btn-day3-exit" type="button">Изход</button></div>
      <p id="day3-full-status" role="status">Камера на цял екран.</p>
      <div class="actions">
        <button class="act" id="btn-day3-full-idle" data-python type="button">12s без Python</button>
        <button class="act" id="btn-day3-full-numpy" data-python type="button">20s NumPy</button>
        <button class="act" id="btn-day3-full-opencv" data-python type="button">20s OpenCV</button>
        <button class="act" id="btn-day3-full-stop" type="button" disabled>Спри</button>
      </div>
    </div>
  </div>
  <section>
    <h2>Събития</h2>
    <ol id="log"></ol>
  </section>
  <section>
    <div class="actions">
      <button class="act" id="btn-share" type="button">Запази / сподели JSON</button>
      <button class="act" id="btn-copy" type="button">Копирай JSON</button>
      <button class="act" id="btn-clear" type="button">Изчисти логовете</button>
      <button class="act" id="btn-error" type="button">Тест: грешка</button>
      <button class="act" id="btn-job" type="button">Старт на тестова задача</button>
    </div>
    <p id="status" role="status"></p>
    <p class="hint">Проверка на crash marker: старт на тестова задача, затваряне на приложението от app switcher, ново отваряне. В събитията трябва да се появи unexpected_stop.</p>
  </section>
</main>`;

initDay2();
initDay3();
initDay4();

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function setStatus(text: string): void {
  $('status').textContent = text;
}

function addRow(dl: HTMLElement, key: string, value: string): void {
  const dt = document.createElement('dt');
  dt.textContent = key;
  const dd = document.createElement('dd');
  dd.textContent = value;
  dl.append(dt, dd);
}

$('ver').textContent = `v${__APP_VERSION__} (${__BUILD_SHA__})`;
{
  const dl = $('build');
  addRow(dl, 'Версия', __APP_VERSION__);
  addRow(dl, 'Commit', __BUILD_SHA__);
  addRow(dl, 'Построен', new Date(__BUILD_TIME__).toLocaleString('bg-BG'));
  addRow(dl, 'Режим на build', import.meta.env.MODE);
  addRow(dl, 'Debug конзола', debugWanted() ? 'включена' : 'изключена (5 докосвания върху версията)');
}

function renderEnv(env: EnvSnapshot): void {
  const dl = $('env');
  dl.replaceChildren();
  addRow(dl, 'Режим', env.displayMode === 'standalone' ? 'Home Screen (standalone)' : 'Браузър (таб)');
  addRow(dl, 'Мрежа', env.online ? 'онлайн' : 'офлайн');
  addRow(dl, 'Viewport', `${env.viewport} @${env.dpr}x`);
  addRow(dl, 'Ядра', String(env.cores));
  addRow(dl, 'Хранилище', env.storage ? `${env.storage.usageMB} / ${env.storage.quotaMB} MB` : 'няма данни');
  addRow(dl, 'persist()', env.persisted === null ? 'неподдържано' : env.persisted ? 'предоставено' : 'не е предоставено');
  addRow(dl, 'Service Worker', env.swController ? 'контролира страницата' : 'няма (очаквано до Ден 19)');

  const caps = $('caps');
  caps.replaceChildren();
  for (const [name, ok] of Object.entries(env.feature)) {
    const li = document.createElement('li');
    li.className = ok ? 'yes' : 'no';
    li.textContent = name;
    caps.append(li);
  }
}

let firstProbe = true;
async function refreshEnv(): Promise<void> {
  try {
    const env = await probeEnv();
    D.setEnv(env);
    renderEnv(env);
    if (firstProbe) {
      firstProbe = false;
      D.log('info', 'bootstrap', 'env', { displayMode: env.displayMode, ua: env.ua, feature: env.feature });
    }
  } catch (err) {
    D.log('error', 'bootstrap', 'проба на средата не успя', err);
  }
}
void refreshEnv();
setInterval(() => {
  if (!document.hidden) void refreshEnv();
}, 15_000);
addEventListener('online', () => void refreshEnv());
addEventListener('offline', () => void refreshEnv());

// ---- лог ----
function renderLog(): void {
  const ol = $('log');
  ol.replaceChildren();
  for (const e of D.getEvents().slice(-40).reverse()) {
    const li = document.createElement('li');
    li.className = e.level;
    li.textContent = `${e.t.slice(11, 23)} [${e.type}] ${e.msg}`;
    ol.append(li);
  }
}
let renderPending = false;
D.subscribe(() => {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderLog();
  });
});
renderLog();
D.recordMetric('boot.firstRender', performance.now());

// ---- действия ----
let taps: number[] = [];
$('ver').addEventListener('click', () => {
  const now = Date.now();
  taps = taps.filter((t) => now - t < 3000);
  taps.push(now);
  if (taps.length >= 5) toggleDebug();
});

async function shareReport(): Promise<void> {
  const json = D.reportJson(); // синхронно, преди първия await
  const name = `sketchyar-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      D.log('info', 'export', 'диагностиката е споделена');
      setStatus('Готово.');
      return;
    }
  } catch (err) {
    if ((err as DOMException).name === 'AbortError') {
      setStatus('Отказано.');
      return;
    }
    D.log('warn', 'export', 'share не успя, пробвам сваляне', err);
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  D.log('info', 'export', 'диагностиката е свалена като файл');
  setStatus('Файлът е свален. Ако нищо не се случи, използвай „Копирай JSON“.');
}

$('btn-share').addEventListener('click', () => void shareReport());
$('btn-copy').addEventListener('click', () => {
  navigator.clipboard.writeText(D.reportJson()).then(
    () => setStatus('JSON е копиран.'),
    (err: unknown) => {
      D.log('error', 'export', 'копирането не успя', err);
      setStatus('Копирането не успя. Използвай „Запази / сподели JSON“.');
    },
  );
});
$('btn-clear').addEventListener('click', () => {
  D.clearLog();
  setStatus('Логовете са изчистени.');
});
$('btn-error').addEventListener('click', () => {
  setTimeout(() => {
    throw new Error('Тестова грешка');
  }, 0);
  void Promise.reject(new Error('Тестов отказан promise'));
  setStatus('Изпратени са две тестови грешки; виж ги в събитията.');
});

let jobId: string | null = null;
$('btn-job').addEventListener('click', (ev) => {
  const btn = ev.currentTarget as HTMLButtonElement;
  if (jobId) {
    D.endJob(jobId);
    jobId = null;
    btn.textContent = 'Старт на тестова задача';
  } else {
    jobId = D.beginJob('test-job');
    btn.textContent = 'Край на тестова задача';
  }
});
