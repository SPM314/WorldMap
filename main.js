// With Example button & map drag/drop

// Embedded sample CSV data (20 rows)
const EMBEDDED_SAMPLE_CSV = `lat,lon,label,band_type,date,comment
29.9792,31.1344,Great Pyramid of Giza,,2600 BCE,
41.8902,12.4922,Colosseum,,0072-01-01,
27.1751,78.0421,Taj Mahal,,1631-01-01,
-22.9519,-43.2105,Christ the Redeemer,,1931-10-13,
-13.1631,-72.545,Machu Picchu,,1420-01-01,
40.7484,-73.9857,Statue of Liberty,,1886-10-28,
48.8584,2.2945,Eiffel Tower,,1889-03-31,
51.5014,-0.1419,Big Ben,,1843-09-28,
55.752,37.6175,Red Square,,1490-01-01,
35.6762,139.6503,Tokyo Tower,,1975-05-08,
-33.8568,151.2153,Sydney Opera House,,1973-10-20,
41.4036,2.1744,Sagrada Familia,,1883-03-19,
25.3444,131.0369,Itsukushima Shrine,,0593-01-01,
30.3285,35.4444,Petra,,0050-01-01,
20.6843,-88.5678,Chichen Itza,,0435-01-01,
43.7696,11.2558,Leaning Tower of Pisa,,1172-01-05,
52.52,13.405,Brandenburg Gate,,1791-01-01,
37.9755,23.7348,Acropolis of Athens,,450 BCE,`;

document.addEventListener('DOMContentLoaded', function() {
  // --- Leaflet Map Initialization ---
  if (typeof L === 'undefined') { alert('Leaflet not loaded'); return; }
  const mapDiv = document.getElementById('map');
  if (!mapDiv) { alert('Map container missing'); return; }

  // Map
  const map = L.map('map', {
    center: [0, 0],
    zoom: 1,
    minZoom: 0,
    zoomSnap: 0,
    worldCopyJump: false,
    maxBounds: [[-85.05112878, -180], [85.05112878, 180]],
    maxBoundsViscosity: 1.0,
    preferCanvas: true
  });

  // CREATE PANES FIRST (must exist before adding any layer to them)
  map.createPane('gridPane');         map.getPane('gridPane').style.zIndex = 350;
  map.createPane('shadePane');        map.getPane('shadePane').style.zIndex = 365;
  map.createPane('labelPane');        map.getPane('labelPane').style.zIndex = 460;
  map.createPane('leaderLinePane');   map.getPane('leaderLinePane').style.zIndex = 459;
  map.createPane('bandLabelPane');    map.getPane('bandLabelPane').style.zIndex = 368;
  map.getPane('bandLabelPane').style.pointerEvents = 'none';

  // Canvas renderers for those panes (so html2canvas exports align perfectly)
  const gridRenderer  = L.canvas({ pane: 'gridPane' });
  const shadeRenderer = L.canvas({ pane: 'shadePane' });

  // Tiles
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
    noWrap: true,
    bounds: [[-85.05112878, -180], [85.05112878, 180]],
    crossOrigin: 'anonymous'
  }).addTo(map);

  // Watermark
  try {
    const WatermarkControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        const div = L.DomUtil.create('div', 'leaflet-control watermark');
        const startYear = 2025;
        const y = new Date().getFullYear();
        const yearText = y <= startYear ? `${startYear}` : `${startYear}-${y}`;
        div.textContent = `\u00A9 ${yearText} Sagy Pundak Mintz & Ron Paz All Rights Reserved`;
        return div;
      }
    });
    map.addControl(new WatermarkControl());
  } catch (_) {}

  let bandLabelGroup = null;

  // Web Mercator helpers
  const MAX_MERC_LAT = 85.05112878;
  function clampLat(lat) { return Math.max(-MAX_MERC_LAT, Math.min(MAX_MERC_LAT, lat)); }
  function latToMercY(latDeg) {
    const rad = clampLat(latDeg) * Math.PI / 180;
    return Math.log(Math.tan(Math.PI / 4 + rad / 2));
  }
  function mercYToLat(y) { return (Math.atan(Math.sinh(y)) * 180 / Math.PI); }
  function ringVisualCenterLat(latBin) {
    const a = clampLat(latBin);
    const b = clampLat(latBin + 10);
    const yMid = (latToMercY(a) + latToMercY(b)) / 2;
    return mercYToLat(yMid);
  }
  function stripeTopLat(padPx = 8) {
    const size = map.getSize();
    const y = Math.max(0, Math.min(size.y - 1, padPx));
    const lat = map.containerPointToLatLng([size.x / 2, y]).lat;
    return clampLat(lat);
  }

  // Fit world so rings 1..18 are visible; add a touch of top/bottom padding for labels
  const WORLD_BOUNDS = L.latLngBounds([[-85.05112878, -180], [85.05112878, 180]]);
  const FIT_LAT = 84.5;
  const FIT_BOUNDS = L.latLngBounds([[-FIT_LAT, -180], [FIT_LAT, 180]]);
  const TOP_PAD_PX = 10;
  const BOTTOM_PAD_PX = 6;

  function fitWorldExactly() {
    map.fitBounds(FIT_BOUNDS, {
      animate: false,
      paddingTopLeft: [0, TOP_PAD_PX],
      paddingBottomRight: [0, BOTTOM_PAD_PX]
    });
    const z = map.getZoom();
    map.setMinZoom(z);
    map.setMaxBounds(WORLD_BOUNDS);
    map.setView([0, 0], z, { animate: false });
  }

  map.whenReady(() => {
    map.invalidateSize({ animate: false });
    fitWorldExactly();
    rebuildBandLabels();
  });
  map.on('zoomend moveend', rebuildBandLabels);
  map.on('resize', () => {
    map.invalidateSize({ animate: false });
    fitWorldExactly();
    rebuildBandLabels();
  });

  // Grid (use canvas renderer, panes exist now)
  const gridStyle = { pane: 'gridPane', renderer: gridRenderer, color: '#2b2b2b', weight: 1, opacity: 0.6, dashArray: '4,4' };
  for (let lon = -180; lon <= 180; lon += 10) L.polyline([[-85, lon], [85, lon]], gridStyle).addTo(map);
  for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], gridStyle).addTo(map);

  // Labels (stripes along top; rings in stripe 2)
  function rebuildBandLabels() {
    if (!bandLabelGroup) {
      bandLabelGroup = L.layerGroup([], { pane: 'bandLabelPane' });
      map.addLayer(bandLabelGroup);
    } else {
      bandLabelGroup.clearLayers();
    }

    // Stripe numbers 1..36 along the top edge (centered per 10° stripe)
    const topLat = stripeTopLat(TOP_PAD_PX || 8);
    let sIdx = 1;
    for (let lonBin = -180; lonBin <= 170; lonBin += 10, sIdx++) {
      const lonCenter = lonBin + 5; // -175, -165, ... , +175
      bandLabelGroup.addLayer(L.marker([topLat, lonCenter], {
        icon: L.divIcon({
          className: 'band-label-icon',
          html: `<span class="band-label band-label-stripe">${sIdx}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard: false,
        pane: 'bandLabelPane'
      }));
    }

    // Ring numbers 1..18 at stripe 2 (center at lon -175)
    const ringLabelLonCenter = -175;
    let rIdx = 1;
    for (let latBin = -90; latBin <= 80; latBin += 10, rIdx++) {
      const latCenter = ringVisualCenterLat(latBin);
      bandLabelGroup.addLayer(L.marker([latCenter, ringLabelLonCenter], {
        icon: L.divIcon({
          className: 'band-label-icon',
          html: `<span class="band-label band-label-ring">${rIdx}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0]
        }),
        interactive: false,
        keyboard: false,
        pane: 'bandLabelPane'
      }));
    }
  }

  // --- Constants ---
  const BAND_COLORS = { ring: '#1976d2', stripe: '#f57c00', both: '#8e24aa', none: '#888' };
  const RING_BAND_COUNT = 18, STRIPE_BAND_COUNT = 36;

  // --- UI Elements ---
  const statusEl = document.getElementById('status');
  const skipReport = document.getElementById('skipReport');
  const clearBtn = document.getElementById('clearBtn');

  // Save As UI
  const saveAsBtn = document.getElementById('saveAsBtn');
  const saveAsMenu = document.getElementById('saveAsMenu');
  const saveAsCsvBtn = document.getElementById('saveAsCsvBtn');
  const saveAsPicBtn = document.getElementById('saveAsPicBtn');

  const saveCsvModal = document.getElementById('saveCsvModal');
  const saveCsvName = document.getElementById('saveCsvName');
  const saveCsvOk = document.getElementById('saveCsvOk');
  const saveCsvCancel = document.getElementById('saveCsvCancel');
  const saveCsvClose = document.getElementById('saveCsvClose');

  const savePicModal = document.getElementById('savePicModal');
  const savePicName = document.getElementById('savePicName');
  const savePicFormat = document.getElementById('savePicFormat');
  const savePicOk = document.getElementById('savePicOk');
  const savePicCancel = document.getElementById('savePicCancel');
  const savePicClose = document.getElementById('savePicClose');

  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.getElementById('helpClose');
  const exampleBtn = document.getElementById('exampleBtn');
  const shadedInfo = document.getElementById('shaded-info');

  // Filters
  const checkboxes = [
    document.getElementById('flt-ring'),
    document.getElementById('flt-stripe'),
    document.getElementById('flt-both'),
    document.getElementById('flt-none')
  ];
  const lblRing = document.getElementById('lbl-ring');
  const lblStripe = document.getElementById('lbl-stripe');
  const lblBoth = document.getElementById('lbl-both');
  const lblNone = document.getElementById('lbl-none');
  const allUncheckedWarn = document.getElementById('allUncheckedWarn');

  const DEFAULT_BAND_COLORS = {
    ring:   '#3b82f6',
    stripe: '#f59e0b',
    both:   '#8b5cf6',
    none:   '#888888'
  };

// Default shapes and sizes
const DEFAULT_BAND_SHAPES = {
  ring:   { symbol: 'circle', size: 24 },
  stripe: { symbol: 'circle', size: 24 },
  both:   { symbol: 'circle', size: 24 },
  none:   { symbol: 'circle', size: 24 }
};
// Working copy that can be changed at runtime
const BAND_SHAPES = JSON.parse(JSON.stringify(DEFAULT_BAND_SHAPES));

// Load persisted shapes (if any)
try {
  const savedShapes = JSON.parse(localStorage.getItem('bandShapes'));
  if (savedShapes && typeof savedShapes === 'object') {
    for (const k of ['ring','stripe','both','none']) {
      if (savedShapes[k]) {
        BAND_SHAPES[k].symbol = savedShapes[k].symbol || BAND_SHAPES[k].symbol;
        const sz = parseInt(savedShapes[k].size, 10);
        if (!Number.isNaN(sz)) BAND_SHAPES[k].size = Math.min(48, Math.max(12, sz));
      }
    }
  }
} catch (_) {}

function saveBandShapes() {
  try { localStorage.setItem('bandShapes', JSON.stringify(BAND_SHAPES)); } catch (_) {}
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

// Build SVG for a marker symbol
function markerSvg(symbol, size, color) {
  const s = clamp(Math.round(size), 12, 48);
  const cx = s / 2, cy = s / 2;
  const stroke = '#333';
  const sw = Math.max(1, Math.round(s / 16)); // scale stroke a bit with size
  const fill = color || '#888';

  function starPoints(spikes, outerR, innerR) {
    const pts = [];
    let rot = -Math.PI / 2; // start at top
    const step = Math.PI / spikes;
    for (let i = 0; i < spikes; i++) {
      pts.push([cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR]);
      rot += step;
      pts.push([cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR]);
      rot += step;
    }
    return pts.map(p => p.join(',')).join(' ');
  }

  let inner = '';
  switch ((symbol || 'circle').toLowerCase()) {
    case 'circle': {
      const r = s / 3;
      inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'square': {
      const side = s * 0.66;
      const x = cx - side / 2, y = cy - side / 2;
      inner = `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${Math.max(1, s*0.06)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'diamond': {
      const r = s * 0.46;
      const pts = [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]].map(p => p.join(',')).join(' ');
      inner = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'triangle': {
      const r = s * 0.5;
      const h = r * Math.sqrt(3) / 2;
      const pts = [[cx, cy - h], [cx - r/1.2, cy + h/1.2], [cx + r/1.2, cy + h/1.2]].map(p => p.join(',')).join(' ');
      inner = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'star': {
      const outerR = s * 0.48;
      const innerR = outerR * 0.5;
      inner = `<polygon points="${starPoints(5, outerR, innerR)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'star6': {
      const outerR = s * 0.46;
      const innerR = outerR * 0.54;
      inner = `<polygon points="${starPoints(6, outerR, innerR)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
      break;
    }
    case 'pin': {
      // Simple "pin": circle + downward triangle
      const r = s * 0.28;
      const cyTop = cy - r * 0.2;
      const triTopY = cyTop + r * 0.6;
      const triBottomY = cyTop + r * 2.0;
      const triHalf = r * 0.9;
      inner = `
        <circle cx="${cx}" cy="${cyTop}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />
        <polygon points="${cx},${triBottomY} ${cx - triHalf},${triTopY} ${cx + triHalf},${triTopY}"
                 fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />
      `;
      break;
    }
    default: {
      const r = s / 3;
      inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
    }
  }
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// Rebuild a marker icon using current color + shape config
function buildMarkerIcon(bandType) {
  const color = BAND_COLORS[bandType] || '#888';
  const shape = BAND_SHAPES[bandType] || DEFAULT_BAND_SHAPES[bandType];
  const s = clamp(shape?.size ?? 24, 12, 48);
  const sym = (shape?.symbol || 'circle');
  const html = markerSvg(sym, s, color);
  return L.divIcon({
    className: '',
    html,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2]
  });
}

  // Track current CSV base name for Save As defaults
  let currentCsvBaseName = 'bands';

  // Utilities
  function to6(hex) {
    const h = (hex || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(h)) return h;
    if (/^#[0-9a-f]{3}$/i.test(h)) return '#' + h[1]+h[1] + h[2]+h[2] + h[3]+h[3];
    return '#888888';
  }
  function hexToRgb(hex) {
    const h = to6(hex).slice(1);
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    return { r, g, b };
  }
  function pickTextColor(bgHex) {
    const { r, g, b } = hexToRgb(bgHex);
    const yiq = (r*299 + g*587 + b*114) / 1000;
    return yiq >= 150 ? '#111' : '#fff';
  }
  function todayStamp() {
    const d = new Date();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }
  function baseName(path) {
    if (!path) return '';
    const name = path.split(/[\\/]/).pop();
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0,i) : name;
  }

  function updateFilterLabelColors() {
    const root = document.documentElement;
    root.style.setProperty('--ring-color',   BAND_COLORS.ring   || '#1976d2');
    root.style.setProperty('--stripe-color', BAND_COLORS.stripe || '#f57c00');
    root.style.setProperty('--both-color',   BAND_COLORS.both   || '#8e24aa');
    root.style.setProperty('--none-color',   BAND_COLORS.none   || '#888888');

    const pairs = [
      { el: document.getElementById('lbl-ring'),   color: BAND_COLORS.ring   || '#1976d2' },
      { el: document.getElementById('lbl-stripe'), color: BAND_COLORS.stripe || '#f57c00' },
      { el: document.getElementById('lbl-both'),   color: BAND_COLORS.both   || '#8e24aa' },
      { el: document.getElementById('lbl-none'),   color: BAND_COLORS.none   || '#888888' },
    ];
    for (const p of pairs) {
      if (!p.el) continue;
      const bg = to6(p.color);
      p.el.style.backgroundColor = bg;
      p.el.style.color = pickTextColor(bg);
      p.el.style.borderColor = 'rgba(0,0,0,0.15)';
    }
  }
  updateFilterLabelColors();

  // Persisted colors
  try {
    const saved = JSON.parse(localStorage.getItem('bandColors'));
    if (saved && typeof saved === 'object') Object.assign(BAND_COLORS, saved);
  } catch (_) {}
  function saveBandColors() {
    try { localStorage.setItem('bandColors', JSON.stringify(BAND_COLORS)); } catch (_) {}
  }
  // === UPDATE applyBandColorsAndRefresh to also apply shapes ===
  function applyBandColorsAndRefresh() {
    if (Array.isArray(markersData)) {
      for (const md of markersData) {
        if (!md || !md.marker) continue;
        md.marker.setIcon(buildMarkerIcon(md.band_type));
      }
    }
    if (typeof refreshAfterDataChange === 'function') {
      refreshAfterDataChange();
    } else if (typeof addMarkersAndShading === 'function') {
      addMarkersAndShading();
    }
    updateFilterLabelColors();
  }
  function colorForShadedCell(hasRing, hasStripe) {
    if (hasRing && hasStripe) return BAND_COLORS.both || '#8b5cf6';
    if (hasRing) return BAND_COLORS.ring || '#3b82f6';
    if (hasStripe) return BAND_COLORS.stripe || '#f59e0b';
    return BAND_COLORS.none || '#888';
  }

  // ===== Settings menu wiring =====
  const settingsMenu = document.getElementById('settingsMenu');
  const settingsColors = document.getElementById('settingsColors');
  const settingsShapes = document.getElementById('settingsShapes');
  const settingsProjections = document.getElementById('settingsProjections');
  const settingsDialog = document.getElementById('settingsDialog');
  const settingsClose = document.getElementById('settingsClose');
  const settingsSave = document.getElementById('settingsSave');
  const settingsCancel = document.getElementById('settingsCancel');
  const colorStripe = document.getElementById('colorStripe');
  const colorRing = document.getElementById('colorRing');
  const colorBoth = document.getElementById('colorBoth');
  const restoreDefaultsBtn = document.getElementById('restoreDefaultsBtn');
// ==== Shapes dialog wiring 
const shapesDialog = document.getElementById('shapesDialog');
const shapesClose = document.getElementById('shapesClose');
const shapesSave = document.getElementById('shapesSave');
const shapesCancel = document.getElementById('shapesCancel');
const shapesRestoreDefaultsBtn = document.getElementById('shapesRestoreDefaultsBtn');

const shapeStripe = document.getElementById('shapeStripe');
const shapeRing   = document.getElementById('shapeRing');
const shapeBoth   = document.getElementById('shapeBoth');
const shapeNone   = document.getElementById('shapeNone');

const sizeStripe = document.getElementById('sizeStripe');
const sizeRing   = document.getElementById('sizeRing');
const sizeBoth   = document.getElementById('sizeBoth');
const sizeNone   = document.getElementById('sizeNone');

const previewStripe = document.getElementById('previewStripe');
const previewRing   = document.getElementById('previewRing');
const previewBoth   = document.getElementById('previewBoth');
const previewNone   = document.getElementById('previewNone');

function drawPreview(el, band) {
  if (!el) return;
  el.innerHTML = markerSvg(BAND_SHAPES[band].symbol, 28, BAND_COLORS[band]);
}

function openShapes() {
  if (!shapesDialog) return;
  // Prefill current values
  if (shapeStripe) shapeStripe.value = BAND_SHAPES.stripe.symbol;
  if (shapeRing)   shapeRing.value   = BAND_SHAPES.ring.symbol;
  if (shapeBoth)   shapeBoth.value   = BAND_SHAPES.both.symbol;
  if (shapeNone)   shapeNone.value   = BAND_SHAPES.none.symbol;

  if (sizeStripe) sizeStripe.value = BAND_SHAPES.stripe.size;
  if (sizeRing)   sizeRing.value   = BAND_SHAPES.ring.size;
  if (sizeBoth)   sizeBoth.value   = BAND_SHAPES.both.size;
  if (sizeNone)   sizeNone.value   = BAND_SHAPES.none.size;

  // Previews
  drawPreview(previewStripe, 'stripe');
  drawPreview(previewRing,   'ring');
  drawPreview(previewBoth,   'both');
  drawPreview(previewNone,   'none');

  shapesDialog.classList.add('active');
  shapesDialog.style.display = 'flex';
}
function closeShapes() {
  if (!shapesDialog) return;
  shapesDialog.classList.remove('active');
  shapesDialog.style.display = 'none';
}

// Open Shapes dialog from Settings menu (REPLACES the old "coming soon…" handler)
if (settingsShapes) {
  settingsShapes.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settingsMenu) settingsMenu.style.display = 'none';
    openShapes();
  });
}

// Close buttons and background click
if (shapesClose)  shapesClose.addEventListener('click', closeShapes);
if (shapesCancel) shapesCancel.addEventListener('click', closeShapes);
if (shapesDialog) {
  shapesDialog.addEventListener('click', (e) => {
    if (e.target === shapesDialog) closeShapes();
  });
}

// Save shapes
if (shapesSave) {
  shapesSave.addEventListener('click', () => {
    function readPair(shapeEl, sizeEl, fallbackSymbol) {
      const symbol = (shapeEl?.value || fallbackSymbol || 'circle').toLowerCase();
      const size = clamp(parseInt(sizeEl?.value, 10) || 24, 12, 48);
      return { symbol, size };
    }
    BAND_SHAPES.stripe = readPair(shapeStripe, sizeStripe, BAND_SHAPES.stripe.symbol);
    BAND_SHAPES.ring   = readPair(shapeRing,   sizeRing,   BAND_SHAPES.ring.symbol);
    BAND_SHAPES.both   = readPair(shapeBoth,   sizeBoth,   BAND_SHAPES.both.symbol);
    BAND_SHAPES.none   = readPair(shapeNone,   sizeNone,   BAND_SHAPES.none.symbol);

    saveBandShapes();
    applyBandColorsAndRefresh(); // re-render markers with new shapes/sizes
    closeShapes();
  });
}

// Restore default shapes (apply immediately, like the Colors restore)
if (shapesRestoreDefaultsBtn) {
  shapesRestoreDefaultsBtn.addEventListener('click', () => {
    for (const k of ['ring','stripe','both','none']) {
      BAND_SHAPES[k].symbol = DEFAULT_BAND_SHAPES[k].symbol;
      BAND_SHAPES[k].size   = DEFAULT_BAND_SHAPES[k].size;
    }

    // Update inputs and previews while dialog is open
    if (shapeStripe) shapeStripe.value = BAND_SHAPES.stripe.symbol;
    if (shapeRing)   shapeRing.value   = BAND_SHAPES.ring.symbol;
    if (shapeBoth)   shapeBoth.value   = BAND_SHAPES.both.symbol;
    if (shapeNone)   shapeNone.value   = BAND_SHAPES.none.symbol;

    if (sizeStripe) sizeStripe.value = BAND_SHAPES.stripe.size;
    if (sizeRing)   sizeRing.value   = BAND_SHAPES.ring.size;
    if (sizeBoth)   sizeBoth.value   = BAND_SHAPES.both.size;
    if (sizeNone)   sizeNone.value   = BAND_SHAPES.none.size;

    drawPreview(previewStripe, 'stripe');
    drawPreview(previewRing,   'ring');
    drawPreview(previewBoth,   'both');
    drawPreview(previewNone,   'none');

    saveBandShapes();
    applyBandColorsAndRefresh();
  });
}

// Live previews inside the dialog
function hookPreview(selectEl, sizeEl, previewEl, band) {
  function refresh() {
    const sym = (selectEl?.value || BAND_SHAPES[band].symbol);
    const sz = clamp(parseInt(sizeEl?.value, 10) || BAND_SHAPES[band].size, 12, 48);
    if (previewEl) previewEl.innerHTML = markerSvg(sym, 28, BAND_COLORS[band]);
  }
  selectEl?.addEventListener('change', refresh);
  sizeEl?.addEventListener('input', refresh);
}
hookPreview(shapeStripe, sizeStripe, previewStripe, 'stripe');
hookPreview(shapeRing,   sizeRing,   previewRing,   'ring');
hookPreview(shapeBoth,   sizeBoth,   previewBoth,   'both');
hookPreview(shapeNone,   sizeNone,   previewNone,   'none');

// Close on Escape as well (augment your existing Escape handler)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && shapesDialog?.classList.contains('active')) closeShapes();
});
  function toHex(val) {
    const v = (val || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + v[1]+v[1] + v[2]+v[2] + v[3]+v[3];
    return '#000000';
  }
  function openSettings() {
    if (colorStripe) colorStripe.value = toHex(BAND_COLORS.stripe || '#f59e0b');
    if (colorRing)   colorRing.value   = toHex(BAND_COLORS.ring   || '#3b82f6');
    if (colorBoth)   colorBoth.value   = toHex(BAND_COLORS.both   || '#8b5cf6');
    if (settingsDialog) settingsDialog.classList.add('active');
  }
  function closeSettings() {
    if (settingsDialog) settingsDialog.classList.remove('active');
  }

  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!settingsMenu) return;
      const isOpen = settingsMenu.style.display === 'block';
      settingsMenu.style.display = isOpen ? 'none' : 'block';
    });
  }
  document.addEventListener('click', (e) => {
    if (settingsMenu && e.target !== settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
      settingsMenu.style.display = 'none';
    }
    if (saveAsMenu && e.target !== saveAsMenu && !saveAsMenu.contains(e.target) && e.target !== saveAsBtn) {
      saveAsMenu.style.display = 'none';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsMenu && settingsMenu.style.display === 'block') settingsMenu.style.display = 'none';
      if (settingsDialog && settingsDialog.classList.contains('active')) closeSettings();
      closeCsvModal();
      closePicModal();
    }
  });
  if (settingsColors) settingsColors.addEventListener('click', (e) => { e.stopPropagation(); settingsMenu.style.display = 'none'; openSettings(); });
  if (settingsProjections) settingsProjections.addEventListener('click', (e) => { e.stopPropagation(); settingsMenu.style.display = 'none'; setStatus?.('Projections settings coming soon…'); });
  if (settingsClose) settingsClose.addEventListener('click', closeSettings);
  if (settingsCancel) settingsCancel.addEventListener('click', closeSettings);
  if (settingsSave) settingsSave.addEventListener('click', () => {
    if (colorStripe && colorStripe.value) BAND_COLORS.stripe = colorStripe.value;
    if (colorRing && colorRing.value)     BAND_COLORS.ring   = colorRing.value;
    if (colorBoth && colorBoth.value)     BAND_COLORS.both   = colorBoth.value;
    saveBandColors?.();
    applyBandColorsAndRefresh?.();
    closeSettings();
  });
  if (restoreDefaultsBtn) {
    restoreDefaultsBtn.addEventListener('click', () => {
      BAND_COLORS.ring = DEFAULT_BAND_COLORS.ring;
      BAND_COLORS.stripe = DEFAULT_BAND_COLORS.stripe;
      BAND_COLORS.both = DEFAULT_BAND_COLORS.both;
      if (colorRing) colorRing.value = DEFAULT_BAND_COLORS.ring;
      if (colorStripe) colorStripe.value = DEFAULT_BAND_COLORS.stripe;
      if (colorBoth) colorBoth.value = DEFAULT_BAND_COLORS.both;
      saveBandColors();
      applyBandColorsAndRefresh();
    });
  }

  // Floating header toggle
  const floatingHeader = document.getElementById('floatingHeader');
  const floatingTitleBtn = document.getElementById('floatingTitle');
  const headerBody = document.getElementById('headerBody');
  function setHeaderExpanded(expanded) {
    if (!floatingHeader || !floatingTitleBtn || !headerBody) return;
    floatingHeader.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    floatingTitleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    headerBody.hidden = !expanded;
  }
  if (floatingTitleBtn) {
    floatingTitleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = floatingHeader?.getAttribute('aria-expanded') === 'true';
      setHeaderExpanded(!expanded);
    });
  }
  document.addEventListener('click', (e) => {
    if (!floatingHeader) return;
    if (floatingHeader.contains(e.target)) return;
    setHeaderExpanded(false);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setHeaderExpanded(false); });
  setHeaderExpanded(false);

  // Help Modal
  if (helpBtn && helpModal && helpClose) {
    helpBtn.addEventListener('click', () => { helpModal.classList.add('active'); });
    helpClose.addEventListener('click', () => { helpModal.classList.remove('active'); });
    helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.remove('active'); });
  }

  // --- Data Storage ---
  let markerGroup = null, shadeGroup = null, labelOverlayGroup = null, leaderLineGroup = null;
  let markersData = [], normalizedCSV = '';
  let legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
  let shadedLatBands = new Set(), shadedLonBands = new Set();

  function setStatus(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status'; } }
  function setError(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status error'; } }

  function updateCheckboxWarning() {
    const anyChecked = checkboxes.some(cb => cb && cb.checked);
    if (allUncheckedWarn) allUncheckedWarn.style.display = anyChecked ? 'none' : 'inline';
  }
  checkboxes.forEach(cb => cb && cb.addEventListener('change', updateCheckboxWarning));
  updateCheckboxWarning();

  function updateBandCountsInFilters() {
    if (lblRing) lblRing.textContent = `Ring (${legendCounts.ring || 0})`;
    if (lblStripe) lblStripe.textContent = `Stripe (${legendCounts.stripe || 0})`;
    if (lblBoth) lblBoth.textContent = `Both (${legendCounts.both || 0})`;
    if (lblNone) lblNone.textContent = `None (${legendCounts.none || 0})`;
    updateFilterLabelColors();
  }
  function updateShadedInfo() {
    const ringsVisited = shadedLatBands.size;
    const stripesVisited = shadedLonBands.size;
    const ringPct = ((ringsVisited / RING_BAND_COUNT) * 100).toFixed(1);
    const stripePct = ((stripesVisited / STRIPE_BAND_COUNT) * 100).toFixed(1);
    if (shadedInfo) {
      shadedInfo.innerHTML =
        `Rings: <b>${ringsVisited}</b>/${RING_BAND_COUNT} (${ringPct}%)<br>` +
        `Stripes: <b>${stripesVisited}</b>/${STRIPE_BAND_COUNT} (${stripePct}%)`;
    }
  }

  // --- Band Type Normalization ---
  function normBandType(s) {
    if (!s) return 'both';
    s = String(s).trim().toLowerCase();
    if (s === 'ring') return 'ring';
    if (s === 'stripe') return 'stripe';
    if (s === 'both') return 'both';
    if (s === 'none') return 'none';
    if (s === 'rs' || s === 'sr') return 'both';
    if (s.startsWith('n')) return 'none';
    if (s.startsWith('b')) return 'both';
    if (s.startsWith('s')) return 'stripe';
    if (s.startsWith('r')) return 'ring';
    if (s.includes('stripe')) return 'stripe';
    if (s.includes('ring')) return 'ring';
    const hasR = s.includes('r'), hasS = s.includes('s');
    if (hasR && hasS) return 'both';
    if (hasR) return 'ring';
    if (hasS) return 'stripe';
    return 'both';
  }
  function normLon(lon) {
    let L = +lon;
    while (L < -180) L += 360;
    while (L >= 180) L -= 360;
    return L;
  }

  // --- Filtering, clearing, and CSV download ---
  function filterMarkers() {
    if (!markerGroup) {
      markerGroup = L.layerGroup();
      map.addLayer(markerGroup);
    }
    const showTypes = [];
    if (checkboxes[0] && checkboxes[0].checked) showTypes.push('ring');
    if (checkboxes[1] && checkboxes[1].checked) showTypes.push('stripe');
    if (checkboxes[2] && checkboxes[2].checked) showTypes.push('both');
    if (checkboxes[3] && checkboxes[3].checked) showTypes.push('none');

    markerGroup.clearLayers();
    for (const m of markersData) {
      if (showTypes.includes(m.band_type)) markerGroup.addLayer(m.marker);
    }
    updateLabelOverlay();
    updateCheckboxWarning();
  }
  checkboxes.forEach(cb => cb && cb.addEventListener('change', filterMarkers));

  function clearAll() {
    if (markerGroup) markerGroup.clearLayers();
    if (shadeGroup) shadeGroup.clearLayers();
    if (labelOverlayGroup) labelOverlayGroup.clearLayers();
    if (leaderLineGroup) leaderLineGroup.clearLayers();
    if (skipReport) skipReport.textContent = '';
    legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
    shadedLatBands = new Set();
    shadedLonBands = new Set();
    updateBandCountsInFilters();
    updateShadedInfo();
    normalizedCSV = '';
    markersData = [];
  }
  if (clearBtn) clearBtn.addEventListener('click', clearAll);

  // CSV load (and remember base name)
  const csvInput = document.getElementById('csvInput');
  if (csvInput) csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a valid CSV file.');
      csvInput.value = '';
      return;
    }
    if (file) {
      currentCsvBaseName = baseName(file.name) || 'bands';
      handleCSVFile(file);
    }
  });

  mapDiv.addEventListener('dragover', function (e) {
    e.preventDefault();
    mapDiv.classList.add('drag');
  });
  mapDiv.addEventListener('dragleave', function (e) {
    e.preventDefault();
    mapDiv.classList.remove('drag');
  });
  mapDiv.addEventListener('drop', function (e) {
    e.preventDefault();
    mapDiv.classList.remove('drag');
    const file = e.dataTransfer.files[0];
    if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a valid CSV file.');
      return;
    }
    if (file) {
      currentCsvBaseName = baseName(file.name) || 'bands';
      handleCSVFile(file);
    }
  });

  function handleCSVFile(file) {
    if (typeof Papa === "undefined") {
      setError("Papa Parse library not loaded.");
      return;
    }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => processCSVRows(results.data, results.meta.fields)
    });
  }

  // Example Button
  if (exampleBtn) {
    exampleBtn.addEventListener('click', () => {
      if (csvInput) csvInput.value = '';
      currentCsvBaseName = 'example';
      setStatus('Loaded example data.');
      Papa.parse(EMBEDDED_SAMPLE_CSV, {
        header: true,
        skipEmptyLines: true,
        complete: r => processCSVRows(r.data, r.meta.fields)
      });
    });
  }

  function buildHeaderMap(fields) {
    const headerMap = new Map();
    (fields || []).forEach(f => {
      if (f == null) return;
      headerMap.set(String(f).trim().toLowerCase(), f);
    });
    return headerMap;
  }
  function resolveKey(headerMap, ...candidates) {
    for (const name of candidates) {
      const key = String(name).trim().toLowerCase();
      if (headerMap.has(key)) return headerMap.get(key);
    }
    return null;
  }
  function escapeHTML(value) {
    const s = value == null ? '' : String(value);
    return s.replace(/[&<>"']/g, ch => (
      ch === '&' ? '&amp;' :
      ch === '<' ? '&lt;'  :
      ch === '>' ? '&gt;'  :
      ch === '"' ? '&quot;': '&apos;'
    ));
  }

// A band_type is "valid" only if the raw string explicitly matches one of these (case-insensitive).
function isValidBandRaw(raw) {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'ring' || s === 'stripe' || s === 'both' || s === 'none';
}

// Parse a date string; return {ts, raw} or null if invalid.
// We keep the original raw string of the earliest valid date to preserve the user's format.
function parseValidDate(raw) {
  if (raw == null) return null;
  const original = String(raw).trim();
  if (!original) return null;

  // Helper: construct a UTC timestamp with basic range guarding
  function ymdToTs(y, m = 1, d = 1, H = 0, M = 0, S = 0, ms = 0) {
    m = Math.max(1, Math.min(12, +m || 1));
    d = Math.max(1, Math.min(31, +d || 1)); // simple day guard; good enough for ordering
    H = Math.max(0, Math.min(23, +H || 0));
    M = Math.max(0, Math.min(59, +M || 0));
    S = Math.max(0, Math.min(59, +S || 0));
    ms = Math.max(0, Math.min(999, +ms || 0));
    const t = Date.UTC(+y, m - 1, d, H, M, S, ms);
    return Number.isNaN(t) ? null : t;
  }

  // 1) Support "YYYY[-MM[-DD]] (BCE|BC)" (case-insensitive, optional dots, flexible separators)
  //    Examples: "44-03-15 BCE", "44 BCE", "44/3/15 bc", "44.03.15 B.C."
  const noDots = original.replace(/\./g, '');
  const mBCE = noDots.match(/^\s*(\d{1,6})(?:[^\d]+(\d{1,2})(?:[^\d]+(\d{1,2}))?)?\s*(BCE|BC)\s*$/i);
  if (mBCE) {
    const year = parseInt(mBCE[1], 10);
    const month = mBCE[2] ? parseInt(mBCE[2], 10) : 1;
    const day = mBCE[3] ? parseInt(mBCE[3], 10) : 1;
    // Astronomical year numbering: 1 BCE => 0, 2 BCE => -1, N BCE => 1-N
    const astroYear = 1 - year;
    const ts = ymdToTs(astroYear, month, day);
    if (ts != null) return { ts, raw: original };
    return null;
  }

  // 2) Support signed astronomical ISO years (including 0000 and negatives)
  //    Forms:
  //      ±YYYY
  //      ±YYYY-MM
  //      ±YYYY-MM-DD
  //      ±YYYY-MM-DD[ T]HH:mm[:ss[.SSS]][Z|±HH:mm]
  const mSigned = original.match(/^\s*([+\-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+\-]\d{2}:?\d{2})?)?\s*$/);
  if (mSigned) {
    const y = parseInt(mSigned[1], 10);
    const hasTime = mSigned[4] != null;
    if (!hasTime) {
      // Date-only → treat as UTC midnight
      const ts = ymdToTs(y, mSigned[2] || 1, mSigned[3] || 1);
      if (ts != null) return { ts, raw: original };
      return null;
    } else {
      const mm = parseInt(mSigned[2] || '01', 10);
      const dd = parseInt(mSigned[3] || '01', 10);
      const HH = parseInt(mSigned[4] || '00', 10);
      const MM = parseInt(mSigned[5] || '00', 10);
      const SS = parseInt(mSigned[6] || '00', 10);
      const MS = parseInt(mSigned[7] || '0', 10);
      const tz = mSigned[8]; // Z or ±HH:mm or ±HHmm
      let ts = ymdToTs(y, mm, dd, HH, MM, SS, MS);
      if (ts == null) return null;
      // Adjust for timezone (string expresses local wall time with an offset; convert to UTC)
      if (tz && tz.toUpperCase() !== 'Z') {
        const mTz = tz.match(/^([+\-])(\d{2}):?(\d{2})$/);
        if (mTz) {
          const sign = mTz[1] === '-' ? -1 : 1;
          const offMin = sign * (parseInt(mTz[2], 10) * 60 + parseInt(mTz[3], 10));
          ts -= offMin * 60000;
        }
      }
      return { ts, raw: original };
    }
  }

  // 3) Fall back to native parsing for common CE/AD dates
  const t = Date.parse(original);
  if (!Number.isNaN(t)) return { ts: t, raw: original };

  return null;
}

// Decide the band_type for a Set following your rules.
// rowsInSet is an array of { bandRaw, bandNorm } for the rows in the group.
// It uses dates from rows with blank band_type to claim missing sides.
// You can flip CLAIM_BOTH_ON_FIRST_BLANK to false if you ever want a one-side-first policy.

function selectBandTypeForSet(rowsInSet, options = {}) {
  const CLAIM_BOTH_ON_FIRST_BLANK = options.claimBothOnFirstBlank !== false; // default: true
  const BLANK_FIRST_PRIORITY = options.blankClaimPriority || 'stripe-first'; // only used if CLAIM_BOTH_ON_FIRST_BLANK=false

  // Collect explicit valid band_type values (ring|stripe|both|none)
  const explicit = [];
  for (const r of rowsInSet) {
    if (isValidBandRaw(r.bandRaw)) explicit.push(String(r.bandRaw).trim().toLowerCase());
  }

  let claimStripe = false;
  let claimRing = false;

  // Seed claims from explicit values
  for (const t of explicit) {
    if (t === 'both') { claimStripe = true; claimRing = true; }
    else if (t === 'stripe') { claimStripe = true; }
    else if (t === 'ring') { claimRing = true; }
    // 'none' is neutral — no claims
  }

  // If already both, we’re done
  if (claimStripe && claimRing) return 'both';

  // Rows with blank/invalid band_type but a valid date (ascending by date)
  const blanksWithDates = rowsInSet
    .filter(r => !isValidBandRaw(r.bandRaw) && typeof r.dateTs === 'number' && !Number.isNaN(r.dateTs))
    .sort((a, b) => a.dateTs - b.dateTs);

  for (const _ of blanksWithDates) {
    if (claimStripe && claimRing) break;

    if (!claimStripe && !claimRing) {
      if (CLAIM_BOTH_ON_FIRST_BLANK) {
        claimStripe = true;
        claimRing = true;
        break;
      } else {
        if (BLANK_FIRST_PRIORITY === 'ring-first') claimRing = true;
        else claimStripe = true; // stripe-first default
      }
    } else if (!claimStripe) {
      claimStripe = true;
    } else if (!claimRing) {
      claimRing = true;
    }
  }

  if (claimStripe && claimRing) return 'both';
  if (claimStripe) return 'stripe';
  if (claimRing) return 'ring';

  // No claims possible: resolve to 'none'
  return 'none';
}

function resolveBandFromExplicit(validTypesArray) {
  // validTypesArray contains only explicit valid values: 'ring'|'stripe'|'both'|'none'
  const uniq = Array.from(new Set((validTypesArray || []).map(s => String(s).toLowerCase())));
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];

  // If exactly two and one is 'none', use the other
  if (uniq.length === 2 && uniq.includes('none')) {
    return uniq.find(t => t !== 'none') || 'none';
  }

  // If two or more among {stripe, ring, both} appear → 'both'
  const strong = new Set(uniq.filter(t => t === 'stripe' || t === 'ring' || t === 'both'));
  if (strong.size >= 2) return 'both';

  // Fallback
  return 'both';
}

// --- Processing CSV rows and building map overlays ---
function processCSVRows(rows, fields) {
  clearAll();

  const headerMap = buildHeaderMap(fields);
  const latKey     = resolveKey(headerMap, 'lat', 'latitude');
  const lonKey     = resolveKey(headerMap, 'lon', 'lng', 'long', 'longitude');
  const labelKey   = resolveKey(headerMap, 'label', 'name', 'title');
  const bandKey    = resolveKey(headerMap, 'band_type', 'band', 'type', 'stripe', 'ring');
  const dateKey    = resolveKey(headerMap, 'date');
  const commentKey = resolveKey(headerMap, 'comment', 'notes', 'note', 'description');

  if (!latKey || !lonKey || !labelKey) {
    setError('Missing required headers (lat, lon, label).');
    return;
  }

  // Recognized vs unknown columns (for reporting)
  const recognizedOriginalNames = new Set([latKey, lonKey, labelKey]);
  if (bandKey)    recognizedOriginalNames.add(bandKey);
  if (dateKey)    recognizedOriginalNames.add(dateKey);
  if (commentKey) recognizedOriginalNames.add(commentKey);
  const unknownColumns = (fields || [])
    .map(f => (f == null ? '' : String(f)))
    .filter(f => f && !recognizedOriginalNames.has(f));

  const skipRows = [];

  // First pass: group rows by Set: same GPS (with lon normalized) + same label (case-insensitive)
  const groups = new Map();

  for (let i = 0; i < rows.length; ++i) {
    const r = rows[i] || {};
    const lat = +r[latKey];
    const lon = +r[lonKey];
    const label = r[labelKey];

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skipRows.push({ row: i + 2, reason: 'Invalid or out-of-range lat/lon' });
      continue;
    }

    const lonNorm = normLon(lon);

    const bandRaw  = bandKey ? r[bandKey] : '';
    const bandNorm = normBandType(bandRaw);

    const dateRaw    = dateKey ? (r[dateKey] || '') : '';
    const parsedDate = parseValidDate(dateRaw);
    const commentVal = commentKey ? (r[commentKey] || '') : '';

    // We only keep canonical fields for popups; unknown columns are skipped
    const canonicalFirstRowFields = {
      lat,
      lon: lonNorm,
      label,
      band_type: bandNorm,
      date: dateRaw,
      comment: commentVal
    };

    const latKeyStr = lat.toFixed(6);
    const lonKeyStr = lonNorm.toFixed(6);
    const labelKeyStr = String(label ?? '').trim().toLowerCase();
    const key = `${latKeyStr}|${lonKeyStr}|${labelKeyStr}`;

    const item = {
      idx: i,
      lat, lonNorm, label,
      bandRaw, bandNorm,
      dateRaw, parsedDate, // parsedDate: {ts, raw} or null
      commentVal,
      firstRowCanonical: canonicalFirstRowFields
    };

    if (!groups.has(key)) {
      groups.set(key, {
        items: [item],
        lat, lonNorm, label,
        firstAllFields: canonicalFirstRowFields
      });
    } else {
      groups.get(key).items.push(item);
    }
  }

  // Second pass: compute per-group earliest date and collect explicit types
  const groupList = [];
  for (const [, g] of groups) {
    const items = g.items;

    // Earliest valid date (store both ts and raw of earliest)
    let earliest = null;
    for (const it of items) {
      if (it.parsedDate) {
        if (!earliest || it.parsedDate.ts < earliest.ts) earliest = { ts: it.parsedDate.ts, raw: it.parsedDate.raw };
      }
    }

    // Explicit valid band types in the Set
    const explicitTypes = [];
    for (const it of items) {
      if (isValidBandRaw(it.bandRaw)) explicitTypes.push(String(it.bandRaw).trim().toLowerCase());
    }

    // Merge comments (unique, non-empty)
    const comments = Array.from(new Set(items.map(it => (it.commentVal || '').toString().trim()).filter(Boolean)));
    const combinedComment = comments.join(' | ');

    // Precompute bins
    const lat = g.lat;
    const lonNorm = g.lonNorm;
    const latBin = Math.floor((lat + 90) / 10) * 10 - 90;
    const lonBin = Math.floor((lonNorm + 180) / 10) * 10 - 180;

    groupList.push({
      lat, lonNorm, label: g.label,
      latBin, lonBin,
      firstAllFields: g.firstAllFields,
      earliestTs: earliest ? earliest.ts : null,
      earliestRaw: earliest ? earliest.raw : '',
      explicitTypes,               // array of valid explicit band_types
      combinedComment
    });
  }

  // Build earliest-date indexes across ALL groups (for blank band_type inference)
  const earliestByStripe = new Map(); // key: lonBin -> ts
  const earliestByRing   = new Map(); // key: latBin -> ts

  function setMin(map, key, ts) {
    const cur = map.get(key);
    if (cur == null || ts < cur) map.set(key, ts);
  }

  for (const g of groupList) {
    if (typeof g.earliestTs === 'number' && !Number.isNaN(g.earliestTs)) {
      setMin(earliestByStripe, g.lonBin, g.earliestTs);
      setMin(earliestByRing,   g.latBin, g.earliestTs);
    }
  }

  // Third pass: decide final band_type for each group and build markers
  legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
  const csvRows = [];

  for (const g of groupList) {
    let bandType = null;

    // If there are any explicit valid types in the Set, resolve from those (old rules)
    const explicitResolved = resolveBandFromExplicit(g.explicitTypes);
    if (explicitResolved) {
      bandType = explicitResolved;
    } else {
      // No explicit valid types in this Set: apply your global-epoch rules
      if (g.earliestTs == null) {
        bandType = 'none';
      } else {
        const stripeMin = earliestByStripe.get(g.lonBin);
        const ringMin   = earliestByRing.get(g.latBin);

        if ((stripeMin != null && g.earliestTs === stripeMin) &&
            (ringMin   != null && g.earliestTs === ringMin)) {
          // Must be earliest in its stripe AND earliest in its ring to claim BOTH
          bandType = 'both';
        } else if (stripeMin != null && g.earliestTs === stripeMin) {
          bandType = 'stripe';
        } else if (ringMin != null && g.earliestTs === ringMin) {
          bandType = 'ring';
        } else {
          bandType = 'none';
        }
      }
    }

    // Build marker and popup
    const marker = makeMarker(g.lat, g.lonNorm, bandType, g.label);

    const allFields = { ...(g.firstAllFields || {}) };
    allFields.lat = g.lat;
    allFields.lon = g.lonNorm;
    allFields.label = g.label;
    allFields.band_type = bandType;
    allFields.date = g.earliestRaw || allFields.date || '';
    allFields.comment = g.combinedComment;
    allFields.lat_bin = g.latBin;
    allFields.lon_bin = g.lonBin;

    const rowsHtml = Object.keys(allFields).map(k => {
      return `<tr><th style="text-align:left; padding-right:8px; vertical-align:top;">${escapeHTML(k)}</th>` +
             `<td style="white-space:pre-wrap; max-width:260px;">${escapeHTML(allFields[k])}</td></tr>`;
    }).join('');
    const popupHtml = `<div style="font-size:13px; line-height:1.35;"><table>${rowsHtml}</table></div>`;
    marker.bindPopup(popupHtml, { maxWidth: 320, autoPan: true });

    markersData.push({
      marker,
      band_type: bandType,
      lat: g.lat,
      lon: g.lonNorm,
      label: g.label,
      date: allFields.date,
      comment: g.combinedComment,
      allFields
    });

    legendCounts[bandType] = (legendCounts[bandType] || 0) + 1;

    csvRows.push({
      lat: g.lat,
      lon: g.lonNorm,
      label: g.label,
      band_type: bandType,
      lat_bin: g.latBin,
      lon_bin: g.lonBin
    });
  }

  // Build normalized CSV with the combined rows only
  normalizedCSV = 'lat,lon,label,band_type,lat_bin,lon_bin\n' +
    csvRows.map(r => [r.lat, r.lon, `"${(r.label + '').replace(/\"/g, '""')}"`, r.band_type, r.lat_bin, r.lon_bin].join(',')).join('\n');

  // Report skipped rows and unknown columns (if any)
  if (skipReport) {
    const messages = [];
    if (skipRows.length) {
      messages.push(`Skipped ${skipRows.length} row(s): ` + skipRows.map(s => `row ${s.row} (${s.reason})`).join(', '));
    }
    if (unknownColumns.length) {
      messages.push(`Skipped columns: ${unknownColumns.join(', ')}`);
    }
    skipReport.textContent = messages.join('  ');
  }

  // Update counters and render
  updateBandCountsInFilters();

  if (markersData.length) {
    addMarkersAndShading();
    setStatus(`Loaded ${markersData.length} unique locations (combined from ${rows.length} rows).`);
  } else {
    setError('No valid rows found.');
  }
}

  function makeMarker(lat, lon, band, label) {
    return L.marker([lat, lon], {
      icon: buildMarkerIcon(band),
      title: label
    });
  }

  // Shading
  function addMarkersAndShading() {
    if (!markerGroup) {
      markerGroup = L.layerGroup();
      map.addLayer(markerGroup);
    }
    if (!shadeGroup) {
      shadeGroup = L.layerGroup();
      map.addLayer(shadeGroup);
    }
    shadeGroup.clearLayers();

    const showTypes = new Set();
    if (checkboxes[0]?.checked) showTypes.add('ring');
    if (checkboxes[1]?.checked) showTypes.add('stripe');
    if (checkboxes[2]?.checked) showTypes.add('both');
    if (checkboxes[3]?.checked) showTypes.add('none');

    shadedLatBands = new Set();
    shadedLonBands = new Set();
    for (const md of markersData) {
      if (!showTypes.has(md.band_type)) continue;
      const latBin = Math.floor((md.lat + 90) / 10) * 10 - 90;
      const lonBin = Math.floor((md.lon + 180) / 10) * 10 - 180;
      if (md.band_type === 'ring' || md.band_type === 'both') shadedLatBands.add(latBin);
      if (md.band_type === 'stripe' || md.band_type === 'both') shadedLonBands.add(lonBin);
    }

    for (let latBin = -90; latBin <= 80; latBin += 10) {
      for (let lonBin = -180; lonBin <= 170; lonBin += 10) {
        const hasRing = shadedLatBands.has(latBin);
        const hasStripe = shadedLonBands.has(lonBin);
        if (!hasRing && !hasStripe) continue;

        const fill = (typeof colorForShadedCell === 'function')
          ? colorForShadedCell(hasRing, hasStripe)
          : (hasRing && hasStripe) ? (BAND_COLORS.both || '#8b5cf6')
            : hasRing ? (BAND_COLORS.ring || '#3b82f6')
            : (BAND_COLORS.stripe || '#f59e0b');

        L.rectangle([[latBin, lonBin], [latBin + 10, lonBin + 10]], {
          pane: 'shadePane',
          renderer: shadeRenderer,   // use canvas renderer
          fillColor: fill,
          color: fill,
          fillOpacity: 0.10,
          weight: 0,
          interactive: false
        }).addTo(shadeGroup);
      }
    }

    updateShadedInfo();
    if (typeof filterMarkers === 'function') filterMarkers();
  }

  // Label overlay for marker titles (unchanged)
  function updateLabelOverlay() {
    if (!labelOverlayGroup) {
      labelOverlayGroup = L.layerGroup([], {pane: 'labelPane'});
      map.addLayer(labelOverlayGroup);
    }
    if (!leaderLineGroup) {
      leaderLineGroup = L.layerGroup([], {pane: 'leaderLinePane'});
      map.addLayer(leaderLineGroup);
    }
    labelOverlayGroup.clearLayers();
    leaderLineGroup.clearLayers();

    if (!markerGroup) return;

    let visibleMarkers = [];
    markerGroup.eachLayer(m => {
      if (map.getBounds().contains(m.getLatLng())) visibleMarkers.push(m);
    });

    // --- Improved label placement and leader lines ---
    // Compute label sizes
    let labelTexts = visibleMarkers.map(marker => {
      const markerData = markersData.find(md => md.marker === marker);
      return markerData && markerData.label ? markerData.label : '';
    });
    let labelSizes = labelTexts.map(txt => measureLabelSize(txt));

    // Compute best label positions and render labels/lines
    let bestLabelPositions = findBestLabelPositions(visibleMarkers, labelSizes);
    let labelRects = [];
    for (let i = 0; i < visibleMarkers.length; ++i) {
      const marker = visibleMarkers[i];
      const labelText = labelTexts[i];
      if (!labelText) continue;
      const labelSize = labelSizes[i];
      const labelPos = bestLabelPositions[i];
      if (!labelPos) continue;
      const markerPt = map.latLngToContainerPoint(marker.getLatLng());
      const labelRect = { x: labelPos.x, y: labelPos.y, w: labelSize.w, h: labelSize.h, markerPt };
      labelRects.push(labelRect);

      const labelLatLng = map.containerPointToLatLng([labelPos.x + labelSize.w/2, labelPos.y + labelSize.h/2]);
      const labelDiv = L.divIcon({
        html: `<div class=\"marker-nonoverlap-label\">${labelText}</div>`,
        className: '',
        iconSize: [labelSize.w, labelSize.h],
        iconAnchor: [labelSize.w/2, labelSize.h/2],
        pane: 'labelPane'
      });
      let labelMarker = L.marker(labelLatLng, {icon: labelDiv, keyboard: false, interactive: false, pane: 'labelPane'});
      labelOverlayGroup.addLayer(labelMarker);

      // Leader line (curved)
      let labelCenterPx = [labelRect.x + labelSize.w/2, labelRect.y + labelSize.h/2];
      let markerPx = [labelRect.markerPt.x, labelRect.markerPt.y];
      let dist = Math.hypot(labelCenterPx[0] - markerPx[0], labelCenterPx[1] - markerPx[1]);
      if (dist > 25) {
        const start = markerPx;
        const end = labelCenterPx;
        // Quadratic Bézier control point: offset perpendicular to the line for a gentle curve
        const mx = (start[0] + end[0]) / 2;
        const my = (start[1] + end[1]) / 2;
        const dx = end[0] - start[0], dy = end[1] - start[1];
        const norm = Math.hypot(dx, dy);
        const perp = norm > 0 ? [-(dy/norm)*30, (dx/norm)*30] : [0,0];
        const cx = mx + perp[0], cy = my + perp[1];
        // Build a full-map SVG overlay so the line stays stable on pan/zoom
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${start[0]} ${start[1]} Q ${cx} ${cy} ${end[0]} ${end[1]}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'black');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-opacity', '0.90');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
        const mapSize = map.getSize();
        const leaderLine = L.marker([0, 0], {
          icon: L.divIcon({ html: svg.outerHTML, className: '', iconSize: [mapSize.x, mapSize.y], iconAnchor: [0, 0] }),
          keyboard: false, interactive: false, pane: 'leaderLinePane'
        }).setLatLng(map.containerPointToLatLng([0, 0]));
        leaderLineGroup.addLayer(leaderLine);
      }
    }
  } // <-- Close updateLabelOverlay

    // Helper: Check if two line segments intersect
    function linesIntersectArr(a, b, c, d) {
      function ccw(p1, p2, p3) {
        return (p3[1]-p1[1])*(p2[0]-p1[0]) > (p2[1]-p1[1])*(p3[0]-p1[0]);
      }
      return (ccw(a,c,d) !== ccw(b,c,d)) && (ccw(a,b,c) !== ccw(a,b,d));
    }
    // Helper: Check if a line segment crosses a rectangle
    function lineSegIntersectsRect(p1, p2, rect) {
      let rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
      let corners = [
        [rx, ry], [rx+rw, ry], [rx+rw, ry+rh], [rx, ry+rh]
      ];
      for (let i = 0; i < 4; ++i) {
        let q1 = corners[i], q2 = corners[(i+1)%4];
        if (linesIntersectArr(p1, p2, q1, q2)) return true;
      }
      // Also check if segment is fully inside rect
      if (p1[0] >= rx && p1[0] <= rx+rw && p1[1] >= ry && p1[1] <= ry+rh &&
          p2[0] >= rx && p2[0] <= rx+rw && p2[1] >= ry && p2[1] <= ry+rh) return true;
      return false;
    }
    // Greedy global assignment
    function findBestLabelPositions(markerList, labelSizes) {
      // Generate candidates for each marker
      const mapSize = map.getSize();
      const allMarkerRects = markerList.map(marker => {
        const pt = map.latLngToContainerPoint(marker.getLatLng());
        return {x: pt.x, y: pt.y, r: 12};
      });
      // Expose for candidate function
      window._allMarkerRects = allMarkerRects;
      let allCandidates = markerList.map((marker, i) => {
        window._myMarkerIdx = i;
        return generateLabelCandidates(marker, labelSizes[i], map, mapSize);
      });
      delete window._allMarkerRects;
      delete window._myMarkerIdx;
      let assigned = Array(markerList.length).fill(null);
      let occupiedRects = [];
      for (let i = 0; i < markerList.length; ++i) {
        let best = null, bestScore = Infinity;
        for (const pos of allCandidates[i]) {
          let rect = {x: pos.x, y: pos.y, w: labelSizes[i].w, h: labelSizes[i].h};
          // Overlap penalty
          let overlap = 0;
          for (const o of occupiedRects) if (!(rect.x+rect.w<=o.x||o.x+o.w<=rect.x||rect.y+rect.h<=o.y||o.y+o.h<=rect.y)) overlap += 1000;
          // Leader line crossing penalty
          let crossings = 0;
          let labelCenterPx = [rect.x + rect.w/2, rect.y + rect.h/2];
          let markerPx = map.latLngToContainerPoint(markerList[i].getLatLng());
          for (let j = 0; j < occupiedRects.length; ++j) {
            let other = occupiedRects[j];
            let otherCenter = [other.x + other.w/2, other.y + other.h/2];
            let otherMarkerPx = map.latLngToContainerPoint(markerList[j].getLatLng());
            if (linesIntersectArr([markerPx.x, markerPx.y], labelCenterPx, [otherMarkerPx.x, otherMarkerPx.y], otherCenter)) crossings += 100;
            if (lineSegIntersectsRect([markerPx.x, markerPx.y], labelCenterPx, other)) crossings += 100;
          }
          let score = overlap + crossings;
          if (score < bestScore) { bestScore = score; best = pos; }
       
        }
        assigned[i] = best;
        occupiedRects.push({x: best.x, y: best.y, w: labelSizes[i].w, h: labelSizes[i].h});
      }
        return assigned;
      }
    } // <-- Add this closing brace to end the DOMContentLoaded handler
  );

// Utility: Measure the pixel size of a label string
function measureLabelSize(text) {
  // Create a hidden span for measurement
  const span = document.createElement('span');
  span.style.visibility = 'hidden';
  span.style.position = 'absolute';
  span.style.whiteSpace = 'nowrap';
  span.style.font = '16px Arial, sans-serif'; // Match your label font if different
  span.innerText = text;
  document.body.appendChild(span);
  const rect = span.getBoundingClientRect();
  document.body.removeChild(span);
  return { w: Math.ceil(rect.width) + 8, h: Math.ceil(rect.height) + 4 };
}

// For each marker, generate candidate label positions

    // ...existing code...

    // For each marker, generate candidate label positions
    function generateLabelCandidates(marker, size, map, mapSize) {
      const center = map.latLngToContainerPoint(marker.getLatLng());
      let candidates = [];
      let tryPos = [
        {dx: 18, dy: -size.h/2},
        {dx: -size.w-10, dy: -size.h/2},
        {dx: -size.w/2, dy: -size.h-10},
        {dx: -size.w/2, dy: 18},
      ];
      // Get all marker rects for overlap check
      const allMarkerRects = window._allMarkerRects || [];
      const myMarkerIdx = window._myMarkerIdx;
      function overlapsAnyMarker(x, y) {
        const rect = {x, y, w: size.w, h: size.h};
        for (let i = 0; i < allMarkerRects.length; ++i) {
          if (i === myMarkerIdx) continue;
          const m = allMarkerRects[i];
          const cx = m.x, cy = m.y, r = m.r;
          let closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
          let closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
          let distSq = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);
          if (distSq < r * r) return true;
        }
        return false;
      }
      for (let t = 0; t < tryPos.length; ++t) {
        let x = center.x + tryPos[t].dx, y = center.y + tryPos[t].dy;
        if (x < 2 || (x+size.w) > (mapSize.x-2) || y < 2 || (y+size.h) > (mapSize.y-2)) continue;
        if (overlapsAnyMarker(x, y)) continue;
        candidates.push({x, y});
      }
      const radiusStep = 32;
      let maxRadius = Math.min(mapSize.x, mapSize.y) / 2;
      for (let r = radiusStep; r < maxRadius; r += radiusStep) {
        for (let a = 0; a < 2*Math.PI; a += Math.PI/6) {
          let x = center.x + r * Math.cos(a) - size.w/2;
          let y = center.y + r * Math.sin(a) - size.h/2;
          if (x < 2 || (x+size.w) > (mapSize.x-2) || y < 2 || (y+size.h) > (mapSize.y-2)) continue;
          if (overlapsAnyMarker(x, y)) continue;
          candidates.push({x, y});
        }
      }
      return candidates;
    }