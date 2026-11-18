# Ден 4.4 — жестове и layout

- Design coordinates: 385×835; viewport се измерва на всяко `resize` и `visualViewport.resize`; `scale=min(viewportWidth/385,viewportHeight/835)` запазва целите пропорции.
- Dynamic Island и долните системни елементи: Figma frame вече съдържа отстъпите в първоначалната композиция; не рисуваме фалшив Dynamic Island.
- Paper background: извън и вътре в design stage, без „бели ивици“.
- Labels: Caveat Bold; 37.35 CSS px в design space; 33.79 за Offline; `display:flex; align-items:center; justify-content:center`.
- Pointer gestures на `.drawing-video-stage`: `touch-action:none`, pointer capture, 1 finger drag, 2 fingers pinch+rotate around centroid. Камерата `object-fit:cover` не се трансформира. Слайдерите и бутоните са извън gesture surface.
- Има лог за финалното състояние след жест; няма запис на всеки кадър.
- Това е експерименталният Day 4 overlay. Day 5 ще добави Lock и запазване на transform.
