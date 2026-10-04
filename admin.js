// Bearbeitungs-Oberfläche für den Platzplan.
// Liest/schreibt über denselben Apps-Script-Endpunkt wie der öffentliche Plan.

// Sichtbares Fehler-Banner (wichtig auf Handys, wo man keine Browser-Konsole öffnen kann).
(function () {
  function zeigeFehlerBanner(msg) {
    let el = document.getElementById('globalErrorBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalErrorBanner';
      el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#c0392b;color:#fff;' +
        'padding:10px 14px;font:12px/1.4 sans-serif;z-index:99999;white-space:pre-wrap;';
      document.body.appendChild(el);
    }
    el.textContent = '⚠️ Technischer Fehler: ' + msg + ' — bitte Screenshot hiervon schicken.';
  }
  window.addEventListener('error', e => zeigeFehlerBanner(`${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`));
  window.addEventListener('unhandledrejection', e => zeigeFehlerBanner(String(e.reason && e.reason.message ? e.reason.message : e.reason)));
})();

const ENDPOINT = 'https://script.google.com/macros/s/AKfycbxDuJAJ2cbEV0tCI8QBCe8t1WWQpBxwTLfGJgOvBAdcC2Pm3Ihp622v3bfNl80h56oHUw/exec';
const PW_KEY = 'platzplan-admin-pw';
const halls = ['A-Platz', 'B-Platz', 'C-Platz', 'Faustballplatz', 'Kunstrasenplatz', 'Rasenplatz'];
const hallClasses = {
  'A-Platz': 'platz-a',
  'B-Platz': 'platz-b',
  'C-Platz': 'platz-c',
  'Faustballplatz': 'platz-faust',
  'Kunstrasenplatz': 'platz-kunst',
  'Rasenplatz': 'platz-rasen'
};
const NIKO_NISSEN = ['A-Platz', 'B-Platz', 'C-Platz', 'Faustballplatz'];
const HELMUT_HENNIG = ['Kunstrasenplatz', 'Rasenplatz'];
const stadien = { 'Niko-Nissen-Stadion': NIKO_NISSEN, 'Helmut-Hennig-Stadion': HELMUT_HENNIG };
function stadionVon(platz) { return Object.keys(stadien).find(name => stadien[name].includes(platz)) || ''; }
// [Plätze, Beschriftung, CSS-Klasse] – ein Knopf kann mehrere Plätze anzeigen
const platzKnoepfe = [
  [NIKO_NISSEN, 'Niko-Nissen-Stadion', 'stadion stadion-nns'],
  [['A-Platz'], 'A-Platz', 'platz-a'],
  [['B-Platz'], 'B-Platz', 'platz-b'],
  [['C-Platz'], 'C-Platz', 'platz-c'],
  [['Faustballplatz'], 'Faustball', 'platz-faust'],
  [HELMUT_HENNIG, 'Helmut-Hennig-Stadion', 'stadion stadion-hhs'],
  [['Kunstrasenplatz'], 'Kunstrasen', 'platz-kunst'],
  [['Rasenplatz'], 'Rasen', 'platz-rasen'],
  [halls, 'Alle Plätze', 'stadion hall-all']
];
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const SPALTEN = ['Platz', 'Termin', 'Wochentag', 'Datum', 'Beginn', 'Ende', 'Wiederholung', 'Gültig bis', 'Art'];

const $ = id => document.getElementById(id);
const loginBox = $('loginBox'), editorBox = $('editorBox'), eventList = $('eventList');
const eventDialog = $('eventDialog'), eventForm = $('eventForm'), importDialog = $('importDialog');

let passwort = '';
try { passwort = localStorage.getItem(PW_KEY) || ''; } catch (e) {}
let termine = [];
let importListe = [];

halls.forEach(h => $('hallInput').add(new Option(h, h)));
const hallFilterEl = { value: platzKnoepfe[1][0] }; // A-Platz
platzKnoepfe.forEach(([plaetze, label, klasse]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hall-button ${klasse}`;
  button.textContent = label;
  button.setAttribute('aria-pressed', String(plaetze === hallFilterEl.value));
  button.addEventListener('click', () => {
    hallFilterEl.value = plaetze;
    document.querySelectorAll('#hallButtons .hall-button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderListe();
  });
  document.querySelector('#hallButtons').append(button);
});

// ---------- Datum / Zeit ----------
function parseSheetDate(value) {
  const parts = String(value).trim().split(/[./-]/);
  if (parts.length !== 3) return '';
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  return `${parts[2].length === 2 ? `20${parts[2]}` : parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}
function isoToGerman(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function normZeit(v) {
  const s = String(v || '').trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return s;
  let h = parseInt(m[1], 10);
  if (/pm/i.test(s) && h < 12) h += 12;
  if (/am/i.test(s) && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

// ---------- Helfer ----------
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(message) {
  const item = $('toast');
  item.textContent = message;
  item.classList.add('show');
  setTimeout(() => item.classList.remove('show'), 2600);
}
function istWiederkehrend(t) { return /woche/i.test(t.Wiederholung || ''); }
function ist14tägig(t) { return /2|zwei/i.test(t.Wiederholung || ''); }

// ---------- Netzwerk ----------
async function apiGet() {
  const r = await fetch(ENDPOINT);
  return r.json();
}
async function apiPost(payload, versuch) {
  versuch = versuch || 1;
  console.log(`[Platzplan-Admin] sende (Versuch ${versuch}):`, JSON.stringify(payload));
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
    const text = await r.text();
    console.log('[Platzplan-Admin] Antwort (roh):', text);
    const json = JSON.parse(text);
    console.log('[Platzplan-Admin] Antwort (JSON):', json);
    return json;
  } catch (e) {
    console.warn(`[Platzplan-Admin] Versuch ${versuch} fehlgeschlagen:`, e);
    // Apps Script hat gelegentlich einen kurzen Aussetzer beim Umleiten der Antwort –
    // ein zweiter Versuch nach kurzer Pause behebt das meist von selbst.
    if (versuch < 2) {
      await new Promise(resolve => setTimeout(resolve, 900));
      return apiPost(payload, versuch + 1);
    }
    return null;
  }
}

// ---------- Login ----------
async function versuchLogin(pw) {
  const res = await apiPost({ aktion: 'pruefen', passwort: pw });
  if (res && res.ok) {
    passwort = pw;
    try { localStorage.setItem(PW_KEY, pw); } catch (e) {}
    loginBox.hidden = true;
    editorBox.hidden = false;
    await ladeListe();
    return true;
  }
  return false;
}
$('loginButton').onclick = async () => {
  const pw = $('pwInput').value;
  if (!pw) {
    $('loginError').textContent = 'Bitte zuerst ein Passwort eingeben.';
    $('loginError').hidden = false;
    return;
  }
  $('loginError').hidden = true;
  $('loginButton').disabled = true;
  $('loginButton').textContent = 'Prüfe …';
  try {
    const ok = await versuchLogin(pw);
    if (!ok) { $('loginError').textContent = 'Passwort falsch oder Server nicht erreichbar.'; $('loginError').hidden = false; }
  } finally {
    $('loginButton').disabled = false;
    $('loginButton').textContent = 'Anmelden';
  }
};
$('pwInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginButton').click(); });

// ---------- Liste ----------
function nichtLeer(r) { return String(r.Termin || '').trim() !== '' || String(r.Platz || '').trim() !== ''; }
const wtOrder = { 'Montag': 1, 'Dienstag': 2, 'Mittwoch': 3, 'Donnerstag': 4, 'Freitag': 5, 'Samstag': 6, 'Sonntag': 7 };
function sortKey(t) {
  return istWiederkehrend(t)
    ? `1_${wtOrder[t.Wochentag] || 9}_${t.Beginn || ''}`
    : `2_${parseSheetDate(t.Datum) || '9999'}_${t.Beginn || ''}`;
}

async function ladeListe() {
  const rows = await apiGet();
  termine = Array.isArray(rows) ? rows.filter(nichtLeer) : [];
  renderListe();
}
function renderListe() {
  const hallwahl = hallFilterEl.value;
  const alle = hallwahl === halls;
  const gefiltert = alle ? termine : termine.filter(t => hallwahl.includes(t.Platz));
  $('listCount').textContent = alle
    ? `${termine.length} ${termine.length === 1 ? 'Termin' : 'Termine'}`
    : `${gefiltert.length} von ${termine.length} Terminen`;
  if (!gefiltert.length) {
    eventList.innerHTML = `<div class="admin-empty">${termine.length ? 'Keine Termine für diese Auswahl.' : 'Noch keine Termine.'}</div>`;
    return;
  }
  const sorted = [...gefiltert].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  eventList.innerHTML = sorted.map(zeileHtml).join('');
  eventList.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => oeffneDialog(b.dataset.edit));
  eventList.querySelectorAll('[data-del]').forEach(b => b.onclick = () => loesche(b.dataset.del));
}
function zeileHtml(t) {
  const meta = istWiederkehrend(t)
    ? `${t.Wochentag || '?'}${ist14tägig(t) ? ' (14-tägig)' : ''} · ${t.Beginn || '?'}–${t.Ende || '?'}${t['Gültig bis'] ? ' · bis ' + t['Gültig bis'] : ''}`
    : `${t.Datum || '?'} · ${t.Beginn || '?'}–${t.Ende || '?'}`;
  return `<div class="admin-row">
    <span class="admin-dot ${hallClasses[t.Platz] || ''}"></span>
    <div class="admin-row-main"><strong>${escapeHtml(t.Termin || 'Ohne Titel')}</strong><span>${escapeHtml(t.Platz || '–')} · ${escapeHtml(meta)}</span></div>
    <div class="admin-actions"><button data-edit="${escapeHtml(t.ID)}">Bearbeiten</button><button class="del" data-del="${escapeHtml(t.ID)}">Löschen</button></div>
  </div>`;
}

// ---------- Dialog ----------
function toggleRecurrence() {
  $('recurrenceFields').classList.toggle('visible', $('recurringInput').checked);
}
$('recurringInput').addEventListener('change', toggleRecurrence);

function oeffneDialog(id) {
  const t = id ? termine.find(x => String(x.ID) === String(id)) : null;
  $('dialogTitle').textContent = t ? 'Termin bearbeiten' : 'Neuer Termin';
  $('eventId').value = t ? t.ID : '';
  $('titleInput').value = t ? (t.Termin || '') : '';
  $('hallInput').value = t ? (t.Platz || halls[0]) : halls[0];
  $('dateInput').value = t ? parseSheetDate(t.Datum) : todayIso();
  $('startInput').value = t ? (normZeit(t.Beginn) || '17:00') : '17:00';
  $('endInput').value = t ? (normZeit(t.Ende) || '18:30') : '18:30';
  $('typeInput').value = t ? normArt(t.Art) : 'Training';
  const wk = t ? istWiederkehrend(t) : false;
  $('recurringInput').checked = wk;
  $('frequencyInput').value = t && ist14tägig(t) ? 'Alle 2 Wochen' : 'Jede Woche';
  $('weekdayInput').value = (t && t.Wochentag && WOCHENTAGE.includes(t.Wochentag)) ? t.Wochentag : 'Montag';
  $('untilInput').value = t && t['Gültig bis'] ? parseSheetDate(t['Gültig bis']) : '';
  toggleRecurrence();
  $('deleteButton').style.visibility = t ? 'visible' : 'hidden';
  eventDialog.showModal();
}
$('newButton').onclick = () => oeffneDialog('');
$('dialogClose').onclick = () => eventDialog.close();
$('cancelButton').onclick = () => eventDialog.close();
$('deleteButton').onclick = () => { const id = $('eventId').value; eventDialog.close(); if (id) loesche(id); };

eventForm.addEventListener('submit', async e => {
  e.preventDefault();
  const wk = $('recurringInput').checked;
  console.log('[Platzplan-Admin] Formular: wiederkehrend =', wk, '| Wochentag-Auswahl =', $('weekdayInput').value);
  const t = {
    ID: $('eventId').value || '',
    Platz: $('hallInput').value,
    Termin: $('titleInput').value.trim(),
    Wochentag: wk ? $('weekdayInput').value : '',
    Datum: isoToGerman($('dateInput').value),
    Beginn: $('startInput').value,
    Ende: $('endInput').value,
    Wiederholung: wk ? $('frequencyInput').value : '',
    'Gültig bis': wk && $('untilInput').value ? isoToGerman($('untilInput').value) : '',
    Art: $('typeInput').value
  };
  if (!t.Termin) { toast('Bitte eine Bezeichnung eingeben.'); return; }
  eventDialog.close();
  await sende(
    t.ID ? { aktion: 'aendern', passwort, termin: t } : { aktion: 'anlegen', passwort, termin: t },
    t.ID ? 'Termin geändert.' : 'Termin hinzugefügt.'
  );
});

async function loesche(id) {
  const t = termine.find(x => String(x.ID) === String(id));
  if (!confirm(`„${t ? t.Termin : 'Termin'}" wirklich löschen?`)) return;
  await sende({ aktion: 'loeschen', passwort, id }, 'Termin gelöscht.');
}

async function sende(payload, erfolgstext) {
  toast('Speichern …');
  const res = await apiPost(payload);
  if (res && res.ok && Array.isArray(res.termine)) {
    termine = res.termine.filter(nichtLeer);
    renderListe();
    toast(erfolgstext);
  } else if (res && res.ok) {
    await ladeListe();
    toast(erfolgstext);
  } else if (res && res.fehler) {
    toast('Fehler: ' + res.fehler);
  } else {
    await ladeListe();
    toast(erfolgstext + ' – bitte in der Liste prüfen.');
  }
}

// ---------- Import ----------
function normPlatz(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('faust')) return 'Faustballplatz';
  if (s.includes('kunst')) return 'Kunstrasenplatz';
  if (s.includes('rasen')) return 'Rasenplatz';
  const m = s.match(/^\s*([abc])(?:\s*-?\s*platz)?\s*$/);
  if (m) return `${m[1].toUpperCase()}-Platz`;
  return v || '';
}
function normArt(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('spiel')) return 'Spiel';
  if (s.includes('veranst')) return 'Veranstaltung';
  if (s.includes('train')) return 'Training';
  return v || 'Training';
}
function normWochentag(v) {
  const s = String(v || '').toLowerCase();
  return WOCHENTAGE.find(w => s.startsWith(w.slice(0, 2).toLowerCase())) || (WOCHENTAGE.includes(v) ? v : '');
}
function normKey(s) {
  return String(s).toLowerCase().replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/[^a-z0-9]/g, '');
}
function feld(o, ...namen) {
  const keys = Object.keys(o);
  for (const n of namen) {
    const k = keys.find(k => normKey(k) === normKey(n));
    if (k !== undefined) return String(o[k]).trim();
  }
  return '';
}
function zeileZuTermin(o) {
  const datum = feld(o, 'Datum', 'Date');
  const bis = feld(o, 'Gültig bis', 'Gueltig bis', 'bis', 'Enddatum', 'Ende Datum');
  return {
    Platz: normPlatz(feld(o, 'Platz', 'Halle', 'Ort')),
    Termin: feld(o, 'Termin', 'Bezeichnung', 'Titel', 'Name'),
    Wochentag: normWochentag(feld(o, 'Wochentag', 'Tag')),
    Datum: datum ? isoToGerman(parseSheetDate(datum)) || datum : '',
    Beginn: normZeit(feld(o, 'Beginn', 'Start', 'von', 'Uhrzeit')),
    Ende: normZeit(feld(o, 'Ende', 'bis Uhr', 'Schluss')),
    Wiederholung: feld(o, 'Wiederholung', 'Rhythmus', 'Turnus'),
    'Gültig bis': bis ? isoToGerman(parseSheetDate(bis)) || bis : '',
    Art: normArt(feld(o, 'Art', 'Typ', 'Kategorie'))
  };
}

function splitCsvLine(line, delim) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
async function leseCsv(file) {
  const text = await file.text();
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return [];
  const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const headers = splitCsvLine(lines[0], delim);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line, delim);
    const o = {};
    headers.forEach((h, i) => { o[h] = (cells[i] || '').trim(); });
    return o;
  });
}
async function leseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (!matrix.length) return [];
  const headers = matrix[0].map(h => String(h).trim());
  return matrix.slice(1)
    .filter(r => r.some(c => String(c).trim() !== ''))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = String(r[i] == null ? '' : r[i]).trim(); });
      return o;
    });
}

$('importButton').onclick = () => $('fileInput').click();
$('fileInput').onchange = async () => {
  const file = $('fileInput').files[0];
  $('fileInput').value = '';
  if (!file) return;
  try {
    const rows = /\.csv$/i.test(file.name) ? await leseCsv(file) : await leseExcel(file);
    const liste = rows.map(zeileZuTermin).filter(t => t.Termin || t.Platz);
    if (!liste.length) { toast('Keine verwertbaren Zeilen in der Datei gefunden.'); return; }
    zeigeImport(liste);
  } catch (err) {
    console.error(err);
    toast('Datei konnte nicht gelesen werden.');
  }
};
function zeigeImport(liste) {
  importListe = liste;
  $('importInfo').textContent = `${liste.length} Zeile${liste.length === 1 ? '' : 'n'} erkannt. Vorschau der ersten 5:`;
  $('importPreview').innerHTML =
    '<table><thead><tr>' + SPALTEN.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>' +
    liste.slice(0, 5).map(t => '<tr>' + SPALTEN.map(c => `<td>${escapeHtml(t[c] || '')}</td>`).join('') + '</tr>').join('') +
    '</tbody></table>';
  importDialog.showModal();
}
$('importClose').onclick = () => importDialog.close();
$('importCancel').onclick = () => importDialog.close();
$('importReplace').onclick = async () => {
  if (!confirm('Wirklich ALLE bestehenden Termine durch die Datei ersetzen? Das kann über die Google-Sheets-Versionshistorie rückgängig gemacht werden.')) return;
  importDialog.close();
  await sende({ aktion: 'ersetzen', passwort, termine: importListe }, `${importListe.length} Termine importiert (ersetzt).`);
};
$('importAppend').onclick = async () => {
  importDialog.close();
  await sende({ aktion: 'ergaenzen', passwort, termine: importListe }, `${importListe.length} Termine ergänzt.`);
};

// ---------- Start ----------
if (passwort) {
  versuchLogin(passwort).then(ok => { if (!ok) { try { localStorage.removeItem(PW_KEY); } catch (e) {} } });
}
