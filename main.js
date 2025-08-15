// Version 8 with Example button & map drag/drop

// Embedded sample CSV data (20 rows)
const EMBEDDED_SAMPLE_CSV = `lat,lon,label,band_type
29.9792,31.1344,Great Pyramid of Giza,both
41.8902,12.4922,Colosseum,ring
27.1751,78.0421,Taj Mahal,stripe
-22.9519,-43.2105,Christ the Redeemer,none
-13.1631,-72.5450,Machu Picchu,both
40.7484,-73.9857,Statue of Liberty,ring
48.8584,2.2945,Eiffel Tower,stripe
51.5014,-0.1419,Big Ben,none
55.7520,37.6175,Red Square,both
35.6762,139.6503,Tokyo Tower,ring
-33.8568,151.2153,Sydney Opera House,stripe
41.4036,2.1744,Sagrada Familia,none
25.3444,131.0369,Itsukushima Shrine,both
30.3285,35.4444,Petra,ring
20.6843,-88.5678,Chichen Itza,stripe
-1.2921,36.8219,Mount Kenya,none
43.7696,11.2558,Leaning Tower of Pisa,both
52.5200,13.4050,Brandenburg Gate,ring
37.9755,23.7348,Acropolis of Athens,stripe
61.2181,-149.9003,Anchorage,none`;

document.addEventListener('DOMContentLoaded', function() {
  // --- Leaflet Map Initialization and grid ---
  if (typeof L === 'undefined') { alert('Leaflet not loaded'); return; }
  const mapDiv = document.getElementById('map');
  if (!mapDiv) { alert('Map container missing'); return; }
  if (!mapDiv.style.height || mapDiv.offsetHeight === 0)
    mapDiv.style.height = '70vh';

  const map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution:'&copy; OpenStreetMap' }).addTo(map);

  map.createPane('gridPane');  map.getPane('gridPane').style.zIndex = 350;
  map.createPane('shadePane'); map.getPane('shadePane').style.zIndex = 365;
  map.createPane('labelPane'); map.getPane('labelPane').style.zIndex = 460;
  map.createPane('leaderLinePane'); map.getPane('leaderLinePane').style.zIndex = 459;

  const gridStyle = { pane: 'gridPane', color: '#2b2b2b', weight: 1, opacity: 0.6, dashArray: '4,4' };
  for (let lon = -180; lon <= 180; lon += 10) L.polyline([[-85, lon], [85, lon]], gridStyle).addTo(map);
  for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], gridStyle).addTo(map);

  // --- Constants ---
  const BAND_COLORS = { ring: '#1976d2', stripe: '#f57c00', both: '#8e24aa', none: '#888' };
  const RING_BAND_COUNT = 18, STRIPE_BAND_COUNT = 36;

  // --- UI Elements ---
  const statusEl = document.getElementById('status');
  const skipReport = document.getElementById('skipReport');
  const csvInput = document.getElementById('csvInput');
  const clearBtn = document.getElementById('clearBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.getElementById('helpClose');
  const exampleBtn = document.getElementById('exampleBtn');
  const shadedInfo = document.getElementById('shaded-info');

  // Filter elements
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

  // --- Help Modal Logic ---
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

  // --- Status/Errors ---
  function setStatus(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status'; } }
  function setError(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status error'; } }

  // --- Filtering, clearing, and CSV download ---
  function filterMarkers() {
    if (!markerGroup) return;
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
    if (downloadBtn) downloadBtn.disabled = true;
    normalizedCSV = '';
    markersData = [];
  }
  if (clearBtn) clearBtn.addEventListener('click', clearAll);
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    if (!normalizedCSV) return;
    const blob = new Blob([normalizedCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'normalized_bands.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  });

  // --- CSV load ---
  if (csvInput) csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a valid CSV file.');
      csvInput.value = '';
      return;
    }
    if (file) handleCSVFile(file);
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
    if (file) handleCSVFile(file);
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

  // --- Example Button Logic: load embedded sample data ---
  if (exampleBtn) {
    exampleBtn.addEventListener('click', () => {
      if (csvInput) csvInput.value = '';
      setStatus('Loaded example data.');
      Papa.parse(EMBEDDED_SAMPLE_CSV, {
        header: true,
        skipEmptyLines: true,
        complete: r => processCSVRows(r.data, r.meta.fields)
      });
    });
  }

  // --- Processing CSV rows and building map overlays ---
  function processCSVRows(rows, fields) {
    clearAll();

    const headerMap = buildHeaderMap(fields);
    const latKey = resolveKey(headerMap, 'lat', 'latitude');
    const lonKey = resolveKey(headerMap, 'lon', 'lng', 'long', 'longitude');
    const labelKey = resolveKey(headerMap, 'label', 'name', 'title');
    const bandKey = resolveKey(headerMap, 'band_type', 'band', 'type', 'stripe', 'ring');
    const dateKey = resolveKey(headerMap, 'date');
    const commentKey = resolveKey(headerMap, 'comment', 'notes', 'note', 'description');

    if (!latKey || !lonKey || !labelKey) {
      setError('Missing required headers (lat, lon, label).');
      return;
    }

    // Build a set of display field names (trimmed) for all CSV columns
    const displayFieldNames = fields.map(f => f.trim());
    let skipRows = [];
    let csvRows = [];
    for (let i = 0; i < rows.length; ++i) {
      const r = rows[i] || {};

      const lat = +r[latKey];
      const lonSrc = r[lonKey];
      const lon = +lonSrc;
      const label = r[labelKey];
      const bandRaw = bandKey ? r[bandKey] : '';
      let band = normBandType(bandRaw);
      if (typeof bandRaw === 'string') {
        let bRaw = bandRaw.trim().toLowerCase();
        if (['ring', 'stripe', 'both', 'none'].includes(bRaw)) band = bRaw;
      }

      // Define dateVal and commentVal using the resolved keys
      const dateVal = dateKey ? (r[dateKey] || '') : '';
      const commentVal = commentKey ? (r[commentKey] || '') : '';

      if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        skipRows.push({ row: i + 2, reason: 'Invalid or out-of-range lat/lon' });
        continue;
      }

      legendCounts[band] = (legendCounts[band] || 0) + 1;

      const latBin = Math.floor((lat + 90) / 10) * 10 - 90;
      const lonNorm = normLon(lon);
      const lonBin = Math.floor((lonNorm + 180) / 10) * 10 - 180;

      const marker = makeMarker(lat, lonNorm, band, label);

      // Prepare a display object of all CSV fields (keys trimmed)
      const rowAllData = {};
      for (const f of displayFieldNames) {
        const orig = headerMap.get(f.toLowerCase()) || f; // best-effort
        rowAllData[f] = r[orig];
      }
      // Add canonical/computed fields
      rowAllData.lat = lat;
      rowAllData.lon = lonNorm;
      rowAllData.label = label;
      rowAllData.band_type = band;
      rowAllData.date = dateVal || '';
      rowAllData.comment = commentVal || '';
      rowAllData.lat_bin = latBin;
      rowAllData.lon_bin = lonBin;

      // Bind popup showing all data
      const rowsHtml = Object.keys(rowAllData).map(k => {
        return `<tr><th style="text-align:left; padding-right:8px; vertical-align:top;">${escapeHTML(k)}</th>` +
               `<td style="white-space:pre-wrap; max-width:260px;">${escapeHTML(rowAllData[k])}</td></tr>`;
      }).join('');
      const popupHtml = `<div style="font-size:13px; line-height:1.35;">
        <table>${rowsHtml}</table>
      </div>`;
      marker.bindPopup(popupHtml, { maxWidth: 320, autoPan: true });

      markersData.push({ marker, band_type: band, lat, lon: lonNorm, label, date: dateVal, comment: commentVal, allFields: rowAllData });

      csvRows.push({
        lat, lon: lonNorm, label, band_type: band,
        date: dateVal || '', comment: commentVal || '',
        lat_bin: latBin, lon_bin: lonBin
      });
    }
    updateBandCountsInFilters();
    if (skipReport) skipReport.textContent = skipRows.length
      ? `Skipped ${skipRows.length} row(s): ` + skipRows.map(s => `row ${s.row} (${s.reason})`).join(', ')
      : '';
    normalizedCSV = 'lat,lon,label,band_type,lat_bin,lon_bin\n' +
      csvRows.map(r => [r.lat, r.lon, `"${(r.label + '').replace(/\"/g, '""')}"`, r.band_type, r.lat_bin, r.lon_bin].join(',')).join('\n');
    if (markersData.length) {
      addMarkersAndShading();
      if (downloadBtn) downloadBtn.disabled = false;
      setStatus(`Loaded ${markersData.length} rows. (${skipRows.length} skipped)`);
    } else {
      setError(`No valid rows found.`);
    }
  }
  function makeMarker(lat, lon, band, label) {
    const svg = `<svg width="24" height="24" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" fill="${BAND_COLORS[band] || '#888'}" stroke="#333" stroke-width="1.5"/>
    </svg>`;
    return L.marker([lat, lon], {
      icon: L.divIcon({ className: '', html: svg, iconSize: [24, 24], iconAnchor: [12, 12] }),
      title: label
    });
  }

  function addMarkersAndShading() {
    if (markerGroup) markerGroup.clearLayers();
    if (!markerGroup) markerGroup = L.layerGroup();
    map.addLayer(markerGroup);

    if (shadeGroup) shadeGroup.clearLayers();
    if (!shadeGroup) shadeGroup = L.layerGroup();
    map.addLayer(shadeGroup);

    if (labelOverlayGroup) labelOverlayGroup.clearLayers();
    if (!labelOverlayGroup) labelOverlayGroup = L.layerGroup([], {pane: 'labelPane'});
    map.addLayer(labelOverlayGroup);

    if (leaderLineGroup) leaderLineGroup.clearLayers();
    if (!leaderLineGroup) leaderLineGroup = L.layerGroup([], {pane: 'leaderLinePane'});
    map.addLayer(leaderLineGroup);

    for (const m of markersData) markerGroup.addLayer(m.marker);

    shadedLatBands = new Set();
    shadedLonBands = new Set();
    for (const data of markersData) {
      const lat = data.lat, lon = normLon(data.lon), band = data.band_type;
      const latBand = Math.floor((lat + 90) / 10) * 10 - 90;
      const lonBand = Math.floor((normLon(lon) + 180) / 10) * 10 - 180;
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
    updateShadedInfo();
    updateLabelOverlay();
    filterMarkers();
  }

  // --- Label Placement Logic ---
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

    const markerRects = [];
    for (const m of visibleMarkers) {
      const pt = map.latLngToContainerPoint(m.getLatLng());
      markerRects.push({ x: pt.x - 12, y: pt.y - 12, w: 24, h: 24 });
    }
    const placedLabels = [];
    const mapSize = map.getSize();

    function measureLabelSize(text) {
      const temp = document.createElement('div');
      temp.className = 'marker-nonoverlap-label marker-nonoverlap-label-measure';
      temp.style.position = 'absolute';
      temp.style.visibility = 'hidden';
      temp.textContent = text;
      document.body.appendChild(temp);
      const rect = temp.getBoundingClientRect();
      document.body.removeChild(temp);
      return {w: Math.ceil(rect.width), h: Math.ceil(rect.height)};
    }
    function findFreeLabelPos(center, labelSize, occupiedRects) {
      const radiusStep = 32;
      let maxRadius = Math.min(mapSize.x, mapSize.y) / 2;
      let tryPos = [
        {dx: 18, dy: -labelSize.h/2},
        {dx: -labelSize.w-10, dy: -labelSize.h/2},
        {dx: -labelSize.w/2, dy: -labelSize.h-10},
        {dx: -labelSize.w/2, dy: 18},
      ];
      for (let t = 0; t < tryPos.length; ++t) {
        let x = center.x + tryPos[t].dx, y = center.y + tryPos[t].dy;
        if (x < 2 || (x+labelSize.w) > (mapSize.x-2) || y < 2 || (y+labelSize.h) > (mapSize.y-2)) continue;
        let rect = {x, y, w: labelSize.w, h: labelSize.h};
        if (!isOverlapping(rect, occupiedRects)) return {x, y};
      }
      for (let r = radiusStep; r < maxRadius; r += radiusStep) {
        for (let a = 0; a < 2*Math.PI; a += Math.PI/6) {
          let x = center.x + r * Math.cos(a) - labelSize.w/2;
          let y = center.y + r * Math.sin(a) - labelSize.h/2;
          if (x < 2 || (x+labelSize.w) > (mapSize.x-2) || y < 2 || (y+labelSize.h) > (mapSize.y-2)) continue;
          let rect = {x, y, w: labelSize.w, h: labelSize.h};
          if (!isOverlapping(rect, occupiedRects)) return {x, y};
        }
      }
      for (let y = 2; y < mapSize.y - labelSize.h - 2; y += 18) {
        for (let x = 2; x < mapSize.x - labelSize.w - 2; x += 18) {
          let rect = {x, y, w: labelSize.w, h: labelSize.h};
          if (!isOverlapping(rect, occupiedRects)) return {x, y};
        }
      }
      return {x: 2, y: 2};
    }
    function isOverlapping(rect, others) {
      for (const o of others) if (rectsOverlap(rect, o)) return true;
      return false;
    }
    function rectsOverlap(a, b) {
      return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
    }

    const allOccupiedRects = [...markerRects];
    for (let i = 0; i < visibleMarkers.length; ++i) {
      const marker = visibleMarkers[i];
      const markerData = markersData.find(md => md.marker === marker);
      if (!markerData || !markerData.label) continue;
      const labelText = markerData.label;
      const labelSize = measureLabelSize(labelText);
      const markerPt = map.latLngToContainerPoint(marker.getLatLng());
      const labelPos = findFreeLabelPos(markerPt, labelSize, allOccupiedRects);
      const labelRect = {
        x: labelPos.x, y: labelPos.y, w: labelSize.w, h: labelSize.h, markerPt
      };
      allOccupiedRects.push(labelRect);
      placedLabels.push(labelRect);
      const labelLatLng = map.containerPointToLatLng([labelPos.x + labelSize.w/2, labelPos.y + labelSize.h/2]);
      const labelDiv = L.divIcon({
        html: `<div class="marker-nonoverlap-label">${labelText}</div>`,
        className: '',
        iconSize: [labelSize.w, labelSize.h],
        iconAnchor: [labelSize.w/2, labelSize.h/2],
        pane: 'labelPane'
      });
      let labelMarker = L.marker(labelLatLng, {icon: labelDiv, keyboard: false, interactive: false, pane: 'labelPane'});
      labelOverlayGroup.addLayer(labelMarker);

      let labelCenterPx = L.point(labelRect.x + labelSize.w/2, labelRect.y + labelSize.h/2);
      let markerPx = labelRect.markerPt;
      let dist = labelCenterPx.distanceTo(markerPx);
      if (dist > 35) {
        let candidates = [];
        let dx = labelCenterPx.x - markerPx.x;
        let dy = labelCenterPx.y - markerPx.y;
        let norm = Math.sqrt(dx*dx + dy*dy);
        let perp = {x: -dy/norm, y: dx/norm};
        for (let k = -1; k <= 1; k += 0.5) {
          let offset = 15 * k;
          let mx = markerPx.x + offset * perp.x;
          let my = markerPx.y + offset * perp.y;
          let lx = labelCenterPx.x + offset * perp.x;
          let ly = labelCenterPx.y + offset * perp.y;
          let midx = (mx + lx) / 2;
          let midy = (my + ly) / 2;
          let controlOffset = 20;
          let cx = midx + controlOffset * perp.x;
          let cy = midy + controlOffset * perp.y;
          candidates.push({start: [mx, my], control: [cx, cy], end: [lx, ly]});
        }
        let bestCandidate = candidates[0];
        let minIntersections = Infinity;
        for (let cand of candidates) {
          let intersections = 0;
          for (let j = 0; j < visibleMarkers.length; ++j) {
            if (j === i) continue;
            let otherMarkerPx = map.latLngToContainerPoint(visibleMarkers[j].getLatLng());
            if (lineIntersectsCircle(cand.start, cand.control, cand.end, otherMarkerPx, 15)) {
              intersections++;
            }
          }
          if (intersections < minIntersections) {
            minIntersections = intersections;
            bestCandidate = cand;
          }
        }
        let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        let path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        let d = `M ${bestCandidate.start[0]} ${bestCandidate.start[1]} Q ${bestCandidate.control[0]} ${bestCandidate.control[1]} ${bestCandidate.end[0]} ${bestCandidate.end[1]}`;
        path.setAttribute('d', d);
        path.setAttribute('stroke', 'yellow');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('stroke-opacity', '0.90');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
        let leaderLine = L.marker([0, 0], {
          icon: L.divIcon({ html: svg.outerHTML, className: '', iconSize: [mapSize.x, mapSize.y], iconAnchor: [0, 0] }),
          keyboard: false, interactive: false, pane: 'leaderLinePane'
        }).setLatLng(map.containerPointToLatLng([0, 0]));
        leaderLineGroup.addLayer(leaderLine);
      }
    }
  }

  function lineIntersectsCircle(start, control, end, center, radius) {
    let steps = 10;
    for (let t = 0; t <= 1; t += 1/steps) {
      let x = (1-t)*(1-t)*start[0] + 2*(1-t)*t*control[0] + t*t*end[0];
      let y = (1-t)*(1-t)*start[1] + 2*(1-t)*t*control[1] + t*t*end[1];
      let dx = x - center.x, dy = y - center.y;
      if (dx*dx + dy*dy <= radius*radius) return true;
    }
    return false;
  }

  map.on('zoomend moveend', updateLabelOverlay);

  // --- Right-click Context Menu UX ---
  const contextMenu = document.getElementById('contextMenu');
  const addMarkerBtn = document.getElementById('addMarkerBtn');
  const editMarkerBtn = document.getElementById('editMarkerBtn');
  const markerDialog = document.getElementById('markerDialog');
  const markerDialogTitle = document.getElementById('markerDialogTitle');
  const markerDialogClose = document.getElementById('markerDialogClose');
  const markerDialogCancel = document.getElementById('markerDialogCancel');
  const markerForm = document.getElementById('markerForm');
  const markerLat = document.getElementById('markerLat');
  const markerLon = document.getElementById('markerLon');
  const markerLabel = document.getElementById('markerLabel');
  const markerBandType = document.getElementById('markerBandType');
  const markerDate = document.getElementById('markerDate');
  const markerComment = document.getElementById('markerComment');

  let contextMenuMode = 'map'; // 'map' or 'marker'
  let clickedLatLng = null;
  let selectedMarkerData = null;

  // Right-click on map
  map.on('contextmenu', function(e) {
    contextMenuMode = 'map';
    clickedLatLng = e.latlng;
    selectedMarkerData = null;
    
    if (addMarkerBtn) addMarkerBtn.style.display = 'block';
    if (editMarkerBtn) editMarkerBtn.style.display = 'none';
    
    showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY);
  });

  function attachMarkerContextMenu(marker, rowRef) {
    marker.on('contextmenu', function(e) {
      L.DomEvent.stopPropagation(e);
      contextMenuMode = 'marker';
      clickedLatLng = null;
      selectedMarkerData = rowRef;
      
      if (addMarkerBtn) addMarkerBtn.style.display = 'none';
      if (editMarkerBtn) editMarkerBtn.style.display = 'block';
      
      showContextMenu(e.originalEvent.clientX, e.originalEvent.clientY);
    });
  }

  // Wrap addMarkersAndShading to attach context menus
  const _origAddMarkersAndShading = addMarkersAndShading;
  addMarkersAndShading = function() {
    // Attach context menus to all markers before layering
    for (const d of markersData) {
      attachMarkerContextMenu(d.marker, d);
    }
    _origAddMarkersAndShading();
  };

  function showContextMenu(x, y) {
    if (!contextMenu) return;
    contextMenu.style.display = 'block';
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
  }

  function hideContextMenu() {
    if (contextMenu) contextMenu.style.display = 'none';
  }

  // Context menu button handlers
  if (addMarkerBtn) {
    addMarkerBtn.addEventListener('click', function() {
      hideContextMenu();
      openAddDialog(clickedLatLng);
    });
  }

  if (editMarkerBtn) {
    editMarkerBtn.addEventListener('click', function() {
      hideContextMenu();
      openEditDialog(selectedMarkerData);
    });
  }

  function openAddDialog(latlng) {
    if (!markerDialog || !latlng) return;
    
    if (markerDialogTitle) markerDialogTitle.textContent = 'Add Marker';
    if (markerLat) markerLat.value = latlng.lat.toFixed(6);
    if (markerLon) markerLon.value = latlng.lng.toFixed(6);
    if (markerLabel) markerLabel.value = '';
    if (markerBandType) markerBandType.value = 'both';
    if (markerDate) markerDate.value = '';
    if (markerComment) markerComment.value = '';
    
    markerDialog.classList.add('active');
  }

  function openEditDialog(markerData) {
    if (!markerDialog || !markerData) return;
    
    if (markerDialogTitle) markerDialogTitle.textContent = 'Edit Marker';
    if (markerLat) markerLat.value = markerData.lat.toFixed(6);
    if (markerLon) markerLon.value = markerData.lon.toFixed(6);
    if (markerLabel) markerLabel.value = markerData.label || '';
    if (markerBandType) markerBandType.value = markerData.band_type || 'both';
    if (markerDate) markerDate.value = markerData.date || '';
    if (markerComment) markerComment.value = markerData.comment || '';
    
    markerDialog.classList.add('active');
  }

  // Dialog close handlers
  if (markerDialogClose) {
    markerDialogClose.addEventListener('click', function() {
      markerDialog.classList.remove('active');
    });
  }

  if (markerDialogCancel) {
    markerDialogCancel.addEventListener('click', function() {
      markerDialog.classList.remove('active');
    });
  }

  // Form submit handler
  if (markerForm) {
    markerForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const lat = parseFloat(markerLat.value);
      const lon = parseFloat(markerLon.value);
      const label = markerLabel.value.trim();
      const bandType = markerBandType.value;
      const date = markerDate.value.trim();
      const comment = markerComment.value.trim();
      
      // Validate ranges
      if (isNaN(lat) || lat < -90 || lat > 90) {
        alert('Latitude must be between -90 and 90');
        return;
      }
      if (isNaN(lon) || lon < -180 || lon > 180) {
        alert('Longitude must be between -180 and 180');
        return;
      }
      if (!label) {
        alert('Label is required');
        return;
      }
      
      const lonNorm = normLon(lon);
      
      if (contextMenuMode === 'edit' || selectedMarkerData) {
        // Edit existing marker
        const markerData = selectedMarkerData;
        markerData.lat = lat;
        markerData.lon = lonNorm;
        markerData.label = label;
        markerData.band_type = bandType;
        markerData.date = date;
        markerData.comment = comment;
        
        // Update marker position and icon
        markerData.marker.setLatLng([lat, lonNorm]);
        markerData.marker.setIcon(L.divIcon({
          className: '',
          html: `<svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" fill="${BAND_COLORS[bandType] || '#888'}" stroke="#333" stroke-width="1.5"/>
          </svg>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }));
        markerData.marker.options.title = label;
        
        // Update popup
        updateMarkerPopup(markerData);
        
      } else {
        // Add new marker
        const marker = makeMarker(lat, lonNorm, bandType, label);
        
        const latBin = Math.floor((lat + 90) / 10) * 10 - 90;
        const lonBin = Math.floor((lonNorm + 180) / 10) * 10 - 180;
        
        const newMarkerData = {
          marker,
          band_type: bandType,
          lat,
          lon: lonNorm,
          label,
          date,
          comment,
          allFields: {
            lat,
            lon: lonNorm,
            label,
            band_type: bandType,
            date,
            comment,
            lat_bin: latBin,
            lon_bin: lonBin
          }
        };
        
        updateMarkerPopup(newMarkerData);
        attachMarkerContextMenu(marker, newMarkerData);
        markersData.push(newMarkerData);
      }
      
      markerDialog.classList.remove('active');
      refreshAfterDataChange();
    });
  }

  function updateMarkerPopup(markerData) {
    const rowsHtml = Object.keys(markerData.allFields).map(k => {
      return `<tr><th style="text-align:left; padding-right:8px; vertical-align:top;">${escapeHTML(k)}</th>` +
             `<td style="white-space:pre-wrap; max-width:260px;">${escapeHTML(markerData.allFields[k])}</td></tr>`;
    }).join('');
    const popupHtml = `<div style="font-size:13px; line-height:1.35;">
      <table>${rowsHtml}</table>
    </div>`;
    markerData.marker.bindPopup(popupHtml, { maxWidth: 320, autoPan: true });
  }

  function refreshAfterDataChange() {
    // Recompute legend counts
    legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
    for (const data of markersData) {
      legendCounts[data.band_type] = (legendCounts[data.band_type] || 0) + 1;
    }
    
    // Rebuild normalized CSV with current markersData
    const csvRows = markersData.map(data => {
      const latBin = Math.floor((data.lat + 90) / 10) * 10 - 90;
      const lonBin = Math.floor((data.lon + 180) / 10) * 10 - 180;
      return {
        lat: data.lat,
        lon: data.lon,
        label: data.label,
        band_type: data.band_type,
        date: data.date || '',
        comment: data.comment || '',
        lat_bin: latBin,
        lon_bin: lonBin
      };
    });
    
    normalizedCSV = 'lat,lon,label,band_type,lat_bin,lon_bin\\n' +
      csvRows.map(r => [r.lat, r.lon, `"${(r.label + '').replace(/"/g, '""')}"`, r.band_type, r.lat_bin, r.lon_bin].join(',')).join('\\n');
    
    // Clear skip report since we're dealing with manual data
    if (skipReport) skipReport.textContent = '';
    
    // Refresh overlays
    addMarkersAndShading();
  }

  // Hide context menu on document click, ESC, and map movestart
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      hideContextMenu();
      if (markerDialog && markerDialog.classList.contains('active')) {
        markerDialog.classList.remove('active');
      }
    }
  });
  map.on('movestart', hideContextMenu);

});