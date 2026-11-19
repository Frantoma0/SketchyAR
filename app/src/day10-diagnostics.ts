/** Day 10: run identical Python kernels on iPhone and Windows (no camera or DB changes). */
import { log } from './diagnostics';
import { runPythonCommand } from './python-client';

export function initDay10Diagnostics(): void {
  const output = document.getElementById('day10-benchmark-result');
  const btn512 = document.getElementById('btn-day10-512') as HTMLButtonElement | null;
  const btn1024 = document.getElementById('btn-day10-1024') as HTMLButtonElement | null;
  if (!output || !btn512 || !btn1024) return;

  const buttons = [btn512, btn1024];
  const run = (size: 512 | 1024) => {
    for (const button of buttons) button.disabled = true;
    output.textContent = `Изпълнявам Day 10 (тонални нива, Sobel, XDoG) при ${size}×${size}…`;
    void runPythonCommand(size === 512 ? 'day10-512' : 'day10-1024')
      .then(data => {
        output.textContent = JSON.stringify(data, null, 2);
        log('info', 'day10.sketch_engine', `Day 10 ${size}×${size} completed`, data);
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        output.textContent = JSON.stringify({ status: 'FAIL', size, error: message }, null, 2);
        log('error', 'day10.sketch_engine', message, { size });
      })
      .finally(() => {
        for (const button of buttons) button.disabled = false;
      });
  };
  btn512.addEventListener('click', () => run(512));
  btn1024.addEventListener('click', () => run(1024));
}
