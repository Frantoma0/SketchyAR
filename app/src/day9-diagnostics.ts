/** Day 9: test the shared NumPy kernel on iPhone without touching Camera or IndexedDB. */
import { log } from './diagnostics';
import { runPythonCommand } from './python-client';

export function initDay9Diagnostics(): void {
  const button = document.getElementById('btn-day9-benchmark') as HTMLButtonElement | null;
  const result = document.getElementById('day9-benchmark-result');
  if (!button || !result) return;
  button.addEventListener('click', () => {
    button.disabled = true;
    result.textContent = 'Стартирам Python Sketch Engine (512×512, float32)…';
    void runPythonCommand('day9').then(payload => {
      result.textContent = JSON.stringify(payload, null, 2);
      log('info', 'day9.sketch_engine', 'Gaussian / Sobel / XDoG completed', payload);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      result.textContent = JSON.stringify({ status: 'FAIL', error: message }, null, 2);
      log('error', 'day9.sketch_engine', message);
    }).finally(() => {
      button.disabled = false;
    });
  });
}
