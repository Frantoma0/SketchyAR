# SketchyAR 0.4.10 — Safari/standalone viewport experiment

## Цел

Тествай единствено промяната `default` → `black-translucent` в
`app/index.html`. Настройката важи за Home Screen web app и не променя
layout-a в обикновен Safari tab. Няма промяна в Figma координатите,
Background изображението, 20px разстоянията или Drawing жестовете.

## Преди deploy

В директорията на проекта:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
```

Публикувай след успешен build:

```powershell
git add .
git commit -m "Day 4.10: standalone-only status bar experiment"
git push origin main
```

## Проверки

1. Safari tab: отвори страницата и провери, че пропорциите и адресната лента са непроменени.
2. Home Screen: отвори вече създадената иконка и провери дали долната ивица е изчезнала.
3. Проверявай commit-a в диагностиката. Ако в старата инсталация няма разлика, възможно е iOS да е запазил status-bar-style при добавянето на иконката. Ако е възможно, сравни с **втора** Home Screen инсталация, без да изтриваш оригиналната.
4. От Home натисни дискетата → диагностика → export JSON; търси `home.layout` със `displayMode`, `screenHeight`, `innerHeight`, `clientHeight`, `visualHeight`, `rootHeight`, `safeTop`, `safeBottom`, `statusBarMeta`.
5. Върни се и провери `Нова рисунка`, камера и `Назад`.

### Интерпретация

- Ако `standalone` има по-голям viewport и фонът достига долу, настройката работи.
- Ако `screenHeight ≈ 874`, а `innerHeight ≈ 812`, WebKit все още не предоставя цялата физическа височина. CSS не може да рисува извън уеб изгледа.
- Ако safe-area стойностите са 0 в standalone и горният бутон влиза под часовника, следващата промяна трябва да се прави **само по адаптивното разположение**, не по общия размер на фона.

Има известни WebKit регресии при iOS 26, затова това е експеримент, не гарантирана поправка. Не изтривай оригиналното приложение/локалните данни преди backup.
