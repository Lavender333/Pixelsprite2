import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = join(root, 'dist');

const includeFiles = [
  'index.html',
  'privacy-policy.html',
  'style.css',
  'script.js',
  'antiwash-upgrade.js',
  'antiwash-upgrade-extended.js',
  'manifest.json',
  'sw.js',
  'logo.png',
  'icon.svg',
  'icon-32.png',
  'icon-96.png',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
  'robots.txt',
  'sitemap.xml',
  'CNAME'
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of includeFiles) {
  const from = join(root, file);
  if (existsSync(from)) {
    cpSync(from, join(outDir, file), { recursive: true });
  }
}

for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(png|jpg|jpeg|webp|gif|json|txt|xml|svg|js|css|html)$/i.test(entry.name)) continue;
  if (includeFiles.includes(entry.name)) continue;
  cpSync(join(root, entry.name), join(outDir, entry.name), { recursive: true });
}

console.log('Prepared dist/ for Capacitor iOS build.');
