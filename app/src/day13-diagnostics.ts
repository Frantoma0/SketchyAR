/** Day 13: real images remain private; only metadata is logged. */
import { initDay13ImageBridge } from './day13-image-bridge';
import { runDay13BackupPreflight } from './storage/day13-backup-preflight';
import { log } from './diagnostics';

export function initDay13Diagnostics(): void {
  initDay13ImageBridge();
  const btn = document.getElementById('btn-day13-manifest') as HTMLButtonElement | null;
  const out = document.getElementById('day13-manifest-result');
  if (!btn || !out) return;
  btn.addEventListener('click', () => {
    btn.disabled = true;
    out.textContent = 'Проверявам метаданните на четирите IndexedDB stores…';
    void runDay13BackupPreflight().then(result => {
      out.textContent = JSON.stringify(result, null, 2);
      log('info', 'day13.manifest_preflight', result.status, result);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      out.textContent = JSON.stringify({ status: 'FAIL', error: message }, null, 2);
      log('error', 'day13.manifest_preflight', message);
    }).finally(() => { btn.disabled = false; });
  });
}
