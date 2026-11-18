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
