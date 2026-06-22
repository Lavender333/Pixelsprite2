import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = join(root, 'dist');
const iosAppDir = join(root, 'ios', 'App', 'App');
const iosPublicDir = join(iosAppDir, 'public');

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

if (existsSync(iosAppDir)) {
  rmSync(iosPublicDir, { recursive: true, force: true });
  cpSync(outDir, iosPublicDir, { recursive: true });
  cpSync(join(root, 'capacitor.config.json'), join(iosAppDir, 'capacitor.config.json'));
  writeFileSync(join(iosAppDir, 'config.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<widget id="com.truelavender.pixelspritevibe" version="1.0.0" xmlns="http://www.w3.org/ns/widgets">
  <name>Pixel Sprite Vibe</name>
  <description>Pixel art studio packaged with Capacitor.</description>
  <author>True Lavender Digital Solutions</author>
</widget>
`);
  console.log('Prepared ios/App/App/ Capacitor assets.');
}
