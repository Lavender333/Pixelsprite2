// PIXELSPRITE ANTI-WASH MASTER SYSTEM — PHASE 1 (EXTENDED)
// Upgrades palettes for COLORING_TEMPLATES, ANIM_TEMPLATES, TEMPLATES, and EFFECTS_LIST
// Usage: Call upgradeAllPalettesExtended() in dev console or integrate into build

// Utility: Convert hex to RGB and back
function hexToRGB(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}
function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}
function brightness({ r, g, b }) {
  // Perceptual brightness (0-100)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 2.55;
}

// 1. Value Range Law
function enforceValueRange(pal) {
  let minB = 100, maxB = 0;
  let minIdx = 0, maxIdx = 0;
  pal.forEach((c, i) => {
    const b = brightness(hexToRGB(c));
    if (b < minB) { minB = b; minIdx = i; }
    if (b > maxB) { maxB = b; maxIdx = i; }
  });
  // Deepen shadow
  if (minB > 25) {
    const rgb = hexToRGB(pal[minIdx]);
    pal[minIdx] = rgbToHex(rgb.r * 0.8, rgb.g * 0.8, rgb.b * 0.8);
  }
  // Brighten highlight
  if (maxB < 85) {
    const rgb = hexToRGB(pal[maxIdx]);
    pal[maxIdx] = rgbToHex(
      rgb.r + (255 - rgb.r) * 0.13,
      rgb.g + (255 - rgb.g) * 0.13,
      rgb.b + (255 - rgb.b) * 0.13
    );
  }
  return pal;
}

// 2. 3-Tone Per Color Rule (simplified: keep highlight, base, shadow)
function reduceTo3Tones(pal) {
  if (pal.length <= 3) return pal;
  // Sort by brightness
  const sorted = pal
    .map(c => ({ c, b: brightness(hexToRGB(c)) }))
    .sort((a, b) => a.b - b.b);
  return [sorted[0].c, sorted[Math.floor(sorted.length / 2)].c, sorted[sorted.length - 1].c];
}

// 3. Hue Shift Shadow System
function hueShiftShadow(baseHex, family) {
  const rgb = hexToRGB(baseHex);
  let { r, g, b } = rgb;
  // Shift shadow hue based on color family
  if (family === 'green') b += 10;
  if (family === 'red' || family === 'pink') b += 10;
  if (family === 'yellow') r += 10;
  if (family === 'blue') r += 10;
  return rgbToHex(r, g, b);
}

// 4. Remove Redundant Mid-tones
function removeMidtones(pal) {
  if (pal.length <= 3) return pal;
  // Remove colors with brightness within 10 of neighbors
  const bArr = pal.map(c => brightness(hexToRGB(c)));
  return pal.filter((c, i) => {
    if (i === 0 || i === pal.length - 1) return true;
    return (
      Math.abs(bArr[i] - bArr[i - 1]) > 10 ||
      Math.abs(bArr[i] - bArr[i + 1]) > 10
    );
  });
}

// Main upgrade function for a palette
function upgradePalette(pal, family = '') {
  let p = pal.slice();
  p = enforceValueRange(p);
  p = removeMidtones(p);
  p = reduceTo3Tones(p);
  // Optionally apply hue shift to shadow
  if (p.length === 3) p[0] = hueShiftShadow(p[0], family);
  return p;
}

// Helper: Guess color family from name
function guessFamily(name) {
  if (/green/i.test(name)) return 'green';
  if (/red|rose|pink/i.test(name)) return 'red';
  if (/yellow|gold/i.test(name)) return 'yellow';
  if (/blue|aqua|cyan/i.test(name)) return 'blue';
  return '';
}

// Apply to all COLORING_TEMPLATES, ANIM_TEMPLATES, TEMPLATES, EFFECTS_LIST
function upgradeAllPalettesExtended() {
  // COLORING_TEMPLATES
  if (window.COLORING_TEMPLATES) {
    window.COLORING_TEMPLATES.forEach(t => {
      t.palette = upgradePalette(t.palette, guessFamily(t.name));
    });
  }
  // ANIM_TEMPLATES (if palette property exists)
  if (window.ANIM_TEMPLATES) {
    window.ANIM_TEMPLATES.forEach(t => {
      if (t.palette) t.palette = upgradePalette(t.palette, guessFamily(t.name));
    });
  }
  // TEMPLATES (all categories)
  if (window.TEMPLATES) {
    Object.values(window.TEMPLATES).forEach(arr => {
      arr.forEach(t => {
        if (t.palette) t.palette = upgradePalette(t.palette, guessFamily(t.name));
      });
    });
  }
  // EFFECTS_LIST (if palette property exists)
  if (window.EFFECTS_LIST) {
    window.EFFECTS_LIST.forEach(e => {
      if (e.palette) e.palette = upgradePalette(e.palette, guessFamily(e.name));
    });
  }
  alert('All palettes upgraded (Phase 1: Anti-Wash, Extended)!');
}

// To use: open dev console and run upgradeAllPalettesExtended();
