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
