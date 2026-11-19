/** Read-only Day 6 acceptance report. Never mutate presets during verification. */
import * as D from './diagnostics';
import { getProjectImage, listProjectThumbnails } from './storage/project-store';

export function initDay6Diagnostics(): void {
  const button = document.getElementById('btn-day6-verify') as HTMLButtonElement | null;
  const out = document.getElementById('day6-result') as HTMLElement | null;
  if (!button || !out) return;
  button.addEventListener('click', async () => {
    button.disabled = true;
    out.textContent = 'Чета запазените настройки от IndexedDB…';
    try {
      const cards = await listProjectThumbnails();
      const projects = await Promise.all(cards.map(async ({ project }) => {
        const { source, preset } = await getProjectImage(project.id);
        return {
          title: project.title,
          projectId: project.id,
          sourceId: source.id,
          saved: Boolean(preset),
          updatedAt: preset?.updatedAt ?? null,
          coordinateSpace: preset?.coordinateSpace ?? 'css-px (стар preset)',
          normalizedPosition: preset ? { x: preset.x, y: preset.y } : null,
          scene: preset?.sceneWidth && preset?.sceneHeight
            ? { width: preset.sceneWidth, height: preset.sceneHeight } : null,
          scalePercent: preset ? preset.scale * 100 : null,
          rotationDeg: preset?.rotationDeg ?? null,
          opacityPercent: preset?.opacityPercent ?? null,
          locked: preset?.locked ?? null,
          mirrored: preset?.mirroredOverlay ?? null,
          gridEnabled: preset?.gridEnabled ?? null,
        };
      }));
      const report = { day: 6, projects: cards.length, presets: projects, test:
        'Нагласи рисунка, натисни Назад, затвори от app switcher и отвори пак същия проект. Сравни числата и изображението.' };
      out.textContent = JSON.stringify(report, null, 2);
      D.log('info', 'day6', 'preset.audit', { projects: cards.length,
        normalized: projects.filter(p => p.coordinateSpace === 'normalized-v1').length });
    } catch (error) {
      out.textContent = `FAIL: ${String(error)}`;
      D.log('error', 'day6', 'preset.audit.failed', { message: String(error) });
    } finally { button.disabled = false; }
  });
}
