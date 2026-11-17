# AR Drawing

Offline-first асистент за рисуване на iPhone 17 (PWA): камера + Fixed Overlay, собствен NumPy-first
Python engine (Pyodide), опционален Edge AI (TEED / ONNX Runtime Web). Спецификация: v1.3.

## Ден 1: какво има
- `app/`: Vite + TypeScript PWA; страница с версия, среда, възможности на Safari и диагностични логове.
- `python_engine/`: пакет `ar_drawing` + pytest (CPython; Pyodide се добавя на Ден 2).
- `.github/workflows/`: `pages.yml` (deploy към GitHub Pages), `test.yml` (typecheck + pytest).
- `docs/gates.md`: прагове за G1, записани преди измерванията.
- Service Worker умишлено още няма (Ден 19): така iPhone не държи стари build-ове. Верният build се познава по commit в горния десен ъгъл.

## Windows: първо пускане (PowerShell)

Изисквания: Git, Node.js 22 LTS (Vite 8: Node ≥20.19 или ≥22.12), Python 3.12.
**Отвори PowerShell в разархивираната папка `ar-drawing/`**, така че да виждаш `app/` и `python_engine/`.

**Терминал A — уеб приложение (остава отворен):**
```powershell
node -v
cd app
npm ci
npm run dev
```

**Терминал B — Python и тестове:**
```powershell
# Отвори втори PowerShell в ar-drawing/
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
python -m pip install -e ./python_engine
pytest python_engine
# Само предварителна локална проверка; G1 се мери на iPhone с Pyodide:
python -m ar_drawing.spike_proxy --size 1024 --runs 5
```

`npm ci` и Python инсталацията изискват интернет на Windows. Не са част от офлайн използването на iPhone.

## NumPy proxy за G1 (Ден 2)
`python_engine/ar_drawing/spike_proxy.py` е малък, без OpenCV, repeatable бенчмарк:
separable Gaussian (5 taps) + Sobel magnitude с `float32`.
На Ден 2 същият код се зарежда през Pyodide Worker и се записват петте времена, медианата,
версията на NumPy и времето за стартиране на runtime-а. **Не ползвай времето от Windows като резултат за iPhone.**
Прагът за G1 е записан предварително в `docs/gates.md` (3.0 s медиана, проектна цел).

## GitHub Pages (стабилен HTTPS origin за iPhone)
1. Създай **публично** репо в GitHub и изпълни от корена на `ar-drawing/`:
   ```powershell
   git init -b main
   git add .
   git commit -m "Day 1 scaffold and diagnostics"
   git remote add origin https://github.com/USERNAME/REPO.git
   git push -u origin main
   ```
   Замени `USERNAME` и `REPO` с твоите стойности. Git може да поиска първоначална конфигурация на име и email или вход в GitHub.
2. Settings → Pages → Source: **GitHub Actions**.
3. След зелен workflow адресът е `https://<потребител>.github.io/<репо>/`.
4. На iPhone отвори адреса с `?debug=1` (Eruda). В Home Screen режим включваш/изключваш debug с 5 бързи докосвания върху версията.

## Проверки преди първия push
- След `npm run build` отвори `app/dist/index.html` и се увери, че пътищата към JS, CSS, manifest и иконите са коректни за поддиректорията на GitHub Pages.
- Тестът в Safari и този в Home Screen са отделни: не приемай, че локалните им хранилища се споделят.
- Индикаторите `opfs` и `webGPU` доказват само наличие на API; реалните read/write и inference се проверяват в следващите дни.

## Готово за Ден 1, когато
- [ ] Страницата се отваря на iPhone и показва версия и commit
- [ ] `?debug=1` показва Eruda; събитията се виждат и в самата страница
- [ ] „Тест: грешка“ добавя два error записа
- [ ] Crash marker: старт на тестовата задача, затваряне от app switcher, ново отваряне дава `unexpected_stop`
- [ ] „Запази / сподели JSON“ дава файл без снимки и лични пътища
- [ ] `Add to Home Screen` работи; в Home Screen режим „Режим“ показва standalone
