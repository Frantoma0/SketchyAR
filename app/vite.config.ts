import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'nogit';
  }
}

// base './' -> работи на github.io/<repo>/ и на всеки друг път, без име на репото в конфигурацията.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  // allowedHosts: за Cloudflare Quick Tunnel при UI цикъла (Дни 4-6).
  server: {
    host: true, port: 5173, allowedHosts: ['.trycloudflare.com'],
    // Allows Vite to import the single shared Python module as ?raw from ../python_engine/.
    fs: { allow: ['..'] },
  },
  build: { target: 'es2022', sourcemap: true },
});
