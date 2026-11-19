/** Day 11: NumPy Otsu/morphology diagnostics; isolated Service Worker experiment. */
import { log } from './diagnostics';
import { runPythonCommand } from './python-client';

export function initDay11Diagnostics(): void {
  const output = document.getElementById('day11-benchmark-result');
  const btn512 = document.getElementById('btn-day11-512') as HTMLButtonElement | null;
  const btn1024 = document.getElementById('btn-day11-1024') as HTMLButtonElement | null;
  const swLink = document.getElementById('day11-sw-spike-link') as HTMLAnchorElement | null;
  if (!output || !btn512 || !btn1024 || !swLink) return;

  // The separate page registers a worker only when a user explicitly requests it.
  // It has scope /SketchyAR/sw-spike/, never /SketchyAR/.
  swLink.href = new URL('sw-spike/', document.baseURI).href;
  const buttons = [btn512, btn1024];
  const run = (size: 512 | 1024): void => {
    for (const button of buttons) button.disabled = true;
    output.textContent = `Изпълнявам Day 11 — Otsu и морфология ${size}×${size}…`;
    void runPythonCommand(size === 512 ? 'day11-512' : 'day11-1024')
      .then(data => {
        output.textContent = JSON.stringify(data, null, 2);
        log('info', 'day11.otsu_morphology', `Day 11 ${size}×${size} completed`, data);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        output.textContent = JSON.stringify({ status: 'FAIL', size, error: message }, null, 2);
        log('error', 'day11.otsu_morphology', message, { size });
      })
      .finally(() => {
        for (const button of buttons) button.disabled = false;
      });
  };
  btn512.addEventListener('click', () => run(512));
  btn1024.addEventListener('click', () => run(1024));
}
