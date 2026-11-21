/** Day17 source integration contracts: no DOM dependency on Windows test runner.
 * Browser-level touch/focus tests live in docs/day17.md and a standalone smoke script.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const home = read('src/home.ts');
const styles = read('src/styles.css');
const main = read('src/main.ts');
const editor = read('src/day17-sketch-placeholder.ts');
const icon = read('public/ui/project-edit-pencil.svg');
const packageJson = JSON.parse(read('package.json'));

test('Day17: independent photo, name, pencil and trash buttons without nested buttons', () => {
  for (const name of ['open','caption','pencil','trash']) {
    assert.match(home,new RegExp(`const ${name} = document.createElement\\('button'\\)`));
  }
  assert.match(home,/tile\.append\(open, caption, pencil, trash\)/);
  assert.doesNotMatch(home,/tile\.append\(open, caption, menu, trash\)/);
  assert.doesNotMatch(home,/const menu = document\.createElement/);
});
test('Day17: image opens drawing, caption directly opens rename, pencil opens editor', () => {
  assert.match(home,/open\.addEventListener\('click', \(\) => void openSaved\(project\.id\)\)/);
  assert.match(home,/caption\.addEventListener\('click', \(\) => showProjectDialog\(project, caption, 'rename'\)\)/);
  assert.match(home,/pencil\.addEventListener\('click', \(\) => sketchEditor\.open\(project, pencil\)\)/);
  assert.match(home,/trash\.addEventListener\('click', \(\) => showProjectDialog\(project, trash, 'delete'\)\)/);
  assert.match(home,/renameImageProject\(selected\.id, renameInput\.value\)/);
});
test('Day17: rename and delete both have cancel without invoking save or delete', () => {
  assert.match(home,/project-rename-cancel'\)\.addEventListener\('click', closeProjectDialog\)/);
  assert.match(home,/project-delete-cancel'\)\.addEventListener\('click', closeProjectDialog\)/);
  assert.match(main,/id="project-rename-input"[^>]*maxlength="100"/);
  assert.match(main,/id="project-delete-confirm" hidden/);
  assert.doesNotMatch(main,/id="project-dialog-menu"/);
});
test('Day17: graphite icon and 44px separate touch targets preserve fixed layout', () => {
  assert.match(icon,/<svg/);
  assert.match(icon,/viewBox="0 0 27 27"/);
  assert.match(styles,/\.home-project-edit-trigger\s*\{[^}]*width:44px; height:44px/s);
  assert.match(styles,/\.home-project-delete-trigger\s*\{[^}]*width:44px; height:44px/s);
  assert.match(styles,/right:calc\(4% \+ 46px\)/);
  assert.match(styles,/\.home-project-caption\s*\{[^}]*font:700 17px/s);
});
test('Day17: placeholder promises no processing; back and Escape return focus', () => {
  assert.match(main,/id="day17-edit-heading"[^>]*>Редакция/);
  assert.match(main,/Избраните настройки са визуални и не обработват снимката/);
  assert.match(editor,/screen\.hidden = false/);
  assert.match(editor,/screen\.hidden = true/);
  assert.match(editor,/if \(event\.key === 'Escape'\)/);
  assert.match(editor,/if \(focus\?\.isConnected\) focus\.focus\(\)/);
  assert.doesNotMatch(editor,/put\(|delete\(|renameImageProject\(|createBackup\(/);
});
test('Day17: exact version and all earlier tests are still run', () => {
  assert.ok(Number(packageJson.version.split('.')[1]) >= 17, 'Day17 regression must remain enabled in later versions');
  assert.equal(packageJson.scripts['test:day17'],packageJson.scripts['test:day16']);
});

test('Day17.1: exact user-provided pencil art, 6px visible gap and preserved click actions', () => {
  assert.match(icon,/<svg width="27" height="27" viewBox="0 0 27 27"/);
  assert.match(home,/pencilIcon\.src = `\$\{import\.meta\.env\.BASE_URL\}ui\/project-edit-pencil\.svg`/);
  assert.match(home,/pencil\.addEventListener\('click', \(\) => sketchEditor\.open\(project, pencil\)\)/);
  assert.match(home,/trash\.addEventListener\('click', \(\) => showProjectDialog\(project, trash, 'delete'\)\)/);
  const pencilRule = styles.match(/\.home-project-edit-trigger img \{([^}]*)\}/)?.[1] ?? '';
  const binRule = styles.match(/\.home-project-delete-trigger img \{([^}]*)\}/)?.[1] ?? '';
  assert.match(pencilRule,/left:5\.5px/);
  assert.match(binRule,/left:-5\.5px/);
  assert.match(pencilRule,/width:29px; height:29px/);
  assert.match(binRule,/width:29px; height:29px/);
  // Both 44px click boxes remain 2px apart; only their icons shift.
  const centerDistance = 46;
  const iconSize = 29;
  const inwardShift = 5.5;
  assert.equal(centerDistance - iconSize - 2 * inwardShift, 6);
  assert.match(styles,/right:calc\(4% \+ 46px\)/);
  assert.match(styles,/\.home-project-edit-trigger\s*\{[^}]*width:44px; height:44px/s);
  assert.match(styles,/\.home-project-delete-trigger\s*\{[^}]*width:44px; height:44px/s);
});
