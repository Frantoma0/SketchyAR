# SketchyAR — Ден 2

Лично iPhone PWA приложение за AR Drawing. **Текущият етап е технически spike**, а не готов режим за рисуване: камера + NumPy/Pyodide + опционален OpenCV.

Оригиналният Ден 1 scaffold и диагностика са запазени. Версията на приложението е `0.2.0`. Иконите и визуалният интерфейс остават временни; готовите UI елементи ще се интегрират на следващите етапи.

## Windows — актуализиране на съществуващото GitHub хранилище

**Не изпълнявай отново `git init` и не създавай второ репо!** Копирай файловете от този пакет в локалното си хранилище `SketchyAR`, като запазиш `.git/` и локалните си допълнения. Подмени съвпадащите файлове; добавени са `app/src/day2.ts`, `app/src/python-{worker,client}.ts`, `docs/day2.md`.

Отвори PowerShell в корена на проекта (папката, която съдържа `app/`):

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
git status
```

Ако `npm run build` върне грешка, **не push-вай**. Ако е зелен:

```powershell
git add .
git commit -m "Day 2: camera and Pyodide benchmarks"
git push origin main
```

От GitHub → Actions провери, че `deploy-pages` е зелен. Не използвай стар кеширан build; провери новия commit на екрана. Отвори същия инсталиран Home Screen SketchyAR.

## Ден 2 на iPhone — действия

1. Натисни **„Пусни камера“**, потвърди разрешението. Видеото трябва да се появи.
2. **„1. Стартирай Pyodide“** — първоначално има изтегляне от CDN; трябва интернет. Наблюдавай log за `loader`, `python-runtime`, `numpy`.
3. **„2. NumPy 5×“** — същият `spike_proxy.py` като в CPython тестовете. Резултатът има `median_s`, `dtype`, `output_checksum`.
4. **„3. cv2.Canny 5×“** — опционален backend, може да се провали без да спре NumPy.
5. **„4. cv2.Canny 10×“** — проверка за повторяемост при активна камера.
6. **„Запази / сподели JSON“**. Изпрати резултата за преглед на G1.
7. **„Освободи Python Worker“**, затвори PWA от app switcher и повтори стартирането. Използвай `docs/day2.md` за пълните проверки.

Прагът **NumPy ≤ 3.0 s медиана** е предварително фиксиран в `docs/gates.md`. Ако някой от тестовете не мине, документираме причината, вместо да заместваме измерванията с предположения.

**Важно:** Service Worker няма до Ден 19, поради което Pyodide и страницата още не могат да работят гарантирано офлайн. При първите тестове телефонът трябва да има интернет.

## Python на Windows (самостоятелна проверка)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m pip install -e ./python_engine
pytest python_engine
python -m ar_drawing.spike_proxy --size 1024 --runs 5
```

Първите три команди не са необходими, ако вече имаш настроен `.venv`. Windows времената не са резултати за iPhone.

## Файлове
- `app/src/main.ts` — екран Ден 1 + секция Ден 2.
- `app/src/day2.ts` — минимална камера, бутони, rAF/video мониторинг, диагностика.
- `app/src/python-worker.ts` — Pyodide 314.0.8, NumPy, Canny, Python benchmarks.
- `app/src/python-client.ts` — requestId, timeout, worker lifecycle.
- `python_engine/ar_drawing/spike_proxy.py` — един Python файл за Windows и iPhone.
- `docs/gates.md` — предварително определени G1 прагове.
- `docs/day2.md` — инструкции и интерпретация.
