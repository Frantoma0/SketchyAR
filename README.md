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
