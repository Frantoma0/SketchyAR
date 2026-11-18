/** Figma-based Home screen. Uses the user's exported graphite images as independent assets.
 *  385×835 is a design coordinate system, not an assumption about the real safe area.
 *  Never draw an artificial Dynamic Island or phone bezel on the actual iPhone.
 */
import * as D from './diagnostics';
import { initOfflineStatus } from './offline-status';

const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function initHome(openDrawing: () => Promise<void>): void {
  const home = el<HTMLElement>('sketchy-home');
  const developer = el<HTMLElement>('developer-screen');
  const note = el<HTMLElement>('home-message');
  const group = el<HTMLElement>('sketchy-home-group');
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
  const setHome = (active: boolean): void => {
    home.hidden = !active;
    developer.hidden = active;
    document.body.classList.toggle('sketchy-home-active', active);
    document.documentElement.classList.toggle('sketchy-home-active', active);
    document.documentElement.style.minHeight = active ? `${window.screen.height}px` : '';
    if (active) { home.scrollTop = 0; scheduleFit(); }
  };
  setHome(true);

  el<HTMLButtonElement>('home-new-project').addEventListener('click', () => {
    D.log('info', 'home', 'new-drawing');
    void openDrawing();
  });
  el<HTMLButtonElement>('home-load-project').addEventListener('click', () => {
    toast('Зареждането на запазени проекти ще бъде добавено с локалната база данни. Засега избери „Нова рисунка“.');
    D.log('info', 'home', 'load-project-not-yet-available');
  });
  const closeOfflinePanel = initOfflineStatus();
  el<HTMLButtonElement>('home-save-icon').addEventListener('click', () => {
    setHome(false);
    D.log('info', 'home', 'open-developer-diagnostics');
  });
  el<HTMLButtonElement>('developer-back-home').addEventListener('click', () => {
    setHome(true);
    D.log('info', 'home', 'return-from-diagnostics');
  });
  // The Drawing screen lives outside the hidden developer container.
  document.addEventListener('sketchyar:drawing:opened', () => {
    closeOfflinePanel();
    home.hidden = true;
    document.body.classList.remove('sketchy-home-active');
    document.documentElement.classList.remove('sketchy-home-active');
  });
  document.addEventListener('sketchyar:drawing:closed', () => {
    if (developer.hidden) setHome(true);
  });
  D.log('info', 'home', 'Figma-based home screen ready');
}
