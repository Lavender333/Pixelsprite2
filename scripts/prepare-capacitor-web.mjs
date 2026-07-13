import {
  cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = join(root, 'dist');
const iosAppDir = join(root, 'ios', 'App', 'App');
const iosPublicDir = join(iosAppDir, 'public');

// Files that must exist. A missing one is a build failure, not a warning —
// the last submission shipped without a working auth SDK precisely because a
// silently-absent dependency was tolerated at runtime.
const requiredFiles = [
  'index.html',
  'privacy-policy.html',
  'terms.html',                       // App Store Guideline 3.1.2 — EULA must be reachable in-app
  'style.css',
  'script.js',
  'vendor/supabase-js.min.js',        // bundled, NOT loaded from a CDN
  'manifest.json'
];

const includeFiles = [
  ...requiredFiles,
  'antiwash-upgrade.js',
  'antiwash-upgrade-extended.js',
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

// Directories copied wholesale.
const includeDirs = ['vendor'];

// ── Preflight ────────────────────────────────────────────────────────
const missing = requiredFiles.filter(f => !existsSync(join(root, f)));
if (missing.length) {
  console.error('\n✗ Build aborted. Missing required files:\n');
  for (const f of missing) console.error(`    ${f}`);
  console.error('');
  process.exit(1);
}

// A packaged native app must not depend on the network to boot. Any remote
// <script> or <link> in index.html is a launch-time failure waiting to happen —
// and it is what made the sign-in buttons dead in App Review.
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
// Only assets the browser actually fetches and executes/applies. A canonical
// <link>, og:url, or an anchor href is metadata, not a runtime dependency.
const remoteRefs = [
  ...[...indexHtml.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]),
  ...[...indexHtml.matchAll(/<link[^>]*rel=["'](?:stylesheet|preload|modulepreload|prefetch)["'][^>]*href=["'](https?:\/\/[^"']+)["']/gi)].map(m => m[1]),
  ...[...indexHtml.matchAll(/<link[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*rel=["'](?:stylesheet|preload|modulepreload|prefetch)["']/gi)].map(m => m[1])
];

if (remoteRefs.length) {
  console.error('\n✗ Build aborted. index.html loads assets from the network:\n');
  for (const url of remoteRefs) console.error(`    ${url}`);
  console.error(`
  Bundle these locally instead. If the device is offline, on a captive portal,
  or the CDN is slow, these never load and the features that depend on them
  silently do nothing.

  For supabase-js, replace:
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  with:
    <script src="vendor/supabase-js.min.js"></script>
`);
  process.exit(1);
}

// ── Build ────────────────────────────────────────────────────────────
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const file of includeFiles) {
  const from = join(root, file);
  if (!existsSync(from)) continue;
  const to = join(outDir, file);
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(from, to, { recursive: true });
}

for (const dir of includeDirs) {
  const from = join(root, dir);
  if (existsSync(from)) {
    cpSync(from, join(outDir, dir), { recursive: true });
  }
}

// Sweep up any remaining loose root-level assets (icons, extra images, etc.)
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (!/\.(png|jpg|jpeg|webp|gif|json|txt|xml|svg|js|css|html)$/i.test(entry.name)) continue;
  if (includeFiles.includes(entry.name)) continue;
  cpSync(join(root, entry.name), join(outDir, entry.name), { recursive: true });
}

console.log('✓ Prepared dist/ for Capacitor iOS build.');

// ── Sanity checks on the produced bundle ─────────────────────────────
const vendorOut = join(outDir, 'vendor', 'supabase-js.min.js');
if (!existsSync(vendorOut)) {
  console.error('✗ vendor/supabase-js.min.js did not make it into dist/. Aborting.');
  process.exit(1);
}
console.log('✓ supabase-js is bundled locally.');

if (!indexHtml.includes('vendor/supabase-js.min.js')) {
  console.warn('⚠ index.html does not reference vendor/supabase-js.min.js — auth will not initialize.');
}
if (!indexHtml.includes('terms.html')) {
  console.warn('⚠ index.html does not link to terms.html — Guideline 3.1.2 requires an in-app EULA link on the paywall.');
}
if (!indexHtml.toLowerCase().includes('restore purchases')) {
  console.warn('⚠ No "Restore Purchases" control found in index.html — Guideline 3.1.1 requires one.');
}

// ── Stage into the native project ────────────────────────────────────
if (existsSync(iosAppDir)) {
  rmSync(iosPublicDir, { recursive: true, force: true });
  cpSync(outDir, iosPublicDir, { recursive: true });
  cpSync(join(root, 'capacitor.config.json'), join(iosAppDir, 'capacitor.config.json'));

  const capConfig = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8'));
  const classList = capConfig?.ios?.packageClassList ?? [];
  if (!classList.includes('StoreKitPlugin')) {
    console.warn('⚠ capacitor.config.json is missing ios.packageClassList: ["StoreKitPlugin"] — the purchase bridge will not register.');
  }

  writeFileSync(join(iosAppDir, 'config.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<widget id="com.truelavender.pixelspritevibe" version="1.0.0" xmlns="http://www.w3.org/ns/widgets">
  <name>Pixel Sprite Vibe</name>
  <description>Pixel art studio packaged with Capacitor.</description>
  <author>True Lavender Digital Solutions</author>
</widget>
`);
  console.log('✓ Prepared ios/App/App/ Capacitor assets.');
}
