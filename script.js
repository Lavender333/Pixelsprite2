function exportTransparentPNG() {
  // Export current frame as transparent PNG (8x upscaled)
  captureFrame();
  const scale = 8;
  const cvs = document.createElement('canvas');
  cvs.width = ST.size * scale;
  cvs.height = ST.size * scale;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, cvs.width, cvs.height);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, cvs.width, cvs.height);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'transparent.png';
      a.click();
      SFX.share();
      toast('Transparent PNG exported! 🟪');
      addXP(6);
      Economy.track('project:export', { format: 'transparent-png' });
    });
  }
}

function startCreating(){
  const splash = document.getElementById('birthday-splash');
  if(!splash) return;
  splash.classList.add('hidden');
  // Prevent Safari from letting a hidden fixed overlay intercept taps.
  splash.style.pointerEvents = 'none';
  splash.style.zIndex = '-1';
  splash.setAttribute('aria-hidden', 'true');
  // Fully remove the node so no overlay can block nav/buttons.
  setTimeout(()=>{ splash.remove(); }, 50);
}

// ╔══════════════════════════════════════════════════════════════════════╗
// ║           P I X E L   S T U D I O   C O R E   v2.0                 ║
// ║   Central Store · EventBus · Tool Engine · Layer Engine             ║
// ║   Canvas Renderer · Plugin System · Economy Hooks                   ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── 1. EVENT BUS ──────────────────────────────────────────────────────
// Lightweight pub/sub. Anything can emit; anything can listen.
// Decouples tools, UI, economy, and plugins completely.
const EventBus = (() => {
  const listeners = {};
  return {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return () => this.off(event, fn); // returns unsubscribe fn
    },
    off(event, fn) {
      if (listeners[event]) listeners[event] = listeners[event].filter(f => f !== fn);
    },
    emit(event, payload) {
      (listeners[event] || []).forEach(fn => { try { fn(payload); } catch(e) { console.warn('[EventBus]', event, e); } });
    },
  };
})();

// ── 2. PLUGIN REGISTRY ────────────────────────────────────────────────
// Marketplace-ready. Register tools, effects, economy hooks, analytics.
// Plugins are objects with lifecycle hooks: onInit, onEvent, onDispose.
const PluginRegistry = (() => {
  const plugins = [];
  return {
    register(plugin) {
      if (typeof plugin.onInit === 'function') plugin.onInit();
      plugins.push(plugin);
      EventBus.emit('plugin:registered', { name: plugin.name || 'unnamed' });
    },
    emit(event, payload) {
      plugins.forEach(p => {
        if (typeof p.onEvent === 'function') {
          try { p.onEvent(event, payload); } catch(e) {}
        }
      });
    },
    getAll() { return [...plugins]; },
  };
})();

// ── 3. ECONOMY ENGINE ─────────────────────────────────────────────────
// Tracks all creative actions. XP, streaks, achievements, currency hooks.
// Emits events that plugins / future backend can subscribe to.
const Economy = (() => {
  const ACTION_XP = {
    'pixel:paint': 0,       // too frequent, only batch
    'pixel:fill': 2,
    'frame:add': 3,
    'frame:duplicate': 2,
    'fx:apply': 5,
    'template:load': 5,
    'project:save': 20,
    'project:export': 5,
    'challenge:complete': 0, // set per-challenge
    'session:start': 10,
  };
  let batchPaintCount = 0;
  let batchTimer = null;
  return {
    track(actionType, meta = {}) {
      // Batch rapid paints into 1 XP event per stroke
      if (actionType === 'pixel:paint') {
        batchPaintCount++;
        clearTimeout(batchTimer);
        batchTimer = setTimeout(() => {
          if (batchPaintCount > 0) {
            const xp = Math.min(3, Math.ceil(batchPaintCount / 8));
            EventBus.emit('economy:xp', { amount: xp, reason: 'pixel:paint', pixels: batchPaintCount });
            batchPaintCount = 0;
          }
        }, 400);
        return;
      }
      const xp = meta.xp !== undefined ? meta.xp : (ACTION_XP[actionType] || 0);
      if (xp > 0) EventBus.emit('economy:xp', { amount: xp, reason: actionType, meta });
      EventBus.emit('economy:action', { type: actionType, meta });
      PluginRegistry.emit('economy:action', { type: actionType, xp, meta });
    },
    // Called by store on every dispatch - future backend hook
    evaluate(action) {
      this.track(action.type, action.meta || {});
    },
  };
})();

// ── 4. CENTRAL STORE ──────────────────────────────────────────────────
// Single source of truth. Immutable state transitions via reducer.
// Undo/redo at action level (not just pixel level).
// All mutations go through dispatch() - no direct state writes.
const Store = (() => {
  // ── Reducer: pure function, state × action → state ──
  function reducer(state, action) {
    switch (action.type) {

      case 'canvas:setSize':
        return { ...state, size: action.size, zoom: action.zoom || state.zoom };

      case 'canvas:setZoom':
        return { ...state, zoom: Math.max(1, Math.min(32, action.zoom)) };

      case 'tool:set':
        return { ...state, tool: action.tool };

      case 'tool:setColor':
        return { ...state, color: action.color };

      case 'tool:setBrushSize':
        return { ...state, brushSize: action.brushSize };

      case 'tool:toggleMirror':
        return { ...state, mirror: !state.mirror };

      case 'tool:toggleOnion':
        return { ...state, onion: !state.onion };

      case 'layer:setActive':
        return { ...state, activeLayer: action.layerId };

      case 'layer:setVisible': {
        const layers = state.layers.map(l =>
          l.id === action.layerId ? { ...l, visible: action.visible } : l
        );
        return { ...state, layers };
      }

      case 'layer:setOpacity': {
        const layers = state.layers.map(l =>
          l.id === action.layerId ? { ...l, opacity: action.opacity } : l
        );
        return { ...state, layers };
      }

      case 'layer:add': {
        const newLayer = { id: 'layer_' + Date.now(), name: action.name || 'Layer ' + (state.layers.length + 1), visible: true, opacity: 1, locked: false };
        return { ...state, layers: [...state.layers, newLayer], activeLayer: newLayer.id };
      }

      case 'layer:remove': {
        if (state.layers.length <= 1) return state;
        const layers = state.layers.filter(l => l.id !== action.layerId);
        const activeLayer = state.activeLayer === action.layerId ? layers[layers.length - 1].id : state.activeLayer;
        return { ...state, layers, activeLayer };
      }

      case 'layer:reorder': {
        const layers = [...state.layers];
        const [moved] = layers.splice(action.from, 1);
        layers.splice(action.to, 0, moved);
        return { ...state, layers };
      }

      case 'frame:setFPS':
        return { ...state, fps: Math.max(1, Math.min(24, action.fps)) };

      case 'frame:setPlaying':
        return { ...state, playing: action.playing };

      case 'ui:setGrid':
        return { ...state, showGrid: action.visible };

      default:
        return state;
    }
  }

  // ── Store state ──
  let _state = null;
  const _listeners = new Set();

  return {
    init(initialState) {
      _state = initialState;
    },

    getState() {
      return _state;
    },

    dispatch(action) {
      const prev = _state;
      _state = reducer(_state, action);
      // Economy tracking on every action
      Economy.evaluate(action);
      // Notify all subscribers
      _listeners.forEach(fn => { try { fn(_state, prev, action); } catch(e) {} });
      // Broadcast on EventBus for plugins
      EventBus.emit('store:dispatch', { action, state: _state });
    },

    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn); // returns unsubscribe fn
    },

    // Convenience selector
    select(selector) {
      return selector(_state);
    },
  };
})();

// ── 5. TOOL ENGINE ────────────────────────────────────────────────────
// Modular, pluggable tools. Each tool is a class with apply() and
// optional onStart/onMove/onEnd lifecycle. Tools never touch DOM directly.
const ToolEngine = (() => {
  const registry = {};
  let _activeTool = null;

  class BaseTool {
    constructor(id) { this.id = id; }
    onStart(ctx, x, y, state) {}
    onMove(ctx, x, y, state) {}
    onEnd(ctx, state) {}
    // Override apply for single-click tools (fill, eyedrop)
    apply(ctx, x, y, state) {}
  }

  class PencilTool extends BaseTool {
    constructor() { super('pencil'); }
    onStart(ctx, x, y, state) { this._paint(ctx, x, y, state); }
    onMove(ctx, x, y, state) { this._paint(ctx, x, y, state); }
    _paint(ctx, x, y, state) {
      const b = state.brushSize;
      ctx.fillStyle = state.color;
      ctx.fillRect(x, y, b, b);
      if (state.mirror) ctx.fillRect(state.size - x - b, y, b, b);
      Economy.track('pixel:paint');
      EventBus.emit('tool:paint', { x, y, color: state.color, tool: 'pencil' });
    }
  }

  class EraserTool extends BaseTool {
    constructor() { super('eraser'); this._size = 1; }
    onStart(ctx, x, y, state) { this._erase(ctx, x, y, state); }
    onMove(ctx, x, y, state) { this._erase(ctx, x, y, state); }
    _erase(ctx, x, y, state) {
      const b = state.eraserSize || state.brushSize;
      ctx.clearRect(x, y, b, b);
      if (state.mirror) ctx.clearRect(state.size - x - b, y, b, b);
      EventBus.emit('tool:erase', { x, y });
    }
  }

  class FillTool extends BaseTool {
    constructor() { super('fill'); }
    apply(ctx, x, y, state) {
      const img = ctx.getImageData(0, 0, state.size, state.size);
      const d = img.data;
      const i0 = (y * state.size + x) * 4;
      const tr = d[i0], tg = d[i0+1], tb = d[i0+2], ta = d[i0+3];
      const rgb = hexToRGB(state.color);
      if (!rgb) return;
      if (tr === rgb.r && tg === rgb.g && tb === rgb.b && ta === 255) return;
      const stk = [[x, y]], vis = new Uint8Array(state.size * state.size);
      while (stk.length) {
        const [cx, cy] = stk.pop();
        if (cx < 0 || cx >= state.size || cy < 0 || cy >= state.size) continue;
        const vi = cy * state.size + cx;
        if (vis[vi]) continue; vis[vi] = 1;
        const ii = vi * 4;
        if (d[ii] !== tr || d[ii+1] !== tg || d[ii+2] !== tb || d[ii+3] !== ta) continue;
        d[ii] = rgb.r; d[ii+1] = rgb.g; d[ii+2] = rgb.b; d[ii+3] = 255;
        stk.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
      }
      ctx.putImageData(img, 0, 0);
      Economy.track('pixel:fill');
      EventBus.emit('tool:fill', { x, y, color: state.color });
    }
  }

  class EyedropTool extends BaseTool {
    constructor() { super('eyedrop'); }
    apply(ctx, x, y, state) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[3] > 0) {
        const hex = rgbToHex(d[0], d[1], d[2]);
        Store.dispatch({ type: 'tool:setColor', color: hex });
        // Sync legacy ST and UI
        ST.color = hex;
        const sw = document.querySelector('.sw.sel');
        if (sw) sw.style.background = hex;
        Store.dispatch({ type: 'tool:set', tool: 'pencil' });
        setTool('pencil');
      }
      EventBus.emit('tool:eyedrop', { x, y });
    }
  }

  // Register built-in tools
  const tools = { pencil: new PencilTool(), eraser: new EraserTool(), fill: new FillTool(), eyedrop: new EyedropTool() };
  Object.values(tools).forEach(t => registry[t.id] = t);

  return {
    register(tool) {
      registry[tool.id] = tool;
      EventBus.emit('tool:registered', { id: tool.id });
    },
    get(id) { return registry[id]; },
    getActive() { return registry[ST.tool]; },
    getAll() { return { ...registry }; },
  };
})();

// ── 6. LAYER ENGINE ───────────────────────────────────────────────────
// Multi-layer compositing. Each layer is an offscreen canvas.
// Composites down to the main canvas on every render.
// Layers survive frame switches — they're per-frame per-layer.
const LayerEngine = (() => {
  // layers[frameIndex][layerId] = ImageData
  const _data = [];
  let _initialized = false;

  return {
    init() {
      _initialized = true;
      EventBus.emit('layers:init', {});
    },

    // Ensure storage exists for frame i
    _ensureFrame(frameIdx) {
      while (_data.length <= frameIdx) _data.push({});
    },

    // Get ImageData for a specific layer on a specific frame
    getLayerData(frameIdx, layerId) {
      this._ensureFrame(frameIdx);
      return _data[frameIdx][layerId] || null;
    },

    setLayerData(frameIdx, layerId, imageData) {
      this._ensureFrame(frameIdx);
      _data[frameIdx][layerId] = imageData;
    },

    // Composite all visible layers into the main canvas context
    composite(ctx, frameIdx, layers, size) {
      ctx.clearRect(0, 0, size, size);
      layers.filter(l => l.visible).forEach(l => {
        const data = this.getLayerData(frameIdx, l.id);
        if (!data) return;
        ctx.save();
        ctx.globalAlpha = l.opacity !== undefined ? l.opacity : 1;
        ctx.putImageData(data, 0, 0);
        ctx.restore();
      });
    },

    // Clone all layer data for a frame (for frame duplication)
    cloneFrame(srcIdx, destIdx) {
      this._ensureFrame(srcIdx);
      this._ensureFrame(destIdx);
      _data[destIdx] = {};
      Object.entries(_data[srcIdx]).forEach(([lid, data]) => {
        _data[destIdx][lid] = new ImageData(new Uint8ClampedArray(data.data), data.width, data.height);
      });
    },

    // Delete all data for a frame
    deleteFrame(frameIdx) {
      if (_data[frameIdx]) _data[frameIdx] = {};
    },

    isInitialized() { return _initialized; },
  };
})();

// ── 7. CANVAS RENDERER ────────────────────────────────────────────────
// Separated rendering logic. Only called on state change.
// Handles main canvas, onion skin, grid overlay, and layer compositing.
const Renderer = (() => {
  let _rafPending = false;
  let _pendingState = null;

  function _doRender(state) {
    const mc = document.getElementById('mc');
    if (!mc) return;
    // Frame rendering is handled by the existing drawFrame/captureFrame system
    // Renderer adds: grid auto-refresh, layer composite on state change
    if (state.showGrid) {
      drawGridOverlay();
    }
  }

  return {
    // Render on next animation frame (batches rapid dispatches)
    scheduleRender(state) {
      _pendingState = state;
      if (!_rafPending) {
        _rafPending = true;
        requestAnimationFrame(() => {
          _rafPending = false;
          if (_pendingState) {
            _doRender(_pendingState);
            _pendingState = null;
          }
        });
      }
    },

    // Immediate render (for operations that need instant feedback)
    renderNow(ctx, state) {
      _doRender(state);
    },
  };
})();

// ── WIRE STORE → RENDERER ─────────────────────────────────────────────
// Every state change schedules a render and notifies plugins.
Store.subscribe((state, prev, action) => {
  Renderer.scheduleRender(state);
  PluginRegistry.emit('state:change', { state, prev, action });
});

// ── WIRE ECONOMY → XP SYSTEM ──────────────────────────────────────────
// Economy events flow into the existing XP/level system.
EventBus.on('economy:xp', ({ amount, reason }) => {
  if (typeof addXP === 'function') addXP(amount);
});

// ── BUILT-IN ANALYTICS PLUGIN (stub) ──────────────────────────────────
// Ready for PostHog, Mixpanel, or custom backend.
PluginRegistry.register({
  name: 'analytics',
  _counts: {},
  onInit() { this._session = Date.now(); },
  onEvent(event, payload) {
    this._counts[event] = (this._counts[event] || 0) + 1;
  },
  getSessionSummary() {
    return { session_ms: Date.now() - this._session, actions: { ...this._counts } };
  },
});

// ── BUILT-IN ACHIEVEMENT PLUGIN ───────────────────────────────────────
PluginRegistry.register({
  name: 'achievements',
  _unlocked: new Set(),
  onInit() {
    try { const s = localStorage.getItem('psc_achievements'); if(s) this._unlocked = new Set(JSON.parse(s)); } catch(e) {}
  },
  onEvent(event, payload) {
    if (event !== 'economy:action') return;
    this._check(payload);
  },
  _check(payload) {
    const { type } = payload;
    const checks = [
      ['first_paint',    type === 'pixel:paint'],
      ['first_fill',     type === 'pixel:fill'],
      ['first_save',     type === 'project:save'],
      ['first_export',   type === 'project:export'],
      ['animator',       type === 'frame:add'],
      ['fx_master',      type === 'fx:apply'],
    ];
    checks.forEach(([id, cond]) => {
      if (cond && !this._unlocked.has(id)) {
        this._unlocked.add(id);
        try { localStorage.setItem('psc_achievements', JSON.stringify([...this._unlocked])); } catch(e) {}
        EventBus.emit('achievement:unlock', { id });
      }
    });
  },
});

// Show achievement toast when unlocked
EventBus.on('achievement:unlock', ({ id }) => {
  const labels = {
    first_paint: '🎨 First Stroke!', first_fill: '🪣 Fill Artist!',
    first_save: '💾 Keeper!', first_export: '📤 Shared!',
    animator: '🎬 Animator!', fx_master: '✨ FX Master!',
  };
  if (typeof toast === 'function' && labels[id]) {
    setTimeout(() => toast(labels[id] + ' Achievement unlocked!'), 300);
  }
});

// ── STORE INIT (called in boot, after ST exists) ───────────────────────
function initStore() {
  Store.init({
    size: 16, zoom: 14,
    tool: 'pencil', color: '#6C63FF', brushSize: 1,
    mirror: false, onion: false, showGrid: false,
    fps: 8, playing: false,
    activeLayer: 'base',
    layers: [{ id: 'base', name: 'Base', visible: true, opacity: 1, locked: false }],
  });
  LayerEngine.init();
  Economy.track('session:start');
  EventBus.emit('core:ready', { version: '2.0' });
}

// ── PUBLIC API (for console / plugins / future SDK) ───────────────────
window.PixelStudioCore = {
  version: '2.0',
  Store, EventBus, PluginRegistry, Economy, ToolEngine, LayerEngine, Renderer,
  // Convenience: inspect session from console
  inspect() {
    const analytics = PluginRegistry.getAll().find(p => p.name === 'analytics');
    return { state: Store.getState(), session: analytics?.getSessionSummary(), plugins: PluginRegistry.getAll().map(p=>p.name) };
  },
};

// ── STATE ─────────────────────────────────────────────
const ST = {
  size:16, zoom:14, tool:'pencil', color:'#6C63FF', brushSize:1,
  mirror:false, onion:false, showGrid:false,
  fps:8, playing:false, playTimer:null, playIdx:0,
  currentFrame:0, frames:[], undoStacks:[], undoIdx:[],
  projects:[], xp:420, xpMax:600, level:3, streak:5,
  closetCat:'All', isDown:false, lastPt:null,
  pinchDist:null,
  // ── Coloring template system ──
  locked: null,          // Uint8Array(size²) bitmask — 1 = locked outline pixel
  coloringMode: false,   // true when a coloring template is active
  coloringTemplate: null,// reference to active COLORING_TEMPLATES entry
  fillRegionCount: 0,    // total colorable regions for completion detection
};

let PALETTE = [
  // Blacks & whites
  '#111118','#2a2a36','#444444','#888888','#CCCCCC','#FFFFFF',
  // Core brights
  '#6C63FF','#FF6B6B','#3DDC97','#FFD166','#4FC3F7','#FF9A3C',
  // Pinks & purples
  '#CE93D8','#F48FB1','#FF2D8B','#F6A5C0','#E040FB','#9C27B0',
  '#7B1FA2','#FF80AB','#FF4081','#F50057',
  // Blues
  '#2196F3','#1976D2','#0D47A1','#448AFF','#82B1FF','#B3E5FC',
  '#00BCD4','#00ACC1','#80DEEA','#006064',
  // Greens
  '#4CAF50','#388E3C','#1B5E20','#69F0AE','#A5D6A7','#CCFF90',
  '#8BC34A','#558B2F','#33691E',
  // Reds & oranges
  '#F44336','#C62828','#FF5722','#E64A19','#FF6D00','#FFAB40',
  // Yellows
  '#FFC107','#FFD600','#FFFDE7','#F9A825',
  // Browns & skin
  '#FFCC88','#E8A870','#C07040','#8B5a00','#5C3D2E','#3E2723',
  '#D4A017','#795548',
  // Pastels
  '#FFE0FF','#E0FFF4','#E0F0FF','#FFE0E0','#FFFDE0','#E8F5E9',
  '#FFF9F9','#F3E5F5','#E8EAF6','#E0F2F1',
  // Neons
  '#0AFFEF','#FF0099','#AAFF00','#FF6600','#00FF41','#FF00FF',
  // Dark rich tones
  '#1a1a2e','#16213e','#0f3460','#2d1b6b','#1b6b3f','#6b1b20',
  '#1b3a6b','#501b6b','#4a2e00','#1a3d1a',
];

const TREND_PALETTES = [
  // ── Y2K & Glam ──
  {name:'💎 Y2K Chrome',     cols:['#FF6EB4','#C7F2FF','#FFE4F5','#B8F5E1','#FFF7A1','#E4C7FF']},
  {name:'🩷 Soft Girl',       cols:['#FFD5E8','#FFE4B3','#FFC4E8','#D5C4FF','#C4F0E8','#FFE0D5']},
  {name:'💜 Y2K Glitter',    cols:['#FF2D8B','#CE93D8','#A8DAFF','#E8E0F0','#F6A5C0','#FFF9F9']},
  {name:'✨ Holographic',    cols:['#FF9DE2','#9DEBF7','#C3F0CA','#FFF4BE','#D9B8F7','#FFB5C8']},
  // ── Streetwear ──
  {name:'🖤 Street Drop',     cols:['#111118','#E8E8E8','#FF5C00','#CCCCCC','#FF2D2D','#FFD166']},
  {name:'🏀 Athlete Pack',    cols:['#003DFF','#FF1C1C','#FFFB00','#FFFFFF','#111111','#00CC44']},
  {name:'🧢 Varsity',         cols:['#B22222','#F5F5F5','#1A1A8C','#FFD700','#555555','#FF6B6B']},
  {name:'⚡ Neo Cyber',       cols:['#0AFFEF','#FF0099','#FFE000','#0A0A1A','#6600FF','#FF6600']},
  // ── Nature & Earth ──
  {name:'🍂 Fall Capsule',    cols:['#8B3A00','#D4730B','#F5A623','#2C1A00','#F0E0C8','#CC5500']},
  {name:'🌊 Ocean Depth',     cols:['#023E8A','#0077B6','#0096C7','#00B4D8','#48CAE4','#ADE8F4']},
  {name:'🌿 Forest Floor',    cols:['#1B5E20','#388E3C','#8BC34A','#CDDC39','#795548','#5D4037']},
  {name:'🌸 Cherry Bloom',    cols:['#FCB8D4','#F48FB1','#F06292','#E91E63','#FFEEF5','#4A1942']},
  {name:'🌅 Desert Dusk',     cols:['#FF6B35','#F7C59F','#EFEFD0','#004E89','#1A936F','#C85250']},
  {name:'🌙 Midnight',        cols:['#0D0D2B','#1A1A4E','#2D2D7A','#4444AA','#7777CC','#AAAAEE']},
  // ── Games & Retro ──
  {name:'🎮 Gameboy',         cols:['#0F380F','#306230','#8BAC0F','#9BBC0F','#FFFFFF','#000000']},
  {name:'🕹️ CRT Neon',        cols:['#00FF41','#FF0000','#0000FF','#FFFF00','#FF00FF','#00FFFF']},
  {name:'🏯 Samurai',         cols:['#8B0000','#CC0000','#1A0A00','#F5DEB3','#708090','#C0C0C0']},
  {name:'🍄 Mushroom',        cols:['#CC0000','#FFFFFF','#8B4513','#228B22','#DAA520','#1A0A00']},
  // ── Aesthetic Moods ──
  {name:'🌈 Pastel Dream',    cols:['#FFB3BA','#FFDFBA','#FFFFBA','#BAFFC9','#BAE1FF','#E8BAFF']},
  {name:'🖤 Dark Academia',   cols:['#2C1810','#8B6F47','#C9A96E','#F5F0E8','#1C3A2B','#4A3728']},
  {name:'🌺 Cottagecore',     cols:['#D4E8C2','#F2D5A4','#E8A87C','#C45C3A','#7A9E5E','#F5F0E8']},
  {name:'🌌 Vaporwave',       cols:['#FF71CE','#01CDFE','#05FFA1','#B967FF','#FFFB96','#1A1A2E']},
  {name:'🍬 Candy Pop',       cols:['#FF6B9D','#FFC0CB','#FFE4E1','#98FB98','#87CEEB','#DDA0DD']},
  {name:'🖥️ Win98 Teal',      cols:['#008080','#C0C0C0','#FFFFFF','#000080','#000000','#808080']},
];

const CHALLENGES = [
  {name:'Cyber Sneaker',   emoji:'👟',xp:150,desc:'Design a futuristic sneaker from the year 2087'},
  {name:'Ghost Pet',       emoji:'👻',xp:120,desc:'Create your spirit animal companion'},
  {name:'Fall Hoodie',     emoji:'🧥',xp:100,desc:'Design the perfect autumn streetwear drop'},
  {name:'Space Room',      emoji:'🚀',xp:130,desc:'Build your dream zero-gravity bedroom'},
  {name:'Pixel Dragon',    emoji:'🐉',xp:140,desc:'Bring a legendary dragon to life'},
  {name:'Neon Heart',      emoji:'💜',xp:80, desc:'Make a glowing pixel heart that pops'},
  {name:'Skate Deck',      emoji:'🛹',xp:110,desc:'Design a graphic for a limited edition deck'},
  {name:'Anime Hero',      emoji:'⚔️',xp:120,desc:'Create your original anime character'},
];

const UPCOMING = [
  {day:'Mon',  name:'Pixel Forest',    pts:110, color:'#3DDC97'},
  {day:'Tue',  name:'Y2K Robot',       pts:130, color:'#6C63FF'},
  {day:'Wed',  name:'Dream Sneaker V2',pts:150, color:'#FF6B6B'},
  {day:'Thu',  name:'Mini Room Drop',  pts:100, color:'#FFD166'},
  {day:'Fri',  name:'Mystical Pet',    pts:120, color:'#CE93D8'},
];

window.TEMPLATES = {
  challenge: [
    {id:'sneaker',    ico:'👟',  name:'Cyber Sneaker', tag:'hot',    cat:'challenge'},
    {id:'skate',      ico:'🛹',  name:'Skate Deck',    tag:'hot',    cat:'challenge'},
    {id:'hoodie',     ico:'🧥',  name:'Hoodie Drop',   tag:'new',    cat:'challenge'},
  ],
  items: [
    {id:'sneaker_b',  ico:'👟',  name:'Sneaker Base',  tag:'new'},
    {id:'bag',        ico:'👜',  name:'Bag',            tag:''},
    {id:'cap',        ico:'🧢',  name:'Cap',            tag:''},
    {id:'sword',      ico:'⚔️',  name:'Sword',          tag:'pro'},
    {id:'shield',     ico:'🛡️',  name:'Shield',         tag:'pro'},
    {id:'badge',      ico:'🏅',  name:'Badge',          tag:'new'},
  ],
  chars: [
    {id:'cat',        ico:'🐱',  name:'Pixel Cat',     tag:''},
    {id:'dog',        ico:'🐶',  name:'Pixel Dog',     tag:''},
    {id:'ghost',      ico:'👻',  name:'Ghost Pet',     tag:'hot'},
    {id:'dragon',     ico:'🐉',  name:'Mini Dragon',   tag:'pro'},
    {id:'character',  ico:'🧍',  name:'Character',     tag:''},
    {id:'alien',      ico:'👽',  name:'Alien',         tag:'new'},
  ],
  scenes: [
    {id:'room',       ico:'🛋️',  name:'Cozy Room',     tag:'new'},
    {id:'space',      ico:'🚀',  name:'Space Scene',   tag:''},
    {id:'forest',     ico:'🌳',  name:'Mini Forest',   tag:'new'},
    {id:'city',       ico:'🌆',  name:'City Night',    tag:'pro'},
  ],
  y2k: [
    {id:'y2k_boots',  ico:'👢',  name:'Platform Boots',  tag:'hot'},
    {id:'y2k_purse',  ico:'👛',  name:'Holo Mini Purse', tag:'new'},
    {id:'y2k_hoodie', ico:'🩷',  name:'Glitter Hoodie',  tag:'hot'},
    {id:'y2k_clip',   ico:'🦋',  name:'Butterfly Clips', tag:'new'},
    {id:'y2k_heart',  ico:'💗',  name:'Neon Heart Sign', tag:'hot'},
    {id:'y2k_mirror', ico:'🪞',  name:'Vanity Mirror',   tag:'new'},
  ],
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║   C O L O R I N G   T E M P L A T E S   S Y S T E M               ║
// ║   Each entry: id, name, size, tag, palette[], drawOutline(ctx)      ║
// ║   drawOutline draws ONLY the locked outline — black pixels = locked  ║
// ║   The engine reads back those pixels to build the locked bitmask    ║
// ╚══════════════════════════════════════════════════════════════════════╝

window.COLORING_TEMPLATES = [

// ── KAWAII BUNNY ────────────────────────────────────────────────────────
{
  id: 'color_bunny',
  name: 'Kawaii Bunny',
  ico: '🐰',
  tag: 'new',
  size: 32,
  palette: ['#FFF8F6','#F8B7CD','#FF6FA5','#FF9CB6','#E9E1DD','#1E1E1E','#FFFFFF','#FFD6E8'],
  paletteNames: ['Cream','Inner Ear','Bow Pink','Blush','Shadow','Eyes','White','Petal'],
  drawOutline(ctx) {
    // Hand-authored 32×32 kawaii bunny outline
    // Black (#000) = locked outline pixels
    // Transparent = colorable regions
    const B = '#1E1E1E'; // outline color
    const px = (arr) => arr.forEach(([x,y]) => { ctx.fillStyle=B; ctx.fillRect(x,y,1,1); });

    // ── EARS (left ear: cols 5-9, right ear: cols 22-26, rows 0-10) ──
    // Left ear outer
    px([[5,0],[6,0],[7,0],[8,0],[9,0],
        [4,1],[4,2],[4,3],[4,4],[4,5],[4,6],[4,7],[4,8],
        [5,9],[6,10],[7,11],
        [10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],
        [9,9],[8,10],
    ]);
    // Right ear outer
    px([[22,0],[23,0],[24,0],[25,0],[26,0],
        [21,1],[21,2],[21,3],[21,4],[21,5],[21,6],[21,7],[21,8],
        [22,9],[23,10],[24,11],
        [27,1],[27,2],[27,3],[27,4],[27,5],[27,6],[27,7],[27,8],
        [26,9],[25,10],
    ]);
    // Left inner ear outline
    px([[6,2],[7,2],[8,2],[6,3],[8,3],[6,4],[8,4],[6,5],[8,5],
        [6,6],[7,6],[8,6],[6,7],[7,7],[8,7],
    ]);
    // Right inner ear outline
    px([[23,2],[24,2],[25,2],[23,3],[25,3],[23,4],[25,4],[23,5],[25,5],
        [23,6],[24,6],[25,6],[23,7],[24,7],[25,7],
    ]);

    // ── HEAD outline (oval, rows 8-23) ──
    // Top arc
    px([[11,8],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],[18,7],[19,7],[20,8],
        [10,9],[10,10],[10,11],
        [21,9],[21,10],[21,11],
    ]);
    // Wide middle
    for(let y=12;y<=20;y++){
      ctx.fillStyle=B; ctx.fillRect(9,y,1,1); ctx.fillRect(22,y,1,1);
    }
    // Bottom arc / cheeks
    px([[9,21],[10,22],[11,23],[12,24],[13,25],[14,26],[15,26],[16,26],
        [17,25],[18,24],[19,23],[20,22],[21,21],
        // chin point
        [15,27],[16,27],
    ]);

    // ── EYES (left: x=13-14 y=15-17, right: x=17-18 y=15-17) ──
    px([[13,15],[14,15],[13,16],[14,16],[13,17],[14,17],
        [17,15],[18,15],[17,16],[18,16],[17,17],[18,17],
    ]);

    // ── NOSE ──
    px([[15,19],[16,19],[15,20],[16,20]]);

    // ── MOUTH curve ──
    px([[14,21],[15,22],[16,22],[17,21]]);

    // ── CHEEK BLUSH circles ──
    px([[11,19],[12,19],[11,20],[12,20],[11,21],[12,21],
        [19,19],[20,19],[19,20],[20,20],[19,21],[20,21],
    ]);

    // ── BODY (rows 26-31) ──
    px([[11,26],[10,27],[9,28],[9,29],[10,30],[11,31],[12,31],
        [20,26],[21,27],[22,28],[22,29],[21,30],[20,31],[19,31],
        // shoulders
        [13,26],[14,26],[17,26],[18,26],
        // body bottom
        [13,31],[14,31],[15,31],[16,31],[17,31],[18,31],
    ]);
    // body sides
    for(let y=27;y<=30;y++){
      ctx.fillStyle=B;
      ctx.fillRect(9,y,1,1); ctx.fillRect(22,y,1,1);
    }

    // ── BOW (top of head, rows 7-9, cols 12-19) ──
    px([// bow left loop
        [12,7],[11,7],[11,8],[12,8],[11,9],[12,9],
        // bow right loop
        [19,7],[20,7],[20,8],[19,8],[20,9],[19,9],
        // bow center knot
        [14,8],[15,8],[16,8],[17,8],
        [14,9],[15,9],[16,9],[17,9],
    ]);

    // ── ARMS (left: rows 27-30 col 8, right: col 23) ──
    px([[8,27],[8,28],[8,29],[8,30],[7,28],[7,29],
        [23,27],[23,28],[23,29],[23,30],[24,28],[24,29],
    ]);

    // ── FEET (rows 30-31) ──
    px([[10,30],[11,30],[12,30],
        [13,30],[14,30],
        [17,30],[18,30],
        [19,30],[20,30],[21,30],
    ]);
  },
},

// ── PIXEL HEART (simpler coloring template — good for beginners) ──────
{
  id: 'color_heart',
  name: 'Pixel Heart',
  ico: '💗',
  tag: '',
  size: 32,
  palette: ['#FF2D8B','#FF6FA5','#FF9CB6','#FFD6E8','#CC0066','#FFFFFF','#1E1E1E','#FF4DA6'],
  paletteNames: ['Hot Pink','Mid Pink','Blush','Light Pink','Deep Rose','White','Outline','Neon'],
  drawOutline(ctx) {
    const B = '#1E1E1E';
    const px = (arr) => arr.forEach(([x,y]) => { ctx.fillStyle=B; ctx.fillRect(x,y,1,1); });
    // Classic pixel heart outline 32×32
    px([
      // top bumps
      [4,4],[5,3],[6,2],[7,2],[8,2],[9,2],[10,3],[11,4],
      [12,3],[13,2],[14,2],[15,2],[16,2],[17,2],[18,2],[19,3],
      [20,4],[21,3],[22,2],[23,2],[24,2],[25,2],[26,3],[27,4],
      // left side
      [3,5],[3,6],[3,7],[3,8],[3,9],[3,10],[3,11],[3,12],[3,13],
      // right side
      [28,5],[28,6],[28,7],[28,8],[28,9],[28,10],[28,11],[28,12],[28,13],
      // middle dip
      [11,5],[12,4],[12,5],[13,4],[14,4],[15,4],[16,4],[17,4],[18,4],[19,4],[20,5],[20,4],
      // converging sides to point
      [4,14],[5,15],[6,16],[7,17],[8,18],[9,19],[10,20],[11,21],[12,22],[13,23],
      [14,24],[15,25],[16,25],[15,26],
      [27,14],[26,15],[25,16],[24,17],[23,18],[22,19],[21,20],[20,21],[19,22],[18,23],
      [17,24],[16,25],[16,26],
    ]);
    // fill in inner ridge between bumps
    px([[11,5],[12,5],[13,5],[14,5],[15,5],[16,5],[17,5],[18,5],[19,5],[20,5]]);
  },
},

// ── PIXEL STAR ────────────────────────────────────────────────────────
{
  id: 'color_star',
  name: 'Lucky Star',
  ico: '⭐',
  tag: '',
  size: 32,
  palette: ['#FFD700','#FFA500','#FFEC6E','#FFF4B2','#CC8800','#FFFFFF','#1E1E1E','#FF9900'],
  paletteNames: ['Gold','Orange','Highlight','Pale','Deep Gold','White','Outline','Amber'],
  drawOutline(ctx) {
    const B = '#1E1E1E';
    const $ = (x,y) => { ctx.fillStyle=B; ctx.fillRect(x,y,1,1); };
    // 5-pointed pixel star outline
    [[15,1],[16,1],[14,2],[17,2],[13,3],[18,3],[12,4],[19,4],
     [11,5],[20,5],[10,6],[21,6],
     [4,10],[5,9],[6,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],[13,9],[14,9],[15,8],[16,8],[17,9],[18,9],[19,9],[20,9],[21,9],[22,9],[23,9],[24,9],[25,9],[26,9],[27,9],[28,9],[28,10],
     [4,11],[5,12],[6,13],[7,13],[8,14],[9,14],
     [28,11],[27,12],[26,13],[25,13],[24,14],[23,14],
     [10,15],[11,15],[12,16],[13,16],[20,16],[21,16],[22,15],[23,15],
     [13,17],[14,17],[15,17],[20,17],[19,17],[18,17],
     [15,18],[14,18],[13,19],[12,19],[11,20],[10,21],[9,22],[8,22],
     [17,18],[18,18],[19,19],[20,19],[21,20],[22,21],[23,22],[24,22],
     [7,23],[6,24],[5,25],[4,26],[5,27],[6,27],[7,27],[8,27],[9,27],[10,27],[11,27],
     [25,23],[26,24],[27,25],[28,26],[27,27],[26,27],[25,27],[24,27],[23,27],[22,27],[21,27],
     [12,27],[13,27],[14,27],[15,27],[16,27],[17,27],[18,27],[19,27],[20,27],
    ].forEach(([x,y]) => $(x,y));
  },
},

];

// Animated multi-frame templates — each entry has frameDrawers array
window.ANIM_TEMPLATES = [
// ── WALKING CAT ── detailed 4-frame walk with proper legs, head bob, tail sway
{id:'walk_cat', ico:'🐱', name:'Walking Cat', tag:'new', frames:4,
 draw(ctx,sz,f){
  const o=Math.floor((sz-22)/2);
  // head bob
  const bob=[0,1,0,-1][f], tailSwing=[-2,-1,2,1][f];
  // ── ears ──
  [[4,0,'#C06020'],[5,0,'#FF9A50'],[6,0,'#C06020'],[12,0,'#C06020'],[13,0,'#FF9A50'],[14,0,'#C06020'],
   [5,1,'#FF9A50'],[13,1,'#FF9A50']].forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y+bob,1,1);});
  // ── head ──
  for(let y=1;y<=7;y++) for(let x=4;x<=14;x++){
    ctx.fillStyle=(x<=5||x>=13)?'#C06020':(y<=2)?'#FFCC80':'#FF9A50';
    ctx.fillRect(o+x,o+y+bob,1,1);
  }
  // face
  [[6,3,'#111'],[6,4,'#1a88FF'],[7,3,'#99BBFF'], // left eye
   [11,3,'#111'],[11,4,'#1a88FF'],[12,3,'#99BBFF'], // right eye
   [9,6,'#FF6090'],[9,7,'#FF4070'], // nose
   [0,5,'#ccc'],[1,5,'#ccc'],[2,5,'#ccc'], // whiskers L
   [16,5,'#ccc'],[17,5,'#ccc'],[18,5,'#ccc'], // whiskers R
  ].forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y+bob,1,1);});
  // ── body ──
  for(let y=8;y<=17;y++) for(let x=4;x<=14;x++){
    ctx.fillStyle=(x<=5||x>=13)?'#C06020':(y>=15)?'#C06020':'#FF9A50';
    ctx.fillRect(o+x,o+y,1,1);
  }
  // chest stripe
  ctx.fillStyle='#FFAA60';ctx.fillRect(o+6,o+9,3,1);ctx.fillRect(o+6,o+10,2,1);
  // ── 4 legs, alternating 2-phase gait ──
  // frames 0,2 = pose A; frames 1,3 = pose B
  const poseA=[[4,18,4],[5,18,3],[12,18,3],[13,18,4]];// [x, frontY, backY]
  const poseB=[[4,18,3],[5,18,4],[12,18,4],[13,18,3]];
  const legs=f%2===0?poseA:poseB;
  legs.forEach(([x,fy,by])=>{
    ctx.fillStyle='#C06020';
    ctx.fillRect(o+x,o+fy,2,2);
    ctx.fillStyle='#FF9A50';
    ctx.fillRect(o+x,o+fy+2,2,1);
  });
  // ── tail ──
  const ty=[[-1,0],[-2,0],[-2,-1],[-1,-1]][f];
  [[14+ty[0],13,'#FF9A50'],[15+ty[0],12,'#FF9A50'],[16,11+ty[1],'#FFAA60'],[17,10+ty[1],'#C06020']].forEach(([x,y,c])=>{
    if(x<sz&&y>=0)ctx.fillStyle=c,ctx.fillRect(o+x,o+y,1,1);
  });
 }},

// ── SPINNING STAR ── pure pixel star, no canvas API paths, consistent grid
{id:'spin_star', ico:'⭐', name:'Spinning Star', tag:'new', frames:8,
 draw(ctx,sz,f){
  const cx=Math.floor(sz/2), cy=Math.floor(sz/2);
  const R=Math.floor(sz*.4), r=Math.floor(sz*.16);
  const rot=f*Math.PI/4;// 8 frames = full rotation
  // clear bg (transparent)
  // draw star pixel-by-pixel
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
    const dx=x-cx, dy=y-cy;
    const angle=Math.atan2(dy,dx)-rot;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist>R+1) continue;
    // 5-point star SDF
    const a=((angle+Math.PI*2)%(Math.PI*2/5))-(Math.PI/5);
    const starR=r+(R-r)*Math.cos(Math.PI/5)/Math.cos(a);
    if(dist<=starR){
      const shade=dist<r*0.6?'#FFFAAA':dist<R*.4?'#FFE840':dist<R*.7?'#FFD166':'#EEB840';
      ctx.fillStyle=shade; ctx.fillRect(x,y,1,1);
    }
  }
  // center glow
  for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){
    if(dx*dx+dy*dy<=5){ctx.fillStyle='rgba(255,255,200,0.8)';ctx.fillRect(cx+dx,cy+dy,1,1);}
  }
  // trailing twinkles
  for(let i=0;i<5;i++){
    const a=rot+i*(Math.PI*2/5)+Math.PI/10;
    const tx=Math.round(cx+R*1.2*Math.cos(a)), ty2=Math.round(cy+R*1.2*Math.sin(a));
    if(tx>=0&&tx<sz&&ty2>=0&&ty2<sz){ctx.fillStyle='#FFF';ctx.fillRect(tx,ty2,1,1);}
  }
 }},

// ── BOUNCE BALL ── red ball, proper squash/stretch, motion blur, ground shadow
{id:'bounce_ball', ico:'🏀', name:'Bounce Ball', tag:'hot', frames:6,
 draw(ctx,sz,f){
  const phases=[0,1,2,3,2,1];
  const ph=phases[f];
  const y0=Math.floor(sz*.1), y3=Math.floor(sz*.68);
  const cy=Math.round(y0+(y3-y0)*(ph/3));
  // squash at bottom, stretch at top
  const squashX=ph===3?1.35:ph===0?0.88:1;
  const squashY=ph===3?0.70:ph===0?1.18:1;
  const rBase=Math.floor(sz*.18);
  const rw=Math.round(rBase*squashX), rh=Math.round(rBase*squashY);
  // ── ball body ──
  for(let dy=-rh;dy<=rh;dy++) for(let dx=-rw;dx<=rw;dx++){
    if((dx/rw)**2+(dy/rh)**2>1) continue;
    const d=Math.sqrt((dx/rw)**2+(dy/rh)**2);
    ctx.fillStyle=d<0.3?'#FF9090':d<0.65?'#FF6B6B':'#CC3333';
    ctx.fillRect(Math.floor(sz/2)+dx,cy+dy,1,1);
  }
  // ── shine ──
  const shx=Math.floor(sz/2)-Math.floor(rw*.3), shy=cy-Math.floor(rh*.35);
  for(let dy=-2;dy<=1;dy++) for(let dx=-3;dx<=2;dx++){
    if(dx*dx/9+dy*dy/4<=1){ctx.fillStyle='rgba(255,255,255,0.7)';ctx.fillRect(shx+dx,shy+dy,1,1);}
  }
  // ── seam lines ──
  for(let dx=-rw;dx<=rw;dx++){
    const seamy=cy+Math.round(rh*0.2*Math.sin(dx*Math.PI/rw));
    if(seamy>=cy-rh&&seamy<=cy+rh){ctx.fillStyle='rgba(150,30,30,0.4)';ctx.fillRect(Math.floor(sz/2)+dx,seamy,1,1);}
  }
  // ── ground shadow (ellipse, stronger near ground) ──
  const shadowAlpha=Math.min(0.45,ph/3*0.45+0.05);
  const shadowW=Math.round(rw*(1+ph/6)), shadowY=Math.floor(sz*.82);
  for(let dx=-shadowW;dx<=shadowW;dx++){
    const a=shadowAlpha*(1-(dx/shadowW)**2);
    ctx.fillStyle=`rgba(0,0,0,${a.toFixed(2)})`;
    ctx.fillRect(Math.floor(sz/2)+dx,shadowY,1,2);
  }
  // ── motion blur (stretch trail upward when falling) ──
  if(ph===1||ph===2){
    for(let i=1;i<=3;i++){
      ctx.fillStyle=`rgba(255,107,107,${0.15-i*0.04})`;
      ctx.fillRect(Math.floor(sz/2)-2,cy-rh-i,5,1);
    }
  }
 }},

// ── PIXEL FIRE ── layered 3-color flame, 4-frame flicker with organic noise
{id:'fire', ico:'🔥', name:'Pixel Fire', tag:'hot', frames:4,
 draw(ctx,sz,f){
  const base=Math.floor(sz*.88);
  const cx=Math.floor(sz/2);
  // per-frame noise seeds
  const seeds=[[3,7,13],[5,11,2],[7,3,17],[2,13,5]][f];
  // ── base ember glow ──
  for(let x=cx-4;x<=cx+4;x++){
    ctx.fillStyle='#FF2200';ctx.fillRect(x,base,1,1);
    ctx.fillStyle='#FF4400';ctx.fillRect(x,base-1,1,1);
  }
  // ── flame layers (bottom=wide/dark → top=narrow/bright) ──
  const layers=[
    {y:base-2, hw:7, c:'#FF5500'},
    {y:base-4, hw:6, c:'#FF6B00'},
    {y:base-6, hw:5, c:'#FF8800'},
    {y:base-8, hw:4, c:'#FF9900'},
    {y:base-10,hw:3, c:'#FFAA00'},
    {y:base-12,hw:2, c:'#FFD166'},
    {y:base-14,hw:2, c:'#FFE580'},
    {y:base-16,hw:1, c:'#FFFAAA'},
  ];
  layers.forEach(({y,hw,c})=>{
    for(let dx=-hw;dx<=hw;dx++){
      // organic wobble using frame seed
      const noise=(((dx*seeds[0]+y*seeds[1])%seeds[2]+seeds[2])%seeds[2])%3-1;
      const nx=cx+dx+Math.sign(dx)*Math.floor(noise*0.4);
      if(nx>=0&&nx<sz&&y>=0)ctx.fillStyle=c,ctx.fillRect(nx,y,1,1);
    }
  });
  // ── white-hot core ──
  for(let dy=0;dy<4;dy++) for(let dx=-1;dx<=1;dx++){
    ctx.fillStyle=dy===0?'#FFFFFF':'rgba(255,255,220,0.7)';
    ctx.fillRect(cx+dx,base-4-dy,1,1);
  }
  // ── spark particles ──
  [[cx-3,base-17,'#FFE580'],[cx+2,base-15,'#FFD166'],[cx-1,base-19,'#fff'],
   [cx+4,base-13,'#FF9900'],[cx-5,base-11,'#FFAA00']].forEach(([x,y,c])=>{
    const jx=(seeds[0]*x+seeds[1])%5-2, jy=(seeds[2]*y+seeds[0])%3-1;
    if(x+jx>=0&&x+jx<sz&&y+jy>=0){ctx.fillStyle=c;ctx.fillRect(x+jx,y+jy,1,1);}
  });
 }},

// ── NEON HEART ── pixel-perfect heart shape, 4-frame pulse with glow halo
{id:'neon_heart', ico:'💜', name:'Neon Heart', tag:'', frames:4,
 draw(ctx,sz,f){
  const scale=[1,1.1,1,0.92][f];
  const colors=[['#FF6B6B','#CC2222','#FF9090'],['#FF8FAB','#CC4477','#FFBBCC'],
                ['#CE93D8','#8833AA','#E8BBEE'],['#FF6B6B','#CC2222','#FF9090']][f];
  const [mid,drk,lit]=colors;
  const cx=Math.floor(sz/2), cy=Math.floor(sz/2)+2;
  // pixel-perfect heart using signed-distance function
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
    const dx=(x-cx)/scale, dy=(y-cy)/scale;
    // heart SDF: f(x,y) = (x²+y²-1)³ - x²y³
    const nx=dx/7, ny=-dy/8+0.2;// normalize
    const sdf=(nx*nx+ny*ny-1)**3 - nx*nx*ny*ny*ny;
    if(sdf>0) continue;
    const edge=sdf>-0.02;
    const shade=edge?drk:(sdf>-0.1)?mid:(sdf>-0.3)?mid:lit;
    ctx.fillStyle=shade; ctx.fillRect(x,y,1,1);
  }
  // highlight
  const hx=cx-3, hy=cy-5;
  [[hx,hy,lit],[hx+1,hy,lit],[hx,hy+1,'rgba(255,255,255,0.5)']].forEach(([x,y,c])=>{
    ctx.fillStyle=c;ctx.fillRect(x,y,1,1);
  });
  // outer glow halo on beat frames
  if(f===1||f===3){
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const dx=(x-cx)/scale, dy=(y-cy)/scale;
      const nx=dx/8.5, ny=-dy/9.5+0.2;
      const sdf=(nx*nx+ny*ny-1)**3 - nx*nx*ny*ny*ny;
      if(sdf>0&&sdf<0.08){
        ctx.fillStyle=f===1?'rgba(255,143,171,0.3)':'rgba(206,147,216,0.3)';
        ctx.fillRect(x,y,1,1);
      }
    }
  }
 }},

// ── WALK CYCLE ── detailed character with proper 4-frame animation
{id:'walk_char', ico:'🧍', name:'Walk Cycle', tag:'new', frames:4,
 draw(ctx,sz,f){
  const o=Math.floor((sz-14)/2);
  // head bob + body lean
  const bob=[0,1,0,-1][f];
  const lean=[0,1,0,-1][f];
  // ── hair ──
  [[2,0,'#5a3800'],[3,0,'#7a5010'],[4,0,'#5a3800'],[5,0,'#7a5010'],
   [6,0,'#5a3800'],[7,0,'#5a3800'],[2,1,'#7a5010']
  ].forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y+bob,1,1);});
  // ── head ──
  for(let y=1;y<=6;y++) for(let x=2;x<=8;x++){
    ctx.fillStyle=(x===2||x===8)?'#D09050':(y===6)?'#D09050':'#FFCC88';
    ctx.fillRect(o+x,o+y+bob,1,1);
  }
  // face features
  [[3,3,'#111'],[3,4,'#5a3010'],[4,3,'#fff'], // left eye + shine
   [6,3,'#111'],[6,4,'#5a3010'],[7,3,'#fff'], // right eye + shine
   [4,5,'#CC7070'],[5,5,'#EE9090'],            // mouth
  ].forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y+bob,1,1);});
  // neck
  ctx.fillStyle='#FFCC88';ctx.fillRect(o+4,o+7,2,1);
  ctx.fillStyle='#D09050';ctx.fillRect(o+4,o+8,2,1);
  // ── body (jacket) ──
  for(let y=8;y<=14;y++) for(let x=2;x<=8;x++){
    ctx.fillStyle=(x<=3||x>=7)?'#3a2060':(y>=13)?'#3a2060':'#6C63FF';
    ctx.fillRect(o+x+lean,o+y,1,1);
  }
  // collar
  ctx.fillStyle='#fff';ctx.fillRect(o+4+lean,o+8,2,1);
  // ── arms swing ──
  const armL=[2,-1,-2,1][f], armR=[-2,1,2,-1][f];
  ctx.fillStyle='#FFCC88';
  ctx.fillRect(o+1,o+9+Math.max(0,armL),1,3);
  ctx.fillRect(o+9,o+9+Math.max(0,armR),1,3);
  // cuff
  ctx.fillStyle='#3a2060';
  ctx.fillRect(o+1,o+12+Math.max(0,armL),1,1);
  ctx.fillRect(o+9,o+12+Math.max(0,armR),1,1);
  // ── legs with proper stride ──
  const legPoses=[
    [[3,15,4],[6,15,3]], // frame 0: L fwd R back
    [[3,15,3],[6,15,4]], // frame 1: L mid R mid
    [[3,15,3],[6,15,4]], // frame 2: L back R fwd
    [[3,15,4],[6,15,3]], // frame 3
  ];
  legPoses[f].forEach(([lx,ly,len])=>{
    ctx.fillStyle='#1e1e44';ctx.fillRect(o+lx,o+ly,2,len);
    // shoe
    ctx.fillStyle='#111';ctx.fillRect(o+lx-1+lean,o+ly+len,3,1);
  });
 }},
  {id:'y2k_sparkle_loop', ico:'✨', name:'Y2K Glitter Loop', tag:'hot', frames:4,
   draw(ctx,sz,f){
    const cx=Math.floor(sz/2), cy=Math.floor(sz/2);
    const Y2K={hot:'#FF2D8B',lav:'#CE93D8',blue:'#A8DAFF',silver:'#E8E0F0',blush:'#F6A5C0',rose:'#8B3A5A'};
    // Transparent bg (skip fill so it composites nicely)
    // rotating outer ring — 8 stars at r=11
    const rot=f*Math.PI/8;
    for(let i=0;i<8;i++){
      const ang=i*Math.PI/4+rot;
      const sx=Math.round(cx+11*Math.cos(ang)), sy=Math.round(cy+11*Math.sin(ang));
      const c=[Y2K.hot,Y2K.lav,Y2K.blue,Y2K.hot,Y2K.silver,Y2K.lav,Y2K.hot,Y2K.blue][i];
      if(sx>=0&&sx<sz&&sy>=0&&sy<sz){
        ctx.fillStyle=c;
        ctx.fillRect(sx,sy,1,1);
        if(sx>0)ctx.fillRect(sx-1,sy,1,1);if(sx<sz-1)ctx.fillRect(sx+1,sy,1,1);
        if(sy>0)ctx.fillRect(sx,sy-1,1,1);if(sy<sz-1)ctx.fillRect(sx,sy+1,1,1);
        ctx.fillStyle='#fff';ctx.fillRect(sx,sy,1,1);
      }
    }
    // inner ring — counter-spin at r=6
    const innerRot=-f*Math.PI/6;
    for(let i=0;i<8;i++){
      const ang=i*Math.PI/4+Math.PI/8+innerRot;
      const sx=Math.round(cx+6*Math.cos(ang)), sy=Math.round(cy+6*Math.sin(ang));
      const c=[Y2K.blush,Y2K.silver,Y2K.lav,Y2K.blue,Y2K.blush,Y2K.silver,Y2K.lav,Y2K.blue][i];
      if(sx>=0&&sx<sz&&sy>=0&&sy<sz){ctx.fillStyle=c;ctx.fillRect(sx,sy,1,1);}
    }
    // outer dot ring
    for(let i=0;i<12;i++){
      const ang=i*Math.PI/6+rot;
      const dx=Math.round(cx+14*Math.cos(ang)), dy=Math.round(cy+14*Math.sin(ang));
      if(dx>=0&&dx<sz&&dy>=0&&dy<sz){ctx.fillStyle=Y2K.rose;ctx.fillRect(dx,dy,1,1);}
    }
    // center pulsing star
    const ps=[4,5,4,3][f];
    ctx.fillStyle=Y2K.hot;
    for(let d=0;d<ps;d++){ctx.fillRect(cx-d,cy,1,1);ctx.fillRect(cx+d,cy,1,1);ctx.fillRect(cx,cy-d,1,1);ctx.fillRect(cx,cy+d,1,1);}
    // diagonals on bigger frames
    if(ps>=5){
      ctx.fillStyle=Y2K.lav;
      ctx.fillRect(cx-2,cy-2,1,1);ctx.fillRect(cx+2,cy-2,1,1);ctx.fillRect(cx-2,cy+2,1,1);ctx.fillRect(cx+2,cy+2,1,1);
    }
    ctx.fillStyle='#fff';ctx.fillRect(cx,cy,1,1);
   }},
];



window.EFFECTS_LIST = [
  {id:'glow',    ico:'✨', name:'Add Glow',       desc:'Edge light effect around your art'},
  {id:'sparkle', ico:'⭐', name:'Add Sparkles',   desc:'Magic twinkle pixels appear'},
  {id:'outline', ico:'◻️', name:'Clean Outline',  desc:'Bold 1px border around shapes'},
  {id:'remix',   ico:'🎲', name:'Color Remix',    desc:'Swap palette to a trending vibe'},
];

// ── UTILS ─────────────────────────────────────────────
function hexToRGB(hex){if(!hex||hex.length<7)return null;const h=hex.replace('#','');return{r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16)}}
function rgbToHex(r,g,b){return'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')}
function cloneImageData(src){const o=new ImageData(src.width,src.height);o.data.set(src.data);return o;}
// --- Apply antiwash palette upgrade after all templates are loaded ---
if (typeof upgradeAllPalettesExtended === 'function' && !window.__pcPalettesUpgraded) {
  window.__pcPalettesUpgraded = true;
  setTimeout(()=>{
    try { upgradeAllPalettesExtended(); } catch(e) { console.warn('[PaletteUpgrade]', e); }
  }, 0);
}

// ── EXPORT STUBS FOR NEW FORMATS ─────
function exportMinecraftSkin() {
  // Export current frame as 64x64 PNG for Minecraft.net
  captureFrame();
  const targetSize = 64;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // If the sprite is smaller, upscale to 64x64
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'minecraft-skin.png';
      a.click();
      SFX.share();
      toast('Minecraft Skin exported! 🟩');
      addXP(7);
      Economy.track('project:export', { format: 'minecraft-skin' });
    });
  }
}
function exportMinecraftTexturePack() {
  // Export zipped Minecraft resource pack with current frame as 64x64 PNG
  captureFrame();
  const targetSize = 64;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      cvs.toBlob(blob => {
        // Minimal zip: [pack.mcmeta, assets/minecraft/textures/entity/skin.png]
        const files = [];
        // pack.mcmeta
        files.push({
          name: 'pack.mcmeta',
          data: new TextEncoder().encode('{"pack":{"pack_format":15,"description":"PixelSprite Export"}}')
        });
        // PNG skin
        files.push({
          name: 'assets/minecraft/textures/entity/skin.png',
          data: blob
        });
        // Simple zip (no compression, just store)
        function zip(files) {
          let offset = 0, central = [], out = [];
          function dateBytes() {
            const d = new Date();
            const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2);
            const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
            return [dosTime, dosDate];
          }
          files.forEach((f, i) => {
            const [dosTime, dosDate] = dateBytes();
            const nameBytes = new TextEncoder().encode(f.name);
            const localHeader = [
              0x50,0x4b,3,4, // Local file header signature
              20,0,0,0,0,0, // Version, flags, compression (0=store)
              dosTime&0xFF, (dosTime>>8)&0xFF, dosDate&0xFF, (dosDate>>8)&0xFF,
              0,0,0,0, // CRC32 (0 for now)
              f.data.size||f.data.length,0,0,0, // Compressed size
              f.data.size||f.data.length,0,0,0, // Uncompressed size
              nameBytes.length,0,0,0 // File name length
            ];
            out.push(new Uint8Array(localHeader));
            out.push(nameBytes);
            out.push(f.data instanceof Blob ? f.data : new Uint8Array(f.data));
            central.push({
              offset,
              nameBytes,
              size: f.data.size||f.data.length
            });
            offset += localHeader.length + nameBytes.length + (f.data.size||f.data.length);
          });
          // Central directory
          let centralStart = offset;
          central.forEach((c, i) => {
            const header = [
              0x50,0x4b,1,2, // Central file header signature
              20,0,0,0,0,0, // Version, flags, compression
              0,0,0,0, // File time/date
              0,0,0,0, // CRC32
              c.size,0,0,0, // Compressed size
              c.size,0,0,0, // Uncompressed size
              c.nameBytes.length,0,0,0, // File name length
              0,0,0,0,0,0,0,0,0,0, // Extra fields, comment, disk, etc.
              c.offset&0xFF, (c.offset>>8)&0xFF, (c.offset>>16)&0xFF, (c.offset>>24)&0xFF
            ];
            out.push(new Uint8Array(header));
            out.push(c.nameBytes);
          });
          // End of central directory
          const end = [
            0x50,0x4b,5,6, // End of central dir signature
            0,0, // Disk numbers
            files.length,0,files.length,0, // Entry count
            (offset-centralStart)&0xFF, ((offset-centralStart)>>8)&0xFF, // Central dir size
            centralStart&0xFF, (centralStart>>8)&0xFF, // Central dir offset
            0,0 // Comment length
          ];
          out.push(new Uint8Array(end));
          // Flatten
          return new Blob(out, { type: 'application/zip' });
        }
        const zipBlob = zip(files);
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'minecraft-resource-pack.zip';
        a.click();
        SFX.share();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Minecraft Texture Pack exported! 📦');
        addXP(10);
        Economy.track('project:export', { format: 'minecraft-texture-pack' });
      });
    });
  }
}
function exportRobloxShirt() {
  // Export current frame as 585x559 PNG for Roblox shirts
  captureFrame();
  const targetW = 585, targetH = 559;
  const cvs = document.createElement('canvas');
  cvs.width = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Center the sprite in the Roblox shirt template
  const spriteSize = 64; // Standard Roblox shirt region size
  const offsetX = Math.floor((targetW - spriteSize) / 2);
  const offsetY = Math.floor((targetH - spriteSize) / 2);
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, offsetX, offsetY, spriteSize, spriteSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'roblox-shirt.png';
      a.click();
      SFX.share();
      toast('Roblox Shirt exported! 👕');
      addXP(7);
      Economy.track('project:export', { format: 'roblox-shirt' });
    });
  }
}
function exportRobloxPants() {
  // Export current frame as 585x559 PNG for Roblox pants
  captureFrame();
  const targetW = 585, targetH = 559;
  const cvs = document.createElement('canvas');
  cvs.width = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Center the sprite in the Roblox pants template
  const spriteSize = 64; // Standard Roblox pants region size
  const offsetX = Math.floor((targetW - spriteSize) / 2);
  const offsetY = Math.floor((targetH - spriteSize) / 2);
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, offsetX, offsetY, spriteSize, spriteSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'roblox-pants.png';
      a.click();
      SFX.share();
      toast('Roblox Pants exported! 👖');
      addXP(7);
      Economy.track('project:export', { format: 'roblox-pants' });
    });
  }
}
function exportRobloxDecal() {
  // Export current frame as square PNG for Roblox decals (512x512)
  captureFrame();
  const targetSize = 512;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'roblox-decal.png';
      a.click();
      SFX.share();
      toast('Roblox Decal exported! 🟦');
      addXP(6);
      Economy.track('project:export', { format: 'roblox-decal' });
    });
  }
}
function exportSpriteSheet() {
  // Export all frames as a horizontal PNG sprite sheet (8x upscaled)
  captureFrame();
  const scale = 8;
  const frameCount = ST.frames.length;
  const sz = ST.size;
  const cvs = document.createElement('canvas');
  cvs.width = sz * scale * frameCount;
  cvs.height = sz * scale;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (frameCount > 0) {
    let x = 0;
    Promise.all(ST.frames.map(f => createImageBitmap(f))).then(bitmaps => {
      bitmaps.forEach(bmp => {
        ctx.drawImage(bmp, 0, 0, sz, sz, x, 0, sz * scale, sz * scale);
        x += sz * scale;
      });
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'sprite-sheet.png';
      a.click();
      SFX.share();
      toast('Sprite Sheet exported! 🗂️');
      addXP(10);
      Economy.track('project:export', { format: 'sprite-sheet' });
    });
  }
}
function exportSticker() {
  // Export current frame as high-res PNG (1024x1024) for stickers
  captureFrame();
  const targetSize = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'sticker.png';
      a.click();
      SFX.share();
      toast('Sticker exported! 🖨️');
      addXP(8);
      Economy.track('project:export', { format: 'sticker' });
    });
  }
}
function exportWallpaper() {
  // Export current frame as 1080x1920 PNG for phone wallpaper
  captureFrame();
  const targetW = 1080, targetH = 1920;
  const cvs = document.createElement('canvas');
  cvs.width = targetW;
  cvs.height = targetH;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Center the sprite
  const spriteSize = Math.min(targetW, targetH) * 0.7; // 70% of width/height
  const offsetX = Math.floor((targetW - spriteSize) / 2);
  const offsetY = Math.floor((targetH - spriteSize) / 2);
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetW, targetH);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, offsetX, offsetY, spriteSize, spriteSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'phone-wallpaper.png';
      a.click();
      SFX.share();
      toast('Phone Wallpaper exported! 📱');
      addXP(8);
      Economy.track('project:export', { format: 'phone-wallpaper' });
    });
  }
}
function exportPlannerSticker() {
  // Export current frame as 512x512 PNG with transparency for digital planners
  captureFrame();
  const targetSize = 512;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = 'planner-sticker.png';
      a.click();
      SFX.share();
      toast('Planner Sticker exported! 📒');
      addXP(7);
      Economy.track('project:export', { format: 'planner-sticker' });
    });
  }
}
function export3DTexture() {
  // Export current frame as 1024x1024 PNG for 3D model base texture
  captureFrame();
  const targetSize = 1024;
  const cvs = document.createElement('canvas');
  cvs.width = targetSize;
  cvs.height = targetSize;
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (ST.frames[ST.currentFrame]) {
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp => {
      ctx.clearRect(0, 0, targetSize, targetSize);
      ctx.drawImage(bmp, 0, 0, ST.size, ST.size, 0, 0, targetSize, targetSize);
      const a = document.createElement('a');
      a.href = cvs.toDataURL('image/png');
      a.download = '3d-base-texture.png';
      a.click();
      SFX.share();
      toast('3D Model Texture exported! 🧊');
      addXP(9);
      Economy.track('project:export', { format: '3d-base-texture' });
    });
  }
}
// ── SOUND ENGINE: PIXELSPRITE SOLFEGGIO FRAMEWORK ─────
const SFX = (() => {
  const SOLFEGGIO = {
    create: 528,      // creation / pixel placement / fill
    collaborate: 639, // sharing / listing / send
    unlock: 741,      // unlock / level-up / expansion
    reset: 396,       // clear / undo / grounding
  };

  let ctx = null;
  const lastPlay = Object.create(null);

  function getCtx(){
    if(!ctx){
      try{ ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
    if(ctx && ctx.state==='suspended') ctx.resume().catch(()=>{});
    return ctx;
  }

  function canPlay(key, cooldownMs){
    const now = Date.now();
    if((now - (lastPlay[key]||0)) < cooldownMs) return false;
    lastPlay[key] = now;
    return true;
  }

  function solfeggioTone(freq, opts={}){
    const {
      dur = 0.36,
      vol = 0.08,
      popFreq = 1800,
      popDur = 0.07,
      popVol = 0.018,
      cooldown = 90,
      key = 'generic',
    } = opts;

    if(!canPlay(key, cooldown)) return;
    const c = getCtx();
    if(!c) return;
    const t = c.currentTime;

    // Healing bed: soft sine body on the target Solfeggio frequency.
    const bed = c.createOscillator();
    const bedGain = c.createGain();
    bed.type = 'sine';
    bed.frequency.setValueAtTime(freq, t);
    bed.connect(bedGain);
    bedGain.connect(c.destination);
    bedGain.gain.setValueAtTime(0.0001, t);
    bedGain.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    bedGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    bed.start(t);
    bed.stop(t + dur + 0.02);

    // Light glass pop layered above the bed for UI tactility.
    const pop = c.createOscillator();
    const popGain = c.createGain();
    pop.type = 'triangle';
    pop.frequency.setValueAtTime(popFreq, t);
    pop.frequency.exponentialRampToValueAtTime(popFreq * 0.65, t + popDur);
    pop.connect(popGain);
    popGain.connect(c.destination);
    popGain.gain.setValueAtTime(popVol, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + popDur);
    pop.start(t);
    pop.stop(t + popDur + 0.01);
  }

  function tinyClick(){
    const c = getCtx();
    if(!c || !canPlay('tiny-click', 35)) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(980, t);
    o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(0.018, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.start(t); o.stop(t + 0.035);
  }

  return {
    // 528 Hz: creation actions
    draw(){ solfeggioTone(SOLFEGGIO.create, { dur:0.34, vol:0.055, popFreq:1920, popDur:0.05, popVol:0.014, cooldown:95, key:'create-draw' }); },
    fill(){ solfeggioTone(SOLFEGGIO.create, { dur:0.44, vol:0.08, popFreq:1680, popDur:0.06, popVol:0.016, cooldown:130, key:'create-fill' }); },
    save(){ solfeggioTone(SOLFEGGIO.create, { dur:0.42, vol:0.082, popFreq:1540, popDur:0.08, popVol:0.017, cooldown:220, key:'create-save' }); },

    // 639 Hz: collaboration / sharing
    share(){ solfeggioTone(SOLFEGGIO.collaborate, { dur:0.42, vol:0.085, popFreq:1720, popDur:0.07, popVol:0.017, cooldown:180, key:'collab' }); },

    // 741 Hz: unlocking / expansion
    unlock(){ solfeggioTone(SOLFEGGIO.unlock, { dur:0.5, vol:0.1, popFreq:1320, popDur:0.1, popVol:0.02, cooldown:260, key:'unlock' }); },
    levelUp(){
      // Warm 741-centered swell + gentle overtone for celebratory expansion.
      solfeggioTone(SOLFEGGIO.unlock, { dur:0.52, vol:0.11, popFreq:1260, popDur:0.11, popVol:0.024, cooldown:240, key:'levelup-main' });
      setTimeout(()=>solfeggioTone(SOLFEGGIO.unlock*1.5, { dur:0.28, vol:0.05, popFreq:1860, popDur:0.06, popVol:0.012, cooldown:220, key:'levelup-harm' }), 120);
    },

    // 396 Hz: reset / grounding
    undo(){ solfeggioTone(SOLFEGGIO.reset, { dur:0.34, vol:0.075, popFreq:980, popDur:0.05, popVol:0.012, cooldown:120, key:'reset-undo' }); },
    reset(){ solfeggioTone(SOLFEGGIO.reset, { dur:0.4, vol:0.08, popFreq:920, popDur:0.06, popVol:0.013, cooldown:150, key:'reset-clear' }); },

    // Utility micro-actions
    click(){ tinyClick(); },
    erase(){ solfeggioTone(SOLFEGGIO.reset, { dur:0.2, vol:0.04, popFreq:860, popDur:0.03, popVol:0.009, cooldown:90, key:'erase' }); },
  };
})();

const DRAWERS = {
// ─── utility: plot sparse pixel list offset by (ox,oy) ───────────────────
_p(ctx,ox,oy,list){list.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,1,1);});},
// Scale a native-size sprite into sz×sz using an offscreen canvas
_scaled(ctx,sz,nativeW,nativeH,drawFn){
  const tmp=document.createElement('canvas');
  tmp.width=nativeW;tmp.height=nativeH;
  drawFn(tmp.getContext('2d'));
  ctx.imageSmoothingEnabled=false;
  const scale=Math.min(sz/nativeW,sz/nativeH);
  const dw=Math.round(nativeW*scale),dh=Math.round(nativeH*scale);
  const dx=Math.floor((sz-dw)/2),dy=Math.floor((sz-dh)/2);
  ctx.drawImage(tmp,dx,dy,dw,dh);
},

// ═══════════════════════════════════════════════════════════════════════════
//  CAT  –  tabby, 3-tone shading, outlined, whiskers, bright eyes
// ═══════════════════════════════════════════════════════════════════════════
cat(ctx,sz){
this._scaled(ctx,sz,24,24,(_c)=>{
// Professional pixel-art tabby cat – hand-authored 24×28 sprite centered in sz×sz
const o=0;
const $ = (x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const rows = [
//  Row by row, left→right, y=0 at top
// y=0  ears
[3,'#1a0a00'],[4,'#CC6820'],[5,'#E07830'],[6,'#1a0a00'],
[16,'#1a0a00'],[17,'#E07830'],[18,'#CC6820'],[19,'#1a0a00'],
// y=1
[2,'#1a0a00'],[3,'#CC6820'],[4,'#E89050'],[5,'#E07830'],[6,'#CC6820'],[7,'#1a0a00'],
[15,'#1a0a00'],[16,'#CC6820'],[17,'#E89050'],[18,'#E07830'],[19,'#CC6820'],[20,'#1a0a00'],
// y=2 inner ear pink
[3,'#D86040'],[4,'#FFAA70'],[5,'#D86040'],
[17,'#FFAA70'],[18,'#D86040'],
[3,'#CC6820'],[5,'#CC6820'],
];
// Use explicit pixel arrays per row for precision
const D='#1a0a00'; // dark outline
// --- EARS ---
[[4,0,'#CC6820'],[5,0,'#E07830'],[6,0,'#CC6820'],
 [17,0,'#CC6820'],[18,0,'#E07830'],[19,0,'#CC6820'],
 [3,1,D],[4,1,'#E07830'],[5,1,'#FFAA70'],[6,1,'#E07830'],[7,1,D],
 [15,1,D],[16,1,'#E07830'],[17,1,'#FFAA70'],[18,1,'#E07830'],[19,1,D],
 [4,2,'#D06828'],[5,2,'#FFCC90'],[6,2,'#D06828'],
 [16,2,'#D06828'],[17,2,'#FFCC90'],[18,2,'#D06828'],
// --- HEAD outline row 3-10 ---
 [3,3,D],[4,3,'#E07830'],[5,3,'#FF9A50'],[6,3,'#FFBB70'],[7,3,'#FFBB70'],[8,3,'#FFBB70'],[9,3,'#FFBB70'],[10,3,'#FFBB70'],[11,3,'#FFBB70'],[12,3,'#FF9A50'],[13,3,'#E07830'],[14,3,D],
 [2,4,D],[3,4,'#E07830'],[4,4,'#FF9A50'],[5,4,'#FFCC88'],[6,4,'#FFCC88'],[7,4,'#FFCC88'],[8,4,'#FFCC88'],[9,4,'#FFCC88'],[10,4,'#FFCC88'],[11,4,'#FFCC88'],[12,4,'#FFCC88'],[13,4,'#FF9A50'],[14,4,'#E07830'],[15,4,D],
 [2,5,D],[3,5,'#E07830'],[4,5,'#FF9A50'],[5,5,'#FFCC88'],[6,5,'#FFCC88'],[7,5,'#FFCC88'],[8,5,'#FFCC88'],[9,5,'#FFCC88'],[10,5,'#FFCC88'],[11,5,'#FFCC88'],[12,5,'#FFCC88'],[13,5,'#FF9A50'],[14,5,'#E07830'],[15,5,D],
 [2,6,D],[3,6,'#E07830'],[4,6,'#FF9A50'],[5,6,'#FFCC88'],[6,6,'#FFCC88'],[7,6,'#FFCC88'],[8,6,'#FFCC88'],[9,6,'#FFCC88'],[10,6,'#FFCC88'],[11,6,'#FFCC88'],[12,6,'#FFCC88'],[13,6,'#FF9A50'],[14,6,'#E07830'],[15,6,D],
 [2,7,D],[3,7,'#E07830'],[4,7,'#FF9A50'],[5,7,'#FFCC88'],[6,7,'#FFCC88'],[7,7,'#FFCC88'],[8,7,'#FFCC88'],[9,7,'#FFCC88'],[10,7,'#FFCC88'],[11,7,'#FFCC88'],[12,7,'#FFCC88'],[13,7,'#FF9A50'],[14,7,'#E07830'],[15,7,D],
 [2,8,D],[3,8,'#E07830'],[4,8,'#FF9A50'],[5,8,'#FFCC88'],[6,8,'#FFCC88'],[7,8,'#FFCC88'],[8,8,'#FFCC88'],[9,8,'#FFCC88'],[10,8,'#FFCC88'],[11,8,'#FFCC88'],[12,8,'#FFCC88'],[13,8,'#FF9A50'],[14,8,'#E07830'],[15,8,D],
 [3,9,D],[4,9,'#E07830'],[5,9,'#FF9A50'],[6,9,'#FF9A50'],[7,9,'#FF9A50'],[8,9,'#FF9A50'],[9,9,'#FF9A50'],[10,9,'#FF9A50'],[11,9,'#FF9A50'],[12,9,'#FF9A50'],[13,9,'#E07830'],[14,9,D],
 [3,10,D],[4,10,'#E07830'],[5,10,'#FF9A50'],[6,10,'#FF9A50'],[7,10,'#FF9A50'],[8,10,'#FF9A50'],[9,10,'#FF9A50'],[10,10,'#FF9A50'],[11,10,'#FF9A50'],[12,10,'#FF9A50'],[13,10,'#E07830'],[14,10,D],
// --- EYES ---
 [4,5,D],[5,5,D],[4,6,'#1a88FF'],[5,6,'#3AABFF'],[4,7,D],[5,7,D],[5,5,'#AACCFF'],
 [11,5,D],[12,5,D],[11,6,'#1a88FF'],[12,6,'#3AABFF'],[11,7,D],[12,7,D],[11,5,'#AACCFF'],
// tabby stripes on forehead
 [6,3,'#D06828'],[7,3,'#D06828'],[9,3,'#D06828'],[10,3,'#D06828'],
 [5,4,'#D06828'],[11,4,'#D06828'],
// --- NOSE ---
 [8,9,'#FF6090'],[9,9,'#FF70A0'],[8,10,'#E04070'],[9,10,'#E04070'],
// mouth
 [7,11,D],[8,11,D],[10,11,D],[11,11,D],
// cheek blush
 [3,7,'#FFBBAA'],[3,8,'#FFBBAA'],[14,7,'#FFBBAA'],[14,8,'#FFBBAA'],
// whiskers
 [0,8,'#CCC'],[1,8,'#CCC'],[2,8,'#CCC'],
 [0,9,'#BBB'],[1,9,'#BBB'],
 [15,8,'#CCC'],[16,8,'#CCC'],[17,8,'#CCC'],
 [15,9,'#BBB'],[16,9,'#BBB'],
// --- BODY ---
 [3,11,D],[4,11,'#CC6820'],[5,11,'#E07830'],[6,11,'#FF9A50'],[7,11,'#FF9A50'],[8,11,'#FF9A50'],[9,11,'#FF9A50'],[10,11,'#FF9A50'],[11,11,'#FF9A50'],[12,11,'#FF9A50'],[13,11,'#E07830'],[14,11,'#CC6820'],[15,11,D],
 [3,12,D],[4,12,'#CC6820'],[5,12,'#E07830'],[6,12,'#FFAA60'],[7,12,'#FFAA60'],[8,12,'#FFAA60'],[9,12,'#FFAA60'],[10,12,'#FFAA60'],[11,12,'#FFAA60'],[12,12,'#E07830'],[13,12,'#CC6820'],[14,12,D],
 [3,13,D],[4,13,'#CC6820'],[5,13,'#E07830'],[6,13,'#FF9A50'],[7,13,'#FF9A50'],[8,13,'#FF9A50'],[9,13,'#FF9A50'],[10,13,'#FF9A50'],[11,13,'#FF9A50'],[12,13,'#E07830'],[13,13,'#CC6820'],[14,13,D],
 [3,14,D],[4,14,'#CC6820'],[5,14,'#E07830'],[6,14,'#FF9A50'],[7,14,'#FF9A50'],[8,14,'#FF9A50'],[9,14,'#FF9A50'],[10,14,'#FF9A50'],[11,14,'#FF9A50'],[12,14,'#E07830'],[13,14,'#CC6820'],[14,14,D],
// belly lighter
 [7,12,'#FFCC88'],[8,12,'#FFCC88'],[9,12,'#FFCC88'],[7,13,'#FFCC88'],[8,13,'#FFD09A'],[9,13,'#FFCC88'],
// tabby body stripes
 [4,14,'#AA5010'],[4,15,'#AA5010'],[13,14,'#AA5010'],[13,15,'#AA5010'],
 [3,15,D],[4,15,'#CC6820'],[5,15,'#E07830'],[6,15,'#E07830'],[7,15,'#FF9A50'],[8,15,'#FF9A50'],[9,15,'#FF9A50'],[10,15,'#E07830'],[11,15,'#E07830'],[12,15,'#CC6820'],[13,15,D],
 [3,16,D],[4,16,'#CC6820'],[5,16,'#D07030'],[6,16,'#E07830'],[7,16,'#E07830'],[8,16,'#E07830'],[9,16,'#E07830'],[10,16,'#D07030'],[11,16,'#CC6820'],[12,16,D],
 [4,17,D],[5,17,'#CC6820'],[6,17,'#D07030'],[7,17,'#D07030'],[8,17,'#CC6820'],[9,17,'#D07030'],[10,17,'#D07030'],[11,17,'#CC6820'],[12,17,D],
// --- PAWS ---
 [4,18,D],[5,18,'#CC6820'],[6,18,'#E07830'],[7,18,'#E07830'],[8,18,'#CC6820'],[9,18,D],
 [11,18,D],[12,18,'#CC6820'],[13,18,'#E07830'],[14,18,'#E07830'],[15,18,'#CC6820'],[16,18,D],
 [4,19,D],[5,19,'#E08840'],[6,19,'#FFAA60'],[7,19,'#FFAA60'],[8,19,'#E08840'],[9,19,D],
 [11,19,D],[12,19,'#E08840'],[13,19,'#FFAA60'],[14,19,'#FFAA60'],[15,19,'#E08840'],[16,19,D],
// paw toes
 [5,20,'#D07030'],[6,20,'#D07030'],[7,20,'#D07030'],
 [12,20,'#D07030'],[13,20,'#D07030'],[14,20,'#D07030'],
// --- TAIL ---
 [17,12,'#E07830'],[18,11,'#FF9A50'],[19,10,'#FFAA60'],[20,10,'#E07830'],
 [17,13,'#CC6820'],[18,12,'#E07830'],[19,11,'#FFAA60'],
 [20,11,'#CC6820'],[21,11,'#E07830'],[21,12,'#CC6820'],
].forEach(([x,y,c])=>$(x,y,c));
});
},

dog(ctx,sz){
this._scaled(ctx,sz,24,24,(_c)=>{
// Golden retriever – 24×26 hand-authored sprite
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const D='#1a0800',G='#D4A030',DG='#9A7020',LG='#F0CC70',WG='#FCEAA8';
[
// --- FLOPPY EARS (left y=2..11 x=1..4, right x=19..22) ---
 [1,2,DG],[2,2,'#8B5810'],[3,2,'#8B5810'],[4,2,DG],
 [1,3,DG],[2,3,DG],[3,3,DG],[4,3,'#7a4a08'],
 [1,4,'#7a4a08'],[2,4,DG],[3,4,DG],[4,4,DG],
 [1,5,DG],[2,5,DG],[3,5,DG],[4,5,'#8B5810'],
 [1,6,DG],[2,6,DG],[3,6,'#9B6820'],[4,6,DG],
 [1,7,DG],[2,7,DG],[3,7,DG],[4,7,DG],
 [1,8,'#8B5810'],[2,8,DG],[3,8,DG],
 [19,2,DG],[20,2,'#8B5810'],[21,2,'#8B5810'],[22,2,DG],
 [19,3,'#7a4a08'],[20,3,DG],[21,3,DG],[22,3,DG],
 [19,4,DG],[20,4,DG],[21,4,DG],[22,4,'#7a4a08'],
 [19,5,'#8B5810'],[20,5,DG],[21,5,DG],[22,5,DG],
 [19,6,DG],[20,6,'#9B6820'],[21,6,DG],[22,6,DG],
 [19,7,DG],[20,7,DG],[21,7,DG],[22,7,DG],
 [20,8,DG],[21,8,DG],[22,8,'#8B5810'],
// --- HEAD ---
 [4,2,D],[5,2,LG],[6,2,LG],[7,2,LG],[8,2,LG],[9,2,LG],[10,2,LG],[11,2,LG],[12,2,LG],[13,2,LG],[14,2,LG],[15,2,LG],[16,2,LG],[17,2,LG],[18,2,D],
 [4,3,D],[5,3,LG],[6,3,LG],[7,3,LG],[8,3,WG],[9,3,WG],[10,3,WG],[11,3,WG],[12,3,WG],[13,3,WG],[14,3,WG],[15,3,LG],[16,3,LG],[17,3,LG],[18,3,D],
 [4,4,D],[5,4,G],[6,4,LG],[7,4,WG],[8,4,WG],[9,4,WG],[10,4,WG],[11,4,WG],[12,4,WG],[13,4,WG],[14,4,WG],[15,4,LG],[16,4,G],[17,4,G],[18,4,D],
 [4,5,D],[5,5,G],[6,5,G],[7,5,G],[8,5,LG],[9,5,LG],[10,5,LG],[11,5,LG],[12,5,LG],[13,5,LG],[14,5,G],[15,5,G],[16,5,G],[17,5,DG],[18,5,D],
 [4,6,D],[5,6,G],[6,6,G],[7,6,G],[8,6,G],[9,6,G],[10,6,G],[11,6,G],[12,6,G],[13,6,G],[14,6,G],[15,6,G],[16,6,DG],[17,6,DG],[18,6,D],
 [4,7,D],[5,7,G],[6,7,G],[7,7,G],[8,7,G],[9,7,G],[10,7,G],[11,7,G],[12,7,G],[13,7,G],[14,7,G],[15,7,G],[16,7,DG],[17,7,DG],[18,7,D],
// --- EYES ---
 [7,4,D],[8,4,D],[7,5,'#5C3010'],[8,5,'#5C3010'],[7,6,D],[8,6,D],[8,4,'#bbaa88'],
 [14,4,D],[15,4,D],[14,5,'#5C3010'],[15,5,'#5C3010'],[14,6,D],[15,6,D],[14,4,'#bbaa88'],
// --- SNOUT ---
 [6,8,DG],[7,8,G],[8,8,LG],[9,8,LG],[10,8,LG],[11,8,LG],[12,8,LG],[13,8,G],[14,8,G],[15,8,DG],
 [6,9,DG],[7,9,G],[8,9,LG],[9,9,LG],[10,9,LG],[11,9,LG],[12,9,LG],[13,9,G],[14,9,DG],
 [6,10,DG],[7,10,'#C89030'],[8,10,'#C89030'],[9,10,'#C89030'],[10,10,'#C89030'],[11,10,'#C89030'],[12,10,'#C89030'],[13,10,DG],
 [7,11,DG],[8,11,'#C89030'],[9,11,'#C89030'],[10,11,'#C89030'],[11,11,'#C89030'],[12,11,DG],
// nose
 [9,8,D],[10,8,'#222'],[11,8,'#333'],[12,8,D],
 [9,9,'#111'],[10,9,'#444'],[11,9,'#333'],[12,9,'#222'],[10,9,'#777'],
// mouth
 [8,11,D],[10,11,D],[11,11,D],[12,11,D],
// --- COLLAR ---
 [5,12,'#CC2020'],[6,12,'#DD3030'],[7,12,'#CC2020'],[8,12,'#DD3030'],[9,12,'#CC2020'],
 [10,12,'#DD3030'],[11,12,'#CC2020'],[12,12,'#DD3030'],[13,12,'#CC2020'],[14,12,'#DD3030'],[15,12,'#CC2020'],[16,12,'#DD3030'],
 [5,13,'#AA1010'],[6,13,'#CC2020'],[7,13,'#AA1010'],[8,13,'#CC2020'],[9,13,'#AA1010'],
 [10,13,'#CC2020'],[11,13,'#AA1010'],[12,13,'#CC2020'],[13,13,'#AA1010'],[14,13,'#CC2020'],[15,13,'#AA1010'],[16,13,'#AA1010'],
// tag
 [11,13,'#FFD166'],[12,13,'#FFD166'],[11,14,'#EEB840'],[12,14,'#FFD166'],
// --- BODY ---
 [4,14,D],[5,14,DG],[6,14,G],[7,14,G],[8,14,LG],[9,14,LG],[10,14,LG],[11,14,LG],[12,14,LG],[13,14,G],[14,14,G],[15,14,DG],[16,14,DG],[17,14,D],
 [4,15,D],[5,15,DG],[6,15,G],[7,15,LG],[8,15,LG],[9,15,LG],[10,15,LG],[11,15,LG],[12,15,LG],[13,15,G],[14,15,G],[15,15,DG],[16,15,D],
 [4,16,D],[5,16,DG],[6,16,G],[7,16,G],[8,16,G],[9,16,G],[10,16,G],[11,16,G],[12,16,G],[13,16,G],[14,16,DG],[15,16,D],
 [4,17,D],[5,17,DG],[6,17,G],[7,17,G],[8,17,G],[9,17,G],[10,17,G],[11,17,G],[12,17,G],[13,17,DG],[14,17,D],
 [4,18,D],[5,18,DG],[6,18,DG],[7,18,G],[8,18,G],[9,18,G],[10,18,G],[11,18,G],[12,18,DG],[13,18,D],
// --- LEGS ---
 [5,19,D],[6,19,DG],[7,19,G],[8,19,G],[9,19,G],[10,19,G],[11,19,DG],[12,19,D],
 [5,20,D],[6,20,DG],[7,20,G],[8,20,G],[9,20,G],[10,20,G],[11,20,DG],[12,20,D],
// back legs
 [5,19,D],[6,19,DG],[5,22,D],[6,22,DG],[7,22,G],[8,22,DG],[5,23,D],[6,23,'#C89030'],[7,23,'#C89030'],[8,23,DG],[9,23,D],
 [14,19,D],[15,19,DG],[16,19,G],[14,22,D],[15,22,DG],[16,22,G],[17,22,DG],[14,23,D],[15,23,'#C89030'],[16,23,'#C89030'],[17,23,DG],[18,23,D],
// front legs
 [5,19,D],[6,19,G],[7,19,G],[8,19,G],[5,21,D],[6,21,G],[7,21,G],[8,21,G],[5,22,D],[6,22,G],[7,22,G],[8,22,G],
 [14,19,D],[15,19,G],[16,19,G],[17,19,G],[14,21,D],[15,21,G],[16,21,G],[17,21,G],[14,22,D],[15,22,G],[16,22,G],[17,22,G],
// paws
 [5,23,D],[6,23,LG],[7,23,LG],[8,23,LG],[9,23,D],
 [14,23,D],[15,23,LG],[16,23,LG],[17,23,LG],[18,23,D],
// --- TAIL ---
 [18,14,G],[19,13,LG],[20,12,G],[21,11,LG],[21,10,G],[20,10,DG],
 [18,15,DG],[19,14,G],[20,13,DG],
].forEach(([x,y,c])=>$(x,y,c));
});
},

sneaker(ctx,sz){
// Scale-aware sneaker: separate hand-authored sprites for 16, 32, 64
const draw16=()=>{
  // 14w × 10h, centered
  const ox=Math.floor((sz-14)/2), oy=Math.floor((sz-10)/2);
  const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,1,1);};
  // sole
  for(let x=0;x<=13;x++){$(x,8,'#D8D8D8');$(x,9,'#AAAAAA');}
  $(0,9,'#888');$(13,9,'#888');
  // upper body (indigo)
  for(let y=3;y<=8;y++) for(let x=0;x<=10;x++){
    $(x,y,(x===0||y===3)?'#4a44BB':'#6C63FF');
  }
  // heel rise
  for(let y=1;y<=3;y++) for(let x=0;x<=2;x++) $(x,y,'#4a44BB');
  $(0,1,'#5555CC');$(1,1,'#5555CC');
  // toe box (white)
  for(let y=4;y<=8;y++) for(let x=10;x<=13;x++) $(x,y,'#F0F0FF');
  $(10,4,'#DDDDEE');$(11,4,'#EEEEEE');
  // swoosh
  [[2,6,'#FF6B6B'],[3,5,'#FF5555'],[4,5,'#FF6B6B'],[5,6,'#FF5555'],[6,7,'#FF6B6B'],[7,7,'#FF5555']].forEach(([x,y,c])=>$(x,y,c));
  // laces (2 dots)
  $(4,3,'#FFF');$(6,3,'#FFF');$(8,3,'#FFF');
  // tongue
  for(let y=1;y<=3;y++) for(let x=3;x<=7;x++) $(x,y,(y===1)?'#5252CC':'#9090DD');
  // outline
  for(let y=1;y<=8;y++){$(0,y,'#222');}
  for(let x=0;x<=13;x++) $(x,9,'#555');
};

const draw32=()=>{
  // 28w × 16h native at 32×32, positioned lower-center
  const ox=2, oy=12;
  const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,1,1);};
  // ── rubber sole ──
  for(let x=0;x<=26;x++){$(x,13,'#E0E0E0');$(x,14,'#C8C8C8');$(x,15,'#A0A0A0');}
  for(let x=2;x<=24;x+=3) $(x,14,'#BBBBBB');// tread
  $(0,15,'#666');$(26,15,'#666');
  // ── main upper (indigo) ──
  for(let y=5;y<=13;y++) for(let x=0;x<=19;x++){
    const dk=(x<=1||y===5);
    $(x,y,dk?'#4a44BB':'#6C63FF');
  }
  // ── heel counter ──
  for(let y=0;y<=6;y++) for(let x=0;x<=4;x++){
    $(x,y,y<=1?'#FF8080':x<=1?'#CC3333':'#DD4444');
  }
  $(1,0,'#FF9090');$(1,1,'#FF9090');// heel shine
  // ── ankle collar highlight ──
  for(let x=2;x<=6;x++) $(x,5,'#8880FF');
  // ── tongue ──
  for(let y=1;y<=6;y++) for(let x=6;x<=13;x++){
    $(x,y,(x===6||x===13||y===1)?'#5050CC':'#9090DD');
  }
  // ── laces (zigzag) ──
  [[7,2,'#FFF'],[9,3,'#FFF'],[11,2,'#FFF'],[8,2,'#DDD'],[10,3,'#DDD'],
   [7,4,'#FFF'],[9,5,'#FFF'],[11,4,'#FFF'],[8,4,'#DDD'],[10,5,'#DDD'],
   [6,2,'#999'],[6,4,'#999'],[13,2,'#999'],[13,4,'#999'],// eyelets
  ].forEach(([x,y,c])=>$(x,y,c));
  // ── toe box (white cap) ──
  for(let y=6;y<=13;y++) for(let x=19;x<=26;x++){
    $(x,y,(x===19||y===6)?'#CCCCEE':'#F0F0FF');
  }
  $(20,7,'#FFFFFF');$(21,7,'#FFFFFF');$(20,8,'#FFFFFF');// toe shine
  // ── swoosh (arc) ──
  [[2,11,'#FF6B6B'],[3,10,'#FF5555'],[4,10,'#FF6B6B'],[5,9,'#FF5555'],[6,9,'#FF6B6B'],
   [7,10,'#FF5555'],[8,10,'#FF6B6B'],[9,11,'#FF5555'],[10,11,'#FF6B6B'],[11,12,'#FF5555'],
   [3,11,'#FF9090'],[4,11,'#FF9090'],// highlight
  ].forEach(([x,y,c])=>$(x,y,c));
  // ── brand tab ──
  $(10,1,'#FFD166');$(10,2,'#FFD166');
  // ── outline ──
  for(let y=0;y<=13;y++) $(0,y,'#111');
  for(let x=0;x<=26;x++) $(x,15,'#444');
};

const draw64=()=>{
  // 56w × 30h native at 64×64
  const ox=4, oy=28;
  const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(ox+x,oy+y,1,1);};
  // ── sole ──
  for(let x=0;x<=55;x++){$(x,24,'#EBEBEB');$(x,25,'#D8D8D8');$(x,26,'#C0C0C0');$(x,27,'#AAAAAA');$(x,28,'#888888');}
  for(let x=3;x<=52;x+=5){$(x,25,'#D0D0D0');$(x,26,'#B8B8B8');} // tread
  // ── main upper body ──
  for(let y=9;y<=24;y++) for(let x=0;x<=39;x++){
    const dk=(x<=2||x>=37||y===9);
    $(x,y,dk?'#3a34AA':x<=5?'#5050BB':'#6C63FF');
  }
  // side panel highlight
  for(let y=10;y<=16;y++) for(let x=3;x<=8;x++) $(x,y,'#8880FF');
  // ── heel counter ──
  for(let y=0;y<=12;y++) for(let x=0;x<=8;x++){
    $(x,y,y<=2?'#FF8080':x<=1?'#BB2222':y<=6?'#DD4444':'#CC3333');
  }
  $(2,1,'#FF9090');$(2,2,'#FF9090');$(3,1,'#FF9090');// shine
  // ── tongue ──
  for(let y=2;y<=10;y++) for(let x=12;x<=26;x++){
    $(x,y,(x===12||x===26||y===2)?'#4a44BB':y<=4?'#8888DD':'#9898EE');
  }
  // tongue highlight center
  for(let y=3;y<=7;y++) for(let x=16;x<=22;x++) $(x,y,'#A0A0EE');
  // ── laces ──
  for(let i=0;i<5;i++){
    const y=4+i*2, lx=(i%2===0)?14:17;
    for(let dx=0;dx<8;dx++) $(lx+dx,y,'#EEEEEE');
    $(lx,y,'#FFFFFF');$(lx+7,y,'#FFFFFF');
    $(12,y,'#888');$(26,y,'#888');// eyelets
  }
  // ── toe box ──
  for(let y=12;y<=24;y++) for(let x=39;x<=55;x++){
    $(x,y,(x===39||y===12)?'#CCCCEE':x>=54?'#CCCCEE':'#F4F4FF');
  }
  for(let y=13;y<=17;y++) for(let x=40;x<=46;x++) $(x,y,'#FFFFFF');// toe shine
  $(40,13,'#FAFAFF');$(41,13,'#FFFFFF');
  // ── swoosh (long arc) ──
  [[4,21,'#FF6B6B'],[5,20,'#FF5555'],[6,19,'#FF6B6B'],[7,18,'#FF5555'],[8,17,'#FF6B6B'],
   [9,17,'#FF5555'],[10,18,'#FF6B6B'],[11,18,'#FF5555'],[12,19,'#FF6B6B'],[13,19,'#FF5555'],
   [14,20,'#FF6B6B'],[15,20,'#FF5555'],[16,21,'#FF6B6B'],[17,21,'#FF5555'],[18,22,'#FF6B6B'],[19,22,'#FF5555'],[20,23,'#FF6B6B'],
   [5,21,'#FF9090'],[6,21,'#FF9090'],[7,20,'#FF9090'],[8,20,'#FF9090'],// highlight
  ].forEach(([x,y,c])=>$(x,y,c));
  // ── brand tab on tongue ──
  $(19,2,'#FFD166');$(20,2,'#FFD166');$(19,3,'#FFD166');$(20,3,'#EEB840');
  // ── ankle collar ──
  for(let x=4;x<=14;x++) $(x,9,'#7a76EE');
  // ── outsole logo ──
  $(22,27,'#CCCCCC');$(23,27,'#CCCCCC');$(24,27,'#CCCCCC');$(25,27,'#AAAAAA');
  // ── outline ──
  for(let y=0;y<=24;y++) $(0,y,'#111');
  for(let x=0;x<=55;x++) $(x,28,'#444');
};

if(sz<=16) draw16();
else if(sz<=32) draw32();
else draw64();
},

skate(ctx,sz){
this._scaled(ctx,sz,28,28,(_c)=>{
// Skateboard deck – 28×22 hand-authored, wood grain, kicktail, wheels
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
// ── grip tape (top surface, dark) ──
for(let y=0;y<=12;y++) for(let x=2;x<=25;x++){
  $(x,y,'#16162a');
}
// grip tape texture dither
for(let y=0;y<=12;y++) for(let x=2;x<=25;x++){
  if((x+y*3)%7===0) $(x,y,'#1e1e38');
}
// grip edge dots
for(let x=3;x<=24;x+=2){$(x,0,'#222244');$(x,12,'#222244');}
// ── graphic: lightning bolt in yellow ──
[[11,1,'#FFD166'],[12,1,'#FFD166'],[13,1,'#FFD166'],
 [10,2,'#FFD166'],[11,2,'#FFD166'],[12,2,'#FFEE80'],
 [9,3,'#FFD166'],[10,3,'#FFD166'],[11,3,'#FFD166'],
 [10,4,'#FFD166'],[11,4,'#FFD166'],[12,4,'#FFD166'],[13,4,'#FFD166'],
 [11,5,'#FFD166'],[12,5,'#FFEE80'],[13,5,'#FFD166'],
 [12,6,'#FFD166'],[13,6,'#FFD166'],[14,6,'#FFD166'],
 [13,7,'#FFD166'],[14,7,'#FFEE80'],[15,7,'#FFD166'],
 [14,8,'#FFD166'],[15,8,'#FFD166'],[16,8,'#FFD166'],
 [15,9,'#FFD166'],[16,9,'#FFEE80'],
 // shadow
 [14,1,'#BB9900'],[13,3,'#BB9900'],[14,4,'#BB9900'],[14,5,'#BB9900'],
 [15,6,'#BB9900'],[16,7,'#BB9900'],[17,8,'#BB9900'],[17,9,'#BB9900'],
].forEach(([x,y,c])=>$(x,y,c));
// ── deck (maple wood) ──
for(let y=12;y<=16;y++) for(let x=2;x<=25;x++){
  const grain=(x*3+y*7)%11===0;
  const shade=y===12?'#B07050':y===16?'#6a3820':grain?'#7a4828':'#8B5C3E';
  $(x,y,shade);
}
// deck highlight top edge
for(let x=3;x<=24;x++) $(x,13,'#C09060');
// kick tails
for(let y=13;y<=16;y++){
  $(1,y,'#8B5C3E');$(0,y+1,'#6a3820');
  $(26,y,'#8B5C3E');$(27,y+1,'#6a3820');
}
$(0,14,'#B07050');$(27,14,'#B07050');
// ── side rails (dark strip) ──
for(let x=2;x<=25;x++) $(x,17,'#2a1408');
// ── trucks ──
[[3,18,'#8a8a8a'],[4,18,'#AAAAAA'],[5,18,'#999'],[6,18,'#888'],[7,18,'#777'],
 [3,19,'#666'],[4,19,'#888'],[5,19,'#777'],[6,19,'#666'],
 [18,18,'#8a8a8a'],[19,18,'#AAAAAA'],[20,18,'#999'],[21,18,'#888'],[22,18,'#777'],
 [18,19,'#666'],[19,19,'#888'],[20,19,'#777'],[21,19,'#666'],
 // axle bolt
 [4,19,'#DDD'],[20,19,'#DDD'],
].forEach(([x,y,c])=>$(x,y,c));
// ── wheels (4 wheels, 3×3 circles) ──
[[2,19],[7,19],[17,19],[22,19]].forEach(([wx,wy])=>{
  for(let dy=0;dy<4;dy++) for(let dx=0;dx<4;dx++){
    const shade=(dx===0||dx===3||dy===0||dy===3)?'#999':dy===1&&dx===1?'#FFFFFF':'#DDDDDD';
    $(wx+dx,wy+dy,shade);
  }
});
// wheel outlines
[[2,19],[7,19],[17,19],[22,19]].forEach(([wx,wy])=>{
  $(wx,wy,'#777');$(wx+3,wy,'#777');$(wx,wy+3,'#777');$(wx+3,wy+3,'#777');
});
});
},

hoodie(ctx,sz){
this._scaled(ctx,sz,24,24,(_c)=>{
// Oversized drop-shoulder hoodie – 24×24 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const V='#6C63FF',DV='#3a34AA',LV='#9B94FF',XDV='#252070';
// ── head ──
for(let y=0;y<=5;y++) for(let x=7;x<=16;x++){
  $(x,y,(x===7||x===16||y===5)?'#C07040':'#FFCC88');
}
// hair
for(let x=7;x<=16;x++) $(x,0,'#3a2200');
$(6,1,'#3a2200');$(17,1,'#3a2200');
// eyes
$(10,2,'#1a1a1a');$(11,2,'#1a1a1a');$(10,3,'#3a2a0a');$(11,3,'#3a2a0a');
$(10,2,'#FFFAEE');// shine
$(13,2,'#1a1a1a');$(14,2,'#1a1a1a');$(13,3,'#3a2a0a');$(14,3,'#3a2a0a');
$(13,2,'#FFFAEE');
// mouth / expression
$(10,5,'#CC7070');$(11,5,'#EE9090');$(12,5,'#CC7070');
// ── hood panels flanking head ──
for(let y=4;y<=9;y++){
  const spread=Math.max(0,y-4);
  for(let dx=0;dx<2+spread;dx++){
    $(5-dx,y,dx===0?DV:V);
    $(18+dx,y,dx===0?DV:V);
  }
}
// ── body (boxy, drop-shoulder) ──
for(let y=6;y<=21;y++) for(let x=2;x<=21;x++){
  if(y<10&&(x<5||x>18)) continue;
  const shd=(x<=3||x>=20)?DV:y>=19?DV:V;
  $(x,y,shd);
}
// shoulder highlights
for(let x=5;x<=8;x++) $(x,9,LV);
$(5,10,LV);$(6,10,LV);
for(let x=15;x<=18;x++) $(x,9,LV);
$(17,10,LV);$(18,10,LV);
// ── drawstring hole + cord ──
$(11,7,XDV);$(12,7,XDV);
$(10,8,'#4a3a80');$(13,8,'#4a3a80');
// drawstrings
$(9,9,'#CCBBFF');$(9,10,'#CCBBFF');$(9,11,'#BBAAEE');
$(14,9,'#CCBBFF');$(14,10,'#CCBBFF');$(14,11,'#BBAAEE');
// ── front seam ──
for(let y=9;y<=18;y++) $(11,y,DV);
// ── kangaroo pocket ──
for(let y=13;y<=18;y++) for(let x=6;x<=17;x++){
  $(x,y,(x===6||x===17||y===13||y===18)?DV:'#5552CC');
}
$(7,14,LV);$(8,14,LV);$(7,15,LV);// pocket highlight
// ── sleeve cuffs ──
for(let x=2;x<=3;x++) for(let y=17;y<=18;y++) $(x,y,XDV);
for(let x=20;x<=21;x++) for(let y=17;y<=18;y++) $(x,y,XDV);
// ── rib hem ──
for(let x=3;x<=20;x++){
  $(x,20,x%2===0?XDV:DV);
  $(x,21,x%2===0?DV:XDV);
}
});
},

room(ctx,sz){
// Cozy bedroom scene – fills full sz×sz
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);};
// ── back wall ──
for(let y=0;y<sz;y++) for(let x=0;x<sz;x++) $(x,y,y<Math.floor(sz*.6)?'#1a1a2e':'#14142a');
// wall / floor divider
for(let x=0;x<sz;x++) $(x,Math.floor(sz*.6),'#2a205a');
// baseboard molding
for(let x=0;x<sz;x++){
  $(x,Math.floor(sz*.6)+1,'#1e1844');
  $(x,Math.floor(sz*.6)+2,'#2a205a');
}
// ── floor tiles ──
const fy=Math.floor(sz*.6)+1;
for(let y=fy;y<sz;y++) for(let x=0;x<sz;x++){
  const tile=((Math.floor(x/5)+Math.floor((y-fy)/4))%2===0);
  $(x,y,tile?'#24203c':'#1c1830');
}
for(let y=fy;y<sz;y+=4) for(let x=0;x<sz;x++) $(x,y,'#141228');
for(let y=fy;y<sz;y++) for(let x=0;x<sz;x+=5) $(x,y,'#141228');
// ── window (back wall) ──
const wx=sz-12, wy=2, ww=10, wh=10;
for(let y=wy;y<wy+wh;y++) for(let x=wx;x<wx+ww;x++) $(x,y,'#1a3060');
// window pane sky gradient
for(let y=wy+1;y<wy+wh-1;y++) for(let x=wx+1;x<wx+ww-1;x++){
  const t=(y-wy)/wh;
  $(x,y,`rgb(${Math.floor(20+t*10)},${Math.floor(30+t*20)},${Math.floor(80+t*30)})`);
}
// window frame
for(let y=wy;y<wy+wh;y++){$(wx,y,'#3a3060');$(wx+ww-1,y,'#3a3060');}
for(let x=wx;x<wx+ww;x++){$(x,wy,'#3a3060');$(x,wy+wh-1,'#3a3060');}
// cross mullions
const wmx=wx+Math.floor(ww/2), wmy=wy+Math.floor(wh/2);
for(let y=wy;y<wy+wh;y++) $(wmx,y,'#3a3060');
for(let x=wx;x<wx+ww;x++) $(x,wmy,'#3a3060');
// stars in window
[[wx+2,wy+2,'#FFFDE0'],[wx+5,wy+1,'#FFFDE0'],[wx+8,wy+3,'#FFFDE0'],[wx+2,wy+6,'#FFFDE0'],[wx+7,wy+7,'#FFFDE0']].forEach(([x,y,c])=>$(x,y,c));
// moon
$(wx+4,wy+1,'#FFFACD');$(wx+5,wy+1,'#FFFACD');$(wx+4,wy+2,'#FFFACD');$(wx+5,wy+2,'#FFFACD');$(wx+3,wy+2,'#FFFACD');
// ── desk (wooden) ──
const dx=2, dy=Math.floor(sz*.55), dw=sz-14;
for(let x=dx;x<dx+dw;x++){
  $(x,dy,'#7a5a3e');$(x,dy+1,'#6a4a2e');$(x,dy+2,'#5a3a1e');
}
// desk edge highlight
for(let x=dx;x<dx+5;x++) $(x,dy,'#9a7a5e');
// desk legs
$(dx+2,dy+3,'#4a2e1e');$(dx+2,dy+4,'#3a1e0e');$(dx+2,dy+5,'#2a0e00');
$(dx+dw-3,dy+3,'#4a2e1e');$(dx+dw-3,dy+4,'#3a1e0e');$(dx+dw-3,dy+5,'#2a0e00');
// ── monitor on desk ──
const mx=4, my=dy-10;
// monitor frame
for(let y=my;y<my+9;y++) for(let x=mx;x<mx+14;x++){
  $(x,y,(x===mx||x===mx+13||y===my||y===my+8)?'#333333':'#0a0a16');
}
// screen glow (code lines)
$(mx+2,my+2,'#6C63FF');$(mx+3,my+2,'#6C63FF');$(mx+4,my+2,'#6C63FF');
$(mx+6,my+2,'#3DDC97');$(mx+7,my+2,'#3DDC97');
$(mx+2,my+3,'#FFD166');$(mx+3,my+3,'#FFD166');$(mx+4,my+3,'#FFD166');$(mx+5,my+3,'#FFD166');
$(mx+2,my+4,'#FF6B6B');$(mx+3,my+4,'#FF6B6B');$(mx+6,my+4,'#3DDC97');$(mx+7,my+4,'#3DDC97');
$(mx+2,my+5,'#888');$(mx+3,my+5,'#888');$(mx+4,my+5,'#888');$(mx+5,my+5,'#888');
$(mx+2,my+6,'#6C63FF');$(mx+3,my+6,'#6C63FF');$(mx+4,my+6,'#6C63FF');$(mx+5,my+6,'#6C63FF');$(mx+6,my+6,'#6C63FF');
$(mx+11,my+6,'#fff');// cursor
// monitor stand
$(mx+6,my+9,'#333');$(mx+7,my+9,'#333');$(mx+6,my+10,'#444');$(mx+7,my+10,'#444');
$(mx+5,dy,'#333');$(mx+8,dy,'#333');
// ── plant on desk ──
const px2=dx+dw-4;
// pot
$(px2,dy-1,'#8B4513');$(px2+1,dy-1,'#A05020');$(px2+2,dy-1,'#8B4513');
$(px2,dy,'#6a3010');$(px2+1,dy,'#7a4020');$(px2+2,dy,'#6a3010');
// leaves
$(px2,dy-3,'#2a8a20');$(px2+1,dy-4,'#3aaa30');$(px2+2,dy-3,'#2a8a20');
$(px2-1,dy-2,'#1a6a10');$(px2+3,dy-2,'#1a6a10');
$(px2+1,dy-2,'#4acc3a');
// ── mug on desk ──
const mugx=dx+dw-8;
$(mugx,dy-4,'#666');$(mugx+1,dy-4,'#888');$(mugx+2,dy-4,'#666');
$(mugx,dy-3,'#555');$(mugx+1,dy-3,'#FF9A50');$(mugx+2,dy-3,'#555');
$(mugx,dy-2,'#555');$(mugx+1,dy-2,'#777');$(mugx+2,dy-2,'#555');
$(mugx-1,dy-3,'#666');// handle
$(mugx,dy-1,'#444');$(mugx+1,dy-1,'#555');$(mugx+2,dy-1,'#444');
// ── poster on wall ──
for(let y=4;y<=12;y++) for(let x=2;x<=9;x++){
  $(x,y,(x===2||x===9||y===4||y===12)?'#2a2050':'#1e1a40');
}
$(4,6,'#6C63FF');$(5,6,'#6C63FF');$(6,6,'#9B94FF');
$(4,8,'#FF6B6B');$(5,8,'#FF9090');
$(4,10,'#3DDC97');$(5,10,'#3DDC97');$(6,10,'#3DDC97');
// ── rug on floor ──
const rug_y=fy+2;
for(let y=rug_y;y<=rug_y+3;y++) for(let x=3;x<=sz-5;x++){
  $(x,y,(y===rug_y||y===rug_y+3||x===3||x===sz-5)?'#3a2060':'#2a1850');
}
for(let x=5;x<sz-6;x+=4) $(x,rug_y+1,'#4a30A0');
},

character(ctx,sz){
// Anime-style character – 16×24 hand-authored sprite
const o=Math.floor((sz-16)/2);
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y,1,1);};
const SK='#FFCC88',DSK='#D09050',D='#111';
// ── hair (dark brown with highlights) ──
[[0,1,D],[1,1,'#3a2000'],[2,1,'#5a3800'],[3,1,'#7a5010'],[4,1,'#7a5010'],[5,1,'#5a3800'],[6,1,'#3a2000'],[7,1,D],
 [0,2,'#2a1800'],[1,2,'#5a3800'],[2,2,'#7a5010'],[7,2,'#5a3800'],[8,2,'#2a1800'],
 [0,3,'#3a2200'],[1,3,'#6a4800'],
 // hair top
 [1,0,D],[2,0,'#3a2200'],[3,0,'#5a3800'],[4,0,'#5a3800'],[5,0,'#3a2200'],[6,0,D],
].forEach(([x,y,c])=>$(x,y,c));
// ── head ──
for(let y=1;y<=8;y++) for(let x=1;x<=8;x++){
  $(x,y,(x===1||x===8)?DSK:y===8?DSK:SK);
}
// head highlight
$(3,2,'#FFE0A8');$(4,2,'#FFE0A8');$(3,3,'#FFE0A8');
// ── eyes ──
$(3,4,D);$(4,4,'#3a1800');$(3,5,'#3a1800');$(4,5,'#5a3010');$(3,6,D);$(4,6,D);
$(4,4,'#FFFAEE');// left shine
$(6,4,D);$(7,4,'#3a1800');$(6,5,'#3a1800');$(7,5,'#5a3010');$(6,6,D);$(7,6,D);
$(6,4,'#FFFAEE');// right shine
// eyelashes
$(2,4,D);$(3,3,D);// left brow
$(7,3,D);$(8,4,D);// right brow
// ── nose ──
$(5,6,DSK);$(6,6,DSK);
// ── mouth ──
$(4,7,'#CC7070');$(5,7,'#EE9090');$(6,7,'#CC7070');
// ── cheeks ──
$(2,6,DSK);$(3,6,'#FFBBAA');$(8,6,'#FFBBAA');$(9,6,DSK);
// ── neck ──
$(4,9,SK);$(5,9,SK);$(4,10,DSK);$(5,10,DSK);
// ── jacket (indigo) ──
for(let y=10;y<=17;y++) for(let x=1;x<=10;x++){
  $(x,y,(x<=2||x>=9)?'#3a2060':'#6C63FF');
}
// jacket highlights
$(3,11,'#8880FF');$(4,11,'#8880FF');$(3,12,'#7a72EE');
// jacket shading right
$(8,11,'#5545DD');$(9,11,'#4a3acc');$(8,12,'#5545DD');
// ── collar / shirt ──
$(3,10,'#EEE');$(4,10,'#FFF');$(5,10,'#FFF');$(6,10,'#EEE');
// ── zipper ──
$(5,11,'#9990CC');$(5,12,'#9990CC');$(5,13,'#8880BB');$(5,14,'#8880BB');
// ── arms / hands ──
// left arm
$(0,11,SK);$(0,12,SK);$(0,13,DSK);$(1,13,'#3a2060');$(0,14,'#3a2060');
// right arm
$(11,11,SK);$(11,12,SK);$(11,13,DSK);$(10,13,'#3a2060');$(11,14,'#3a2060');
// ── pants ──
for(let y=18;y<=21;y++){
  $(2,y,'#1a1a44');$(3,y,'#252560');$(4,y,'#252560');$(5,y,'#1a1a44');
  $(6,y,'#1a1a44');$(7,y,'#252560');$(8,y,'#252560');$(9,y,'#1a1a44');
}
// pant crease
$(4,18,'#3030AA');$(5,18,'#3030AA');
$(4,19,'#3030AA');$(7,18,'#3030AA');
// ── shoes ──
[
 [1,22,D],[2,22,'#222'],[3,22,'#333'],[4,22,'#333'],[5,22,D],
 [6,22,D],[7,22,'#333'],[8,22,'#333'],[9,22,'#222'],[10,22,D],
 [2,23,'#333'],[3,23,'#444'],[4,23,'#555'],[5,23,'#333'],
 [6,23,'#333'],[7,23,'#444'],[8,23,'#555'],[9,23,'#333'],
].forEach(([x,y,c])=>$(x,y,c));
},

dragon(ctx,sz){
this._scaled(ctx,sz,30,30,(_c)=>{
// Emerald dragon – 30×30 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const G='#2aaa80',DG='#1a7055',LG='#55DDAA',XG='#0f5040',D='#111';
// ── wings (behind body) ──
for(let y=6;y<=20;y++){
  const lw=Math.max(0,5-(y-6)*0.3);
  for(let x=0;x<lw;x++) $(x,y,XG);
}
for(let y=6;y<=20;y++){
  const rw=Math.max(0,5-(y-8)*0.3);
  for(let x=29;x>29-rw;x--) $(x,y,XG);
}
// wing membrane highlights
$(1,8,'#1a7055');$(2,8,'#1a7055');$(2,9,'#1a7055');
$(27,8,'#1a7055');$(28,8,'#1a7055');$(27,9,'#1a7055');
// ── body ──
for(let y=10;y<=25;y++) for(let x=7;x<=20;x++){
  $(x,y,(x<=8||x>=19)?DG:y>=22?DG:G);
}
// body highlight
for(let y=11;y<=18;y++){$(9,y,LG);$(10,y,LG);}
$(9,10,LG);$(10,10,'#88FFD0');$(11,10,LG);
// ── belly scales ──
for(let y=12;y<=23;y+=2) for(let x=11;x<=17;x++){
  $(x,y,'#44CC99');
  if((x+y)%2===0) $(x,y,G);
}
// ── head ──
for(let y=2;y<=11;y++) for(let x=9;x<=24;x++){
  const snout=(x>=20&&y>=6);
  $(x,y,snout?DG:(x<=10||x>=23)?DG:y<=3?LG:G);
}
// head highlight crown
$(11,2,LG);$(12,2,LG);$(13,2,'#88FFD0');$(14,2,LG);$(12,3,LG);
// jaw / chin
for(let y=9;y<=12;y++) for(let x=10;x<=19;x++){
  $(x,y,(x===10||y===12)?DG:G);
}
// ── snout / nose ──
for(let y=6;y<=10;y++) for(let x=20;x<=25;x++){
  $(x,y,DG);
}
$(22,8,XG);$(23,8,XG);// nostrils
// ── horns ──
$(11,0,'#EEC040');$(12,0,'#FFD166');$(12,1,'#FFD166');$(13,1,'#FFD166');
$(16,0,'#FFD166');$(15,0,'#EEC040');$(15,1,'#FFD166');$(14,1,'#EEC040');
// ── glowing eye ──
$(16,4,'#FFD166');$(17,4,'#FFD166');$(18,4,'#FFD166');
$(16,5,'#FF8800');$(17,5,D);$(18,5,'#FF8800');
$(17,4,'#FFFFFF');// shine
$(20,7,D);$(20,8,D);// nostril slits
// ── dorsal spines ──
[[10,1,'#FF6B6B'],[10,2,'#CC3333'],[10,3,DG],
 [12,3,'#FF6B6B'],[12,4,'#CC3333'],[12,5,DG],
 [14,5,'#FF6B6B'],[14,6,'#CC3333'],[14,7,DG],
 [15,8,'#FF6B6B'],[15,9,'#CC3333'],
].forEach(([x,y,c])=>$(x,y,c));
// ── legs & claws ──
// front legs
for(let y=22;y<=26;y++) for(let x=9;x<=11;x++) $(x,y,(x===9)?DG:G);
for(let y=22;y<=26;y++) for(let x=17;x<=19;x++) $(x,y,(x===19)?DG:G);
// claws
[[8,26,D],[9,26,'#88EEC0'],[10,26,'#88EEC0'],[11,26,'#88EEC0'],[12,26,D],
 [16,26,D],[17,26,'#88EEC0'],[18,26,'#88EEC0'],[19,26,'#88EEC0'],[20,26,D],
 [8,27,'#88EEC0'],[11,27,'#88EEC0'],
 [16,27,'#88EEC0'],[20,27,'#88EEC0'],
].forEach(([x,y,c])=>$(x,y,c));
// ── fire breath ──
[[22,5,'#FF9900'],[23,5,'#FF6600'],[24,4,'#FFD166'],[25,4,'#FFD166'],
 [23,6,'#FF6600'],[24,6,'#FF9900'],[25,5,'#FF6600'],[26,5,'#FFD166'],
 [24,7,'#FF4400'],[25,7,'#FF9900'],[26,6,'#FF6600'],[27,5,'#FFD166'],
 [25,8,'#FF2200'],[26,8,'#FF6600'],[27,7,'#FF9900'],[28,6,'#FFD166'],
].forEach(([x,y,c])=>$(x,y,c));
// tail
$(21,20,G);$(22,21,G);$(23,22,LG);$(24,22,G);$(24,21,DG);$(23,21,DG);
});
},

ghost(ctx,sz){
this._scaled(ctx,sz,20,20,(_c)=>{
// Friendly ghost – 20×22 hand-authored, translucent look, glowing eyes
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const L='#E0E0FF',M='#B8B8EE',D='#6060AA',W='#ffffff',S='#8888CC';
// body rows
[[2,1,D],[3,1,M],[4,1,M],[5,1,L],[6,1,L],[7,1,L],[8,1,L],[9,1,L],[10,1,L],[11,1,L],[12,1,L],[13,1,M],[14,1,M],[15,1,D],
 [1,2,D],[2,2,M],[3,2,L],[4,2,L],[5,2,W],[6,2,W],[7,2,W],[8,2,L],[9,2,L],[10,2,L],[11,2,L],[12,2,L],[13,2,L],[14,2,M],[15,2,M],[16,2,D],
 [1,3,D],[2,3,M],[3,3,L],[4,3,W],[5,3,W],[6,3,W],[7,3,L],[8,3,L],[9,3,L],[10,3,L],[11,3,L],[12,3,L],[13,3,L],[14,3,L],[15,3,M],[16,3,D],
 [1,4,D],[2,4,M],[3,4,L],[4,4,L],[5,4,L],[6,4,L],[7,4,L],[8,4,L],[9,4,L],[10,4,L],[11,4,L],[12,4,L],[13,4,L],[14,4,L],[15,4,M],[16,4,D],
 [1,5,D],[2,5,M],[3,5,L],[4,5,L],[5,5,L],[6,5,L],[7,5,L],[8,5,L],[9,5,L],[10,5,L],[11,5,L],[12,5,L],[13,5,L],[14,5,L],[15,5,M],[16,5,D],
 [1,6,D],[2,6,M],[3,6,L],[4,6,L],[5,6,L],[6,6,L],[7,6,L],[8,6,L],[9,6,L],[10,6,L],[11,6,L],[12,6,L],[13,6,L],[14,6,L],[15,6,M],[16,6,D],
 [1,7,D],[2,7,M],[3,7,L],[4,7,L],[5,7,L],[6,7,L],[7,7,L],[8,7,L],[9,7,L],[10,7,L],[11,7,L],[12,7,L],[13,7,L],[14,7,L],[15,7,M],[16,7,D],
 [1,8,D],[2,8,M],[3,8,L],[4,8,L],[5,8,L],[6,8,L],[7,8,L],[8,8,L],[9,8,L],[10,8,L],[11,8,L],[12,8,L],[13,8,L],[14,8,L],[15,8,M],[16,8,D],
 [1,9,D],[2,9,M],[3,9,L],[4,9,L],[5,9,L],[6,9,L],[7,9,L],[8,9,L],[9,9,L],[10,9,L],[11,9,L],[12,9,L],[13,9,L],[14,9,L],[15,9,M],[16,9,D],
 [1,10,D],[2,10,M],[3,10,L],[4,10,L],[5,10,L],[6,10,L],[7,10,L],[8,10,L],[9,10,L],[10,10,L],[11,10,L],[12,10,L],[13,10,L],[14,10,L],[15,10,M],[16,10,D],
 [1,11,D],[2,11,M],[3,11,L],[4,11,L],[5,11,L],[6,11,L],[7,11,L],[8,11,L],[9,11,L],[10,11,L],[11,11,L],[12,11,L],[13,11,L],[14,11,L],[15,11,M],[16,11,D],
 [1,12,D],[2,12,M],[3,12,M],[4,12,L],[5,12,L],[6,12,L],[7,12,L],[8,12,L],[9,12,L],[10,12,L],[11,12,L],[12,12,L],[13,12,L],[14,12,M],[15,12,M],[16,12,D],
 // wavy bottom scallop row 13-16
 [1,13,D],[2,13,M],[3,13,L],[4,13,L],[5,13,L],[6,13,D],
 [6,13,L],[7,13,M],[8,13,D],
 [8,13,L],[9,13,L],[10,13,L],[11,13,D],
 [11,13,L],[12,13,M],[13,13,D],
 [13,13,L],[14,13,L],[15,13,M],[16,13,D],
 [2,14,M],[3,14,L],[4,14,L],[5,14,M],[6,14,D],
 [7,14,L],[8,14,L],[9,14,L],[10,14,M],[11,14,D],
 [12,14,L],[13,14,L],[14,14,M],[15,14,D],
 [2,15,D],[3,15,M],[4,15,M],[5,15,D],
 [7,15,M],[8,15,M],[9,15,M],[10,15,D],
 [12,15,M],[13,15,M],[14,15,D],
].forEach(([x,y,c])=>$(x,y,c));
// eyes (glowing blue)
[[4,6,'#111'],[5,6,'#111'],[6,6,'#111'],[4,7,'#2244EE'],[5,7,'#3366FF'],[6,7,'#2244EE'],[4,8,'#111'],[5,8,'#111'],[6,8,'#111'],[5,6,'#99AAFF'],
 [11,6,'#111'],[12,6,'#111'],[13,6,'#111'],[11,7,'#2244EE'],[12,7,'#3366FF'],[13,7,'#2244EE'],[11,8,'#111'],[12,8,'#111'],[13,8,'#111'],[12,6,'#99AAFF'],
// grin
 [5,11,'#111'],[6,11,'#111'],[7,12,'#111'],[8,11,'#111'],[9,11,'#111'],[10,12,'#111'],[11,11,'#111'],[12,11,'#111'],
// top sheen
 [7,2,W],[8,2,W],[9,2,W],[7,3,W],[8,3,'#F0F0FF'],
].forEach(([x,y,c])=>$(x,y,c));
});
},

alien(ctx,sz){
this._scaled(ctx,sz,20,20,(_c)=>{
// Big-head alien – 20×26 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const G='#3DDC97',DG='#1a7a50',LG='#88FFD0',D='#111',BG='#0a0a1e';
// antennae
$(5,1,DG);$(5,0,DG);$(4,0,'#FFD166');$(5,-1,'#FFD166');$(6,-1,'#FFD166');$(4,-1,'#FFD166');
$(13,1,DG);$(13,0,DG);$(12,-1,'#FFD166');$(13,-1,'#FFD166');$(14,-1,'#FFD166');
// head – big oval
for(let y=0;y<=12;y++){
  const hw=Math.round(2+Math.sin(y*Math.PI/12)*7);
  for(let x=Math.ceil(9-hw);x<=Math.floor(9+hw);x++){
    const rim=(x===Math.ceil(9-hw)||x===Math.floor(9+hw));
    const inner=(x<=Math.ceil(9-hw)+1||x>=Math.floor(9+hw)-1);
    $(x,y,rim?DG:inner?G:y<=2?LG:G);
  }
}
// head sheen top-left
[[5,1,LG],[6,1,LG],[7,1,'#AAFFEE'],[5,2,LG],[6,2,LG]].forEach(([x,y,c])=>$(x,y,c));
// compound eyes (4×4 each)
for(let dy=0;dy<4;dy++) for(let dx=0;dx<4;dx++){
  const rim=(dy===0||dy===3||dx===0||dx===3);
  $(3+dx,4+dy,rim?DG:BG);
  $(11+dx,4+dy,rim?DG:BG);
}
// pupils + shine
[[4,5,'#5544FF'],[5,5,'#6655FF'],[4,6,'#5544FF'],[5,6,'#4433EE'],
 [12,5,'#5544FF'],[13,5,'#6655FF'],[12,6,'#5544FF'],[13,6,'#4433EE'],
 [4,4,'#AABBFF'],[12,4,'#AABBFF'],
].forEach(([x,y,c])=>$(x,y,c));
// nose slits
$(9,9,DG);$(9,10,DG);$(10,9,DG);$(10,10,DG);
// mouth – wide grin
[[5,11,D],[6,11,DG],[7,11,DG],[8,11,DG],[9,11,DG],[10,11,DG],[11,11,DG],[12,11,D],
 [6,12,LG],[7,12,LG],[8,12,LG],[9,12,LG],[10,12,LG],[11,12,LG],
].forEach(([x,y,c])=>$(x,y,c));
// slim body
for(let y=13;y<=20;y++) for(let x=6;x<=12;x++) $(x,y,(x===6||x===12)?DG:y>=18?DG:G);
// arms – angular
[[4,13,DG],[5,14,G],[4,15,LG],[3,16,DG],[2,17,G],[1,18,DG],
 [14,13,DG],[13,14,G],[14,15,LG],[15,16,DG],[16,17,G],[17,18,DG],
].forEach(([x,y,c])=>$(x,y,c));
// legs
[[6,21,DG],[7,21,G],[7,22,DG],[6,23,D],[7,23,LG],[8,23,LG],[9,23,D],
 [11,21,DG],[12,21,G],[12,22,DG],[11,23,D],[12,23,LG],[13,23,LG],[14,23,D],
].forEach(([x,y,c])=>$(x,y,c));
});
},

space(ctx,sz){
// Deep space scene – full sz×sz
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);};
// sky gradient
for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
  const g=Math.floor(2+y*4/sz);
  $(x,y,`rgb(${g},${g},${Math.floor(g*3)})`);
}
// nebula dither
for(let y=12;y<=24;y++) for(let x=0;x<=14;x++){
  if((x+y)%3===0) $(x,y,'rgba(80,30,120,0.65)');
  if((x*2+y)%5===0) $(x,y,'rgba(120,40,180,0.4)');
}
// stars varied brightness
[[2,3,'#ffffff'],[7,8,'#aaaaff'],[15,2,'#ffffff'],[20,11,'#ffff88'],[27,5,'#ffffff'],
 [29,14,'#aaaaff'],[5,20,'#ffffff'],[11,18,'#ffff88'],[22,16,'#ffffff'],[28,22,'#aaaaff'],
 [6,28,'#ffffff'],[18,26,'#ffff88'],[3,16,'#ffff88'],[13,4,'#ffffff'],[9,28,'#ffffff'],[25,29,'#aaaaff'],
].forEach(([x,y,c])=>{if(x<sz&&y<sz) $(x,y,c);});
// ringed planet
for(let y=11;y<=21;y++) for(let x=13;x<=25;x++){
  const d=Math.sqrt((x-19)**2+(y-16)**2);
  if(d>6) continue;
  $(x,y,d<2?'#BBBBFF':d<4?'#8888EE':'#6666CC');
}
$(16,12,'#CCCCFF');$(17,12,'#DDDDFF');$(16,13,'#CCCCFF');// planet highlight
// rings
for(let x=10;x<=28;x++) if(x<sz){
  const ry=Math.round(16.5+Math.sin((x-19)*0.3)*1.5);
  const inside=(x>=14&&x<=24);
  if(!inside&&ry<sz){$(x,ry,'rgba(180,160,240,0.85)');}
}
// rocket
const rx=6,ry2=3;
for(let y=2;y<=9;y++){$(rx,ry2+y,'#CDD4D8');$(rx+1,ry2+y,'#A8B0B4');}
$(rx,ry2,'#FF5555');$(rx,ry2+1,'#FF7070');// nose cone red
$(rx+1,ry2,'#FF8080');// nose shine
$(rx,ry2+3,'#88CCFF');$(rx+1,ry2+3,'#AADDFF');// porthole
// fins
$(rx-1,ry2+8,'#FF5555');$(rx-1,ry2+9,'#CC3333');
$(rx+2,ry2+8,'#FF5555');$(rx+2,ry2+9,'#CC3333');
// exhaust flame
$(rx,ry2+10,'#FF9900');$(rx+1,ry2+10,'#FF9900');
$(rx,ry2+11,'#FFD166');$(rx+1,ry2+12,'#FF6600');
$(rx,ry2+13,'rgba(255,180,60,0.5)');
// moon
$(sz-5,1,'#FFFACD');$(sz-4,1,'#FFFACD');$(sz-3,1,'#FFFACD');
$(sz-6,2,'#FFFACD');$(sz-5,2,'#FFFACD');$(sz-4,2,'#FFFACD');$(sz-3,2,'#FFFACD');$(sz-2,2,'#FFFACD');
$(sz-5,3,'#FFFACD');$(sz-4,3,'#FFFACD');$(sz-3,3,'#FFFACD');
$(sz-4,1,'#CCCCAA');$(sz-3,3,'#CCCCAA');// craters
},

forest(ctx,sz){
// Pine forest night scene – full sz×sz
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);};
const GND=Math.floor(sz*.65);
// night sky gradient
for(let y=0;y<GND;y++) for(let x=0;x<sz;x++){
  const t=y/GND;
  $(x,y,`rgb(${Math.floor(8+t*20)},${Math.floor(10+t*18)},${Math.floor(25+t*40)})`);
}
// ground
for(let y=GND;y<sz;y++) for(let x=0;x<sz;x++){
  $(x,y,y===GND?'#2a7a1a':y===GND+1?'#1e5c14':'#142e0a');
}
// ground highlight
for(let x=0;x<sz;x++) $(x,GND,'#3aaa28');
// stars
[[2,2],[8,4],[17,1],[23,5],[29,2],[5,8],[14,6],[26,7],[1,12],[20,9]].forEach(([x,y])=>{
  if(x<sz&&y<sz) $(x,y,'#FFFACD');
});
// moon with crater
$(sz-6,3,'#FFFACD');$(sz-5,2,'#FFFACD');$(sz-4,2,'#FFFACD');$(sz-3,2,'#FFFACD');$(sz-2,3,'#FFFACD');
$(sz-5,3,'#FFFACD');$(sz-4,3,'#FFFACD');$(sz-3,3,'#FFFACD');$(sz-4,4,'#FFFACD');
$(sz-4,2,'#EEE9A0');// crater
// trees
[{cx:5,h:12,hi:'#3a9a28',mid:'#286a1e',dk:'#1a4a12',tr:'#4a2e14'},
 {cx:16,h:18,hi:'#4aaa38',mid:'#388a28',dk:'#266018',tr:'#5C3D2E'},
 {cx:26,h:10,hi:'#2a8a20',mid:'#206018',dk:'#164010',tr:'#3a2010'},
].forEach(({cx,h,hi,mid,dk,tr})=>{
  for(let y=GND-h;y<=GND;y++){
    const prog=(y-(GND-h))/h;
    const hw=Math.floor(1+prog*4);
    for(let x=cx-hw;x<=cx+hw;x++){
      if(x<0||x>=sz) continue;
      const left=(x<=cx-hw+1), right=(x>=cx+hw-1);
      $(x,y,left?dk:right?mid:hi);
    }
  }
  // trunk
  $(cx,GND+1,tr);$(cx,GND+2,tr);$(cx-1,GND+1,'#2a1808');$(cx+1,GND+2,'#3a2010');
});
// fireflies
[[4,GND-2],[12,GND-4],[21,GND-3],[28,GND-1]].forEach(([x,y])=>{
  if(x<sz&&y>=0&&y<sz) $(x,y,'#FFFFAA');
});
},

city(ctx,sz){
// Neon cyberpunk skyline – full sz×sz
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);};
// gradient sky
for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
  const g=Math.floor(3+y*7/sz);
  $(x,y,`rgb(${g},${g},${Math.floor(g*1.8)})`);
}
// moon + stars
$(sz-5,2,'#FFFACD');$(sz-4,2,'#FFFACD');$(sz-3,2,'#FFFACD');
$(sz-5,3,'#FFFACD');$(sz-4,3,'#FFFACD');$(sz-3,3,'#FFFACD');
$(sz-4,2,'#EEE9A0');
[[2,4],[7,2],[13,3],[20,1],[11,5],[4,7]].forEach(([x,y])=>{if(x<sz&&y<sz) $(x,y,'#FFFACD');});
// buildings
[{x:0,w:8,h:16,c:'#1a1a2e'},{x:5,w:7,h:22,c:'#16213e'},{x:10,w:9,h:13,c:'#0f1a30'},{x:17,w:6,h:19,c:'#1a1a2e'},{x:21,w:9,h:26,c:'#0a1020'}].forEach(({x,w,h,c})=>{
  for(let y=sz-h;y<sz;y++) for(let dx=0;dx<w;dx++){
    if(x+dx>=sz) continue;
    $(x+dx,y,(dx===0||dx===w-1)?'#0a0a18':c);
  }
  // windows
  for(let wy=sz-h+2;wy<sz-2;wy+=3) for(let wx=x+1;wx<x+w-1;wx+=2){
    if(wx>=sz) continue;
    if((wx*7+wy*3)%11>3){
      const wc=['rgba(255,220,80,.7)','rgba(180,220,255,.5)','rgba(255,160,80,.6)'][(wx+wy)%3];
      $(wx,wy,wc);$(wx,wy+1,wc);
    }
  }
  if(h>20) $(x+Math.floor(w/2),sz-h-2,'#FF3333');// antenna
});
// street glow
for(let x=0;x<sz;x++){
  $(x,sz-1,'rgba(255,40,40,.6)');$(x,sz-2,'rgba(255,40,40,.2)');$(x,sz-3,'rgba(255,40,40,.08)');
}
// neon signs
[[1,sz-8,'#00FFCC'],[2,sz-8,'#00FFCC'],[3,sz-8,'#00FFCC'],
 [1,sz-7,'#00FFCC'],[1,sz-6,'#00FFCC'],
 [18,sz-10,'#FF00AA'],[19,sz-10,'#FF00AA'],[20,sz-10,'#FF00AA'],[21,sz-10,'#FF00AA'],
 [18,sz-8,'#FF00AA'],[19,sz-8,'#FF00AA'],[20,sz-8,'#FF00AA'],[21,sz-8,'#FF00AA'],
 [12,sz-6,'#FFE080'],[12,sz-5,'#FFE080'],[12,sz-4,'#555'],[12,sz-3,'#444'],
].forEach(([x,y,c])=>{if(x>=0&&x<sz&&y>=0&&y<sz) $(x,y,c);});
},

bag(ctx,sz){
this._scaled(ctx,sz,20,20,(_c)=>{
// Structured tote bag – 20×22 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const R='#FF6B6B',DR='#CC3333',LR='#FF9999',D='#111';
// strap
for(let y=0;y<=5;y++) for(let x=6;x<=11;x++){
  $(x,y,(x===6||x===11)?DR:(y===0||y===5)?DR:R);
}
$(7,1,LR);$(8,1,LR);// strap highlight
// body outline
for(let y=5;y<=21;y++) for(let x=1;x<=18;x++){
  const edge=(x===1||x===18||y===5||y===21);
  const shd=(x<=3||x>=16)?DR:y>=18?DR:R;
  $(x,y,edge?DR:shd);
}
// body highlight (top-left)
$(2,6,LR);$(3,6,LR);$(4,6,LR);$(2,7,LR);$(3,7,'#FF8080');$(2,8,'#FF8080');$(2,9,'#FF8888');
// zipper strip
for(let x=3;x<=14;x++) $(x,7,x%2===0?'#FFD166':'#CC9900');
$(14,7,'#FFE088');$(15,7,'#CC9900');// pull
// front pocket
for(let y=11;y<=17;y++) for(let x=3;x<=10;x++){
  $(x,y,(x===3||x===10||y===11||y===17)?DR:'#EE5555');
}
// pocket highlight
$(4,12,LR);$(5,12,LR);$(4,13,'#FF8888');
// stitch dots along pocket
for(let x=4;x<=9;x+=2){$(x,11,'#BB2222');$(x,17,'#BB2222');}
// clasp hardware (gold)
[[12,12,'#FFD166'],[13,12,'#FFD166'],[14,12,'#FFD166'],
 [12,13,'#CC9900'],[13,13,'#FFE088'],[14,13,'#CC9900'],
 [12,14,'#CC9900'],[13,14,'#FFD166'],[14,14,'#CC9900'],
 [12,11,'#AA7700'],[14,11,'#AA7700'],
].forEach(([x,y,c])=>$(x,y,c));
// shadow right edge
for(let y=5;y<=21;y++){$(17,y,'rgba(0,0,0,0.2)');$(16,y,'rgba(0,0,0,0.1)');}
// base shadow
for(let x=2;x<=17;x++) $(x,21,'rgba(0,0,0,0.25)');
});
},

cap(ctx,sz){
this._scaled(ctx,sz,20,20,(_c)=>{
// Fitted 5-panel cap – 20×18 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const V='#6C63FF',DV='#3a34AA',LV='#9B94FF',XDV='#252070';
// brim
for(let y=14;y<=16;y++) for(let x=1;x<=18;x++){
  $(x,y,(y===16||x===1||x===18)?XDV:y===14?LV:DV);
}
// brim highlight edge
$(2,14,LV);$(3,14,LV);$(4,14,'#8885EE');
// dome – circular profile
for(let y=2;y<=14;y++){
  const hw=Math.round(2+Math.sin((y-2)*Math.PI/12)*8);
  for(let x=Math.ceil(9-hw);x<=Math.floor(9+hw);x++){
    const lft=(x<=Math.ceil(9-hw)+1), rgt=(x>=Math.floor(9+hw)-1);
    $(x,y,lft?DV:rgt?'#5050CC':y<=3?LV:V);
  }
}
// dome highlights (top-left)
[[4,4,LV],[5,4,LV],[6,4,LV],[5,5,LV],[4,5,LV],
 [4,3,'#C0BBFF'],[5,3,'#C0BBFF'],[6,3,'#C0BBFF'],
 [3,5,LV],[3,6,LV],
].forEach(([x,y,c])=>$(x,y,c));
// dome shadow right
for(let y=4;y<=12;y++){$(16,y,'#4040AA');$(17,y,'#3535AA');}
// crown button
$(8,2,DV);$(9,2,V);$(10,2,DV);$(9,1,DV);
// center panel seam
for(let y=2;y<=13;y++) $(9,y,DV);
// sweatband
for(let x=2;x<=16;x++) $(x,13,XDV);
$(3,13,'#1a1860');$(4,13,'#1a1860');
// embroidered star logo
[[7,7,'#FFD166'],[8,6,'#FFD166'],[9,7,'#FFD166'],
 [6,8,'#FFD166'],[7,8,'#FFD166'],[8,8,'#FFD166'],[9,8,'#FFD166'],[10,8,'#FFD166'],
 [7,9,'#FFD166'],[8,9,'#FFD166'],[9,9,'#FFD166'],
 [8,10,'#FFD166'],
 [9,7,'#EEB840'],[10,9,'#EEB840'],[9,10,'#EEB840'],
].forEach(([x,y,c])=>$(x,y,c));
});
},

sword(ctx,sz){
// Longsword – 12×30 hand-authored, blood groove, leather wrap, golden guard
const o=Math.floor((sz-12)/2);
const $=(x,y,c)=>{ctx.fillStyle=c;ctx.fillRect(o+x,o+y,1,1);};
// blade
for(let y=0;y<=18;y++){
  $(4,y,'#9AA4A8');// left shadow edge
  $(5,y,'#B8C4C8');// shadow
  $(6,y,'#CDD4D8');// main
  $(7,y,'#E0E8EC');// highlight
  $(8,y,'#D0D8DC');// right sheen
}
// blood groove (center channel)
for(let y=2;y<=15;y++) $(6,y,'#8898A8');
// tip
$(5,0,'#A8B4B8');$(6,0,'#CDD4D8');$(7,1,'#E0E8EC');$(5,1,'#A8B4B8');$(6,1,'#CDD4D8');
$(6,0,'#E8EDEF');// tip point
// crossguard
for(let y=17;y<=20;y++) for(let x=2;x<=10;x++){
  $(x,y,(x===2||x===10)?'#996600':y===17?'#FFEE88':y===20?'#AA7700':'#FFD166');
}
$(3,18,'#FFEE88');$(4,18,'#FFEE88');// guard highlight
$(9,18,'#AA7700');$(10,18,'#AA7700');// guard shadow
// guard gems
$(2,19,'#FF6B6B');$(10,19,'#FF6B6B');
$(3,19,'#FF9090');// gem shine
// leather grip wrap
for(let y=21;y<=29;y++) for(let x=5;x<=8;x++){
  $(x,y,(x===5||x===8)?'#3a1e0e':y%2===0?'#6B4A2E':'#8B6040');
}
for(let y=22;y<=28;y+=2) for(let x=5;x<=8;x++) $(x,y,'#2a1008');// wrap lines
$(6,22,'#9B7050');$(6,24,'#9B7050');// grip highlight
// pommel (golden round)
for(let y=28;y<=31;y++) for(let x=4;x<=9;x++){
  $(x,y,(x===4||x===9)?'#AA7700':y===28?'#FFEE88':y===31?'#AA7700':'#FFD166');
}
$(5,29,'#FFEE88');$(6,29,'#FFFFF0');// pommel shine
},

shield(ctx,sz){
this._scaled(ctx,sz,18,18,(_c)=>{
// Kite shield – 18×24 hand-authored, heraldic quarters, gold rim
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
const V='#6C63FF',DV='#3a34AA',LV='#9B94FF';
// body fill kite shape
for(let y=0;y<=23;y++){
  const hw=y<=12?8:Math.max(0,8-(y-12)*0.7);
  for(let x=Math.ceil(8-hw);x<=Math.floor(8+hw);x++){
    const lft=(x<=Math.ceil(8-hw)+1), rgt=(x>=Math.floor(8+hw)-1);
    $(x,y,lft?DV:rgt?'#5050CC':y<=1?LV:V);
  }
}
// gold border
for(let y=0;y<=23;y++){
  const hw=y<=12?8:Math.max(0,8-(y-12)*0.7);
  const xl=Math.ceil(8-hw), xr=Math.floor(8+hw);
  $(xl,y,'#FFD166');$(xr,y,'#EEB840');
}
for(let x=0;x<=16;x++) $(x,0,'#FFD166');
// shield highlight top-left
for(let y=1;y<=5;y++) for(let x=2;x<=5;x++) if(y+x<=7) $(x,y,LV);
// cross
for(let y=4;y<=19;y++) for(let cx=7;cx<=9;cx++) $(cx,y,'#FFFFFF');
for(let y=8;y<=10;y++) for(let x=3;x<=13;x++) $(x,y,'#FFFFFF');
// cross shadow
for(let y=4;y<=19;y++) $(10,y,'rgba(0,0,0,0.2)');
for(let x=3;x<=13;x++) $(x,11,'rgba(0,0,0,0.2)');
// heraldic quarters
[[4,2,'#FF6B6B'],[5,2,'#FF6B6B'],[4,3,'#FF5555'],[5,3,'#FF6B6B'],
 [10,2,'#3DDC97'],[11,2,'#3DDC97'],[10,3,'#2acc80'],[11,3,'#3DDC97'],
 [4,13,'#FFD166'],[5,13,'#FFD166'],[4,14,'#EEC055'],[5,14,'#FFD166'],
 [10,13,'#4FC3F7'],[11,13,'#4FC3F7'],[10,14,'#3AAAD0'],[11,14,'#4FC3F7'],
].forEach(([x,y,c])=>$(x,y,c));
// central boss
[[7,9,'#FFD166'],[8,9,'#FFEE88'],[9,9,'#FFD166'],
 [7,10,'#EEC055'],[8,10,'#FFFACC'],[9,10,'#EEC055'],
 [7,11,'#CC9900'],[8,11,'#FFD166'],[9,11,'#AA7700'],
].forEach(([x,y,c])=>$(x,y,c));
});
},

badge(ctx,sz){
this._scaled(ctx,sz,18,18,(_c)=>{
// Gold medal with ribbon – 18×22 hand-authored
const o=0;
const $=(x,y,c)=>{_c.fillStyle=c;_c.fillRect(o+x,o+y,1,1);};
// ribbon tails
[[4,17,'#CC2020'],[5,17,'#DD3333'],[6,17,'#CC2020'],[7,17,'#DD3333'],[8,17,'#BB1818'],
 [9,17,'#DD3333'],[10,17,'#CC2020'],[11,17,'#DD3333'],[12,17,'#CC2020'],
 [4,18,'#BB1010'],[5,18,'#CC2020'],[6,19,'#CC2020'],[7,19,'#DD3333'],
 [9,18,'#BB1010'],[10,18,'#CC2020'],[11,19,'#CC2020'],[12,19,'#DD3333'],[13,20,'#CC2020'],
 [3,19,'#AA1010'],[13,19,'#AA1010'],
].forEach(([x,y,c])=>$(x,y,c));
// gold circle medal
for(let y=0;y<=16;y++) for(let x=0;x<=16;x++){
  const d=Math.sqrt((x-8)**2+(y-8)**2);
  if(d>8.5) continue;
  const shade=d>7.5?'#AA7700':d>6?'#CC9900':d<1.5?'#FFFACC':d<4?'#FFE088':'#FFD166';
  $(x,y,shade);
}
// rays
for(let i=0;i<8;i++){
  const a=i*Math.PI/4;
  const x1=Math.round(8+6.8*Math.cos(a)), y1=Math.round(8+6.8*Math.sin(a));
  const x2=Math.round(8+8.2*Math.cos(a)), y2=Math.round(8+8.2*Math.sin(a));
  if(x1>=0&&x1<=16&&y1>=0&&y1<=16) $(x1,y1,'#CC9900');
  if(x2>=0&&x2<=16&&y2>=0&&y2<=16) $(x2,y2,'#AA7700');
}
// star on medal (5-pointed feel via cross pattern)
[[7,3,'#fff'],[8,3,'#fff'],[9,3,'#fff'],
 [6,5,'#fff'],[7,5,'#fff'],[8,5,'#fff'],[9,5,'#fff'],[10,5,'#fff'],
 [5,7,'#fff'],[6,7,'#fff'],[7,7,'#fff'],[8,7,'#fff'],[9,7,'#fff'],[10,7,'#fff'],[11,7,'#fff'],
 [6,9,'#fff'],[7,9,'#fff'],[8,9,'#fff'],[9,9,'#fff'],[10,9,'#fff'],
 [7,11,'#fff'],[8,11,'#fff'],[9,11,'#fff'],
 // star shadow
 [9,4,'#DDCC55'],[10,6,'#DDCC55'],[11,8,'#DDCC55'],[10,10,'#DDCC55'],[9,12,'#DDCC55'],
].forEach(([x,y,c])=>$(x,y,c));
// shine arc top-left
[[2,2,'#FFFACC'],[3,2,'#FFFACC'],[4,2,'#FFFACC'],
 [2,3,'#FFE088'],[2,4,'#FFE088'],[3,3,'#FFFACC'],
].forEach(([x,y,c])=>$(x,y,c));
});
},


  // ══════════════════════════════════════════════════
  // 💎 PREMIUM PINK Y2K GLITTER PACK
  // Rules: 32×32 · dark rose outline #8B3A5A · 3-tone cel shading
  // Palette: blush #F6A5C0 · hot #FF2D8B · lav #CE93D8 · blue #A8DAFF
  //          silver #E8E0F0 · cream #FFF9F9 · dark rose #8B3A5A
  // Light: top-left · No antialiasing · No gradients
  // ══════════════════════════════════════════════════

  y2k_boots(ctx,sz){
    const R='#8B3A5A',H='#FF2D8B',M='#C02060',S='#FF80B8',C='#fff',SL='#E8E0F0',SD='#B0A0C0',D='#D070A8';
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    // platform sole
    for(let y=27;y<=31;y++) for(let x=3;x<=27;x++){ctx.fillStyle=y===27?SL:y<=29?'#D0C8E0':SD;ctx.fillRect(x,y,1,1);}
    for(let x=3;x<=27;x++){ctx.fillStyle=R;ctx.fillRect(x,27,1,1);ctx.fillRect(x,31,1,1);}
    for(let y=27;y<=31;y++){ctx.fillStyle=R;ctx.fillRect(3,y,1,1);ctx.fillRect(27,y,1,1);}
    // heel block
    for(let y=21;y<=27;y++) for(let x=19;x<=27;x++){ctx.fillStyle=y<=23?SL:SD;ctx.fillRect(x,y,1,1);}
    for(let x=19;x<=27;x++) ctx.fillStyle=R,ctx.fillRect(x,21,1,1);
    for(let y=21;y<=27;y++){ctx.fillStyle=R;ctx.fillRect(19,y,1,1);ctx.fillRect(27,y,1,1);}
    // main shaft
    for(let y=4;y<=26;y++) for(let x=4;x<=22;x++){
      ctx.fillStyle=x<=6?M:x>=20?M:y<=7?S:H; ctx.fillRect(x,y,1,1);
    }
    // toe box
    for(let y=23;y<=26;y++) for(let x=18;x<=26;x++){ctx.fillStyle=x<=21?H:M;ctx.fillRect(x,y,1,1);}
    // zipper line
    for(let y=6;y<=21;y++) ctx.fillStyle=y%2===0?'#FF60A8':'#FF90C8',ctx.fillRect(7,y,1,1);
    // star cutout highlight illusion
    px([[10,11,C],[11,10,C],[12,11,S],[13,10,C],[14,11,C],
        [10,12,S],[11,12,S],[12,12,S],[13,12,S],[14,12,S],
        [11,13,C],[12,13,S],[13,13,C],
        [10,13,S],[14,13,S],[10,14,C],[11,14,S],[12,14,C],[13,14,S],[14,14,C]]);
    // glossy highlight top-left
    px([[5,5,C],[6,5,C],[7,5,C],[5,6,C],[6,6,'#FFE0EE'],[5,7,'#FFE0EE'],[5,8,'#FFB8D8'],[6,7,'#FFB8D8']]);
    // ankle strap
    for(let x=4;x<=22;x++){ctx.fillStyle=R;ctx.fillRect(x,17,1,1);}
    for(let x=5;x<=21;x++){ctx.fillStyle=S;ctx.fillRect(x,17,1,1);}
    // outline
    for(let y=4;y<=26;y++){ctx.fillStyle=R;ctx.fillRect(4,y,1,1);ctx.fillRect(22,y,1,1);}
    for(let x=4;x<=22;x++) ctx.fillStyle=R,ctx.fillRect(x,4,1,1);
    // sparkle accents
    px([[2,6,'#CE93D8'],[2,7,'#CE93D8'],[3,6,'#CE93D8'],[24,9,'#A8DAFF'],[25,9,'#A8DAFF'],[24,16,'#FFD0E8'],[25,16,'#FFD0E8']]);
  },

  y2k_purse(ctx,sz){
    const R='#8B3A5A',H='#FF2D8B',L='#CE93D8',B='#A8DAFF',S='#E8E0F0',Cr='#FFF9F9',D='#C050A0';
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    // chain strap — alternating links
    for(let i=0;i<9;i++){
      const lx=9+i*2,ly=3+Math.floor(i/3);
      ctx.fillStyle=i%2===0?S:'#C0B8D0'; ctx.fillRect(lx,ly,1,1); ctx.fillRect(lx,ly+1,1,1);
    }
    // body fill — holo shimmer via column cycling
    for(let y=8;y<=26;y++) for(let x=5;x<=26;x++){
      const d=Math.sqrt((x-15.5)**2+(y-17)**2);
      if(d>11) continue;
      const col=(x+y)%6;
      ctx.fillStyle=[L,B,H,S,'#F6A5C0','#D4E8FF'][col]; ctx.fillRect(x,y,1,1);
    }
    // semi-opaque overlay for body solidity
    for(let y=10;y<=24;y++) for(let x=8;x<=23;x++){
      const d=Math.sqrt((x-15.5)**2+(y-17)**2);
      if(d<9){ctx.fillStyle='rgba(240,210,250,0.55)';ctx.fillRect(x,y,1,1);}
    }
    // glossy highlight top-left
    px([[7,9,Cr],[8,9,Cr],[9,9,Cr],[7,10,Cr],[8,10,'#EEE8FF'],[7,11,'#EEE8FF'],[9,10,'#E0D8FF']]);
    // zipper top
    for(let x=8;x<=23;x++) ctx.fillStyle=x%2===0?S:'#C0B8D0',ctx.fillRect(x,9,1,1);
    // heart clasp
    px([[13,15,H],[14,15,H],[15,15,H],[16,15,H],[17,15,H],[18,15,H],
        [12,16,H],[13,16,Cr],[14,16,H],[15,16,Cr],[16,16,H],[17,16,Cr],[18,16,H],[19,16,H],
        [12,17,H],[13,17,H],[14,17,H],[15,17,H],[16,17,H],[17,17,H],[18,17,H],[19,17,H],
        [13,18,H],[14,18,H],[15,18,H],[16,18,H],[17,18,H],[18,18,H],
        [14,19,H],[15,19,H],[16,19,H],[17,19,H],[15,20,H],[16,20,H],
        // heart outline
        [12,15,R],[19,15,R],[11,16,R],[20,16,R],[11,17,R],[20,17,R],
        [12,18,R],[19,18,R],[13,19,R],[18,19,R],[14,20,R],[17,20,R],[15,21,R],[16,21,R]]);
    // body outline
    for(let y=8;y<=26;y++) for(let x=5;x<=26;x++){
      const d=Math.sqrt((x-15.5)**2+(y-17)**2);
      if(d>=10.5&&d<=11.5){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
    }
    // sparkle dots
    px([[4,13,'#fff'],[27,13,'#fff'],[4,21,'#A8DAFF'],[27,21,'#CE93D8'],
        [11,26,'#fff'],[20,26,'#FF2D8B'],[15,7,'#CE93D8']]);
  },

  y2k_hoodie(ctx,sz){
    const R='#8B3A5A',H='#FF2D8B',P='#F6A5C0',L='#CE93D8',Cr='#fff',D='#C060A0';
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    // skin head
    for(let y=1;y<=7;y++) for(let x=11;x<=20;x++){ctx.fillStyle=y<=5?'#FFCC88':'#D09060';ctx.fillRect(x,y,1,1);}
    // hair buns Y2K
    px([[9,0,'#4a2e00'],[10,0,'#4a2e00'],[9,1,'#8B5a00'],[10,1,'#8B5a00'],[9,2,'#8B5a00'],
        [21,0,'#4a2e00'],[22,0,'#4a2e00'],[21,1,'#8B5a00'],[22,1,'#8B5a00'],[22,2,'#8B5a00'],
        [11,0,'#4a2e00'],[20,0,'#4a2e00']]);
    // face
    px([[13,3,'#111'],[14,3,'#111'],[17,3,'#111'],[18,3,'#111'],[14,3,Cr],[18,3,Cr],
        [15,5,'#CC8060'],[16,5,'#CC8060'],[12,4,'#FFBB77'],[19,4,'#FFBB77']]);
    // hood
    for(let y=7;y<=13;y++){
      px([[8,y,L],[9,y,L],[22,y,L],[23,y,L]]);
      if(y>=9)px([[7,y,D],[24,y,D]]);
    }
    // body cropped at y=23
    for(let y=8;y<=23;y++) for(let x=5;x<=26;x++){
      if(y<10&&(x<9||x>22)) continue;
      ctx.fillStyle=x<=7||x>=24?D:y>=21?D:P; ctx.fillRect(x,y,1,1);
    }
    // glitter hem
    for(let x=6;x<=25;x++){
      ctx.fillStyle=x%3===0?H:x%3===1?L:'#A8DAFF'; ctx.fillRect(x,22,1,1);
      ctx.fillStyle=x%2===0?Cr:H; ctx.fillRect(x,23,1,1);
    }
    // sleeve sparkle
    for(let y=11;y<=20;y++){
      ctx.fillStyle=y%2===0?Cr:H; ctx.fillRect(5,y,1,1); ctx.fillRect(26,y,1,1);
    }
    // pocket
    for(let y=15;y<=20;y++) for(let x=12;x<=19;x++){
      ctx.fillStyle=y===15||y===20||x===12||x===19?D:'rgba(200,130,180,0.35)'; ctx.fillRect(x,y,1,1);
    }
    // shoulder highlight
    px([[9,9,Cr],[10,9,Cr],[11,9,'#FFEEF8'],[9,10,'#FFEEF8']]);
    // outline
    for(let y=8;y<=23;y++){ctx.fillStyle=R;ctx.fillRect(5,y,1,1);ctx.fillRect(26,y,1,1);}
    for(let x=5;x<=26;x++) ctx.fillStyle=R,ctx.fillRect(x,23,1,1);
    // sparkles
    px([[14,11,Cr],[18,13,Cr],[11,17,Cr],[22,16,Cr],[16,19,'#A8DAFF'],[13,21,'#CE93D8']]);
  },

  y2k_clip(ctx,sz){
    const R='#8B3A5A',H='#FF2D8B',P='#F6A5C0',L='#CE93D8',B='#A8DAFF',S='#E8E0F0',C='#fff';
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    // top butterfly — pink wings
    [[9,6,6,P,H],[14,6,6,H,P]].forEach(([wcx,wcy,wr,ca,cb])=>{
      for(let y=wcy-wr+1;y<=wcy+wr-1;y++) for(let x=wcx-wr+1;x<=wcx+wr-1;x++){
        if(Math.sqrt((x-wcx)**2+(y-wcy)**2)<wr){ctx.fillStyle=x<wcx?ca:cb;ctx.fillRect(x,y,1,1);}
      }
    });
    // top wing highlights
    px([[5,3,C],[6,3,C],[5,4,'#FFE0EE'],[16,3,C],[17,3,C],[16,4,'#FFE0EE']]);
    // top wing spots
    px([[6,6,'#FFB8D8'],[7,6,'#FFB8D8'],[8,7,'#FFB8D8'],[14,6,'#FFB8D8'],[15,6,'#FFB8D8'],[16,7,'#FFB8D8']]);
    // clip bar top
    for(let x=10;x<=18;x++) ctx.fillStyle=S,ctx.fillRect(x,6,1,2);
    px([[10,6,R],[18,6,R],[10,7,R],[18,7,R]]);
    // top outline
    for(let oi=0;oi<2;oi++){
      const [wcx,wcy,wr]=[oi===0?9:14,6,6];
      for(let y=wcy-wr;y<=wcy+wr;y++) for(let x=wcx-wr;x<=wcx+wr;x++){
        const d=Math.sqrt((x-wcx)**2+(y-wcy)**2);
        if(d>=wr-0.5&&d<wr+0.5){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
      }
    }
    // bottom butterfly — lav+blue
    [[10,20,6,B,L],[19,20,6,L,B]].forEach(([wcx,wcy,wr,ca,cb])=>{
      for(let y=wcy-wr+1;y<=wcy+wr-1;y++) for(let x=wcx-wr+1;x<=wcx+wr-1;x++){
        if(Math.sqrt((x-wcx)**2+(y-wcy)**2)<wr){ctx.fillStyle=x<wcx?ca:cb;ctx.fillRect(x,y,1,1);}
      }
    });
    px([[6,17,C],[7,17,C],[6,18,'#E0EEFF'],[21,17,C],[22,17,C],[21,18,'#E0EEFF']]);
    for(let x=13;x<=21;x++) ctx.fillStyle=S,ctx.fillRect(x,20,1,2);
    px([[13,20,R],[21,20,R],[13,21,R],[21,21,R]]);
    for(let oi=0;oi<2;oi++){
      const [wcx,wcy,wr]=[oi===0?10:19,20,6];
      for(let y=wcy-wr;y<=wcy+wr;y++) for(let x=wcx-wr;x<=wcx+wr;x++){
        const d=Math.sqrt((x-wcx)**2+(y-wcy)**2);
        if(d>=wr-0.5&&d<wr+0.5){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
      }
    }
    // sparkles
    px([[1,6,'#FF2D8B'],[1,7,'#FF2D8B'],[29,6,'#CE93D8'],[29,7,'#CE93D8'],
        [1,20,'#A8DAFF'],[29,20,'#F6A5C0'],[14,13,C],[15,13,H],[16,13,C]]);
  },

  y2k_heart(ctx,sz){
    const R='#8B3A5A',H='#FF2D8B',M='#AA0050',S='#FF70A8',C='#fff',GF='#FF4488';
    const inHeart=(x,y)=>{
      const dl=Math.sqrt((x-10)**2+(y-11)**2),dr=Math.sqrt((x-21)**2+(y-11)**2);
      return dl<=8||dr<=8||(y>=11&&Math.abs(x-15.5)<=(y-11)*0.9+0.5&&y<=29);
    };
    // outer glow halo
    for(let y=1;y<sz;y++) for(let x=0;x<sz;x++){
      if(inHeart(x,y)&&(!inHeart(x-1,y)||!inHeart(x+1,y)||!inHeart(x,y-1)||!inHeart(x,y+1))){
        [[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-2,y],[x+2,y],[x,y-2],[x,y+2]].forEach(([nx,ny])=>{
          if(nx>=0&&nx<sz&&ny>=0&&ny<sz&&!inHeart(nx,ny)){ctx.fillStyle='rgba(255,45,139,0.18)';ctx.fillRect(nx,ny,1,1);}
        });
      }
    }
    // heart fill 3-tone
    for(let y=3;y<sz;y++) for(let x=0;x<sz;x++){
      if(!inHeart(x,y)) continue;
      const dl=Math.sqrt((x-10)**2+(y-11)**2),dr=Math.sqrt((x-21)**2+(y-11)**2);
      const edge=dl>=6.5||dr>=6.5||y>=27;
      ctx.fillStyle=edge?M:dl<4||dr<4?S:H; ctx.fillRect(x,y,1,1);
    }
    // inner glow
    for(let y=5;y<=26;y++) for(let x=4;x<=27;x++){
      if(!inHeart(x,y)) continue;
      const dl=Math.sqrt((x-10)**2+(y-11)**2),dr=Math.sqrt((x-21)**2+(y-11)**2);
      const inTri=y>=11&&Math.abs(x-15.5)<=(y-11)*0.9-1&&y<=27;
      if((dl<5&&dl>2.5)||(dr<5&&dr>2.5)||inTri){ctx.fillStyle=GF;ctx.fillRect(x,y,1,1);}
    }
    // hot core
    for(let y=7;y<=25;y++) for(let x=7;x<=24;x++){
      const dl=Math.sqrt((x-10)**2+(y-11)**2),dr=Math.sqrt((x-21)**2+(y-11)**2);
      if(dl<2||dr<2){ctx.fillStyle=C;ctx.fillRect(x,y,1,1);}
    }
    // outline
    for(let y=3;y<sz;y++) for(let x=0;x<sz;x++){
      if(inHeart(x,y)){
        const edge=!inHeart(x-1,y)||!inHeart(x+1,y)||!inHeart(x,y-1)||!inHeart(x,y+1);
        if(edge){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
      }
    }
    // wall mount
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    px([[13,1,'#C8C0D8'],[14,1,S],[15,1,S],[16,1,S],[17,1,S],[18,1,'#C8C0D8'],
        [13,2,'#C8C0D8'],[18,2,'#C8C0D8']]);
    // specular glints on tube surface
    px([[9,7,C],[10,7,C],[21,7,C],[22,7,C],[9,8,'#FFD0E8'],[22,8,'#FFD0E8'],
        [15,28,C],[16,28,C],[5,19,'#FFD0E8'],[26,19,'#FFD0E8']]);
  },

  y2k_mirror(ctx,sz){
    const R='#8B3A5A',P='#F6A5C0',D='#C060A0',S='#E8E0F0',Cr='#FFF9F9',Y='#FFE060';
    const cx=15,cy=14,fr=12,mr=8;
    const px=(arr)=>arr.forEach(([x,y,c])=>{ctx.fillStyle=c;ctx.fillRect(x,y,1,1);});
    // frame fill
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const d=Math.sqrt((x-cx)**2+(y-cy)**2);
      if(d<=fr&&d>mr){ctx.fillStyle=d>fr-1.5?D:d<mr+1.5?D:P;ctx.fillRect(x,y,1,1);}
    }
    // frame highlight arc top-left
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const d=Math.sqrt((x-cx)**2+(y-cy)**2);
      if(d<=fr-0.5&&d>fr-3&&x<cx&&y<cy){ctx.fillStyle='#FFD8EC';ctx.fillRect(x,y,1,1);}
    }
    // mirror face
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const d=Math.sqrt((x-cx)**2+(y-cy)**2);
      if(d<=mr){ctx.fillStyle=d<2?Cr:d<5?'#EAF4FF':'#C8E0F8';ctx.fillRect(x,y,1,1);}
    }
    // mirror sheen top-left
    for(let y=5;y<=11;y++) for(let x=8;x<=13;x++){
      if(Math.sqrt((x-cx)**2+(y-cy)**2)<mr-0.5){ctx.fillStyle='rgba(255,255,255,0.65)';ctx.fillRect(x,y,1,1);}
    }
    // 12 bulbs
    for(let i=0;i<12;i++){
      const a=i*Math.PI/6;
      const bx=Math.round(cx+fr*Math.cos(a)), by=Math.round(cy+fr*Math.sin(a));
      ctx.fillStyle=i%2===0?Y:'#FFF0C0'; ctx.fillRect(bx,by,1,1);
      ctx.fillStyle='#fff'; ctx.fillRect(bx,by,1,1);
      // socket outline
      [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dx,dy])=>{
        const nx=bx+dx,ny=by+dy;
        if(Math.sqrt((nx-cx)**2+(ny-cy)**2)>fr){ctx.fillStyle=R;ctx.fillRect(nx,ny,1,1);}
      });
    }
    // frame + mirror outlines
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const d=Math.sqrt((x-cx)**2+(y-cy)**2);
      if(d>fr-0.5&&d<=fr+0.5){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
      if(d>mr-0.5&&d<=mr+0.5){ctx.fillStyle=R;ctx.fillRect(x,y,1,1);}
    }
    // stand
    px([[13,27,D],[14,27,P],[15,27,P],[16,27,P],[17,27,D],
        [13,28,D],[17,28,D],
        [11,29,D],[12,29,P],[13,29,P],[14,29,P],[15,29,P],[16,29,P],[17,29,P],[18,29,P],[19,29,D],
        [11,29,R],[19,29,R],[11,30,R],[12,30,D],[18,30,D],[19,30,R]]);
    // sparkle accents
    px([[3,8,'#CE93D8'],[27,8,'#A8DAFF'],[3,20,'#A8DAFF'],[27,20,'#CE93D8'],
        [15,1,'#fff'],[15,26,'#fff']]);
  },

sneaker_b(ctx,sz){ DRAWERS.sneaker(ctx,sz); },
};


// ── CANVAS INIT ───────────────────────────────────────
function initCanvas(size) {
  if(size) ST.size = size;
  ['mc','oc','sel-canvas','grid-canvas','outline-canvas'].forEach(id=>{
    const e=document.getElementById(id); if(!e) return;
    e.width=ST.size; e.height=ST.size;
  });
  applyZoom();
  if(!ST.frames.length){
    ST.frames=[new ImageData(ST.size,ST.size)];
    ST.undoStacks=[[new ImageData(ST.size,ST.size)]];
    ST.undoIdx=[0]; ST.currentFrame=0;
  } else drawFrame(ST.currentFrame);
  buildFramesUI(); setupEvents(document.getElementById('mc'));
  if(ST.showGrid) drawGridOverlay();
}

function applyZoom(){
  const w=ST.size*ST.zoom+'px';
  ['mc','oc','sel-canvas','grid-canvas','outline-canvas'].forEach(id=>{const e=document.getElementById(id);if(e){e.style.width=w;e.style.height=w;}});
}

function setZoom(v){ ST.zoom=v; applyZoom(); if(ST.showGrid) drawGridOverlay(); }

function changeSize(sz){
  if(ST.size===sz) return;
  // Confirm if there's existing art
  const hasArt = ST.frames.some(f=>f.data.some(v=>v>0));
  if(hasArt && !confirm(`Switch to ${sz}×${sz}? Current art will be cleared.`)) return;
  ST.size=sz; ST.frames=[]; ST.undoStacks=[]; ST.undoIdx=[];
  ['sz-16','sz-32','sz-64'].forEach(id=>document.getElementById(id).classList.remove('on'));
  document.getElementById('sz-'+sz).classList.add('on');
  // Adjust zoom to fit well
  const wrap=document.getElementById('cvs-wrap');
  const available=Math.min(wrap.clientWidth,wrap.clientHeight)-20;
  ST.zoom=Math.max(3,Math.min(20,Math.floor(available/sz)));
  document.getElementById('zslider').value=ST.zoom;
  initCanvas(sz);
  SFX.click();
}

// ── GRID OVERLAY ──────────────────────────────────────
function toggleGrid(){
  ST.showGrid=!ST.showGrid;
  document.getElementById('grid-btn').classList.toggle('on',ST.showGrid);
  const gc=document.getElementById('grid-canvas');
  if(!ST.showGrid){ gc.getContext('2d').clearRect(0,0,gc.width,gc.height); return; }
  drawGridOverlay();
  SFX.click();
}
function drawGridOverlay(){
  const gc=document.getElementById('grid-canvas'); if(!gc) return;
  const ctx=gc.getContext('2d');
  ctx.clearRect(0,0,gc.width,gc.height);
  ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=0.5/ST.zoom;
  for(let x=0;x<=ST.size;x++){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ST.size);ctx.stroke(); }
  for(let y=0;y<=ST.size;y++){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(ST.size,y);ctx.stroke(); }
  // Bold every 8px
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1/ST.zoom;
  for(let x=0;x<=ST.size;x+=8){ ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ST.size);ctx.stroke(); }
  for(let y=0;y<=ST.size;y+=8){ ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(ST.size,y);ctx.stroke(); }
}

// ── POINTER EVENTS ────────────────────────────────────
function setupEvents(mc){
  mc.onpointerdown=e=>{
    e.preventDefault();
    const p=cpos(e);
    if(ST.tool==='select'){ handleSelectDown(p[0],p[1]); return; }
    ST.isDown=true; ST.lastPt=p; handleDraw(p,true);
  };
  mc.onpointermove=e=>{
    e.preventDefault();
    const p=cpos(e);
    updateCoords(p[0],p[1]);
    if(ST.tool==='select'){ handleSelectMove(p[0],p[1]); return; }
    if(!ST.isDown) return;
    if(ST.lastPt){ plotLine(ST.lastPt[0],ST.lastPt[1],p[0],p[1]); }
    ST.lastPt=p; captureFrame();
  };
  mc.onpointerup=e=>{
    if(ST.tool==='select'){ handleSelectUp(); return; }
    if(ST.isDown) pushHistory(); ST.isDown=false;
  };
  mc.onpointerleave=e=>{ if(ST.isDown&&ST.tool!=='select'){pushHistory();ST.isDown=false;} document.getElementById('coords').textContent=''; };
  mc.onpointercancel=()=>ST.isDown=false;

  // Pinch-to-zoom
  const wrap=document.getElementById('cvs-wrap');
  wrap.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      ST.pinchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    }
  },{passive:true});
  wrap.addEventListener('touchmove',e=>{
    if(e.touches.length===2 && ST.pinchDist!==null){
      e.preventDefault();
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      const ratio=d/ST.pinchDist; ST.pinchDist=d;
      const newZoom=Math.max(2,Math.min(28,Math.round(ST.zoom*ratio)));
      if(newZoom!==ST.zoom){ ST.zoom=newZoom; document.getElementById('zslider').value=newZoom; applyZoom(); if(ST.showGrid) drawGridOverlay(); }
    }
  },{passive:false});
  wrap.addEventListener('touchend',e=>{ if(e.touches.length<2) ST.pinchDist=null; },{passive:true});
}

function cpos(e){
  const r=document.getElementById('mc').getBoundingClientRect();
  return[Math.max(0,Math.min(ST.size-1,Math.floor((e.clientX-r.left)/ST.zoom))),
         Math.max(0,Math.min(ST.size-1,Math.floor((e.clientY-r.top)/ST.zoom)))];
}
function updateCoords(x,y){ document.getElementById('coords').textContent=x+','+y; }

// ── LINE INTERPOLATION (Bresenham) ────────────────────
function plotLine(x0,y0,x1,y1){
  const ctx=document.getElementById('mc').getContext('2d');
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
  const sx=x0<x1?1:-1, sy=y0<y1?1:-1;
  let err=dx-dy, x=x0, y=y0;
  while(true){
    paintPixel(ctx,x,y);
    if(x===x1&&y===y1) break;
    const e2=2*err;
    if(e2>-dy){err-=dy;x+=sx;}
    if(e2<dx){err+=dx;y+=sy;}
  }
}

function paintPixel(ctx,x,y){
  if(isLocked(x,y)) return; // never paint over outline
  const b=ST.tool==='eraser' ? eraserSize : ST.brushSize;
  if(ST.tool==='eraser'){ ctx.clearRect(x,y,b,b); if(ST.mirror) ctx.clearRect(ST.size-x-b,y,b,b); }
  else{ ctx.fillStyle=ST.color; ctx.fillRect(x,y,b,b); if(ST.mirror) ctx.fillRect(ST.size-x-b,y,b,b); }
}

function handleDraw([x,y], isDown){
  const ctx=document.getElementById('mc').getContext('2d');
  const tool = ToolEngine.getActive();
  if(ST.tool==='fill'){
    if(tool) tool.apply(ctx,x,y,ST);
    else floodFill(ctx,x,y,ST.color);
    captureFrame(); pushHistory(); SFX.fill();
    return;
  }
  if(ST.tool==='eyedrop'){
    if(tool) tool.apply(ctx,x,y,ST);
    else { const d=ctx.getImageData(x,y,1,1).data; if(d[3]>0) ST.color=rgbToHex(d[0],d[1],d[2]); setTool('pencil'); }
    SFX.click(); return;
  }
  // Pencil / eraser — use tool engine or fallback
  if(tool && (ST.tool==='pencil'||ST.tool==='eraser')) {
    if(isDown) tool.onStart(ctx,x,y,ST);
    else tool.onMove(ctx,x,y,ST);
  } else {
    paintPixel(ctx,x,y);
  }
  if(ST.tool==='pencil') SFX.draw();
  else if(ST.tool==='eraser') SFX.erase();
  captureFrame();
}

// ── FLOOD FILL ────────────────────────────────────────
function floodFill(ctx,sx,sy,fc){
  if(isLocked(sx,sy)) return; // can't fill outline pixels
  const img=ctx.getImageData(0,0,ST.size,ST.size),d=img.data;
  const i0=(sy*ST.size+sx)*4,tr=d[i0],tg=d[i0+1],tb=d[i0+2],ta=d[i0+3];
  const rgb=hexToRGB(fc); if(!rgb) return;
  if(tr===rgb.r&&tg===rgb.g&&tb===rgb.b&&ta===255) return;
  const stk=[[sx,sy]],vis=new Uint8Array(ST.size*ST.size);
  while(stk.length){
    const[x,y]=stk.pop();
    if(x<0||x>=ST.size||y<0||y>=ST.size) continue;
    const vi=y*ST.size+x; if(vis[vi]) continue; vis[vi]=1;
    if(isLocked(x,y)) continue; // outline is a natural fill boundary
    const ii=vi*4;
    if(d[ii]!==tr||d[ii+1]!==tg||d[ii+2]!==tb||d[ii+3]!==ta) continue;
    d[ii]=rgb.r;d[ii+1]=rgb.g;d[ii+2]=rgb.b;d[ii+3]=255;
    stk.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
  }
  ctx.putImageData(img,0,0);
}

// ── BRUSH SIZE ────────────────────────────────────────
function setBrush(sz){
  ST.brushSize=sz;
  [1,2,4].forEach(s=>document.getElementById('bs-'+s).classList.toggle('sel',s===sz));
  SFX.click();
}

// ── FRAME MANAGEMENT ──────────────────────────────────
function captureFrame(){const ctx=document.getElementById('mc').getContext('2d');ST.frames[ST.currentFrame]=ctx.getImageData(0,0,ST.size,ST.size);updateThumb(ST.currentFrame);}
function drawFrame(i){if(!ST.frames[i])return;const ctx=document.getElementById('mc').getContext('2d');ctx.clearRect(0,0,ST.size,ST.size);ctx.putImageData(ST.frames[i],0,0);drawOnion(i);}
function drawOnion(i){const ctx=document.getElementById('oc').getContext('2d');ctx.clearRect(0,0,ST.size,ST.size);if(ST.onion&&i>0&&ST.frames[i-1])ctx.putImageData(ST.frames[i-1],0,0);}
function pushHistory(){
  const ctx=document.getElementById('mc').getContext('2d'),data=ctx.getImageData(0,0,ST.size,ST.size),f=ST.currentFrame;
  if(!ST.undoStacks[f]){ST.undoStacks[f]=[];ST.undoIdx[f]=0;}
  ST.undoStacks[f].splice(ST.undoIdx[f]+1);
  ST.undoStacks[f].push(data);
  if(ST.undoStacks[f].length>50) ST.undoStacks[f].shift();
  ST.undoIdx[f]=ST.undoStacks[f].length-1;
  // Check coloring completion after every committed stroke
  if(ST.coloringMode) checkCompletion();
}

// ══════════════════════════════════════════════════════════════════════
//  C O L O R I N G   E N G I N E
// ══════════════════════════════════════════════════════════════════════

// Returns true if pixel (x,y) is a locked outline pixel
function isLocked(x,y){
  if(!ST.locked) return false;
  const i = y * ST.size + x;
  return i >= 0 && i < ST.locked.length && ST.locked[i] === 1;
}

// Load a coloring template: switch to 32×32, draw outline to overlay canvas,
// build Uint8Array bitmask, push suggested palette, enter coloring mode
function loadColoringTemplate(id){
  const tmpl = COLORING_TEMPLATES.find(t => t.id === id);
  if(!tmpl) return;

  // Switch to correct canvas size
  if(ST.size !== tmpl.size){
    ST.size = tmpl.size;
    ST.frames=[]; ST.undoStacks=[]; ST.undoIdx=[];
    ['mc','oc','sel-canvas','grid-canvas','outline-canvas'].forEach(id=>{
      const e=document.getElementById(id); if(!e) return;
      e.width=ST.size; e.height=ST.size;
    });
    document.querySelectorAll('.sz-btn').forEach(b=>b.classList.toggle('on',+b.dataset.sz===tmpl.size));
  }

  // Navigate to canvas
  showTab('create');
  setTimeout(()=>{
    initCanvas();
    document.getElementById('pname').textContent = tmpl.name.toLowerCase().replace(/ /g,'-')+'.px';

    // ── Draw outline onto the overlay canvas (always on top) ──
    const oc = document.getElementById('outline-canvas');
    const octx = oc.getContext('2d');
    octx.clearRect(0, 0, tmpl.size, tmpl.size);
    tmpl.drawOutline(octx);

    // ── Build locked bitmask from what was just drawn ──
    const imgData = octx.getImageData(0, 0, tmpl.size, tmpl.size);
    const d = imgData.data;
    ST.locked = new Uint8Array(tmpl.size * tmpl.size);
    for(let i = 0; i < ST.locked.length; i++){
      // A pixel is locked if it has meaningful alpha (was painted as outline)
      ST.locked[i] = d[i*4+3] > 60 ? 1 : 0;
    }

    // ── Count colorable fill regions (flood-fill based) ──
    ST.fillRegionCount = countFillRegions();
    ST.coloringMode = true;
    ST.coloringTemplate = tmpl;

    // ── Push suggested palette into palette bar ──
    applyColoringPalette(tmpl.palette);

    // ── Auto-select fill tool — best for coloring templates ──
    setTool('fill');

    // ── Show coloring mode banner ──
    showColoringBanner(tmpl);

    flash();
    Economy.track('template:load', { id: tmpl.id, type: 'coloring' });
    toast(`🐰 ${tmpl.name} — color it in!`);
  }, 50);
}

// Apply a palette array to the palette bar (prepend to existing)
function applyColoringPalette(colors){
  // Replace first N swatches with the template palette
  const swatches = document.querySelectorAll('#pal-row .sw');
  colors.forEach((col, i) => {
    if(swatches[i]){
      swatches[i].style.background = col;
      swatches[i].dataset.c = col;
      swatches[i].onclick = () => pickColor(col);
    }
  });
  // Set active color to first swatch
  pickColor(colors[0]);
}

// Count distinct colorable (non-locked) connected regions using flood fill
function countFillRegions(){
  const size = ST.size;
  const vis = new Uint8Array(size * size);
  // Mark all locked pixels as visited
  if(ST.locked) for(let i=0;i<ST.locked.length;i++) if(ST.locked[i]) vis[i]=1;
  let count = 0;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const i=y*size+x; if(vis[i]) continue;
    // BFS flood to mark this region
    const stk=[[x,y]]; vis[i]=1; count++;
    while(stk.length){
      const[cx,cy]=stk.pop();
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{
        const nx=cx+dx,ny=cy+dy;
        if(nx<0||nx>=size||ny<0||ny>=size) return;
        const ni=ny*size+nx; if(vis[ni]) return;
        vis[ni]=1; stk.push([nx,ny]);
      });
    }
  }
  return count;
}

// Check if all colorable regions have been filled (no transparent pixels remain)
function checkCompletion(){
  if(!ST.coloringMode || !ST.locked) return;
  const ctx = document.getElementById('mc').getContext('2d');
  const img = ctx.getImageData(0,0,ST.size,ST.size);
  const d = img.data;
  let emptyCount = 0;
  for(let i=0;i<ST.locked.length;i++){
    if(!ST.locked[i] && d[i*4+3] === 0) emptyCount++;
  }
  // Complete when <5% of colorable pixels remain empty
  const total = ST.locked.filter ? ST.locked.reduce((s,v)=>s+(1-v),0) : ST.size*ST.size;
  if(emptyCount < total * 0.05 && emptyCount < 10){
    triggerColoringComplete();
  }
}

// Fired when the user completes a coloring template
function triggerColoringComplete(){
  if(ST._completedThisSession) return; // fire once
  ST._completedThisSession = true;
  confetti();
  const xp = ST.coloringTemplate ? 25 : 15;
  addXP(xp);
  Economy.track('challenge:complete', { xp, id: ST.coloringTemplate?.id });
  EventBus.emit('coloring:complete', { template: ST.coloringTemplate });
  // Celebration overlay
  toast(`🎉 Amazing! ${ST.coloringTemplate?.name || 'Coloring'} complete! +${xp} XP`);
  SFX.levelUp();
  // Flash the canvas gold
  const mc = document.getElementById('mc');
  mc.style.filter = 'brightness(1.3) saturate(1.5)';
  setTimeout(()=>mc.style.filter='',800);
}

// Show a dismissible banner at top of canvas when in coloring mode
function showColoringBanner(tmpl){
  let banner = document.getElementById('coloring-banner');
  if(!banner){
    banner = document.createElement('div');
    banner.id = 'coloring-banner';
    banner.style.cssText = `
      position:absolute;top:0;left:0;right:0;z-index:60;
      background:linear-gradient(90deg,rgba(255,107,171,.9),rgba(255,182,193,.9));
      color:#1E1E1E;font-size:10px;font-weight:800;
      padding:5px 10px;display:flex;align-items:center;justify-content:space-between;
      border-bottom:1px solid rgba(255,107,171,.5);letter-spacing:.04em;
      -webkit-backdrop-filter:blur(4px);
      backdrop-filter:blur(4px);
    `;
    document.getElementById('cvs-wrap').appendChild(banner);
  }
  banner.innerHTML = `
    <span>🐰 Color-In Mode · ${tmpl.name}</span>
    <button onclick="clearColoringMode()" style="background:none;border:none;color:#1E1E1E;font-size:12px;font-weight:900;cursor:pointer;padding:0 4px">✕</button>
  `;
  banner.style.display = 'flex';
}

// Exit coloring mode and clear all locked state
function clearColoringMode(){
  ST.locked = null;
  ST.coloringMode = false;
  ST.coloringTemplate = null;
  ST.fillRegionCount = 0;
  ST._completedThisSession = false;
  // Clear outline overlay
  const oc = document.getElementById('outline-canvas');
  if(oc) oc.getContext('2d').clearRect(0,0,oc.width,oc.height);
  // Hide banner
  const banner = document.getElementById('coloring-banner');
  if(banner) banner.style.display = 'none';
  // Restore default palette
  buildPalRow();
  toast('✏️ Free draw mode');
}

// Build the Studio coloring templates grid
function buildColoringGrid(){
  const el = document.getElementById('tmpl-coloring'); if(!el) return; el.innerHTML='';
  COLORING_TEMPLATES.forEach(t=>{
    const card = makeTmplCard({
      badgeTag: t.tag,
      name: t.name,
      coloringStyle: true,
      previewFn: (ctx, sz) => {
        // Draw outline preview in indigo instead of black for dark bg
        const tmp = document.createElement('canvas');
        tmp.width = t.size; tmp.height = t.size;
        const tc = tmp.getContext('2d');
        t.drawOutline(tc);
        // Recolor black pixels to indigo for dark background readability
        const img = tc.getImageData(0,0,t.size,t.size);
        for(let i=0;i<img.data.length;i+=4){
          if(img.data[i+3]>60){
            img.data[i]=220;img.data[i+1]=216;img.data[i+2]=255;img.data[i+3]=255;
          }
        }
        tc.putImageData(img,0,0);
        ctx.imageSmoothingEnabled=false;
        const scale=sz/t.size;
        ctx.drawImage(tmp,0,0,sz,sz);
      },
      onclick: ()=>loadColoringTemplate(t.id),
    });
    el.appendChild(card);
  });
}
function undo(){const f=ST.currentFrame;if(!ST.undoStacks[f]||ST.undoIdx[f]<=0)return;ST.undoIdx[f]--;document.getElementById('mc').getContext('2d').putImageData(ST.undoStacks[f][ST.undoIdx[f]],0,0);captureFrame();SFX.undo();}
function redo(){const f=ST.currentFrame;if(!ST.undoStacks[f]||ST.undoIdx[f]>=ST.undoStacks[f].length-1)return;ST.undoIdx[f]++;document.getElementById('mc').getContext('2d').putImageData(ST.undoStacks[f][ST.undoIdx[f]],0,0);captureFrame();}
function buildFramesUI(){
  const list=document.getElementById('frames-list'); list.innerHTML='';
  ST.frames.forEach((_,i)=>{
    const wrap=document.createElement('div');
    wrap.className='fth-wrap'+(i===ST.currentFrame?' sel-wrap':'');
    const c=document.createElement('canvas');
    c.className='fth'+(i===ST.currentFrame?' sel':'');
    c.id='ft-'+i; c.width=ST.size; c.height=ST.size; c.onclick=()=>switchFrame(i);
    let pt;
    c.oncontextmenu=e=>{e.preventDefault();if(ST.frames.length>1)deleteFrame(i);};
    c.onpointerdown=e=>{if(e.button!==0)return;pt=setTimeout(()=>{if(ST.frames.length>1)deleteFrame(i);},600);};
    c.onpointerup=()=>clearTimeout(pt); c.onpointerleave=()=>clearTimeout(pt);
    wrap.appendChild(c);
    const num=document.createElement('div');
    num.className='fth-num'; num.textContent=i+1;
    wrap.appendChild(num);
    if(ST.frames.length>1){
      const del=document.createElement('button');
      del.className='fth-del'; del.title='Delete frame'; del.innerHTML='✕';
      del.onclick=(e)=>{e.stopPropagation();deleteFrame(i);};
      wrap.appendChild(del);
    }
    list.appendChild(wrap); updateThumb(i);
  });
  const sel=document.getElementById('ft-'+ST.currentFrame);
  if(sel) sel.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}
function startBlank(size){
  if(ST.coloringMode) clearColoringMode();
  ST.size=size; ST.frames=[]; ST.undoStacks=[]; ST.undoIdx=[];
  showTab('create');
  setTimeout(()=>{
    initCanvas();
    document.getElementById('pname').textContent='untitled.px';
    captureFrame(); pushHistory();
    document.querySelectorAll('.sz-btn').forEach(b=>b.classList.toggle('on',+b.dataset.sz===size));
    flash(); toast('✦ Blank '+size+'×'+size+' canvas ready!');
  },50);
}
function updateThumb(i){const t=document.getElementById('ft-'+i);if(!t||!ST.frames[i])return;const ctx=t.getContext('2d');ctx.clearRect(0,0,ST.size,ST.size);ctx.putImageData(ST.frames[i],0,0);}
function addFrame(){ST.frames.push(new ImageData(ST.size,ST.size));ST.undoStacks.push([new ImageData(ST.size,ST.size)]);ST.undoIdx.push(0);switchFrame(ST.frames.length-1);buildFramesUI();Economy.track('frame:add');addXP(3);SFX.click();}
function dupFrame(){captureFrame();const src=ST.frames[ST.currentFrame];const copy=cloneImageData(src);const at=ST.currentFrame+1;ST.frames.splice(at,0,copy);ST.undoStacks.splice(at,0,[cloneImageData(copy)]);ST.undoIdx.splice(at,0,0);buildFramesUI();switchFrame(at);toast('⧉ Frame duplicated!');SFX.click();}
function deleteFrame(i){if(ST.frames.length<=1){toast('Need at least 1 frame');return;}ST.frames.splice(i,1);ST.undoStacks.splice(i,1);ST.undoIdx.splice(i,1);const ni=Math.min(i,ST.frames.length-1);ST.currentFrame=ni;buildFramesUI();drawFrame(ni);toast('Frame deleted');}
function switchFrame(i){
  captureFrame();ST.currentFrame=i;
  document.querySelectorAll('.fth').forEach((t,idx)=>t.classList.toggle('sel',idx===i));
  document.querySelectorAll('.fth-wrap').forEach((w,idx)=>w.classList.toggle('sel-wrap',idx===i));
  drawFrame(i);
  const sel=document.getElementById('ft-'+i);
  if(sel) sel.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}
function adjFPS(d){ST.fps=Math.max(1,Math.min(24,ST.fps+d));document.getElementById('fps-v').textContent=ST.fps;if(ST.playing){stopPlay();startPlay();}}
function togglePlay(){ST.playing?stopPlay():startPlay();}
function startPlay(){if(ST.frames.length<2){toast('Add more frames first!');return;}ST.playing=true;document.getElementById('play-btn').textContent='⏸';ST.playTimer=setInterval(()=>{ST.playIdx=(ST.playIdx+1)%ST.frames.length;if(ST.frames[ST.playIdx])document.getElementById('mc').getContext('2d').putImageData(ST.frames[ST.playIdx],0,0);},1000/ST.fps);}
function stopPlay(){ST.playing=false;clearInterval(ST.playTimer);document.getElementById('play-btn').textContent='▶';drawFrame(ST.currentFrame);}

// ── TOOL CONTROLS ─────────────────────────────────────
// ── ERASER SIZE ────────────────────────────────────────
let eraserSize = 1;
function setEraserSize(n){
  eraserSize = n;
  document.querySelectorAll('.esz').forEach(b=>b.classList.toggle('on', +b.dataset.es===n));
}
function setTool(t){
  if(t==='select'&&!requireUnlock('teen-mode')) return;
  if(ST.tool==='select'&&t!=='select') clearSel();
  ST.tool=t;
  Store.dispatch({ type:'tool:set', tool:t });
  document.querySelectorAll('.rb[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  const esizes=document.getElementById('eraser-sizes');
  if(esizes) esizes.style.display=(t==='eraser')?'flex':'none';
  SFX.click();
}
function toggleMirror(){if(!requireUnlock('mirror-draw')) return;ST.mirror=!ST.mirror;Store.dispatch({type:'tool:toggleMirror'});document.getElementById('t-mirror').classList.toggle('tog',ST.mirror);toast(ST.mirror?'Mirror ON ⇌':'Mirror OFF');}
function toggleOnion(){ST.onion=!ST.onion;Store.dispatch({type:'tool:toggleOnion'});document.getElementById('t-onion').classList.toggle('tog',ST.onion);drawOnion(ST.currentFrame);}
function clearCanvas(){document.getElementById('mc').getContext('2d').clearRect(0,0,ST.size,ST.size);captureFrame();pushHistory();SFX.reset();}
function flash(){const mc=document.getElementById('mc');mc.classList.add('effect-flash');setTimeout(()=>mc.classList.remove('effect-flash'),600);}
function toggleFXMenu(){document.getElementById('fx-menu').classList.toggle('open');document.getElementById('anim-menu').classList.remove('open');}
function closeFXMenu(){document.getElementById('fx-menu').classList.remove('open');}
function toggleAnimMenu(){if(!requireUnlock('teen-mode')) return;document.getElementById('anim-menu').classList.toggle('open');document.getElementById('fx-menu').classList.remove('open');}
function closeAnimMenu(){document.getElementById('anim-menu').classList.remove('open');}
document.addEventListener('click',e=>{if(!e.target.closest('#fx-menu')&&!e.target.closest('#anim-menu')&&!e.target.closest('#rail')&&!e.target.closest('.magic-btn')){closeFXMenu();closeAnimMenu();}});

// ── RENAME PROJECT ────────────────────────────────────
function renameDone(el){
  const v=el.textContent.trim(); if(!v){el.textContent='untitled.px';return;}
  if(!v.endsWith('.px')) el.textContent=v+'.px';
  toast('✦ Renamed!'); SFX.click();
}

// ── SMART EFFECTS ─────────────────────────────────────
function runFX(type){
  const fxToUnlock={glow:'glow-brush',outline:'auto-outline',remix:'fx-remix'};
  const need=fxToUnlock[type];
  if(need&&!requireUnlock(need)) return;
  if(!ST.frames.length) return;
  captureFrame();
  const mc=document.getElementById('mc'), sz=ST.size;
  // Determine which frames to process: glow/sparkle → all frames; others → current only
  const allFrames = (type==='glow'||type==='sparkle');
  const frameIndices = allFrames ? ST.frames.map((_,i)=>i) : [ST.currentFrame];

  frameIndices.forEach(fi=>{
    const img = cloneImageData(ST.frames[fi]);
    const d = img.data;

    if(type==='glow'){
      const gc=hexToRGB(ST.color)||{r:108,g:99,b:255};
      for(let y=1;y<sz-1;y++) for(let x=1;x<sz-1;x++){
        const i=(y*sz+x)*4; if(d[i+3]>10) continue;
        let has=false;
        for(let dy=-1;dy<=1&&!has;dy++) for(let dx=-1;dx<=1&&!has;dx++){const ni=((y+dy)*sz+(x+dx))*4;if(ni>=0&&ni<d.length&&d[ni+3]>10)has=true;}
        if(has){d[i]=gc.r;d[i+1]=gc.g;d[i+2]=gc.b;d[i+3]=140;}
      }
    } else if(type==='sparkle'){
      const filled=[];
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++) if(d[(y*sz+x)*4+3]>10) filled.push([x,y]);
      const n=Math.max(6,Math.floor(filled.length*.08));
      for(let i=0;i<n;i++){
        const[bx,by]=filled[Math.floor(Math.random()*filled.length)];
        const offs=[[0,-2],[-2,0],[2,0],[0,2],[-1,-1],[1,-1],[-1,1],[1,1]];
        const[ox,oy]=offs[Math.floor(Math.random()*offs.length)];
        const sx=bx+ox,sy=by+oy;
        if(sx>=0&&sx<sz&&sy>=0&&sy<sz){const si=(sy*sz+sx)*4;d[si]=255;d[si+1]=255;d[si+2]=255;d[si+3]=220;}
      }
    } else if(type==='outline'){
      const out=new ImageData(sz,sz); out.data.set(d);
      for(let y=1;y<sz-1;y++) for(let x=1;x<sz-1;x++){
        const i=(y*sz+x)*4; if(out.data[i+3]>10) continue;
        let has=false;
        for(let dy=-1;dy<=1&&!has;dy++) for(let dx=-1;dx<=1&&!has;dx++){if(dx===0&&dy===0)continue;const ni=((y+dy)*sz+(x+dx))*4;if(ni>=0&&ni<d.length&&d[ni+3]>10)has=true;}
        if(has){out.data[i]=20;out.data[i+1]=20;out.data[i+2]=20;out.data[i+3]=255;}
      }
      ST.frames[fi]=out;
      ST.undoStacks[fi]=[cloneImageData(out)];ST.undoIdx[fi]=0;
      return; // outline already stored
    } else if(type==='remix'){
      const pal=TREND_PALETTES[Math.floor(Math.random()*TREND_PALETTES.length)];
      const uniq=[];
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){const i=(y*sz+x)*4;if(d[i+3]<10)continue;const h=rgbToHex(d[i],d[i+1],d[i+2]);if(!uniq.includes(h))uniq.push(h);}
      const map={};uniq.forEach((c,i)=>{map[c]=pal.cols[i%pal.cols.length];});
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){const i=(y*sz+x)*4;if(d[i+3]<10)continue;const nc=hexToRGB(map[rgbToHex(d[i],d[i+1],d[i+2])]);if(nc){d[i]=nc.r;d[i+1]=nc.g;d[i+2]=nc.b;}}
      // Remix uses same random palette for all frames (called once), so break after current
      ST.frames[fi]=img; ST.undoStacks[fi]=[cloneImageData(img)]; ST.undoIdx[fi]=0;
      if(fi===ST.currentFrame) toast(`🎲 Remixed to "${pal.name}"!`);
      return;
    }

    ST.frames[fi]=img;
    ST.undoStacks[fi]=[cloneImageData(img)];ST.undoIdx[fi]=0;
  });

  // Redraw current frame to canvas
  const ctx=mc.getContext('2d');
  ctx.putImageData(ST.frames[ST.currentFrame],0,0);
  buildFramesUI();
  flash(); addXP(5); Economy.track("fx:apply");
  if(type==='glow') toast(`✨ Glow added to ${frameIndices.length} frame${frameIndices.length>1?'s':''}!`);
  else if(type==='sparkle') toast(`⭐ Sparkles on ${frameIndices.length} frame${frameIndices.length>1?'s':''}!`);
  else if(type==='outline') toast('◻️ Outline added!');
}

// ── ANIMATION PRESETS ─────────────────────────────────
function animPreset(type){
  if(!requireUnlock('teen-mode')) return;
  if(!ST.frames.length) return;
  captureFrame();
  const base=ST.frames[ST.currentFrame], sz=ST.size;
  if(type==='bounce'){
    const shifts=[{sy:-3,sc:1},{sy:-5,sc:.85},{sy:-3,sc:1},{sy:0,sc:1.1}];
    loadAnimFrames(shifts.map(({sy,sc})=>{
      const o=new ImageData(sz,sz);
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
        const sy2=Math.round((y-sz/2-sy)/sc+sz/2);
        if(sy2>=0&&sy2<sz){const si=(sy2*sz+x)*4,di=(y*sz+x)*4;o.data[di]=base.data[si];o.data[di+1]=base.data[si+1];o.data[di+2]=base.data[si+2];o.data[di+3]=base.data[si+3];}
      }
      return o;
    }));
  } else if(type==='float'){
    loadAnimFrames(Array.from({length:6},(_,f)=>{
      const shift=Math.round(Math.sin(f*Math.PI*2/6)*4);
      const o=new ImageData(sz,sz);
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
        const sy=y-shift;
        if(sy>=0&&sy<sz){const si=(sy*sz+x)*4,di=(y*sz+x)*4;o.data[di]=base.data[si];o.data[di+1]=base.data[si+1];o.data[di+2]=base.data[si+2];o.data[di+3]=base.data[si+3];}
      }
      return o;
    }));
  } else if(type==='blink'){
    const cx=sz/2,cy=sz/2,eyes=new Set();
    for(let y=Math.floor(cy)-6;y<Math.floor(cy)+2;y++) for(let x=0;x<sz;x++){
      const i=(y*sz+x)*4,lum=base.data[i]*.3+base.data[i+1]*.59+base.data[i+2]*.11;
      if(base.data[i+3]>10&&lum<60) eyes.add(y*sz+x);
    }
    const open=cloneImageData(base),closed=cloneImageData(base);
    eyes.forEach(idx=>{const i=idx*4;closed.data[i]=200;closed.data[i+1]=200;closed.data[i+2]=200;closed.data[i+3]=255;});
    loadAnimFrames([open,open,open,closed,open,open]);
  } else if(type==='shake'){
    loadAnimFrames([0,3,-3,2,-2,0].map(dx=>{
      const o=new ImageData(sz,sz);
      for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
        const sx=x-dx;
        if(sx>=0&&sx<sz){const si=(y*sz+sx)*4,di=(y*sz+x)*4;o.data[di]=base.data[si];o.data[di+1]=base.data[si+1];o.data[di+2]=base.data[si+2];o.data[di+3]=base.data[si+3];}
      }
      return o;
    }));
  }
  addXP(10);
}
function loadAnimFrames(frames){
  ST.frames=frames; ST.undoStacks=frames.map(f=>[cloneImageData(f)]); ST.undoIdx=frames.map(()=>0);
  ST.currentFrame=0; buildFramesUI(); drawFrame(0); toast('▶ Tap Play to preview!');
}

// ── SELECTION TOOL ────────────────────────────────────
const SEL={active:false,x0:0,y0:0,x1:0,y1:0,dragging:false,moving:false,moveStartX:0,moveStartY:0,floatData:null};
function selRect(){const x=Math.min(SEL.x0,SEL.x1),y=Math.min(SEL.y0,SEL.y1),w=Math.abs(SEL.x1-SEL.x0)+1,h=Math.abs(SEL.y1-SEL.y0)+1;return{x,y,w,h};}
function drawSelOverlay(){
  const sc=document.getElementById('sel-canvas'); if(!sc) return;
  const ctx=sc.getContext('2d'); ctx.clearRect(0,0,sc.width,sc.height); if(!SEL.active) return;
  const{x,y,w,h}=selRect();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1/ST.zoom; ctx.setLineDash([2/ST.zoom,2/ST.zoom]); ctx.strokeRect(x-.5,y-.5,w+1,h+1);
  ctx.strokeStyle='rgba(108,99,255,.9)'; ctx.lineDashOffset=2/ST.zoom; ctx.strokeRect(x-.5,y-.5,w+1,h+1);
  ctx.setLineDash([]);
}
function showNudgePanel(v){const p=document.getElementById('nudge-panel');if(p)p.classList.toggle('show',v);}
function clearSel(){if(SEL.floatData)stampFloat();SEL.active=false;SEL.floatData=null;drawSelOverlay();showNudgePanel(false);}
function liftSelection(){if(SEL.floatData)return;const{x,y,w,h}=selRect();const ctx=document.getElementById('mc').getContext('2d');SEL.floatData=ctx.getImageData(x,y,w,h);ctx.clearRect(x,y,w,h);captureFrame();}
function stampFloat(){if(!SEL.floatData)return;const{x,y}=selRect();const ctx=document.getElementById('mc').getContext('2d');ctx.putImageData(SEL.floatData,x,y);SEL.floatData=null;captureFrame();pushHistory();}
function nudgeSel(dx,dy){
  if(!SEL.active) return;
  liftSelection();
  SEL.x0+=dx;SEL.x1+=dx;SEL.y0+=dy;SEL.y1+=dy;
  const{w,h}=selRect();
  SEL.x0=Math.max(0,Math.min(ST.size-w,SEL.x0));SEL.x1=SEL.x0+w-1;
  SEL.y0=Math.max(0,Math.min(ST.size-h,SEL.y0));SEL.y1=SEL.y0+h-1;
  if(SEL.floatData){
    const frame=ST.frames[ST.currentFrame];
    const tmp=document.createElement('canvas');tmp.width=ST.size;tmp.height=ST.size;
    const tc=tmp.getContext('2d');tc.putImageData(frame,0,0);tc.putImageData(SEL.floatData,SEL.x0,SEL.y0);
    document.getElementById('mc').getContext('2d').putImageData(tc.getContext('2d').getImageData(0,0,ST.size,ST.size),0,0);
  }
  drawSelOverlay();
}
function dupSelToNextFrame(){
  if(!SEL.active) return;
  if(SEL.floatData) stampFloat(); else captureFrame();
  const{x,y,w,h}=selRect();
  const ctx=document.getElementById('mc').getContext('2d');
  const selData=ctx.getImageData(x,y,w,h);
  const baseCopy=cloneImageData(ST.frames[ST.currentFrame]);
  const at=ST.currentFrame+1;
  ST.frames.splice(at,0,baseCopy);ST.undoStacks.splice(at,0,[cloneImageData(baseCopy)]);ST.undoIdx.splice(at,0,0);
  buildFramesUI();switchFrame(at);
  SEL.active=true;SEL.floatData=selData;
  ctx.clearRect(x,y,w,h);captureFrame();
  drawSelOverlay();showNudgePanel(true);
  toast('⧉ Duped to frame '+(at+1)+' — nudge it!');
}
function handleSelectDown(x,y){
  if(SEL.active){
    const{x:sx,y:sy,w,h}=selRect();
    if(x>=sx&&x<sx+w&&y>=sy&&y<sy+h){SEL.moving=true;SEL.moveStartX=x;SEL.moveStartY=y;liftSelection();return;}
    stampFloat();SEL.active=false;showNudgePanel(false);
  }
  SEL.dragging=true;SEL.moving=false;SEL.x0=x;SEL.y0=y;SEL.x1=x;SEL.y1=y;SEL.active=true;drawSelOverlay();
}
function handleSelectMove(x,y){
  if(SEL.moving&&SEL.floatData){
    const dx=x-SEL.moveStartX,dy=y-SEL.moveStartY;SEL.moveStartX=x;SEL.moveStartY=y;
    const{w,h}=selRect();
    SEL.x0=Math.max(0,Math.min(ST.size-w,SEL.x0+dx));SEL.x1=SEL.x0+w-1;
    SEL.y0=Math.max(0,Math.min(ST.size-h,SEL.y0+dy));SEL.y1=SEL.y0+h-1;
    const base=ST.frames[ST.currentFrame];
    const tmp=document.createElement('canvas');tmp.width=ST.size;tmp.height=ST.size;
    const tc=tmp.getContext('2d');tc.putImageData(base,0,0);tc.putImageData(SEL.floatData,SEL.x0,SEL.y0);
    document.getElementById('mc').getContext('2d').putImageData(tc.getContext('2d').getImageData(0,0,ST.size,ST.size),0,0);
    drawSelOverlay();return;
  }
  if(SEL.dragging){SEL.x1=x;SEL.y1=y;drawSelOverlay();}
}
function handleSelectUp(){
  if(SEL.moving){SEL.moving=false;stampFloat();drawSelOverlay();return;}
  if(SEL.dragging){
    SEL.dragging=false;
    const{w,h}=selRect();
    if(w<1||h<1){SEL.active=false;showNudgePanel(false);drawSelOverlay();return;}
    SEL.active=true;showNudgePanel(true);drawSelOverlay();
    toast('⬚ Selection ready — nudge or ⧉ dup!');
  }
}

// ── PALETTE ───────────────────────────────────────────
function buildPalRow(){
  const row=document.getElementById('pal-row');row.innerHTML='';
  const remix=document.createElement('button');remix.className='sw-remix';remix.title='Color Remix';remix.textContent='🎲';remix.onclick=()=>runFX('remix');row.appendChild(remix);
  PALETTE.forEach((c,i)=>{const sw=document.createElement('div');sw.className='sw'+(i===0?' sel':'');sw.style.background=c;sw.onclick=()=>pickSwatch(i,c);row.appendChild(sw);});
  const add=document.createElement('button');add.className='sw-add';add.innerHTML='+';add.onclick=openColorModal;row.appendChild(add);
  syncCanvasUnlockUI();
}
function pickSwatch(i,c){ST.color=c;ST.palIdx=i;document.querySelectorAll('.sw').forEach((s,idx)=>s.classList.toggle('sel',idx===i));}
let RECENT_COLORS = [];
function buildCMRow(id, colors){
  const el=document.getElementById(id); if(!el)return; el.innerHTML='';
  colors.forEach(c=>{
    const sw=document.createElement('div'); sw.className='cm-sw';
    sw.style.background=c; sw.title=c;
    sw.onclick=()=>quickC(c);
    el.appendChild(sw);
  });
}
function buildPPGrid(){
  const el=document.getElementById('pp-grid');el.innerHTML='';
  TREND_PALETTES.forEach(p=>{
    const div=document.createElement('div');
    div.innerHTML=`<div class="pp-name">${p.name}</div><div class="pp-swatches">${p.cols.map(c=>`<div class="pp-sw" style="background:${c}" title="${c}" onclick="quickC('${c}')"></div>`).join('')}</div>`;
    el.appendChild(div);
  });
}
function openColorModal(){
  document.getElementById('color-modal').style.display='flex';
  document.getElementById('color-native').value=ST.color;
  document.getElementById('hex-in').value=ST.color;
  // Recent
  buildCMRow('cm-recent', RECENT_COLORS.length ? RECENT_COLORS : ['#6C63FF','#FF6B6B','#FFD166','#3DDC97','#CE93D8']);
  // B&W ramp
  buildCMRow('cm-bw',['#000000','#111118','#222222','#333333','#444444','#555555','#666666','#777777','#888888','#999999','#AAAAAA','#BBBBBB','#CCCCCC','#DDDDDD','#EEEEEE','#FFFFFF']);
  // Spectrum (hue wheel slices)
  const spec=[];
  for(let h=0;h<360;h+=18) spec.push(`hsl(${h},90%,55%)`);
  buildCMRow('cm-spectrum', spec);
  // Pastels
  const pastels=[];
  for(let h=0;h<360;h+=24) pastels.push(`hsl(${h},70%,82%)`);
  buildCMRow('cm-pastels', pastels);
  // Neons
  buildCMRow('cm-neons',['#FF0099','#FF6600','#FFFF00','#00FF41','#00FFFF','#0066FF','#9900FF','#FF00FF','#FF3366','#FF9500','#CCFF00','#00FF99','#00CCFF','#3300FF','#CC00FF','#FF0055']);
  buildPPGrid();
}
function closeColorModal(){document.getElementById('color-modal').style.display='none';}
function nativeCC(v){ST.color=v;document.getElementById('hex-in').value=v;trackRecent(v);}
function hexCC(v){if(/^#[0-9a-fA-F]{6}$/.test(v)){ST.color=v;document.getElementById('color-native').value=v;trackRecent(v);}}
function quickC(c){ST.color=c;document.getElementById('color-native').value=c;document.getElementById('hex-in').value=c;trackRecent(c);}
function trackRecent(c){RECENT_COLORS=RECENT_COLORS.filter(x=>x!==c);RECENT_COLORS.unshift(c);if(RECENT_COLORS.length>16)RECENT_COLORS=RECENT_COLORS.slice(0,16);buildCMRow('cm-recent',RECENT_COLORS);}
function addColorToPal(){PALETTE.push(ST.color);buildPalRow();pickSwatch(PALETTE.length-1,ST.color);closeColorModal();toast('Color added ✦');}

// ── EXPORT: PNG ───────────────────────────────────────
function openExportModal(){
  document.getElementById('export-modal').style.display='flex';
  document.querySelectorAll('#export-options-grid .exp-card').forEach(card=>{
    // Ensure no stale inline style hides an export option.
    card.style.display='flex';
  });
  const sz = ST.size || 16;
  const scale = 8;
  const dim = sz * scale;
  const fc = (ST.frames || []).length;
  const fps = ST.fps || 8;
  const infoEl = document.getElementById('exp-info');
  if(infoEl) infoEl.textContent = `Current frame · ${sz}×${sz} px`;
  const pngDim = document.getElementById('exp-png-dim');
  if(pngDim) pngDim.textContent = `${dim}×${dim} px (8× scaled)`;
  const jpgDim = document.getElementById('exp-jpg-dim');
  if(jpgDim) jpgDim.textContent = `${dim}×${dim} px (8× scaled, white bg)`;
  const gifDim = document.getElementById('exp-gif-dim');
  if(gifDim) gifDim.textContent = `${dim}×${dim} px · ${fc} frame${fc!==1?'s':''} · ${fps} FPS`;
}
function closeExportModal(){document.getElementById('export-modal').style.display='none';}

function exportCanvas(){
  captureFrame();const scale=8;const cvs=document.createElement('canvas');
  cvs.width=ST.size*scale;cvs.height=ST.size*scale;
  const ctx=cvs.getContext('2d');ctx.imageSmoothingEnabled=false;
  if(ST.frames[ST.currentFrame]){
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp=>{
      ctx.drawImage(bmp,0,0,ST.size*scale,ST.size*scale);
      const a=document.createElement('a');a.href=cvs.toDataURL('image/png');a.download='pixel-creator.png';a.click();
      SFX.share();
      toast('PNG exported! 🎉');addXP(5);Economy.track('project:export',{format:'png'});
    });
  }
}
function exportJPEG(){
  captureFrame();const scale=8;const cvs=document.createElement('canvas');
  cvs.width=ST.size*scale;cvs.height=ST.size*scale;
  const ctx=cvs.getContext('2d');ctx.imageSmoothingEnabled=false;
  // JPEG needs opaque bg — fill white first
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,cvs.width,cvs.height);
  if(ST.frames[ST.currentFrame]){
    createImageBitmap(ST.frames[ST.currentFrame]).then(bmp=>{
      ctx.drawImage(bmp,0,0,ST.size*scale,ST.size*scale);
      const a=document.createElement('a');a.href=cvs.toDataURL('image/jpeg',0.95);a.download='pixel-creator.jpg';a.click();
      SFX.share();
      toast('JPEG exported! 🖼');addXP(5);Economy.track('project:export',{format:'jpeg'});
    });
  }
}

// ── EXPORT: ANIMATED GIF ──────────────────────────────
// Pure JS GIF encoder — no libraries, no network
function downloadBlobFile(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  // Safari/iOS may ignore download attr for blob URLs; fallback to opening the blob.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);
  try {
    if (!('download' in HTMLAnchorElement.prototype) || isIOS || isSafari) {
      window.open(url, '_blank');
    } else {
      a.click();
    }
  } finally {
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

function exportGIF(){
  captureFrame();
  if(!ST.frames.length){ toast('Add at least 1 frame to export a GIF!'); return; }
  const prog=document.getElementById('gif-progress');
  if(prog) prog.classList.add('show');
  setTimeout(()=>_buildGIF(),50);
}

function _buildGIF(){
  const sz=ST.size;
  const frames=ST.frames;
  const fps=Math.max(1, ST.fps||8);
  const delay=Math.max(2, Math.round(100/fps));
  const prog=document.getElementById('gif-progress');
  const bar=document.getElementById('gif-bar');
  const pct=document.getElementById('gif-pct');

  if(!sz || !frames || !frames.length){
    if(prog) prog.classList.remove('show');
    toast('GIF export failed: no frame data.');
    return;
  }

  // ── Minimal GIF89a encoder ──
  // Reference: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
  const bytes=[];
  const wr=(v)=>bytes.push(v&0xFF);
  const wr16=(v)=>{bytes.push(v&0xFF);bytes.push((v>>8)&0xFF);};
  const wrStr=(s)=>{for(let i=0;i<s.length;i++) bytes.push(s.charCodeAt(i)&0xFF);};

  // Build a fixed 256-color palette from all frames
  const allColors=new Set();
  frames.forEach(f=>{
    for(let i=0;i<f.data.length;i+=4){
      if(f.data[i+3]>127){
        const r=f.data[i]>>4<<4, g=f.data[i+1]>>4<<4, b=f.data[i+2]>>4<<4; // quantize
        allColors.add((r<<16)|(g<<8)|b);
      }
    }
  });
  const TRANS=0; // palette index 0 = transparent
  let palArr=[0]; // index 0 = transparent black
  allColors.forEach(v=>{if(palArr.length<256)palArr.push(v);});
  while(palArr.length<256) palArr.push(0);

  function closestIdx(r,g,b,a){
    if(a<128) return TRANS;
    let best=1,bestD=1e9;
    for(let i=1;i<palArr.length;i++){
      const pr=(palArr[i]>>16)&0xFF,pg=(palArr[i]>>8)&0xFF,pb=palArr[i]&0xFF;
      const d=(r-pr)**2+(g-pg)**2+(b-pb)**2;
      if(d<bestD){bestD=d;best=i;}
    }
    return best;
  }

  // Header
  wrStr('GIF89a');
  wr16(sz); wr16(sz); // logical width, height
  wr(0xF7); // packed: global color table flag=1, color resolution=8, sort=0, size=256 (2^(7+1))
  wr(TRANS); // bg color index
  wr(0);     // pixel aspect ratio

  // Global color table (256 × 3 bytes)
  for(let i=0;i<256;i++){
    wr((palArr[i]>>16)&0xFF);
    wr((palArr[i]>>8)&0xFF);
    wr(palArr[i]&0xFF);
  }

  // Netscape looping extension
  wrStr('!'); wr(0xFF); wr(11);
  wrStr('NETSCAPE2.0'); wr(3); wr(1); wr16(0); wr(0);

  function addFrame(imgData, frameIdx){
    // Graphic control extension (transparency + delay)
    wr(0x21); wr(0xF9); wr(4);
    wr(0x05); // disposal=1, user input=0, transparent flag=1
    wr16(delay);
    wr(TRANS); wr(0);

    // Image descriptor
    wr(0x2C);
    wr16(0);wr16(0);wr16(sz);wr16(sz);
    wr(0); // no local color table, not interlaced

    // Build index stream
    const indices=new Uint8Array(sz*sz);
    for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){
      const i=(y*sz+x)*4;
      indices[y*sz+x]=closestIdx(imgData.data[i],imgData.data[i+1],imgData.data[i+2],imgData.data[i+3]);
    }

    // LZW compress
    const lzw=gifLZW(indices,8);
    wr(8); // LZW minimum code size
    // Write in 255-byte sub-blocks
    let off=0;
    while(off<lzw.length){
      const chunk=Math.min(255,lzw.length-off);
      wr(chunk);
      for(let i=0;i<chunk;i++) wr(lzw[off+i]);
      off+=chunk;
    }
    wr(0); // block terminator

    if(bar) bar.style.width=Math.round((frameIdx+1)/frames.length*100)+'%';
    if(pct) pct.textContent=Math.round((frameIdx+1)/frames.length*100)+'%';
  }

  // Process frames async so UI updates
  let fi=0;
  function next(){
    if(fi>=frames.length){
      wr(0x3B); // GIF trailer
      const blob=new Blob([new Uint8Array(bytes)],{type:'image/gif'});
      downloadBlobFile(blob,'pixel-creator.gif');
      SFX.share();
      if(prog) prog.classList.remove('show');
      toast('🎞 GIF exported!');addXP(15);confetti();Economy.track('project:export',{format:'gif'});
      return;
    }
    try {
      addFrame(frames[fi],fi);
    } catch(e) {
      if(prog) prog.classList.remove('show');
      console.warn('[GIF export]', e);
      toast('GIF export failed. Try fewer frames or a smaller canvas size.');
      return;
    }
    fi++;
    setTimeout(next,0);
  }
  next();
}

// LZW compressor for GIF
function gifLZW(pixels, minCode){
  const clearCode=1<<minCode, eoi=clearCode+1;
  let codeSize=minCode+1, nextCode=eoi+1;
  const table=new Map();
  const out=[];
  let buf=0,bufBits=0;
  function emit(code){
    buf|=code<<bufBits; bufBits+=codeSize;
    while(bufBits>=8){out.push(buf&0xFF);buf>>=8;bufBits-=8;}
  }
  function resetTable(){table.clear();for(let i=0;i<clearCode;i++)table.set(String(i),i);nextCode=eoi+1;codeSize=minCode+1;}
  resetTable();emit(clearCode);
  let prefix=String(pixels[0]);
  for(let i=1;i<pixels.length;i++){
    const cur=prefix+','+pixels[i];
    if(table.has(cur)){prefix=cur;}
    else{
      emit(table.get(prefix));
      if(nextCode<4096){table.set(cur,nextCode++);if(nextCode>(1<<codeSize)&&codeSize<12)codeSize++;}
      else{emit(clearCode);resetTable();}
      prefix=String(pixels[i]);
    }
  }
  emit(table.get(prefix)); emit(eoi);
  if(bufBits>0) out.push(buf&0xFF);
  return out;
}

// ── PROJECTS / CLOSET ─────────────────────────────────
function loadProjects(){
  try{const r=localStorage.getItem('pc2_proj');if(r){const arr=JSON.parse(r);ST.projects=arr.map(p=>({...p,frames:p.fd?p.fd.map(fd=>{const id=new ImageData(p.size||16,p.size||16);id.data.set(new Uint8ClampedArray(fd));return id;}):[]}));}} catch(e){}
}
function saveProjects(){
  try{localStorage.setItem('pc2_proj',JSON.stringify(ST.projects.map(p=>({name:p.name,size:p.size,fd:p.frames.map(f=>Array.from(f.data))}))));}catch(e){}
}
function saveProject(){
  captureFrame();
  const name=document.getElementById('pname').textContent.trim();
  const proj={name,size:ST.size,frames:[...ST.frames]};
  const idx=ST.projects.findIndex(p=>p.name===name);
  if(idx>=0) ST.projects[idx]=proj; else ST.projects.push(proj);
  saveProjects();
  document.getElementById('ps-creations').textContent=ST.projects.length;
  buildHomeGallery();
  confetti();addXP(20);toast('✦ Saved to Closet!');SFX.save();Economy.track('project:save');
}

function dayStamp(){
  const d=new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function canClaimStreakToday(){
  return localStorage.getItem('pc2_streak_claim_day')!==dayStamp();
}

function refreshStreakUI(){
  const streakEl=document.getElementById('streak-n');
  if(streakEl) streakEl.textContent=String(ST.streak||0);
  const btn=document.getElementById('streak-claim');
  if(!btn) return;
  const ready=canClaimStreakToday();
  btn.textContent=ready?'Claim':'Claimed';
  btn.classList.toggle('off',!ready);
}

function buildHomeGallery(){
  const wrap=document.getElementById('home-gallery-strip');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!ST.projects.length){
    wrap.innerHTML='<button class="gallery-empty" onclick="showTab(\'studio\')">Start your first piece to build your gallery.</button>';
    return;
  }
  [...ST.projects].slice(-3).reverse().forEach((proj,idx)=>{
    const card=document.createElement('button');
    card.className='gallery-item';
    card.onclick=()=>showTab('closet');
    const cvs=document.createElement('canvas');
    cvs.width=proj.size||16;
    cvs.height=proj.size||16;
    if(proj.frames&&proj.frames[0]) cvs.getContext('2d').putImageData(proj.frames[0],0,0);
    const lbl=document.createElement('div');
    lbl.className='gallery-label';
    lbl.textContent=proj.name||`Creation ${idx+1}`;
    card.appendChild(cvs);
    card.appendChild(lbl);
    wrap.appendChild(card);
  });
}

function buildHomeProof(){
  const proof=document.getElementById('home-proof');
  if(!proof) return;
  const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/(86400*1000));
  const joined=560+((doy*37)%260);
  const trends=['Top style: Neon Sneaker','Top style: Kawaii Room','Top style: Anime Eyes','Top style: Chrome Stickers'];
  proof.textContent=`${joined} creators joined this week. ${trends[doy%trends.length]}.`;
}

const HOME_UNLOCKS=[
  {key:'mirror-draw',lvl:2,name:'Mirror Draw',meta:'Symmetry assist'},
  {key:'glow-brush',lvl:4,name:'Glow Brush',meta:'Cinematic bloom'},
  {key:'auto-outline',lvl:6,name:'Auto Outline',meta:'One-tap cleanup'},
  {key:'fx-remix',lvl:8,name:'FX Remix',meta:'Palette harmonizer'},
  {key:'teen-mode',lvl:10,name:'Teen Mode',meta:'Advanced toolkit'},
];

function unlockLevelFor(key){
  return HOME_UNLOCKS.find(u=>u.key===key)?.lvl ?? 1;
}

function isUnlockAvailable(key){
  return ST.level>=unlockLevelFor(key);
}

function unlockNotice(key){
  const lvl=unlockLevelFor(key);
  const name=HOME_UNLOCKS.find(u=>u.key===key)?.name||'Feature';
  return `🔒 ${name} unlocks at Level ${lvl}`;
}

function requireUnlock(key){
  if(isUnlockAvailable(key)) return true;
  toast(unlockNotice(key));
  return false;
}

function syncCanvasUnlockUI(){
  const bindings=[
    {sel:'#t-mirror',key:'mirror-draw'},
    {sel:'#t-select',key:'teen-mode'},
    {sel:'#fx-glow',key:'glow-brush'},
    {sel:'#fx-outline',key:'auto-outline'},
    {sel:'#fx-remix',key:'fx-remix'},
    {sel:'.sw-remix',key:'fx-remix'},
    {sel:'.magic-btn',key:'teen-mode'},
    {sel:'#anim-menu .fx-item',key:'teen-mode'},
  ];
  bindings.forEach(({sel,key})=>{
    const lvl=unlockLevelFor(key);
    const locked=!isUnlockAvailable(key);
    document.querySelectorAll(sel).forEach(el=>{
      el.classList.toggle('locked',locked);
      const baseTitle=el.getAttribute('title')||el.textContent.trim();
      if(!el.dataset.baseTitle) el.dataset.baseTitle=baseTitle;
      el.title=locked?`${el.dataset.baseTitle} (Unlocks at Lv ${lvl})`:el.dataset.baseTitle;
    });
  });
}

function buildHomeUnlocks(){
  const wrap=document.getElementById('home-unlocks');
  if(!wrap) return;
  wrap.innerHTML='';
  const visible=HOME_UNLOCKS;
  visible.forEach(tool=>{
    const unlocked=isUnlockAvailable(tool.key);
    const d=document.createElement('div');
    d.className='unlock-pill '+(unlocked?'unlocked':'locked');
    d.innerHTML=`<div class="unlock-name">${unlocked?'Unlocked':'Lv '+tool.lvl} ${tool.name}</div><div class="unlock-meta">${unlocked?tool.meta:'Keep creating to unlock'}</div>`;
    wrap.appendChild(d);
  });
}

function updateXPNextUnlock(){
  const out=document.getElementById('xp-next');
  if(!out) return;
  const next=HOME_UNLOCKS.find(t=>!isUnlockAvailable(t.key));
  if(!next){out.textContent='All core tools unlocked. Weekly Drop grants bonus XP.';return;}
  const needed=Math.max(0,ST.xpMax-ST.xp);
  out.textContent=`${needed} XP to unlock: ${next.name}`;
}

function updateHomeNavState(activeTab){
  const nav=document.getElementById('nav-home');
  if(!nav) return;
  const today=dayStamp();
  if(activeTab==='home') localStorage.setItem('pc2_home_seen_day',today);
  const seen=localStorage.getItem('pc2_home_seen_day');
  nav.classList.toggle('reward-ready',canClaimStreakToday());
  nav.classList.toggle('fresh-drop',seen!==today&&activeTab!=='home');
}

function loadEngagementState(){
  const savedStreak=Number(localStorage.getItem('pc2_streak'));
  if(Number.isFinite(savedStreak)&&savedStreak>0) ST.streak=savedStreak;
  refreshStreakUI();
  updateHomeNavState('home');
}
function buildClosetCats(){
  const el=document.getElementById('closet-cats');
  ['All','Avatars','Items','Rooms'].forEach((c,i)=>{
    const btn=document.createElement('button');btn.className='ccat'+(i===0?' on':'');btn.textContent=c;
    btn.onclick=()=>{document.querySelectorAll('.ccat').forEach(b=>b.classList.remove('on'));btn.classList.add('on');ST.closetCat=c;renderCloset();};
    el.appendChild(btn);
  });
  renderCloset();
}
function renderCloset(){
  const g=document.getElementById('closet-grid');g.innerHTML='';
  if(!ST.projects.length){g.innerHTML='<div class="ce"><div class="ce-ico">📁</div><div style="font-size:13px;color:var(--text2)">No creations yet!<br>Tap + to start.</div></div>';return;}
  ST.projects.forEach((proj,idx)=>{
    const card=document.createElement('div');card.className='cc';
    const cvs=document.createElement('canvas');cvs.className='cc-cvs';cvs.width=proj.size||16;cvs.height=proj.size||16;
    if(proj.frames&&proj.frames[0]) cvs.getContext('2d').putImageData(proj.frames[0],0,0);
    card.appendChild(cvs);

    const info=document.createElement('div');
    info.className='cc-info';
    info.innerHTML=`<div class="cc-name">${proj.name}</div><div class="cc-meta">${proj.size||16}×${proj.size||16} · ${(proj.frames||[]).length} frame${(proj.frames||[]).length!==1?'s':''}</div>`;

    const acts=document.createElement('div');
    acts.className='cc-acts';

    const viewBtn=document.createElement('button');
    viewBtn.className='cc-act cc-open';
    viewBtn.textContent='View';
    viewBtn.onclick=(e)=>{e.stopPropagation();loadProject(idx);};

    const exportBtn=document.createElement('button');
    exportBtn.className='cc-act cc-exp';
    exportBtn.textContent='Export';
    exportBtn.onclick=(e)=>{e.stopPropagation();exportProject(idx);};

    const deleteBtn=document.createElement('button');
    deleteBtn.className='cc-act cc-del';
    deleteBtn.textContent='🗑';
    deleteBtn.onclick=(e)=>{e.stopPropagation();deleteProject(idx);};

    acts.appendChild(viewBtn);
    acts.appendChild(exportBtn);
    acts.appendChild(deleteBtn);

    card.appendChild(info);
    card.appendChild(acts);
    g.appendChild(card);
  });
}
function loadProject(idx){
  const p=ST.projects[idx];if(!p)return;
  ST.size=p.size||16;
  ST.frames=p.frames.map(f=>{const id=new ImageData(ST.size,ST.size);id.data.set(f.data);return id;});
  ST.undoStacks=ST.frames.map(f=>[f]);ST.undoIdx=ST.frames.map(()=>0);ST.currentFrame=0;
  document.getElementById('pname').textContent=p.name;
  // sync size buttons
  ['sz-16','sz-32','sz-64'].forEach(id=>document.getElementById(id).classList.remove('on'));
  document.getElementById('sz-'+ST.size)?.classList.add('on');
  showTab('create');setTimeout(initCanvas,50);
}
function deleteProject(idx){
  if(!confirm(`Delete "${ST.projects[idx].name}"?`)) return;
  ST.projects.splice(idx,1);saveProjects();
  document.getElementById('ps-creations').textContent=ST.projects.length;
  buildHomeGallery();
  renderCloset();toast('Deleted');
}
function exportProject(idx){
  const p=ST.projects[idx];if(!p||!p.frames[0])return;
  const scale=8;const cvs=document.createElement('canvas');
  cvs.width=(p.size||16)*scale;cvs.height=(p.size||16)*scale;
  const ctx=cvs.getContext('2d');ctx.imageSmoothingEnabled=false;
  createImageBitmap(p.frames[0]).then(bmp=>{ctx.drawImage(bmp,0,0,(p.size||16)*scale,(p.size||16)*scale);const a=document.createElement('a');a.href=cvs.toDataURL('image/png');a.download=p.name+'.png';a.click();toast('Exported!');});
}

// ── TEMPLATES ─────────────────────────────────────────
// ── Shared helper: build a tmpl card with live pixel preview ──
function makeTmplCard({cls='', badgeTag='', onclick, name, previewFn, frameCount, y2kStyle=false, coloringStyle=false}){
  const d = document.createElement('div');
  d.className = 'tmpl' + (cls ? ' '+cls : '');
  if(y2kStyle) d.style.cssText='border-color:rgba(246,165,192,0.4)';
  if(coloringStyle) d.style.cssText='border-color:rgba(255,107,171,0.45)';

  const badgeTxt = badgeTag==='new'?'NEW':badgeTag==='hot'?'HOT':badgeTag==='pro'?'PRO':'';
  const badgeCls = badgeTag || '';

  // Preview area
  const prev = document.createElement('div');
  prev.className = 'tmpl-preview';

  if(previewFn){
    // Render into offscreen canvas at size 32, display via CSS scaling
    const previewSize = 32;
    const cvs = document.createElement('canvas');
    cvs.width = previewSize; cvs.height = previewSize;
    const pctx = cvs.getContext('2d');
    try { previewFn(pctx, previewSize); } catch(e){}
    prev.appendChild(cvs);
  }

  // Frame count pill for animations
  if(frameCount && frameCount > 1){
    const pill = document.createElement('div');
    pill.className = 'tmpl-frames-pill';
    pill.textContent = frameCount + ' frames';
    prev.appendChild(pill);
  }

  d.appendChild(prev);

  // Info row
  const info = document.createElement('div');
  info.className = 'tmpl-info';
  const lbl = document.createElement('span');
  lbl.className = 'tmpl-lbl';
  lbl.textContent = name;
  info.appendChild(lbl);
  if(badgeTxt){
    const b = document.createElement('span');
    b.className = 'tmpl-badge ' + badgeCls;
    b.textContent = badgeTxt;
    info.appendChild(b);
  }
  d.appendChild(info);

  d.onclick = onclick;
  return d;
}

function buildTemplateGrid(containerId, items){
  const el = document.getElementById(containerId); if(!el) return; el.innerHTML='';
  items.forEach(t=>{
    const card = makeTmplCard({
      cls: t.cat==='challenge' ? 'challenge-t' : '',
      badgeTag: t.tag,
      name: t.name,
      previewFn: DRAWERS[t.id] ? (ctx,sz)=>DRAWERS[t.id](ctx,sz) : null,
      onclick: ()=>loadTemplate(t.id, t.name),
    });
    el.appendChild(card);
  });
}

function buildAnimGrid(){
  const el = document.getElementById('tmpl-anim'); if(!el) return; el.innerHTML='';
  ANIM_TEMPLATES.forEach(t=>{
    const card = makeTmplCard({
      badgeTag: t.tag,
      name: t.name,
      frameCount: t.frames,
      previewFn: (ctx,sz)=>t.draw(ctx,sz,0),
      onclick: ()=>loadAnimTemplate(t),
    });
    el.appendChild(card);
  });
}

function buildY2KGrid(){
  const el = document.getElementById('tmpl-y2k'); if(!el) return; el.innerHTML='';
  TEMPLATES.y2k.forEach(t=>{
    const card = makeTmplCard({
      badgeTag: t.tag,
      name: t.name,
      y2kStyle: true,
      previewFn: DRAWERS[t.id] ? (ctx,sz)=>DRAWERS[t.id](ctx,sz) : null,
      onclick: ()=>loadTemplate(t.id, t.name),
    });
    el.appendChild(card);
  });
}
function buildHomeTemplates(){
  const el=document.getElementById('home-templates');if(!el)return;el.innerHTML='';
  [...TEMPLATES.challenge,...TEMPLATES.items.slice(0,2),...TEMPLATES.chars.slice(0,2)].forEach(t=>{
    const d=document.createElement('div');
    d.className='tcard'+(t.cat==='challenge'?' challenge':'');
    const tag=t.tag==='hot'?'<span class="tcard-tag">🔥 HOT</span>':t.tag==='new'?'<span class="tcard-tag">✦ NEW</span>':'';
    // Preview
    const prev=document.createElement('div');prev.className='tcard-preview';
    if(DRAWERS[t.id]){
      const cvs=document.createElement('canvas');cvs.width=32;cvs.height=32;
      try{DRAWERS[t.id](cvs.getContext('2d'),32);}catch(e){}
      prev.appendChild(cvs);
    } else {
      prev.className='tcard-icon';prev.textContent=t.ico;
    }
    d.appendChild(prev);
    d.insertAdjacentHTML('beforeend',`<div class="tcard-bottom"><div class="tcard-name">${t.name}</div>${tag}</div>`);
    d.onclick=()=>loadTemplate(t.id,t.name);el.appendChild(d);
  });
}
function loadTemplate(id,name){
  // Clear any active coloring mode
  if(ST.coloringMode) clearColoringMode();
  ST.frames=[];ST.undoStacks=[];ST.undoIdx=[];showTab('create');
  setTimeout(()=>{
    initCanvas();
    document.getElementById('pname').textContent=name.toLowerCase().replace(/ /g,'-')+'.px';
    if(DRAWERS[id]){
      const ctx=document.getElementById('mc').getContext('2d');
      ctx.clearRect(0,0,ST.size,ST.size);DRAWERS[id](ctx,ST.size);captureFrame();pushHistory();flash();toast(`✦ ${name} loaded!`);
    }
  },50);
}

function loadAnimTemplate(tmpl){
  ST.frames=[];ST.undoStacks=[];ST.undoIdx=[];showTab('create');
  setTimeout(()=>{
    initCanvas();
    document.getElementById('pname').textContent=tmpl.name.toLowerCase().replace(/ /g,'-')+'.px';
    // Generate all frames
    for(let f=0;f<tmpl.frames;f++){
      const tmp=document.createElement('canvas');tmp.width=ST.size;tmp.height=ST.size;
      const tctx=tmp.getContext('2d');
      tmpl.draw(tctx,ST.size,f);
      const id=tctx.getImageData(0,0,ST.size,ST.size);
      ST.frames.push(id);
      ST.undoStacks.push([cloneImageData(id)]);
      ST.undoIdx.push(0);
    }
    ST.currentFrame=0;
    buildFramesUI();
    drawFrame(0);
    flash();toast(`🎬 ${tmpl.name} loaded — ${tmpl.frames} frames ready!`);
    addXP(5);
  },50);
}


function buildFXGrid(){
  const el=document.getElementById('fx-grid');if(!el)return;el.innerHTML='';
  EFFECTS_LIST.forEach(fx=>{
    const d=document.createElement('div');d.className='fx-card';
    d.innerHTML=`<span class="fx-card-ico">${fx.ico}</span><div class="fx-card-info"><div class="fx-card-name">${fx.name}</div><div class="fx-card-desc">${fx.desc}</div></div>`;
    d.onclick=()=>{showTab('create');setTimeout(()=>runFX(fx.id),100);};el.appendChild(d);
  });
}

// ── CHALLENGES ────────────────────────────────────────
function buildChallenges(){
  const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/(86400*1000));
  const curr=CHALLENGES[doy%CHALLENGES.length];
  document.getElementById('cc-title').textContent=curr.emoji+' '+curr.name;
  document.getElementById('cc-meta').textContent=`${Math.floor(Math.random()*800+200)} entries · +${curr.xp} XP reward`;
  document.getElementById('ch-name').textContent=curr.name;
  document.getElementById('ch-sub').textContent=curr.desc+` · +${curr.xp} XP`;
  const rankEl=document.getElementById('rank-row');
  ['PixelKing','StarDust','NeonCat','YOU','CyberPup'].forEach((n,i)=>{
    const d=document.createElement('div');d.className='rank-item';
    const [{cls:c,ico:ico}]=[{cls:'g',ico:'🥇'},{cls:'s',ico:'🥈'},{cls:'b',ico:'🥉'},{cls:'you',ico:'✦'},{cls:'',ico:'5'}].slice(i,i+1);
    d.innerHTML=`<div class="rank-medal ${c}">${ico}</div><div class="rank-lbl">${n}</div>`;rankEl.appendChild(d);
  });
  const ul=document.getElementById('upcoming-list');
  UPCOMING.forEach(u=>{const d=document.createElement('div');d.className='up-item';d.innerHTML=`<div class="up-dot" style="background:${u.color}"></div><div class="up-day">${u.day}</div><div class="up-name">${u.name}</div><div class="up-pts">+${u.pts} XP</div>`;ul.appendChild(d);});
  const fg=document.getElementById('feed-grid');
  const cols=['#6C63FF','#FF6B6B','#3DDC97','#FFD166','#4FC3F7','#CE93D8'];
  for(let i=0;i<6;i++){
    const card=document.createElement('div');card.className='fc';
    const cvs=document.createElement('canvas');cvs.className='fc-cvs';cvs.width=64;cvs.height=64;
    const ctx=cvs.getContext('2d');
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(Math.sin(x*.25+i*1.3)*Math.cos(y*.25+i*.7)>.18){ctx.fillStyle=cols[(x+y+i)%cols.length];ctx.fillRect(x,y,1,1);}
    const rxns=document.createElement('div');rxns.className='fc-rxns';
    [['🔥',Math.floor(Math.random()*99+5)],['✨',Math.floor(Math.random()*40)],['👑',Math.floor(Math.random()*15)]].forEach(([e,n])=>{
      const btn=document.createElement('button');btn.className='rxn';btn.innerHTML=`${e} <span>${n}</span>`;
      btn.onclick=()=>{btn.classList.toggle('lit');const sp=btn.querySelector('span');sp.textContent=+sp.textContent+(btn.classList.contains('lit')?1:-1);};rxns.appendChild(btn);
    });
    card.appendChild(cvs);card.appendChild(rxns);fg.appendChild(card);
  }
}
function startChallenge(){
  const doy=Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/(86400*1000));
  const curr=CHALLENGES[doy%CHALLENGES.length];toast(`Starting: ${curr.name}!`);showTab('create');
  setTimeout(()=>{ST.frames=[];initCanvas();document.getElementById('pname').textContent='challenge.px';},60);
}

// ── GAMIFICATION ──────────────────────────────────────
function addXP(n){
  ST.xp+=n;
  if(ST.xp>=ST.xpMax){ST.level++;ST.xp-=ST.xpMax;ST.xpMax=Math.floor(ST.xpMax*1.45);toast(`⚡ Level ${ST.level} unlocked!`);confetti();SFX.levelUp();}
  const pct=Math.min(100,(ST.xp/ST.xpMax)*100);
  const xpf=document.getElementById('xp-fill');if(xpf)xpf.style.width=pct+'%';
  ['xp-cur','ps-xp'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent=ST.xp;});
  const xpm=document.getElementById('xp-max');if(xpm)xpm.textContent=ST.xpMax;
  const xpl=document.getElementById('xp-lvl');if(xpl)xpl.textContent=ST.level;
  updateXPNextUnlock();
  buildHomeUnlocks();
  syncCanvasUnlockUI();
}
function claimStreak(){
  if(!canClaimStreakToday()){toast('Streak already claimed today. Come back tomorrow.');return;}
  ST.streak+=1;
  localStorage.setItem('pc2_streak',String(ST.streak));
  localStorage.setItem('pc2_streak_claim_day',dayStamp());
  refreshStreakUI();
  updateHomeNavState();
  addXP(15);confetti();toast('🔥 Streak reward! +15 XP');SFX.unlock();
}

// ── PROFILE ───────────────────────────────────────────
function buildProfile(){
  const cvs=document.getElementById('prof-av');const ctx=cvs.getContext('2d');
  const cols=['#6C63FF','#FF6B6B','#3DDC97','#FFD166'];
  for(let y=0;y<11;y++)for(let x=0;x<11;x++)if(Math.random()>.5){ctx.fillStyle=cols[Math.floor(Math.random()*cols.length)];ctx.fillRect(x*7,y*7,7,7);}
  const el=document.getElementById('ptog-list');
  [['Public Gallery',false],['External Share',false],['Time Reminders',true],['Sound Effects',true],['Parent Controls',false]].forEach(([lbl,def])=>{
    const row=document.createElement('div');row.className='ptog';
    row.innerHTML=`<span class="ptog-l">${lbl}</span><label class="tog"><input type="checkbox"${def?' checked':''}><div class="tog-tr" style="background:${def?'var(--ind)':'var(--s5)'}"></div><div class="tog-th" style="left:${def?'22':'2'}px"></div></label>`;
    const inp=row.querySelector('input');inp.onchange=()=>{row.querySelector('.tog-tr').style.background=inp.checked?'var(--ind)':'var(--s5)';row.querySelector('.tog-th').style.left=inp.checked?'22px':'2px';};
    el.appendChild(row);
  });
}

// ── NAVIGATION ────────────────────────────────────────
const TAB_MAP={home:'home-screen',studio:'studio-screen',create:'canvas-screen',closet:'closet-screen',challenges:'chal-screen',profile:'profile-screen'};
function showTab(tab){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(TAB_MAP[tab]).classList.add('active');
  document.querySelectorAll('.nt').forEach(t=>t.classList.remove('on'));
  const nb=document.getElementById('nav-'+tab);if(nb)nb.classList.add('on');
  if(tab==='create'&&!ST.frames.length) setTimeout(()=>initCanvas(),50);
  if(tab==='closet') renderCloset();
  if(tab==='home'){
    buildHomeProof();
    buildHomeGallery();
    buildHomeUnlocks();
    refreshStreakUI();
    updateXPNextUnlock();
  }
  updateHomeNavState(tab);
  closeFXMenu();closeAnimMenu();
}
function openStudio(){showTab('studio');}

// ── HELPERS ───────────────────────────────────────────
function toast(msg,dur=2200){document.querySelectorAll('.toast').forEach(t=>t.remove());const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.style.opacity='0',dur-300);setTimeout(()=>t.remove(),dur);}
function confetti(){const cols=['#6C63FF','#FF6B6B','#3DDC97','#FFD166','#4FC3F7','#CE93D8'];for(let i=0;i<55;i++){const px=document.createElement('div');const w=Math.random()>.5?4:6;px.className='cp';px.style.cssText=`width:${w}px;height:${w}px;background:${cols[Math.floor(Math.random()*cols.length)]};left:${Math.random()*100}%;top:0;animation-delay:${Math.random()*.7}s;animation-duration:${.8+Math.random()*1}s`;document.body.appendChild(px);setTimeout(()=>px.remove(),2200);}}
function onKey(e){
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.contentEditable==='true') return;
  const k=e.key.toLowerCase();
  if(e.ctrlKey&&k==='z'){e.preventDefault();undo();}
  else if(e.ctrlKey&&k==='y'){e.preventDefault();redo();}
  else if(e.ctrlKey&&k==='s'){e.preventDefault();saveProject();}
  else if(k==='b') setTool('pencil');
  else if(k==='e') setTool('eraser');
  else if(k==='f') setTool('fill');
  else if(k==='s'&&!e.ctrlKey) setTool('select');
  else if(k==='g') toggleGrid();
  else if(k==='escape') clearSel();
  else if(SEL.active&&k==='arrowup'){e.preventDefault();nudgeSel(0,-1);}
  else if(SEL.active&&k==='arrowdown'){e.preventDefault();nudgeSel(0,1);}
  else if(SEL.active&&k==='arrowleft'){e.preventDefault();nudgeSel(-1,0);}
  else if(SEL.active&&k==='arrowright'){e.preventDefault();nudgeSel(1,0);}
  else if(k===' '){e.preventDefault();togglePlay();}
}

// ── LAYER PANEL ───────────────────────────────────────
function toggleLayerPanel(){
  const panel = document.getElementById('layer-panel');
  const btn = document.getElementById('layer-btn');
  const open = panel.classList.toggle('open');
  btn.classList.toggle('on', open);
  if (open) buildLayerPanel();
}

function buildLayerPanel(){
  const state = Store.getState();
  if (!state) return;
  const list = document.getElementById('layer-list');
  if (!list) return;
  list.innerHTML = '';
  const layers = [...state.layers].reverse(); // top layer first visually
  layers.forEach(layer => {
    const row = document.createElement('div');
    row.className = 'lp-row' + (layer.id === state.activeLayer ? ' active' : '');
    row.onclick = () => setActiveLayer(layer.id);

    // visibility toggle
    const vis = document.createElement('button');
    vis.className = 'lp-vis';
    vis.textContent = layer.visible ? '👁' : '○';
    vis.title = layer.visible ? 'Hide layer' : 'Show layer';
    vis.onclick = (e) => { e.stopPropagation(); setLayerVisible(layer.id, !layer.visible); };

    // name (editable on dblclick)
    const name = document.createElement('div');
    name.className = 'lp-name';
    name.textContent = layer.name;
    name.title = layer.name;
    name.ondblclick = (e) => {
      e.stopPropagation();
      name.contentEditable = 'true';
      name.focus();
      const sel = window.getSelection();
      sel.selectAllChildren(name);
      name.onblur = () => {
        name.contentEditable = 'false';
        const newName = name.textContent.trim() || layer.name;
        name.textContent = newName;
        // Update store layer name
        const s = Store.getState();
        const layers = s.layers.map(l => l.id === layer.id ? { ...l, name: newName } : l);
        Store._state = { ...s, layers }; // direct patch (name change is non-destructive)
        buildLayerPanel();
      };
    };

    // delete button
    const del = document.createElement('button');
    del.className = 'lp-del';
    del.textContent = '✕';
    del.title = 'Delete layer';
    del.onclick = (e) => { e.stopPropagation(); removeLayer(layer.id); };

    row.appendChild(vis);
    row.appendChild(name);
    row.appendChild(del);
    list.appendChild(row);
  });
  // Update opacity slider to match active layer
  const active = state.layers.find(l => l.id === state.activeLayer);
  if (active) {
    const val = Math.round((active.opacity || 1) * 100);
    const slider = document.getElementById('layer-opacity');
    const label = document.getElementById('layer-opacity-val');
    if (slider) slider.value = val;
    if (label) label.textContent = val + '%';
  }
}

function addLayer(){
  Store.dispatch({ type: 'layer:add' });
  // Sync ST for drawing compatibility
  const state = Store.getState();
  ST.activeLayer = state.activeLayer;
  buildLayerPanel();
  toast('✦ New layer added');
  SFX.click();
}

function removeLayer(layerId){
  const state = Store.getState();
  if (state.layers.length <= 1) { toast('Need at least 1 layer'); return; }
  Store.dispatch({ type: 'layer:remove', layerId });
  LayerEngine.deleteFrame(ST.currentFrame); // clears orphan data
  const newState = Store.getState();
  ST.activeLayer = newState.activeLayer;
  buildLayerPanel();
  toast('Layer removed');
  SFX.click();
}

function setActiveLayer(layerId){
  // Before switching, save current canvas to current layer
  captureCurrentLayer();
  Store.dispatch({ type: 'layer:setActive', layerId });
  ST.activeLayer = layerId;
  // Restore this layer's pixel data to main canvas
  restoreCurrentLayer();
  buildLayerPanel();
}

function setLayerVisible(layerId, visible){
  Store.dispatch({ type: 'layer:setVisible', layerId, visible });
  buildLayerPanel();
  // Re-composite visible layers to canvas
  compositeAllLayers();
}

function setLayerOpacity(val){
  const pct = parseInt(val);
  const label = document.getElementById('layer-opacity-val');
  if (label) label.textContent = pct + '%';
  const state = Store.getState();
  if (!state.activeLayer) return;
  Store.dispatch({ type: 'layer:setOpacity', layerId: state.activeLayer, opacity: pct / 100 });
  compositeAllLayers();
}

// Save current canvas pixels into LayerEngine for active layer
function captureCurrentLayer(){
  const ctx = document.getElementById('mc').getContext('2d');
  const state = Store.getState();
  const layerId = (state && state.activeLayer) || 'base';
  const data = ctx.getImageData(0, 0, ST.size, ST.size);
  LayerEngine.setLayerData(ST.currentFrame, layerId, data);
  // Also keep ST.frames in sync for export/animation
  captureFrame();
}

// Restore active layer pixels back to main canvas
function restoreCurrentLayer(){
  const state = Store.getState();
  const layerId = (state && state.activeLayer) || 'base';
  const data = LayerEngine.getLayerData(ST.currentFrame, layerId);
  const ctx = document.getElementById('mc').getContext('2d');
  ctx.clearRect(0, 0, ST.size, ST.size);
  if (data) ctx.putImageData(data, 0, 0);
}

// Composite all visible layers onto the main canvas
function compositeAllLayers(){
  const state = Store.getState();
  if (!state || state.layers.length <= 1) return; // single layer = no composite needed
  const ctx = document.getElementById('mc').getContext('2d');
  ctx.clearRect(0, 0, ST.size, ST.size);
  state.layers.filter(l => l.visible).forEach(l => {
    const data = LayerEngine.getLayerData(ST.currentFrame, l.id);
    if (!data) return;
    // Draw with opacity via offscreen canvas
    const tmp = document.createElement('canvas');
    tmp.width = ST.size; tmp.height = ST.size;
    const tc = tmp.getContext('2d');
    tc.putImageData(data, 0, 0);
    ctx.save();
    ctx.globalAlpha = l.opacity !== undefined ? l.opacity : 1;
    ctx.drawImage(tmp, 0, 0);
    ctx.restore();
  });
  captureFrame();
}

// Extend captureFrame to always sync active layer data
const _origCaptureFrame = captureFrame;
captureFrame = function(){
  _origCaptureFrame();
  // Sync to LayerEngine if layers are initialized
  if (LayerEngine.isInitialized()) {
    const ctx = document.getElementById('mc').getContext('2d');
    const state = Store.getState();
    const layerId = (state && state.activeLayer) || 'base';
    LayerEngine.setLayerData(ST.currentFrame, layerId, ctx.getImageData(0, 0, ST.size, ST.size));
  }
};

// ── BOOT ──────────────────────────────────────────────
function boot(){
  initStore();
  buildPalRow();
  loadProjects();
  loadEngagementState();
  buildHomeTemplates();
  buildHomeProof();
  buildHomeGallery();
  buildHomeUnlocks();
  buildTemplateGrid('tmpl-challenge',TEMPLATES.challenge);
  buildTemplateGrid('tmpl-items',TEMPLATES.items);
  buildTemplateGrid('tmpl-chars',TEMPLATES.chars);
  buildTemplateGrid('tmpl-scenes',TEMPLATES.scenes);
  buildAnimGrid();
  buildY2KGrid();
  buildColoringGrid();
  buildColoringGrid();
  buildFXGrid();
  buildClosetCats();
  buildChallenges();
  updateXPNextUnlock();
  buildProfile();
  document.getElementById('ps-creations').textContent=ST.projects.length;
  initCanvas(16);
  syncCanvasUnlockUI();
  buildLayerPanel();
  document.getElementById('sz-16').classList.add('on');
  document.getElementById('sz-32').classList.remove('on');
  startAutoSave();
  document.addEventListener('keydown',onKey);
  console.log('%c[PixelStudioCore v2.0] Ready','color:#6C63FF;font-weight:bold;',window.PixelStudioCore.inspect());
}
function startAutoSave(){setInterval(()=>{if(ST.frames.length&&ST.projects.length>0)captureFrame();},6000);}

boot();
