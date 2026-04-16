import {
  db as userDb,
  ref as userRef,
  onValue as userOnValue,
  remove as userRemove,
  set as userSet
} from '../../Firebase/firebase.js';

import {
  db as adminDb,
  ref as adminRef,
  onValue as adminOnValue,
  update as adminUpdate
} from '../../Firebase/firebase-admin.js';

const DB_ASIST = 'asistencias';
const DB_ADMIN_ESTUDIANTES = 'admin_estudiantes';

const $ = id => document.getElementById(id);

const statTotal = $('statTotal');
const statHoy = $('statHoy');
const statReciente = $('statReciente');
const tableBody = $('tableBody');
const emptyRow = $('emptyRow');
const searchInput = $('searchInput');
const exportBtn = $('exportBtn');

let registros = {};
let adminEstudiantes = {};
let asistenciasUsuario = {};
let lastKeys = [];
let listenersIniciados = false;

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
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
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

function recomputeRegistros() {
  const merged = {};

  Object.entries(adminEstudiantes).forEach(([cedula, adminData]) => {
    const asist = asistenciasUsuario[cedula] || {};

    merged[cedula] = {
      cedula,
      nombre: adminData.nombres || adminData.nombre || '',
      carrera: adminData.carrera || '',
      telegram: asist.telegram || adminData.telegram || '',
      asistencia: asist.asistencia === true
    };
  });

  registros = merged;
  renderTable(registros, searchInput?.value?.trim().toLowerCase() || '');
  updateStats(registros);
}

function renderTable(data, filter = '') {
  if (!tableBody) return;

  const entries = Object.entries(data);

  const filtrado = filter
    ? entries.filter(([k, v]) =>
        k.toLowerCase().includes(filter) ||
        (v.nombre || '').toLowerCase().includes(filter) ||
        (v.carrera || '').toLowerCase().includes(filter) ||
        (v.telegram || '').toLowerCase().includes(filter)
      )
    : entries;

  const currentKeys = entries.map(([k]) => k);
  const newKeys = currentKeys.filter(k => !lastKeys.includes(k));
  lastKeys = currentKeys;

  if (filtrado.length === 0) {
    tableBody.innerHTML = '';
    if (emptyRow) tableBody.appendChild(emptyRow);
    return;
  }

  tableBody.innerHTML = '';

  filtrado.forEach(([cedula, d], i) => {
    const isNew = newKeys.includes(cedula);
    const asistencia = d.asistencia === true;

    const tr = document.createElement('tr');
    if (isNew) tr.classList.add('row-new');

    tr.innerHTML =
      '<td>' + (i + 1) + '</td>' +
      '<td>' +
        '<span class="badge-cedula">' + escHtml(cedula) + '</span>' +
        (isNew ? '<span class="tag-nuevo">NUEVO</span>' : '') +
      '</td>' +
      '<td>' + escHtml(d.nombre || '\u2013') + '</td>' +
      '<td>' + escHtml(d.carrera || '\u2013') + '</td>' +
      '<td class="badge-telegram">' + escHtml(d.telegram || '\u2013') + '</td>' +
      '<td>' +
        '<span class="' + (asistencia ? 'tag-asistencia-ok' : 'tag-asistencia-no') + '">' +
          (asistencia ? '\u2714' : '\u2716') +
        '</span>' +
      '</td>' +
      '<td>' +
        '<button class="del-btn" data-key="' + escHtml(cedula) + '">Reiniciar</button>' +
      '</td>';

    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRegistro(btn.dataset.key));
  });
}

function updateStats(data) {
  const entries = Object.values(data);
  const total = entries.length;
  const asistieron = entries.filter(v => v.asistencia === true).length;
  const pendientes = total - asistieron;

  if (statTotal) statTotal.textContent = total;
  if (statHoy) statHoy.textContent = asistieron;
  if (statReciente) statReciente.textContent = pendientes;
}

async function deleteRegistro(cedula) {
  if (!confirm('Reiniciar asistencia de la cedula ' + cedula + '?')) return;

  try {
    await userRemove(userRef(userDb, DB_ASIST + '/' + cedula));
    await adminUpdate(adminRef(adminDb, DB_ADMIN_ESTUDIANTES + '/' + cedula), {
      telegram: '',
      asistencia: false
    });

    toast('Asistencia reiniciada.', 'warn');
  } catch (err) {
    console.error(err);
    toast('Error al reiniciar asistencia.', 'error');
  }
}

function exportarExcel() {
  const entries = Object.entries(registros);

  if (!entries.length) {
    toast('No hay datos para exportar.', 'warn');
    return;
  }

  if (typeof XLSX === 'undefined') {
    toast('La libreria XLSX no esta cargada en el HTML.', 'error');
    return;
  }

  const rows = entries.map(([cedula, d], i) => ({
    '#': i + 1,
    'Cedula': cedula,
    'Nombre': d.nombre || '',
    'Carrera': d.carrera || '',
    'Telegram': d.telegram || '',
    'Asistencia': d.asistencia === true ? 'Si' : 'No'
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
  manualErr.textContent = msg;
  manualErr.style.display = 'block';
}

function validarCedulaEnVivo() {
  if (!manualCedula || !manualCedulaHint) return;
  const cedula = manualCedula.value.trim();

  if (!cedula) {
    manualCedulaHint.textContent = '';
    manualCedulaHint.className = 'manual-field-hint';
    return;
  }

  if (adminEstudiantes[cedula]) {
    manualCedulaHint.textContent = '\u26a0 Esta cedula ya existe en la base de datos';
    manualCedulaHint.className = 'manual-field-hint err';
  } else {
    manualCedulaHint.textContent = '\u2714 Cedula disponible';
    manualCedulaHint.className = 'manual-field-hint ok';
  }
}

async function confirmarRegistroManual() {
  if (!manualErr) return;
  manualErr.style.display = 'none';

  const cedula   = manualCedula?.value.trim()   || '';
  const nombre   = manualNombre?.value.trim()   || '';
  const carrera  = manualCarrera?.value.trim()  || '';
  const telegram = manualTelegram?.value.trim() || '';
  const asistio  = manualAsistencia?.checked === true;

  if (!cedula)  { mostrarErrManual('La cedula es obligatoria.');  manualCedula?.focus();  return; }
  if (!nombre)  { mostrarErrManual('El nombre es obligatorio.');  manualNombre?.focus();  return; }
  if (!carrera) { mostrarErrManual('La carrera es obligatoria.'); manualCarrera?.focus(); return; }

  if (adminEstudiantes[cedula]) {
    mostrarErrManual('La cedula "' + cedula + '" ya existe. Usa "Reiniciar" si quieres actualizarla.');
    manualCedula?.focus();
    return;
  }

  if (confirmarManualBtn) {
    confirmarManualBtn.disabled = true;
    confirmarManualBtn.textContent = 'Guardando...';
  }

  try {
    // 1. Guardar en admin_estudiantes (aparece en la lista de registros)
    await adminUpdate(adminRef(adminDb, DB_ADMIN_ESTUDIANTES + '/' + cedula), {
      nombres:            nombre,
      carrera,
      telegram:           telegram || '',
      asistencia:         asistio
    });

    // 2. Si se marcó asistencia, escribir también en asistencias (base usuario)
    if (asistio) {
      await userSet(userRef(userDb, DB_ASIST + '/' + cedula), {
        cedula,
        telegram:           telegram || '',
        asistencia:         true,
        registradoPorAdmin: true,
        fechaRegistro:      Date.now()
      });
    }

    toast('Estudiante "' + nombre + '" registrado correctamente.', 'success');
    cerrarManualModal();

  } catch (err) {
    console.error(err);
    mostrarErrManual('Error al guardar en la base de datos. Intenta de nuevo.');
  } finally {
    if (confirmarManualBtn) {
      confirmarManualBtn.disabled = false;
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

  userOnValue(userRef(userDb, DB_ASIST), snapshot => {
    asistenciasUsuario = snapshot.val() || {};
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