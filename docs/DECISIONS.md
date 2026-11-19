# SketchyAR — Architecture Decisions

## D-05-01: Typed storage v1

- Четири stores: `projects`, `assets`, `overlay_presets`, `app_settings`, без логин.
- `ProjectRecord.guide?: GuidePlanV1` още от v1; `AssetRecord.role` включва `guide-step`; всяко derived изображение пази произход и настройки.
- Backup manifest `schemaVersion: 1` ще включва **всички** метаданни и `projects[].guide` при ZIP export на Дни 13–14. При restore T14 сравнява `guide` (mode, steps/order/accepted, currentStep, reveal, generator) и проверява `guide.steps[].assetId → assets.role='guide-step'` в същия проект. Отсъстващ `guide` при стари/негайднати проекти е валиден.
- Оригиналите се пазят като Blob; thumbnails са отделни. Няма автоматичен `ArrayBuffer` fallback без доказан WebKit проблем.

## D-05-02: V2 Raster planner (за Ден 16, без код сега)

- Стандартът е **точно 5 стъпки** (константа `DEFAULT_RASTER_STEP_COUNT=5`). „4–6“ от старите текстове се заменя с 5. Ако бъде поискан адаптивен брой `N`, тестовете/схемата се параметризират едновременно; не смесваме варианти.
- `F` се определя **веднъж** като крайна бинарна карта. `M0=∅`, `M1⊆M2⊆M3⊆M4⊆M5=F`. `Δi=Mi\Mi-1`, дисюнктни маски и OR на всички Δ = F.
- Multi-scale XDoG се използва **само за оценяване** на важността на елементи от `F`, а не за добавяне на нови растерни контури.
- `S(p)` не се праговa директно пиксел по пиксел в продукционния V2: това може да скъса дебели щрихи. Приоритетно оценяваме **компоненти или локални сегменти** (с една стойност за сегмент) и при нужда прилагаме локален max/median филтър **само върху оценъчното поле**, преди монотонни прагове. Филтрирането не изменя бинарната карта `F` и не може да въведе нови пиксели. Малък max филтър може да прелее оценката между съседни щрихи; сравняваме с component/segment подход.
- Критерии: `M5==F`, вложеност, дизюнктност на `Δ`, без неочаквано раздробяване на линии, качество на 3 fixtures, предварително определени метрики за брой фрагменти.
- Помощни геометрични линии, които не принадлежат на `F`, са **отделен P2 слой**, не подмножество на маските.

## D-05-03: Safe Area и iPhone 17

- Исторически в iOS 26 standalone са наблюдавани viewport разлики от около 62 CSS px между `screen.height` и достъпната област. Това **не** е универсално правило/константа за hardcode.
- Началният екран използва актуалния работещ `home.ts` safe-fit и фон от качената версия. **Да не се променят Safe Areas или background** без две снимки (Safari + Home Screen) и регресионен тест на Drawing.


## Day 8 — runtime assets belong to our own origin (2026-11-19)

- Freeze Python browser runtime at Pyodide `314.0.8`; vendor its loader, WASM, stdlib, lock and NumPy wheel closure at build time from the matching release, with lock SHA-256 validation.
- Keep optional OpenCV benchmark out of the default P0 runtime and make it explicitly opt-in at vendor time; a missing OpenCV wheel must never trigger an unintended CDN fallback.
- Preserve Caveat Bold Cyrillic and license; convert a pinned upstream TTF to self-hosted WOFF2 during build; preserve typography positions/sizes and never use Google Fonts at runtime.
- No Service Worker precache until the planned staged SW work. Presence of files on the server is **not** `CORE OFFLINE READY`.
- Day 8 has two independently reported benchmark environments: CPython on Windows and Pyodide in a Web Worker on iPhone. Both run the same `spike_proxy.py` algorithm; do not pool their timings.
