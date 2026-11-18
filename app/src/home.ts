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
  const stage = home.querySelector<HTMLElement>('.sketchy-home-canvas')!;
  let messageTimer: number | undefined;

  // Figma's 385×835 is a DESIGN coordinate system. Never subtract the
  // bottom safe-area and then scale the whole page: that leaves a strip on iOS.
  // iPhone 17 is typically 402×874 CSS pixels at DPR 3 (1206×2622 physical).
  // In standalone mode, some WebKit builds expose a shorter visualViewport,
  // even though the installed app owns the full CSS screen. Prefer screen.*
  // for standalone only; ordinary Safari tabs must respect visible viewport.
  const fitFigmaFrame = (): void => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const vw = Math.max(1, window.innerWidth, document.documentElement.clientWidth,
      standalone ? window.screen.width : 0);
    const vh = Math.max(1, window.innerHeight, document.documentElement.clientHeight,
      window.visualViewport?.height ?? 0, standalone ? window.screen.height : 0);

    // Both the paper image and the Figma-positioned elements occupy the FULL
    // screen. The Figma geometry is % based, so the nearly identical aspect
    // ratio of 385:835 and 402:874 needs no CSS transform at all.
    home.style.width = `${vw}px`;
    home.style.height = `${vh}px`;
    stage.style.width = '100%';
    stage.style.height = '100%';
    stage.style.top = '0';
    stage.style.left = '0';
    stage.style.transform = 'none';
    stage.style.setProperty('--home-font-scale', String(vw / 385));
    D.log('debug', 'home.layout', 'fullscreen-fit', {
      width: vw, height: vh, standalone,
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport?.height ?? null,
      screenHeight: window.screen.height,
    });
  };
  // Home remains visible even if the resize API cannot be queried.
  try { fitFigmaFrame(); }
  catch (error) { D.log('warn', 'home', 'fullscreen fit fallback', error); }
  window.addEventListener('resize', () => { try { fitFigmaFrame(); } catch { /* CSS fallback */ } }, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { try { fitFigmaFrame(); } catch { /* CSS fallback */ } }, { passive: true });

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
    if (active) { try { fitFigmaFrame(); } catch { /* CSS fallback */ } }
    if (active) window.scrollTo(0, 0);
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
  });
  document.addEventListener('sketchyar:drawing:closed', () => {
    if (developer.hidden) setHome(true);
  });
  D.log('info', 'home', 'Figma-based home screen ready');
}
