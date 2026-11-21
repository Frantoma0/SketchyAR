# SketchyAR — Ден 15 (v0.15.0): Защита на локалната база / G2 Hardening

**Основа:** commit `c7d6de3`, `v0.14.0` (отделен ZIP export → verify → sandbox restore → production restore PASS на iPhone).  
**Приет план:** v3.0, Ден 15, 4–7 логически часа. Ден 16 е регресията на Image Bridge, Дни 17–19 — Offline Core.  
**Текущ резултат:** implementation + 24/24 локални Node теста, Python regression suite, TS 5.8 typecheck с локални декларации; Windows TypeScript 7/Vite и iPhone тест са **PENDING**.  
**Изискване за PASS:** реален iPhone `DAY15 HARDENING PASS` + непокътнати проекти, галерия и overlay след force-close/relaunch.

## Scope

- Без промяна на ZIP32 STORE format, MIME правила, SHA-256, IndexedDB schema или оригиналните assets.
- Добавено е `runDay15SafetyDrill(file)` в `src/storage/day14-backup-service.ts`: `verifyBackup` на избрания ZIP, отказ на отрязан ZIP, restore в **отделна Day15 sandbox база**, повторен restore на същия архив → очакван ID conflict, сравнение на sandbox ключове преди/след неуспеха, read-only сравнение на 4-те production object store key списъка преди/след.
- При всяко отклонение → FAIL, без обработка на истински `delete`, `clear`, `put`, `add`. Day15 упражнението не е production Restore. Sandbox базата се изтрива във `finally`, след затваряне.
- В Debug → Ден 15: избор на локален ZIP + бутон „Стартирай безопасния тест“; лог `day15.hardening` `pass/error`, без снимки и съдържание на архива в диагностиката.
- Добавени са отрицателни Node тестове: директна подмяна на bytes, traversal, припокриващи се ZIP записи, забранени флагове/encryption/data descriptors, ZIP64/deflate/declared bomb, truncate/trailing data, size limit, повторен restore, ID collisions във всички stores, отказ при всички позиции на симулиран quota failure и duplicate project metadata.

## Ограничения / какво НЕ доказваме

- `productionKeysUnchanged` доказва **идентични списъци от ID/ключове**, а не побайтов хеш на всички production Blob-ове. Кодът на Day15 не извършва production DB writes; Day14 вече включва независима SHA-256 проверка на архива и restored Blob hashes.
- Симулираните quota failures са тестове на Node mock транзакции, а НЕ умишлено запълване на реалната iPhone памет.
- ZIP32 без компресия остава умишлено ограничение. DEFLATE/ZIP64 архиви се отказват.
- Offline cold-start не е доказан; това е целта на Дни 17–19.
- В този пакет кодът е проверен с локален TypeScript 5.8.3 и временни Vite/eruda declaration шими, понеже npm пакети не са достъпни в тази изолирана среда. Само Windows TypeScript 7.0.2 с реално `npm ci` и Vite production build ще дадат окончателен compile PASS.

## Windows тестове

В `ar-drawing/app`:

```powershell
npm ci --include=dev
npm run typecheck
npm run build
npm run test:day15
cd ..
python -m pytest python_engine -q
git diff --check
```

Очакван тестов резултат: **24/24 PASS** при `test:day15` (включва Day14 регресиите). Warning за Caveat Font и eruda eval може да остане и се отчита отделно, ако production build завършва успешно.

## iPhone безопасен acceptance drill

1. Запази вече проверения архив във Files и **не изтривай** нищо от галерията.
2. След git commit/push и успешен GitHub Pages deploy: стартирай от Home Screen и провери `v0.15.0` + нов SHA.
3. В Developer Diagnostics → **Ден 15**, натисни „1. Избери запазения ZIP“ и посочи архива, с който беше проверен G2.
4. Натисни „2. Стартирай безопасния тест“. Очаквай `DAY15 HARDENING PASS`, `malformedArchiveRejected: true`, `duplicateRestoreRejected: true`, `sandboxUnchangedAfterConflict: true`, `productionKeysUnchanged: true`, `sandboxRecords` = 8 projects, 31 assets, 11 presets, 1 setting **за тестовия архив** от Ден 14.
5. Провери реалната галерия (8 проекта към края на Ден 14), отвори 2 от тях в камерата, провери thumbnail, изображенията и opacity/Lock/transform.
6. Force-close от App Switcher → re-open от Home Screen. Увери се, че проектите/настройките още са на място; пусни Day 7 DB audit и експортирай diagnostics JSON.

**Не прави production restore и НЕ изтривай проекти отново.** Тази проверка е без разрушителни стъпки.

## Приемателни доказателства

- Windows: `npm run typecheck`, `npm run build`, `npm run test:day15` и Python regression suite; commit hash.
- iPhone: screen/JSON `day15.hardening: pass`, 4 true flags, 4 production counts, галерия след restart, Day7 audit.
- Ако няма iPhone данни → **Ден 15 PENDING**, независимо от локалните успешни тестове.

## Следващ етап

Ден 16 (v0.16.0): 10 последователни Python→PNG обработки, stale result drill и force-close/relaunch; след това ресурсният offline manifest в Ден 17.
