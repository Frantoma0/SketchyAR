# G1 — SketchyAR iPhone 17: протокол за Ден 3

Измерванията са от **реален iPhone**, не от PC. **Попълни след теста**, преди да
обявиш G1 за приключен. При липса на метрика отбележи `неизмерено`.

- Версия: `v0.3.0`; commit: `_____________`
- Device/iOS: `iPhone 17 / __________`
- Платформа: `Home Screen` / `Safari tab`
- Дата/час: `_____________`
- Заредени Python библиотеки: `_____________`
- Camera settings (`width`, `height`, `frameRate`, `facingMode`): `_____________`

| Режим | PNG overlay | Workload | Video FPS | rAF p95 ms | rAF >50 ms | Batch ms (median) | Reload / stop |
|---|---|---|---:|---:|---:|---:|---|
| OFF | 0px | idle 12s | — | | | — | |
| Mini | 0px | idle 12s | | | | — | |
| Mini | 0px | NumPy 20s | | | | | |
| Mini | 0px | OpenCV 20s | | | | | |
| Fullscreen | 2048px | idle 12s | | | | — | |
| Fullscreen | 2048px | NumPy 20s | | | | | |
| Fullscreen | 2048px | OpenCV 20s | | | | | |
| Mini | 2048px | NumPy 20s | | | | | |

**Предварително фиксирани ориентири:** `videoFps >= 24`, `rAF p95 <= 42 ms`,
без неочакван reload, при видима страница; алгоритмичните времена от Ден 2
са отделни: cold init <=15s, NumPy proxy <=3s, cv2 Canny <=3s, 10/10 операции.

**Данни за рестарт:**
- Затваряне от app switcher и ново отваряне: `_____________`
- Нов sessionId: `_____________`
- Worker отново стартира: да / не
- unexpected_stop: да / не; причина **unknown**, освен ако не е установена другояче

**Извод за G1:** Pass / Conditional pass / Blocked

**Решение за backend:** `NumPy-first`; cv2: optional / Windows-only

**Основание:** …

**Важни ограничения:** `videoFps` е callback-based показател; rAF не измерва GPU
кадри. Storage quota не е RAM. Заради различните алгоритми 19ms NumPy Sobel
и 15ms OpenCV Canny не доказват кой backend е по-бърз за една и съща работа.
