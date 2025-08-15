// Wait for DOMContentLoaded to ensure #map exists
document.addEventListener('DOMContentLoaded', function() {
  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    console.error('Leaflet library not loaded. Ensure leaflet.js is included before main.js');
    return;
  }

  // Check if map container exists
  const mapDiv = document.getElementById('map');
  if (!mapDiv) {
    console.error('Map container with id="map" not found in HTML.');
    return;
  }
  // Ensure map container has height
  if (!mapDiv.style.height || mapDiv.style.height === '0px' || mapDiv.offsetHeight === 0) {
    mapDiv.style.height = '70vh'; // Default height if not set
    console.warn('Map container had no height; defaulting to 70vh.');
  }

  // --- Map Initialization ---
  const map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution:'&copy; OpenStreetMap' }).addTo(map);

  // Panes for layers
  map.createPane('gridPane');  map.getPane('gridPane').style.zIndex = 350;
  map.createPane('shadePane'); map.getPane('shadePane').style.zIndex = 365;
  map.createPane('clusterPane'); map.getPane('clusterPane').style.zIndex = 450;

  // --- 10° Grid Rendering ---
  const gridStyle = { pane: 'gridPane', color: '#2b2b2b', weight: 1, opacity: 0.6, dashArray: '4,4' };
  for (let lon = -180; lon <= 180; lon += 10) L.polyline([[-85, lon], [85, lon]], gridStyle).addTo(map);
  for (let lat = -80; lat <= 80; lat += 10) L.polyline([[lat, -180], [lat, 180]], gridStyle).addTo(map);

  // --- Constants for Bands ---
  const BAND_COLORS = { ring: '#1976d2', stripe: '#f57c00', both: '#8e24aa', none: '#888' };

  // --- UI ELEMENTS ---
  const legendEl = document.getElementById('legend');
  const statusEl = document.getElementById('status');
  const skipReport = document.getElementById('skipReport');
  const csvInput = document.getElementById('csvInput');
  const clearBtn = document.getElementById('clearBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const dropzone = document.getElementById('dropzone');
  const exampleBtn = document.getElementById('exampleBtn');
  const disableClusteringCheckbox = document.getElementById('disable-clustering');
  
  // Stats panel elements
  const totalMarkersEl = document.getElementById('total-markers');
  const typeCountsEl = document.getElementById('type-counts');
  const ringStatsEl = document.getElementById('ring-stats');
  const stripeStatsEl = document.getElementById('stripe-stats');

  // --- Filter Checkboxes ---
  const checkboxes = [
    document.getElementById('flt-ring'),
    document.getElementById('flt-stripe'),
    document.getElementById('flt-both'),
    document.getElementById('flt-none')
  ];
  const allUncheckedWarn = document.getElementById('allUncheckedWarn');
  function updateCheckboxWarning() {
    const anyChecked = checkboxes.some(cb => cb && cb.checked);
    if (allUncheckedWarn) allUncheckedWarn.style.display = anyChecked ? 'none' : 'inline';
  }
  checkboxes.forEach(cb => cb && cb.addEventListener('change', updateCheckboxWarning));
  updateCheckboxWarning();

  // --- Marker and Shading Groups ---
  let markerGroup = null;
  let clusterLabelGroup = null; // Overlay group for cluster labels
  let shadeGroup = null;
  let markersData = [];
  let normalizedCSV = '';
  let legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
  
  // Clustering and stats state
  let disableClustering = false;
  let shadedLatBands = new Set();
  let shadedLonBands = new Set();

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
  function setStatus(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status'; } }
  function setError(msg) { if (statusEl) { statusEl.textContent = msg; statusEl.className = 'status error'; } }

  // --- LEGEND RENDERING ---
  function renderLegend() {
    if (!legendEl) return;
    legendEl.innerHTML = '';
    for (const t of ['ring', 'stripe', 'both', 'none']) {
      legendEl.innerHTML += `<span class="legend-item"><span class="swatch" style="background:${BAND_COLORS[t]}"></span>${t} (${legendCounts[t] || 0})</span>`;
    }
  }

  // --- STATS PANEL UPDATE ---
  function updateStats() {
    if (!totalMarkersEl || !typeCountsEl || !ringStatsEl || !stripeStatsEl) return;
    
    // Get currently visible markers based on filters
    const showTypes = [];
    if (checkboxes[0] && checkboxes[0].checked) showTypes.push('ring');
    if (checkboxes[1] && checkboxes[1].checked) showTypes.push('stripe');
    if (checkboxes[2] && checkboxes[2].checked) showTypes.push('both');
    if (checkboxes[3] && checkboxes[3].checked) showTypes.push('none');
    
    const visibleMarkers = markersData.filter(m => showTypes.includes(m.band_type));
    const totalVisible = visibleMarkers.length;
    
    // Count by type (all data, not just visible)
    const ringCount = legendCounts.ring || 0;
    const stripeCount = legendCounts.stripe || 0;
    const bothCount = legendCounts.both || 0;
    const noneCount = legendCounts.none || 0;
    
    // Update total markers
    totalMarkersEl.textContent = `${totalVisible} markers`;
    
    // Update type counts
    typeCountsEl.textContent = `R:${ringCount} S:${stripeCount} B:${bothCount} N:${noneCount}`;
    
    // Count markers in shaded bands (only visible ones)
    let markersInShadedRings = 0;
    let markersInShadedStripes = 0;
    
    for (const marker of visibleMarkers) {
      const latBand = Math.floor((marker.lat + 90) / 10) * 10 - 90;
      const lonBand = Math.floor((normLon(marker.lon) + 180) / 10) * 10 - 180;
      
      if (shadedLatBands.has(latBand)) {
        markersInShadedRings++;
      }
      if (shadedLonBands.has(lonBand)) {
        markersInShadedStripes++;
      }
    }
    
    // Update ring and stripe stats
    ringStatsEl.textContent = `Rings: ${shadedLatBands.size} bands, ${markersInShadedRings} markers`;
    stripeStatsEl.textContent = `Stripes: ${shadedLonBands.size} bands, ${markersInShadedStripes} markers`;
  }

  // --- CHECKBOX FILTERING ---
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
    if (!disableClustering) {
      updateClusterLabels();
    }
    updateCheckboxWarning();
    updateStats();
  }
  checkboxes.forEach(cb => cb && cb.addEventListener('change', filterMarkers));
  
  // --- CLUSTERING TOGGLE ---
  if (disableClusteringCheckbox) {
    disableClusteringCheckbox.addEventListener('change', function() {
      disableClustering = this.checked;
      if (disableClustering) {
        // Clear cluster labels and spiderfied markers
        if (clusterLabelGroup) clusterLabelGroup.clearLayers();
        unspiderfy();
      } else {
        // Re-enable clustering
        updateClusterLabels();
      }
    });
  }

  // --- CLEAR MARKERS AND SHADING ---
  function clearAll() {
    if (markerGroup) markerGroup.clearLayers();
    if (clusterLabelGroup) clusterLabelGroup.clearLayers();
    if (shadeGroup) shadeGroup.clearLayers();
    if (skipReport) skipReport.textContent = '';
    legendCounts = { ring: 0, stripe: 0, both: 0, none: 0 };
    shadedLatBands.clear();
    shadedLonBands.clear();
    renderLegend();
    updateStats();
    if (downloadBtn) downloadBtn.disabled = true;
    normalizedCSV = '';
    markersData = [];
  }
  if (clearBtn) clearBtn.addEventListener('click', clearAll);

  // --- DOWNLOAD NORMALIZED CSV ---
  if (downloadBtn) downloadBtn.addEventListener('click', () => {
    if (!normalizedCSV) return;
    const blob = new Blob([normalizedCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'normalized_bands.csv';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  });

  // --- CSV UPLOAD & PARSE ---
  if (csvInput) csvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a valid CSV file.');
      csvInput.value = '';
      return;
    }
    if (file) handleCSVFile(file);
  });

  // --- EXAMPLE CSV LOADING ---
  if (exampleBtn) {
    exampleBtn.addEventListener('click', async () => {
      try {
        exampleBtn.disabled = true;
        exampleBtn.textContent = 'Loading...';
        setStatus('Loading example dataset...');
        
        const response = await fetch('data/sample.csv');
        if (!response.ok) {
          throw new Error(`Failed to load example CSV: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        if (typeof Papa === "undefined") {
          setError("Papa Parse library not loaded.");
          return;
        }
        
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: results => {
            processCSVRows(results.data, results.meta.fields);
            setStatus('Example dataset loaded successfully!');
          },
          error: error => {
            setError(`Error parsing example CSV: ${error.message}`);
          }
        });
        
      } catch (error) {
        console.error('Error loading example CSV:', error);
        setError(`Failed to load example dataset: ${error.message}`);
      } finally {
        exampleBtn.disabled = false;
        exampleBtn.textContent = 'Example';
      }
    });
  }

  if (dropzone) dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  if (dropzone) dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.classList.remove('drag'); });
  if (dropzone) dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag');
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

  // --- Header resolution helpers ---
  function buildHeaderMap(fields) {
    const map = new Map();
    for (const f of fields) map.set(f.trim().toLowerCase(), f);
    return map;
  }
  function resolveKey(headerMap, ...candidates) {
    for (const c of candidates) {
      const found = headerMap.get(String(c).trim().toLowerCase());
      if (found) return found;
    }
    return '';
  }
  function escapeCSV(val) {
    const s = val == null ? '' : String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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
        const bRaw = bandRaw.trim().toLowerCase();
        if (['ring', 'stripe', 'both', 'none'].includes(bRaw)) band = bRaw;
      }
      const dateVal = dateKey ? r[dateKey] : '';
      const commentVal = commentKey ? r[commentKey] : '';

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
    renderLegend();
    updateStats();
    if (skipReport) skipReport.textContent = skipRows.length
      ? `Skipped ${skipRows.length} row(s): ` + skipRows.map(s => `row ${s.row} (${s.reason})`).join(', ')
      : '';
    // Normalized CSV with date/comment columns
    normalizedCSV = 'lat,lon,label,band_type,date,comment,lat_bin,lon_bin\n' +
      csvRows.map(r => [
        r.lat,
        r.lon,
        escapeCSV(r.label),
        r.band_type,
        escapeCSV(r.date),
        escapeCSV(r.comment),
        r.lat_bin,
        r.lon_bin
      ].join(',')).join('\n');
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

  let currentClusters = [];
  let spiderfiedCluster = null;
  let currentClusterMarkers = [];
  let spiderfiedMarkers = [];
  let lastUnclusterZoom = null;

  function canShowAllLabelsWithoutOverlap(points) {
    if (!points || points.length <= 1) return true;
    const pixelPoints = points.map(p => map.latLngToContainerPoint(p.marker.getLatLng()));
    const LABEL_W = 90, LABEL_H = 28;
    for (let i = 0; i < pixelPoints.length; ++i) {
      for (let j = i + 1; j < pixelPoints.length; ++j) {
        if (Math.abs(pixelPoints[i].x - pixelPoints[j].x) < LABEL_W &&
            Math.abs(pixelPoints[i].y - pixelPoints[j].y) < LABEL_H) {
          return false;
        }
      }
    }
    return true;
  }

  function addMarkersAndShading() {
    if (markerGroup) markerGroup.clearLayers();
    if (clusterLabelGroup) clusterLabelGroup.clearLayers();
    if (shadeGroup) shadeGroup.clearLayers();

    if (!markerGroup) markerGroup = L.layerGroup();
    if (!clusterLabelGroup) clusterLabelGroup = L.layerGroup();

    map.addLayer(markerGroup);
    map.addLayer(clusterLabelGroup);

    shadeGroup = L.layerGroup();
    shadedLatBands.clear();
    shadedLonBands.clear();
    
    for (const data of markersData) {
      const lat = data.lat, lon = normLon(data.lon);
      const band = data.band_type;
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

    filterMarkers();
  }

  function updateClusterLabels() {
    if (!markerGroup || !clusterLabelGroup) return;
    clusterLabelGroup.clearLayers();
    currentClusterMarkers = [];

    markerGroup.eachLayer(m => {
      m.unbindTooltip();
    });

    // If clustering is disabled, show individual labels for all markers
    if (disableClustering) {
      markerGroup.eachLayer(m => {
        const markerData = markersData.find(md => md.marker === m);
        if (markerData && markerData.label) {
          m.bindTooltip(markerData.label, { 
            direction: 'right', 
            permanent: true, 
            className: 'marker-perm-label' 
          });
        }
      });
      return;
    }

    const visibleMarkers = [];
    markerGroup.eachLayer(m => {
      if (map.getBounds().contains(m.getLatLng())) visibleMarkers.push(m);
    });

    const clusters = [];
    const pixelRadius = 36;
    for (let i = 0; i < visibleMarkers.length; ++i) {
      const m = visibleMarkers[i];
      const pt = map.latLngToContainerPoint(m.getLatLng());
      let found = false;
      for (const c of clusters) {
        if (c.points.some(mp => pt.distanceTo(mp.pt) < pixelRadius)) {
          c.points.push({ marker: m, pt });
          found = true;
          break;
        }
      }
      if (!found) {
        clusters.push({ points: [{ marker: m, pt }] });
      }
    }

    currentClusters = clusters;

    clusters.forEach((c, idx) => {
      const markerObjs = c.points.map(p => markersData.find(md => md.marker === p.marker));
      if (canShowAllLabelsWithoutOverlap(markerObjs)) {
        c.points.forEach((p, i) => {
          const markerData = markerObjs[i];
          if (markerData && markerData.label) {
            p.marker.bindTooltip(markerData.label, { direction: 'right', permanent: true, className: 'marker-perm-label' });
          }
        });
        return;
      }
      const center = c.points.reduce((acc, p) => [acc[0] + p.pt.x, acc[1] + p.pt.y], [0, 0])
        .map(x => x / c.points.length);
      const centerLatLng = map.containerPointToLatLng(center);

      const icon = L.divIcon({
        html: `<div class="custom-cluster-label" tabindex="0" role="button" aria-label="${c.points.length} points" style="background: rgba(67,160,71,0.38); color: #fff; border-radius: 16px; padding: 2px 12px; font-size: 15px; border: 2px solid #1b5e20; cursor: pointer; min-width: 30px; text-align: center; font-weight: bold;">
          ${c.points.length}
        </div>`,
        className: 'custom-cluster-divicon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        pane: 'clusterPane'
      });
      const clusterMarker = L.marker(centerLatLng, { icon, keyboard: true, interactive: true, zIndexOffset: 5000 });

      clusterMarker.__clusterPoints = c.points;
      clusterMarker.__clusterLatLng = centerLatLng;

      clusterMarker.on('click keydown', ev => {
        if (ev.type === 'keydown' && !['Enter', ' '].includes(ev.originalEvent.key)) return;
        if (spiderfiedCluster && arraysEqualCluster(spiderfiedCluster.points, c.points)) {
          unspiderfy();
        } else {
          spiderfyCluster(c, centerLatLng, clusterMarker);
        }
        ev.originalEvent && ev.originalEvent.preventDefault && ev.originalEvent.stopPropagation();
      });

      clusterLabelGroup.addLayer(clusterMarker);
      currentClusterMarkers.push(clusterMarker);
    });

    if (!document.getElementById('custom-cluster-label-style')) {
      const style = document.createElement('style');
      style.id = 'custom-cluster-label-style';
      style.textContent = `
        .custom-cluster-divicon { box-shadow: 0 1px 5px rgba(0,0,0,0.23); background: transparent; border: none; pointer-events: none; }
        .custom-cluster-label { pointer-events: auto; }
        .custom-cluster-label:focus { outline: 2px solid #1976d2; }
        .marker-perm-label { background: #fff; color: #333; font-size: 13px; border-radius: 5px; border: 1px solid #ccc; box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 2px 6px; }
        .marker-perm-label.cluster-label {
          background: #1b2342 !important;
          color: #f6f6f7 !important;
          border: 1px solid #333 !important;
          font-weight: 600;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function arraysEqualCluster(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    const aMarkers = a.map(p => p.marker).sort();
    const bMarkers = b.map(p => p.marker).sort();
    for (let i = 0; i < aMarkers.length; ++i) {
      if (aMarkers[i] !== bMarkers[i]) return false;
    }
    return true;
  }

  function spiderfyCluster(cluster, centerLatLng, clusterMarker) {
    unspiderfy();
    spiderfiedCluster = cluster;

    const geoPoints = cluster.points.map(p => {
      const d = markersData.find(md => md.marker === p.marker);
      return {
        marker: p.marker,
        lat: d.lat,
        lon: d.lon,
        label: d.label
      };
    });

    const center = {
      lat: geoPoints.reduce((acc, pt) => acc + pt.lat, 0) / geoPoints.length,
      lon: geoPoints.reduce((acc, pt) => acc + pt.lon, 0) / geoPoints.length
    };

    geoPoints.forEach(pt => {
      pt.angle = Math.atan2(pt.lat - center.lat, pt.lon - center.lon);
    });

    geoPoints.sort((a, b) => a.angle - b.angle);

    const n = geoPoints.length;
    let spiderDist = 40 / (map.getZoom() / 2.5);
    const minRequiredAngle = 80 / spiderDist;
    let angles = geoPoints.map(pt => pt.angle);
    let useEvenCircle = false;

    if (n > 1) {
      angles = angles.map(a => (a + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
      let minSep = 2 * Math.PI;
      for (let i = 0; i < n; ++i) {
        let diff = (angles[(i+1)%n] - angles[i] + 2*Math.PI) % (2*Math.PI);
        if (diff < minSep) minSep = diff;
      }
      if (minSep < minRequiredAngle) {
        useEvenCircle = true;
        spiderDist = Math.min(Math.max(110, 40 / (map.getZoom() / 2.5)), 200);
      }
    }

    let spiderAngles = [];
    if (n === 2) {
      const [north, south] = geoPoints[0].lat >= geoPoints[1].lat ? [0, 1] : [1, 0];
      spiderAngles[north] = -Math.PI / 2;
      spiderAngles[south] = Math.PI / 2;
    } else if (useEvenCircle) {
      let start = -Math.PI / 2;
      let step = (2 * Math.PI) / n;
      spiderAngles = Array.from({length: n}, (_, i) => start + i * step);
    } else {
      spiderAngles = geoPoints.map(pt => pt.angle);
    }

    for (let i = 0; i < n; ++i) {
      const angle = spiderAngles[i];
      const offset = L.point(
        spiderDist * Math.cos(angle),
        spiderDist * Math.sin(angle)
      );
      const spiderLatLng = map.containerPointToLatLng(
        map.latLngToContainerPoint(centerLatLng).add(offset)
      );
      const origIcon = geoPoints[i].marker.options.icon;
      const label = geoPoints[i].label;

      const spiderMarker = L.marker(spiderLatLng, {
        icon: origIcon,
        keyboard: false,
        interactive: true,
        zIndexOffset: 9000
      });

      if (label) {
        const offsetTooltip = [
          20 * Math.cos(angle),
          20 * Math.sin(angle)
        ];
        spiderMarker.bindTooltip(label, {
          permanent: true,
          direction: 'auto',
          offset: offsetTooltip,
          className: 'marker-perm-label cluster-label'
        });
      }

      spiderMarker.on('click', unspiderfy);
      spiderfiedMarkers.push(spiderMarker);
      spiderMarker.addTo(map);
    }

    cluster.points.forEach(p => {
      if (p.marker.getElement()) p.marker.getElement().classList.add('marker-fadeout');
      p.marker.unbindTooltip();
    });

    setTimeout(() => {
      for (const cm of currentClusterMarkers) {
        if (arraysEqualCluster(cm.__clusterPoints, cluster.points)) {
          cm.off('click keydown');
          cm.on('click keydown', function(ev) {
            if (ev.type === 'keydown' && !['Enter', ' '].includes(ev.originalEvent.key)) return;
            unspiderfy();
            ev.originalEvent && ev.originalEvent.preventDefault && ev.originalEvent.stopPropagation();
          });
        }
      }
      map.once('zoomstart movestart click', unspiderfy);
      clusterMarker.once('remove', unspiderfy);
    }, 10);
  }

  function unspiderfy() {
    spiderfiedMarkers.forEach(m => map.removeLayer(m));
    spiderfiedMarkers = [];
    spiderfiedCluster = null;
    markerGroup && markerGroup.eachLayer(m => {
      if (m.getElement()) m.getElement().classList.remove('marker-fadeout');
      m.unbindTooltip();
    });
    updateClusterLabels();
  }

  map.on('zoomend', function() {
    if (lastUnclusterZoom !== map.getZoom()) {
      lastUnclusterZoom = map.getZoom();
      unspiderfy();
      if (!disableClustering) {
        updateClusterLabels();
      }
    }
  });

  if (!document.getElementById('marker-fadeout-style')) {
    const style = document.createElement('style');
    style.id = 'marker-fadeout-style';
    style.textContent = `
      .marker-fadeout { opacity: 0.18 !important; transition: opacity 0.4s; }
    `;
    document.head.appendChild(style);
  }

  // --- Help Modal Accessibility and Focus Trap ---
  const helpBtn = document.getElementById('helpBtn');
  const helpModal = document.getElementById('helpModal');
  const helpClose = document.getElementById('helpClose');
  const helpContent = document.getElementById('helpContent');
  let lastFocusedElement = null;

  function openModal() {
    if (!helpModal) return;
    helpModal.classList.add('active');
    lastFocusedElement = document.activeElement;
    if (helpContent) {
      helpContent.setAttribute('tabindex', '-1');
      helpContent.focus();
    }
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    if (!helpModal) return;
    helpModal.classList.remove('active');
    document.body.style.overflow = '';
    if (lastFocusedElement) lastFocusedElement.focus();
  }
  if (helpBtn) helpBtn.addEventListener('click', openModal);
  if (helpClose) helpClose.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === helpModal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (!helpModal || !helpModal.classList.contains('active')) return;
    if (e.key === 'Escape') {
      closeModal();
      e.preventDefault();
    }
    if (e.key === 'Tab') {
      const focusables = helpContent ? helpContent.querySelectorAll('button, [tabindex]:not([tabindex="-1"]), a, input, select, textarea') : [];
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        first.focus(); e.preventDefault();
      }
      if (e.shiftKey && document.activeElement === first) {
        last.focus(); e.preventDefault();
      }
    }
  });

});
