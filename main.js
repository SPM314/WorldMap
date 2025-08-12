// --- Map Initialization ---
const map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution:'&copy; OpenStreetMap' }).addTo(map);

// Panes for layers
map.createPane('gridPane');  map.getPane('gridPane').style.zIndex = 350;
map.createPane('shadePane'); map.getPane('shadePane').style.zIndex = 365;

// --- 10° Grid Rendering ---
const gridStyle = { pane: 'gridPane', color: '#2b2b2b', weight: 1, opacity: 0.6, dashArray: '4,4' };
for (let lon = -180; lon <= 180; lon += 10) L.polyline([[-85, lon], [85, lon]], gridStyle).addTo(map);
for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], gridStyle).addTo(map);

// --- Constants for Bands ---
const BAND_COLORS = { ring: '#1976d2', stripe: '#f57c00', both: '#8e24aa', none: '#888' };
const BAND_NAMES = { ring: 'ring', stripe: 'stripe', both: 'both', none: 'none' };

// --- UI ELEMENTS ---
const legendEl = document.getElementById('legend');
const statusEl = document.getElementById('status');
const skipReport = document.getElementById('skipReport');
const csvInput = document.getElementById('csvInput');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const dropzone = document.getElementById('dropzone');

// --- Filter Checkboxes ---
const checkboxes = [
  document.getElementById('flt-ring'),
  document.getElementById('flt-stripe'),
  document.getElementById('flt-both'),
  document.getElementById('flt-none')
];
const allUncheckedWarn = document.getElementById('allUncheckedWarn');
function updateCheckboxWarning() {
  const anyChecked = checkboxes.some(cb => cb.checked);
  allUncheckedWarn.style.display = anyChecked ? 'none' : 'inline';
}
checkboxes.forEach(cb => cb.addEventListener('change', updateCheckboxWarning));
updateCheckboxWarning();

// --- Marker and Shading Groups ---
let markerGroup = null;
let clusterGroup = null;
let shadeGroup = null;
let markersData = [];
let normalizedCSV = '';
let legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };

// --- UTILITIES: Band Type Normalization ---
function normBandType(s) {
  if (!s) return 'both';
  if (s === 'rs' || s === 'sr') return 'both';
  if (s.startsWith('n')) return 'none';
  if (s.startsWith('b')) return 'both';
  if (s.startsWith('s')) return 'stripe';
  if (s.startsWith('r')) return 'ring';
  if (s.includes('stripe')) return 'stripe';
  if (s.includes('ring'))   return 'ring';
  const hasR = s.includes('r'), hasS = s.includes('s');
  if (hasR && hasS) return 'both';
  if (hasR) return 'ring';
  if (hasS) return 'stripe';
  return 'both';
}

// --- UTILITIES: Normalize Longitude (-180 to <180) ---
function normLon(lon) {
  let L = +lon;
  while (L < -180) L += 360;
  while (L >= 180) L -= 360;
  return L;
}

// --- SET STATUS/ERROR ---
function setStatus(msg) { statusEl.textContent = msg; statusEl.className = 'status'; }
function setError(msg) { statusEl.textContent = msg; statusEl.className = 'status error'; }

// --- LEGEND RENDERING ---
function renderLegend() {
  legendEl.innerHTML = '';
  for (const t of ['ring', 'stripe', 'both', 'none']) {
    legendEl.innerHTML += `<span class="legend-item"><span class="swatch" style="background:${BAND_COLORS[t]}"></span>${t} (${legendCounts[t] || 0})</span>`;
  }
}

// --- CHECKBOX FILTERING ---
function filterMarkers() {
  if (!clusterGroup) return;
  const showTypes = [];
  if (checkboxes[0].checked) showTypes.push('ring');
  if (checkboxes[1].checked) showTypes.push('stripe');
  if (checkboxes[2].checked) showTypes.push('both');
  if (checkboxes[3].checked) showTypes.push('none');
  clusterGroup.clearLayers();
  for (const m of markersData) {
    if (showTypes.includes(m.band_type)) clusterGroup.addLayer(m.marker);
  }
  updateCheckboxWarning();
}
checkboxes.forEach(cb => cb.addEventListener('change', filterMarkers));

// --- CLEAR MARKERS AND SHADING ---
function clearAll() {
  if (markerGroup) markerGroup.clearLayers();
  if (clusterGroup) clusterGroup.clearLayers();
  if (shadeGroup) shadeGroup.clearLayers();
  skipReport.textContent = '';
  legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
  renderLegend();
  downloadBtn.disabled = true;
  normalizedCSV = '';
  markersData = [];
}
clearBtn.addEventListener('click', clearAll);

// --- DOWNLOAD NORMALIZED CSV ---
downloadBtn.addEventListener('click', () => {
  if (!normalizedCSV) return;
  const blob = new Blob([normalizedCSV], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'normalized_bands.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
});

// --- CSV UPLOAD & PARSE ---
csvInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
    setError('Please upload a valid CSV file.');
    csvInput.value = '';
    return;
  }
  if (file) handleCSVFile(file);
});

dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag');
  const file = e.dataTransfer.files[0];
  if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
    setError('Please upload a valid CSV file.');
    return;
  }
  if (file) handleCSVFile(file);
});

function handleCSVFile(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: results => processCSVRows(results.data, results.meta.fields)
  });
}

function processCSVRows(rows, fields) {
  clearAll();
  let latKey = '', lonKey = '', labelKey = '', bandKey = '';
  for (const f of fields) {
    const n = f.trim().toLowerCase();
    if (!latKey && (n.startsWith('lat'))) latKey = f;
    else if (!lonKey && (n.startsWith('lon') || n === 'lng' || n === 'long')) lonKey = f;
    else if (!labelKey && (n.startsWith('label') || n === 'name')) labelKey = f;
    else if (!bandKey && (n.includes('band') || n.includes('stripe') || n.includes('ring') || n === 'type')) bandKey = f;
  }
  if (!latKey || !lonKey || !labelKey) {
    setError('Missing required headers (lat, lon, label).');
    return;
  }
  let skipRows = [];
  let csvRows = [];
  let bandTypesSet = new Set();
  for (let i = 0; i < rows.length; ++i) {
    let r = rows[i];
    let lat = +r[latKey], lon = +r[lonKey], label = r[labelKey];
    let bandRaw = bandKey ? r[bandKey] : '';
    let band = normBandType(bandRaw);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      skipRows.push({ row: i + 2, reason: 'Invalid or out-of-range lat/lon' });
      continue;
    }
    legendCounts[band] = (legendCounts[band] || 0) + 1;
    bandTypesSet.add(band);
    let marker = makeMarker(lat, lon, band, label);
    markersData.push({ marker, band_type: band });
    csvRows.push({
      lat, lon: normLon(lon), label, band_type: band,
      lat_bin: Math.floor((lat + 90) / 10) * 10 - 90,
      lon_bin: Math.floor((normLon(lon) + 180) / 10) * 10 - 180
    });
  }
  renderLegend();
  skipReport.textContent = skipRows.length
    ? `Skipped ${skipRows.length} row(s): ` + skipRows.map(s => `row ${s.row} (${s.reason})`).join(', ')
    : '';
  normalizedCSV = 'lat,lon,label,band_type,lat_bin,lon_bin\n' +
    csvRows.map(r => [r.lat, r.lon, `"${(r.label + '').replace(/"/g, '""')}"`, r.band_type, r.lat_bin, r.lon_bin].join(',')).join('\n');
  if (markersData.length) {
    addMarkersAndShading();
    downloadBtn.disabled = false;
    setStatus(`Loaded ${markersData.length} rows. (${skipRows.length} skipped)`);
  } else {
    setError(`No valid rows found.`);
  }
}

function makeMarker(lat, lon, band, label) {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" fill="${BAND_COLORS[band] || '#888'}" stroke="#333" stroke-width="1.5"/>
    <text x="12" y="17" text-anchor="middle" font-size="9" font-family="Arial" fill="#fff">${label ? '' : ''}</text>
  </svg>`;
  return L.marker([lat, lon], {
    icon: L.divIcon({ className: '', html: svg, iconSize: [24, 24], iconAnchor: [12, 12] }),
    title: label
  }).bindTooltip(label, { direction: 'top' });
}

function addMarkersAndShading() {
  if (markerGroup) markerGroup.clearLayers();
  if (clusterGroup) clusterGroup.clearLayers();
  if (shadeGroup) shadeGroup.clearLayers();
  markerGroup = L.layerGroup();
  clusterGroup = L.markerClusterGroup();
  shadeGroup = L.layerGroup();

  // Marker clustering
  for (const data of markersData) {
    clusterGroup.addLayer(data.marker);
  }
  map.addLayer(clusterGroup);

  // Shading
  let shadedLatBands = new Set(), shadedLonBands = new Set();
  for (const data of markersData) {
    const m = data.marker, band = data.band_type;
    const lat = m.getLatLng().lat, lon = normLon(m.getLatLng().lng);
    const latBand = Math.floor((lat + 90) / 10) * 10 - 90;
    const lonBand = Math.floor((lon + 180) / 10) * 10 - 180;
    if (band === 'ring' || band === 'both') {
      if (!shadedLatBands.has(latBand)) {
        shadedLatBands.add(latBand);
        L.rectangle([[latBand, -180], [latBand + 10, 180]], {
          pane: 'shadePane', color: '#1976d2', fillColor: '#1976d2', fillOpacity: 0.10, weight: 0
        }).addTo(shadeGroup);
      }
    }
    if (band === 'stripe' || band === 'both') {
      if (!shadedLonBands.has(lonBand)) {
        shadedLonBands.add(lonBand);
        L.rectangle([[-90, lonBand], [90, lonBand + 10]], {
          pane: 'shadePane', color: '#f57c00', fillColor: '#f57c00', fillOpacity: 0.10, weight: 0
        }).addTo(shadeGroup);
      }
    }
  }
  map.addLayer(shadeGroup);
}

// --- Help Modal Accessibility and Focus Trap ---
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const helpClose = document.getElementById('helpClose');
const helpContent = document.getElementById('helpContent');
let lastFocusedElement = null;

function openModal() {
  helpModal.classList.add('active');
  lastFocusedElement = document.activeElement;
  helpContent.setAttribute('tabindex', '-1');
  helpContent.focus();
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  helpModal.classList.remove('active');
  document.body.style.overflow = '';
  if (lastFocusedElement) lastFocusedElement.focus();
}
helpBtn.addEventListener('click', openModal);
helpClose.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
  if (e.target === helpModal) closeModal();
});
window.addEventListener('keydown', (e) => {
  if (!helpModal.classList.contains('active')) return;
  if (e.key === 'Escape') {
    closeModal();
    e.preventDefault();
  }
  // Focus trap
  if (e.key === 'Tab') {
    const focusables = helpContent.querySelectorAll('button, [tabindex]:not([tabindex=\"-1\"]), a, input, select, textarea');
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      first.focus(); e.preventDefault();
    }
    if (e.shiftKey && document.activeElement === first) {
      last.focus(); e.preventDefault();
    }
  }
});
