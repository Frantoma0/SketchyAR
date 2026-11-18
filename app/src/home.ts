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

  // Figma is a 385×835 DESIGN frame, not a viewport-height instruction.
  // Its content has a fixed aspect ratio. If the visible iOS PWA viewport is
  // shorter, Home scrolls, instead of shrinking and clipping the bottom row.
  // Most importantly, do not force screen.height onto the scroll container:
  // screen.height may include space that visualViewport currently cannot show.
  const fitFigmaFrame = (): void => {
    const width = Math.max(1, stage.getBoundingClientRect().width);
    const scale = width / 385;
    stage.style.setProperty('--home-font-scale', String(scale));
    stage.style.setProperty('--home-design-gap', `${20 * scale}px`);
    D.log('debug', 'home.layout', 'figma-scroll-fit', {
      stageWidth: Math.round(width),
      stageHeight: Math.round(stage.getBoundingClientRect().height),
      viewportHeight: window.innerHeight,
      visualHeight: window.visualViewport?.height ?? null,
      scrollHeight: home.scrollHeight,
      scrollClientHeight: home.clientHeight,
      designGap: Math.round(20 * scale * 100) / 100,
    });
  };
  try { fitFigmaFrame(); }
  catch (error) { D.log('warn', 'home', 'figma fit fallback', error); }
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
    if (active) home.scrollTop = 0;
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
