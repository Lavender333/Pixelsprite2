# Pixel Creator — Deployment Guide

## What's in this package

```
pixel-creator/
├── index.html          ← The entire app (228KB, self-contained)
├── manifest.json       ← PWA manifest (installable as app)
├── sw.js               ← Service worker (offline support)
├── icon.svg            ← App icon (vector, all sizes)
├── icon-32.png         ← Favicon
├── icon-96.png         ← Shortcut icon
├── icon-180.png        ← Apple touch icon
├── icon-192.png        ← PWA icon (Android)
├── icon-512.png        ← PWA icon (large)
├── robots.txt          ← Search engine crawl rules
├── sitemap.xml         ← SEO sitemap (update URL before deploying)
├── _redirects          ← Netlify routing
├── netlify.toml        ← Netlify headers + cache config
├── vercel.json         ← Vercel routing + headers
└── .github/
    └── workflows/
        └── deploy.yml  ← GitHub Pages auto-deploy
```

---

## Option A — Netlify (Recommended, free, 2 minutes)

1. Go to [netlify.com](https://netlify.com) → Sign up free
2. Click **"Add new site"** → **"Deploy manually"**
3. Drag the entire `pixel-creator/` folder onto the deploy zone
4. Done — you get a live URL like `https://your-name.netlify.app`

**Custom domain:**
- Netlify dashboard → Site settings → Domain management → Add custom domain
- Point your domain's DNS `A` record to Netlify's IP or use their nameservers

**Auto-deploy from GitHub:**
1. Push this folder to a GitHub repo
2. Netlify → New site → Import from Git → select repo
3. Build command: leave blank. Publish directory: `.`
4. Every push to `main` auto-deploys

---

## Option B — Vercel (Also free, also 2 minutes)

```bash
# Install Vercel CLI
npm i -g vercel

# From inside the pixel-creator folder:
vercel

# Follow prompts — it detects the vercel.json automatically
# You get a URL like https://pixel-creator.vercel.app
```

Or drag-and-drop at [vercel.com/new](https://vercel.com/new) — same as Netlify.

---

## Option C — GitHub Pages (Free, needs GitHub account)

1. Create a new GitHub repo (public)
2. Push all files in this folder to the `main` branch
3. Repo Settings → Pages → Source: **GitHub Actions**
4. The `.github/workflows/deploy.yml` handles everything automatically
5. Your site goes live at `https://yourusername.github.io/repo-name`

**Important for GitHub Pages:** If deploying to a sub-path (not root domain), update `manifest.json` and `sw.js` start_url/scope to match. e.g. `"start_url": "/pixel-creator/"`.

---

## Option D — Any static host (Hostinger, Bluehost, cPanel, etc.)

1. ZIP the folder contents
2. Upload via FTP or file manager to `public_html/`
3. Make sure `index.html` is in the root

For Apache servers, create a `.htaccess` file:
```apache
Options -Indexes
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [L]

# Correct MIME type for manifest
AddType application/manifest+json .json

# Service worker scope
<Files "sw.js">
  Header set Cache-Control "no-cache"
  Header set Service-Worker-Allowed "/"
</Files>
```

---

## Before going live — update these

### 1. Your domain URL
Replace `https://pixelcreator.app/` in these files with your actual URL:
- `index.html` — `og:url`, `og:image`, `twitter:image`, `canonical`
- `sitemap.xml` — `<loc>`
- `robots.txt` — `Sitemap:` line
- `manifest.json` — `start_url` (if sub-path)

### 2. Create an OG image
The `og:image` tag references `og-image.png` — create a 1200×630px image
showing your app in action. Drop it in the root folder. This is what shows up
when someone shares your link on Twitter/Discord/iMessage.

---

## PWA — "Add to Home Screen"

Once deployed, users on mobile can:
- **iOS Safari:** tap the Share button → "Add to Home Screen"
- **Android Chrome:** tap the three-dot menu → "Add to Home Screen" or banner auto-appears

The app then runs fullscreen with no browser chrome, cached offline,
and feels identical to a native app.

---

## Performance

- **228KB total** — loads in ~0.3s on 4G, ~1s on 3G
- No external dependencies (no CDN, no fonts, no tracking)
- Service worker caches everything after first load — **subsequent visits are instant and offline**
- Lighthouse scores expected: Performance 95+, PWA 100, Accessibility 85+

---

## Analytics (optional)

The app has a built-in analytics plugin stub (`PluginRegistry`).
To add real analytics without touching the app code, add before `</body>`:

```html
<!-- Plausible (privacy-friendly, no cookies) -->
<script defer data-domain="pixelcreator.app" src="https://plausible.io/js/script.js"></script>
```

Or PostHog, Fathom, or Google Analytics — drop the snippet in `index.html`.

---

## Support

The app stores user projects in `localStorage` — no backend required.
No accounts, no servers, no database. Everything runs in the browser.
