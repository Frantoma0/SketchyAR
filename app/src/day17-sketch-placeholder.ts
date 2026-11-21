/** Day 24.1: editor choices remain temporary until Draw commits an applied style.
 * Preview PNGs may be cached, but Original, Camera and Home change only with Draw.
 */
import * as D from './diagnostics';
import { planSketchRoute, SketchRouteMachine, choosePreviewRole } from './day18-navigation';
import { getProjectImage, getLatestProcessedPreview, getSelectedProcessedAsset, selectProcessedAsset,
  selectOriginalForDrawing, type AssetRecord, type ProjectRecord } from './storage/project-store';
import { saveProcessedPng, type ProcessedProvenance } from './storage/day13-processed';
import { openSavedDrawing, applySketchToActiveCamera, applyOriginalToActiveCamera } from './day4';
import { generateSketchDraft, SketchDraftGate, SKETCH_V4_SETTINGS, SKETCH_QUALITY_VERSION, type SketchDraftResult } from './day22-sketch-mode';
import { fitImageInAperture } from './day28-1-polaroid-fit';
import { appliedDetail, matchesDetailVariant } from './day29-detail-variants';
import { DEFAULT_SKETCH_UI, setSketchUiDetail, setSketchUiLine, setSketchUiStyle,
  previewCanCompare, type SketchUiState } from './day20-sketch-state';

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
  // Up to five source-scoped variants for the current editor visit. Previously
  // applied bitmaps are never overwritten or replaced before Draw.
  const detailVariants = new Map<SketchUiState['detail'], AssetRecord>();
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
    if (comparisonHeld && processedURL && ui.style === 'sketch') preview.src = processedURL;
    else if (comparisonHeld && previewURL) preview.src = previewURL;
    comparisonHeld = false;
    compareIndicator.hidden = true;
    previewWindow.classList.remove('day20-holding-original');
  };
  const currentImageURL = (): string | null =>
    (comparisonHeld || ui.style !== 'sketch' || !processedURL) ? previewURL : processedURL;
  const updateDraw = (): void => {
    const sourceReady = Boolean(sourceForSketch) && screen.hidden === false;
    const ready = !drawBusy && sourceReady &&
      (ui.style === null || (!sketchBuilding && ui.style === 'sketch' &&
        Boolean(processedURL) && Boolean(savedProcessed)));
    drawButton.disabled = !ready;
    drawButton.setAttribute('aria-label', !ready ? 'Рисувай — изчакай готово изображение' :
      ui.style === null ? 'Рисувай с оригиналната снимка' : 'Рисувай с избраната скица');
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
  // Day 29: each detail level is a genuine V4 PNG, never a CSS-only effect.
  // Changing D1..D5 invalidates the previous level's Draw eligibility. A saved
  // variant can be reused, but a stale result must never appear as new detail.
  const useProcessed = (asset: AssetRecord): void => {
    if (processedURL) URL.revokeObjectURL(processedURL);
    processedURL = URL.createObjectURL(asset.blob);
    savedProcessed = asset;
    draftResult = null;
    if (matchesDetailVariant(asset, sourceForSketch?.sourceId ?? '', ui.detail,
        SKETCH_QUALITY_VERSION)) detailVariants.set(ui.detail, asset);
    if (!comparisonHeld && ui.style === 'sketch') preview.src = processedURL;
    previewNote.textContent = `Детайлност ${ui.detail}/5 · задръж за оригинала.`;
    info.textContent = 'Контурът е готов. „Рисувай“ прилага избраното ниво към камерата и Home.';
    updateDraw();
  };
  const invalidateDetailPreview = (): void => {
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
    if (sketchBuilding || !sourceForSketch || screen.hidden || ui.style !== 'sketch' || processedURL) return;
    const { projectId, sourceId, blob } = sourceForSketch;
    const requestedDetail = ui.detail;
    const cached = detailVariants.get(requestedDetail);
    if (matchesDetailVariant(cached, sourceId, requestedDetail, SKETCH_QUALITY_VERSION)) {
      useProcessed(cached!);
      return;
    }
    const ticket = sketchGate.begin(projectId, sourceId);
    const isCurrent = (): boolean => sketchGate.isCurrent(ticket, projectId, sourceId) &&
      !screen.hidden && ui.style === 'sketch' && ui.detail === requestedDetail;
    sketchBuilding = true;
    updateDraw();
    previewWindow.classList.remove('day22-failed');
    previewWindow.classList.add('day22-processing');
    previewWindow.setAttribute('aria-busy', 'true');
    previewNote.textContent = `Генерира се скица · детайлност ${requestedDetail}/5…`;
    D.log('info', 'day29', 'sketch.detail.started', { projectId, sourceId, detail: requestedDetail });
    void (async () => {
      // A previously generated-but-unapplied level remains reusable after
      // leaving and reopening the editor; only Draw changes Home and Camera.
      const existing = await getLatestProcessedPreview(projectId, sourceId,
        SKETCH_QUALITY_VERSION, requestedDetail);
      if (!isCurrent()) return;
      const fresh = await getProjectImage(projectId);
      if (fresh.source.id !== sourceId || !isCurrent()) return;
      if (existing) {
        useProcessed(existing);
        return;
      }
      const result = await generateSketchDraft(blob, requestedDetail);
      if (!isCurrent()) return;
      const latest = await getProjectImage(projectId);
      if (latest.source.id !== sourceId || !isCurrent()) {
        D.log('warn', 'day29', 'sketch.detail.stale-source', { projectId, sourceId });
        return;
      }
      const provenance: ProcessedProvenance = {
        sourceAssetId: sourceId, pipelineVersion: result.pipelineVersion,
        params: { ...SKETCH_V4_SETTINGS, detail: requestedDetail,
          input: 'grayscale-u8', maxSide: 1024 },
        modelId: 'none', backend: 'numpy-pyodide',
      };
      const stored = await saveProcessedPng(projectId, provenance,
        result.png, result.width, result.height, false);
      if (!isCurrent()) return;
      useProcessed(stored);
      D.log('info', 'day29', 'sketch.detail.generated', {
        projectId, sourceId, detail: requestedDetail,
        inkPixels: result.inkPixels, pngBytes: result.png.size,
        processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
        pipelineVersion: result.pipelineVersion, persisted: true,
      });
    })().catch(error => {
      if (!isCurrent()) return;
      previewNote.textContent = 'Неуспешна обработка. Избери „Скица“ отново.';
      previewWindow.classList.add('day22-failed');
      D.log('error', 'day29', 'sketch.detail.failed', { projectId, sourceId,
        detail: requestedDetail, message: String(error) });
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
      ui = setSketchUiStyle(ui, button.dataset.style);
      userTouchedStyle = true;
      if (ui.style !== 'sketch' && sketchBuilding) {
        sketchGate.cancel();
        sketchBuilding = false;
        previewWindow.classList.remove('day22-processing');
        previewWindow.setAttribute('aria-busy', 'false');
      }
    }
    if (button.dataset.line) ui = setSketchUiLine(ui, button.dataset.line);
    // An already APPLIED pre-Day25 sketch is still valid in Camera/Home.
    // If the user deselects then reselects Sketch, generate the new importance-aware V3
    // preview rather than silently recycling an older pipeline's bitmap.
    // This only changes the draft; applied selection changes on Draw.
    if (button.dataset.style && ui.style === 'sketch' && savedProcessed &&
        !matchesDetailVariant(savedProcessed, sourceForSketch?.sourceId ?? '', ui.detail,
          SKETCH_QUALITY_VERSION)) {
      invalidateDetailPreview();
    }
    showUI();
    if (ui.style === 'sketch') requestSketch();
    else if (ui.style === null) {
      info.textContent = 'Няма избран стил. Показан е оригиналът.';
      previewNote.textContent = 'Оригинална снимка.';
    } else {
      info.textContent = 'Манга и Комикс предстоят. Показан е оригиналът, не симулирана обработка.';
      previewNote.textContent = 'Оригинална снимка · този режим още не е реализиран.';
    }
    D.log('info', 'day22', 'generator.choice', { style: ui.style, detail: ui.detail, line: ui.line });
  }));
  detail.addEventListener('input', () => {
    if (screen.hidden || drawBusy) return;
    const next = setSketchUiDetail(ui, Number(detail.value));
    if (next.detail === ui.detail) return;
    userTouchedDetail = true;
    ui = next;
    if (ui.style === 'sketch') {
      invalidateDetailPreview();
      const cached = detailVariants.get(ui.detail);
      if (matchesDetailVariant(cached, sourceForSketch?.sourceId ?? '', ui.detail,
          SKETCH_QUALITY_VERSION)) useProcessed(cached!);
      else {
        previewNote.textContent = `Подготовка на детайлност ${ui.detail}/5…`;
        detailDebounce = setTimeout(() => { detailDebounce = null; requestSketch(); }, 170);
      }
    }
    showUI();
    D.log('info', 'day29', 'generator.detail.requested', { detail: ui.detail });
  });
  detail.addEventListener('change', () => {
    if (detailDebounce !== null && ui.style === 'sketch') {
      cancelDetailDebounce();
      requestSketch();
    }
  });
  // Preview generation caches the chosen D1..D5 variant. ONLY Draw applies it.
  // Line thickness is still visual; Day29 changes real detail, not line width.
  drawButton.addEventListener('click', () => {
    if (drawBusy || screen.hidden || !sourceForSketch ||
        (ui.style !== null && ui.style !== 'sketch') ||
        (ui.style === 'sketch' && (sketchBuilding || !processedURL || !savedProcessed ||
          (savedProcessed.pipelineVersion === SKETCH_QUALITY_VERSION && savedProcessed.params?.detail !== ui.detail)))) return;
    const { projectId, sourceId } = sourceForSketch;
    const png = draftResult?.png ?? savedProcessed?.blob;
    if (ui.style === 'sketch' && !png) return;
    drawBusy = true;
    updateDraw();
    info.textContent = 'Записване на скицата и подготовка на камерата…';
    void (async () => {
      const selectedStyle = ui.style;
      const fresh = await getProjectImage(projectId);
      if (fresh.source.id !== sourceId || screen.hidden ||
          (selectedStyle !== null && selectedStyle !== 'sketch'))
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
          params: { ...SKETCH_V4_SETTINGS, detail: ui.detail, input: 'grayscale-u8', maxSide: 1024 },
          modelId: 'none', backend: 'numpy-pyodide',
        };
        savedProcessed = await saveProcessedPng(projectId, provenance,
          draftResult.png, draftResult.width, draftResult.height, true);
        draftResult = null; // exact saved Blob remains in savedProcessed
      } else if (savedProcessed) {
        await selectProcessedAsset(projectId, sourceId, savedProcessed.id);
      }
      if (!savedProcessed) throw new Error('Липсва запазена скица.');
      D.log('info', 'day23', 'sketch.saved-and-selected', {
        projectId, sourceId, processedAssetId: savedProcessed.id,
        originalPreserved: true, style: 'sketch',
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
      D.log('error', 'day23', 'sketch.draw.failed', { projectId, sourceId, message: String(error) });
      info.textContent = `Скицата не можа да се приложи: ${String(error)}`;
    }).finally(() => { drawBusy = false; updateDraw(); });
  });
  previewWindow.addEventListener('pointerdown', event => {
    if (event.button !== 0 || ui.style !== 'sketch' || !previewCanCompare(Boolean(previewURL), Boolean(processedURL)) ||
        !zoomOverlay.hidden || screen.hidden) return;
    resetComparison();
    // A deliberate hold avoids flashing the original while simply scrolling a long screen.
    comparisonTimer = setTimeout(() => {
      comparisonTimer = null;
      if (ui.style !== 'sketch' || !previewCanCompare(Boolean(previewURL), Boolean(processedURL)) || screen.hidden || !zoomOverlay.hidden) return;
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
    if (event.code === 'Space' && ui.style === 'sketch' && processedURL && !event.repeat) {
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
    detailVariants.clear();
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
    controls.forEach(button => { if (button.dataset.style) button.disabled = true; });
    showUI(); // Before loading persisted metadata, show original without a premature choice.
    info.textContent = 'Избери „Скица“ и управлявай реалните детайли 1–5. Дебелината предстои.';
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
        if (!userTouchedStyle) ui = { ...ui,
          style: storedProject.selectedProcessedAssetId ? 'sketch' : null };
        url = null;
        preview.src = previewURL;
        preview.hidden = false;
        previewEmpty.hidden = true;
        zoomButton.disabled = false;
        previewNote.textContent = 'Оригинална снимка · все още няма избрана обработка.';
        D.log('info', 'day18', 'source.preview.loaded', { projectId: project.id,
          assetId: source.id, role, byteSize: source.byteSize });
        // A previously SAVED Day 13 PNG is the only genuine sketch we can compare yet.
        // It is NOT a result of the newly selected UI settings.
        try {
          // If Draw already selected a PNG, preview that EXACT bitmap, not
          // a newer cached draft that the user never applied.
          const candidate = storedProject.selectedProcessedAssetId
            ? await getSelectedProcessedAsset(storedProject, source)
            : await getLatestProcessedPreview(project.id, source.id, SKETCH_QUALITY_VERSION, ui.detail);
          const processed = candidate && (storedProject.selectedProcessedAssetId ||
            matchesDetailVariant(candidate, source.id, ui.detail, SKETCH_QUALITY_VERSION))
            ? candidate : null;
          if (!route.isActive(token) || screen.hidden) return;
          if (processed) {
            const savedURL = URL.createObjectURL(processed.blob);
            if (!route.isActive(token) || screen.hidden) { URL.revokeObjectURL(savedURL); return; }
            processedURL = savedURL;
            savedProcessed = processed;
            // An APPLIED detail tier is persisted in the exact PNG's provenance.
            // Legacy V1..V4 images without this field correspond to default D3.
            if (storedProject.selectedProcessedAssetId && !userTouchedDetail)
              ui = setSketchUiDetail(ui, appliedDetail(processed));
            if (matchesDetailVariant(processed, source.id, ui.detail, SKETCH_QUALITY_VERSION))
              detailVariants.set(ui.detail, processed);
            // Restore the last applied selection and separately saved preview.
            // An explicitly deselected style still shows the original.
            if (userTouchedDetail && ui.style === 'sketch' &&
                !matchesDetailVariant(processed, source.id, ui.detail, SKETCH_QUALITY_VERSION)) {
              invalidateDetailPreview();
            }
            showUI();
            previewNote.textContent = ui.style === 'sketch' ?
              'Запазена скица · задръж за оригинала.' : 'Оригинална снимка.';
            info.textContent = 'Запазен контур. Детайлността 1–5 променя истинския PNG; дебелината предстои.';
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
          if (ui.style === 'sketch' && !processedURL) requestSketch();
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
