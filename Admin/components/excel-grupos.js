import {
  db as userDb,
  ref as userRef,
  remove as userRemove
} from '../../Firebase/firebase.js';

import {
  db as adminDb,
  ref as adminRef,
  set as adminSet,
  remove as adminRemove
} from '../../Firebase/firebase-admin.js';

import {
  db as gruposDb,
  ref as gruposRef,
  set as gruposSet,
  onValue as gruposOnValue
} from '../../Firebase/Inducciones-Grupos.js';

const DB_ADMIN_ESTUDIANTES = 'admin_estudiantes';
const DB_ASIST = 'asistencias';
const DB_GRUPOS = 'grupos';

const $ = id => document.getElementById(id);

const excelFileInput        = $('excelFileInput');
const openExcelModalBtn     = $('openExcelModalBtn');
const excelSelectedInfo     = $('excelSelectedInfo');
const excelModalBackdrop    = $('excelModalBackdrop');
const closeExcelModalBtn    = $('closeExcelModalBtn');
const cancelExcelBtn        = $('cancelExcelBtn');
const prepareExcelBtn       = $('prepareExcelBtn');
const excelFileName         = $('excelFileName');
const excelSheetName        = $('excelSheetName');
const excelRowCount         = $('excelRowCount');
const excelHeadersList      = $('excelHeadersList');
const mapCedulaSelect       = $('mapCedulaSelect');
const mapNombresSelect      = $('mapNombresSelect');
const mapCarreraSelect      = $('mapCarreraSelect');
const excelPreviewHead      = $('excelPreviewHead');
const excelPreviewBody      = $('excelPreviewBody');
const migrarBtn             = $('migrarBtn');
const grupoModalBackdrop    = $('grupoModalBackdrop');
const grupoNombreInput      = $('grupoNombreInput');
const confirmarGrupoBtn     = $('confirmarGrupoBtn');
const cancelarGrupoBtn      = $('cancelarGrupoBtn');
const closeGrupoModalBtn    = $('closeGrupoModalBtn');
const gruposListContainer   = $('gruposListContainer');
const gruposEmptyState      = $('gruposEmptyState');

let listenersGruposIniciados = false;
let obtenerRegistrosActuales = () => ({});
let gruposData = {};

const gruposSearchState  = {};
const gruposCarreraState = {};

let excelState = {
  file: null, fileName: '', sheetName: '',
  headers: [], rows: [], rowsFormatted: [],
  mapping: { cedula: '', nombres: '', carrera: '' }
};


/* ══════════════════════════════════════════════════════════════
   ESTILOS — se inyectan UNA SOLA VEZ en el <head>
══════════════════════════════════════════════════════════════ */

function injectGruposStyles() {
  if (document.getElementById('grupos-dynamic-styles')) return;
  const style = document.createElement('style');
  style.id = 'grupos-dynamic-styles';
  style.textContent = `
    /* ── KPIs ── */
    .grupo-card__kpis {
      display: flex; align-items: center;
      padding: 16px 24px 0;
      border-top: 1px solid rgba(255,255,255,.06);
      margin-top: 14px;
    }
    .gc-kpi { flex: 1; text-align: center; padding: 8px 4px; }
    .gc-kpi__val {
      font-size: 1.6rem; font-weight: 800; line-height: 1;
      color: #e2e8f0; letter-spacing: -.02em;
    }
    .gc-kpi__val--pct { color: var(--kpi-color, #e2e8f0); }
    .gc-kpi__lbl {
      font-size: .67rem; font-weight: 600; letter-spacing: .08em;
      text-transform: uppercase; color: #475569; margin-top: 4px;
    }
    .gc-kpi--ok  .gc-kpi__val { color: #4ade80; }
    .gc-kpi--bad .gc-kpi__val { color: #f87171; }
    .gc-kpi-divider { width: 1px; height: 36px; background: rgba(255,255,255,.07); flex-shrink: 0; }

    /* ── Progress bar ── */
    .grupo-card__progress-row { padding: 12px 24px 0; }
    .grupo-card__progress-track {
      height: 4px; background: rgba(255,255,255,.07); border-radius: 99px; overflow: hidden;
    }
    .grupo-card__progress-fill { height: 100%; border-radius: 99px; transition: width .6s cubic-bezier(.4,0,.2,1); }

    /* ── Meta icons ── */
    .grupo-card__meta svg { width: 11px; height: 11px; vertical-align: -1px; margin-right: 3px; }

    /* ── Panel carreras ── */
    .gc-panel {
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 14px;
      padding: 20px 24px 16px;
      margin: 0 0 20px;
    }
    .gc-panel-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
    }
    .gc-panel-title {
      display: flex; align-items: center; gap: 8px;
      font-size: .78rem; font-weight: 600; letter-spacing: .08em;
      text-transform: uppercase; color: #64748b;
    }
    .gc-panel-title svg { width: 14px; height: 14px; }
    .gc-panel-count {
      margin-left: auto;
      font-size: .72rem; font-weight: 600; color: #475569;
      background: rgba(255,255,255,.06);
      padding: 2px 10px; border-radius: 99px;
      border: 1px solid rgba(255,255,255,.08);
    }

    /* ── Botón "Todas" ── */
    .gc-filter-todas {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 14px; border-radius: 8px;
      border: 1px solid rgba(255,255,255,.1);
      background: rgba(255,255,255,.04); color: #64748b;
      font-size: .72rem; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all .15s;
      margin-bottom: 14px;
    }
    .gc-filter-todas:hover { background: rgba(255,255,255,.08); color: #e2e8f0; }
    .gc-filter-todas.gc-chip-active {
      background: rgba(37,99,235,.15);
      border-color: rgba(59,130,246,.4);
      color: #60a5fa;
    }

    /* ── Grid de tarjetas por carrera ── */
    .gc-carreras-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
      gap: 8px;
    }
    .gc-carrera-card {
      display: flex; flex-direction: column; gap: 8px;
      padding: 12px 14px; border-radius: 10px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.03);
      cursor: pointer; transition: all .15s;
    }
    .gc-carrera-card:hover {
      background: rgba(255,255,255,.07);
      border-color: rgba(255,255,255,.17);
      transform: translateY(-1px);
    }
    .gc-carrera-card.gc-chip-active {
      background: rgba(37,99,235,.1);
      border-color: rgba(59,130,246,.4);
    }
    .gc-card-top {
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 8px;
    }
    .gc-card-name {
      font-size: .75rem; font-weight: 600;
      color: #cbd5e1; line-height: 1.35; flex: 1;
    }
    .gc-card-pct {
      font-size: .95rem; font-weight: 800; flex-shrink: 0; line-height: 1;
      font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    }
    .gc-card-bar-track {
      height: 3px; background: rgba(255,255,255,.08);
      border-radius: 99px; overflow: hidden;
    }
    .gc-card-bar-fill {
      height: 100%; border-radius: 99px;
      transition: width .6s cubic-bezier(.4,0,.2,1);
    }
    .gc-card-bottom {
      display: flex; align-items: center;
      justify-content: space-between;
      font-size: .68rem; color: #475569;
    }
    .gc-card-dot {
      width: 6px; height: 6px; border-radius: 50%;
      flex-shrink: 0; display: inline-block; margin-right: 4px;
      vertical-align: middle;
    }
  `;
  document.head.appendChild(style);
}

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
══════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type = 'info') {
  const toastContainer = $('toastContainer');
  if (!toastContainer) return;
  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    warn:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = (icons[type] || '') + `<span>${escHtml(msg)}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

function rawToCedula(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return String(Math.round(v)).padStart(10, '0');
  const digits = String(v).replace(/\D/g, '').trim();
  if (!digits) return '';
  return digits.padStart(10, '0');
}

function rawToTexto(v) {
  if (v === null || v === undefined) return '';
  return String(v).normalize('NFC').trim();
}

function normalizeHeader(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/* Normaliza un string para comparaciones insensibles a tildes y ñ */
function normalizeStr(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .trim()
    .toLowerCase();
}

function suggestHeader(headers, candidates) {
  const norm = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));
  for (const c of candidates) {
    const found = norm.find(h => h.norm.includes(normalizeHeader(c)));
    if (found) return found.raw;
  }
  return '';
}

function configurarExcelGrupos(opciones = {}) {
  if (typeof opciones.obtenerRegistros === 'function') {
    obtenerRegistrosActuales = opciones.obtenerRegistros;
  }
}

/* ══════════════════════════════════════════════════════════════
   EXCEL
══════════════════════════════════════════════════════════════ */

function handleExcelFileChange() {
  const file = excelFileInput?.files?.[0];
  if (!file) { if (excelSelectedInfo) excelSelectedInfo.textContent = 'Ningún archivo seleccionado.'; return; }
  if (!/\.(xls|xlsx)$/i.test(file.name)) {
    excelFileInput.value = '';
    if (excelSelectedInfo) excelSelectedInfo.textContent = 'Archivo inválido.';
    toast('Solo se permiten archivos .xls o .xlsx', 'warn'); return;
  }
  if (excelSelectedInfo) excelSelectedInfo.textContent = `Archivo seleccionado: ${file.name}`;
  excelState.file = file; excelState.fileName = file.name;
}

function openExcelReview() {
  const file = excelFileInput?.files?.[0];
  if (!file) { toast('Selecciona primero un archivo Excel.', 'warn'); return; }
  if (typeof XLSX === 'undefined') { toast('Falta cargar la librería XLSX en el HTML.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const buffer = e.target.result;
      const wbRaw  = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true,  codepage: 65001 });
      const wbFmt  = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: false, codepage: 65001 });
      if (!wbRaw.SheetNames.length) { toast('El archivo no contiene hojas válidas.', 'warn'); return; }
      const sheetName = wbRaw.SheetNames[0];
      const rowsRaw   = XLSX.utils.sheet_to_json(wbRaw.Sheets[sheetName], { defval: '', raw: true  });
      const rowsFmt   = XLSX.utils.sheet_to_json(wbFmt.Sheets[sheetName], { defval: '', raw: false });
      if (!rowsRaw.length) { toast('La hoja está vacía.', 'warn'); return; }
      const headers = Object.keys(rowsRaw[0] || {});
      excelState = {
        file, fileName: file.name, sheetName, headers,
        rows: rowsRaw, rowsFormatted: rowsFmt,
        mapping: {
          cedula:  suggestHeader(headers, ['cedula','cédula','dni','identificacion','identificación']),
          nombres: suggestHeader(headers, ['nombres','nombre','apellidos','estudiante','alumno']),
          carrera: suggestHeader(headers, ['carrera','programa','especialidad','curso'])
        }
      };
      fillExcelModal(); showExcelModal();
    } catch (error) { console.error(error); toast('No se pudo leer el archivo Excel.', 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

function fillExcelModal() {
  if (excelFileName)  excelFileName.textContent  = excelState.fileName  || '—';
  if (excelSheetName) excelSheetName.textContent = excelState.sheetName || '—';
  if (excelRowCount)  excelRowCount.textContent  = String(excelState.rows.length || 0);
  renderHeaders(); renderMappingSelects(); renderPreviewTable();
}

function renderHeaders() {
  if (!excelHeadersList) return;
  excelHeadersList.innerHTML = '';
  excelState.headers.forEach(header => {
    const chip = document.createElement('span');
    chip.className = 'live-badge';
    chip.style.cssText = 'margin-right:8px;margin-bottom:8px;';
    chip.textContent = header;
    excelHeadersList.appendChild(chip);
  });
}

function renderMappingSelects() {
  if (!mapCedulaSelect || !mapNombresSelect || !mapCarreraSelect) return;
  [mapCedulaSelect, mapNombresSelect, mapCarreraSelect].forEach(sel => {
    sel.innerHTML = '<option value="">-- Seleccionar columna --</option>';
  });
  excelState.headers.forEach(header => {
    [mapCedulaSelect, mapNombresSelect, mapCarreraSelect].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = header;
      sel.appendChild(opt);
    });
  });
  if (excelState.mapping.cedula)  mapCedulaSelect.value  = excelState.mapping.cedula;
  if (excelState.mapping.nombres) mapNombresSelect.value = excelState.mapping.nombres;
  if (excelState.mapping.carrera) mapCarreraSelect.value = excelState.mapping.carrera;
}

function renderPreviewTable() {
  if (!excelPreviewHead || !excelPreviewBody) return;
  const previewRows = excelState.rowsFormatted.slice(0, 5);
  const headers     = excelState.headers;
  excelPreviewHead.innerHTML = '';
  excelPreviewBody.innerHTML = '';
  const headRow = document.createElement('tr');
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; headRow.appendChild(th); });
  excelPreviewHead.appendChild(headRow);
  previewRows.forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => { const td = document.createElement('td'); td.textContent = row[h] ?? ''; tr.appendChild(td); });
    excelPreviewBody.appendChild(tr);
  });
}

function showExcelModal()  { if (excelModalBackdrop) excelModalBackdrop.style.display = 'flex'; }
function closeExcelModal() { if (excelModalBackdrop) excelModalBackdrop.style.display = 'none'; }

async function prepararCargaExcel() {
  const cedulaCol  = mapCedulaSelect?.value  || '';
  const nombresCol = mapNombresSelect?.value || '';
  const carreraCol = mapCarreraSelect?.value || '';
  if (!cedulaCol) { toast('Debes seleccionar al menos la columna de cédula.', 'warn'); return; }

  const registrosLimpios = {};
  for (const row of excelState.rows) {
    const cedula = rawToCedula(row[cedulaCol]);
    if (!cedula) continue;
    const registro = { cedula, telegram: '', asistencia: false };
    if (nombresCol) { const n = rawToTexto(row[nombresCol]); if (n) registro.nombres = n; }
    if (carreraCol) { const c = rawToTexto(row[carreraCol]); if (c) registro.carrera = c; }
    registrosLimpios[cedula] = registro;
  }
  const totalValidos = Object.keys(registrosLimpios).length;
  if (!totalValidos) { toast('No se encontraron filas válidas para importar.', 'warn'); return; }
  try {
    await adminSet(adminRef(adminDb, DB_ADMIN_ESTUDIANTES), registrosLimpios);
    toast(`Se importaron ${totalValidos} registros correctamente.`, 'success');
    closeExcelModal();
  } catch (error) { console.error(error); toast('No se pudo guardar la información en la base admin.', 'error'); }
}

/* ══════════════════════════════════════════════════════════════
   GRUPOS — MIGRACIÓN
══════════════════════════════════════════════════════════════ */

function openGrupoModal() {
  const registros = obtenerRegistrosActuales();
  if (!Object.keys(registros).length) { toast('No hay registros de asistencia para migrar.', 'warn'); return; }
  if (grupoNombreInput) grupoNombreInput.value = '';
  if (grupoModalBackdrop) grupoModalBackdrop.style.display = 'flex';
  setTimeout(() => grupoNombreInput?.focus(), 100);
}

function closeGrupoModal() { if (grupoModalBackdrop) grupoModalBackdrop.style.display = 'none'; }

async function confirmarMigracionGrupo() {
  const nombre    = grupoNombreInput?.value?.trim();
  const registros = obtenerRegistrosActuales();
  if (!nombre)                            { toast('Ingresa un nombre para el grupo.', 'warn'); grupoNombreInput?.focus(); return; }
  if (!Object.keys(registros).length)     { toast('No hay registros para migrar.', 'warn'); return; }

  if (confirmarGrupoBtn) { confirmarGrupoBtn.disabled = true; confirmarGrupoBtn.textContent = 'Migrando…'; }

  try {
    const grupoKey = nombre
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() + '_' + Date.now();

    const estudiantes = {};
    for (const [cedula, d] of Object.entries(registros)) {
      estudiantes[cedula] = { cedula, nombres: d.nombre || d.nombres || '', carrera: d.carrera || '', telegram: d.telegram || '', asistencia: d.asistencia === true };
    }

    const grupoPayload = { nombre, creadoEn: Date.now(), totalEstudiantes: Object.keys(estudiantes).length, estudiantes };
    await gruposSet(gruposRef(gruposDb, `${DB_GRUPOS}/${grupoKey}`), grupoPayload);
    await userRemove(userRef(userDb, DB_ASIST));
    await adminRemove(adminRef(adminDb, DB_ADMIN_ESTUDIANTES));

    gruposData[grupoKey] = grupoPayload;
    renderGrupos(gruposData);
    toast(`Grupo "${nombre}" creado con ${Object.keys(estudiantes).length} estudiantes.`, 'success');
    closeGrupoModal();

    const gruposNav = document.querySelector('[data-tab="grupos"]');
    if (gruposNav) gruposNav.click();
  } catch (err) {
    console.error(err); toast('Error al migrar. Revisa la consola.', 'error');
  } finally {
    if (confirmarGrupoBtn) {
      confirmarGrupoBtn.disabled = false;
      confirmarGrupoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>Crear grupo`;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   CARRERAS — helpers
══════════════════════════════════════════════════════════════ */

function calcCarrerasGrupo(estudiantes) {
  const map = {};
  Object.values(estudiantes).forEach(e => {
    /* Clave normalizada para comparar, pero guardamos el nombre original para mostrar */
    const raw  = (e.carrera || 'Sin carrera').trim();
    const norm = normalizeStr(raw);
    if (!map[norm]) map[norm] = { total: 0, presentes: 0, nombre: raw };
    map[norm].total++;
    if (e.asistencia === true) map[norm].presentes++;
  });
  return map;
}

function colorPct(pct) {
  if (pct >= 80) return { text: '#4ade80', bar: '#4ade80' };
  if (pct >= 60) return { text: '#fbbf24', bar: '#fbbf24' };
  if (pct >= 30) return { text: '#fb923c', bar: '#fb923c' };
  return               { text: '#f87171', bar: '#f87171' };
}

/* ══════════════════════════════════════════════════════════════
   TABLA INTERNA DEL GRUPO — filtrada
══════════════════════════════════════════════════════════════ */

function aplicarFiltrosGrupo(key, estudiantes) {
  const tableContainer = document.getElementById(`grupo-table-${key}`);
  if (!tableContainer) return;

  const query   = (gruposSearchState[key]  || '').toLowerCase().trim();
  const carrera = (gruposCarreraState[key] || 'todas');

  let entries = Object.entries(estudiantes);

  if (carrera !== 'todas') {
    entries = entries.filter(([, d]) => normalizeStr(d.carrera || 'Sin carrera') === normalizeStr(carrera));
  }

  if (query) {
    entries = entries.filter(([ced, d]) =>
      ced.includes(query) ||
      (d.nombres || '').toLowerCase().includes(query) ||
      (d.carrera  || '').toLowerCase().includes(query)
    );
  }

  const tbody    = tableContainer.querySelector('tbody');
  const noResult = tableContainer.querySelector('.grupo-no-results');
  if (!tbody) return;

  if (!entries.length) {
    tbody.innerHTML = '';
    if (noResult) noResult.style.display = 'flex';
    return;
  }
  if (noResult) noResult.style.display = 'none';

  tbody.innerHTML = entries.map(([ced, d], i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge-cedula">${escHtml(ced)}</span></td>
      <td>${escHtml(d.nombres || '')}</td>
      <td>${escHtml(d.carrera || '')}</td>
      <td class="badge-telegram">${escHtml(d.telegram || '—')}</td>
      <td>
        <span class="${d.asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no'}">
          ${d.asistencia ? 'Presente' : 'Ausente'}
        </span>
      </td>
    </tr>
  `).join('');
}

/* ══════════════════════════════════════════════════════════════
   PANEL DE CARRERAS — GRID DE TARJETAS
   Cada carrera ocupa su propia tarjeta con nombre completo,
   barra de progreso, porcentaje y conteo de presentes/total.
══════════════════════════════════════════════════════════════ */

function buildCarrerasPanel(key, estudiantes) {
  const map = calcCarrerasGrupo(estudiantes);
  const carreras = Object.entries(map).sort((a, b) => {
    const pA = a[1].total > 0 ? (a[1].presentes / a[1].total) : 0;
    const pB = b[1].total > 0 ? (b[1].presentes / b[1].total) : 0;
    return pB - pA;
  });

  if (!carreras.length) return '';

  /* ─── tarjetas de carrera ───
     normKey  = clave normalizada (sin tildes/ñ) usada en data-carrera para filtrar
     d.nombre = nombre original del Excel, con tildes y ñ correctas, para mostrar */
  const cardsHtml = carreras.map(([normKey, d]) => {
    const pct           = d.total > 0 ? Math.round((d.presentes / d.total) * 100) : 0;
    const col           = colorPct(pct);
    const nombreDisplay = escHtml(d.nombre);
    return `
      <div
        class="gc-carrera-card"
        data-key="${escHtml(key)}"
        data-carrera="${escHtml(normKey)}"
        title="${nombreDisplay}"
      >
        <div class="gc-card-top">
          <span class="gc-card-name">${nombreDisplay}</span>
          <span class="gc-card-pct" style="color:${col.text};">${pct}%</span>
        </div>
        <div class="gc-card-bar-track">
          <div class="gc-card-bar-fill" style="width:${pct}%;background:${col.bar};"></div>
        </div>
        <div class="gc-card-bottom">
          <span>
            <span class="gc-card-dot" style="background:${col.text};"></span>
            ${d.presentes} presente${d.presentes !== 1 ? 's' : ''}
          </span>
          <span>${d.total} total</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="gc-panel">
      <div class="gc-panel-header">
        <div class="gc-panel-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Desglose por carrera
        </div>
        <span class="gc-panel-count">${carreras.length} ${carreras.length === 1 ? 'carrera' : 'carreras'}</span>
      </div>

      <!-- Botón "Todas" -->
      <button
        class="gc-filter-todas gc-chip-active"
        data-key="${escHtml(key)}"
        data-carrera="todas"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        Todas las carreras
      </button>

      <!-- Grid de tarjetas -->
      <div class="gc-carreras-grid">
        ${cardsHtml}
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   CONTENIDO DEL PANEL EXPANDIBLE (búsqueda + tabla)
══════════════════════════════════════════════════════════════ */

function buildGrupoBodyContent(key, estudiantes) {
  const entries = Object.entries(estudiantes);
  if (!entries.length) return '<p style="padding:20px;color:#94a3b8;">Sin estudiantes.</p>';

  const filas = entries.map(([ced, d], i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge-cedula">${escHtml(ced)}</span></td>
      <td>${escHtml(d.nombres || '')}</td>
      <td>${escHtml(d.carrera || '')}</td>
      <td class="badge-telegram">${escHtml(d.telegram || '—')}</td>
      <td>
        <span class="${d.asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no'}">
          ${d.asistencia ? 'Presente' : 'Ausente'}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    ${buildCarrerasPanel(key, estudiantes)}

    <!-- Barra de búsqueda -->
    <div class="grupo-search-bar">
      <div class="grupo-search-wrap">
        <svg class="grupo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          class="grupo-search-input"
          data-grupo-key="${escHtml(key)}"
          placeholder="Buscar por cédula, nombre o carrera…"
          autocomplete="off"
        >
        <button class="grupo-search-clear" data-grupo-key="${escHtml(key)}" title="Limpiar" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Sin resultados -->
    <div class="grupo-no-results" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Sin resultados para la búsqueda</span>
    </div>

    <!-- Tabla -->
    <div class="table-scroll" style="margin-top:0">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Cédula</th>
            <th>Nombre</th>
            <th>Carrera</th>
            <th>Telegram</th>
            <th>Asistencia</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   RENDER PRINCIPAL DE GRUPOS
══════════════════════════════════════════════════════════════ */

function renderGrupos(data) {
  if (!gruposListContainer) return;

  const keys = Object.keys(data);
  if (!keys.length) {
    gruposListContainer.innerHTML = '';
    if (gruposEmptyState) gruposEmptyState.style.display = 'flex';
    return;
  }
  if (gruposEmptyState) gruposEmptyState.style.display = 'none';
  gruposListContainer.innerHTML = '';

  keys
    .sort((a, b) => (data[b].creadoEn || 0) - (data[a].creadoEn || 0))
    .forEach(key => {
      const grupo       = data[key];
      const estudiantes = grupo.estudiantes || {};
      const total       = Object.keys(estudiantes).length;
      const asistieron  = Object.values(estudiantes).filter(e => e.asistencia).length;
      const ausentes    = total - asistieron;
      const pct         = total > 0 ? Math.round((asistieron / total) * 100) : 0;

      const fecha = new Date(grupo.creadoEn || 0).toLocaleDateString('es-EC', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });

      const col      = colorPct(pct);
      const carrMap  = calcCarrerasGrupo(estudiantes);
      const nCarreras = Object.keys(carrMap).length;

      const card = document.createElement('div');
      card.className = 'grupo-card grupo-card--v2';
      card.innerHTML = `
        <!-- ╔══ CABECERA ══╗ -->
        <div class="grupo-card__header-v2">
          <div class="grupo-card__icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <div class="grupo-card__title-block">
            <div class="grupo-card__name">${escHtml(grupo.nombre || key)}</div>
            <div class="grupo-card__meta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              ${fecha}
              &nbsp;·&nbsp;
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
              </svg>
              ${nCarreras} ${nCarreras === 1 ? 'carrera' : 'carreras'}
            </div>
          </div>
          <button class="grupo-card__toggle-v2" data-key="${escHtml(key)}" aria-expanded="false">
            <svg class="toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <!-- ╔══ KPIs + BARRA ══╗ -->
        <div class="grupo-card__kpis">
          <div class="gc-kpi">
            <div class="gc-kpi__val">${total}</div>
            <div class="gc-kpi__lbl">Total</div>
          </div>
          <div class="gc-kpi-divider"></div>
          <div class="gc-kpi gc-kpi--ok">
            <div class="gc-kpi__val">${asistieron}</div>
            <div class="gc-kpi__lbl">Asistieron</div>
          </div>
          <div class="gc-kpi-divider"></div>
          <div class="gc-kpi gc-kpi--bad">
            <div class="gc-kpi__val">${ausentes}</div>
            <div class="gc-kpi__lbl">Ausentes</div>
          </div>
          <div class="gc-kpi-divider"></div>
          <div class="gc-kpi" style="--kpi-color:${col.text};">
            <div class="gc-kpi__val gc-kpi__val--pct">${pct}%</div>
            <div class="gc-kpi__lbl">Asistencia</div>
          </div>
        </div>

        <!-- Barra de progreso slim -->
        <div class="grupo-card__progress-row">
          <div class="grupo-card__progress-track">
            <div class="grupo-card__progress-fill"
              style="width:${pct}%;background:${col.text};">
            </div>
          </div>
        </div>

        <!-- ╔══ PANEL EXPANDIBLE ══╗ -->
        <div class="grupo-card__body" id="grupo-table-${escHtml(key)}" style="display:none">
          ${buildGrupoBodyContent(key, estudiantes)}
        </div>
      `;

      gruposListContainer.appendChild(card);
    });

  /* ── Toggle expandir ── */
  gruposListContainer.querySelectorAll('.grupo-card__toggle-v2').forEach(btn => {
    btn.addEventListener('click', () => {
      const key  = btn.dataset.key;
      const body = document.getElementById(`grupo-table-${key}`);
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      btn.setAttribute('aria-expanded', String(!isOpen));
      btn.querySelector('.toggle-chevron').style.transform = isOpen ? '' : 'rotate(180deg)';
    });
  });

  /* ── Búsqueda por texto ── */
  gruposListContainer.querySelectorAll('.grupo-search-input').forEach(input => {
    const key      = input.dataset.grupoKey;
    const clearBtn = gruposListContainer.querySelector(`.grupo-search-clear[data-grupo-key="${key}"]`);

    input.addEventListener('input', () => {
      gruposSearchState[key] = input.value;
      if (clearBtn) clearBtn.style.display = input.value ? 'flex' : 'none';
      aplicarFiltrosGrupo(key, gruposData[key]?.estudiantes || {});
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        gruposSearchState[key] = '';
        clearBtn.style.display = 'none';
        aplicarFiltrosGrupo(key, gruposData[key]?.estudiantes || {});
        input.focus();
      });
    }
  });

  /* ── Filtro "Todas las carreras" ── */
  gruposListContainer.querySelectorAll('.gc-filter-todas').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      gruposCarreraState[key] = 'todas';

      /* Limpiar búsqueda de texto */
      const searchInput = gruposListContainer.querySelector(`.grupo-search-input[data-grupo-key="${key}"]`);
      if (searchInput) { searchInput.value = ''; gruposSearchState[key] = ''; }

      /* Actualizar estilos */
      gruposListContainer.querySelectorAll(`.gc-carrera-card[data-key="${key}"]`)
        .forEach(c => c.classList.remove('gc-chip-active'));
      btn.classList.add('gc-chip-active');

      aplicarFiltrosGrupo(key, gruposData[key]?.estudiantes || {});
    });
  });

  /* ── Filtro por tarjeta de carrera ── */
  gruposListContainer.querySelectorAll('.gc-carrera-card').forEach(card => {
    card.addEventListener('click', () => {
      const key     = card.dataset.key;
      const carrera = card.dataset.carrera;

      gruposCarreraState[key] = carrera;

      /* Limpiar búsqueda de texto */
      const searchInput = gruposListContainer.querySelector(`.grupo-search-input[data-grupo-key="${key}"]`);
      if (searchInput) { searchInput.value = ''; gruposSearchState[key] = ''; }

      /* Actualizar estilos activos */
      gruposListContainer.querySelectorAll(`.gc-carrera-card[data-key="${key}"]`)
        .forEach(c => c.classList.remove('gc-chip-active'));
      gruposListContainer.querySelectorAll(`.gc-filter-todas[data-key="${key}"]`)
        .forEach(b => b.classList.remove('gc-chip-active'));
      card.classList.add('gc-chip-active');

      aplicarFiltrosGrupo(key, gruposData[key]?.estudiantes || {});
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   FIREBASE LISTENER
══════════════════════════════════════════════════════════════ */

function iniciarListenersGrupos() {
  if (listenersGruposIniciados) return;
  listenersGruposIniciados = true;
  gruposOnValue(gruposRef(gruposDb, DB_GRUPOS), snapshot => {
    gruposData = snapshot.val() || {};
    renderGrupos(gruposData);
  });
}

/* ══════════════════════════════════════════════════════════════
   BIND EVENTOS
══════════════════════════════════════════════════════════════ */

function bindEventosExcel() {
  if (excelFileInput)     excelFileInput.addEventListener('change', handleExcelFileChange);
  if (openExcelModalBtn)  openExcelModalBtn.addEventListener('click', openExcelReview);
  if (closeExcelModalBtn) closeExcelModalBtn.addEventListener('click', closeExcelModal);
  if (cancelExcelBtn)     cancelExcelBtn.addEventListener('click', closeExcelModal);
  if (excelModalBackdrop) excelModalBackdrop.addEventListener('click', e => { if (e.target === excelModalBackdrop) closeExcelModal(); });
  if (mapCedulaSelect)    mapCedulaSelect.addEventListener('change',  () => { excelState.mapping.cedula  = mapCedulaSelect.value; });
  if (mapNombresSelect)   mapNombresSelect.addEventListener('change', () => { excelState.mapping.nombres = mapNombresSelect.value; });
  if (mapCarreraSelect)   mapCarreraSelect.addEventListener('change', () => { excelState.mapping.carrera = mapCarreraSelect.value; });
  if (prepareExcelBtn)    prepareExcelBtn.addEventListener('click', prepararCargaExcel);
}

function bindEventosGrupos() {
  if (migrarBtn)          migrarBtn.addEventListener('click', openGrupoModal);
  if (cancelarGrupoBtn)   cancelarGrupoBtn.addEventListener('click', closeGrupoModal);
  if (closeGrupoModalBtn) closeGrupoModalBtn.addEventListener('click', closeGrupoModal);
  if (grupoModalBackdrop) grupoModalBackdrop.addEventListener('click', e => { if (e.target === grupoModalBackdrop) closeGrupoModal(); });
  if (grupoNombreInput)   grupoNombreInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmarGrupoBtn?.click(); });
  if (confirmarGrupoBtn)  confirmarGrupoBtn.addEventListener('click', confirmarMigracionGrupo);
}

function iniciarExcelGrupos() {
  injectGruposStyles();
  bindEventosExcel();
  bindEventosGrupos();
  iniciarListenersGrupos();
}

export {
  iniciarExcelGrupos,
  configurarExcelGrupos,
  iniciarListenersGrupos,
  renderGrupos,
  closeExcelModal,
  closeGrupoModal
};