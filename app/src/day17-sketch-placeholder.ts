/** Day 23: first real Sketch -> Save -> Draw cycle for existing projects.
 * Original source remains active; the generated PNG is a separately selected derivative.
 */
import * as D from './diagnostics';
import { planSketchRoute, SketchRouteMachine, choosePreviewRole } from './day18-navigation';
import { getProjectImage, getLatestProcessedPreview, selectProcessedAsset,
  selectOriginalForDrawing, saveProjectEditorStyle, type AssetRecord, type ProjectRecord } from './storage/project-store';
import { saveProcessedPng, type ProcessedProvenance } from './storage/day13-processed';
import { openSavedDrawing, applySketchToActiveCamera, applyOriginalToActiveCamera } from './day4';
import { generateSketchDraft, SketchDraftGate, SKETCH_V1_SETTINGS, type SketchDraftResult } from './day22-sketch-mode';
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
  const route = new SketchRouteMachine();
  let ui: SketchUiState = DEFAULT_SKETCH_UI;
  let processedURL: string | null = null;
  let sourceForSketch: { projectId: string; sourceId: string; blob: Blob } | null = null;
  let sketchBuilding = false;
  let drawBusy = false;
  let draftResult: SketchDraftResult | null = null;
  let savedProcessed: AssetRecord | null = null;
  let styleWrites: Promise<void> = Promise.resolve();
  let userTouchedStyle = false;
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
  // Serialize style changes: very fast taps cannot write an older choice after a newer one.
  // Preview selection and camera selection are intentionally distinct.
  const rememberStyle = (): void => {
    const source = sourceForSketch;
    if (!source) return;
    const next = ui.style;
    styleWrites = styleWrites.catch(() => {}).then(() =>
      saveProjectEditorStyle(source.projectId, source.sourceId, next));
    void styleWrites.catch(error => {
      D.log('error', 'day23.1', 'editor.style.save.failed', { message: String(error) });
    });
  };
  // No Manga/Comic processing yet. A second style tap clears selection and shows original.
  // An already-completed Sketch draft is reusable until this editor closes.
  const requestSketch = (): void => {
    if (sketchBuilding || !sourceForSketch || screen.hidden || ui.style !== 'sketch' || processedURL) return;
    const { projectId, sourceId, blob } = sourceForSketch;
    const ticket = sketchGate.begin(projectId, sourceId);
    sketchBuilding = true;
    updateDraw();
    previewWindow.classList.remove('day22-failed');
    previewWindow.classList.add('day22-processing');
    previewWindow.setAttribute('aria-busy', 'true');
    previewNote.textContent = 'Генерира се истинска контурна скица с Python…';
    D.log('info', 'day22', 'sketch.generate.started', { projectId, sourceId });
    void generateSketchDraft(blob).then(async result => {
      if (!sketchGate.isCurrent(ticket, projectId, sourceId) || screen.hidden) return;
      // Another tab may have replaced the active source during processing. Never
      // show a draft for that outdated source, even if this editor stayed open.
      const fresh = await getProjectImage(projectId);
      if (fresh.source.id !== sourceId || !sketchGate.isCurrent(ticket, projectId, sourceId) || screen.hidden) {
        D.log('warn', 'day22', 'sketch.generate.stale-source', { projectId, sourceId });
        return;
      }
      // Save a reusable preview as soon as Python finishes, BEFORE the user presses Draw.
      // This does not select a processed bitmap for Camera. One original source stays active.
      if (ui.style !== 'sketch') return;
      await styleWrites; // do not persist an obsolete style after an earlier tap
      if (!sketchGate.isCurrent(ticket, projectId, sourceId) || screen.hidden || ui.style !== 'sketch') return;
      const provenance: ProcessedProvenance = {
        sourceAssetId: sourceId, pipelineVersion: result.pipelineVersion,
        params: { ...SKETCH_V1_SETTINGS, input: 'grayscale-u8', maxSide: 1024 },
        modelId: 'none', backend: 'numpy-pyodide',
      };
      const stored = await saveProcessedPng(projectId, provenance,
        result.png, result.width, result.height, false);
      if (!sketchGate.isCurrent(ticket, projectId, sourceId) || screen.hidden) return;
      const url = URL.createObjectURL(stored.blob);
      if (processedURL) URL.revokeObjectURL(processedURL);
      processedURL = url;
      draftResult = null;
      savedProcessed = stored;
      if (ui.style === 'sketch') preview.src = url;
      previewNote.textContent = 'Запазена скица · задръж върху изображението за оригинала.';
      info.textContent = 'Скицата е запазена за преглед. Детайлност и линии все още не променят PNG.';
      D.log('info', 'day22', 'sketch.generate.pass', {
        projectId, sourceId, width: result.width, height: result.height,
        inkPixels: result.inkPixels, pngBytes: result.png.size,
        pipelineVersion: result.pipelineVersion, requestId: result.requestId,
        processingMs: result.processingMs, workerRequestMs: result.workerRequestMs,
        persisted: true,
      });
      updateDraw();
    }).catch(error => {
      if (!sketchGate.isCurrent(ticket, projectId, sourceId) || screen.hidden) return;
      previewNote.textContent = 'Скицата не можа да се генерира. Натисни „Скица“ за повторен опит.';
      previewWindow.classList.add('day22-failed');
      D.log('error', 'day22', 'sketch.generate.failed', {
        projectId, sourceId, message: String(error),
      });
    }).finally(() => {
      if (!sketchGate.isCurrent(ticket, projectId, sourceId)) return;
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
      rememberStyle();
    }
    if (button.dataset.line) ui = setSketchUiLine(ui, button.dataset.line);
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
    ui = setSketchUiDetail(ui, Number(detail.value)); showUI();
    D.log('info', 'day20', 'generator.detail.visual-only', { detail: ui.detail });
  });
  // Day 23.1: the preview is saved on generation, whereas ONLY Draw changes Camera selection.
  // Detail and line remain visual and are never claimed to change the PNG.
  drawButton.addEventListener('click', () => {
    if (drawBusy || screen.hidden || !sourceForSketch ||
        (ui.style !== null && ui.style !== 'sketch') ||
        (ui.style === 'sketch' && (sketchBuilding || !processedURL || !savedProcessed))) return;
    const { projectId, sourceId } = sourceForSketch;
    const png = draftResult?.png ?? savedProcessed?.blob;
    if (ui.style === 'sketch' && !png) return;
    drawBusy = true;
    updateDraw();
    info.textContent = 'Записване на скицата и подготовка на камерата…';
    void (async () => {
      await styleWrites;
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
          params: { ...SKETCH_V1_SETTINGS, input: 'grayscale-u8', maxSide: 1024 },
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
    controls.forEach(button => { if (button.dataset.style) button.disabled = true; });
    showUI(); // Before loading persisted metadata, show original without a premature choice.
    info.textContent = 'Избери стил. Скица генерира истински PNG; детайлност и линии предстоят.';
    previewNote.textContent = 'Зарежда се оригиналната снимка…';
    releasePreview();
    screen.hidden = false;
    updateDraw();
    screen.scrollTop = 0; // each project opens at the preview, not previous scroll position
    document.body.classList.add('day17-edit-open');
    back.focus();
    D.log('info', 'day19', 'generator.shell.opened', { projectId: project.id, readOnly: true });
    D.log('info', 'day18', 'route.enter', { intent, projectId: project.id });
    void (async () => {
      let url: string | null = null;
      try {
        // If the user closed and immediately reopened, wait for the prior style write.
        // No untrusted external async work is performed inside an IndexedDB transaction.
        await styleWrites.catch(error => {
          D.log('warn', 'day23.1', 'editor.style.previous-save.failed', { message: String(error) });
        });
        const { project: storedProject, source } = await getProjectImage(project.id);
        if (!route.isActive(token) || screen.hidden) return;
        // The current DB schema keeps activeAssetId pointing at the SOURCE.
        // Never imply that the source preview has been processed.
        const role = choosePreviewRole(false);
        url = URL.createObjectURL(source.blob);
        if (!route.isActive(token) || screen.hidden) return;
        previewURL = url;
        sourceForSketch = { projectId: project.id, sourceId: source.id, blob: source.blob };
        // Legacy v0.23 projects with an applied PNG had no editorStyle field.
        // Explicit null means the user consciously switched back to Original.
        if (!userTouchedStyle) ui = { ...ui,
          style: storedProject.editorStyle !== undefined ? storedProject.editorStyle :
            (storedProject.selectedProcessedAssetId ? 'sketch' : null) };
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
          const processed = await getLatestProcessedPreview(project.id, source.id);
          if (!route.isActive(token) || screen.hidden) return;
          if (processed) {
            const savedURL = URL.createObjectURL(processed.blob);
            if (!route.isActive(token) || screen.hidden) { URL.revokeObjectURL(savedURL); return; }
            processedURL = savedURL;
            savedProcessed = processed;
            // Restore the last editor selection AND the independently saved preview.
            // An explicitly deselected style still shows the original.
            showUI();
            previewNote.textContent = ui.style === 'sketch' ?
              'Запазена скица · задръж за оригинала.' : 'Оригинална снимка.';
            info.textContent = 'Запазен контур, достъпен при избор „Скица“. Детайлност и линии предстоят.';
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
