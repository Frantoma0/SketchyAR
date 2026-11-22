/** Day 31: real Sketch/Manga drafts stay temporary until Draw commits them.
 * Preview PNGs may be cached, but Original, Camera and Home change only with Draw.
 */
import * as D from './diagnostics';
import { planSketchRoute, SketchRouteMachine, choosePreviewRole } from './day18-navigation';
import { getProjectImage, getLatestProcessedPreview, getSelectedProcessedAsset, selectProcessedAsset,
  selectOriginalForDrawing, type AssetRecord, type ProjectRecord } from './storage/project-store';
import { saveProcessedPng, type ProcessedProvenance } from './storage/day13-processed';
import { openSavedDrawing, applySketchToActiveCamera, applyOriginalToActiveCamera } from './day4';
import { generateSketchDraft, SketchDraftGate, SKETCH_V4_SETTINGS, SKETCH_QUALITY_VERSION, type SketchDraftResult } from './day22-sketch-mode';
import { generateMangaDraft, MANGA_QUALITY_VERSION } from './day31-manga-mode';
import { fitImageInAperture } from './day28-1-polaroid-fit';
import { appliedDetail } from './day29-detail-variants';
import { appliedStroke, matchesStrokeVariant } from './day30-stroke-variants';
import { isProductiveStyle, appliedProcessedStyle,
  styledVariantKey, matchesStyledVariant as matchesStyledVariantCore,
  type ProductiveStyle } from './day31-styled-variants';
import { DEFAULT_SKETCH_UI, setSketchUiDetail, setSketchUiLine, setSketchUiStyle,
  previewCanCompare, effectiveSketchLine, type SketchUiState } from './day20-sketch-state';

const engineVersion = (style: ProductiveStyle): string =>
  style === 'manga' ? MANGA_QUALITY_VERSION : SKETCH_QUALITY_VERSION;
const styledKey = styledVariantKey;
const matchesStyledVariant = (asset: AssetRecord | null | undefined, sourceId: string,
    style: ProductiveStyle, detail: SketchUiState['detail'],
    line: NonNullable<SketchUiState['line']>): boolean =>
  matchesStyledVariantCore(asset, sourceId, style, detail, line,
    SKETCH_QUALITY_VERSION, MANGA_QUALITY_VERSION);

export function initDay17EditPlaceholder(): {
  open(project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement,
    intent?: 'edit-sketch' | 'edit-from-camera', onClosed?: () => void): boolean;
  close(): void;
} {
  const screen = document.getElementById('day17-edit-screen') as HTMLElement;
  const back = document.getElementById('day17-edit-back') as HTMLButtonElement;
  const returnButton = document.getElementById('day17-edit-return') as HTMLButtonElement;
  const projectName = document.getElementById('day17-edit-project-name') as HTMLElement;
  const preview = document.getElementById('day18-original-preview') as HTMLImageElement;
  const previewEmpty = document.getElementById('day18-preview-empty') as HTMLElement;
  const previewNote = document.getElementById('day18-preview-note') as HTMLElement;
  const zoomButton = document.getElementById('day19-preview-zoom') as HTMLButtonElement;
  const zoomOverlay = document.getElementById('day19-image-lightbox') as HTMLElement;
  const zoomImage = document.getElementById('day19-lightbox-image') as HTMLImageElement;
  const zoomClose = document.getElementById('day19-lightbox-close') as HTMLButtonElement;
  const compareIndicator = document.getElementById('day20-compare-indicator') as HTMLElement;
  const controls = document.querySelectorAll<HTMLButtonElement>('#day19-generator-shell [data-style], #day19-generator-shell [data-line]');
  const detail = document.getElementById('day19-detail-slider') as HTMLInputElement;
  const detailValue = document.getElementById('day20-detail-value') as HTMLOutputElement;
  const info = document.getElementById('day17-edit-info') as HTMLElement;
  const drawButton = document.getElementById('day19-draw') as HTMLButtonElement;
  const previewWindow = document.getElementById('day18-preview-window') as HTMLElement;
  // Day 28.1: always fit BOTH decoded dimensions within the photo cut-out.
  // Unlike a height-only rule, this also contains panoramas and square images.
  // The same <img> alternates between original and PNG; 'load' remeasures each.
  const fitPolaroidPreview = (): void => {
    if (preview.hidden || !preview.naturalWidth || !preview.naturalHeight) return;
    const size = fitImageInAperture(
      preview.naturalWidth, preview.naturalHeight,
      previewWindow.clientWidth, previewWindow.clientHeight,
    );
    if (!size) return; // Hidden screen / zero layout: ResizeObserver retries.
    preview.style.width = `${size.width}px`;
    preview.style.height = `${size.height}px`;
    preview.style.left = '50%';
    preview.style.top = '50%';
    preview.style.transform = 'translate(-50%, -50%)';
  };
  preview.addEventListener('load', fitPolaroidPreview);
  // Observe the aperture, not the image: no resize feedback loop.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(fitPolaroidPreview).observe(previewWindow);
  }
  window.addEventListener('resize', fitPolaroidPreview);
  const route = new SketchRouteMachine();
  let ui: SketchUiState = DEFAULT_SKETCH_UI;
  let processedURL: string | null = null;
  let sourceForSketch: { projectId: string; sourceId: string; blob: Blob } | null = null;
  let sketchBuilding = false;
  let drawBusy = false;
  let draftResult: SketchDraftResult | null = null;
  let savedProcessed: AssetRecord | null = null;
  let userTouchedStyle = false;
  let userTouchedDetail = false;
  let userTouchedLine = false;
  // Up to 30 current-source variants (2 styles x 5 detail x 3 stroke). Only Draw applies.
  const strokeVariants = new Map<string, AssetRecord>();
  let detailDebounce: ReturnType<typeof setTimeout> | null = null;
  const cancelDetailDebounce = (): void => {
    if (detailDebounce !== null) { clearTimeout(detailDebounce); detailDebounce = null; }
  };
  let editorIntent: 'edit-sketch' | 'edit-from-camera' = 'edit-sketch';
  const sketchGate = new SketchDraftGate();
  let comparisonHeld = false;
  let comparisonTimer: ReturnType<typeof setTimeout> | null = null;
  const resetComparison = (): void => {
    if (comparisonTimer !== null) { clearTimeout(comparisonTimer); comparisonTimer = null; }
    if (comparisonHeld && processedURL && isProductiveStyle(ui.style)) preview.src = processedURL;
    else if (comparisonHeld && previewURL) preview.src = previewURL;
    comparisonHeld = false;
    compareIndicator.hidden = true;
    previewWindow.classList.remove('day20-holding-original');
  };
  const currentImageURL = (): string | null =>
    (comparisonHeld || !isProductiveStyle(ui.style) || !processedURL) ? previewURL : processedURL;
  const updateDraw = (): void => {
    const sourceReady = Boolean(sourceForSketch) && screen.hidden === false;
    const ready = !drawBusy && sourceReady &&
      (ui.style === null || (!sketchBuilding && isProductiveStyle(ui.style) &&
        Boolean(processedURL) && Boolean(savedProcessed) && (
          matchesStyledVariant(savedProcessed, sourceForSketch?.sourceId ?? '', ui.style,
            ui.detail, actualLine()) ||
          // An already APPLIED historical Sketch bitmap is still selectable
          // unchanged. A fresh style/detail/line choice always regenerates.
          (ui.style === 'sketch' && !!savedProcessed &&
            savedProcessed.pipelineVersion !== SKETCH_QUALITY_VERSION &&
            !userTouchedStyle && !userTouchedDetail && !userTouchedLine)
        )));
    drawButton.disabled = !ready;
    drawButton.setAttribute('aria-label', !ready ? 'Рисувай — изчакай готово изображение' :
      ui.style === null ? 'Рисувай с оригиналната снимка' :
        ui.style === 'manga' ? 'Рисувай с избраната манга' : 'Рисувай с избраната скица');
    drawButton.setAttribute('aria-busy', String(drawBusy));
  };
  const showUI = (): void => {
    for (const button of controls) {
      const selected = button.dataset.style === ui.style || button.dataset.line === ui.line;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('day19-chip-selected', selected && button.hasAttribute('data-style'));
      button.classList.toggle('day20-line-selected', selected && button.hasAttribute('data-line'));
      // Keep all Figma lettering ABOVE the physical SVG button background.
      const art = button.querySelector<HTMLImageElement>('.day20-choice-graphite, .day20-line-graphite');
      const src = selected ? art?.dataset.selectedSrc : art?.dataset.defaultSrc;
      if (art && src && art.getAttribute('src') !== src) art.setAttribute('src', src);
    }
    detail.value = String(ui.detail);
    detailValue.value = `${ui.detail} / 5`;
    detail.style.setProperty('--day20-detail-progress', `${(ui.detail - 1) * 25}%`);
    detail.parentElement?.style.setProperty('--day20-detail-progress', `${(ui.detail - 1) * 25}%`);
    if (previewURL && !comparisonHeld) preview.src = currentImageURL()!;
    updateDraw();
  };
  // Day 31: style + detail + line tuple identifies one real derived PNG.
  // Changing either invalidates previous Draw eligibility; applied stays intact.
  const strokeLabel = (line: NonNullable<SketchUiState['line']>): string =>
    ({ thin: 'тънки', normal: 'нормални', thick: 'дебели' })[line];
  const actualLine = (): 'thin' | 'normal' | 'thick' => effectiveSketchLine(ui.line);
  const useProcessed = (asset: AssetRecord): void => {
    if (processedURL) URL.revokeObjectURL(processedURL);
    processedURL = URL.createObjectURL(asset.blob);
    savedProcessed = asset;
    draftResult = null;
    if (isProductiveStyle(ui.style) && matchesStyledVariant(asset, sourceForSketch?.sourceId ?? '',
        ui.style, ui.detail, actualLine()))
      strokeVariants.set(styledKey(ui.style, ui.detail, actualLine()), asset);
    if (!comparisonHeld && isProductiveStyle(ui.style)) preview.src = processedURL;
    previewNote.textContent = `Детайлност ${ui.detail}/5 · ${strokeLabel(actualLine())} линии · задръж за оригинала.`;
    info.textContent = ui.style === 'manga' ?
      'Манга е готова: контури, сенки и щрихи. „Рисувай“ прилага резултата.' :
      'Контурът е готов. „Рисувай“ прилага избраното ниво към камерата и Home.';
    updateDraw();
  };
  const invalidateVariantPreview = (): void => {
    cancelDetailDebounce();
    sketchGate.cancel(); // stale worker result stays rejected for this editor visit
    sketchBuilding = false;
    previewWindow.classList.remove('day22-processing', 'day22-failed');
    previewWindow.setAttribute('aria-busy', 'false');
    if (processedURL) URL.revokeObjectURL(processedURL);
    processedURL = null;
    savedProcessed = null;
    draftResult = null;
    if (previewURL && !comparisonHeld) preview.src = previewURL;
    updateDraw();
  };
  const requestSketch = (): void => {
    if (sketchBuilding || !sourceForSketch || screen.hidden || !isProductiveStyle(ui.style) || processedURL) return;
    const { projectId, sourceId, blob } = sourceForSketch;
    const requestedStyle = ui.style;
    const requestedDetail = ui.detail;
    const requestedLine = actualLine();
    const requestedSelection = ui.line;
    const key = styledKey(requestedStyle, requestedDetail, requestedLine);
    const cached = strokeVariants.get(key);
    if (matchesStyledVariant(cached, sourceId, requestedStyle, requestedDetail, requestedLine)) {
      useProcessed(cached!);
      return;
    }
    const ticket = sketchGate.begin(projectId, sourceId);
    const isCurrent = (): boolean => sketchGate.isCurrent(ticket, projectId, sourceId) &&
      !screen.hidden && ui.style === requestedStyle && ui.detail === requestedDetail && ui.line === requestedSelection;
    sketchBuilding = true;
    updateDraw();
    previewWindow.classList.remove('day22-failed');
    previewWindow.classList.add('day22-processing');
    previewWindow.setAttribute('aria-busy', 'true');
    previewNote.textContent = `Генерира се ${requestedStyle === 'manga' ? 'манга' : 'скица'} · D${requestedDetail} · ${strokeLabel(requestedLine)} линии…`;
    const diagnosticDay = requestedStyle === 'manga' ? 'day31' : 'day30';
    const diagnosticName = requestedStyle === 'manga' ? 'manga.layers' : 'sketch.stroke';
    D.log('info', diagnosticDay, `${diagnosticName}.started`, { projectId, sourceId, style: requestedStyle, detail: requestedDetail, line: requestedLine });
    void (async () => {
      // A previously generated-but-unapplied level remains reusable after
      // leaving and reopening the editor; only Draw changes Home and Camera.
      const existing = await getLatestProcessedPreview(projectId, sourceId,
        engineVersion(requestedStyle), requestedDetail, requestedLine);
      if (!isCurrent()) return;
      const fresh = await getProjectImage(projectId);
      if (fresh.source.id !== sourceId || !isCurrent()) return;
      if (matchesStyledVariant(existing, sourceId, requestedStyle, requestedDetail, requestedLine)) {
        useProcessed(existing!);
        return;
      }
      const result = requestedStyle === 'manga'
        ? await generateMangaDraft(blob, requestedDetail, requestedLine)
        : await generateSketchDraft(blob, requestedDetail, requestedLine);
      if (!isCurrent()) return;
      const latest = await getProjectImage(projectId);
      if (latest.source.id !== sourceId || !isCurrent()) {
        D.log('warn', diagnosticDay, `${diagnosticName}.stale-source`, { projectId, sourceId });
        return;
      }
      const provenance: ProcessedProvenance = {
        sourceAssetId: sourceId, pipelineVersion: result.pipelineVersion,
        params: { ...SKETCH_V4_SETTINGS, style: requestedStyle, detail: requestedDetail, line: requestedLine,
          input: 'grayscale-u8', maxSide: 1024 },
        modelId: 'none', backend: 'numpy-pyodide',
      };
      const stored = await saveProcessedPng(projectId, provenance,
        result.png, result.width, result.height, false);
      if (!isCurrent()) return;
      useProcessed(stored);
      D.log('info', diagnosticDay, `${diagnosticName}.generated`, {
        projectId, sourceId, detail: requestedDetail, line: requestedLine,
        inkPixels: result.inkPixels, pngBytes: result.png.size,
        processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
        pipelineVersion: result.pipelineVersion, persisted: true,
      });
    })().catch(error => {
      if (!isCurrent()) return;
      previewNote.textContent = 'Неуспешна обработка. Избери стила отново.';
      previewWindow.classList.add('day22-failed');
      D.log('error', diagnosticDay, `${diagnosticName}.failed`, { projectId, sourceId,
        detail: requestedDetail, line: requestedLine, message: String(error) });
    }).finally(() => {
      if (!isCurrent()) return;
      sketchBuilding = false;
      updateDraw();
      previewWindow.classList.remove('day22-processing');
      previewWindow.setAttribute('aria-busy', 'false');
    });
  };
  controls.forEach(button => button.addEventListener('click', () => {
    if (screen.hidden || drawBusy) return;
    resetComparison();
    if (button.dataset.style) {
      const next = setSketchUiStyle(ui, button.dataset.style);
      if (next.style !== ui.style) {
        invalidateVariantPreview();
        ui = next;
        userTouchedStyle = true;
      }
    }
    if (button.dataset.line) {
      const next = setSketchUiLine(ui, button.dataset.line);
      if (next.line !== ui.line) {
        userTouchedLine = true;
        ui = next;
        if (isProductiveStyle(ui.style)) {
          invalidateVariantPreview();
          const cached = strokeVariants.get(styledKey(ui.style, ui.detail, actualLine()));
          if (matchesStyledVariant(cached, sourceForSketch?.sourceId ?? '', ui.style,
              ui.detail, actualLine())) useProcessed(cached!);
          else {
            previewNote.textContent = `Подготовка на ${strokeLabel(actualLine())} линии…`;
            detailDebounce = setTimeout(() => { detailDebounce = null; requestSketch(); }, 170);
          }
        }
      }
    }
    // Previously applied Sketch PNGs remain valid until the user selects a new one.
    // This only changes the draft; applied selection changes on Draw.
    if (button.dataset.style && isProductiveStyle(ui.style) && savedProcessed &&
        !matchesStyledVariant(savedProcessed, sourceForSketch?.sourceId ?? '', ui.style,
          ui.detail, actualLine())) invalidateVariantPreview();
    showUI();
    if (isProductiveStyle(ui.style)) {
      if (detailDebounce === null) requestSketch();
    } else if (ui.style === null) {
      info.textContent = 'Няма избран стил. Показан е оригиналът.';
      previewNote.textContent = 'Оригинална снимка.';
    } else {
      info.textContent = 'Режимът Комикс предстои. Показан е оригиналът, не симулирана обработка.';
      previewNote.textContent = 'Оригинална снимка · Комикс все още не е реализиран.';
    }
    D.log('info', 'day30', 'generator.choice', { style: ui.style, detail: ui.detail, line: ui.line });
  }));
  detail.addEventListener('input', () => {
    if (screen.hidden || drawBusy) return;
    const next = setSketchUiDetail(ui, Number(detail.value));
    if (next.detail === ui.detail) return;
    userTouchedDetail = true;
    ui = next;
    if (isProductiveStyle(ui.style)) {
      invalidateVariantPreview();
      const cached = strokeVariants.get(styledKey(ui.style, ui.detail, actualLine()));
      if (matchesStyledVariant(cached, sourceForSketch?.sourceId ?? '', ui.style,
          ui.detail, actualLine())) useProcessed(cached!);
      else {
        previewNote.textContent = `Подготовка на детайлност ${ui.detail}/5…`;
        detailDebounce = setTimeout(() => { detailDebounce = null; requestSketch(); }, 170);
      }
    }
    showUI();
    D.log('info', 'day30', 'generator.detail.requested', { detail: ui.detail });
  });
  detail.addEventListener('change', () => {
    if (detailDebounce !== null && isProductiveStyle(ui.style)) {
      cancelDetailDebounce();
      requestSketch();
    }
  });
  // Preview caches each (style, detail, line) variant; ONLY Draw applies it.
  drawButton.addEventListener('click', () => {
    if (drawBusy || screen.hidden || !sourceForSketch ||
        (ui.style !== null && !isProductiveStyle(ui.style)) ||
        (isProductiveStyle(ui.style) && (sketchBuilding || !processedURL || !savedProcessed ||
          !matchesStyledVariant(savedProcessed, sourceForSketch.sourceId, ui.style, ui.detail, actualLine()) &&
          !(ui.style === 'sketch' && savedProcessed.pipelineVersion !== SKETCH_QUALITY_VERSION &&
            !userTouchedStyle && !userTouchedDetail && !userTouchedLine)))) return;
    const { projectId, sourceId } = sourceForSketch;
    const png = draftResult?.png ?? savedProcessed?.blob;
    if (isProductiveStyle(ui.style) && !png) return;
    drawBusy = true;
    updateDraw();
    info.textContent = 'Записване на рисунката и подготовка на камерата…';
    void (async () => {
      const selectedStyle = ui.style;
      const fresh = await getProjectImage(projectId);
      if (fresh.source.id !== sourceId || screen.hidden ||
          (selectedStyle !== null && !isProductiveStyle(selectedStyle)))
        throw new Error('Оригиналът или режимът е сменен. Записът е отказан.');
      if (selectedStyle === null) {
        // Draw with no selected style always uses the pristine original.
        await selectOriginalForDrawing(projectId, sourceId);
        D.log('info', 'day23.1', 'original.selected-for-drawing', { projectId, sourceId });
        if (editorIntent === 'edit-from-camera') {
          const applied = await applyOriginalToActiveCamera(projectId, sourceId, fresh.source.blob);
          if (!applied) throw new Error('Камерата е сменена; оригиналът е избран за следващо отваряне.');
          drawBusy = false;
          close();
        } else {
          drawBusy = false;
          close();
          await openSavedDrawing(projectId);
        }
        return;
      }
      if (draftResult) {
        const provenance: ProcessedProvenance = {
          sourceAssetId: sourceId, pipelineVersion: draftResult.pipelineVersion,
          params: { ...SKETCH_V4_SETTINGS, style: selectedStyle, detail: ui.detail, line: actualLine(), input: 'grayscale-u8', maxSide: 1024 },
          modelId: 'none', backend: 'numpy-pyodide',
        };
        savedProcessed = await saveProcessedPng(projectId, provenance,
          draftResult.png, draftResult.width, draftResult.height, true, ui.line);
        draftResult = null; // exact saved Blob remains in savedProcessed
      } else if (savedProcessed) {
        await selectProcessedAsset(projectId, sourceId, savedProcessed.id, ui.line);
      }
      if (!savedProcessed) throw new Error('Липсва запазена скица.');
      D.log('info', selectedStyle === 'manga' ? 'day31' : 'day23',
        selectedStyle === 'manga' ? 'manga.saved-and-selected' : 'sketch.saved-and-selected', {
        projectId, sourceId, processedAssetId: savedProcessed.id,
        originalPreserved: true, style: selectedStyle,
      });
      if (editorIntent === 'edit-from-camera') {
        // Existing camera must remain mounted and retain its exact gesture preset.
        const applied = await applySketchToActiveCamera(projectId, sourceId, savedProcessed.blob);
        if (!applied) throw new Error('Камерата е сменена. Скицата е запазена; отвори проекта от галерията.');
        drawBusy = false;
        close();
      } else {
        drawBusy = false;
        close();
        await openSavedDrawing(projectId); // reads and uses the selected PNG, not the source
      }
    })().catch(error => {
      D.log('error', ui.style === 'manga' ? 'day31' : 'day23',
        ui.style === 'manga' ? 'manga.draw.failed' : 'sketch.draw.failed',
        { projectId, sourceId, message: String(error) });
      info.textContent = `Скицата не можа да се приложи: ${String(error)}`;
    }).finally(() => { drawBusy = false; updateDraw(); });
  });
  previewWindow.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !isProductiveStyle(ui.style) || !previewCanCompare(Boolean(previewURL), Boolean(processedURL)) ||
        !zoomOverlay.hidden || screen.hidden) return;
    resetComparison();
    // A deliberate hold avoids flashing the original while simply scrolling a long screen.
    comparisonTimer = setTimeout(() => {
      comparisonTimer = null;
      if (!isProductiveStyle(ui.style) || !previewCanCompare(Boolean(previewURL), Boolean(processedURL)) || screen.hidden || !zoomOverlay.hidden) return;
      comparisonHeld = true;
      preview.src = previewURL!;
      compareIndicator.hidden = false;
      previewWindow.classList.add('day20-holding-original');
      D.log('info', 'day20', 'compare.original.held');
    }, 160);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'] as const)
    previewWindow.addEventListener(type, resetComparison);
  // Keyboard parity without adding a separate comparison button.
  previewWindow.addEventListener('keydown', event => {
    if (event.code === 'Space' && isProductiveStyle(ui.style) && processedURL && !event.repeat) {
      event.preventDefault(); resetComparison(); comparisonHeld = true;
      preview.src = previewURL!; compareIndicator.hidden = false;
    }
  });
  previewWindow.addEventListener('keyup', event => {
    if (event.code === 'Space') { event.preventDefault(); resetComparison(); }
  });
  previewWindow.addEventListener('contextmenu', event => { if (processedURL) event.preventDefault(); });
  previewWindow.addEventListener('dragstart', event => event.preventDefault());
  // The pointer can be released outside the preview, including after an iOS edge swipe.
  window.addEventListener('pointerup', resetComparison);
  window.addEventListener('pointercancel', resetComparison);
  window.addEventListener('blur', resetComparison);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetComparison(); });
  let returnFocus: HTMLElement | null = null;
  let afterClose: (() => void) | null = null;
  let previewURL: string | null = null;

  // Zoom reuses the already-loaded source Blob URL, never fetches or writes data.
  const closeZoom = (restoreFocus = true): void => {
    if (zoomOverlay.hidden) return;
    zoomOverlay.hidden = true;
    zoomImage.removeAttribute('src');
    screen.inert = false;
    document.body.classList.remove('day19-zoom-open');
    if (restoreFocus && !screen.hidden) zoomButton.focus();
    D.log('info', 'day19', 'image.zoom.closed');
  };
  const openZoom = (): void => {
    if (!previewURL || preview.hidden || screen.hidden || !zoomOverlay.hidden) return;
    resetComparison();
    zoomImage.src = currentImageURL()!;
    zoomOverlay.hidden = false;
    screen.inert = true;
    document.body.classList.add('day19-zoom-open');
    zoomClose.focus();
    D.log('info', 'day19', 'image.zoom.opened');
  };
  const releasePreview = (): void => {
    cancelDetailDebounce();
    strokeVariants.clear();
    closeZoom(false); // the Blob URL must not be revoked while the zoom is visible
    sketchGate.cancel();
    sourceForSketch = null;
    sketchBuilding = false;
    draftResult = null;
    savedProcessed = null;
    previewWindow.classList.remove('day22-processing', 'day22-failed');
    previewWindow.setAttribute('aria-busy', 'false');
    resetComparison();
    zoomButton.disabled = true;
    preview.removeAttribute('src');
    preview.hidden = true;
    // No stale inline dimensions during loading of the next project.
    preview.style.removeProperty('width');
    preview.style.removeProperty('height');
    preview.style.removeProperty('top');
    preview.style.removeProperty('left');
    preview.style.removeProperty('transform');
    previewEmpty.hidden = false;
    if (previewURL) URL.revokeObjectURL(previewURL);
    if (processedURL) URL.revokeObjectURL(processedURL);
    previewURL = null;
    processedURL = null;
    updateDraw();
  };
  const close = (): void => {
    if (screen.hidden || drawBusy) return;
    route.cancel();
    releasePreview();
    screen.hidden = true;
    document.body.classList.remove('day17-edit-open');
    const focus = returnFocus;
    returnFocus = null;
    const callback = afterClose;
    afterClose = null;
    callback?.(); // release camera inert before restoring focus
    if (focus?.isConnected) focus.focus();
    // Re-render Home using only the last APPLIED asset ID; an editor preview
    // or a cached new PNG must never change the polaroid before Draw.
    document.dispatchEvent(new Event('sketchyar:projects:changed'));
    D.log('info', 'day17', 'sketch.edit.closed');
  };
  const open = (project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement,
    intent: 'edit-sketch' | 'edit-from-camera' = 'edit-sketch', onClosed?: () => void): boolean => {
    if (!screen.hidden) return false;
    planSketchRoute(intent, project.id);
    const token = route.openExisting(intent, project.id);
    if (token === null) return false;
    afterClose = onClosed ?? null;
    editorIntent = intent;
    returnFocus = trigger;
    projectName.textContent = project.title; // textContent avoids title injection
    ui = DEFAULT_SKETCH_UI;
    userTouchedStyle = false;
    userTouchedDetail = false;
    userTouchedLine = false;
    controls.forEach(button => { if (button.dataset.style) button.disabled = true; });
    showUI(); // Before loading persisted metadata, show original without a premature choice.
    info.textContent = 'Избери „Скица“ или „Манга“, детайлност 1–5 и дебелина на линиите.';
    previewNote.textContent = 'Зарежда се оригиналната снимка…';
    releasePreview();
    screen.hidden = false;
    fitPolaroidPreview();
    updateDraw();
    screen.scrollTop = 0; // each project opens at the preview, not previous scroll position
    document.body.classList.add('day17-edit-open');
    back.focus();
    D.log('info', 'day19', 'generator.shell.opened', { projectId: project.id, readOnly: false });
    D.log('info', 'day18', 'route.enter', { intent, projectId: project.id });
    void (async () => {
      let url: string | null = null;
      try {
        const { project: storedProject, source } = await getProjectImage(project.id);
        if (!route.isActive(token) || screen.hidden) return;
        // The current DB schema keeps activeAssetId pointing at the SOURCE.
        // Never imply that the source preview has been processed.
        const role = choosePreviewRole(false);
        url = URL.createObjectURL(source.blob);
        if (!route.isActive(token) || screen.hidden) return;
        previewURL = url;
        sourceForSketch = { projectId: project.id, sourceId: source.id, blob: source.blob };
        // Restore only the style actually applied by Draw. Previous v0.24
        // versions saved preview taps to editorStyle, so that field alone is
        // NOT proof that Sketch was applied. The Camera asset ID is authoritative.
        if (!userTouchedStyle && !storedProject.selectedProcessedAssetId) ui = { ...ui, style: null };
        url = null;
        preview.src = previewURL;
        preview.hidden = false;
        previewEmpty.hidden = true;
        zoomButton.disabled = false;
        previewNote.textContent = 'Оригинална снимка · все още няма избрана обработка.';
        D.log('info', 'day18', 'source.preview.loaded', { projectId: project.id,
          assetId: source.id, role, byteSize: source.byteSize });
        // A selected historical PNG remains valid; new settings use exact variants.
        try {
          // If Draw already selected a PNG, preview that EXACT bitmap, not
          // a newer cached draft that the user never applied.
          const candidate = storedProject.selectedProcessedAssetId
            ? await getSelectedProcessedAsset(storedProject, source)
            : await getLatestProcessedPreview(project.id, source.id, SKETCH_QUALITY_VERSION, ui.detail, actualLine());
          const processed = candidate && (storedProject.selectedProcessedAssetId ||
            matchesStrokeVariant(candidate, source.id, ui.detail, actualLine(), SKETCH_QUALITY_VERSION))
            ? candidate : null;
          if (!route.isActive(token) || screen.hidden) return;
          if (processed) {
            const savedURL = URL.createObjectURL(processed.blob);
            if (!route.isActive(token) || screen.hidden) { URL.revokeObjectURL(savedURL); return; }
            processedURL = savedURL;
            savedProcessed = processed;
            if (storedProject.selectedProcessedAssetId && !userTouchedStyle) ui = { ...ui,
              style: appliedProcessedStyle(processed) };
            // An APPLIED detail tier is persisted in the exact PNG's provenance.
            // Legacy V1..V4 images without this field correspond to default D3.
            if (storedProject.selectedProcessedAssetId && !userTouchedDetail) {
              ui = setSketchUiDetail(ui, appliedDetail(processed));
              if (!userTouchedLine) ui = { ...ui,
                line: storedProject.editorLine === undefined ? appliedStroke(processed) : storedProject.editorLine };
            }
            if (isProductiveStyle(ui.style) &&
                matchesStyledVariant(processed, source.id, ui.style, ui.detail, actualLine()))
              strokeVariants.set(styledKey(ui.style, ui.detail, actualLine()), processed);
            // Restore the last applied selection and separately saved preview.
            // An explicitly deselected style still shows the original.
            if ((userTouchedStyle || userTouchedDetail || userTouchedLine) && isProductiveStyle(ui.style) &&
                !matchesStyledVariant(processed, source.id, ui.style, ui.detail, actualLine())) {
              invalidateVariantPreview();
            }
            showUI();
            previewNote.textContent = isProductiveStyle(ui.style) ?
              (ui.style === 'manga' ? 'Запазена манга · задръж за оригинала.' :
                'Запазена скица · задръж за оригинала.') : 'Оригинална снимка.';
            info.textContent = 'Запазен контур. Детайлността 1–5 и дебелината променят истинския PNG.';
            D.log('info', 'day20', 'compare.processed.available', { projectId: project.id,
              assetId: processed.id });
          }
        } catch (error) {
          D.log('warn', 'day20', 'compare.processed.unavailable', { message: String(error) });
        }
        // Day 22: when no saved PNG exists, produce a REAL temporary preview.
        // The original remains pristine; no IndexedDB or camera operation occurs.
        if (route.isActive(token) && !screen.hidden) {
          controls.forEach(button => { if (button.dataset.style) button.disabled = false; });
          showUI();
          if (isProductiveStyle(ui.style) && !processedURL) requestSketch();
        }
      } catch (error) {
        if (route.isActive(token)) {
          previewNote.textContent = 'Оригиналът не можа да се покаже. Проектът не е променен.';
          D.log('warn', 'day18', 'source.preview.failed', { projectId: project.id, message: String(error) });
        }
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    })();
    return true;
  };
  zoomButton.addEventListener('click', openZoom);
  zoomClose.addEventListener('click', () => closeZoom());
  // Backdrop click also closes; a tap on the image never does.
  zoomOverlay.addEventListener('click', event => {
    if (event.target === zoomOverlay || event.target === zoomOverlay.firstElementChild) closeZoom();
  });
  zoomOverlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeZoom(); }
    else if (event.key === 'Tab') { event.preventDefault(); zoomClose.focus(); }
  });
  back.addEventListener('click', close);
  returnButton.addEventListener('click', close);
  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...screen.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
      'button:not(:disabled):not([hidden]), input:not(:disabled):not([hidden])'
    )].filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable[focusable.length - 1]?.focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault(); focusable[0]?.focus();
    }
  });
  return { open, close };
}
