# SketchyAR — Ден 4.5: стартиращ екран и защита от празна страница

Установен коренен дефект във v0.4.4: `initArtworkGestures()` търси
`document.getElementById('drawing-video-stage')`, докато контейнерът имаше само
`class="drawing-video-stage"`. Това водеше до `null.addEventListener` и спираше
стартирането преди `initHome`, оставяйки и Home, и diagnostics скрити.

Поправка: добавен е липсващият `id`, а началният екран вече се показва
**преди** незадължителните инициализации, с fallback съобщение при проблем в JS.

Промени:
- `sketchy-home` вече не стартира скрит.
- Началният екран се инициализира преди benchmark и камера контролера.
- Независими `try/catch` за временните модули.
- Първоначален HTML fallback (запазва се дори при неуспешен JS bundle).
- Уведомление и презареждане вместо черен екран.
- Без изтриване на локални данни и без Service Worker.
- Запазени: 385×835 Figma координати, Caveat Bold, paper background, бели бутони,
  Fixed Overlay, pinch/rotate/drag и всички тестове.

Проверка на Windows:

```powershell
cd app
npm ci
npm run typecheck
npm run build
cd ..
python -m pytest python_engine -q
```

След push на GitHub изчакай успешен Pages deploy; първо отвори Safari URL и после
Home Screen. Ако след девет секунди видиш съобщение за грешка, снимай го или
експортирай diagnostics след успешен старт. Не изтривай PWA данните.
