/** Day 8: public same-origin asset inventory. This does NOT mean Offline Ready. */
import * as D from './diagnostics';

interface Inventory {
  version: number;
  pyodideVersion: string;
  transport: string;
  packages: string[];
  opencvVendored: boolean;
  files: Record<string, { bytes: number; sha256: string }>;
}

const version = '314.0.8';

async function probe(): Promise<Record<string, unknown>> {
  // Relative to the application document so GitHub Pages /SketchyAR/ is honored.
  const base = new URL(`./pyodide/v${version}/`, document.baseURI);
  if (base.origin !== location.origin) throw new Error('Pyodide URL is cross-origin');
  const manifestRes = await fetch(new URL('inventory.json', base), { cache: 'no-store' });
  if (!manifestRes.ok) throw new Error(`Липсва локален inventory.json (${manifestRes.status})`);
  const inv = await manifestRes.json() as Inventory;
  if (inv.pyodideVersion !== version || !inv.packages.includes('numpy')) {
    throw new Error('Невалидна версия или липсва NumPy в inventory');
  }
  const failures: string[] = [];
  // Use HEAD to avoid downloading heavy wasm/wheels just for checking presence.
  for (const name of Object.keys(inv.files)) {
    const uri = new URL(name, base);
    const res = await fetch(uri, { method: 'HEAD', cache: 'no-store' });
    if (!res.ok || res.url && new URL(res.url).origin !== location.origin) failures.push(`${name}: HTTP ${res.status}`);
  }
  const fontFaces = await document.fonts.load('700 20px Caveat', 'Нова рисунка');
  const ok = failures.length === 0 && fontFaces.length > 0;
  const result = {
    sameOrigin: true,
    pyodideVersion: inv.pyodideVersion,
    bundledFiles: Object.keys(inv.files).length,
    bundledBytes: Object.values(inv.files).reduce((a, f) => a + f.bytes, 0),
    includedPackages: inv.packages,
    opencvVendored: inv.opencvVendored,
    caveatLoaded: fontFaces.length > 0,
    missingFiles: failures,
    status: ok ? 'FILES PRESENT (not offline-verified)' : 'FAIL',
  };
  D.log(ok ? 'info' : 'error', 'day8.assets', result.status, result);
  return result;
}

export function initDay8Diagnostics(): void {
  const button = document.getElementById('btn-day8-assets') as HTMLButtonElement | null;
  const result = document.getElementById('day8-assets-result');
  if (!button || !result) return;
  button.addEventListener('click', () => {
    button.disabled = true;
    result.textContent = 'Проверявам файловете на същия origin…';
    void probe().then(value => {
      result.textContent = JSON.stringify(value, null, 2);
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      D.log('error', 'day8.assets', message);
      result.textContent = JSON.stringify({ status: 'FAIL', error: message }, null, 2);
    }).finally(() => { button.disabled = false; });
  });
}
