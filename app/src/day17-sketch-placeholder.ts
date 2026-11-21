/** Days 18–19: read-only source preview in the new graphite Generator UI shell.
 * The original image is previewed from IndexedDB; no save, no mutation, no camera.
 * The separate typed router prepares the next stages without activating a fake
 * new-drawing Generator before Generate -> Save -> Draw is truly implemented.
 */
import * as D from './diagnostics';
import { planSketchRoute, SketchRouteMachine, choosePreviewRole } from './day18-navigation';
import { getProjectImage, type ProjectRecord } from './storage/project-store';

export function initDay17EditPlaceholder(): {
  open(project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement): void;
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
  const route = new SketchRouteMachine();
  let returnFocus: HTMLElement | null = null;
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
    zoomImage.src = previewURL;
    zoomOverlay.hidden = false;
    screen.inert = true;
    document.body.classList.add('day19-zoom-open');
    zoomClose.focus();
    D.log('info', 'day19', 'image.zoom.opened');
  };
  const releasePreview = (): void => {
    closeZoom(false); // the Blob URL must not be revoked while the zoom is visible
    zoomButton.disabled = true;
    preview.removeAttribute('src');
    preview.hidden = true;
    previewEmpty.hidden = false;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  };
  const close = (): void => {
    if (screen.hidden) return;
    route.cancel();
    releasePreview();
    screen.hidden = true;
    document.body.classList.remove('day17-edit-open');
    const focus = returnFocus;
    returnFocus = null;
    if (focus?.isConnected) focus.focus();
    D.log('info', 'day17', 'sketch.edit.closed');
  };
  const open = (project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement): void => {
    if (!screen.hidden) return;
    planSketchRoute('edit-sketch', project.id);
    const token = route.openExisting('edit-sketch', project.id);
    if (token === null) return;
    returnFocus = trigger;
    projectName.textContent = project.title; // textContent avoids title injection
    previewNote.textContent = 'Зарежда се оригиналната снимка…';
    releasePreview();
    screen.hidden = false;
    screen.scrollTop = 0; // each project opens at the preview, not previous scroll position
    document.body.classList.add('day17-edit-open');
    back.focus();
    D.log('info', 'day19', 'generator.shell.opened', { projectId: project.id, readOnly: true });
    D.log('info', 'day18', 'route.enter', { intent: 'edit-sketch', projectId: project.id });
    void (async () => {
      let url: string | null = null;
      try {
        const { source } = await getProjectImage(project.id);
        if (!route.isActive(token) || screen.hidden) return;
        // The current DB schema keeps activeAssetId pointing at the SOURCE.
        // Never imply that the source preview has been processed.
        const role = choosePreviewRole(false);
        url = URL.createObjectURL(source.blob);
        if (!route.isActive(token) || screen.hidden) return;
        previewURL = url;
        url = null;
        preview.src = previewURL;
        preview.hidden = false;
        previewEmpty.hidden = true;
        zoomButton.disabled = false;
        previewNote.textContent = 'Показан е оригиналът — обработката на скици предстои.';
        D.log('info', 'day18', 'source.preview.loaded', { projectId: project.id,
          assetId: source.id, role, byteSize: source.byteSize });
      } catch (error) {
        if (route.isActive(token)) {
          previewNote.textContent = 'Оригиналът не можа да се покаже. Проектът не е променен.';
          D.log('warn', 'day18', 'source.preview.failed', { projectId: project.id, message: String(error) });
        }
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    })();
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
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [back, returnButton];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault(); controls[1].focus();
    } else if (!event.shiftKey && document.activeElement === controls[1]) {
      event.preventDefault(); controls[0].focus();
    }
  });
  return { open, close };
}
