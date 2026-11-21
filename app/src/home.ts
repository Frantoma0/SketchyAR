/** Figma-based Home screen. Uses the user's exported graphite images as independent assets.
 *  385×835 is a design coordinate system, not an assumption about the real safe area.
 *  Never draw an artificial Dynamic Island or phone bezel on the actual iPhone.
 */
import * as D from './diagnostics';
import { initOfflineStatus } from './offline-status';
import { initDay16BackupUI } from './day16-backup-ui';
import { initDay17EditPlaceholder } from './day17-sketch-placeholder';
import { registerCameraSketchEditor } from './day4';
import { getProjectImage } from './storage/project-store';
import { listProjectThumbnails, openProjectDB, upgradeLegacyThumbnails, renameImageProject, deleteImageProject, type ProjectThumbnail } from './storage/project-store';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function initHome(openDrawing: () => Promise<void>, openSaved: (id: string) => Promise<void>): void {
  const home = el<HTMLElement>('sketchy-home');
  const developer = el<HTMLElement>('developer-screen');
  const note = el<HTMLElement>('home-message');
  const group = el<HTMLElement>('sketchy-home-group');
  const gallery = home.querySelector<HTMLElement>('.home-project-grid')!;
  const dialogBackdrop = el<HTMLElement>('home-project-dialog');
  const dialog = dialogBackdrop.querySelector<HTMLElement>('.project-dialog')!;
  const dialogTitle = el<HTMLElement>('project-dialog-title');
  const dialogDescription = el<HTMLElement>('project-dialog-description');
  const dialogError = el<HTMLElement>('project-dialog-error');
  const renameForm = el<HTMLFormElement>('project-rename-form');
  const renameInput = el<HTMLInputElement>('project-rename-input');
  const deleteView = el<HTMLElement>('project-delete-confirm');
  const closeButton = el<HTMLButtonElement>('project-dialog-close');
  const deleteButton = el<HTMLButtonElement>('project-delete-yes');
  const renameSave = el<HTMLButtonElement>('project-rename-save');
  let selected: ProjectThumbnail['project'] | null = null;
  let returnFocus: HTMLElement | null = null;
  let busy = false;
  let focusAfterRenameId: string | null = null;
  type DialogMode = 'rename' | 'delete';
  function setDialogMode(mode: DialogMode): void {
    renameForm.hidden = mode !== 'rename';
    deleteView.hidden = mode !== 'delete';
    dialogError.hidden = true;
    dialogError.textContent = '';
    dialogTitle.textContent = mode === 'rename' ? 'Преименуване' : 'Изтриване на проект';
    dialogDescription.textContent = selected?.title ?? '';
    if (mode === 'rename') { renameInput.value = selected?.title ?? ''; renameInput.focus(); }
    else deleteButton.focus();
  }
  function closeProjectDialog(): void {
    if (busy) return;
    dialogBackdrop.hidden = true;
    selected = null;
    const previousFocus = returnFocus;
    returnFocus = null;
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  function showProjectDialog(project: ProjectThumbnail['project'], trigger: HTMLElement, mode: DialogMode): void {
    selected = project;
    returnFocus = trigger;
    dialogBackdrop.hidden = false;
    setDialogMode(mode);
  }
  closeButton.addEventListener('click', closeProjectDialog);
  dialogBackdrop.addEventListener('click', (event) => {
    if (event.target === dialogBackdrop) closeProjectDialog();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeProjectDialog(); }
    if (event.key !== 'Tab') return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])')]
      .filter(node => !node.closest('[hidden]') && node.getClientRects().length > 0);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  el<HTMLButtonElement>('project-rename-cancel').addEventListener('click', closeProjectDialog);
  el<HTMLButtonElement>('project-delete-cancel').addEventListener('click', closeProjectDialog);
  renameForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selected || busy) return;
    busy = true;
    renameSave.disabled = true;
    closeButton.disabled = true;
    try {
      const project = await renameImageProject(selected.id, renameInput.value);
      D.log('info', 'day7', 'project.renamed', { projectId: project.id });
      busy = false;
      closeProjectDialog();
      focusAfterRenameId = project.id;
      document.dispatchEvent(new Event('sketchyar:projects:changed'));
      toast('Проектът е преименуван.');
    } catch (error) {
      dialogError.textContent = String(error);
      dialogError.hidden = false;
      D.log('error', 'day7', 'project.rename.failed', { message: String(error) });
    } finally { busy = false; renameSave.disabled = false; closeButton.disabled = false; }
  });
  deleteButton.addEventListener('click', async () => {
    if (!selected || busy) return;
    busy = true;
    deleteButton.disabled = true;
    closeButton.disabled = true;
    const projectId = selected.id;
    try {
      const stats = await deleteImageProject(projectId);
      D.log('info', 'day7', 'project.deleted', { projectId, ...stats });
      busy = false;
      closeProjectDialog();
      document.dispatchEvent(new Event('sketchyar:projects:changed'));
      toast('Проектът и свързаните му данни са изтрити.');
    } catch (error) {
      dialogError.textContent = String(error);
      dialogError.hidden = false;
      D.log('error', 'day7', 'project.delete.failed', { projectId, message: String(error) });
    } finally { busy = false; deleteButton.disabled = false; closeButton.disabled = false; }
  });

  // Keep the same Figma layout in Safari; in the installed PWA, the status-bar
  // meta requests edge-to-edge coverage. This is diagnostic only: do not force
  // screen.height as a CSS layout height or shift the controls conditionally.
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  document.documentElement.dataset.sketchyDisplay = standalone ? 'standalone' : 'browser';

  // Public asset URL resolves to /SketchyAR/ui/... on GitHub Pages and /ui/ on Vite dev.
  // Do not put ./ui/... in src/styles.css: relative URLs there resolve against src/.
  const wallpaperURL = new URL(`${import.meta.env.BASE_URL}ui/home-background.png`, document.baseURI).href;
  document.documentElement.style.setProperty('--sketchy-home-image', `url("${wallpaperURL}")`);

  let messageTimer: number | undefined;
  let layoutFrame = 0;

  // Figma content: 351.43 wide; heights sum to 643 design px plus 5 gaps (new, load, heading,
  // polaroid rows, footer). Every gap is exactly GAP CSS px, so sections are scaled and gaps are not.
  const designWidth = 351.43;
  const designSections = 643;
  const gapCount = 5;
  const GAP = 20; // CSS px between sections
  const hInset = 10;
  // Home Screen: no browser UI, so the block sits lower (20 px below the status bar, 20 px above the
  // home indicator). Safari tab: iOS 26 draws a floating address bar over the bottom of the page; there is
  // no API for its height, so a fixed reserve keeps the last row clear of it.
  const SAFARI_BOTTOM_RESERVE = 96;
  const TOP_EDGE = 12;
  const BOTTOM_EDGE = 4;

  const safeProbe = document.createElement('div');
  safeProbe.setAttribute('aria-hidden', 'true');
  safeProbe.style.cssText = [
    'position:absolute', 'visibility:hidden', 'pointer-events:none',
    'width:0', 'height:0',
    'padding-top:env(safe-area-inset-top,0px)',
    'padding-right:env(safe-area-inset-right,0px)',
    'padding-bottom:env(safe-area-inset-bottom,0px)',
    'padding-left:env(safe-area-inset-left,0px)',
  ].join(';');
  home.appendChild(safeProbe);

  function safePx(text: string): number {
    const value = Number.parseFloat(text);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  function fitHome(): void {
    if (home.hidden) return;
    document.documentElement.style.minHeight = `${window.screen.height}px`;
    const rect = home.getBoundingClientRect();
    const styles = getComputedStyle(safeProbe);
    const safeTop = safePx(styles.paddingTop);
    const safeBottom = safePx(styles.paddingBottom);
    const safeLeft = safePx(styles.paddingLeft);
    const safeRight = safePx(styles.paddingRight);
    const visualWidth = window.visualViewport?.width ?? rect.width;
    const visualHeight = window.visualViewport?.height ?? rect.height;
    const vw = Math.max(1, Math.min(rect.width, visualWidth));
    const vh = Math.max(1, Math.min(rect.height, visualHeight));
    const topClear = safeTop + (standalone ? TOP_EDGE : 16);
    const bottomClear = standalone ? safeBottom + BOTTOM_EDGE : Math.max(safeBottom, SAFARI_BOTTOM_RESERVE);
    const availableH = Math.max(1, vh - topClear - bottomClear);
    const widthScale = Math.max(0.1, (vw - safeLeft - safeRight - 2 * hInset) / designWidth);
    const heightScale = Math.max(0.1, (availableH - gapCount * GAP) / designSections);
    const scale = Math.min(widthScale, heightScale);
    const blockH = designSections * scale + gapCount * GAP;
    const left = safeLeft + (vw - safeLeft - safeRight - designWidth * scale) / 2;
    // Home Screen anchors to the bottom edge (lower); Safari anchors to the top (room for the link).
    const top = topClear + (standalone ? availableH - blockH : 0);

    group.style.setProperty('--g', `${(GAP / scale).toFixed(3)}px`);
    group.style.left = `${left}px`;
    group.style.top = `${top}px`;
    group.style.transform = `scale(${scale})`;

    D.log('debug', 'home.layout', 'figma-safe-fit', {
      designWidth, designSections, gapCss: GAP, topClear, bottomClear, availableH: Math.round(availableH), blockH: Math.round(blockH),
      contentScale: Number(scale.toFixed(4)),
      contentX: Math.round(left), contentY: Math.round(top),
      contentBottom: Math.round(top + blockH),
      clientWidth: Math.round(rect.width), clientHeight: Math.round(rect.height),
      visualWidth: Math.round(visualWidth), visualHeight: Math.round(visualHeight),
      safeTop, safeBottom, safeLeft, safeRight,
      scrollHeight: home.scrollHeight, scrollClientHeight: home.clientHeight,
      displayMode: standalone ? 'standalone' : 'browser',
      screenHeight: window.screen.height, innerHeight: window.innerHeight,
      rootHeight: Math.round(document.documentElement.getBoundingClientRect().height),
      statusBarMeta: document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
    });
  }

  function scheduleFit(): void {
    if (layoutFrame) window.cancelAnimationFrame(layoutFrame);
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = 0;
      try { fitHome(); } catch (error) { D.log('warn', 'home', 'figma fit failed', error); }
    });
  }
  window.addEventListener('resize', scheduleFit, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
  window.addEventListener('pageshow', scheduleFit, { passive: true });
  document.fonts.ready.then(scheduleFit, scheduleFit);

  function toast(message: string): void {
    note.textContent = message;
    note.hidden = false;
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { note.hidden = true; }, 4600);
  }
  let galleryGeneration = 0;
  let migrationPromise: Promise<number> | null = null;
  let pictureURLs: string[] = [];
  let cachedCards: ProjectThumbnail[] = [];
  const sketchEditor = initDay17EditPlaceholder();
  // Day 21: the active camera remains underneath the read-only Generator overlay.
  // Fetch the project fresh from IndexedDB (the gallery cache may be outdated).
  registerCameraSketchEditor(async (projectId, trigger, stillCurrent, onClosed) => {
    try {
      const { project } = await getProjectImage(projectId);
      if (!stillCurrent()) return false;
      return sketchEditor.open(project, trigger, 'edit-from-camera', onClosed);
    } catch (error) {
      D.log('warn', 'day21', 'camera.edit.source.failed', { projectId, message: String(error) });
      return false;
    }
  });

  function placeholder(): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'home-project-tile';
    tile.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('img');
    frame.src = `${import.meta.env.BASE_URL}ui/polaroid.png`;
    frame.alt = '';
    tile.appendChild(frame);
    return tile;
  }
  async function refreshGallery(): Promise<void> {
    const generation = ++galleryGeneration;
    try {
      migrationPromise ??= upgradeLegacyThumbnails().catch(error => {
        D.log('warn', 'day5', 'thumbnail.migration.failed', { message: String(error) });
        return 0;
      });
      const migrated = await migrationPromise;
      if (migrated) D.log('info', 'day5', 'thumbnail.migrated', { count: migrated });
      if (generation !== galleryGeneration) return;
      const cards = await listProjectThumbnails();
      if (generation !== galleryGeneration) return;
      cachedCards = cards;
      const nextURLs: string[] = [];
      const fragment = document.createDocumentFragment();
      cards.forEach(({ project, thumbnail, displayAsset, displayKind }) => {
        const tile = document.createElement('div');
        tile.className = 'home-project-tile home-project-saved';
        const open = document.createElement('button');
        open.type = 'button';
        open.className = 'home-project-open';
        open.title = project.title;
        open.setAttribute('aria-label', `Отвори ${project.title}`);
        const visibleAsset = displayAsset ?? thumbnail;
        if (visibleAsset?.blob) {
          const imageWindow = document.createElement('span');
          imageWindow.className = 'home-project-photo-window';
          imageWindow.setAttribute('aria-hidden', 'true');
          const image = document.createElement('img');
          const objectURL = URL.createObjectURL(visibleAsset.blob);
          nextURLs.push(objectURL);
          image.src = objectURL;
          image.alt = '';
          image.className = 'home-project-preview';
          // Transparent Sketch PNG is fitted fully on the paper-colored window;
          // photo thumbnails retain their existing cropped Figma presentation.
          if (displayKind === 'sketch') image.classList.add('home-project-preview-sketch');
          imageWindow.append(image);
          open.append(imageWindow);
        }
        const frame = document.createElement('img');
        frame.className = 'home-project-frame';
        frame.src = `${import.meta.env.BASE_URL}ui/polaroid.png`;
        frame.alt = '';
        open.append(frame);
        open.addEventListener('click', () => void openSaved(project.id));
        // Four independent sibling actions: photo=resume, title=rename, pencil=edit,
        // bin=confirm delete. Never nest a button inside the photo button.
        const caption = document.createElement('button');
        caption.type = 'button';
        caption.className = 'home-project-caption';
        caption.dataset.projectId = project.id;
        caption.textContent = project.title;
        caption.title = `Преименувай ${project.title}`;
        caption.setAttribute('aria-label', `Преименувай проекта ${project.title}`);
        caption.addEventListener('click', () => showProjectDialog(project, caption, 'rename'));
        const pencil = document.createElement('button');
        pencil.type = 'button';
        pencil.className = 'home-project-edit-trigger';
        pencil.title = `Промени скицата за ${project.title}`;
        pencil.setAttribute('aria-label', `Промени скицата за проекта ${project.title}`);
        const pencilIcon = document.createElement('img');
        pencilIcon.src = `${import.meta.env.BASE_URL}ui/project-edit-pencil.svg`;
        pencilIcon.alt = '';
        pencilIcon.setAttribute('aria-hidden', 'true');
        pencil.append(pencilIcon);
        pencil.addEventListener('click', () => sketchEditor.open(project, pencil));
        // Confirm before deleting; dependent records are removed atomically.
        const trash = document.createElement('button');
        trash.type = 'button';
        trash.className = 'home-project-delete-trigger';
        trash.title = `Изтрий ${project.title}`;
        trash.setAttribute('aria-label', `Изтрий проекта ${project.title}`);
        const trashIcon = document.createElement('img');
        trashIcon.src = `${import.meta.env.BASE_URL}ui/bin.svg`;
        trashIcon.alt = '';
        trashIcon.setAttribute('aria-hidden', 'true');
        trash.append(trashIcon);
        trash.addEventListener('click', () => showProjectDialog(project, trash, 'delete'));
        tile.append(open, caption, pencil, trash);
        fragment.append(tile);
      });
      for (let index = cards.length; index < 4; index++) fragment.append(placeholder());
      const previousScroll = gallery.scrollTop;
      gallery.replaceChildren(fragment);
      if (focusAfterRenameId !== null) {
        const id = focusAfterRenameId;
        focusAfterRenameId = null;
        [...gallery.querySelectorAll<HTMLButtonElement>('.home-project-caption')]
          .find(button => button.dataset.projectId === id)?.focus();
      }
      // The header and footer stay fixed; only the inner two-column gallery
      // is scrollable after a fifth project appears.
      gallery.dataset.scrollable = String(cards.length > 4);
      gallery.scrollTop = Math.min(previousScroll, Math.max(0, gallery.scrollHeight - gallery.clientHeight));
      pictureURLs.forEach(URL.revokeObjectURL);
      pictureURLs = nextURLs;
      gallery.setAttribute('aria-label', `Стари проекти: ${cards.length}`);
      D.log('info', 'day5', 'project.gallery.loaded', { count: cards.length });
    } catch (error) {
      D.log('warn', 'day5', 'project.gallery.failed', { message: String(error) });
      toast('Локалните проекти временно не могат да бъдат прочетени. Виж диагностиката.');
    }
  }
  document.addEventListener('sketchyar:projects:changed', () => void refreshGallery());
  void openProjectDB().then(() => refreshGallery()).catch(error => {
    D.log('warn', 'day5', 'storage.unavailable', { message: String(error) });
    toast('Неуспешно отваряне на локалното хранилище.');
  });
  const setHome = (active: boolean): void => {
    home.hidden = !active;
    developer.hidden = active;
    document.body.classList.toggle('sketchy-home-active', active);
    document.documentElement.classList.toggle('sketchy-home-active', active);
    document.documentElement.style.minHeight = active ? `${window.screen.height}px` : '';
    if (active) { home.scrollTop = 0; scheduleFit(); void refreshGallery(); }
    else {
      if (!dialogBackdrop.hidden) closeProjectDialog();
      sketchEditor.close();
    }
  };
  setHome(true);

  el<HTMLButtonElement>('home-new-project').addEventListener('click', () => {
    D.log('info', 'home', 'new-drawing');
    void openDrawing();
  });
  el<HTMLButtonElement>('home-load-project').addEventListener('click', () => {
    if (cachedCards.length === 0) {
      toast('Все още нямаш запазени рисунки. Избери „Нова рисунка“.');
      return;
    }
    if (cachedCards.length === 1) { void openSaved(cachedCards[0].project.id); return; }
    gallery.scrollTop = 0;
    gallery.querySelector<HTMLButtonElement>('.home-project-open')?.focus();
    toast('Избери полароид, за да отвориш съответния проект.');
  });
  const closeOfflinePanel = initOfflineStatus();
  const backupUI = initDay16BackupUI(() => setHome(false));
  el<HTMLButtonElement>('developer-back-home').addEventListener('click', () => {
    setHome(true);
    D.log('info', 'home', 'return-from-diagnostics');
  });
  // The Drawing screen lives outside the hidden developer container.
  document.addEventListener('sketchyar:drawing:opened', () => {
    closeOfflinePanel();
    backupUI.close();
    sketchEditor.close();
    home.hidden = true;
    document.body.classList.remove('sketchy-home-active');
    document.documentElement.classList.remove('sketchy-home-active');
  });
  document.addEventListener('sketchyar:drawing:closed', () => {
    if (developer.hidden) setHome(true);
  });
  D.log('info', 'home', 'Figma-based home screen ready');
}
