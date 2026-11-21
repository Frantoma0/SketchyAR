# SketchyAR — Ден 16 / Отчет от локалните тестове (21.11.2026)

**Версия:** `v0.16.0`, изведена от проверения GitHub commit `13b3c8a` (Day 15). **Статус:** локален код PASS; официален Windows (TypeScript 7/Vite) и iPhone приемане PENDING.

| Проверка | Резултат | Контекст |
|---|---|---|
| Node backup ZIP / safety / conflict unit tests | **29/29 PASS** | `npm run test:day16` с Node 22 и TypeScript 5.8.3; включва всички наследени 24 теста |
| Python regression | **144/144 PASS** | `python -m pytest python_engine -q` |
| Strict TypeScript typecheck | **PASS (локален еквивалент)** | `tsc --noEmit` с глобалния TypeScript 5.8.3 и само локални временни декларации за `vite/client`, `eruda` и `?raw` ресурси; това **не** е официалният Vite build |
| Chromium UI smoke (изолирана среда) | **PASS** | production markup+CSS и реалният Day16 controller, но с mocked IndexedDB/backup implementation; popup не мести бутона |
| Официален npm ci + TypeScript 7.0.2 + Vite 8.3.8 build | **PENDING** | npm архивите не са достъпни в тази изолирана среда |
| ZIP Save to Files и file picker в iOS WebKit | **PENDING** | изисква потребителския реален iPhone |
| Archive SHA-256 Verify / Sandbox Restore на iPhone | **PENDING** | изисква действителния ZIP и неговото повторно избиране |
| Production restore на съществуващи данни | **NOT PERFORMED (BY DESIGN)** | тестът за Ден 16 не трябва да трие/импортира лични данни |

## Какво включва браузърният smoke

Използван е headless Chromium с DOM, CSS и транспилирания действителен `day16-backup-ui.ts`, без мрежови заявки. Сървисните операции са заместени с контролирани тестови отговори, затова резултатът **не доказва** действителен IndexedDB restore в браузър. Проверени са: menu toggle и geometry; подготовка на ZIP и disabled share преди готовност; директен Files chooser hook; verified state; sandbox prerequisite; отказано потребителско потвърждение (без запис); прието потвърждение (еднократно); блокиран повторен импорт; preview на колизии, който държи Restore disabled; достъп до диагностиката.

## Рискове и граници

1. Непълната npm среда не позволява локално да изпълним **официалния** `npm ci`/Vite build, затова Windows gate е PENDING, а не измислен PASS.
2. `navigator.share` изисква пряк потребителски tap — затова `ZIP PREPARED` и `Save in Files` са отделни стъпки.
3. Import preflight проверява всички четири store keys read-only. Реалната атомарна транзакция повтаря проверката; не позволява overwrite или merge на съществуващи ключове.
4. Вече съществуващият път за шрифта `Caveat-Bold.woff2` зависи от GitHub Actions vendor script; локалната browser smoke среда не съдържа този бинарен ресурс и не е графичен pixel-perfect acceptance. Проверяваме реалния шрифт на iPhone.
5. Лицензът на авторския код и окончателният NOTICE ще изискват одобрение/реален инвентар; не са автоматично декларирани от този пакет.

## Събиране на доказателства след инсталиране

Windows: `npm run typecheck`, `npm run build`, `npm run test:day16`, `python -m pytest python_engine -q`, Git commit hash. iPhone: версия/SHA, popup видим, готов ZIP във Files, същият ZIP избран от Files, SHA PASS, sandbox PASS, отказан production restore при ID конфликт, 8 проекта и работеща камера след cold relaunch; експорт на диагностичен JSON. Няма нужда от реално изтриване или importer в съществуваща база.
