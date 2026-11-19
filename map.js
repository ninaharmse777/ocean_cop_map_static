'use strict';
// Browser-only map. All public data must already have been consent-filtered by build_data.py.
// Manual CSV upload is also filtered in the browser and never uploaded to a server.
const map = L.map('map', {scrollWheelZoom: false}).setView([20, 0], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const E = (id) => document.getElementById(id);
let all = [];

function clean(v) { return String(v ?? '').trim(); }
function escapeHTML(v) { return clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function safeWebURL(v) {
  try { const u = new URL(clean(v)); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; }
  catch { return null; }
}
function validCoords(v) {
  const latRaw = clean(v.map_latitude ?? v.latitude), lonRaw = clean(v.map_longitude ?? v.longitude);
  if (!latRaw || !lonRaw) return false;
  const lat = Number(latRaw), lon = Number(lonRaw);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
const PUBLIC_FIELDS = ['organisation','website','city','country','organisation_type','data_focus','tools_used','ai_interests','public_profile'];
function filterConsent(rows) {
  return rows.map(raw => {
    const r = Object.fromEntries(Object.entries(raw).map(([k,v]) => [clean(k).toLowerCase(), clean(v)]));
    if (r.consent_map?.toLowerCase() !== 'yes' || r.show_on_map?.toLowerCase() !== 'yes' || !validCoords(r)) return null;
    const o = Object.fromEntries(PUBLIC_FIELDS.map(k => [k, r[k] || '']));
    o.map_latitude = Number(r.map_latitude ?? r.latitude);
    o.map_longitude = Number(r.map_longitude ?? r.longitude);
    o.public_contact = r.consent_contact?.toLowerCase() === 'yes' ? (r.public_contact || '') : '';
    return o;
  }).filter(Boolean);
}
function popupHTML(r) {
  let s = `<div class="popup"><h3>${escapeHTML(r.organisation)}</h3>`;
  for (const [label,key] of [['Approximate location',null],['Organisation type','organisation_type'],['Data focus','data_focus'],['Tools/platforms used','tools_used'],['AI/data-sharing interests','ai_interests'],['Profile','public_profile']]) {
    const value = key ? r[key] : [r.city,r.country].filter(Boolean).join(', ');
    if (value) s += `<p><strong>${label}:</strong> ${escapeHTML(value)}</p>`;
  }
  const url = safeWebURL(r.website);
  if (url) s += `<p><strong>Website:</strong> <a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open link</a></p>`;
  if (r.public_contact) s += `<p><strong>Public contact:</strong> ${escapeHTML(r.public_contact)}</p>`;
  return s + '</div>';
}
function setData(records, label) {
  all = records;
  const types = [...new Set(all.map(r=>clean(r.organisation_type)).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  const box = E('type-checkboxes');
  box.replaceChildren();
  for (const type of types) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = type; input.checked = true;
    input.addEventListener('change', render);
    label.append(input, document.createTextNode(type));
    box.append(label);
  }
  E('updated').textContent = label;
  E('error').hidden = true;
  render();
}
function render() {
  const q = E('search').value.trim().toLowerCase();
  const checked = [...E('type-checkboxes').querySelectorAll('input:checked')].map(e => e.value);
  const totalTypes = E('type-checkboxes').querySelectorAll('input').length;
  E('type-summary').textContent = checked.length === totalTypes ? 'All organisation types' : `${checked.length} of ${totalTypes} types selected`;
  const rows = all.filter(r => (checked.includes(r.organisation_type) || (checked.length === totalTypes && !r.organisation_type)) && (!q ||
    ['organisation','city','country','organisation_type','data_focus','tools_used','ai_interests','public_profile'].some(k => clean(r[k]).toLowerCase().includes(q))));
  E('count').textContent = `${rows.length} of ${all.length} approved organisation${all.length===1?'':'s'} shown`;
  markerLayer.clearLayers();
  for (const r of rows) {
    L.marker([Number(r.map_latitude),Number(r.map_longitude)], {
      icon: L.divIcon({className:'',html:'<div class="map-pin"></div>',iconSize:[24,34],iconAnchor:[11,28],popupAnchor:[0,-28]}),
      title:clean(r.organisation)
    }).bindPopup(popupHTML(r),{maxWidth:360}).addTo(markerLayer);
  }
  const tb = E('directory-body'); tb.replaceChildren();
  if (!rows.length) { const tr=tb.insertRow(), td=tr.insertCell();td.colSpan=8;td.textContent='No organisations match the current filters.';return; }
  for (const r of rows) {
    const tr = tb.insertRow();
    for (const key of ['organisation','city','country','organisation_type','data_focus','tools_used','ai_interests','website']) {
      const td = tr.insertCell();
      if (key==='website') {
        const url=safeWebURL(r.website);
        if(url) {const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Website';td.append(a);}
      } else td.textContent = clean(r[key]);
    }
  }
}
function showError(message) { E('error').hidden = false; E('error').textContent = message; }
// RFC-style CSV parser: handles commas, quoted text, embedded newlines and escaped double quotes.
function parseCSV(text) {
  const fields=[], rows=[];let field='',row=[],quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if (c==='"') { if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted; }
    else if(c===',' && !quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){ if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(x=>x.trim()))rows.push(row);row=[]; }
    else field+=c;
  }
  if(quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(!rows.length) throw new Error('CSV is empty.');
  const headers=rows.shift().map(h=>h.trim().toLowerCase());
  const required=['organisation','consent_map','show_on_map','organisation_type'];
  for (const col of required) if(!headers.includes(col)) throw new Error(`Missing column: ${col}`);
  if(!headers.includes('map_latitude')&&!headers.includes('latitude')) throw new Error('Missing latitude column');
  if(!headers.includes('map_longitude')&&!headers.includes('longitude')) throw new Error('Missing longitude column');
  return rows.map(values=>Object.fromEntries(headers.map((k,j)=>[k,values[j]||''])));
}
E('search').addEventListener('input',render);
E('reset').addEventListener('click',()=>{E('search').value='';for(const box of E('type-checkboxes').querySelectorAll('input'))box.checked=true;render();});
E('csv-upload').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try {
    const records=filterConsent(parseCSV(await file.text()));
    setData(records,`Showing local CSV: ${file.name} (browser only)`);
  } catch(err) { showError(`Couldn't read CSV: ${err.message}`); }
});
(async function load(){
  try {
    const response=await fetch(`./data.json?ts=${Date.now()}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    if(!Array.isArray(payload.organisations))throw new Error('Unexpected data format');
    // Current build_data.py emits *only* approved records.
    setData(payload.organisations,`Last data update: ${new Date(payload.updated_at).toLocaleString()}`);
  } catch(err) { E('count').textContent='Map data unavailable'; showError(`Unable to load published map data (${err.message}). Use the optional CSV upload as a temporary backup.`); }
})();
