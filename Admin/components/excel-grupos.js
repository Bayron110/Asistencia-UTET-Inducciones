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

const excelFileInput = $('excelFileInput');
const openExcelModalBtn = $('openExcelModalBtn');
const excelSelectedInfo = $('excelSelectedInfo');
const excelModalBackdrop = $('excelModalBackdrop');
const closeExcelModalBtn = $('closeExcelModalBtn');
const cancelExcelBtn = $('cancelExcelBtn');
const prepareExcelBtn = $('prepareExcelBtn');
const excelFileName = $('excelFileName');
const excelSheetName = $('excelSheetName');
const excelRowCount = $('excelRowCount');
const excelHeadersList = $('excelHeadersList');
const mapCedulaSelect = $('mapCedulaSelect');
const mapNombresSelect = $('mapNombresSelect');
const mapCarreraSelect = $('mapCarreraSelect');
const excelPreviewHead = $('excelPreviewHead');
const excelPreviewBody = $('excelPreviewBody');

const migrarBtn = $('migrarBtn');
const grupoModalBackdrop = $('grupoModalBackdrop');
const grupoNombreInput = $('grupoNombreInput');
const confirmarGrupoBtn = $('confirmarGrupoBtn');
const cancelarGrupoBtn = $('cancelarGrupoBtn');
const closeGrupoModalBtn = $('closeGrupoModalBtn');
const gruposListContainer = $('gruposListContainer');
const gruposEmptyState = $('gruposEmptyState');

let listenersGruposIniciados = false;
let obtenerRegistrosActuales = () => ({});
let gruposData = {};

// Almacena el estado de búsqueda por grupo
const gruposSearchState = {};

let excelState = {
  file: null,
  fileName: '',
  sheetName: '',
  headers: [],
  rows: [],
  rowsFormatted: [],
  mapping: {
    cedula: '',
    nombres: '',
    carrera: ''
  }
};

/* ══════════════════════════════════════════════════════════════
   UTILIDADES
══════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg, type = 'info') {
  const toastContainer = $('toastContainer');
  if (!toastContainer) return;

  const icons = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
    warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = (icons[type] || '') + `<span>${escHtml(msg)}</span>`;
  toastContainer.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function rawToCedula(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') {
    return String(Math.round(v)).padStart(10, '0');
  }
  const digits = String(v).replace(/\D/g, '').trim();
  if (!digits) return '';
  return digits.padStart(10, '0');
}

function rawToTexto(v) {
  if (v === null || v === undefined) return '';
  return String(v).normalize('NFC').trim();
}

function normalizeHeader(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
   EXCEL — sin cambios
══════════════════════════════════════════════════════════════ */

function handleExcelFileChange() {
  const file = excelFileInput?.files?.[0];
  if (!file) {
    if (excelSelectedInfo) excelSelectedInfo.textContent = 'Ningún archivo seleccionado.';
    return;
  }
  if (!/\.(xls|xlsx)$/i.test(file.name)) {
    excelFileInput.value = '';
    if (excelSelectedInfo) excelSelectedInfo.textContent = 'Archivo inválido.';
    toast('Solo se permiten archivos .xls o .xlsx', 'warn');
    return;
  }
  if (excelSelectedInfo) {
    excelSelectedInfo.textContent = `Archivo seleccionado: ${file.name}`;
  }
  excelState.file = file;
  excelState.fileName = file.name;
}

function openExcelReview() {
  const file = excelFileInput?.files?.[0];
  if (!file) { toast('Selecciona primero un archivo Excel.', 'warn'); return; }
  if (typeof XLSX === 'undefined') { toast('Falta cargar la librería XLSX en el HTML.', 'error'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const buffer = e.target.result;
      const wbRaw = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: true, codepage: 65001 });
      const wbFmt = XLSX.read(new Uint8Array(buffer), { type: 'array', raw: false, codepage: 65001 });
      if (!wbRaw.SheetNames.length) { toast('El archivo no contiene hojas válidas.', 'warn'); return; }
      const sheetName = wbRaw.SheetNames[0];
      const wsRaw = wbRaw.Sheets[sheetName];
      const wsFmt = wbFmt.Sheets[sheetName];
      const rowsRaw = XLSX.utils.sheet_to_json(wsRaw, { defval: '', raw: true });
      const rowsFmt = XLSX.utils.sheet_to_json(wsFmt, { defval: '', raw: false });
      if (!rowsRaw.length) { toast('La hoja está vacía.', 'warn'); return; }
      const headers = Object.keys(rowsRaw[0] || {});
      excelState = {
        file, fileName: file.name, sheetName, headers,
        rows: rowsRaw, rowsFormatted: rowsFmt,
        mapping: {
          cedula: suggestHeader(headers, ['cedula', 'cédula', 'dni', 'identificacion', 'identificación']),
          nombres: suggestHeader(headers, ['nombres', 'nombre', 'apellidos', 'estudiante', 'alumno']),
          carrera: suggestHeader(headers, ['carrera', 'programa', 'especialidad', 'curso'])
        }
      };
      fillExcelModal();
      showExcelModal();
    } catch (error) {
      console.error(error);
      toast('No se pudo leer el archivo Excel.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function fillExcelModal() {
  if (excelFileName) excelFileName.textContent = excelState.fileName || '—';
  if (excelSheetName) excelSheetName.textContent = excelState.sheetName || '—';
  if (excelRowCount) excelRowCount.textContent = String(excelState.rows.length || 0);
  renderHeaders();
  renderMappingSelects();
  renderPreviewTable();
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
  if (excelState.mapping.cedula) mapCedulaSelect.value = excelState.mapping.cedula;
  if (excelState.mapping.nombres) mapNombresSelect.value = excelState.mapping.nombres;
  if (excelState.mapping.carrera) mapCarreraSelect.value = excelState.mapping.carrera;
}

function renderPreviewTable() {
  if (!excelPreviewHead || !excelPreviewBody) return;
  const previewRows = excelState.rowsFormatted.slice(0, 5);
  const headers = excelState.headers;
  excelPreviewHead.innerHTML = '';
  excelPreviewBody.innerHTML = '';
  const headRow = document.createElement('tr');
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });
  excelPreviewHead.appendChild(headRow);
  previewRows.forEach(row => {
    const tr = document.createElement('tr');
    headers.forEach(h => {
      const td = document.createElement('td');
      td.textContent = row[h] ?? '';
      tr.appendChild(td);
    });
    excelPreviewBody.appendChild(tr);
  });
}

function showExcelModal() {
  if (excelModalBackdrop) excelModalBackdrop.style.display = 'flex';
}

function closeExcelModal() {
  if (excelModalBackdrop) excelModalBackdrop.style.display = 'none';
}

async function prepararCargaExcel() {
  const cedulaCol = mapCedulaSelect?.value || '';
  const nombresCol = mapNombresSelect?.value || '';
  const carreraCol = mapCarreraSelect?.value || '';
  if (!cedulaCol) { toast('Debes seleccionar al menos la columna de cédula.', 'warn'); return; }

  const registrosLimpios = {};
  for (const row of excelState.rows) {
    const cedula = rawToCedula(row[cedulaCol]);
    if (!cedula) continue;
    const registro = { cedula, telegram: '', asistencia: false };
    if (nombresCol) { const nombres = rawToTexto(row[nombresCol]); if (nombres) registro.nombres = nombres; }
    if (carreraCol) { const carrera = rawToTexto(row[carreraCol]); if (carrera) registro.carrera = carrera; }
    registrosLimpios[cedula] = registro;
  }

  const totalValidos = Object.keys(registrosLimpios).length;
  if (!totalValidos) { toast('No se encontraron filas válidas para importar.', 'warn'); return; }

  try {
    await adminSet(adminRef(adminDb, DB_ADMIN_ESTUDIANTES), registrosLimpios);
    toast(`Se importaron ${totalValidos} registros correctamente.`, 'success');
    closeExcelModal();
  } catch (error) {
    console.error(error);
    toast('No se pudo guardar la información en la base admin.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   GRUPOS — MIGRACIÓN (sin cambios)
══════════════════════════════════════════════════════════════ */

function openGrupoModal() {
  const registros = obtenerRegistrosActuales();
  if (!Object.keys(registros).length) { toast('No hay registros de asistencia para migrar.', 'warn'); return; }
  if (grupoNombreInput) grupoNombreInput.value = '';
  if (grupoModalBackdrop) grupoModalBackdrop.style.display = 'flex';
  setTimeout(() => grupoNombreInput?.focus(), 100);
}

function closeGrupoModal() {
  if (grupoModalBackdrop) grupoModalBackdrop.style.display = 'none';
}

async function confirmarMigracionGrupo() {
  const nombre = grupoNombreInput?.value?.trim();
  const registros = obtenerRegistrosActuales();
  if (!nombre) { toast('Ingresa un nombre para el grupo.', 'warn'); grupoNombreInput?.focus(); return; }
  if (!Object.keys(registros).length) { toast('No hay registros para migrar.', 'warn'); return; }

  if (confirmarGrupoBtn) {
    confirmarGrupoBtn.disabled = true;
    confirmarGrupoBtn.textContent = 'Migrando…';
  }

  try {
    const grupoKey = nombre
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase() + '_' + Date.now();

    const estudiantes = {};
    for (const [cedula, d] of Object.entries(registros)) {
      estudiantes[cedula] = {
        cedula,
        nombres: d.nombre || d.nombres || '',
        carrera: d.carrera || '',
        telegram: d.telegram || '',
        asistencia: d.asistencia === true
      };
    }

    const grupoPayload = {
      nombre,
      creadoEn: Date.now(),
      totalEstudiantes: Object.keys(estudiantes).length,
      estudiantes
    };

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
    console.error(err);
    toast('Error al migrar. Revisa la consola.', 'error');
  } finally {
    if (confirmarGrupoBtn) {
      confirmarGrupoBtn.disabled = false;
      confirmarGrupoBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        Crear grupo
      `;
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   GRUPOS — RENDER MEJORADO
══════════════════════════════════════════════════════════════ */

/**
 * Filtra y re-renderiza la tabla de un grupo según la búsqueda actual.
 * @param {string} key - clave del grupo en Firebase
 * @param {object} estudiantes - objeto con los estudiantes del grupo
 */
function aplicarBusquedaGrupo(key, estudiantes) {
  const tableEl = document.getElementById(`grupo-table-${key}`);
  const query = (gruposSearchState[key] || '').toLowerCase().trim();

  if (!tableEl) return;

  const entries = Object.entries(estudiantes);

  // Filtrar por cédula o nombre
  const filtradas = query
    ? entries.filter(([ced, d]) =>
        ced.includes(query) ||
        (d.nombres || '').toLowerCase().includes(query) ||
        (d.carrera || '').toLowerCase().includes(query)
      )
    : entries;

  const tbody = tableEl.querySelector('tbody');
  const noResults = tableEl.querySelector('.grupo-no-results');

  if (!tbody) return;

  if (!filtradas.length) {
    tbody.innerHTML = '';
    if (noResults) noResults.style.display = 'flex';
    return;
  }

  if (noResults) noResults.style.display = 'none';

  tbody.innerHTML = filtradas.map(([ced, d], i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge-cedula">${escHtml(ced)}</span></td>
      <td>${escHtml(d.nombres || '')}</td>
      <td>${escHtml(d.carrera || '')}</td>
      <td class="badge-telegram">${escHtml(d.telegram || '—')}</td>
      <td>
        <span class="${d.asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no'}">
          ${d.asistencia ? '✔ Presente' : '✖ Ausente'}
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * Construye el contenedor expandible de un grupo (búsqueda + tabla).
 */
function buildGrupoTableContainer(key, estudiantes) {
  const entries = Object.entries(estudiantes);
  if (!entries.length) {
    return '<p style="padding:12px;color:#94a3b8">Sin estudiantes.</p>';
  }

  const filas = entries.map(([ced, d], i) => `
    <tr>
      <td>${i + 1}</td>
      <td><span class="badge-cedula">${escHtml(ced)}</span></td>
      <td>${escHtml(d.nombres || '')}</td>
      <td>${escHtml(d.carrera || '')}</td>
      <td class="badge-telegram">${escHtml(d.telegram || '—')}</td>
      <td>
        <span class="${d.asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no'}">
          ${d.asistencia ? '✔ Presente' : '✖ Ausente'}
        </span>
      </td>
    </tr>
  `).join('');

  return `
    <!-- Barra de búsqueda del grupo -->
    <div class="grupo-search-bar">
      <div class="grupo-search-wrap">
        <svg class="grupo-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          class="grupo-search-input"
          data-grupo-key="${escHtml(key)}"
          placeholder="Buscar por cédula, nombre o carrera…"
          autocomplete="off"
        >
        <button class="grupo-search-clear" data-grupo-key="${escHtml(key)}" title="Limpiar búsqueda" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Mensaje sin resultados -->
    <div class="grupo-no-results" style="display:none">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="11" cy="11" r="8"/>
        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
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

/**
 * Renderiza todos los grupos en el contenedor principal.
 */
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
      const grupo = data[key];
      const estudiantes = grupo.estudiantes || {};
      const total = Object.keys(estudiantes).length;
      const asistieron = Object.values(estudiantes).filter(e => e.asistencia).length;
      const ausentes = total - asistieron;
      const pct = total > 0 ? Math.round((asistieron / total) * 100) : 0;

      const fecha = new Date(grupo.creadoEn || 0).toLocaleDateString('es-EC', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // Color de la barra según porcentaje
      const barColor = pct >= 80
        ? 'var(--color-ok, #22c55e)'
        : pct >= 50
          ? 'var(--color-warn, #f59e0b)'
          : 'var(--color-bad, #ef4444)';

      const card = document.createElement('div');
      card.className = 'grupo-card grupo-card--v2';
      card.innerHTML = `
        <!-- Cabecera del grupo -->
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
                stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:-2px;margin-right:4px">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              ${fecha}
            </div>
          </div>
          <button class="grupo-card__toggle-v2" data-key="${escHtml(key)}" aria-expanded="false">
            <svg class="toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        </div>

        <!-- Stats rápidas -->
        <div class="grupo-card__stats-v2">
          <div class="grupo-stat">
            <div class="grupo-stat__num">${total}</div>
            <div class="grupo-stat__label">Total</div>
          </div>
          <div class="grupo-stat grupo-stat--ok">
            <div class="grupo-stat__num">${asistieron}</div>
            <div class="grupo-stat__label">Asistieron</div>
          </div>
          <div class="grupo-stat grupo-stat--bad">
            <div class="grupo-stat__num">${ausentes}</div>
            <div class="grupo-stat__label">Ausentes</div>
          </div>
          <div class="grupo-stat grupo-stat--pct">
            <div class="grupo-stat__num">${pct}%</div>
            <div class="grupo-stat__label">Asistencia</div>
          </div>
        </div>

        <!-- Barra de progreso -->
        <div class="grupo-card__progress-wrap">
          <div class="grupo-card__progress-bar">
            <div class="grupo-card__progress-fill"
              style="width:${pct}%; background:${barColor};"
              title="${pct}% de asistencia">
            </div>
          </div>
          <span class="grupo-card__progress-label">${pct}%</span>
        </div>

        <!-- Panel expandible (lista + búsqueda) -->
        <div class="grupo-card__body" id="grupo-table-${escHtml(key)}" style="display:none">
          ${buildGrupoTableContainer(key, estudiantes)}
        </div>
      `;

      gruposListContainer.appendChild(card);
    });

  // Vincular toggle de cada card
  gruposListContainer.querySelectorAll('.grupo-card__toggle-v2').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const body = document.getElementById(`grupo-table-${key}`);
      if (!body) return;

      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      btn.setAttribute('aria-expanded', String(!isOpen));
      btn.querySelector('.toggle-chevron').style.transform = isOpen ? '' : 'rotate(180deg)';
    });
  });

  // Vincular búsqueda en cada grupo
  gruposListContainer.querySelectorAll('.grupo-search-input').forEach(input => {
    const key = input.dataset.grupoKey;
    const clearBtn = gruposListContainer.querySelector(`.grupo-search-clear[data-grupo-key="${key}"]`);

    input.addEventListener('input', () => {
      const val = input.value;
      gruposSearchState[key] = val;

      // Mostrar/ocultar botón limpiar
      if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';

      aplicarBusquedaGrupo(key, gruposData[key]?.estudiantes || {});
    });

    // Botón para limpiar búsqueda
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        input.value = '';
        gruposSearchState[key] = '';
        clearBtn.style.display = 'none';
        aplicarBusquedaGrupo(key, gruposData[key]?.estudiantes || {});
        input.focus();
      });
    }
  });
}

/* ══════════════════════════════════════════════════════════════
   LISTENERS FIREBASE
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
   BIND DE EVENTOS
══════════════════════════════════════════════════════════════ */

function bindEventosExcel() {
  if (excelFileInput) excelFileInput.addEventListener('change', handleExcelFileChange);
  if (openExcelModalBtn) openExcelModalBtn.addEventListener('click', openExcelReview);
  if (closeExcelModalBtn) closeExcelModalBtn.addEventListener('click', closeExcelModal);
  if (cancelExcelBtn) cancelExcelBtn.addEventListener('click', closeExcelModal);
  if (excelModalBackdrop) {
    excelModalBackdrop.addEventListener('click', e => {
      if (e.target === excelModalBackdrop) closeExcelModal();
    });
  }
  if (mapCedulaSelect) mapCedulaSelect.addEventListener('change', () => { excelState.mapping.cedula = mapCedulaSelect.value; });
  if (mapNombresSelect) mapNombresSelect.addEventListener('change', () => { excelState.mapping.nombres = mapNombresSelect.value; });
  if (mapCarreraSelect) mapCarreraSelect.addEventListener('change', () => { excelState.mapping.carrera = mapCarreraSelect.value; });
  if (prepareExcelBtn) prepareExcelBtn.addEventListener('click', prepararCargaExcel);
}

function bindEventosGrupos() {
  if (migrarBtn) migrarBtn.addEventListener('click', openGrupoModal);
  if (cancelarGrupoBtn) cancelarGrupoBtn.addEventListener('click', closeGrupoModal);
  if (closeGrupoModalBtn) closeGrupoModalBtn.addEventListener('click', closeGrupoModal);
  if (grupoModalBackdrop) {
    grupoModalBackdrop.addEventListener('click', e => {
      if (e.target === grupoModalBackdrop) closeGrupoModal();
    });
  }
  if (grupoNombreInput) {
    grupoNombreInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmarGrupoBtn?.click();
    });
  }
  if (confirmarGrupoBtn) confirmarGrupoBtn.addEventListener('click', confirmarMigracionGrupo);
}

function iniciarExcelGrupos() {
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