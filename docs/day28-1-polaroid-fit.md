# SketchyAR v0.28.1 — Day 28.1: fit image by BOTH dimensions inside the Figma Polaroid

Дата: 2026-11-22. База: v0.28.0. Тип: изолиран UI hotfix; не променя Sketch V4, данните или камерата.

## Проблем

Снимките в екрана „Редакция“ понякога изглеждат подредени само по височина и широките изображения излизат извън вътрешния контур на полароида. `object-fit:contain` беше наличен като CSS, но липсваше изрично изчисляване на размера спрямо **реалните две измерения** на декодирания файл и размерите на изрязания прозорец.

## Поправка

Новият независим `fitImageInAperture()` избира мащаб:

`scale = min((apertureWidth - 2 × padding) / naturalWidth, (apertureHeight - 2 × padding) / naturalHeight)`

Следователно `shownWidth = naturalWidth × scale` и `shownHeight = naturalHeight × scale`.

- Отстъп: 6 CSS px **от всяка страна на вътрешния фотоотвор**, а не от декоративната рамка.
- Изображението е центрирано спрямо photo aperture; геометрията на Figma полароида не е променена.
- Пропорциите се запазват за landscape, portrait, square, panorama и много издължени снимки.
- Размерът се преизчислява при **всяко `load`**, включително превключване оригинал ↔ Sketch PNG; и при `ResizeObserver` / `resize`.
- При затваряне inline размерите се изчистват, за да не се наследяват от следващия проект.
- CSS `object-fit:contain` е резервно поведение, докато снимката се декодира.
- Промените са само за `#day18-original-preview` в `.day20-figma-screen`. Няма промени в Home thumbnail, Camera или lightbox.

**Важно:** Това е поправка на показването, не промяна на оригиналните пиксели или на самия Sketch алгоритъм. Оригинали и скици в IndexedDB не се презаписват.

## Тестове

- Node: 160/160 PASS — регресии и 10 нови теста за fit.
- Python: 227/227 PASS — без промени в engine.
- Локален TypeScript 5.8: PASS с временни Vite декларации от тестовата среда (не са включени в ZIP).
- Chromium: визуални измервания на същия Figma polaroid SVG, landscape 4:3, portrait 3:4, square 1:1, panorama 5:1 — 4/4 contained PASS.
- Windows TypeScript 7/Vite production build: PENDING.
- Реален iPhone Safari/Home Screen PWA: PENDING.

## Инсталиране

Прилагай **само върху v0.28.0**. Ако локално още си на Ден 25, първо приложи комбинирания пакет 25→28, после този hotfix. Не използвай пълния архив върху активното Git репозитори.

```powershell
cd "C:\Users\vikit\Desktop\AR Drawing Проект\Код\ar-drawing"
Expand-Archive -Path "$env:USERPROFILE\Downloads\SketchyAR_Day28_1_Polaroid_Contain_Fit_Hotfix_v0.28.1.zip" -DestinationPath . -Force
cd app
npm ci --include=dev
npm run typecheck
npm run build
npm run test:day28-1
cd ..
python -m pytest python_engine -q
git diff --check
git status
```

След успешни проверки staging (само файлове от този hotfix):

```powershell
git add app/package.json app/package-lock.json
git add app/src/day28-1-polaroid-fit.ts app/src/day17-sketch-placeholder.ts app/src/styles.css
git add app/tests/day28-1-polaroid-fit.test.mjs app/tests/day28-flow-coherent.test.mjs
git add app/tests/day21-camera-navigation.test.mjs app/tests/day22-sketch-mode.test.mjs
git add app/tests/day25-sketch-quality.test.mjs app/tests/day26-multiscale.test.mjs app/tests/day27-importance.test.mjs
git add docs/day28-1-polaroid-fit.md Day28_1_INSTALL.txt
git diff --cached --check
git diff --cached --stat
git status
git commit -m "fix(day28): fit editor polaroid image within both axes"
git push origin main
```

**Ако досега не си качвал Дни 26–28**, използвай `git add -A` *само след* внимателен `git status`, за да включиш и техните файлове, но без лични снимки и ZIP архиви.

## Проверка на iPhone (G28.1)

1. Импортирай или отвори хоризонтална 16:9 снимка. Цялата ширина трябва да се побира във фотоотвора, без отрязани части.
2. Пробвай вертикална 9:16 и квадратна снимка. Височината и ширината остават в границите; няма деформация.
3. Пробвай много широка панорама: тя се побира по ширина, с нормално свободно място отгоре/отдолу.
4. Натисни „Скица“ и задръж/отпусни изображението: оригиналният и генерираният PNG се позиционират самостоятелно.
5. Затвори и отвори друг проект. Размерът не се наследява от предишната снимка.
6. Натисни „Рисувай“, върни се в редактора, провери отново, както и ако iPhone промени размерите на viewport.
7. Увери се, че Home thumbnail, камерата, оригиналът в IndexedDB и Backup са непроменени.

Статус: готово за Windows и iPhone приемане, не е публикувано автоматично.
