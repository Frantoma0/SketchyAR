> **Ден 33.3 / v0.33.0:** адаптивно автоматично наместване чрез съпоставяне на частични контури в съседни квадранти: 4×4 за начално разпознаване, 6×6 за прецизиране, плюс времева стабилизация на пет кадъра. Една обща трансформация позиционира цялото изображение. Виж [docs/day33_contour_alignment.md](docs/day33_contour_alignment.md) и [Day33_INSTALL.txt](Day33_INSTALL.txt).

> **Ден 32.2 / v0.32.2:** Безопасен iPhone AI Lab с tiled AnimeGAN при 384/512 px, запис на прекъснати тестове и ограничени WebGL inference размери. Виж [docs/day32-2-safe-iphone-tiling.md](docs/day32-2-safe-iphone-tiling.md).

# SketchyAR — Ден 32.1 / v0.32.1: iPhone-only AnimeGAN benchmark

**Изолирана тестова страница `app/public/ai-lab/`** зарежда истински AnimeGAN TensorFlow.js модел **само на iPhone**, пази теглата в IndexedDB и изпълнява реален WebGL inference. Не заменя бутона „Манга“ до потвърдени Safari измервания. След първоначално сваляне на библиотека и модел не изпраща снимки; офлайн устойчивостта се проверява отделно. Виж `Day32_1_INSTALL.txt` и `docs/day32-1-iphone-ai-benchmark.md`.

# SketchyAR v0.32.0 — Ден 32: генеративен Manga AI експеримент

**Изследователски пакет, не промяна на продукционния Manga бутон.** Добавени са три отделни inference adapters (Qwen-Image-2.1-Turbo, Qwen-Image-Edit-2511, AnimeGANv3 ONNX), анонимизирано подготвяне на снимки, равнопоставено D3/Normal AR превю, blind review с ≥2 оценяващи и проверка на SHA-256 provenance. **Няма включени AI checkpoints, лични снимки или непотвърдени оценки.** Сегашната PWA продължава да използва работещия Manga V1 от Ден 31, без промяна на Home/камера/записване.

Процедура: [`Day32_INSTALL.txt`](Day32_INSTALL.txt) · Изследователски код: [`experiments/day32/README.md`](experiments/day32/README.md) · Документация: [`docs/day32-ai-model-experiment.md`](docs/day32-ai-model-experiment.md).

---

# SketchyAR v0.31.0 — Ден 31: реален многостъпков Manga V1

**Текуща версия:** `v0.31.0` върху v0.30.1. Бутонът **„Манга“** вече
генерира отделен прозрачен PNG с V4 структурни контури, допълнителни
фини линии, тоново опростяване, ограничени черни области и редки щрихи.
Вариантите са **2 стила × D1–D5 × 3 дебелини**; оригиналът остава непокътнат.
Само **„Рисувай“** прилага резултат към Home/камерата. „Комикс“ още не работи.

**Локални проверки:** Node **190/190**, CPython **286/286**, TypeScript 5.8.3
с временен `vite/client` stub — PASS. Production build с Vite 8.3.8 и реално
поведение на iPhone/Pyodide — **PENDING**. Не е използван външен AI checkpoint.

Инсталация: [`Day31_INSTALL.txt`](Day31_INSTALL.txt) ·
Архитектура, лицензи, източници и тестове: [`docs/day31-manga-v1.md`](docs/day31-manga-v1.md).

---

# SketchyAR v0.30.1 — Ден 30.1: линия с отмаркиране и нов вход през Редакция

**Предходна версия:** `v0.30.1`, малка корекция върху проверения от потребителя Ден 30.

- Нова рисунка → системен избор на снимка → **Редакция** → **Рисувай** → камера.
  Камерата не се стартира при избора на снимка. Cancel не създава проект.
- Трите линии се отварят **без избран бутон**, повторно натискане отмаркира.
  При празна селекция действителната дебелина е **Normal** и се запазва отделно
  от визуалната маркировка (`ProjectRecord.editorLine: null`).
- **Дебели**: по-пестеливо `3×3` квадратно разширение вместо диска с радиус 2.
  Python pipeline `day30-v4-stroke-v2` променя само бинарния постпроцесор,
  без нова ETF/FDoG стъпка. Предишните приложени PNG остават непокътнати.
- Непроменени: полароидът от Ден 28.1, V4/D1–D5, Figma/графитните SVG,
  локалното съхранение DB v1, ZIP backup и управлението на камерата.

**Проверки:** Node 183/183, Python 257/257, локален TypeScript typecheck PASS.
Production Vite 8 build в тестовата среда не е изпълнен (липсва Vite CLI);
реален iPhone Safari/Home Screen тест остава за потребителя.

Инсталация: [`Day30_1_INSTALL.txt`](Day30_1_INSTALL.txt) ·
Протокол: [`docs/day30-1-ui-routing-hotfix.md`](docs/day30-1-ui-routing-hotfix.md).

---

# SketchyAR v0.30.0 — Ден 30: реална дебелина на контурите

**Текущо състояние:** `v0.30.0` над проверения код на `v0.29.0`.
При „Скица“ петте детайлни нива D1–D5 работят заедно с **Тънки / Нормални / Дебели**:
общо 15 действителни PNG варианта. Дебелината се прилага към крайния бинарен контур
(дискретен диск с радиус 0, 1 или 2 пиксела), без повторно извличане на V4 значимост
от същото grayscale изображение. Новите PNG имат версия `day30-v4-stroke-v1`
и `params.detail` + `params.line`.

**Важно:** предварителните варианти не се прилагат в Home/Camera, докато не се натисне
**„Рисувай“**; запазените рисунки от Дни 22–29 не се мигрират или презаписват.
Оригинални снимки, полароидният contain-fit от Ден 28.1, всички графитни SVG,
камерата, IndexedDB schema v1 и ZIP backup/restore остават непроменени.
Manga/Comic все още не са реални контурни алгоритми.

Документация: [`docs/day30-stroke-width.md`](docs/day30-stroke-width.md) ·
Възстановен контекст за нов чат: [`docs/CONTINUATION_CONTEXT_DAYS14-30.md`](docs/CONTINUATION_CONTEXT_DAYS14-30.md) ·
Инсталация: [`Day30_INSTALL.txt`](Day30_INSTALL.txt).

---

> **Day 6 Project Resume (v0.6.0):** autosave и възстановяване на рисунка — `docs/day6.md`. Ден 5 галерия/IndexedDB: `docs/day5.md`.
> Този ZIP не съдържа `.git` или `node_modules`; ползвай като source overlay върху съществуващото хранилище.
> **Не изтривай Home Screen приложението или неговите локални данни**, преди да има проверен backup/restore от Ден 14.

# SketchyAR v0.4.18 — Camera navigation & image change button

Ново в 4.18: Стрелката горе вляво връща към началната страница, а новият бутон **Group 45** горе вдясно сменя снимката чрез същия системен избор от телефона. При отказ старата снимка остава. Останалите действия на камерата и интерфейса са непроменени.

Предишни промени (4.17): „Нова рисунка“ първо избира снимка от телефона (Cancel оставя Home); 3×3 мрежата е неподвижна върху цялата камера; пълна бяла графитна основа на плъзгача и черно запълване само до палеца. Предходните функции, Figma елементи и диагностиката са запазени. Виж `docs/day4_17_camera_refinement.md`.

# SketchyAR v0.4.13 — Ден 4: финални UI корекции

**Основа:** каченият от потребителя `ar-drawing_fixed.zip` (v0.4.12). Запазен е неговият вече работещ хартиен фон; **не** са връщани предишни експериментални CSS версии.

- Трите текста върху белите графитени бутони са повдигнати визуално с 5 Figma px, без да се местят рамките.
- „Офлайн Режим“ отваря информативен прозорец: реални данни от Cache Storage и Storage Estimate, честен статус Core/TEED (още невалидирани), проверки и ръчно онлайн презареждане. Пълното кеширане е в Ден 19.
- „Стари проекти“ запазва четири празни полароида и получава независим scroll при повече записи. Съхранението в IndexedDB предстои в Дни 13–14.
- `home.ts` остава единственият източник на safe area за главната Figma група. Не е добавено двойно `padding`.
- Камерата, Fixed Overlay, жестовете, Python benchmarks и диагностиката са запазени.

## Windows — проверка и публикуване

Разархивирай и копирай съдържанието на `ar-drawing/` в **съществуващото** си локално Git хранилище. **Не заменяй** `.git/`, не копирай `node_modules/`. От корена на репото:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q

git status
git add .
git commit -m "Day 4.13: offline details and home finishing"
git push origin main
```

Изчакай GitHub Actions и провери новия commit в диагностиката. Чеклист: [`docs/day4_final_0413.md`](docs/day4_final_0413.md).

> Забележка: текущият Caveat се зарежда от Google Fonts. Локалното офлайн вграждане е отделна задача преди Ден 19.

---

# SketchyAR v0.4.9 — Root Wallpaper Experiment (without status-bar changes)

**Scope:** Only one structural adjustment: paint the PNG texture as the root
`html.sketchy-home-active` background. Remove the redundant `<img>` from the
fixed Homepage container. Keep Figma content coordinates, its safe-area fitting,
and all Drawing/Python modules unchanged.

In v0.4.8 the solid band in the screenshot matched the root background color
`#FAF9F7`. This experiment tests whether painting the paper texture at the root
eliminates the band while leaving the already-correct content layout unchanged.

**No change to** `apple-mobile-web-app-status-bar-style` (`default` stays in place).
No PWA reinstallation and no deletion of user data is required for this test.

## Windows (from the repository root)

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
git add .
git commit -m "Day 4.9: paint paper background on HTML root"
git push origin main
```

Check the deployed version/commit through the temporary diagnostics button.
Test the existing Home Screen installation first. The textured background should
reach the bottom of the screenshot with no smooth cream band. All buttons should
remain in place and drawing gestures should work as in v0.4.8.

**If the bottom strip remains:** keep v0.4.8 as rollback; the next controlled
experiment is a separate test with the meta status bar style `black-translucent`.
It may need a fresh test Home Screen installation because WebKit can preserve
some standalone chrome geometry at installation time. It can also change the
contrast/placement of the time and icons over our pale paper background. Do not
combine it with arbitrary `100lvh` or safe-area offsets before measuring.

See `docs/day4_9_root_wallpaper.md` for technical reasoning.

---

# SketchyAR v0.4.8 — безопасен Figma Home без скрол

**Основна промяна:** няма скрол на Homepage; хартиеният PNG е на root background,
а реалната Figma група (351.43 × 745) се вписва в безопасната видима зона.
Съхранени са всички модули от Дни 1–4, Camera Controller, жестове, Pyodide, OpenCV и диагностика.

**Windows (от папката на репото):**

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
git add .
git commit -m "Day 4.8: fit Figma home inside iPhone safe viewport"
git push origin main
```

Сравни версията `0.4.8` и commit в диагностичния екран (долна дясна икона).
Първо отвори Home Screen PWA и провери, че целите четири полароидни рамки,
„Офлайн Режим“ и иконата са видими без скрол. След това тествай „Нова рисунка“.

Технически детайли и протокол: `docs/day4_8_layout.md`.

---

## Исторически инструкции от по-ранни версии (само за справка)

# SketchyAR v0.4.7 — iPhone 17 fullscreen layout fix

Запазени са всички функции от Ден 4.5. За новата корекция и тестовете виж [docs/day4_6_fullscreen_fix.md](docs/day4_6_fullscreen_fix.md).

# SketchyAR — Ден 4.4 (финални корекции по Figma и жестовете)

Новото: точна **Figma координатна система 385×835** с мащабиране към реалния viewport; запълнен с хартия целия фон; надписи Caveat Bold центрирани и по двете оси; един пръст мести само рисунката, два пръста я мащабират и въртят; pinch вече не трябва да мести страницата/камерата. Стойността 835 е размер на дизайна, не твърд лимит на реалния iPhone екран.

Поведение: „Нова рисунка“ отваря Drawing; „Центрирай“ връща картината в средата; „Размер 100%“ връща само мащаба; прозрачност 0–100%. Запазени са Pyodide, NumPy/OpenCV тестовете, диагностиката и всички останали функции.

## Публикуване

1. Разархивирай и копирай папката `ar-drawing` в съществуващото Git хранилище, **без да изтриваш `.git`**.
2. В PowerShell от основната папка изпълни:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
```

3. Ако всичко е успешно:

```powershell
git add .
git commit -m "Day 4.4: Figma 385x835 and independent pinch gestures"
git push origin main
```

## iPhone тест

- Home Screen: двата големи бутона и „Офлайн Режим“ имат центриран текст, четирите полароида и долните бутони са в пропорцията на Figma, без празна бяла ивица.
- „Нова рисунка“ → камерата остава fullscreen, един пръст мести само мрежата или импортираната снимка; два пръста мащабират и завъртат само графичния слой. Няма браузърно увеличение или преместване на камерата.
- „Центрирай“ възстановява мястото и ъгъла, „Размер 100%“ само мащаба; прозрачността работи 0–100%.
- „Назад“ спира камерата; повторно отваряне и background/foreground работят; старите Python тестове са достъпни през диагностиката.

**Забележка за шрифта:** Caveat се зарежда от Google Fonts в тази development версия. За бъдещия пълен офлайн режим трябва да се осигури локално разрешена доставка на шрифта или да се използват оригиналните Figma текстови изображения.

# Актуализация — Ден 4.1 (Homepage по Figma)

Този пакет е **надграждане на Ден 4** и запазва измерванията от Дни 2–3. Показва реалната начална страница по оригиналните графитни assets и отваря Drawing екрана чрез „Нова рисунка“.

## Как да го приложиш към съществуващия SketchyAR на Windows

1. Направи `git status` и запази всички свои промени.
2. Копирай съдържанието на тази папка `ar-drawing/` върху **съществуващото локално хранилище SketchyAR**. Не копирай папката `.git` от друго място и не изпълнявай повторно `git init`.
3. В PowerShell от корена на проекта:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
```

4. Само след успешни проверки:

```powershell
git add .
git commit -m "Day 4: Figma home and independent artwork scale"
git push origin main
```

5. Изчакай GitHub Actions да завърши, отвори инсталирания SketchyAR и провери `v0.4.7` и новия commit от диагностичния екран (долу вдясно на Home).

**Важно:** бутонът „Зареди проект“, четирите рамки и „Офлайн режим“ са визуално готови, но не запазват/зареждат данни; реалните функции предстоят в плана. Долният десен бутон засега отваря диагностиката. Пълните проверки са в `docs/day4_home_finalization.md`.

---

# SketchyAR — Ден 4 (v0.4.0)

Пакетът е **надграждане**, а не ново Git хранилище. Копирай съдържанието на `ar-drawing/` върху съществуващия си проект **без** да триеш `.git/`. Задължително запази свои непубликувани промени преди копиране.

## Windows проверки и публикуване

От root папката на проекта:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
git status
git add .
git commit -m "Day 4: Camera Controller and Drawing shell"
git push origin main
```

След успешен GitHub Actions deploy отвори **Home Screen SketchyAR**, провери `v0.4.0` и актуалния commit. За подробен телефонен чеклист виж [`docs/day4.md`](docs/day4.md). Service Worker умишлено още няма.

## Figma

**Изпрати първия достатъчно завършен Drawing screen сега / преди Ден 5.** В този пакет контролите са временни; не се опитваме да познаваме стила на бъдещите PNG бутони. Резултатите от Figma ще бъдат приложени след проверката на работещата камера и lifecycle.

## Обхват

- Ден 4: `CameraController` + fullscreen Drawing без жестове и импорт на снимка.
- Ден 5: Figma UI адаптация + отделен overlay за снимка + 0–100% opacity.
- Ден 6: drag/pinch/rotate/Lock и EXIF.

---

# SketchyAR — Ден 3: Fullscreen + Stress

**Вход:** съществуващият работещ SketchyAR v0.2.0 от Ден 2. **Резултат:** v0.3.0,
проверка на голям камера viewport + тестово изображение 2048px при 20 секунди Pyodide натоварване.

Съхранени са диагностика, Python модул, GitHub Actions и старите Day 2 бутони.
Това **не** е final Drawing UI; готовите дизайн елементи остават за следващите дни.
Няма Service Worker до Ден 19 и няма login/backend/платени услуги.

## Как да обновиш проекта на Windows

1. Разархивирай този ZIP. В него има папка `ar-drawing/`.
2. От нея копирай файловете **в съществуващото** си локално Git repository `SketchyAR`.
   Запази `.git/` и собствените си файлове. Не изпълнявай `git init` отново.
3. В PowerShell от корена на repo:

```powershell
cd app
node -v
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
git status
```

`node -v` трябва да покрива изискването от `app/package.json`: **>=20.19**.
Ако Python тестовете не тръгват, активирай вече създадената virtual environment и изпълни
`python -m pip install -r requirements-dev.txt` и `python -m pip install -e ./python_engine`.

4. Ако командите са успешни:

```powershell
git add .
git commit -m "Day 3: fullscreen camera and Python stress tests"
git push origin main
```

5. GitHub → Actions: изчакай зелен deploy и отвори Home Screen приложението.
   Провери, че показва **v0.3.0** и новия commit — GitHub Pages може да поднесе стар HTML за кратко.

## Работа на iPhone

Виж **`docs/day3.md`** за точната последователност в Home Screen и Safari.
Първо baseline без камера, после малък preview, след това fullscreen със 2048px PNG.
Накрая експортирай **два JSON файла**: един Home Screen и един Safari tab.

**Важно:** `navigator.storage.estimate()` не измерва RAM. Пълният екран може да
натовари GPU/compositor, без да увеличи резолюцията на камерата.

## Какво добавихме

- `app/src/day3.ts` — трите режима, тестов overlay, 12s baseline и 20s stress.
- `app/src/day3-monitor.ts` — rAF + `requestVideoFrameCallback` метрики.
- `app/src/day2.ts` — същата камера, споделена с Day 3; Python busy guard.
- `app/src/main.ts`, `styles.css` — временен Day 3 тестов екран и fullscreen HUD.
- `docs/day3.md` — методология/тестове/G1 и условия за приемане.

## Защо още не използваме вече готовия визуален дизайн

Ден 3 е контролна точка за памет и стабилност. Тестовият fullscreen е умишлено
минимален и не вкарва допълнителни UI библиотеки, преди да вземем окончателно G1 решение.


## v0.4.10 — тест за Safari срещу Home Screen PWA

Променена е **само** iOS Home Screen настройката на статус бара:
`apple-mobile-web-app-status-bar-style: black-translucent`. Safari продължава
със своята лента за адрес, а Figma layout/камерата/жестовете остават без промяна.
Преди тест провери новата версия и commit в диагностичния екран.

**Важно:** iOS може да запазва status-bar-style при инсталиране. Ако старата
иконка не промени поведението си, не изтривай веднага приложението. Първо
провери в Safari, а за независим тест на новата инсталационна настройка
добави нова иконка, ако iOS предлага тази опция. Изтриването на оригиналната
инсталация може да изтрие нейното отделно локално хранилище.

Детайлният протокол е в `docs/day4_10_standalone_test.md`.


## v0.4.11 — поправка на хартиения фон

- Началните бутони **не са местени**. Запазени са Figma подредбата и safe-area оформлението от v0.4.8.
- Поправено е оразмеряването на фоновото изображение, когато `<html>` има височина `0px` поради фиксираните екрани. Използва се изрична височина на картинката, а не `background-size: cover` върху нулевия root.
- Не е необходимо да изтриваш Home Screen иконката за тази CSS поправка.
- След публикуване потвърди новия commit в диагностиката и виж дали хартиената текстура продължава без прекъсване под втория ред полароиди и под долните бутони, както в Safari, така и от иконката на iPhone.
- Ако остане **само** тънка системна ивица в края, изпрати screenshot + диагностичния `home.layout` JSON. Не променяй размерите на групата по Figma.

Виж [docs/day4_11_background_fix.md](docs/day4_11_background_fix.md).

## Ден 7 — Project management (v0.7.0)

След успешно тествания Ден 6 на iPhone, върху всяка запазена полароидна рамка има малък бутон `···`: преименуване или изтриване с потвърждение. Докосването на самата снимка продължава да отваря проекта. За проверка отвори **Диагностика → Ден 7 → Провери връзките в базата**. Очакваният резултат е `acceptance: PASS` и празни списъци за осиротели записи. Виж [`docs/day7.md`](docs/day7.md) за пълния приемателен тест. Изтриването е необратимо: все още няма ZIP backup/restore.


## Day 8 — Python runtime + Caveat без runtime CDN

Преди `npm run dev`/`npm run build` изпълни от корена на проекта:

```powershell
python -m pip install "fonttools[woff]==4.63.0"
python scripts/vendor_day8.py
python scripts/vendor_day8.py --check
cd app
npm ci
npm run build
cd ..
python scripts/day8_benchmark.py --sizes 512 1024 --runs 5
```

Скриптът сваля Pyodide **314.0.8**, NumPy и зависимостите от фиксиран Pyodide release **само при подготовката**, като ги записва под `app/public/pyodide/v314.0.8/`. Caveat Bold се извлича от фиксиран upstream commit и се преобразува локално в WOFF2 с пълна кирилица. Генерираните бинарни файлове са игнорирани от Git; GitHub Actions ги изгражда отново при deploy. **Този етап не създава Service Worker и не гарантира cold offline launch.**

При нужда от стария незадължителен OpenCV benchmark: `python scripts/vendor_day8.py --with-opencv`.

В диагностиката натисни „Ден 8 — Проверка на локалните ресурси“ и експортирай JSON. Виж пълния протокол в [docs/day8.md](docs/day8.md).

## Day 9 — Python Sketch Engine (NumPy)

`python_engine/ar_drawing/sketch_engine.py` adds a shared pure-NumPy `float32` Gaussian, Sobel and four XDoG presets. No change to the Camera UI or IndexedDB.

```powershell
python -m pytest python_engine -q
python scripts/day9_preview.py
python scripts/day9_benchmark.py --sizes 512 1024 --runs 5
```

Preview PNGs (three original synthetic fixtures + four XDoG styles per fixture) and benchmarks are written under the **Git-ignored** `experiments/outputs/`. To try a personal photo locally, use `python scripts/day9_preview.py --input "C:\\path\\to\\photo.jpg"` and keep the outputs off GitHub.

After deployment v0.9.0, the **developer diagnostics** screen has a **Ден 9 — Провери Python Sketch Engine** button. It lazily loads the same Python module in the existing Pyodide Worker and benchmarks a 512×512 image with `float32` and three runs. Compare its `checksum` against the **same Day 9** benchmark on Windows. XDoG is not yet connected to live Drawing or converted to transparent PNG — that work is deliberately deferred to the processing bridge.

Full details and acceptance procedure: [`docs/day9.md`](docs/day9.md).

## Day 10 — Tones 3–5 and controlled Sobel/XDoG comparison

New independent NumPy module: `python_engine/ar_drawing/day10_tones.py`. The Day 9 Gaussian/Sobel/XDoG remains unchanged as a reference baseline; there is no extra browser runtime dependency and no change to Camera or IndexedDB.

```powershell
python -m pytest python_engine -q
python scripts/day10_preview.py
python scripts/day10_benchmark.py --sizes 512 1024 --runs 5
# Optional if cv2 is installed on Windows:
python scripts/day10_compare_cv2.py
```

The diagnostic screen in version `0.10.0` provides **Day 10: 512 px** and **Day 10: 1024 px**; export its JSON and compare against the Windows results with `scripts/day10_compare_device.py`. See [docs/day10.md](docs/day10.md) for the acceptance protocol and limitations. The previews and private input photos remain in ignored `experiments/outputs/`.

## Day 11 — NumPy Otsu, binary morphology и изолиран Service Worker

В `python_engine/ar_drawing/day11_morphology.py` има собствен Otsu (256 bins), бинарни `erode/dilate/open/close` и сравнимо `benchmark_day11`. Използвай:

```powershell
python -m pytest python_engine -q
python scripts/day11_preview.py
python scripts/day11_benchmark.py --sizes 512 1024 --runs 5
python scripts/day11_compare_cv2.py    # optional reference only
```

iPhone диагностиката предлага тестове за 512/1024 px и отделен тестов SW shell линк. **Service Worker не е регистриран в основното PWA**; shell spike се намира на `/SketchyAR/sw-spike/` и работи само след ръчна регистрация. Виж подробно [docs/day11.md](docs/day11.md).

### Ден 12 — Python NMS, hysteresis и финална карта F

Добавен е собствен NumPy `python_engine/ar_drawing/day12_edges.py`. Диагностиката има отделни тестове за 512 и 1024 px; **не** обработва потребителските снимки в Drawing и не добавя нови runtime dependencies. Скриптове:

```powershell
python -m pytest python_engine -q
python scripts/day12_benchmark.py --sizes 512 1024 --runs 5
python scripts/day12_preview.py --input "C:\photos\your-photo.jpg"
python scripts/day12_compare_cv2.py  # optional
```

Подробно: [`docs/day12.md`](docs/day12.md). Скриптът за сравнение на резултатите от iPhone е `scripts/day12_compare_device.py`. Личните изображения и preview файлове се пазят само локално в игнорираната `experiments/outputs/`.


## Day 13 — Реална снимка → Python Worker → прозрачен PNG (v0.13.0)

След публикуване на версията отвори **Диагностика → Ден 13**, избери тестов проект и натисни **Генерирай и запази PNG**. Python Worker обработва максимум 1024 px по дългата страна, записва отделен `processed` asset с `sourceAssetId`/`params`/`pipelineVersion`/`modelId` и показва прозрачна PNG скица. **Оригиналната снимка остава активна.** След това тествай **Провери manifest v1** — това **не** е реален ZIP backup.

Windows: `python -m pytest python_engine -q`; `python scripts/day13_benchmark.py --sizes 512 1024 --runs 5`; `cd app; npm ci; npm run typecheck; npm run build`.

Подробният протокол, рисковете и iPhone тестовете са в `docs/day13.md`. Не изтривай инсталираното приложение, докато ZIP backup/restore не премине G2 на Ден 14.


## Day 14 · Backup & Recovery (v0.14.0)

The diagnostics panel now supports ZIP32 STORE export, independent SHA-256 verification of a saved ZIP, and safe restore into an isolated test database. Optional production restore is add-only and fails the entire IndexedDB transaction on any ID/key conflict. Existing projects, Drawing and the Python Image Bridge remain unchanged. See [docs/day14.md](docs/day14.md) for device test protocol and supported archive limits. **G2 is PENDING until real iPhone acceptance.**
