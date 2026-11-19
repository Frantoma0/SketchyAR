import * as D from './diagnostics';
import { listProjectThumbnails, assertProjectIntegrity, verifyStoredSource, openProjectDB } from './storage/project-store';

export function initDay5Diagnostics(): void {
  const button = document.getElementById('btn-day5-verify') as HTMLButtonElement | null;
  const result = document.getElementById('day5-result') as HTMLElement | null;
  if (!button || !result) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = 'Проверка на IndexedDB и оригиналните файлове…';
    try {
      const db = await openProjectDB();
      const cards = await listProjectThumbnails();
      for (const { project } of cards) await assertProjectIntegrity(project.id);
      const latest = cards[0];
      const hash = latest ? await verifyStoredSource(latest.project.id) : null;
      const report = {
        database: db.name, schemaVersion: db.version, projects: cards.length,
        checkedIntegrity: cards.length,
        newestSource: hash ? { bytes: hash.bytes, mimeType: hash.mimeType,
          sha256: hash.sha256, verification: hash.result } : null,
        instruction: hash?.result === 'baseline-created'
          ? 'Затвори приложението от app switcher, отвори от Home Screen и пусни проверката отново.'
          : 'Няма открито несъответствие при прочитането на данните.',
      };
      result.textContent = JSON.stringify(report, null, 2);
      D.log('info', 'day5', 'storage.integrity.audit', {
        projectCount: cards.length, result: hash?.result ?? 'empty', bytes: hash?.bytes ?? 0,
      });
    } catch (error) {
      result.textContent = `FAIL: ${String(error)}`;
      D.log('error', 'day5', 'storage.integrity.failed', { message: String(error) });
    } finally { button.disabled = false; }
  });
}
