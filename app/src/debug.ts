// Eruda (in-page DevTools) от нашия origin, без CDN. Безопасно за деплой build: включва се само с флаг.
// Home Screen стартът губи ?debug=1 (използва start_url), затова флагът се пази в localStorage
// и се превключва и с 5 бързи докосвания върху версията.
const KEY = 'ard.debug';

export function debugWanted(): boolean {
  const q = new URLSearchParams(location.search).get('debug');
  try {
    if (q === '1') localStorage.setItem(KEY, '1');
    else if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return q === '1';
  }
}

export async function enableDebug(): Promise<void> {
  const { default: eruda } = await import('eruda');
  eruda.init();
}

export function toggleDebug(): void {
  try {
    if (localStorage.getItem(KEY) === '1') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '1');
  } catch {
    /* без хранилище */
  }
  const url = new URL(location.href);
  url.searchParams.delete('debug'); // иначе ?debug=1 в адреса би го включил отново
  location.replace(url.toString());
}
