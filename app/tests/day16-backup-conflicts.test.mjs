/** Day 16: read-only preflight must never mistakenly allow duplicate data.
 * Test the ACTUAL TypeScript product helper with the installed local tsc.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'sketchyar-day16-'));
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const binary = existsSync(tsc) ? process.execPath : 'tsc';
const prefix = binary === process.execPath ? [tsc] : [];
const version = execFileSync(binary, [...prefix, '--version'], { encoding: 'utf8' });
const major = Number(version.match(/\b(\d+)\.\d+/)?.[1]);
if (!Number.isInteger(major) || major < 5) throw new Error(`Unsupported TypeScript: ${version}`);
const args = [...prefix, ...(major >= 6 ? ['--ignoreConfig'] : []),
  '--module', 'commonjs', '--moduleResolution', major >= 6 ? 'bundler' : 'node',
  '--target', 'es2022', '--lib', 'es2022,dom,dom.iterable',
  '--skipLibCheck', '--strict', '--outDir', dir,
  join(root, 'src/day16-backup-conflicts.ts'), join(root, 'src/vite-env.d.ts')];
try { execFileSync(binary, args, {stdio: 'pipe'}); }
catch (e) { console.error(String(e.stdout ?? '') + String(e.stderr ?? '')); throw e; }
writeFileSync(join(dir, 'package.json'), '{"type":"commonjs"}');
const { summarizeBackupConflicts, BACKUP_STORE_NAMES } = createRequire(import.meta.url)(join(dir, 'day16-backup-conflicts.js'));
process.once('exit', () => rmSync(dir, {recursive: true, force: true}));
const ID = x => '00000000-0000-4000-8000-' + String(x).padStart(12, '0');
function fixture() {
  return { format:'sketchyar-backup', schemaVersion:1, appVersion:'0.16.0',
    projects:[{id:ID(1)}], assets:[{id:ID(2)},{id:ID(3)}],
    presets:[{id:ID(4)}], settings:[{key:`day5-source-sha256:${ID(2)}`}],
    integrity:{algorithm:'SHA-256'} };
}
function empty() { return {projects:[],assets:[],overlay_presets:[],app_settings:[]}; }
test('Day16: store names match exactly four persisted IndexedDB stores', () => {
  assert.deepEqual(BACKUP_STORE_NAMES, ['projects','assets','overlay_presets','app_settings']);
});
test('Day16: empty destination permits append-only restore', () => {
  const result=summarizeBackupConflicts(fixture(),empty());
  assert.equal(result.total,0); assert.equal(result.canRestore,true);
});
test('Day16: duplicate project ID blocks restore before write', () => {
  const keys=empty();keys.projects=[ID(1)];
  const r=summarizeBackupConflicts(fixture(),keys);
  assert.equal(r.counts.projects,1);assert.equal(r.canRestore,false);
});
test('Day16: duplicate preset, asset or settings key blocks restore too', () => {
  const keys=empty();keys.assets=[ID(3)];keys.overlay_presets=[ID(4)];
  keys.app_settings=[`day5-source-sha256:${ID(2)}`];
  const r=summarizeBackupConflicts(fixture(),keys);
  assert.equal(r.total,3);assert.equal(r.canRestore,false);
  assert.equal(r.counts.assets,1);assert.equal(r.counts.overlay_presets,1);
  assert.equal(r.counts.app_settings,1);
});
test('Day16: collision scan never mutates manifest or existing keys', () => {
  const manifest=fixture();const keys=empty();keys.projects=[ID(1)];
  const before=JSON.stringify([manifest,keys]);
  summarizeBackupConflicts(manifest,keys);
  assert.equal(JSON.stringify([manifest,keys]),before);
});
