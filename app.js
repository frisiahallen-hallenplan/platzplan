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
const dayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const dayNamesLong = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const storageKey = 'platzplan-events-v1';
const googleSheetUrl = 'https://script.google.com/macros/s/AKfycbxDuJAJ2cbEV0tCI8QBCe8t1WWQpBxwTLfGJgOvBAdcC2Pm3Ihp622v3bfNl80h56oHUw/exec';
const hallFilter = { value: platzKnoepfe[1][0] }; // A-Platz
const hallInput = document.querySelector('#hallInput');
const planner = document.querySelector('#planner');
const dialog = document.querySelector('#eventDialog');
const detailsDialog = document.querySelector('#detailsDialog');
const form = document.querySelector('#eventForm');
let currentDate = startOfDay(new Date());
let events = JSON.parse(localStorage.getItem(storageKey) || 'null') || seedEvents();
halls.forEach(hall => hallInput.add(new Option(hall, hall)));
platzKnoepfe.forEach(([plaetze, label, klasse]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `hall-button ${klasse}`;
  button.textContent = label;
  button.setAttribute('aria-pressed', String(plaetze === hallFilter.value));
  button.addEventListener('click', () => {
    hallFilter.value = plaetze;
    document.querySelectorAll('#hallButtons .hall-button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    render();
  });
  document.querySelector('#hallButtons').append(button);
});

function startOfDay(date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }
function formatDate(date, options = {}) { return new Intl.DateTimeFormat('de-DE', options).format(date); }
function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function weekStart(date) { const result = startOfDay(date); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; }
function seedEvents() { return []; }
function makeEvent(title, hall, date, start, end, type, recurring, days, until = '') { return { id: crypto.randomUUID(), title, hall, date: isoDate(date), start, end, type, recurring, days, frequency: 'weekly', until }; }
function makeBiweekly(title, hall, date, start, end, type, recurring, days, until = '') { const event = makeEvent(title, hall, date, start, end, type, recurring, days, until); event.frequency = 'biweekly'; return event; }
function addDays(date, number) { const result = new Date(date); result.setDate(result.getDate() + number); return result; }
function save() { localStorage.setItem(storageKey, JSON.stringify(events)); }
function parseSheetDate(value) {
  const parts = String(value).split(/[./-]/);
  if (parts.length !== 3) return '';
  if (parts[0].length === 4) return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  return `${parts[2].length === 2 ? `20${parts[2]}` : parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}
function parseSheetEvents(rows) {
  const dayNumbers = { Sonntag: 0, Montag: 1, Dienstag: 2, Mittwoch: 3, Donnerstag: 4, Freitag: 5, Samstag: 6 };
  return rows.map(row => {
    const recurring = String(row.Wiederholung || '').toLowerCase().includes('woche');
    const type = String(row.Art || '').toLowerCase().includes('spiel') ? 'game' : String(row.Art || '').toLowerCase().includes('veranstaltung') ? 'event' : 'training';
    return { id: crypto.randomUUID(), title: row.Termin || 'Termin', hall: row.Platz || halls[0], date: parseSheetDate(row.Datum), start: row.Beginn || '17:00', end: row.Ende || '18:00', type, recurring, days: recurring ? [dayNumbers[row.Wochentag]] : [], frequency: String(row.Wiederholung || '').toLowerCase().includes('2') ? 'biweekly' : 'weekly', until: parseSheetDate(row['Gültig bis']) };
  }).filter(event => event.date && event.hall);
}
async function loadGoogleEvents() {
  try {
    const response = await fetch(googleSheetUrl);
    if (!response.ok) throw new Error(`Google antwortet mit ${response.status}`);
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unerwartetes Datenformat');
    const imported = parseSheetEvents(rows);
    if (imported.length) { events = imported; save(); render(); toast('Google-Termine geladen.'); }
  } catch (error) {
    console.warn('Google-Termine konnten nicht geladen werden:', error);
  }
}
function occurrences(from, to) { const result = []; events.forEach(event => { const first = new Date(`${event.date}T00:00:00`); const limit = event.until ? new Date(`${event.until}T23:59:59`) : to; for (let date = new Date(from); date <= to && date <= limit; date = addDays(date, 1)) { const matches = event.recurring ? (event.days || []).includes(date.getDay()) && date >= first : isoDate(date) === event.date; const weeks = Math.floor((date - first) / 604800000); if (matches && (!event.recurring || event.frequency !== 'biweekly' || weeks % 2 === 0)) result.push({ ...event, occurrenceDate: isoDate(date) }); } }); return result; }
function renderMonth() {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const gridStart = weekStart(monthStart);
  const gridEnd = addDays(weekStart(addDays(monthEnd, 1)), 6);
  const visible = occurrences(gridStart, gridEnd).filter(event => hallFilter.value.includes(event.hall));
  document.querySelector('#weekTitle').textContent = formatDate(monthStart, { month: 'long', year: 'numeric' });
  document.querySelector('#dateRange').textContent = `${formatDate(monthStart, { day: '2-digit', month: '2-digit', year: '2-digit' })} - ${formatDate(monthEnd, { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
  document.querySelector('#eventCount').textContent = `${visible.length} ${visible.length === 1 ? 'Termin' : 'Termine'}`;
  const weekdays = dayNames.slice(1).concat(dayNames[0]).map(day => `<div class="month-weekday">${day}</div>`).join('');
  const cells = [];
  for (let date = new Date(gridStart); date <= gridEnd; date = addDays(date, 1)) {
    const dayEvents = visible.filter(event => event.occurrenceDate === isoDate(date));
    const classes = `${date.getMonth() !== monthStart.getMonth() ? 'other-month' : ''} ${isoDate(date) === isoDate(new Date()) ? 'today' : ''}`;
    const cards = dayEvents.slice(0, 5).map(event => `<div class="month-event ${hallClasses[event.hall] || ''}" data-id="${event.id}" title="${event.title} · ${event.start} - ${event.end}">${event.start} ${event.title}</div>`).join('');
    const more = dayEvents.length > 5 ? `<div class="month-more">+ ${dayEvents.length - 5} weitere</div>` : '';
    cells.push(`<div class="month-day ${classes}"><div class="month-day-number">${date.getDate()}</div>${cards}${more}</div>`);
  }
  planner.innerHTML = `<div class="month-grid">${weekdays}${cells.join('')}</div>`;
  planner.querySelectorAll('.month-event').forEach(item => item.addEventListener('click', () => openDetails(item.dataset.id)));
}
function renderWeekCompact(days, visible) {
  const heads = days.map(day => {
    const active = isoDate(day) === isoDate(new Date()) ? 'active' : '';
    return `<div class="week-compact-head ${active}">${dayNames[day.getDay()]}<strong>${String(day.getDate()).padStart(2, '0')}</strong></div>`;
  }).join('');
  const cells = days.map(day => {
    const dayEvents = visible.filter(event => event.occurrenceDate === isoDate(day)).sort((a, b) => a.start.localeCompare(b.start));
    const chips = dayEvents.slice(0, 6).map(event => `<div class="week-compact-event ${hallClasses[event.hall] || ''}" data-id="${event.id}" title="${event.title} · ${event.start} - ${event.end} · ${event.hall}">${event.start}</div>`).join('');
    const more = dayEvents.length > 6 ? `<div class="week-compact-more">+${dayEvents.length - 6}</div>` : '';
    return `<div class="week-compact-day">${chips}${more}</div>`;
  }).join('');
  return `<div class="week-compact">${heads}${cells}</div>`;
}
function render() {
  const view = document.querySelector('#viewSelect').value;
  if (view === 'month') { renderMonth(); return; }
  const isDay = view === 'day';
  const start = isDay ? currentDate : weekStart(currentDate);
  const end = isDay ? currentDate : addDays(start, 6);
  const visible = occurrences(start, end).filter(event => hallFilter.value.includes(event.hall));
  const range = isDay
    ? formatDate(start, { day: '2-digit', month: '2-digit', year: '2-digit' })
    : `${formatDate(start, { day: '2-digit', month: '2-digit', year: '2-digit' })} - ${formatDate(end, { day: '2-digit', month: '2-digit', year: '2-digit' })}`;
  document.querySelector('#dateRange').textContent = range;
  document.querySelector('#weekTitle').textContent = isDay ? dayNamesLong[start.getDay()] : 'Diese Woche';
  document.querySelector('#eventCount').textContent = `${visible.length} ${visible.length === 1 ? 'Termin' : 'Termine'}`;
  const days = isDay ? [start] : Array.from({ length: 7 }, (_, index) => addDays(start, index));
  if (!isDay && window.matchMedia('(max-width: 950px)').matches) {
    planner.innerHTML = renderWeekCompact(days, visible);
    planner.querySelectorAll('.week-compact-event').forEach(item => item.addEventListener('click', () => openDetails(item.dataset.id)));
    return;
  }
  const headers = days.map(day => {
    const active = isoDate(day) === isoDate(new Date()) ? 'active' : '';
    return `<div class="day-head ${active}">${dayNames[day.getDay()]}<strong>${String(day.getDate()).padStart(2, '0')}</strong></div>`;
  }).join('');
  let html = `<div class="planner-grid ${isDay ? 'day-view' : ''}"><div class="day-head"></div>${headers}`;
  for (let hour = 8; hour <= 21; hour++) {
    html += `<div class="time-label">${String(hour).padStart(2, '0')}:00</div>`;
    html += days.map(day => {
      const dayEvents = visible.filter(event => event.occurrenceDate === isoDate(day) && Number(event.start.slice(0, 2)) === hour);
      const cards = dayEvents.map(event => `<article class="event ${event.type} ${hallClasses[event.hall] || ''}" data-id="${event.id}"><strong>${event.title}</strong><small>${event.start} - ${event.end} · ${event.hall}</small></article>`).join('');
      return `<div class="day-column">${cards}</div>`;
    }).join('');
  }
  planner.innerHTML = `${html}</div>`;
  planner.querySelectorAll('.event').forEach(item => item.addEventListener('click', () => openDetails(item.dataset.id)));
}
function openDetails(id) {
  const event = events.find(item => item.id === id);
  if (!event) return;
  document.querySelector('#detailsTitle').textContent = event.title;
  document.querySelector('#detailsHall').textContent = [event.hall, stadionVon(event.hall)].filter(Boolean).join(' · ');
  document.querySelector('#detailsDate').textContent = formatDate(new Date(`${event.date}T00:00:00`), { day: '2-digit', month: '2-digit', year: 'numeric' });
  document.querySelector('#detailsTime').textContent = `${event.start} - ${event.end} Uhr`;
  document.querySelector('#detailsType').textContent = event.type === 'game' ? 'Spiel' : event.type === 'event' ? 'Veranstaltung' : 'Training';
  document.querySelector('#detailsRepeat').textContent = event.recurring ? event.frequency === 'biweekly' ? 'Alle 2 Wochen' : `Jede Woche${event.until ? ` bis ${formatDate(new Date(`${event.until}T00:00:00`), { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}` : 'Einmaliger Termin';
  detailsDialog.showModal();
}
function openDialog(id = '') { const event = events.find(item => item.id === id); document.querySelector('#dialogTitle').textContent = event ? 'Termin bearbeiten' : 'Neuer Termin'; document.querySelector('#eventId').value = event?.id || ''; document.querySelector('#titleInput').value = event?.title || ''; document.querySelector('#hallInput').value = event?.hall || halls[0]; document.querySelector('#dateInput').value = event?.date || isoDate(currentDate); document.querySelector('#startInput').value = event?.start || '17:00'; document.querySelector('#endInput').value = event?.end || '18:30'; document.querySelector('#typeInput').value = event?.type || 'training'; document.querySelector('#recurringInput').checked = event?.recurring || false; document.querySelector('#frequencyInput').value = event?.frequency || 'weekly'; document.querySelector('#untilInput').value = event?.until || ''; document.querySelectorAll('#dayPicker input').forEach(input => input.checked = event?.days?.includes(Number(input.value)) || (!event && Number(input.value) === new Date().getDay())); toggleRecurrence(); document.querySelector('#deleteButton').style.visibility = event ? 'visible' : 'hidden'; dialog.showModal(); }
function toggleRecurrence() { document.querySelector('#recurrenceFields').classList.toggle('visible', document.querySelector('#recurringInput').checked); }
function toast(message) { const item = document.querySelector('#toast'); item.textContent = message; item.classList.add('show'); setTimeout(() => item.classList.remove('show'), 2200); }
['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].forEach((day, index) => { const label = document.createElement('label'); label.className = 'day-choice'; label.innerHTML = `<input type="checkbox" value="${index}">${day}`; document.querySelector('#dayPicker').append(label); });
document.querySelector('#recurringInput').addEventListener('change', toggleRecurrence); document.querySelector('#previousWeek').addEventListener('click', () => { const view = document.querySelector('#viewSelect').value; currentDate = view === 'month' ? new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1) : addDays(currentDate, view === 'day' ? -1 : -7); render(); }); document.querySelector('#nextWeek').addEventListener('click', () => { const view = document.querySelector('#viewSelect').value; currentDate = view === 'month' ? new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1) : addDays(currentDate, view === 'day' ? 1 : 7); render(); }); document.querySelector('#todayButton').addEventListener('click', () => { currentDate = startOfDay(new Date()); render(); }); document.querySelector('#viewSelect').addEventListener('change', render); document.querySelector('#helpButton').addEventListener('click', () => toast('Die Termine werden über Google Sheets verwaltet.'));
form.addEventListener('submit', event => { event.preventDefault(); const id = document.querySelector('#eventId').value; const data = { id: id || crypto.randomUUID(), title: document.querySelector('#titleInput').value.trim(), hall: hallInput.value, date: document.querySelector('#dateInput').value, start: document.querySelector('#startInput').value, end: document.querySelector('#endInput').value, type: document.querySelector('#typeInput').value, recurring: document.querySelector('#recurringInput').checked, frequency: document.querySelector('#frequencyInput').value, days: [...document.querySelectorAll('#dayPicker input:checked')].map(input => Number(input.value)), until: document.querySelector('#untilInput').value }; if (data.recurring && !data.days.length) { toast('Bitte mindestens einen Wochentag wählen.'); return; } events = id ? events.map(item => item.id === id ? data : item) : [...events, data]; save(); dialog.close(); render(); toast(id ? 'Termin aktualisiert.' : 'Termin hinzugefügt.'); }); document.querySelector('#deleteButton').addEventListener('click', () => { const id = document.querySelector('#eventId').value; events = events.filter(item => item.id !== id); save(); dialog.close(); render(); toast('Termin gelöscht.'); });
let resizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
window.addEventListener('orientationchange', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 150); });
render();
loadGoogleEvents();
