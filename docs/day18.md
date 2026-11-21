# SketchyAR — Ден 18 / v0.18.0
## Навигационен договор за Sketch Generator и безопасен read-only preview

**Изходна база:** v0.17.1 / commit `6154f7d` (Day17.1, оригиналният потребителски SVG молив, 6 CSS px от кошчето).
**План:** Roadmap v3.1, Ден 18 (4–7 ефективни часа), приемане на iPhone предстои.
**Дата на локалното разработване:** 21.11.2026.

### Цел

Изграждане на маршрути и временно състояние за бъдещия Sketch Generator, **без да се активира незавършеното генериране**. Днес моливчето вече показва реалния оригинал на проекта. Достъпът до камерата, архивирането, 6px подредбата на иконките и IndexedDB schema v1 са запазени.

### Реализирани маршрути и gate

`app/src/day18-navigation.ts` съдържа типизиран договор:

| Entry | Dest | Наличност в Ден 18 |
| --- | --- | --- |
| `new-drawing` | native picker → временно `draft` → бъдещ Generator | **feature-gated**: засега работещият native picker продължава към камерата и създава истински проект, както преди. Това е временна съвместимост. |
| `resume-project` | камера | **Активен**: натискане на снимката на полароида. |
| `edit-sketch` | Generator shell | **Активен като read-only preview**: натискане на моливчето. |
| `edit-from-camera` | Generator shell | **Само типизиран договор**, реалният вход ще се свърже на Ден 21. |
| `change-source` | native picker | **Само типизиран договор**, старият бутон в камерата остава без промяна. |

`SketchRouteMachine` съдържа `idle`, `picker`, `draft`, `committing`, `edit`. Временният `draft` държи `File` **само в RAM**; при cancel няма нов `ProjectRecord` или нов asset. При `committing` повторен commit и cancel се отказват, за да не се получи двойно записване. Тази функционалност е **само изпробвана от unit тестове**, не е включена в продуктовия вход `Нова рисунка` до реалния Generate→Save→Draw gate.

### Read-only редактор за стари проекти

`app/src/day17-sketch-placeholder.ts` вече използва `getProjectImage(project.id)` и зарежда **оригиналния** `source.blob` чрез `URL.createObjectURL`. Дисплеят съобщава изрично „Показан е оригиналът — обработката на скици предстои“. Няма промяна на проекта, сканиране на личния Blob в други системи или автоматичен запис. При Back/Escape `ObjectURL` се освобождава; след асинхронно четене се проверява token, за да не се покаже стар резултат след затваряне.

В актуалната схема `ProjectRecord.activeAssetId` сочи оригиналната снимка. Самостоятелно избраният processed вариант/recipe и съответният избран `processedAssetId` предстоят в Generator интеграцията. До тогава readonly preview и рисуването на стари проекти използват оригинала и работещите saved overlay presets.

### UX/UI промени

- Добавен е истински preview (`#day18-original-preview`) в съществуващия малък графитен Day17 екран. Това е **междинна версия**, не финалният дизайн от Ден 19.
- Контролите за Back и връщане, стилът на хедъра и отчетливото уведомление остават.
- Не са пипани Figma layout константите на Home, графитните полароиди, двете 44×44 touch зони, видимите 6px между моливчето и кошчето, Backup менюто и камерата.
- Не добавяме декоративни стилове, които все още не съществуват.

### Списък на промените

- `app/src/day18-navigation.ts` — нов pure TypeScript route/state contract.
- `app/src/day17-sketch-placeholder.ts` — реален read-only source preview, token guard, release ObjectURL, safe Back.
- `app/src/main.ts` — preview image + честно съобщение, без преправяне на Home.
- `app/src/styles.css` — само стилове за preview.
- `app/tests/day18-navigation.test.mjs` — 12 нови unit/contract теста.
- `app/tests/day17-project-card.test.mjs` — историческият тест за версията вече не блокира следващи версии, старите click проверки остават.
- `app/package.json`, `app/package-lock.json` — v0.18.0, `npm run test:day18`.
- `docs/day18.md`, `Day18_INSTALL.txt` — документация.

### Автоматизирани доказателства

| Тест | Локален резултат | Важна уговорка |
| --- | --- | --- |
| `node --experimental-strip-types --test tests/*.test.mjs` | **55/55 PASS** | Включва старите Day14–17 и 12 нови Day18 теста. |
| `python -m pytest python_engine -q` | **144/144 PASS** | Оригиналните Python алгоритми не са променяни. |
| TypeScript `tsc --noEmit` | **PASS с TypeScript 5.8.3** | Използвани са временни Vite type declarations, защото npm Vite не е инсталиран тук. Не е официален TS7 build. |
| Chromium browser smoke (mock IndexedDB read) | **PASS, 4/8/12 проекта** | Проверени са независимите действия, реално `blob:` src в preview, Back/Escape/focus, footer/иконки. Browser smoke използва **тестови mock данни**, не истинска IndexedDB база. |
| Windows `npm ci`, TypeScript 7/Vite build | **PENDING** | Изпълнява се от разработчика. |
| Реален Home Screen iPhone preview и DB audit | **PENDING** | Изпълнява се от разработчика. |

### Windows изпълнение

```powershell
cd "C:\Users\vikit\Desktop\AR Drawing Проект\Код\ar-drawing"
Expand-Archive -Path "$env:USERPROFILE\Downloads\SketchyAR_Day18_Changes_Only_v0.18.0.zip" -DestinationPath . -Force
cd app
npm ci --include=dev
npm run typecheck
npm run build
npm run test:day18
cd ..
python -m pytest python_engine -q
git diff --check
git status
```

При PASS и само очакваните файлове:

```powershell
git add app/package.json app/package-lock.json app/src/day18-navigation.ts app/src/day17-sketch-placeholder.ts app/src/main.ts app/src/styles.css app/tests/day17-project-card.test.mjs app/tests/day18-navigation.test.mjs docs/day18.md Day18_INSTALL.txt
git commit -m "Day 18: typed sketch routes and safe source preview"
git push origin main
```

### iPhone приемане G18

1. GitHub Pages deployment е успешен; diagnostics показва `v0.18.0` и новия commit.
2. Моливчето на **стар проект с реална снимка** отваря „Промени скицата“ и действително показва **оригиналната снимка**, не илюстрация и не фалшиво обработен PNG.
3. Върни се със `Назад` и провери, че прозорецът се е затворил и моливчето отново може да бъде натиснато. В Safari/desktop опитай Escape/focus.
4. Отвори стар проект от самата снимка — камерата трябва да възстанови предишните scale/rotation/opacity/Lock/preset.
5. Натисни името (rename/Cancel) и кошчето (само Cancel); виж, че действията не се смесват.
6. Натисни „Нова рисунка“ → избери снимка: **временно продължава към камерата**, докато Generator не е приемателно готов. Откажи native picker отделно и потвърди, че не създава проект.
7. Пробвай долния Backup бутон → Диагностика/ZIP Verify (само ако желаеш). Не изтривай и не прави производствен Restore за този тест.
8. Направи force-close, отвори пак; изпълни Day7 DB Audit и провери наличните проекти. Изпрати диагностичния JSON.

**Definition of Done:** Всички Windows проверки + G18 на iPhone са PASS; оригиналите и overlay presets не са променени от отваряне/затваряне на редактора. **Самата генерираща функция не е критерий за Ден 18.**

### Остава за следващите дни

- Ден 19: истински графитен Generator UI shell (запазване на стилове, разстояния и safe area).
- Ден 20: контроли, disabled състояния, preview state, draft semantics в UI.
- Ден 21: навигация от камерата и безопасен round-trip.
- Дни 24–42: качествен processing и реален Generate→Save→Draw; **едва тогава** включваме `Нова рисунка` → Generator за всички потребители.
