/** G2 preparation: read-only consistency report for the entire DB. */
import * as D from './diagnostics';
import { auditProjectDatabase, assertProjectIntegrity, listProjectThumbnails } from './storage/project-store';

export function initDay7Diagnostics(): void {
  const button = document.getElementById('btn-day7-audit') as HTMLButtonElement | null;
  const out = document.getElementById('day7-result') as HTMLElement | null;
  if (!button || !out) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    out.textContent = 'Проверка на всички IndexedDB връзки…';
    try {
      const report = await auditProjectDatabase();
      if (report.ok) {
        const cards = await listProjectThumbnails();
        for (const card of cards) await assertProjectIntegrity(card.project.id);
      }
      out.textContent = JSON.stringify({ day: 7, ...report, acceptance: report.ok ? 'PASS' : 'FAIL',
        next: 'Преименувай и изтрий тестов проект, провери пак. Оригиналите на останалите проекти не трябва да се променят.' }, null, 2);
      D.log(report.ok ? 'info' : 'error', 'day7', 'project.database.audit', {
        ok: report.ok, projects: report.projects, assets: report.assets, presets: report.presets,
      });
    } catch (error) {
      out.textContent = `FAIL: ${String(error)}`;
      D.log('error', 'day7', 'project.database.audit.failed', { message: String(error) });
    } finally { button.disabled = false; }
  });
}
