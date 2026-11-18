/** Read-only offline status for Day 4. Actual precache manifest, SHA-256 validation
 * and install/update flow are Day 19 responsibilities. Never claim a cache is verified
 * merely because an API exists, or treat navigator.onLine as proof of connectivity.
 */
import * as D from './diagnostics';

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const formatMB = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

export function initOfflineStatus(): () => void {
  const backdrop = byId<HTMLDivElement>('home-offline-dialog');
  const dialog = backdrop.querySelector<HTMLElement>('[role="dialog"]')!;
  const opener = byId<HTMLButtonElement>('home-offline');
  const closeButton = byId<HTMLButtonElement>('offline-dialog-close');
  const checkButton = byId<HTMLButtonElement>('offline-dialog-check');
  const refreshButton = byId<HTMLButtonElement>('offline-dialog-refresh');
  const actionStatus = byId<HTMLElement>('offline-dialog-action-status');
  let previousFocus: HTMLElement | null = null;
  let generation = 0;

  async function check(): Promise<void> {
    const request = ++generation;
    checkButton.disabled = true;
    actionStatus.textContent = 'Проверявам локалните ресурси…';
    try {
      // No offline manifest yet. An empty cache is NOT a verified offline installation.
      byId('offline-core-status').textContent = 'Не е валидиран';
      byId('offline-ai-status').textContent = 'Не е инсталиран';
      byId('home-offline-indicator').dataset.coreReady = 'false';
      const storage = byId('offline-storage-status');
      const cache = byId('offline-cache-status');
      const persisted = byId('offline-persist-status');
      storage.textContent = 'Недостъпно';
      persisted.textContent = 'Неизвестно';
      cache.textContent = 'Недостъпно';

      const tasks: Promise<void>[] = [];
      if (navigator.storage?.estimate) {
        tasks.push(navigator.storage.estimate().then((estimate) => {
          if (request !== generation) return;
          if (typeof estimate.usage === 'number') {
            storage.textContent = `${formatMB(estimate.usage)} / ${typeof estimate.quota === 'number' ? formatMB(estimate.quota) : '?'}`;
          }
        }).catch((e: unknown) => { D.log('warn', 'offline', 'storage estimate unavailable', e); }));
      }
      if (navigator.storage?.persisted) {
        tasks.push(navigator.storage.persisted().then((value) => {
          if (request === generation) persisted.textContent = value ? 'Предоставено' : 'Не е предоставено';
        }).catch((e: unknown) => { D.log('warn', 'offline', 'persisted unavailable', e); }));
      }
      if ('caches' in window) {
        tasks.push((async () => {
          try {
            const names = await caches.keys();
            let count = 0;
            for (const name of names) {
              const entry = await caches.open(name);
              count += (await entry.keys()).length;
            }
            if (request === generation) cache.textContent = `${count} файла · размер непроверен`;
          } catch (e) {
            D.log('warn', 'offline', 'cache inspection unavailable', e);
          }
        })());
      }
      await Promise.all(tasks);
      if (request !== generation) return;
      actionStatus.textContent = 'Проверката приключи. Пълният офлайн режим предстои през Ден 19.';
      D.log('info', 'offline', 'status inspected', { cache: cache.textContent, storage: storage.textContent });
    } finally {
      if (request === generation) checkButton.disabled = false;
    }
  }

  function close(): void {
    generation += 1;
    backdrop.hidden = true;
    previousFocus?.focus();
    previousFocus = null;
  }

  function open(): void {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : opener;
    backdrop.hidden = false;
    dialog.focus();
    void check();
    D.log('info', 'offline', 'opened info panel');
  }

  opener.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', (event) => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const controls = [closeButton, checkButton, refreshButton].filter((b) => !b.disabled);
      const i = controls.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && (i <= 0)) { event.preventDefault(); controls[controls.length - 1].focus(); }
      if (!event.shiftKey && i === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
    }
  });
  checkButton.addEventListener('click', () => { void check(); });
  refreshButton.addEventListener('click', () => {
    if (!navigator.onLine) {
      actionStatus.textContent = 'Няма отчетена интернет връзка. Обновяването изисква интернет.';
      return;
    }
    // This is explicitly a network refresh, NOT a claim that Core/AI offline packages
    // have been installed. URL cache-busting addresses GitHub Pages HTML caching.
    const url = new URL(window.location.href);
    url.searchParams.set('refresh', String(Date.now()));
    D.log('info', 'offline', 'manual network refresh requested');
    window.location.assign(url.href);
  });
  return close;
}
