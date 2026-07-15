import {
  db as adminDb,
  ref as adminRef,
  onValue as adminOnValue,
  update as adminUpdate,
  remove as adminRemove
} from '../../Firebase/firebase-admin.js';

const DB_ADMIN_ESTUDIANTES = 'admin_estudiantes';

const $ = id => document.getElementById(id);

const statTotal    = $('statTotal');
const statHoy      = $('statHoy');
const statReciente = $('statReciente');
const tableBody    = $('tableBody');
const emptyRow     = $('emptyRow');
const searchInput  = $('searchInput');
const exportBtn    = $('exportBtn');

let registros          = {};
let adminEstudiantes   = {};
let lastKeys           = [];
let listenersIniciados = false;
let filtroActivo       = 'todos'; // 'todos' | 'presentes' | 'ausentes'

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

/**
 * Formatea un timestamp (ms) o null a una cadena legible.
 * Devuelve '–' si no hay valor.
 */
function formatFecha(ts) {
  if (!ts) return '–';
  try {
    const d = new Date(ts);
    return d.toLocaleString('es-EC', {
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '–';
  }
}

function toast(msg, type = 'info') {
  const toastContainer = $('toastContainer');
  if (!toastContainer) return;

  const icons = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    warn:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
  };

  const t = document.createElement('div');
  t.className = 'toast toast--' + type;
  t.innerHTML = (icons[type] || '') + '<span>' + escHtml(msg) + '</span>';
  toastContainer.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

/* ══════════════════════════════════════════════════════════════
   FILTER BAR — montar y bindear
══════════════════════════════════════════════════════════════ */

function montarFilterBar() {
  if ($('filterBarRegistros')) return;

  const tableWrap = document.querySelector('#tab-registros .table-wrap');
  if (!tableWrap) return;

  const bar = document.createElement('div');
  bar.className = 'filter-bar';
  bar.id        = 'filterBarRegistros';

  bar.innerHTML = `
    <button class="filter-btn filter-btn--todos active-filter-todos" data-filtro="todos">
      <span class="filter-btn__dot"></span>
      Todos
      <span class="filter-btn__count" id="filterCountTodos">0</span>
    </button>
    <button class="filter-btn filter-btn--presentes" data-filtro="presentes">
      <span class="filter-btn__dot"></span>
      Registrados
      <span class="filter-btn__count" id="filterCountPresentes">0</span>
    </button>
    <button class="filter-btn filter-btn--ausentes" data-filtro="ausentes">
      <span class="filter-btn__dot"></span>
      Pendientes
      <span class="filter-btn__count" id="filterCountAusentes">0</span>
    </button>
    <button class="filter-btn filter-btn--retirados" data-filtro="retirados">
      <span class="filter-btn__dot"></span>
      Retirados
      <span class="filter-btn__count" id="filterCountRetirados">0</span>
    </button>
  `;

  const tableHeader = tableWrap.querySelector('.table-header');
  if (tableHeader) {
    tableWrap.insertBefore(bar, tableHeader);
  } else {
    tableWrap.prepend(bar);
  }

  bar.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroActivo = btn.dataset.filtro;

      bar.querySelectorAll('.filter-btn').forEach(b => {
        b.className = b.className
          .replace(/active-filter-\S+/g, '')
          .trim();
      });

      btn.classList.add('active-filter-' + filtroActivo);

      renderTable(registros, searchInput?.value?.trim().toLowerCase() || '');
    });
  });
}

function actualizarCountsFiltro(data) {
  const entries   = Object.values(data);
  const total     = entries.length;
  const retirados = entries.filter(v => v.retirado === true).length;
  const activos   = entries.filter(v => v.retirado !== true);
  const presentes = activos.filter(v => v.asistencia === true).length;
  const ausentes  = activos.filter(v => v.asistencia !== true).length;

  const elTodos     = $('filterCountTodos');
  const elPresentes = $('filterCountPresentes');
  const elAusentes  = $('filterCountAusentes');
  const elRetirados = $('filterCountRetirados');

  if (elTodos)     elTodos.textContent     = total;
  if (elPresentes) elPresentes.textContent = presentes;
  if (elAusentes)  elAusentes.textContent  = ausentes;
  if (elRetirados) elRetirados.textContent = retirados;
}

/* ══════════════════════════════════════════════════════════════
   RECOMPUTAR Y RENDERIZAR
══════════════════════════════════════════════════════════════ */

function recomputeRegistros() {
  const merged = {};

  Object.entries(adminEstudiantes).forEach(([cedula, adminData]) => {
    merged[cedula] = {
      cedula,
      nombre:        adminData.nombres      || adminData.nombre  || '',
      carrera:       adminData.carrera      || '',
      sede:          adminData.sede         || '',   // ← AGREGAR ESTA LÍNEA
      telegram:      adminData.telegram     || '',
      asistencia:    adminData.asistencia   === true,
      retirado:      adminData.retirado     === true,
      // ── NUEVO: timestamps ──
      fechaRegistro: adminData.fechaRegistro     || null, // cuándo se cargó en admin_estudiantes
      fechaAsistencia: adminData.fechaAsistencia || null  // cuándo el alumno marcó asistencia
    };
  });

  registros = merged;
  montarFilterBar();
  actualizarCountsFiltro(registros);
  renderTable(registros, searchInput?.value?.trim().toLowerCase() || '');
  updateStats(registros);
}

function renderTable(data, filter = '') {
  if (!tableBody) return;

  let entries = Object.entries(data);

  // Aplicar filtro activo
  if (filtroActivo === 'presentes') {
    entries = entries.filter(([, v]) => v.asistencia === true && v.retirado !== true);
  } else if (filtroActivo === 'ausentes') {
    entries = entries.filter(([, v]) => v.asistencia !== true && v.retirado !== true);
  } else if (filtroActivo === 'retirados') {
    entries = entries.filter(([, v]) => v.retirado === true);
  }
  // 'todos' => sin filtro adicional

  // Aplicar búsqueda
  const filtrado = filter
    ? entries.filter(([k, v]) =>
        k.toLowerCase().includes(filter) ||
        (v.nombre   || '').toLowerCase().includes(filter) ||
        (v.carrera  || '').toLowerCase().includes(filter) ||
        (v.telegram || '').toLowerCase().includes(filter)
      )
    : entries;

  const currentKeys = Object.keys(data);
  const newKeys     = currentKeys.filter(k => !lastKeys.includes(k));
  lastKeys          = currentKeys;

  if (filtrado.length === 0) {
    tableBody.innerHTML = '';
    if (emptyRow) tableBody.appendChild(emptyRow);
    return;
  }

  tableBody.innerHTML = '';

  filtrado.forEach(([cedula, d], i) => {
    const isNew      = newKeys.includes(cedula);
    const asistencia = d.asistencia === true;
    const retirado   = d.retirado   === true;

    const tr = document.createElement('tr');
    if (isNew) tr.classList.add('row-new');
    if (asistencia && !retirado) tr.classList.add('row-presente');
    if (retirado) tr.classList.add('row-retirado');

    // ── Columna fecha: muestra fechaAsistencia si asistió, si no fechaRegistro
    const fechaMostrar = asistencia
      ? formatFecha(d.fechaAsistencia || d.fechaRegistro)
      : formatFecha(d.fechaRegistro);

    // ── Badge estado vigente/retirado
    const estadoBadge = retirado
      ? `<span class="tag-retirado">Retirado</span>`
      : `<span class="tag-vigente">Vigente</span>`;

    // ── Botón toggle vigente↔retirado
    const toggleLabel = retirado ? 'Activar' : 'Retirar';
    const toggleClass = retirado ? 'toggle-btn toggle-btn--activar' : 'toggle-btn toggle-btn--retirar';

    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td>' +
        '<span class="badge-cedula">' + escHtml(cedula) + '</span>' +
        (isNew ? '<span class="tag-nuevo">NUEVO</span>' : '') +
      '</td>' +
      '<td>' + escHtml(d.nombre   || '–') + '</td>' +
      '<td>' + escHtml(d.carrera  || '–') + '</td>' +
      '<td class="badge-telegram">' + escHtml(d.telegram || '–') + '</td>' +
      // ── COLUMNA NUEVA: Fecha/Hora
      '<td class="col-fecha">' +
        '<span class="fecha-badge">' + escHtml(fechaMostrar) + '</span>' +
      '</td>' +
      '<td>' +
        '<span class="' + (asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no') + '">' +
          (asistencia ? 'Presente' : 'Pendiente') +
        '</span>' +
      '</td>' +
      // ── COLUMNA NUEVA: Estado
      '<td>' + estadoBadge + '</td>' +
      '<td class="col-acciones">' +
        '<button class="del-btn" data-key="' + escHtml(cedula) + '">Reiniciar</button>' +
        '<button class="' + toggleClass + '" data-key="' + escHtml(cedula) + '" data-retirado="' + retirado + '">' +
          toggleLabel +
        '</button>' +
      '</td>';

    tableBody.appendChild(tr);
  });

  // Bind reiniciar
  tableBody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRegistro(btn.dataset.key));
  });

  // Bind toggle vigente/retirado
  tableBody.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const estaRetirado = btn.dataset.retirado === 'true';
      toggleRetirado(btn.dataset.key, estaRetirado);
    });
  });
}

function updateStats(data) {
  const entries    = Object.values(data);
  const activos    = entries.filter(v => v.retirado !== true);
  const total      = activos.length;
  const asistieron = activos.filter(v => v.asistencia === true).length;
  const pendientes = total - asistieron;

  if (statTotal)    statTotal.textContent    = total;
  if (statHoy)      statHoy.textContent      = asistieron;
  if (statReciente) statReciente.textContent = pendientes;
}

/* ══════════════════════════════════════════════════════════════
   REINICIAR ASISTENCIA
══════════════════════════════════════════════════════════════ */

async function deleteRegistro(cedula) {
  if (!confirm('¿Reiniciar asistencia de la cédula ' + cedula + '?')) return;

  try {
    await adminUpdate(adminRef(adminDb, DB_ADMIN_ESTUDIANTES + '/' + cedula), {
      telegram:        '',
      asistencia:      false,
      fechaAsistencia: null
    });

    toast('Asistencia reiniciada.', 'warn');
  } catch (err) {
    console.error(err);
    toast('Error al reiniciar asistencia.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   TOGGLE VIGENTE / RETIRADO  ← NUEVO
══════════════════════════════════════════════════════════════ */

async function toggleRetirado(cedula, estaRetirado) {
  const nuevoEstado = !estaRetirado;
  const msg = nuevoEstado
    ? '¿Marcar como RETIRADO a la cédula ' + cedula + '?\nEl estudiante dejará de aparecer en los conteos activos.'
    : '¿Volver a ACTIVAR a la cédula ' + cedula + '?';

  if (!confirm(msg)) return;

  try {
    await adminUpdate(adminRef(adminDb, DB_ADMIN_ESTUDIANTES + '/' + cedula), {
      retirado:          nuevoEstado,
      fechaRetiro:       nuevoEstado ? Date.now() : null
    });

    toast(
      nuevoEstado
        ? 'Estudiante marcado como retirado.'
        : 'Estudiante reactivado correctamente.',
      nuevoEstado ? 'warn' : 'success'
    );
  } catch (err) {
    console.error(err);
    toast('Error al cambiar el estado del estudiante.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════════
   EXPORTAR EXCEL
══════════════════════════════════════════════════════════════ */

function exportarExcel() {
  const entries = Object.entries(registros);

  if (!entries.length) {
    toast('No hay datos para exportar.', 'warn');
    return;
  }

  if (typeof XLSX === 'undefined') {
    toast('La librería XLSX no está cargada en el HTML.', 'error');
    return;
  }

  const rows = entries.map(([cedula, d], i) => ({
    '#':            i + 1,
    'Cédula':       cedula,
    'Nombre':       d.nombre   || '',
    'Carrera':      d.carrera  || '',
    'Telegram':     d.telegram || '',
    'Asistencia':   d.asistencia === true ? 'Sí' : 'No',
    // ── NUEVAS COLUMNAS en Excel
    'Fecha Registro':   formatFecha(d.fechaRegistro),
    'Fecha Asistencia': formatFecha(d.fechaAsistencia),
    'Estado':           d.retirado === true ? 'Retirado' : 'Vigente'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencias');
  XLSX.writeFile(wb, 'asistencia_admin_' + new Date().toISOString().split('T')[0] + '.xlsx');

  toast('Excel exportado correctamente.', 'success');
}

/* ══════════════════════════════════════════════════════════════
   REGISTRO MANUAL
══════════════════════════════════════════════════════════════ */

const manualModalBackdrop = $('manualModalBackdrop');
const agregarManualBtn    = $('agregarManualBtn');
const closeManualModalBtn = $('closeManualModalBtn');
const cancelManualBtn     = $('cancelManualBtn');
const confirmarManualBtn  = $('confirmarManualBtn');
const manualCedula        = $('manualCedula');
const manualNombre        = $('manualNombre');
const manualCarrera       = $('manualCarrera');
const manualTelegram      = $('manualTelegram');
const manualAsistencia    = $('manualAsistencia');
const manualErr           = $('manualErr');
const manualCedulaHint    = $('manualCedulaHint');

function abrirManualModal() {
  if (!manualModalBackdrop) return;

  if (manualCedula)     manualCedula.value       = '';
  if (manualNombre)     manualNombre.value       = '';
  if (manualCarrera)    manualCarrera.value      = '';
  if (manualTelegram)   manualTelegram.value     = '';
  if (manualAsistencia) manualAsistencia.checked = false;
  if (manualErr)        { manualErr.style.display = 'none'; manualErr.textContent = ''; }
  if (manualCedulaHint) { manualCedulaHint.textContent = ''; manualCedulaHint.className = 'manual-field-hint'; }

  manualModalBackdrop.style.display = 'flex';
  setTimeout(() => manualCedula?.focus(), 80);
}

function cerrarManualModal() {
  if (manualModalBackdrop) manualModalBackdrop.style.display = 'none';
}

function mostrarErrManual(msg) {
  if (!manualErr) return;
  manualErr.textContent   = msg;
  manualErr.style.display = 'block';
}

function validarCedulaEnVivo() {
  if (!manualCedula || !manualCedulaHint) return;
  const cedula = manualCedula.value.trim();

  if (!cedula) {
    manualCedulaHint.textContent = '';
    manualCedulaHint.className   = 'manual-field-hint';
    return;
  }

  if (adminEstudiantes[cedula]) {
    manualCedulaHint.textContent = '⚠ Esta cédula ya existe en la base de datos';
    manualCedulaHint.className   = 'manual-field-hint err';
  } else {
    manualCedulaHint.textContent = '✔ Cédula disponible';
    manualCedulaHint.className   = 'manual-field-hint ok';
  }
}

async function confirmarRegistroManual() {
  if (!manualErr) return;
  manualErr.style.display = 'none';

  const cedula   = manualCedula?.value.trim()   || '';
  const nombre   = manualNombre?.value.trim()   || '';
  const carrera  = manualCarrera?.value.trim()  || '';
  const telegram = manualTelegram?.value.trim() || '';
  const asistio  = manualAsistencia?.checked    === true;

  if (!cedula)  { mostrarErrManual('La cédula es obligatoria.');  manualCedula?.focus();  return; }
  if (!nombre)  { mostrarErrManual('El nombre es obligatorio.');  manualNombre?.focus();  return; }
  if (!carrera) { mostrarErrManual('La carrera es obligatoria.'); manualCarrera?.focus(); return; }

  if (adminEstudiantes[cedula]) {
    mostrarErrManual('La cédula "' + cedula + '" ya existe. Usa "Reiniciar" si quieres actualizarla.');
    manualCedula?.focus();
    return;
  }

  if (confirmarManualBtn) {
    confirmarManualBtn.disabled    = true;
    confirmarManualBtn.textContent = 'Guardando...';
  }

  const ahora = Date.now();

  try {
    await adminUpdate(adminRef(adminDb, DB_ADMIN_ESTUDIANTES + '/' + cedula), {
      nombres:            nombre,
      carrera,
      telegram:           telegram || '',
      asistencia:         asistio,
      retirado:           false,
      registradoPorAdmin: true,
      fechaRegistro:      ahora,
      // Si se marca asistencia al registrar, guardar también fechaAsistencia
      fechaAsistencia:    asistio ? ahora : null
    });

    toast('Estudiante "' + nombre + '" registrado correctamente.', 'success');
    cerrarManualModal();

  } catch (err) {
    console.error(err);
    mostrarErrManual('Error al guardar en la base de datos. Intenta de nuevo.');
  } finally {
    if (confirmarManualBtn) {
      confirmarManualBtn.disabled  = false;
      confirmarManualBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 5v14"/><path d="M5 12h14"/>' +
        '</svg> Registrar estudiante';
    }
  }
}

function bindEventosManual() {
  if (agregarManualBtn)    agregarManualBtn.addEventListener('click', abrirManualModal);
  if (closeManualModalBtn) closeManualModalBtn.addEventListener('click', cerrarManualModal);
  if (cancelManualBtn)     cancelManualBtn.addEventListener('click', cerrarManualModal);
  if (confirmarManualBtn)  confirmarManualBtn.addEventListener('click', confirmarRegistroManual);
  if (manualCedula)        manualCedula.addEventListener('input', validarCedulaEnVivo);

  if (manualModalBackdrop) {
    manualModalBackdrop.addEventListener('click', e => {
      if (e.target === manualModalBackdrop) cerrarManualModal();
    });
  }

  [manualCedula, manualNombre, manualCarrera, manualTelegram].forEach(el => {
    el?.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmarRegistroManual();
    });
  });
}

/* ══════════════════════════════════════════════════════════════
   EVENTOS UI + LISTENERS FIREBASE
══════════════════════════════════════════════════════════════ */

function bindEventosUI() {
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderTable(registros, searchInput.value.trim().toLowerCase());
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', exportarExcel);
  }

  bindEventosManual();
}

function iniciarListenersAsistencia() {
  if (listenersIniciados) return;
  listenersIniciados = true;

  adminOnValue(adminRef(adminDb, DB_ADMIN_ESTUDIANTES), snapshot => {
    adminEstudiantes = snapshot.val() || {};
    recomputeRegistros();
  });
}

function obtenerRegistros() {
  return registros;
}

function refrescarTabla() {
  renderTable(registros, searchInput?.value?.trim().toLowerCase() || '');
  updateStats(registros);
}

bindEventosUI();

export {
  iniciarListenersAsistencia,
  obtenerRegistros,
  refrescarTabla,
  renderTable,
  updateStats
};