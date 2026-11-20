# SketchyAR — Ден 12 (v0.12.0)

**Точна основа:** Day 11 v0.11.0, потвърден на iPhone. Ден 12 е НОВ NumPy модул и отделен диагностичен тест; **не пипа Camera UI, Home, IndexedDB, saved presets или изолирания SW експеримент**. Кодът се изпълнява на Windows и със същия `?raw` Python източник в Pyodide.

## 1. Алгоритми и точен договор

`python_engine/ar_drawing/day12_edges.py` — NumPy-only, `float32` вход, `bool` финална маска, `True = черен контур`.

```
снимка (uint8 или float32, H×W / RGB)  # alpha не се композира автоматично
  → Gaussian separable (reflect)
  → Sobel /8: Gx, Gy, magnitude, angle (rad, Y надолу)
  → non_maximum_suppression(magnitude, angle)
  → hysteresis_threshold(suppressed, low=0.04, high=0.10)
  → F: bool H×W (единствената финална карта на контурите)
```

| Етап | Реализация | Важни граници |
|---|---|---|
| NMS | 4 квантизирани посоки 0/45/90/135°, сравнение по нормала на градиента; асиметрично разрешаване на равни стойности | Извън изображението не се проследяват ръбове; 1px border е 0; не е bilinear/subpixel |
| Hysteresis | 8-свързано обхождане с масивна FIFO опашка; стартира само от `m >= high`; присъединява `m >= low` и `m > 0` | Без фиксиран лимит на итерациите; няма wrap-around между редовете |
| Pipeline | Gaussian → Sobel → NMS → hysteresis | `0 <= low <= high`, `high>0`; праговете са абсолютни върху Sobel, **не** OpenCV uint8 thresholds |
| Рендер | `ink_preview(F)` → uint8 0/255 | Отделен Python PNG preview на Windows, **без** камера интеграция |

**Няма претенция за пикселно идентичен `cv2.Canny`.** Разликите в NMS, падинг, Gaussian и праговете са очаквани. `scripts/day12_compare_cv2.py` е незадължителен само-референтен сравнителен тест на Windows и изчислява tolerant F1 с допуск ±1 px върху детерминистичен fixture. Това **не е** показател за артистично качество.

**Guided V2 не се създава в този ден.** Запазва се единствена F; бъдещите маски трябва да са вложени `M1 ⊆ ... ⊆ M5 = F`, а класирането ще е по сегменти, не по отделни пиксели. Не комбинирай маски от различни XDoG мащаби директно.

## 2. Windows — изпълни от `ar-drawing/`

```powershell
python -m pytest python_engine -q
python scripts/day12_benchmark.py --sizes 512 1024 --runs 5
python scripts/day12_preview.py
python scripts/day12_compare_cv2.py  # optional, изисква cv2 на Windows
cd app
npm ci
npm run typecheck
npm run build
cd ..
```

Изходите са само в `experiments/outputs/`, игнорирани от Git. `day12-cpython-benchmark.json` и `.csv` съдържат times, checksums и брой пиксели.

### Критичен тест с истински фотографии

Ползвай **собствени снимки, с право за обработка**, без да ги публикуваш в GitHub:

```powershell
python scripts/day12_preview.py --input "C:\photos\portrait.jpg" "C:\photos\cat.jpg"
```

Файловете се декодират с Pillow (само на Windows), спазва се EXIF ориентацията. Прилага се центриран downscale до 512 px по дългата страна, но се пази пропорцията, а не се разтяга до квадрат. Сравнението включва original, XDoG, Sobel, NMS (нефинален) и **две изследователски версии на F**:

- Default: `sigma=1.0, low=0.04, high=0.10`;
- Alternative: `sigma=0.85, low=0.025, high=0.065`.

Втората може да даде повече линии при котки/портрети, **но и повече шум**. Тя НЕ е фиксиран production `photo` preset. Отбележи дали са запазени: силует, лице/очи, вътрешни линии, ненужна текстура и дублирани линии. Ако F е непълна, Step Planner не може да възстанови липсващото.

`--demo-skimage` е незадължителна локална оценка със sample снимки на `skimage.data`, ако scikit-image вече е инсталиран. Няма такива снимки в репото или deployed PWA.

## 3. iPhone 17 — Pyodide диагностика (без камерата)

След publish на версия `0.12.0` и нов SHA, отвори диагностиката и изпълни:

1. **Day 12 · 512 px** — три задачи: NMS, hysteresis, цял pipeline;
2. **Day 12 · 1024 px** — същите детерминистични входове, seed 173, 3 повторения;
3. Експортирай JSON; сравни с Windows:

```powershell
python scripts/day12_compare_device.py `
  experiments/outputs/day12-cpython-benchmark.json `
  "C:\path\to\sketchyar-diagnostics.json"
```

Очакваме **точно** еднакъв `finalPixels`, `nonzero` и числено близки контролни суми при еднакъв seed/pipelineVersion. Времената се измерват, но не се изисква да съвпадат. Рундване на `median_s` до 6 знака и различни NumPy версии означава, че timing comparison не е прецизна бенчмарк методология за минимални разлики.

Преди приемане провери Home, поне 5 полароида и scroll, gallery thumbnail, camera start/stop, opacity 0–100, заключване, жестове, autosave/restore, изтриване на тестов проект. Service Worker `/sw-spike/` остава без промени. Нито една от новите Python команди не се изпълнява автоматично при стартиране на приложението.

## 4. Критерии и рискове

- **PASS Python:** всички стари и нови pytest, прецизен NMS за 4 посоки, 8-свързан hysteresis с дълъг път, липса на wrap-around, непроменени входове, невалидни параметри, нулева/константна снимка.
- **PASS iPhone:** 512 и 1024 px тройни benchmark-и, без Worker exception/reload, Windows checksums близки, камерата/проектите работят като преди.
- **Неприключени работи (умишлено):** pixel transfer на реална снимка в Worker, async stale-result guard и bridge са Ден 13; verified ZIP backup/restore също Ден 13–14; художествени photo presets/Guided Planner са отделни изследователски задачи.
- **OOM риск:** при 1024 H×W са временни NumPy float32 масиви, но не се държат всички предишни резултати едновременно в UI; няма cv2/SciPy Pyodide dependencies. Паметта на iPhone се наблюдава чрез crash marker и repeated-run тестове.
- **Опасност за UX:** силно прагово изтъняване може да заличи силуета на котка/човек. Не приемай алгоритмична идентичност с OpenCV като доказателство за добра рисунка.

## 5. Контролно продължение

След успешен Ден 12: **Ден 13 = worker image bridge + provenance + ZIP подготовка**; Ден 14 = export/verify/restore + G2. При G2 FAIL задължителните операции се поправят преди нови Guided функции. Не променяй CSS/safe areas без регресионен тест.
