'use strict';
// The public feed is consent-filtered by scripts/build_data.py before deployment.
const map = L.map('map', { scrollWheelZoom: false }).setView([18, 0], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

// If the marker-cluster CDN is blocked, show the regular markers rather than breaking the map.
const markerLayer = typeof L.markerClusterGroup === 'function'
  ? L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 46,
      iconCreateFunction: cluster => L.divIcon({
        html: `<span>${cluster.getChildCount()}</span>`,
        className: 'ocean-cluster', iconSize: [38,38], iconAnchor: [19,19]
      })
    })
  : L.layerGroup();
map.addLayer(markerLayer);

const E = id => document.getElementById(id);
let all = [];
let hasFittedMap = false;
const DIRECTORY_FIELDS = [
  ['organisation', 'Organisation'], ['city', 'City'], ['country', 'Country'],
  ['organisation_type', 'Organisation type'], ['data_focus', 'Data focus'],
  ['tools_used', 'Tools/platforms'], ['ai_interests', 'AI/data-sharing interests'],
  ['website', 'Website']
];

function clean(v) { return String(v ?? '').trim(); }
function escapeHTML(v) { return clean(v).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function safeWebURL(v) {
  try {
    const url = new URL(clean(v));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function popupHTML(r) {
  let html = `<div class="popup"><h3>${escapeHTML(r.organisation)}</h3>`;
  const fields = [
    ['Approximate location', [r.city,r.country].filter(Boolean).join(', ')],
    ['Organisation type',r.organisation_type], ['Data focus',r.data_focus],
    ['Tools/platforms used',r.tools_used], ['AI/data-sharing interests',r.ai_interests],
    ['Profile',r.public_profile]
  ];
  for (const [label, value] of fields) {
    if (clean(value)) html += `<p><strong>${label}:</strong> ${escapeHTML(value)}</p>`;
  }
  const url = safeWebURL(r.website);
  if (url) html += `<p><strong>Website:</strong> <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open link</a></p>`;
  // Public contact has already been restricted to consent_contact=Yes by build_data.py.
  if (clean(r.public_contact)) html += `<p><strong>Public contact:</strong> ${escapeHTML(r.public_contact)}</p>`;
  return html + '</div>';
}
function setData(records, timestamp) {
  all = records;
  const types = [...new Set(all.map(r => clean(r.organisation_type)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const checkboxes = E('type-checkboxes');
  checkboxes.replaceChildren();
  E('type-control').hidden = types.length === 0;
  for (const type of types) {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.value = type; checkbox.checked = true;
    checkbox.addEventListener('change', render);
    label.append(checkbox, document.createTextNode(type));
    checkboxes.append(label);
  }
  E('updated').textContent = timestamp;
  E('error').hidden = true;
  render();
  if (!hasFittedMap && all.length) {
    const bounds = L.latLngBounds(all.map(r => [Number(r.map_latitude),Number(r.map_longitude)]));
    if (bounds.isValid()) { map.fitBounds(bounds.pad(0.13), { maxZoom:4, animate:false }); hasFittedMap = true; }
  }
  map.invalidateSize({ animate:false });
}
function render() {
  const query = E('search').value.trim().toLowerCase();
  const boxes = [...E('type-checkboxes').querySelectorAll('input')];
  const checked = boxes.filter(e => e.checked).map(e => e.value);
  E('type-summary').textContent = checked.length === boxes.length
    ? 'All organisation types' : `${checked.length} of ${boxes.length} types selected`;
  const rows = all.filter(r =>
    (!boxes.length || checked.includes(clean(r.organisation_type)) || (checked.length === boxes.length && !r.organisation_type)) &&
    (!query || ['organisation','city','country','organisation_type','data_focus','tools_used','ai_interests','public_profile']
      .some(k => clean(r[k]).toLowerCase().includes(query)))
  );
  E('count').textContent = `${rows.length} of ${all.length} approved organisation${all.length===1?'':'s'} shown`;
  markerLayer.clearLayers();
  for (const r of rows) {
    const pin = L.marker([Number(r.map_latitude),Number(r.map_longitude)], {
      icon:L.divIcon({ className:'', html:'<div class="map-pin"></div>', iconSize:[24,34], iconAnchor:[11,28], popupAnchor:[0,-28] }),
      title:clean(r.organisation)
    }).bindPopup(popupHTML(r), { maxWidth:350 });
    markerLayer.addLayer(pin);
  }
  const table = E('directory-body');
  table.replaceChildren();
  if (!rows.length) {
    const tr = table.insertRow(); const td = tr.insertCell();
    td.colSpan = 8; td.textContent = 'No organisations match the current filters.';
    return;
  }
  for (const r of rows) {
    const tr = table.insertRow();
    for (const [key, label] of DIRECTORY_FIELDS) {
      const td = tr.insertCell();
      td.dataset.label = label;
      if (key === 'website') {
        const url = safeWebURL(r.website);
        if (url) {
          const a = document.createElement('a');
          a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.textContent = 'Website'; td.append(a);
        }
      } else {
        td.textContent = clean(r[key]);
      }
    }
  }
}
function showError(message) { E('error').hidden = false; E('error').textContent = message; }
E('search').addEventListener('input', render);
E('reset').addEventListener('click', () => {
  E('search').value = '';
  for (const box of E('type-checkboxes').querySelectorAll('input')) box.checked = true;
  render();
});
(async function load() {
  try {
    const response = await fetch(`./data.json?ts=${Date.now()}`, { cache:'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.organisations)) throw new Error('Unexpected data format');
    const updated = payload.updated_at ? new Date(payload.updated_at).toLocaleString() : 'unknown';
    setData(payload.organisations, `Last data update: ${updated}`);
  } catch (err) {
    E('count').textContent = 'Map data unavailable';
    showError(`Unable to load published map data (${err.message}). Check the GitHub Actions build and deploy logs.`);
  }
})();
// Recalculate Leaflet layout if Notion or the browser changes the embed width.
if ('ResizeObserver' in window) {
  new ResizeObserver(() => map.invalidateSize({ animate:false })).observe(E('map'));
} else {
  window.addEventListener('resize', () => map.invalidateSize({ animate:false }));
}
