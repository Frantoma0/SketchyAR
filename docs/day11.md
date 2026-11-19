# SketchyAR — Ден 11 (v0.11.0)

**База:** реално потвърден Day 10 (`v0.10.0`), без предположение, че Ден 11 е бил изпълнен по-рано.
**Цел:** NumPy Otsu + морфология + изолиран Service Worker shell spike на iPhone.
**Не правим:** NMS/hysteresis (Ден 12), обработка на реално избрана снимка в UI (следващ bridge), глобален SW за цялото PWA (Дни 18–19), TEED/ONNX.

## 1. Собствен Python код

Файл: `python_engine/ar_drawing/day11_morphology.py`. Нужен е само NumPy (`to_grayscale` от Day 9). Няма `cv2`, SciPy или Pillow в Pyodide runtime.

| Функция | Действие | Договор |
|---|---|---|
| `otsu_threshold(img, foreground='dark')` | Автоматично избира праг чрез 256-кошова междукласова дисперсия | `(threshold_uint8, bool_mask)`; `True` е мастило при dark; едноцветен вход дава празна маска |
| `binary_morphology(mask,'erode')` | Премахва издадените части на бинарни форми | `bool` H×W, 3×3 квадрат по подразбиране |
| `binary_morphology(mask,'dilate')` | Разширява маската | `bool` H×W |
| `binary_morphology(mask,'open')` | Erosion → dilation; премахва дребен шум | `bool` H×W |
| `binary_morphology(mask,'close')` | Dilation → erosion; затваря дребни отвори | `bool` H×W |
| `ink_preview(mask)` | Експортен grayscale масив (черно мастило, бял лист) | `uint8` 0/255 |
| `benchmark_day11(size,runs,seed)` | Четири еднакви задачи на Windows и iPhone | JSON със същата схема и детерминистичен seed |

**Явни допускания:** 1, 3 или 5 пиксела квадратен structuring element, 1–4 итерации, False извън границите, което кара erosion да свива краищата. Затова сравненията с OpenCV използват **изрично** `BORDER_CONSTANT, borderValue=0`. Otsu използва `.rint(x*255)`, първия максимален праг при равни стойности, а при едноцветно изображение връща маска без контури. Това поведение е документирано, не „универсално художествено“.

### За университета

В `python_engine/tests/test_day11_morphology.py` има тестове за точни маски, граници, неизменен входен масив, детерминираност и неправилни аргументи. `scripts/day11_compare_cv2.py` служи за **само референтна** проверка срещу OpenCV на Windows, не е задължителна зависимост на iPhone. Общият Python тестов пакет включва вече миналите тестове на Дни 8–10.

## 2. Windows — инструкции

```powershell
# От основната папка ar-drawing
python -m pytest python_engine -q
python scripts/day11_compare_cv2.py              # optional: OpenCV на Windows
python scripts/day11_preview.py
python scripts/day11_benchmark.py --sizes 512 1024 --runs 5

cd app
npm ci
npm run typecheck
npm run build
cd ..
```

Резултатите се записват в игнорираната папка `experiments/outputs/day11*`:

- `day11/comparison.png` — примерен синтетичен лист преди/след Otsu, opening, closing.
- `day11-cpython-benchmark.json`, `.csv` — времена и checksums. **Тук няма** време за WASM startup, декодиране, UI или прехвърляне на снимка.

## 3. iPhone — два Python теста

Публикувай новия commit и провери във вградената диагностика версия `0.11.0` и правилния SHA. Стартирай последователно:

1. **„Тествай Day 11 · 512 px“** — трябва да върне `task='day11_otsu_morphology'`, 4 задачи и `resultDtype='bool'`.
2. **„Тествай Day 11 · 1024 px“** — същите полета, по-голямо изображение. Няма неочакван reload.
3. Изнеси диагностиката като JSON. Съпостави с PC:

```powershell
python scripts/day11_compare_device.py `
  experiments/outputs/day11-cpython-benchmark.json `
  "C:\path\to\sketchyar-diagnostics.json"
```

Контролните суми са **брой True пиксели**, затова трябва да бъдат точно еднакви при еднаква резолюция и seed. Времената **не** се изисква да съвпадат.

Провери и регресиите на дневния продукт: Home, поне 5 полароида/скрол, Camera, Opacity, Lock, grid, изтриване и възстановяване на настройките. Ако камерата откаже с `NotAllowedError`, не приписвай това на NumPy без възпроизводим тест. Не изтривай PWA или данните.

## 4. Service Worker shell spike — **изолирано**

Статични файлове: `app/public/sw-spike/index.html`, `sw.js`, `spike.css`, `fixture.txt`. Регистрираният SW обслужва **само** URL-и в `/SketchyAR/sw-spike/`, **не** приложението `/SketchyAR/`. Регистрацията става само при ръчно натиснат бутон в тази страница; `localhost` умишлено отказва регистрация. Основното приложение продължава без SW.

**Преди теста:** отвори `https://frantoma0.github.io/SketchyAR/sw-spike/` в Safari (по възможност извън инсталираното Home Screen PWA).

1. Онлайн: натисни **„Регистрирай тестов SW“**. Презареди страницата веднъж **онлайн**. Провери „3/3 shell ресурса“.
2. Пусни **Airplane Mode**, изключи Wi-Fi ръчно, ако остане активен, и презареди същия URL. Тестовият HTML/CSS трябва да се покажат и „Провери кеша“ да работи.
3. Върни интернет и натисни **„Изтрий тестовия кеш и регистрация“**. Презареди и провери, че основното PWA продължава да работи.

**PASS за spike:** съответният изолиран shell работи след reload при прекъснат интернет и SW scope е ограничен до `/SketchyAR/sw-spike/`. Ако тестовият shell не се зареди, регистрирай blocker с URL, iOS, точния текст на грешката, scope, налични cache keys. **Не добавяй root SW като обходно решение**. Ден 18 има резерв за повторен експеримент; Ден 19 предстои пълен precache на self-hosted Pyodide/NumPy/Caveat/ORT и hash validation.

**Rollback:** регистрацията на `/sw-spike/` може да бъде премахната от същата страница; тя няма право да поеме основното приложение. Изтриването на cache keys с префикс `sketchyar-sw-spike-` не засяга IndexedDB и проекта.

## 5. Критерии за приключване

- [ ] Windows: `npm ci`, `typecheck`, Vite build, Python тестове и preview.
- [ ] Python `day11-512`/`day11-1024` на iPhone — 4 задачи без грешки и reload.
- [ ] Проверени thresholds + counts Windows ↔ iPhone.
- [ ] Отделният SW scope и offline reload PASS **или** ясно документиран FAIL и резерв за по-късно.
- [ ] Figma Camera UI / IndexedDB / autosave работят без регресия.

**Ден 12** ще добавя собствен NMS, hysteresis и формализиран pipeline; **не** приемаме Day11 като доказателство за готов Canny или пълен офлайн режим.
