/** Figma-based Home screen. Uses the user's exported graphite images as independent assets.
 *  385×835 is a design coordinate system, not an assumption about the real safe area.
 *  Never draw an artificial Dynamic Island or phone bezel on the actual iPhone.
 */
import * as D from './diagnostics';

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

  // The html element itself may be 0px high (the app consists of fixed views).
  // Use an explicit rendered wallpaper height, rather than background-size: cover
  // against that zero-height root. screen.height is used ONLY for the decorative
  // wallpaper, never for layout or positioning the Figma controls.
  function updateWallpaperSize(): void {
    const height = Math.ceil(Math.max(
      window.screen.height,
      window.innerHeight,
      window.visualViewport?.height ?? 0,
      document.documentElement.clientHeight,
    ));
    document.documentElement.style.setProperty('--sketchy-wallpaper-height', `${height}px`);
  }
  updateWallpaperSize();
  window.addEventListener('resize', updateWallpaperSize, { passive: true });
  window.visualViewport?.addEventListener('resize', updateWallpaperSize, { passive: true });

  let messageTimer: number | undefined;
  let layoutFrame = 0;

  // Figma content bounds: x=17, y=72, width=351.43, height=745.
  // Fit the CONTENT rather than stretching the 385×835 outer frame.
  // Never use screen.height to size a web scroll container on iOS.
  const designWidth = 351.43;
  const designHeight = 745;
  const horizontalInset = 10;
  const verticalInset = 8;

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
    const rect = home.getBoundingClientRect();
    const styles = getComputedStyle(safeProbe);
    const safeTop = safePx(styles.paddingTop);
    const safeBottom = safePx(styles.paddingBottom);
    const safeLeft = safePx(styles.paddingLeft);
    const safeRight = safePx(styles.paddingRight);
    // iOS may expose a shorter visual viewport than the fixed layout viewport.
    // Choose the smaller positive visible size for safe placement.
    const visualWidth = window.visualViewport?.width ?? rect.width;
    const visualHeight = window.visualViewport?.height ?? rect.height;
    const vw = Math.max(1, Math.min(rect.width, visualWidth));
    const vh = Math.max(1, Math.min(rect.height, visualHeight));
    const usableWidth = Math.max(1, vw - safeLeft - safeRight - 2 * horizontalInset);
    const usableHeight = Math.max(1, vh - safeTop - safeBottom - 2 * verticalInset);
    const scale = Math.min(usableWidth / designWidth, usableHeight / designHeight);
    const left = safeLeft + horizontalInset + (usableWidth - designWidth * scale) / 2;
    const top = safeTop + verticalInset + (usableHeight - designHeight * scale) / 2;

    group.style.left = `${left}px`;
    group.style.top = `${top}px`;
    group.style.transform = `scale(${scale})`;

    D.log('debug', 'home.layout', 'figma-safe-fit', {
      designWidth, designHeight,
      contentScale: Number(scale.toFixed(4)),
      contentX: Math.round(left), contentY: Math.round(top),
      contentBottom: Math.round(top + designHeight * scale),
      clientWidth: Math.round(rect.width), clientHeight: Math.round(rect.height),
      visualWidth: Math.round(visualWidth), visualHeight: Math.round(visualHeight),
      safeTop, safeBottom, safeLeft, safeRight,
      scrollHeight: home.scrollHeight, scrollClientHeight: home.clientHeight,
      displayMode: standalone ? 'standalone' : 'browser',
      screenHeight: window.screen.height, innerHeight: window.innerHeight,
      rootHeight: Math.round(document.documentElement.getBoundingClientRect().height),
      statusBarMeta: document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
      wallpaperHeight: getComputedStyle(document.documentElement).getPropertyValue('--sketchy-wallpaper-height').trim(),

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
  el<HTMLButtonElement>('home-offline').addEventListener('click', () => {
    toast('Офлайн инсталацията се разработва за Ден 19. Дотогава приложението и Pyodide изискват интернет при стартиране.');
    D.log('info', 'home', 'offline-information');
  });
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
    home.hidden = true;
    document.body.classList.remove('sketchy-home-active');
    document.documentElement.classList.remove('sketchy-home-active');
  });
  document.addEventListener('sketchyar:drawing:closed', () => {
    if (developer.hidden) setHome(true);
  });
  D.log('info', 'home', 'Figma-based home screen ready');
}
