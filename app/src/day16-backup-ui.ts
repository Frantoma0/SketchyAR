/** Day 16 product backup controls. Reuses the verified Day 14 backup implementation.
 * Never sends image bytes to a server; real writes are add-only and user-confirmed.
 * Keep the developer diagnostic UI independent and accessible.
 */
import * as D from './diagnostics';
import { BACKUP_STORE_NAMES, type ExistingBackupKeys } from './day16-backup-conflicts';
import { planBackupMerge, type BackupMergePlan } from './day16-backup-merge';
import { createBackup, mergeBackupToCurrentDB, runDay16SandboxMerge, verifyBackup,
  type BackupBuildResult, type VerifiedBackup } from './storage/day14-backup-service';
import { openProjectDB } from './storage/project-store';

const find = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Day16 UI element is missing: ${id}`);
  return node as T;
};

async function currentMergePlan(verified: VerifiedBackup): Promise<BackupMergePlan> {
  const db = await openProjectDB();
  const transaction = db.transaction([...BACKUP_STORE_NAMES], 'readonly');
  // Issue ALL requests synchronously while this transaction is active.
  const requests = BACKUP_STORE_NAMES.map(name => transaction.objectStore(name).getAllKeys());
  const values = await Promise.all(requests.map(request => new Promise<IDBValidKey[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  })));
  const existing = {} as ExistingBackupKeys;
  BACKUP_STORE_NAMES.forEach((name, i) => {
    (existing as Record<string, readonly string[]>)[name] = values[i].map(String);
  });
  return planBackupMerge(verified.manifest, existing);
}

function fallbackDownload(file: File): void {
  // Called DIRECTLY from the user's click; no async before the navigation.
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function initDay16BackupUI(openDiagnostics: () => void): { close: () => void } {
  const trigger = find<HTMLButtonElement>('home-save-icon');
  const popover = find<HTMLElement>('home-backup-popover');
  const save = find<HTMLButtonElement>('home-backup-create');
  const load = find<HTMLButtonElement>('home-backup-load');
  const diagnostics = find<HTMLButtonElement>('home-backup-diagnostics');
  const picker = find<HTMLInputElement>('home-backup-file');
  const backdrop = find<HTMLElement>('home-backup-dialog');
  const dialog = find<HTMLElement>('home-backup-panel');
  const title = find<HTMLElement>('home-backup-dialog-title');
  const details = find<HTMLElement>('home-backup-details');
  const status = find<HTMLElement>('home-backup-status');
  const warning = find<HTMLElement>('home-backup-warning');
  const close = find<HTMLButtonElement>('home-backup-close');
  const exportActions = find<HTMLElement>('home-backup-export-actions');
  const importActions = find<HTMLElement>('home-backup-import-actions');
  const prepare = find<HTMLButtonElement>('home-backup-prepare');
  const share = find<HTMLButtonElement>('home-backup-share');
  const sandbox = find<HTMLButtonElement>('home-backup-sandbox');
  const restore = find<HTMLButtonElement>('home-backup-restore');

  let mode: 'export' | 'import' | null = null;
  let running = false;
  let prepared: BackupBuildResult | null = null;
  let chosen: File | null = null;
  let verified: VerifiedBackup | null = null;
  let mergePlan: BackupMergePlan | null = null;
  let sandboxOk = false;
  let restoreCompleted = false;
  let lastFocus: HTMLElement | null = null;

  const setStatus = (text: string, error = false): void => {
    status.textContent = text;
    status.dataset.error = String(error);
  };
  const updateControls = (): void => {
    prepare.disabled = running;
    share.disabled = running || !prepared || mode !== 'export';
    sandbox.disabled = running || !chosen || !verified || mode !== 'import';
    restore.disabled = running || !chosen || !verified || !sandboxOk || !mergePlan?.canRestore || restoreCompleted || mode !== 'import';
    close.disabled = running;
  };
  const hideMenu = (): void => {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const closeDialog = (): void => {
    if (running) return;
    backdrop.hidden = true;
    mode = null;
    prepared = null; chosen = null; verified = null; mergePlan = null; sandboxOk = false; restoreCompleted = false;
    const target = lastFocus;
    lastFocus = null;
    if (target?.isConnected) target.focus();
  };
  const showDialog = (next: 'export' | 'import'): void => {
    hideMenu();
    if (!backdrop.hidden) closeDialog();
    lastFocus = trigger;
    mode = next;
    prepared = null; chosen = null; verified = null; mergePlan = null; sandboxOk = false; restoreCompleted = false;
    title.textContent = next === 'export' ? 'Запази архив' : 'Зареди архив';
    details.textContent = next === 'export'
      ? 'Създай локален ZIP архив на проектите и оригиналните изображения. След подготовката го запази във Files.'
      : 'Избери ZIP от Files. Първо ще проверим SHA-256 и ще тестваме възстановяването във временна база.';
    warning.textContent = next === 'export'
      ? 'Архивът не е запазен, докато не го съхраниш във Files. Провери файла след записването.'
      : 'Добавяме само липсващите ЦЕЛИ проекти. Съществуващите проекти, снимки и настройки никога не се презаписват. Проекти с конфликтни asset/preset ID се пропускат.';
    exportActions.hidden = next !== 'export';
    importActions.hidden = next !== 'import';
    setStatus(next === 'export' ? 'ZIP още не е създаден.' : 'Избиране на ZIP…');
    backdrop.hidden = false;
    updateControls();
    if (next === 'export') prepare.focus();
    else close.focus();
  };
  const failure = (operation: string, error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`Неуспешно: ${message}`, true);
    D.log('error', `day16.${operation}`, message);
  };
  const closeAll = (): void => {
    hideMenu();
    if (!backdrop.hidden) closeDialog();
  };

  trigger.addEventListener('click', () => {
    if (!backdrop.hidden) return;
    popover.hidden = !popover.hidden;
    trigger.setAttribute('aria-expanded', String(!popover.hidden));
    if (!popover.hidden) save.focus();
  });
  save.addEventListener('click', () => {
    showDialog('export');
    // Preparing a multi-megabyte ZIP is asynchronous: do NOT call navigator.share
    // here. Its separate button retains a genuine iOS user activation.
    void prepareBackup();
  });
  async function prepareBackup(): Promise<void> {
    if (running || mode !== 'export') return;
    running = true; prepared = null;
    setStatus('Подготвя ZIP и SHA-256 за всеки asset…');
    updateControls();
    try {
      const result = await createBackup();
      if (mode !== 'export') return;
      prepared = result;
      details.textContent = `Готов ZIP: ${result.manifest.projects.length} проекта · ${result.manifest.assets.length} assets · ${result.manifest.presets.length} presets · ${(result.blob.size / 1024 / 1024).toFixed(2)} MiB.`;
      setStatus('ZIP е подготвен. Натисни „Запази във Files“ и провери, че файлът съществува.');
      D.log('info', 'day16.export', 'prepared-not-saved', {
        zipBytes: result.blob.size, projects: result.manifest.projects.length,
        assets: result.manifest.assets.length,
      });
    } catch (error) { failure('export', error); }
    finally { running = false; updateControls(); }
  }
  prepare.addEventListener('click', () => void prepareBackup());
  share.addEventListener('click', () => {
    if (!prepared || running) return;
    const file = new File([prepared.blob], prepared.filename, { type: 'application/zip' });
    const payload: ShareData = { files: [file], title: 'SketchyAR Backup' };
    if (navigator.share && navigator.canShare?.(payload)) {
      // Called from THIS click, before an await, for Safari user activation.
      void navigator.share(payload).then(() => {
        if (mode === 'export') setStatus('Панелът е затворен. Провери дали ZIP действително е записан във Files.');
        D.log('info', 'day16.share', 'sheet-closed-not-verified');
      }).catch(error => {
        if ((error as DOMException).name !== 'AbortError') {
          if (mode === 'export') setStatus('Системното споделяне не успя. Опитай отново. Ако платформата не поддържа споделяне, се използва браузърно изтегляне.', true);
          D.log('warn', 'day16.share', 'native-share-failed', { message: String(error) });
        } else if (mode === 'export') setStatus('Записването е отменено. ZIP остава подготвен.');
      });
    } else {
      fallbackDownload(file);
      setStatus('Изтеглянето е поискано. Провери във Files дали ZIP е запазен.');
      D.log('info', 'day16.share', 'download-requested-not-verified');
    }
  });

  load.addEventListener('click', () => {
    hideMenu();
    picker.value = ''; // Selecting the same file twice must fire change again.
    picker.click(); // MUST be synchronous inside the tap for iPhone Files.
  });
  picker.addEventListener('change', () => {
    const file = picker.files?.[0] ?? null;
    if (!file) return;
    showDialog('import');
    chosen = file;
    void examine(file);
  });
  async function examine(file: File): Promise<void> {
    if (running) return;
    running = true;
    verified = null; mergePlan = null; sandboxOk = false;
    setStatus('Проверявам ZIP, manifest, CRC-32 и SHA-256…');
    updateControls();
    try {
      if (!file.name.toLowerCase().endsWith('.zip')) throw new Error('Избери .zip архив на SketchyAR.');
      const result = await verifyBackup(file); // read-only: never writes production DB
      verified = result;
      details.textContent = `SHA-256 PASS · ${result.manifest.projects.length} проекта · ${result.manifest.assets.length} assets · ${result.manifest.presets.length} presets · ${(result.archiveBytes / 1024 / 1024).toFixed(2)} MiB. Код: ${result.archiveSha256.slice(0, 16)}…`;
      mergePlan = await currentMergePlan(result); // read-only; writer will recalculate atomically
      const p = mergePlan;
      details.textContent += ` За добавяне: ${p.projectIds.length} проекта, ${p.assetIds.length} assets, ${p.presetIds.length} presets. Налични: ${p.alreadyPresentProjects}. Пропуснати по конфликт: ${p.blockedNewProjects}.`;
      if (p.canRestore) {
        setStatus(`SHA-256 PASS · ще бъдат добавени ${p.projectIds.length} липсващи проекта. Съществуващите няма да се променят. Първо изпълни безопасния тест.`);
      } else if (p.blockedNewProjects) {
        setStatus(`ZIP е валиден, но ${p.blockedNewProjects} нови проекта имат конфликтни зависимости. Нищо няма да се записва.`, true);
      } else {
        setStatus('SHA-256 PASS · Всички проекти от архива вече присъстват. Няма нищо ново за добавяне.');
      }
      D.log('info', 'day16.verify', 'pass-read-only', {
        archiveSha256: result.archiveSha256, projects: result.manifest.projects.length,
        assets: result.assets.length, newProjects: p.projectIds.length,
        presentProjects: p.alreadyPresentProjects, blockedProjects: p.blockedNewProjects,
      });
    } catch (error) { verified = null; mergePlan = null; failure('verify', error); }
    finally { running = false; updateControls(); }
  }
  sandbox.addEventListener('click', () => {
    if (!chosen || !verified || running) return;
    const file = chosen;
    running = true; sandboxOk = false;
    setStatus('Тествам възстановяване в отделна IndexedDB база. Реалните проекти не се променят…');
    updateControls();
    void runDay16SandboxMerge(file).then(result => {
      sandboxOk = true;
      setStatus(mergePlan?.canRestore
        ? `SANDBOX MERGE PASS. Възможно е добавянето на ${mergePlan.projectIds.length} липсващи проекта след потвърждение.`
        : 'SANDBOX MERGE PASS. Всички проекти вече присъстват или имат конфликтни зависимости. Няма нови проекти за добавяне.');
      D.log('info', 'day16.sandbox_merge', 'pass', {
        archiveSha256: result.archiveSha256, recoveredProjects: result.recoveredProjects,
        unchangedProjects: result.unchangedProjects,
      });
    }).catch(error => { sandboxOk = false; failure('sandbox_restore', error); })
      .finally(() => { running = false; updateControls(); });
  });
  restore.addEventListener('click', () => {
    if (!chosen || !verified || !sandboxOk || !mergePlan?.canRestore || running) return;
    if (!window.confirm(`Да добавя ли ${mergePlan.projectIds.length} ЛИПСВАЩИ проекта към тази база?\n\nНаличните проекти се пропускат без промяна. Проекти с конфликтни зависимости няма да бъдат добавени. Няма изтриване или презаписване.`)) return;
    running = true;
    const file = chosen;
    setStatus('Проверявам ZIP повторно и добавям само липсващите цели проекти атомарно…');
    updateControls();
    void mergeBackupToCurrentDB(file).then(({ verified: result, added }) => {
      setStatus(`MERGE PASS: добавени ${added.projectIds.length} проекта, ${added.assetIds.length} assets и ${added.presetIds.length} presets. Пропуснати налични: ${added.alreadyPresentProjects}; блокирани по зависимост: ${added.blockedNewProjects}.`);
      D.log('info', 'day16.production_merge', 'pass', {
        archiveSha256: result.archiveSha256,
        projectsAdded: added.projectIds.length, assetsAdded: added.assetIds.length,
        existingProjectsKept: added.alreadyPresentProjects, blockedProjects: added.blockedNewProjects,
      });
      restoreCompleted = true; // Refuse duplicate submission from same dialog.
      if (added.projectIds.length) document.dispatchEvent(new Event('sketchyar:projects:changed'));
    }).catch(error => failure('production_merge', error))
      .finally(() => { running = false; updateControls(); });
  });

  diagnostics.addEventListener('click', () => {
    hideMenu();
    D.log('info', 'home', 'open-developer-diagnostics');
    openDiagnostics();
  });
  close.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeDialog(); });
  document.addEventListener('pointerdown', event => {
    if (popover.hidden || (event.target instanceof Node &&
        (popover.contains(event.target) || trigger.contains(event.target)))) return;
    hideMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!backdrop.hidden) { event.preventDefault(); closeDialog(); }
      else if (!popover.hidden) { event.preventDefault(); hideMenu(); trigger.focus(); }
      return;
    }
    if (event.key !== 'Tab' || backdrop.hidden) return;
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled])')]
      .filter(node => !node.closest('[hidden]') && node.getClientRects().length > 0);
    if (!focusables.length) return;
    if (event.shiftKey && document.activeElement === focusables[0]) {
      event.preventDefault(); focusables[focusables.length - 1].focus();
    } else if (!event.shiftKey && document.activeElement === focusables[focusables.length - 1]) {
      event.preventDefault(); focusables[0].focus();
    }
  });
  trigger.setAttribute('aria-expanded', 'false');
  return { close: closeAll };
}
