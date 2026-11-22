# SketchyAR — Day 32: генеративно фото→манга сравнение

**Самостоятелен, локален изследователски стенд върху v0.31.0.** Не променя Manga бутона в текущата PWA, нито Home/камера/IndexedDB. Ден 32 подготвя доказателствената основа за избора на AI модел през Ден 33. **Няма включени AI тегла, лични фотографии или фиктивни AI резултати.**

Тестваме **Qwen-Image-2.1-Turbo**, **Qwen-Image-Edit-2511**, **AnimeGANv3** и оригиналния **Manga V1 от Ден 31** (baseline). *AnimeGANv3* дава основно цветна стилизация; не може да изпълни текстов манга промпт. Сравняването става в два слоя: `outputs` (стилизирани изображения) и `trace` (еднакъв D3/Normal Day31 postprocessing върху всеки резултат). `trace` **не е** MangaScreen и не е бъдещият Day33 финален renderer.

## 1. Подготовка (Windows PowerShell, от корена на ar-drawing)

Създай частна директория с 6–30 реални изображения, напр. `C:\SketchyAR-private-photos` — портрети, групи, животни, обекти, пейзажи, тъмни сцени. Запазвай съгласието на хората; **изображенията не се качват никъде от скриптовете**. Препоръчително е едни и същи снимки да се използват за всички модели.

```powershell
py -m pip install numpy pillow pytest
$env:PYTHONPATH="python_engine;experiments/day32"
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" prepare --photos "C:\SketchyAR-private-photos"
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" trace --model day31_v1
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" report
```

Първата стъпка създава анонимни `case_001.png` и т.н., премахва EXIF/оригинални имена и записва SHA-256 в `manifest.json`. Категориите можеш да смениш ръчно от `other` на `portrait`, `animal` и т.н. **Не публикувай частната папка**, защото тя съдържа снимки, генерирани лица и ключ за сляпото оценяване.

## 2. AI inference — само при изрично стартиране

Тези зависимости/модели са **големи** и се инсталират на **отделен компютър с подходящ GPU**, не на iPhone PWA и не в GitHub Pages. Използвай отделно Python venv, проверявай оригиналните инструкции/версии и лицензите.

```powershell
# Само инспекция на задачите — без изтегляне на модели
py experiments/day32/infer.py --project "C:\SketchyAR-Day32-private" --engine qwen21_turbo --device cuda --dry-run

# Qwen 2.1 Turbo (официалният Diffusers QwenImage21Pipeline)
# инсталирай PyTorch CUDA, transformers>=5.17, accelerate и последния diffusers
py experiments/day32/infer.py --project "C:\SketchyAR-Day32-private" --engine qwen21_turbo --device cuda --limit 1

# Qwen Edit 2511 (официалният Diffusers QwenImageEditPlusPipeline)
py experiments/day32/infer.py --project "C:\SketchyAR-Day32-private" --engine qwen_edit2511 --device cuda --limit 1

# AnimeGANv3 ONNX (официални или собствени правомерно получени тегла)
py -m pip install onnxruntime pillow numpy
py experiments/day32/infer.py --project "C:\SketchyAR-Day32-private" --engine animeganv3 --device cpu --onnx-model "C:\models\your-AnimeGANv3.onnx" --limit 1
```

Преди реално пускане на целия набор, провери 1 резултат от всеки engine, памет и размер. **Не смесвай** резултати от различни ревизии/промпти в една таблица; при нова конфигурация създай **нова** частна папка. Всяко генерирано PNG получава `.json` provenance с source SHA-256, output SHA-256, модел, seed, runtime и prompt (когато има). Съществуващите резултати **не се презаписват**.

**Важно:** кодът не изпраща изображение към remote API. Моделите на Hugging Face се изтеглят при първи изричен inference, освен ако вече са кеширани. За cloud/GPU сървър личните изображения ще трябва да бъдат прехвърлени от теб, само ако имаш съгласие — това не се автоматизира.

## 3. Прозрачни AR preview + локална галерия

```powershell
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" trace --model qwen21_turbo
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" trace --model qwen_edit2511
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" trace --model animeganv3
py experiments/day32/bench.py --project "C:\SketchyAR-Day32-private" report
```

Отвори локалния `review/blind_review.html`. Галерията разбърква A/B/C/D за всеки case и **не показва** името на алгоритъма на оценяващите. `review/PRIVATE_blind_key.json` е само за организатора. В `ratings.csv` вече има празни подготвени редове за **всеки case × всеки blind вариант × два независими оценяващи** (`reviewer_1`, `reviewer_2`); попълни само числата 1–5. Празните редове са pending и не се броят за оценка. Нужни са поне **двама** различни оценяващи, всички случаи и всички варианти за крайна класация. Оценките са цели числа 1..5:

| Критерий | Тежест |
|---|---:|
| Художествен Manga стил | 30% |
| Прилика/разпознаваемост на обекта | 25% |
| Удобство за рисуване през AR | 25% |
| Запазване на композицията | 10% |
| Липса на артефакти | 10% |

`review/diagnostics.csv` показва автоматични метрики (тъмни пиксели, edge density, chroma и латентност) **само за диагностика, никога автоматично качество**. `review/summary.json` няма `ranking`, докато няма валидни реални резултати и пълни независими оценки.

## 4. Ограничения и етични/лицензни условия

- **Qwen 2.1 Turbo:** Qwen Research License, не вграждай в търговско приложение без отделна проверка/разрешение.
- **Qwen-Image-Edit-2511:** моделът е Apache-2.0; LoRA/model cards и инфраструктура имат собствени условия.
- **AnimeGANv3:** авторски non-commercial условия. Може да се изследва, не да се публикува в продукт без разрешение.
- **Day31 Manga V1:** негeнеративен baseline, полезен за сравнението, но не очакваме да прерисува лицето.
- **Няма** осигурен модел, GPU, 30 оригинални тестови снимки или реално сравнително измерване в този архив. Никоя таблица не твърди, че определен генератор вече е победител.
- Избягвай точно имитиране на защитен стил на конкретен съвременен автор; обща оригинална японска manga е достатъчна.

Виж `docs/day32-ai-model-experiment.md` за научните източници, решенията за Ден 33 и протокола на тестовете.
