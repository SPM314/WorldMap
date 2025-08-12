// --- Map (only change: minZoom 2 so gridlines never disappear) ---
const map = L.map('map', { center: [20, 0], zoom: 2, minZoom: 2, worldCopyJump: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  { maxZoom: 19, attribution:'&copy; OpenStreetMap' }).addTo(map);

// Panes: grid (350) < shading (365) < markers/clusters (default)
map.createPane('gridPane');  map.getPane('gridPane').style.zIndex = 350;
map.createPane('shadePane'); map.getPane('shadePane').style.zIndex = 365;

// --- 10° grid ---
const gridStyle = { pane: 'gridPane', color: '#2b2b2b', weight: 1, opacity: 0.6, dashArray: '4,4' };
for (let lon=-180; lon<=180; lon+=10) L.polyline([[-85,lon],[85,lon]], gridStyle).addTo(map);
for (let lat=-80; lat<=80; lat+=10) L.polyline([[lat,-180],[lat,180]], gridStyle).addTo(map);

// ... (the rest of your original map/marker/CSV logic goes here -- copy all code between <script> tags except the help modal wiring!)

// --- Filter Checkbox Warning ---
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

// --- CSV file type check (accept only text/csv or .csv) ---
const csvInput = document.getElementById('csvInput');
csvInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && !file.name.endsWith('.csv') && file.type !== 'text/csv') {
    setError('Please upload a valid CSV file.');
    csvInput.value = '';
    return;
  }
  // continue processing...
});

// --- Modal accessibility and focus trap ---
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
    const focusables = helpContent.querySelectorAll('button, [tabindex]:not([tabindex="-1"]), a, input, select, textarea');
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      first.focus(); e.preventDefault();
    }
    if (e.shiftKey && document.activeElement === first) {
      last.focus(); e.preventDefault();
    }
  }
});
