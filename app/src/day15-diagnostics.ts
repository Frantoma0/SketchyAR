/** Day 15 G2 hardening — read-only production snapshot + sandbox adversarial checks.
 * Requires a user-selected existing ZIP and NEVER invokes production restore.
 */
import { log } from './diagnostics';
import { runDay15SafetyDrill } from './storage/day14-backup-service';

export function initDay15Diagnostics(): void {
  const pick = document.getElementById('btn-day15-choose') as HTMLButtonElement | null;
  const run = document.getElementById('btn-day15-run') as HTMLButtonElement | null;
  const input = document.getElementById('day15-file') as HTMLInputElement | null;
  const out = document.getElementById('day15-result');
  if (!pick || !run || !input || !out) return;
  let selected: File | null = null;
  let generation = 0;
  pick.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    generation++;
    selected = input.files?.[0] ?? null;
    run.disabled = !selected;
    out.textContent = selected
      ? JSON.stringify({ status: 'ZIP SELECTED — DAY15 NOT RUN', bytes: selected.size }, null, 2)
      : 'Не е избран ZIP.';
  });
  run.addEventListener('click', () => {
    if (!selected) return;
    const file = selected;
    const runGeneration = generation;
    run.disabled = true;
    pick.disabled = true;
    out.textContent = 'Проверка на ZIP и безопасни sandbox конфликти…';
    void runDay15SafetyDrill(file).then(result => {
      if (runGeneration !== generation) return;
      out.textContent = JSON.stringify(result, null, 2);
      log('info', 'day15.hardening', 'pass', result);
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      out.textContent = JSON.stringify({ status: 'DAY15 HARDENING FAIL', error: message }, null, 2);
      log('error', 'day15.hardening', message);
    }).finally(() => { pick.disabled = false; run.disabled = !selected; });
  });
}
