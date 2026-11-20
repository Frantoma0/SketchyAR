/** Day 14 UI: ZIP preparation, native Files handoff, independent verify,
 * isolated test restore, and optional append-only production restore.
 */
import { log } from './diagnostics';
import { createBackup, restoreBackupToCurrentDB, runDay14SandboxRestore,
  verifyBackup, type BackupBuildResult } from './storage/day14-backup-service';

export function initDay14Diagnostics(): void {
  const create = document.getElementById('btn-day14-create') as HTMLButtonElement | null;
  const save = document.getElementById('btn-day14-save') as HTMLButtonElement | null;
  const choose = document.getElementById('btn-day14-choose') as HTMLButtonElement | null;
  const verify = document.getElementById('btn-day14-verify') as HTMLButtonElement | null;
  const sandbox = document.getElementById('btn-day14-sandbox') as HTMLButtonElement | null;
  const restore = document.getElementById('btn-day14-restore') as HTMLButtonElement | null;
  const picker = document.getElementById('day14-file') as HTMLInputElement | null;
  const out = document.getElementById('day14-result');
  if (!create || !save || !choose || !verify || !sandbox || !restore || !picker || !out) return;
  let zip: BackupBuildResult | null = null;
  let selected: File | null = null;
  let sandboxPassed = false;
  const report = (status: string, data: Record<string, unknown> = {}) => {
    out.textContent = JSON.stringify({ status, ...data }, null, 2);
  };
  const fail = (operation: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    report('FAIL', { operation, error: message });
    log('error', `day14.${operation}`, message);
  };
  create.addEventListener('click', () => {
    create.disabled = true; zip = null; save.disabled = true;
    report('PREPARING ZIP', { note: 'Източниците не се променят' });
    void createBackup().then(result => {
      zip = result; save.disabled = false;
      report('ZIP PREPARED — SAVE TO FILES, THEN VERIFY', {
        filename: result.filename, zipBytes: result.blob.size,
        projects: result.manifest.projects.length, assets: result.manifest.assets.length,
        presets: result.manifest.presets.length, totalSourceBytes: result.assetBytes,
      });
      log('info', 'day14.export', 'zip-created-not-yet-verified', {
        zipBytes: result.blob.size, projects: result.manifest.projects.length,
        assets: result.manifest.assets.length,
      });
    }).catch(e => fail('export', e)).finally(() => { create.disabled = false; });
  });
  const fallbackDownload = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a'); a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    report('DOWNLOAD REQUESTED — VERIFY SAVED ZIP', { filename: file.name });
  };
  save.addEventListener('click', () => {
    if (!zip) return;
    const file = new File([zip.blob], zip.filename, { type: 'application/zip' });
    const shareData: ShareData = { files: [file], title: 'SketchyAR Backup' };
    if (navigator.share && navigator.canShare?.(shareData)) {
      void navigator.share(shareData).then(() => {
        report('SHARE SHEET CLOSED — VERIFY FILE IN FILES', { filename: file.name });
      }).catch(err => {
        if ((err as DOMException).name !== 'AbortError') {
          log('warn', 'day14.share', 'Native share failed; using download fallback');
          fallbackDownload(file);
        }
      });
    } else {
      fallbackDownload(file);
    }
  });
  choose.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    selected = picker.files?.[0] ?? null;
    sandboxPassed = false; sandbox.disabled = true; restore.disabled = true;
    verify.disabled = !selected;
    report(selected ? 'ZIP SELECTED — NOT VERIFIED' : 'NO FILE',
      selected ? { filename: selected.name, bytes: selected.size } : {});
  });
  verify.addEventListener('click', () => {
    if (!selected) return;
    const file = selected;
    verify.disabled = true; sandbox.disabled = true; restore.disabled = true;
    report('VERIFYING SHA-256', { filename: file.name });
    void verifyBackup(file).then(result => {
      sandbox.disabled = false;
      report('VERIFY PASS — READ ONLY, NO RESTORE', {
        zipBytes: result.archiveBytes, archiveSha256: result.archiveSha256,
        projects: result.manifest.projects.length,
        assets: result.manifest.assets.length, presets: result.manifest.presets.length,
        verifiedAt: result.verifiedAt,
      });
      log('info', 'day14.verify', 'pass', { archiveSha256: result.archiveSha256,
        projects: result.manifest.projects.length, assets: result.manifest.assets.length });
    }).catch(e => fail('verify', e)).finally(() => { verify.disabled = false; });
  });
  sandbox.addEventListener('click', () => {
    if (!selected) return;
    const file = selected;
    sandbox.disabled = true;
    report('TEST RESTORE — ISOLATED SANDBOX', { note: 'Истинските проекти НЕ се променят' });
    void runDay14SandboxRestore(file).then(result => {
      sandboxPassed = true; restore.disabled = false;
      report(result.status, { ...result, note: 'Sandbox test data removed; production untouched' });
      log('info', 'day14.sandbox_restore', 'pass', result);
    }).catch(e => { sandboxPassed = false; fail('sandbox_restore', e); })
      .finally(() => { sandbox.disabled = false; });
  });
  restore.addEventListener('click', () => {
    if (!selected || !sandboxPassed) return;
    if (!window.confirm('ВНИМАНИЕ: Това ще добави записи към истинската база на SketchyAR. При ВСЕКИ ID конфликт целият импорт се отказва. Няма автоматично презаписване. Използвай само проверен архив. Продължаваме ли?')) return;
    const file = selected;
    restore.disabled = true; report('RESTORING — VERIFY AGAIN BEFORE WRITE');
    void restoreBackupToCurrentDB(file).then(result => {
      report('PRODUCTION RESTORE PASS', {
        archiveSha256: result.archiveSha256,
        projectsAdded: result.manifest.projects.length, assetsAdded: result.assets.length,
        presetsAdded: result.manifest.presets.length,
        note: 'Reload project gallery to see imported projects',
      });
      log('info', 'day14.production_restore', 'pass', {
        archiveSha256: result.archiveSha256, projectsAdded: result.manifest.projects.length,
      });
    }).catch(e => fail('production_restore', e)).finally(() => { restore.disabled = false; });
  });
}
