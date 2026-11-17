// Проби на средата и възможностите (Ден 1): отговарят предварително на въпроси за Дни 13-20
// (OPFS, Web Share с файлове, Wake Lock, WebGPU adapter, cross-origin isolation).

export interface EnvSnapshot {
  displayMode: 'standalone' | 'browser';
  online: boolean;
  ua: string;
  viewport: string;
  screen: string;
  dpr: number;
  cores: number;
  swController: boolean;
  storage: { usageMB: number; quotaMB: number } | null;
  persisted: boolean | null;
  feature: Record<string, boolean>;
}

const mb = (n: number | undefined): number => Math.round((n ?? 0) / 1048576);

function displayMode(): 'standalone' | 'browser' {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser';
}

function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 't.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

let features: Promise<Record<string, boolean>> | undefined;

// Възможностите не се менят по време на сесия: пробваме веднъж.
export function probeFeatures(): Promise<Record<string, boolean>> {
  features ??= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav: any = navigator;
    let gpuAdapter = false;
    try {
      gpuAdapter = !!(await nav.gpu?.requestAdapter?.());
    } catch {
      gpuAdapter = false;
    }
    return {
      secureContext: isSecureContext,
      crossOriginIsolated: self.crossOriginIsolated === true,
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      webAssembly: typeof WebAssembly === 'object',
      worker: typeof Worker !== 'undefined',
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      createImageBitmap: typeof createImageBitmap === 'function',
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      requestVideoFrameCallback: 'requestVideoFrameCallback' in HTMLVideoElement.prototype,
      indexedDB: 'indexedDB' in self,
      cacheStorage: 'caches' in self,
      serviceWorker: 'serviceWorker' in navigator,
      storagePersist: !!nav.storage?.persist,
      opfs: !!nav.storage?.getDirectory,
      wakeLock: 'wakeLock' in navigator,
      webShare: !!navigator.share,
      webShareFiles: canShareFiles(),
      webGPU: 'gpu' in navigator,
      webGPUAdapter: gpuAdapter,
    };
  })();
  return features;
}

export async function probeEnv(): Promise<EnvSnapshot> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const persisted = await navigator.storage?.persisted?.().catch(() => undefined);
  return {
    displayMode: displayMode(),
    online: navigator.onLine,
    ua: navigator.userAgent,
    viewport: `${innerWidth}x${innerHeight}`,
    screen: `${screen.width}x${screen.height}`,
    dpr: devicePixelRatio,
    cores: navigator.hardwareConcurrency,
    swController: !!navigator.serviceWorker?.controller,
    storage: estimate ? { usageMB: mb(estimate.usage), quotaMB: mb(estimate.quota) } : null,
    persisted: persisted ?? null,
    feature: await probeFeatures(),
  };
}
