import './styles.css';
import * as D from './diagnostics';
import { probeEnv, type EnvSnapshot } from './env';
import { debugWanted, enableDebug, toggleDebug } from './debug';
import { initDay2 } from './day2';
import { initDay3 } from './day3';
import { initDay4, requestNewDrawing, openSavedDrawing } from './day4';
import { initHome } from './home';
import { initDay5Diagnostics } from './day5-diagnostics';
import { initDay6Diagnostics } from './day6-diagnostics';
import { initDay7Diagnostics } from './day7-diagnostics';
import { initDay8Diagnostics } from './day8-diagnostics';
import { initDay9Diagnostics } from './day9-diagnostics';
import { initDay10Diagnostics } from './day10-diagnostics';
import { initDay11Diagnostics } from './day11-diagnostics';
import { initDay12Diagnostics } from './day12-diagnostics';
import { initDay13Diagnostics } from './day13-diagnostics';
import { initDay14Diagnostics } from './day14-diagnostics';
import { initDay15Diagnostics } from './day15-diagnostics';

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
<section id="sketchy-home" class="sketchy-home" aria-label="Начална страница на SketchyAR">
  <!-- The wallpaper is now painted ON html, outside the iOS PWA fixed viewport. -->
  <div id="sketchy-home-group" class="sketchy-home-group">
    <button id="home-new-project" class="home-pill home-new" type="button" aria-label="Нова рисунка">
      <img class="home-pill-bg" src="./ui/pill-base-white.svg" alt="" />
      <span class="home-pill-text home-new-text">Нова рисунка</span>
    </button>
    <button id="home-load-project" class="home-pill home-load" type="button" aria-label="Зареди запазен проект">
      <img class="home-pill-bg" src="./ui/pill-base-white.svg" alt="" />
      <span class="home-pill-text home-load-text">Зареди проект</span>
    </button>
    <h2 class="home-old-heading">Стари проекти</h2>
    <div class="home-project-grid" aria-label="Стари проекти">
      <div class="home-project-tile" aria-label="Празно място за проект"><img src="./ui/polaroid.png" alt="" /></div>
      <div class="home-project-tile" aria-label="Празно място за проект"><img src="./ui/polaroid.png" alt="" /></div>
      <div class="home-project-tile" aria-label="Празно място за проект"><img src="./ui/polaroid.png" alt="" /></div>
      <div class="home-project-tile" aria-label="Празно място за проект"><img src="./ui/polaroid.png" alt="" /></div>
    </div>
    <button id="home-offline" class="home-pill home-offline" type="button" aria-label="Офлайн режим — информация">
      <img class="home-pill-bg" src="./ui/pill-base-white.svg" alt="" />
      <span id="home-offline-indicator" class="home-offline-indicator" aria-hidden="true"></span>
      <span class="home-pill-text home-offline-text">Офлайн Режим</span>
    </button>
    <button id="home-save-icon" class="home-save" type="button" aria-label="Архивиране" title="Архивиране" aria-controls="home-backup-popover" aria-expanded="false">
      <img class="home-square-bg" src="./ui/square-button-white.svg" alt="" />
      <img class="home-floppy" src="./ui/floppy.png" alt="" />
    </button>
    <!-- Day 16: compact menu layered over the EXISTING Figma-sized home; no layout changes. -->
    <div id="home-backup-popover" class="home-backup-popover" role="group" aria-label="Архивиране" hidden>
      <button id="home-backup-create" type="button"><span aria-hidden="true">↓</span> Запази архив</button>
      <button id="home-backup-load" type="button"><span aria-hidden="true">↑</span> Зареди архив</button>
      <button id="home-backup-diagnostics" type="button"><span aria-hidden="true">⚙</span> Диагностика</button>
    </div>
  </div>
  <p id="home-message" class="home-message" role="status" aria-live="polite" hidden></p>
</section>
<div id="home-offline-dialog" class="offline-dialog-backdrop" role="presentation" hidden>
  <div class="offline-dialog" role="dialog" aria-modal="true" aria-labelledby="offline-dialog-title" aria-describedby="offline-dialog-desc" tabindex="-1">
    <button id="offline-dialog-close" class="offline-close" type="button" aria-label="Затвори информацията">×</button>
    <h2 id="offline-dialog-title">Офлайн Режим</h2>
    <p id="offline-dialog-desc">Локални ресурси и съхранение на SketchyAR.</p>
    <div class="offline-status-row"><span>Core ресурси</span><strong id="offline-core-status">Проверява се…</strong></div>
    <div class="offline-status-row"><span>Edge AI · TEED</span><strong id="offline-ai-status">Проверява се…</strong></div>
    <div class="offline-status-row"><span>Cache Storage</span><strong id="offline-cache-status">Проверява се…</strong></div>
    <div class="offline-status-row"><span>Локално пространство</span><strong id="offline-storage-status">Проверява се…</strong></div>
    <div class="offline-status-row"><span>Постоянно съхранение</span><strong id="offline-persist-status">Проверява се…</strong></div>
    <p id="offline-dialog-note" class="offline-dialog-note">Офлайн пакетите и проверката на хешовете са планирани за Дни 48–51 (план v3.1).</p>
    <p id="offline-dialog-action-status" class="offline-dialog-action-status" aria-live="polite"></p>
    <div class="offline-dialog-actions">
      <button id="offline-dialog-check" type="button">Провери отново</button>
      <button id="offline-dialog-refresh" type="button">Обнови страницата</button>
    </div>
  </div>
</div>
<!-- Day 17: title -> rename, image -> drawing, pencil -> edit, bin -> delete. -->
<div id="home-project-dialog" class="project-dialog-backdrop" role="presentation" hidden>
  <div class="project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title" aria-describedby="project-dialog-description" tabindex="-1">
    <button id="project-dialog-close" class="project-dialog-close" type="button" aria-label="Затвори">×</button>
    <h2 id="project-dialog-title">Проект</h2>
    <p id="project-dialog-description"></p>
    <p id="project-dialog-error" class="project-dialog-error" role="alert" hidden></p>
    <form id="project-rename-form" hidden>
      <label for="project-rename-input">Име на рисунката</label>
      <input id="project-rename-input" type="text" maxlength="100" autocomplete="off" required />
      <div class="project-dialog-buttons project-dialog-inline">
        <button id="project-rename-cancel" type="button">Отказ</button>
        <button id="project-rename-save" type="submit">Запази</button>
      </div>
    </form>
    <div id="project-delete-confirm" hidden>
      <p class="project-dialog-warning">Ще бъдат изтрити оригиналните снимки, миниатюрите и всички запазени настройки на този проект. Действието не може да се отмени.</p>
      <div class="project-dialog-buttons project-dialog-inline">
        <button id="project-delete-cancel" type="button">Отказ</button>
        <button id="project-delete-yes" type="button" class="project-dialog-danger">Изтрий окончателно</button>
      </div>
    </div>
  </div>
</div>
<!-- Day 19: truthful graphite Generator UI shell. Interactive Day 20 draft choices.
     No fake processing: Draw remains disabled until Generate -> Save -> Draw exists. -->
<div id="day17-edit-screen" class="day17-edit-screen day20-figma-screen" role="dialog" aria-modal="true"
     aria-labelledby="day17-edit-heading" aria-describedby="day17-edit-info" hidden>
  <div class="day19-editor day20-figma-layout" id="day19-generator-shell">
    <header class="day17-edit-top day19-header day20-figma-header">
      <img class="day20-figma-header-art" src="./ui/generator/figma-header-exact.svg" alt="" aria-hidden="true" />
      <button id="day17-edit-back" type="button" class="day17-edit-back day19-icon-button day20-figma-back"
              aria-label="Назад"></button>
      <h2 id="day17-edit-heading" class="day20-visually-hidden">Редакция</h2>
    </header>

    <div class="day17-edit-card day19-content day20-figma-content">
      <p class="day17-edit-project-label" hidden>Избран проект</p>
      <p id="day17-edit-project-name" class="day17-edit-project-name" hidden></p>
      <div class="day19-preview-frame day20-figma-polaroid">
        <div class="day17-edit-preview-placeholder" id="day18-preview-window" tabindex="0" role="img"
             aria-label="Преглед на скицата. При запазена скица задръж за оригинала и отпусни за скицата.">
          <span id="day18-preview-empty" aria-hidden="true"></span>
          <img id="day18-original-preview" alt="Снимка на проекта" draggable="false" hidden />
          <span id="day20-compare-indicator" class="day20-compare-indicator" aria-hidden="true" hidden>Оригинал</span>
        </div>
        <img class="day20-figma-polaroid-art" src="./ui/generator/figma-polaroid.svg" alt="" aria-hidden="true" />
        <button id="day19-preview-zoom" class="day19-preview-zoom" type="button"
                aria-label="Отвори цялото изображение" aria-controls="day19-image-lightbox"
                aria-haspopup="dialog" disabled>
          <img src="./ui/generator/zoom-control.svg" alt="" aria-hidden="true" />
        </button>
      </div>
      <p id="day18-preview-note" class="day18-preview-note day20-visually-hidden" role="status" aria-live="polite">
        Зарежда се оригиналната снимка…
      </p>

      <fieldset class="day19-controls day20-controls day20-figma-controls" aria-describedby="day17-edit-info">
        <legend class="day20-visually-hidden">Настройки на скицата</legend>
        <img class="day20-figma-controls-art" src="./ui/generator/figma-controls-lettering.svg" alt="" aria-hidden="true" />
        <div class="day19-style-list day20-figma-styles" role="group" aria-label="Стил">
          <button type="button" class="day19-chip day19-chip-selected" data-style="sketch" aria-pressed="true" aria-label="Скица"><img class="day20-choice-graphite" src="./ui/generator/style-sketch-on.svg" data-selected-src="./ui/generator/style-sketch-on.svg" data-default-src="./ui/generator/style-sketch-off.svg" alt="" aria-hidden="true" /></button>
          <button type="button" class="day19-chip" data-style="manga" aria-pressed="false" aria-label="Манга"><img class="day20-choice-graphite" src="./ui/generator/style-manga-off.svg" data-selected-src="./ui/generator/style-manga-on.svg" data-default-src="./ui/generator/style-manga-off.svg" alt="" aria-hidden="true" /></button>
          <button type="button" class="day19-chip" data-style="comic" aria-pressed="false" aria-label="Комикс"><img class="day20-choice-graphite" src="./ui/generator/style-comic-off.svg" data-selected-src="./ui/generator/style-comic-on.svg" data-default-src="./ui/generator/style-comic-off.svg" alt="" aria-hidden="true" /></button>
        </div>
        <div class="day19-slider-group day20-detail day20-figma-detail">
          <label class="day20-visually-hidden" for="day19-detail-slider">Детайлност:<output id="day20-detail-value" for="day19-detail-slider">3 / 5</output></label>
          <div class="day20-figma-detail-track" style="--day20-detail-progress:50%">
            <img class="day20-figma-slider-fill" src="./ui/generator/detail-graphite-fill-exact.svg" alt="" aria-hidden="true" />
            <img class="day20-figma-slider-thumb" src="./ui/camera/slider-thumb.svg" alt="" aria-hidden="true" />
            <input id="day19-detail-slider" type="range" min="1" max="5" step="1" value="3" aria-label="Детайлност от 1 до 5" />
          </div>
        </div>
        <div class="day20-lines day20-figma-lines">
          <div class="day20-line-options" role="group" aria-label="Дебелина на линиите">
            <button type="button" class="day20-line-chip" data-line="thin" aria-pressed="false" aria-label="Тънки"><img class="day20-line-graphite" src="./ui/generator/line-thin-off.svg" data-selected-src="./ui/generator/line-thin-on.svg" data-default-src="./ui/generator/line-thin-off.svg" alt="" aria-hidden="true" /></button>
            <button type="button" class="day20-line-chip day20-line-selected" data-line="normal" aria-pressed="true" aria-label="Нормални"><img class="day20-line-graphite" src="./ui/generator/line-normal-on.svg" data-selected-src="./ui/generator/line-normal-on.svg" data-default-src="./ui/generator/line-normal-off.svg" alt="" aria-hidden="true" /></button>
            <button type="button" class="day20-line-chip" data-line="thick" aria-pressed="false" aria-label="Дебели"><img class="day20-line-graphite" src="./ui/generator/line-thick-off.svg" data-selected-src="./ui/generator/line-thick-on.svg" data-default-src="./ui/generator/line-thick-off.svg" alt="" aria-hidden="true" /></button>
          </div>
        </div>
      </fieldset>
      <p id="day17-edit-info" class="day19-limits-note day20-visually-hidden" role="status" aria-live="polite">Избраните настройки са визуални и не обработват снимката. Генерирането предстои.</p>
      <button id="day19-draw" type="button" class="day19-draw-button day20-figma-draw" disabled
              aria-label="Рисувай — генерирането още не е налично" aria-describedby="day17-edit-info">
        <img src="./ui/generator/figma-draw.svg" alt="Рисувай" />
      </button>
      <button id="day17-edit-return" class="day17-edit-return day19-return" type="button" hidden>Към проектите</button>
    </div>
  </div>
</div>
<!-- Day 19.2: full-source-image lightbox. Sibling of the editor so inert editor
     cannot make its close button inaccessible. Uses the existing preview Blob URL. -->
<div id="day19-image-lightbox" class="day19-image-lightbox" role="presentation" hidden>
  <div class="day19-lightbox-panel" role="dialog" aria-modal="true" aria-label="Цялото изображение">
    <button id="day19-lightbox-close" class="day19-lightbox-close" type="button"
            aria-label="Затвори цялото изображение">×</button>
    <img id="day19-lightbox-image" alt="Цялата оригинална снимка на проекта" />
  </div>
</div>
<!-- Day 16: Native file picker is never inside a hidden Home or developer container. -->
<input id="home-backup-file" type="file" accept=".zip,application/zip" hidden />
<div id="home-backup-dialog" class="home-backup-dialog-backdrop" role="presentation" hidden>
  <div id="home-backup-panel" class="home-backup-panel" role="dialog" aria-modal="true" aria-labelledby="home-backup-dialog-title" aria-describedby="home-backup-details" tabindex="-1">
    <button id="home-backup-close" class="home-backup-close" type="button" aria-label="Затвори">×</button>
    <h2 id="home-backup-dialog-title">Архивиране</h2>
    <p id="home-backup-details"></p>
    <p id="home-backup-status" class="home-backup-status" role="status" aria-live="polite"></p>
    <p id="home-backup-warning" class="home-backup-warning"></p>
    <div id="home-backup-export-actions" class="home-backup-actions" hidden>
      <button id="home-backup-prepare" type="button">Подготви ZIP отново</button>
      <button id="home-backup-share" type="button" disabled>Запази във Files</button>
    </div>
    <div id="home-backup-import-actions" class="home-backup-actions" hidden>
      <button id="home-backup-sandbox" type="button" disabled>Тест във временна база</button>
      <button id="home-backup-restore" class="home-backup-restore" type="button" disabled>Възстанови с потвърждение</button>
    </div>
    <p class="home-backup-limits">Само локално · Без изпращане на снимки · ZIP32 STORE до 64 MiB · Няма автоматично презаписване.</p>
  </div>
</div>
<div id="developer-screen" hidden>
<main>
  <button id="developer-back-home" class="act developer-back" type="button">← Начална страница</button>
  <header>
    <h1>SketchyAR</h1>
    <button id="ver" class="ver" type="button" aria-label="Версия на приложението"></button>
  </header>
  <p class="lead">Ден 17: моливче, преименуване от името и директно отваряне. Backup и диагностика са запазени.</p>
  <section><h2>Build</h2><dl id="build"></dl></section>
  <section><h2>Среда</h2><dl id="env"><dt>Зареждане</dt><dd>…</dd></dl></section>
  <section><h2>Възможности на устройството</h2><ul id="caps" class="caps"></ul></section>
  <section id="day5">
    <h2>Ден 5 — Локални проекти / IndexedDB</h2>
    <p class="hint">Провери последния записан оригинален Blob. При първото натискане се запазва SHA-256 baseline; след force-close повторната проверка трябва да е match. Снимки над 8 MB тествай само на реалния iPhone.</p>
    <button class="act" id="btn-day5-verify" type="button">Провери локалните проекти</button>
    <pre id="day5-result" class="benchmark-result">Още няма проверка.</pre>
    <h2>Ден 6 — Проверка на възстановените настройки</h2>
    <p class="hint">Прочита оригиналните overlay presets. Не изменя проектите.</p>
    <button class="act" id="btn-day6-verify" type="button">Покажи запазените настройки</button>
    <pre id="day6-result" class="benchmark-result">Още няма проверка.</pre>
    <h2>Ден 7 — Цялост на локалните данни</h2>
    <p class="hint">Проверява всички записи за осиротели assets, presets и хешове след преименуване/изтриване. Не променя базата.</p>
    <button class="act" id="btn-day7-audit" type="button">Провери връзките в базата</button>
    <pre id="day7-result" class="benchmark-result">Още няма проверка.</pre>
    <h2>Ден 8 — Локални зависимости</h2>
    <p class="hint">Проверява дали Pyodide/NumPy файловете са от същия сайт (HEAD) и дали Caveat Bold е зареден. Това още НЕ проверява Service Worker офлайн кеш.</p>
    <button class="act" id="btn-day8-assets" type="button">Провери self-hosted ресурси</button>
    <pre id="day8-assets-result" class="benchmark-result">Още няма проверка.</pre>
    <h2>Ден 9 — Python Sketch Engine</h2>
    <p class="hint">Изпълнява <strong>същия Python модул</strong> като на Windows в Pyodide Worker: Gaussian, Sobel и XDoG върху детерминистичен вход 512×512, float32, 3 измервания. Не променя запазените проекти и не използва камерата.</p>
    <button class="act" id="btn-day9-benchmark" type="button">Провери Python Sketch Engine</button>
    <pre id="day9-benchmark-result" class="benchmark-result" role="status">Още няма проверка.</pre>
    <h2>Ден 10 — Тонални нива и контури</h2>
    <p class="hint">Същият NumPy код като на Windows: 3/5 тона, Sobel бинарни линии и 4 тона + XDoG. Използва синтетични детерминистични масиви с <code>float32</code>, 3 повторения; не обработва личните снимки, не променя IndexedDB и не измерва камерата.</p>
    <div class="actions">
      <button class="act" id="btn-day10-512" type="button">Тествай Day 10 · 512 px</button>
      <button class="act" id="btn-day10-1024" type="button">Тествай Day 10 · 1024 px</button>
    </div>
    <pre id="day10-benchmark-result" class="benchmark-result" role="status">Още няма проверка.</pre>
    <h2>Ден 11 — Otsu и морфология (NumPy)</h2>
    <p class="hint">Автоматичен Otsu праг и бинарни erosion, dilation, opening и closing. Тестът използва еднаква синтетична снимка на Windows и iPhone. Няма OpenCV, няма промяна на съхранението и камерата.</p>
    <div class="actions">
      <button class="act" id="btn-day11-512" type="button">Тествай Day 11 · 512 px</button>
      <button class="act" id="btn-day11-1024" type="button">Тествай Day 11 · 1024 px</button>
    </div>
    <pre id="day11-benchmark-result" class="benchmark-result" role="status">Още няма проверка.</pre>
    <h2>Ден 11 — Service Worker експеримент</h2>
    <p class="hint">ОТДЕЛНА тестова страница с ограничен scope <code>sw-spike/</code>. Не управлява основния SketchyAR, камерата или Python ресурсите. Не доказва Offline Ready.</p>
    <a class="act" id="day11-sw-spike-link" href="./sw-spike/" style="display:inline-flex;align-items:center;text-decoration:none">Отвори изолирания SW тест</a>
    <h2>Ден 12 — NMS и hysteresis (NumPy)</h2>
    <p class="hint">Детерминистичен тест на 4-посочно NMS, 8-свързан hysteresis и пълен Gaussian → Sobel → NMS → hysteresis върху 512/1024 px. Не обработва снимките в галерията и не променя IndexedDB.</p>
    <div class="actions">
      <button class="act" id="btn-day12-512" type="button">Тествай Day 12 · 512 px</button>
      <button class="act" id="btn-day12-1024" type="button">Тествай Day 12 · 1024 px</button>
    </div>
    <pre id="day12-benchmark-result" class="benchmark-result" role="status">Още няма проверка.</pre>
    <h2>Ден 13 — Реална снимка → Python → прозрачна скица</h2>
    <p class="hint">Тестът работи с <strong>вече записана снимка</strong> от галерията и не променя оригинала, камерата или активното изображение. Умалява до 1024 px, записва резултата като отделен <code>processed</code> PNG asset с прозрачност. Първо опитай с тестов проект; снимките не се изпращат към сървър.</p>
    <label for="day13-project">Избери проект за обработка:</label>
    <select id="day13-project" style="max-width:100%;padding:10px;display:block;margin:10px 0"></select>
    <div class="actions">
      <button class="act" id="btn-day13-refresh" type="button">Обнови списъка</button>
      <button class="act" id="btn-day13-process" type="button" disabled>Генерирай и запази PNG</button>
      <button class="act" id="btn-day13-export" type="button" disabled>Изтегли PNG</button>
    </div>
    <img id="day13-preview" alt="Прозрачна контурна скица — резултат от Python" hidden style="max-width:100%;max-height:45vh;object-fit:contain;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 50%/18px 18px" />
    <pre id="day13-result" class="benchmark-result" role="status">Избери проект за теста.</pre>
    <h2>Ден 13 — Backup manifest v1 · Предварителна проверка</h2>
    <p class="hint">Проверява само целостта на метаданните (включително <code>guide</code>, произход и производни assets). <strong>Не създава ZIP и не е backup!</strong> Експорт, SHA-256 проверка и restore са Ден 14.</p>
    <button class="act" id="btn-day13-manifest" type="button">Провери manifest v1</button>
    <pre id="day13-manifest-result" class="benchmark-result" role="status">Още няма проверка.</pre>
    <h2>Ден 14 — ZIP backup, SHA-256 и безопасно възстановяване</h2>
    <p class="hint">Създай архив на всички локални проекти и assets. След запис във Files избери <strong>точно записания ZIP</strong> за независима проверка. Поддържат се безопасни ZIP32 файлове без компресия, създадени от SketchyAR. Не изтривай данните на приложението.</p>
    <div class="actions">
      <button class="act" id="btn-day14-create" type="button">1. Създай ZIP</button>
      <button class="act" id="btn-day14-save" type="button" disabled>2. Запази ZIP във Files</button>
      <button class="act" id="btn-day14-choose" type="button">3. Избери записания ZIP</button>
      <button class="act" id="btn-day14-verify" type="button" disabled>4. Провери SHA-256</button>
      <button class="act" id="btn-day14-sandbox" type="button" disabled>5. Тест Restore (безопасен)</button>
    </div>
    <input type="file" id="day14-file" accept=".zip,application/zip" hidden />
    <p class="hint"><strong>Незадължително:</strong> реалният импорт е само добавящ и отказва ВСЕКИ ID конфликт. Първо изпълни безопасния тест; реалните проекти никога не се изтриват автоматично.</p>
    <button class="act" id="btn-day14-restore" type="button" disabled>Restore в истинската база (с потвърждение)</button>
    <pre id="day14-result" class="benchmark-result" role="status">ZIP backup още не е създаден.</pre>
    <h2>Ден 15 — Hardening на Backup & Recovery</h2>
    <p class="hint">Безопасен тест с вече записан ZIP: отхвърляне на повреден архив, повторен импорт с конфликт и сравнение на ключовете в истинската база. <strong>Няма изтриване или запис в реалните проекти.</strong> Тества се само отделна временна база.</p>
    <div class="actions">
      <button class="act" id="btn-day15-choose" type="button">1. Избери запазения ZIP</button>
      <button class="act" id="btn-day15-run" type="button" disabled>2. Стартирай безопасния тест</button>
    </div>
    <input type="file" id="day15-file" accept=".zip,application/zip" hidden />
    <pre id="day15-result" class="benchmark-result" role="status">Още няма тест за Ден 15.</pre>
  </section>
  <section id="day4">
    <h2>Ден 4 — Drawing основа</h2>
    <p class="hint">Камерата е отделна от рисунката. „Нова рисунка“ първо отваря избор на снимка; мрежата 3×3 служи само за подравняване на камерата.</p>
    <div class="actions">
      <button class="act" id="btn-day4-open" type="button">Отвори Drawing</button>
      <button class="act" id="btn-day4-capabilities" type="button">Провери камерата</button>
    </div>
    <p id="day4-status" role="status" aria-live="polite">Готово за тест на Ден 4.</p>
    <pre id="day4-capabilities" class="benchmark-result" aria-label="Контроли на камерата">Няма проверка.</pre>
  </section>
  <div id="day4-screen" class="drawing-screen" role="dialog" aria-modal="true" aria-label="SketchyAR Drawing" hidden>
    <div id="drawing-video-stage" class="drawing-video-stage">
      <video id="drawing-camera" autoplay muted playsinline aria-label="Камера за рисуване"></video>
      <div id="drawing-artwork" class="drawing-artwork" aria-label="Независим слой за рисунка">
        <img id="drawing-user-image" class="drawing-user-image" alt="Избрана рисунка върху камерата" hidden />
      </div>
      <!-- A fixed rule-of-thirds viewfinder: camera-aligned, never scaled, rotated or faded with the image. -->
      <div id="drawing-grid" class="drawing-overlay-grid" aria-hidden="true" hidden>
        <span class="drawing-gridline drawing-gridline-v drawing-gridline-v1"></span>
        <span class="drawing-gridline drawing-gridline-v drawing-gridline-v2"></span>
        <span class="drawing-gridline drawing-gridline-h drawing-gridline-h1"></span>
        <span class="drawing-gridline drawing-gridline-h drawing-gridline-h2"></span>
      </div>
    </div>
    <!-- Camera UI: real interactive layers, not a flattened Camera_Screen.svg. -->
    <div class="drawing-top-controls sketch-camera-top">
      <button class="sketch-camera-back" id="sketch-camera-back" type="button" aria-label="Назад към началната страница" title="Начална страница">
        <img src="./ui/camera/import.svg" alt="" />
      </button>
      <button class="sketch-camera-change-image" id="sketch-camera-change-image" type="button"
              aria-label="Изображение и скица — отвори меню" aria-controls="sketch-camera-change-menu"
              aria-expanded="false" title="Снимка и скица">
        <img src="./ui/camera/change-image.svg" alt="" />
      </button>
      <div id="sketch-camera-change-menu" class="sketch-camera-change-menu" role="group"
           aria-label="Действия за текущата рисунка" hidden>
        <button id="sketch-camera-menu-edit" type="button">Промени скицата</button>
        <button id="sketch-camera-menu-source" type="button">Смени снимката</button>
      </div>
    </div>
    <div class="drawing-bottom-controls sketch-camera-bottom">
      <div class="sketch-camera-slider-label-row">
        <label for="sketch-camera-opacity" class="sketch-camera-slider-title">Прозрачност</label>
        <output for="sketch-camera-opacity" id="sketch-camera-opacity-value" class="sketch-camera-slider-value">50%</output>
      </div>
      <div class="sketch-camera-slider-wrap" style="--opacity-percent:50%">
        <!-- The white graphite frame is always fully visible. Only the dark fill is clipped. -->
        <img class="sketch-camera-slider-back" src="./ui/camera/slider-tray.svg" alt="" />
        <div class="sketch-camera-slider-track">
          <img class="sketch-camera-slider-rail" src="./ui/camera/slider-graphite.svg" alt="" />
          <img class="sketch-camera-slider-thumb" src="./ui/camera/slider-thumb.svg" alt="" />
          <input id="sketch-camera-opacity" type="range" min="0" max="100" step="1" value="50" aria-label="Прозрачност на рисунката от 0 до 100 процента" />
        </div>
      </div>
      <div class="sketch-camera-actions" role="group" aria-label="Управление на рисунката">
        <button id="sketch-camera-mirror" class="sketch-camera-icon" type="button" aria-label="Огледално обръщане" aria-pressed="false" title="Огледално обръщане"><img src="./ui/camera/mirror.svg" alt="" /></button>
        <button id="sketch-camera-grid" class="sketch-camera-icon" type="button" aria-label="Мрежа 3 на 3 върху цялата камера" aria-pressed="false" title="Мрежа 3×3: включи/изключи"><img src="./ui/camera/grid.svg" alt="" /></button>
        <button id="sketch-camera-reset" class="sketch-camera-icon" type="button" aria-label="Центрирай и възстанови мащаба" title="Центрирай"><img src="./ui/camera/reset.svg" alt="" /></button>
        <button id="sketch-camera-lock" class="sketch-camera-icon" type="button" aria-label="Заключи позицията на рисунката" aria-pressed="false" title="Заключи рисунката"><img src="./ui/camera/lock.svg" alt="" /></button>
      </div>
      <div class="sketch-camera-status" id="sketch-camera-status" role="status" aria-live="polite"></div>
      <button class="sketch-camera-retry" id="btn-day4-retry" type="button" hidden>Камерата спря — опитай пак</button>
    </div>
    <!-- Retain Day 4 functionality and hooks; visual controls are replaced above. -->
    <div class="drawing-legacy-controls" aria-hidden="true">
      <button id="btn-day4-exit" type="button" tabindex="-1">Назад</button>
      <button id="btn-day4-image" type="button" tabindex="-1">Избери снимка</button>
            <button id="btn-day4-fit" type="button" tabindex="-1">Размер 100%</button>
      <button id="btn-day4-center" type="button" tabindex="-1">Центрирай</button>
      <button id="btn-day4-grid" type="button" tabindex="-1">Скрий мрежата</button>
      <label for="day4-scale">Размер <span id="day4-scale-number">100%</span></label>
      <input id="day4-scale" type="range" min="25" max="250" value="100" step="5" tabindex="-1" />
      <label for="day4-opacity">Прозрачност <span id="day4-opacity-number">50%</span></label>
      <input id="day4-opacity" type="range" min="0" max="100" value="50" step="1" tabindex="-1" />
      <span id="drawing-camera-status" role="status" aria-live="polite"></span>
    </div>
  </div>
  <section id="day2">
    <h2>Ден 2 — Camera + Python Spike</h2>
    <p class="hint">Работи само след натискане на бутон. Първото зареждане изисква интернет; Pyodide още не е част от офлайн кеша.</p>
    <div id="camera-container" class="camera-container"><div id="camera-stage" class="camera-stage"><video id="camera-preview" autoplay muted playsinline></video><img id="day3-art" class="day3-art" alt="Тестов полупрозрачен контур" hidden /></div></div>
    <div class="actions"><button class="act" id="btn-camera" type="button">Пусни камера</button></div>
    <p class="hint">Изпълни последователно: инициализация → NumPy proxy → OpenCV Canny → 10× Canny. Остави камерата включена за комбинираните тестове. Измерванията ще се запишат в JSON.</p>
    <div class="actions">
      <button class="act" id="btn-init" data-python type="button">1. Локален Pyodide</button>
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
</main>
</div>
<!-- Keep the native picker outside hidden Home/Drawing containers: iOS must open it from a direct tap. -->
<input id="drawing-image-file" type="file" accept="image/*" hidden />`;

// Drawing must remain visible when the developer view is hidden behind Home.
// It uses fixed positioning and must not inherit its parent's hidden state.
const drawingScreen = document.getElementById('day4-screen');
if (drawingScreen) document.getElementById('app')!.appendChild(drawingScreen);
// Bring up the Home screen FIRST. A benchmark/camera initialization error must
// never leave both views hidden and the user looking at an empty dark screen.
let drawingReady = false;
try {
  initHome(async () => {
    if (!drawingReady) {
      D.log('error', 'startup', 'Drawing module is not ready');
      window.alert('Drawing още не е готов. Отвори диагностиката от долния десен бутон.');
      return;
    }
    // Must be called directly within this tap. iOS may block a deferred file picker.
    requestNewDrawing();
  }, async (id: string) => {
    if (!drawingReady) {
      window.alert('Drawing още не е готов. Провери диагностиката.');
      return;
    }
    await openSavedDrawing(id);
  });
} catch (error) {
  D.log('error', 'startup', 'Home initialization failed', error);
  // Home is visible in the initial markup even if optional fitting fails.
}
try { initDay2(); }
catch (error) { D.log('error', 'startup', 'Day 2 diagnostic module failed', error); }
try { initDay3(); }
catch (error) { D.log('error', 'startup', 'Day 3 diagnostic module failed', error); }
try { initDay4(); drawingReady = true; }
catch (error) { D.log('error', 'startup', 'Day 4 drawing module failed', error); }
try { initDay5Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 5 diagnostics failed', error); }
try { initDay6Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 6 diagnostics failed', error); }
try { initDay7Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 7 diagnostics failed', error); }
try { initDay8Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 8 diagnostics failed', error); }
try { initDay9Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 9 diagnostics failed', error); }
try { initDay10Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 10 diagnostics failed', error); }
try { initDay11Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 11 diagnostics failed', error); }
try { initDay12Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 12 diagnostics failed', error); }
try { initDay13Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 13 diagnostics failed', error); }
try { initDay14Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 14 diagnostics failed', error); }
try { initDay15Diagnostics(); }
catch (error) { D.log('error', 'startup', 'Day 15 diagnostics failed', error); }
document.getElementById('startup-fallback')?.remove();

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
