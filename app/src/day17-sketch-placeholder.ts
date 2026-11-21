/** Day 17: a truthful edit-route placeholder; no generator, no IndexedDB writes.
 * The real Sketch Generator will replace this screen during Days 18–21/36–42.
 */
import * as D from './diagnostics';
import type { ProjectRecord } from './storage/project-store';

export function initDay17EditPlaceholder(): {
  open(project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement): void;
  close(): void;
} {
  const screen = document.getElementById('day17-edit-screen') as HTMLElement;
  const back = document.getElementById('day17-edit-back') as HTMLButtonElement;
  const returnButton = document.getElementById('day17-edit-return') as HTMLButtonElement;
  const projectName = document.getElementById('day17-edit-project-name') as HTMLElement;
  let returnFocus: HTMLElement | null = null;

  const close = (): void => {
    if (screen.hidden) return;
    screen.hidden = true;
    document.body.classList.remove('day17-edit-open');
    const focus = returnFocus;
    returnFocus = null;
    if (focus?.isConnected) focus.focus();
    D.log('info', 'day17', 'sketch.edit.closed');
  };
  const open = (project: Pick<ProjectRecord, 'id' | 'title'>, trigger: HTMLElement): void => {
    if (!screen.hidden) return;
    returnFocus = trigger;
    projectName.textContent = project.title; // textContent avoids title injection
    screen.hidden = false;
    document.body.classList.add('day17-edit-open');
    back.focus();
    D.log('info', 'day17', 'sketch.edit.placeholder', { projectId: project.id });
  };
  back.addEventListener('click', close);
  returnButton.addEventListener('click', close);
  screen.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [back, returnButton];
    if (event.shiftKey && document.activeElement === controls[0]) {
      event.preventDefault(); controls[1].focus();
    } else if (!event.shiftKey && document.activeElement === controls[1]) {
      event.preventDefault(); controls[0].focus();
    }
  });
  return { open, close };
}
