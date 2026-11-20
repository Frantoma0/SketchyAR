/** Day 12: diagnostic-only NumPy NMS + hysteresis; camera & IndexedDB untouched. */
import { log } from './diagnostics';
import { runPythonCommand } from './python-client';

export function initDay12Diagnostics(): void {
  const out = document.getElementById('day12-benchmark-result');
  const small = document.getElementById('btn-day12-512') as HTMLButtonElement | null;
  const large = document.getElementById('btn-day12-1024') as HTMLButtonElement | null;
  if (!out || !small || !large) return;
  const buttons = [small, large];
  async function run(size: 512 | 1024): Promise<void> {
    for (const b of buttons) b.disabled = true;
    if (out) out.textContent = `Измервам Day 12: NMS + hysteresis ${size}×${size}…`;
    try {
      const result = await runPythonCommand(size === 512 ? 'day12-512' : 'day12-1024');
      if (out) out.textContent = JSON.stringify(result, null, 2);
      log('info', 'day12.edge_pipeline', `Day 12 ${size}×${size} completed`, result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (out) out.textContent = JSON.stringify({ status: 'FAIL', size, error: message }, null, 2);
      log('error', 'day12.edge_pipeline', message, { size });
    } finally {
      for (const b of buttons) b.disabled = false;
    }
  }
  small.addEventListener('click', () => { void run(512); });
  large.addEventListener('click', () => { void run(1024); });
}
