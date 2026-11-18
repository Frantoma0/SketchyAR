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

  // The Figma frame measures 385×835. iPhone 17 has its own CSS viewport;
  // scale the COMPLETE design once, instead of scaling widths and fonts separately.
  // Dynamic Island was already accommodated by the original Figma top spacing.
  const fitFigmaFrame = (): void => {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    // Keep the bottom Figma controls above the Home Indicator, even with
    // viewport-fit=cover. The paper texture itself remains full-bleed.
    const safeProbe = document.createElement('div');
    safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(safeProbe);
    const safeBottom = parseFloat(getComputedStyle(safeProbe).paddingBottom) || 0;
    safeProbe.remove();
    const usableHeight = Math.max(1, vh - safeBottom);
    const scale = Math.min(vw / 385, usableHeight / 835);
    const offsetY = Math.max(0, (usableHeight - 835 * scale) / 2);
    stage.style.top = `${offsetY}px`;
    stage.style.transform = `translateX(-50%) scale(${scale})`;
  };
  // Home is visible immediately; resize measurements are progressive enhancements.
  try { fitFigmaFrame(); }
  catch (error) { D.log('warn', 'home', 'Figma scale fallback', error); }
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
