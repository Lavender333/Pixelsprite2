// PixelSprite Anti-Wash Master System — Phase 2 (Extended)
// Applies value-range, hue-shift, form-separation, and category-specific rules.

(function () {
  const BG_HEX = '#18181F';

  function awHexToRGB(hex) {
    const h = String(hex || '').replace('#', '').padEnd(6, '0').slice(0, 6);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function awRGBToHex(r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  function awBrightness(rgb) {
    return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 2.55;
  }

  function awShift(rgb, dr, dg, db) {
    return {
      r: Math.max(0, Math.min(255, rgb.r + dr)),
      g: Math.max(0, Math.min(255, rgb.g + dg)),
      b: Math.max(0, Math.min(255, rgb.b + db)),
    };
  }

  function awMix(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }

  function awRgbToHsl(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return { h: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
    return { h: h * 360, s, l };
  }

  function awClassifyFamily(hex) {
    const hsl = awRgbToHsl(awHexToRGB(hex));
    if (hsl.s < 0.12) return 'neutral';
    if (hsl.h >= 25 && hsl.h <= 60) return 'yellow';
    if (hsl.h > 60 && hsl.h <= 165) return 'green';
    if (hsl.h > 165 && hsl.h <= 255) return 'blue';
    if (hsl.h > 255 && hsl.h <= 330) return 'pink';
    return 'red';
  }

  function awHueShiftShadow(hex, family) {
    const c = awHexToRGB(hex);
    if (family === 'green') return awRGBToHex(...Object.values(awShift(c, -4, -6, 14)));
    if (family === 'red' || family === 'pink') return awRGBToHex(...Object.values(awShift(c, 10, -6, 14)));
    if (family === 'yellow') return awRGBToHex(...Object.values(awShift(c, 14, -3, -9)));
    if (family === 'blue') return awRGBToHex(...Object.values(awShift(c, 10, -8, 14)));
    // Outline standardization: replace dead black with deep navy-like shadow.
    return awRGBToHex(16, 24, 44);
  }

  function awNormalizeList(pal) {
    const uniq = [];
    const seen = new Set();
    (pal || []).forEach(c => {
      const h = awRGBToHex(...Object.values(awHexToRGB(c))).toUpperCase();
      if (!seen.has(h)) {
        seen.add(h);
        uniq.push(h);
      }
    });
    return uniq;
  }

  function awRemoveNearMidtones(pal) {
    if (pal.length <= 3) return pal.slice();
    const sorted = pal.slice().sort((a, b) => awBrightness(awHexToRGB(a)) - awBrightness(awHexToRGB(b)));
    const out = [sorted[0]];
    for (let i = 1; i < sorted.length - 1; i++) {
      const prevB = awBrightness(awHexToRGB(out[out.length - 1]));
      const curB = awBrightness(awHexToRGB(sorted[i]));
      if (Math.abs(curB - prevB) >= 8) out.push(sorted[i]);
    }
    out.push(sorted[sorted.length - 1]);
    return awNormalizeList(out);
  }

  function awEnsureValueRange(pal) {
    if (!pal.length) return pal;
    const out = pal.slice();
    let minIdx = 0;
    let maxIdx = 0;
    for (let i = 1; i < out.length; i++) {
      if (awBrightness(awHexToRGB(out[i])) < awBrightness(awHexToRGB(out[minIdx]))) minIdx = i;
      if (awBrightness(awHexToRGB(out[i])) > awBrightness(awHexToRGB(out[maxIdx]))) maxIdx = i;
    }
    const minB = awBrightness(awHexToRGB(out[minIdx]));
    const maxB = awBrightness(awHexToRGB(out[maxIdx]));
    if (minB > 25) {
      const c = awHexToRGB(out[minIdx]);
      out[minIdx] = awRGBToHex(c.r * 0.8, c.g * 0.8, c.b * 0.8);
    }
    if (maxB < 85) {
      const c = awHexToRGB(out[maxIdx]);
      out[maxIdx] = awRGBToHex(c.r + (255 - c.r) * 0.12, c.g + (255 - c.g) * 0.12, c.b + (255 - c.b) * 0.12);
    }
    return awNormalizeList(out);
  }

  function awBuildThreeToneFamilies(pal) {
    const buckets = {
      neutral: [], red: [], pink: [], yellow: [], green: [], blue: [],
    };
    pal.forEach(hex => buckets[awClassifyFamily(hex)].push(hex));
    const out = [];
    Object.keys(buckets).forEach(fam => {
      const arr = buckets[fam];
      if (!arr.length) return;
      const sorted = arr.slice().sort((a, b) => awBrightness(awHexToRGB(a)) - awBrightness(awHexToRGB(b)));
      const low = sorted[0];
      const mid = sorted[Math.floor(sorted.length / 2)];
      const hi = sorted[sorted.length - 1];
      const shiftedLow = awHueShiftShadow(low, fam);
      out.push(shiftedLow, mid, hi);
      // Optional deep shadow for grounding.
      if (fam !== 'neutral') {
        const l = awHexToRGB(shiftedLow);
        out.push(awRGBToHex(l.r * 0.84, l.g * 0.84, l.b * 0.84));
      }
    });
    return awNormalizeList(out);
  }

  function awEnforceBackgroundContrast(pal) {
    if (!pal.length) return pal;
    const bgB = awBrightness(awHexToRGB(BG_HEX));
    const avg = pal.reduce((s, c) => s + awBrightness(awHexToRGB(c)), 0) / pal.length;
    if (Math.abs(avg - bgB) >= 20) return pal;
    const targetLift = avg <= bgB ? -18 : 18;
    return pal.map(hex => {
      const c = awHexToRGB(hex);
      const d = targetLift;
      return awRGBToHex(c.r + d, c.g + d, c.b + d);
    });
  }

  function awCategoryProfile(name) {
    const n = String(name || '').toLowerCase();
    if (/ghost|dragon|cat|dog|pet/.test(n)) return 'pets';
    if (/hoodie|cap|sneaker|shirt|pants|wear|boot|purse/.test(n)) return 'wearables';
    if (/shield|badge|icon|ui/.test(n)) return 'ui-icons';
    if (/city|forest|room|scene|space/.test(n)) return 'scenes';
    if (/glow|spark|fire|star|glitter/.test(n)) return 'effects';
    return 'default';
  }

  function awApplyCategoryRules(pal, name) {
    const category = awCategoryProfile(name);
    let out = pal.slice();
    if (!out.length) return out;

    // Core shadow/highlight anchors for depth requirements.
    const darkest = out.slice().sort((a, b) => awBrightness(awHexToRGB(a)) - awBrightness(awHexToRGB(b)))[0];
    const brightest = out.slice().sort((a, b) => awBrightness(awHexToRGB(b)) - awBrightness(awHexToRGB(a)))[0];
    const d = awHexToRGB(darkest);
    const h = awHexToRGB(brightest);

    if (category === 'pets') {
      out.push(awRGBToHex(d.r * 0.8, d.g * 0.8, d.b * 0.8)); // darker feet / underbody
      out.push(awRGBToHex(d.r * 0.72, d.g * 0.72, d.b * 0.72)); // grounding 1px shadow
      out.push(awRGBToHex(h.r + (255 - h.r) * 0.1, h.g + (255 - h.g) * 0.1, h.b + (255 - h.b) * 0.1)); // eye accent highlight
    } else if (category === 'wearables') {
      out.push(awRGBToHex(d.r * 0.78, d.g * 0.78, d.b * 0.78)); // fold shadow
      out.push(awRGBToHex(h.r + (255 - h.r) * 0.1, h.g + (255 - h.g) * 0.1, h.b + (255 - h.b) * 0.1)); // top rim highlight
      out = awRemoveNearMidtones(out);
    } else if (category === 'ui-icons') {
      out.push(awRGBToHex(d.r * 0.76, d.g * 0.76, d.b * 0.76)); // lower quadrant dark
      out.push(awRGBToHex(h.r + (255 - h.r) * 0.12, h.g + (255 - h.g) * 0.12, h.b + (255 - h.b) * 0.12)); // highlight slab
    } else if (category === 'scenes') {
      // Foreground/mid/background split and slight desaturation for far planes.
      const mid = awMix(awHexToRGB(darkest), awHexToRGB(brightest), 0.5);
      out.push(awRGBToHex(mid.r * 0.82, mid.g * 0.82, mid.b * 0.82));
      out.push(awRGBToHex(mid.r * 0.95, mid.g * 0.95, mid.b * 0.95));
      out.push(awRGBToHex(h.r * 0.9 + 8, h.g * 0.9 + 8, h.b * 0.9 + 8));
    } else if (category === 'effects') {
      // Contrast spikes: bright core and deep edge.
      out.push('#FFFFFF');
      out.push(awRGBToHex(d.r * 0.7, d.g * 0.7, d.b * 0.7));
      out = awRemoveNearMidtones(out);
    }

    return awNormalizeList(out);
  }

  function awRefineEffectPalette(effectName, pal) {
    const n = String(effectName || '').toLowerCase();
    if (/fire/.test(n)) return ['#2B0B00', '#8A1F00', '#FF4D00', '#FF9900', '#FFD84D', '#FFF5C2', '#FFFFFF'];
    if (/glow/.test(n)) return ['#1A1A2B', '#3A3A66', '#6C63FF', '#9B94FF', '#DAD8FF', '#FFFFFF'];
    if (/spark|glitter|star/.test(n)) return ['#2E2244', '#6C4AA3', '#CE93D8', '#A8DAFF', '#FFF4BE', '#FFFFFF'];
    return pal;
  }

  function awUpgradePalette(pal, name) {
    let out = awNormalizeList(pal);
    out = awEnsureValueRange(out);
    out = awRemoveNearMidtones(out);
    out = awBuildThreeToneFamilies(out);
    out = awApplyCategoryRules(out, name);
    out = awEnforceBackgroundContrast(out);
    out = awEnsureValueRange(out);

    // Outline standardization and anti-wash finish pass.
    out = out.map(hex => {
      const b = awBrightness(awHexToRGB(hex));
      if (b < 7) return '#10182C';
      return hex;
    });

    // Keep compact but expressive palette.
    const maxLen = 10;
    if (out.length > maxLen) {
      const sorted = out.slice().sort((a, b) => awBrightness(awHexToRGB(a)) - awBrightness(awHexToRGB(b)));
      const picked = [];
      for (let i = 0; i < maxLen; i++) {
        const pos = Math.round(i * (sorted.length - 1) / (maxLen - 1));
        picked.push(sorted[pos]);
      }
      out = awNormalizeList(picked);
    }

    return out;
  }

  function awUpgradeTemplatesCollection(collection) {
    if (!Array.isArray(collection)) return;
    collection.forEach(t => {
      if (!Array.isArray(t.palette) || !t.palette.length) return;
      let upgraded = awUpgradePalette(t.palette, t.name || t.id || '');
      if (collection === window.EFFECTS_LIST) {
        upgraded = awRefineEffectPalette(t.name || t.id || '', upgraded);
      }
      t.palette = upgraded;
    });
  }

  function upgradeAllPalettesExtended() {
    awUpgradeTemplatesCollection(window.COLORING_TEMPLATES || []);
    awUpgradeTemplatesCollection(window.ANIM_TEMPLATES || []);
    awUpgradeTemplatesCollection(window.EFFECTS_LIST || []);

    if (window.TEMPLATES) {
      Object.values(window.TEMPLATES).forEach(arr => awUpgradeTemplatesCollection(arr));
    }

    console.info('Template palettes upgraded (Phase 2 anti-wash rules applied).');
  }

  window.upgradeAllPalettesExtended = upgradeAllPalettesExtended;
})();
