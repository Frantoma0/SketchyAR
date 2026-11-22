# SketchyAR — Ден 31 / Manga V1 (v0.31.0)

**Статус:** реализирано локално в кода и проверено с CPython/Node/TypeScript. **iPhone Home Screen/Pyodide/production Vite build: за потвърждение от потребителя.**

## Цел

Бутонът **„Манга“** вече стартира реален, независим **photo-to-manga line-art** pipeline. Резултатът е **черен / прозрачен PNG** за проследяване през камера, а **не** фотореалистичен AI→anime face editor. Изображението се променя чрез автоматично опростяване на тонове, графични черни области и допълнителни щрихи. Няма чужд model checkpoint, външни web заявки, OpenCV или SciPy в продукционния pipeline.

## Етапи и алгоритми

1. **Локално декодиране (Canvas)**: max страна 1024 px, бял фон за alpha, ориентация по браузърната декодираща подсистема. Само за Manga се добавя слаб, ограничен **chroma/saturation lift**, за да не се сливат ярко оцветени области с тъмни обекти със сходна grayscale яркост. Sketch-ът използва старите непроменени входни байтове.
2. **Преизползвана V4 структурна карта**: `get_cached_flow_score()` от Ден 28 (ETF-lite, FDoG-lite, importance-aware edges). `select_detail_contours()` от Ден 29 осигурява вложени контури D1⊆...⊆D5.
3. **Тонови блокове**: 2.3σ Gaussian, 2/98 percentiles, консервативен auto-levels blending без агресивно разтягане при равномерни изображения; потискане на плътна маса при почти постоянна яркост. Допълнителен 1.8σ low-pass за големи сенчести форми.
4. **Fine pen lines**: двускален |Gaussian₀.₇₅ − Gaussian₁.₉| (DoG) като усилваща оценка, Sobel/quantized NMS за тънки вътрешни линии. Прагът е ограничен от стабилна source-локална оценка; не се добавя целият фото шум.
5. **Solid ink regions**: тъмни маси с праг, зависещ от D2–D5 и стабилна 38% tonal-area граница, без отделно пренареждане между нивата; D1 остава основно контурен.
6. **Sparse hatching**: редки диагонали през 16 px само в сенки при D4–D5 и втора посока през 19 px в най-тъмните D5 области. Няма глобално dither-ване на кожа и хартия. Не добавяме рамки и балончета.
7. **Manga composite**: Boolean OR на фиксираните слоеве; width `thin/normal/thick` се прилага **накрая** чрез непроменената `widen_contours()` от Ден 30.1. Финален бинарен mask се кодира в непроменения прозрачен PNG encoder.

### Гаранции за инварианти

- За една и съща снимка и дебелина **D1 ⊆ D2 ⊆ D3 ⊆ D4 ⊆ D5**.
- За един и същи D: **Thin ⊆ Normal ⊆ Thick**.
- При избор на друг стил или конфигурация старите Worker резултати са невалидни по `SketchDraftGate`, с проверка на оригиналния `sourceId`, `style`, `detail` и nullable UI `line`.
- Вариантите се кешират по `style:detail:effectiveLine` (до 30 комбинации за 2×5×3). Manga има `pipelineVersion=day31-manga-layers-v1`, а Sketch запазва `day30-v4-stroke-v2`. Отсъстваща отметка за дебелина означава ефективно Normal, но визуално не маркира бутон.
- Записът на preview е **неприложен** (`saveProcessedPng(..., false)`). Само **„Рисувай“** избира обработената снимка за Home/камера; **„Назад“** не прилага нищо.
- Изборът на стил при повторно отваряне се извлича от действително **приложения PNG**, а не от потенциално исторически preview-only `editorStyle`.
- DB schema = **1**, backup format/schema остава непроменен, оригиналната снимка се пази.
- **Comic** остава неактивен placeholder и не генерира фалшив PNG.

## Къде са промените

| Файл | Роля |
|---|---|
| `python_engine/ar_drawing/day31_manga.py` | 7-етапен NumPy Manga pipeline, source-scoped maps cache |
| `python_engine/tests/test_day31_manga.py` | 29 нови CPython проверки |
| `app/src/day13-image-bridge.ts` | Manga chroma-lift Canvas декодиране; Sketch запазен |
| `app/src/day31-manga-mode.ts` | Manga draft → transparent PNG, без DB/camera writes |
| `app/src/day31-styled-variants.ts` | style+detail+line cache and source provenance helpers |
| `app/src/python-client.ts`, `app/src/python-worker.ts` | typed `'sketch' | 'manga'` routing, lazy Manga module import |
| `app/src/day17-sketch-placeholder.ts` | Manga UI preview, stale-result guard, Draw, hold-to-compare, restore |
| `app/src/storage/day13-processed.ts`, `app/src/storage/project-store.ts` | applied style се определя от PNG provenance |
| `app/tests/day31-manga.test.mjs` | 7 нови Node теста; историческите очаквания са обновени за активната Manga |

## Проверки на 22.11.2026

- **Node:** 190/190 PASS (183 от предходните дни + 7 нови; стари тестови твърдения „Манга още не работи“ и за фиксирана версия 0.30.1 са актуализирани).
- **CPython pytest:** 286/286 PASS (257 стари + 29 нови).
- **TypeScript:** глобален `tsc 5.8.3` + временен локален stub за липсващите `vite/client` типове: PASS. Stub-ът **не се включва** в ZIP.
- **`npm ci --offline` не може да завърши**, защото Vite 8.3.8 не е в локалния npm cache. `npm run build` и реалната съвместимост с TypeScript 7.0.2/Vite 8.3.8 **не са потвърдени тук**.
- **iPhone Safari/Home Screen и Pyodide:** PENDING — няма твърдение за измерено производително поведение на устройството.
- В `docs/day31-cpython-synthetic-benchmark.json` са времената за **синтетично изображение, CPython, CPU — не iPhone**:
  - 256² първа Manga ~50 ms; D4 Thin ~2 ms, D4 Thick ~2 ms;
  - 512² първа Manga ~159 ms; D4 Thin ~4 ms, D4 Thick ~5 ms;
  - 1024² първа Manga ~461 ms; D4 Thin ~13 ms, D4 Thick ~14 ms.
  Резултатите са ориентир за *кеширания алгоритъм*, не мерят Canvas decode, PNG export, Web Worker transfer или Pyodide startup.

## iPhone приемане — G31

1. Запази резервно ZIP копие на реалните проекти **преди deployment**. Не изтривай PWA/IndexedDB.
2. Инсталирай patch върху `v0.30.1`; изпълни `npm ci --include=dev`, `npm run typecheck`, `npm run build`, `npm run test:day31`, `python -m pytest python_engine -q`; качи в GitHub Pages.
3. **Нова рисунка → снимка → Редакция**. Натисни „Манга“: до завършване „Рисувай“ е неактивен, след обработка вижда се черно-прозрачен Manga PNG. Задържане превключва към оригинала. Отмаркиране на „Манга“ показва оригинала.
4. Същата снимка → „Скица“: трябва да има **действително различен** PNG; старият Sketch V4 не е променен.
5. „Манга“ D1→D5 и Thin/Normal/Thick: виж повече контури/тонове; дебелините се различават, без провал при бързо натискане. При отмаркирана дебелина няма активен бутон, ефективно Normal.
6. „Назад“ след промяна НЕ подменя вече приложеното към Home/камера. Отвори редактора наново; „Рисувай“ с Манга прилага **точно тази** PNG; force-close/reopen запазва Manga и правилния избор.
7. Провери портрет, котка, тъмно изображение, ярко цветни дрехи, пейзаж, широк формат, EXIF/HEIC, PNG с alpha, blank/low-contrast снимка и шумен фон. При blank input е допустимо съобщение „няма линии“; не генерираме фиктивно изображение.
8. Тествай от камера → „Промени скицата“ → Манга → „Рисувай“: потокът на камерата не трябва да се рестартира излишно и наслагването трябва да се подмени коректно.
9. Backup Verify/Restore с приложена Манга; прегледай alpha, source ownership и `params.style` в архивните метаданни.

## Източници за алгоритмични идеи и лицензи

Имплементацията е **наша** (нов NumPy код). Не сме копирали код, тегла или assets от тези проекти:

- https://github.com/ashukae/ComfyUI-MangaScreen — MIT, layered pen/tones/screen/shadows; ползвана е архитектурната идея.
- https://github.com/Jannchie/manga-filter — browser-worker, двускални фини линии, цветова чувствителност; идеи, не копиран код (лиценз за конкретни файлове да се прегледа преди евентуално реизползване).
- https://github.com/KimSungWoon/WhiteBox-Cartoonization — CC BY-NC-SA 4.0, само концептуална референция structure/texture, **никакъв чужд код**.
- https://github.com/TachibanaYoshino/AnimeGANv2 — некомерсиално ограничение, **няма включен модел**; би бил отделен по-тежък експеримент.
- https://github.com/hepesu/LineDistiller — MIT, line-extraction референция; **няма включен checkpoint**.

## Граници на V1 и бъдещи стъпки

Manga V1 е **manga rendering**, не генеративна фото→аниме трансформация. Не променя семантично геометрията на очи, нос/уста; не знае кое е лице, коса или фон. Бледи лица, подобни по яркост цветове, сенчести пейзажи и плитки цветови преходи може да изискват допълнителна настройка. Преди по-тежък AI първо измерваме на iPhone, сравняваме 30-те тестови изображения и оценяваме рисуването върху хартия. Ако целта стане *реално прерисувано anime лице*, това е отделен режим/ML проект с много по-голям модел и лицензна оценка.
