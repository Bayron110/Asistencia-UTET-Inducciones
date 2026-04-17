import {
  db as adminDb,
  ref as adminRef,
  set as adminSet,
  get as adminGet
} from '../../Firebase/firebase-admin.js';

const DB_ADMIN_CONFIG   = 'configAdmin/adminPrincipal';
const SESSION_KEY       = 'itsqmet_admin_session'; // clave de localStorage

const $ = id => document.getElementById(id);

const loginScreen       = $('loginScreen');
const dashboard         = $('dashboard');
const loginBtn          = $('loginBtn');
const loginErr          = $('loginErr');
const logoutBtn         = $('logoutBtn');
const adminPassEl       = $('adminPass');
const adminEmailEl      = $('adminEmail');
const registerAdminBtn  = $('registerAdminBtn');
const registerAdminWrap = $('registerAdminWrap');
const registerHint      = $('registerHint');

let adminRegistrado   = false;
let adminActual       = null;
let dashboardAbierto  = false;
let onDashboardOpen   = null;
let onDashboardClose  = null;

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
    warn:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"   stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = (icons[type] || '') + `<span>${escHtml(msg)}</span>`;
  toastContainer.appendChild(t);

  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity    = '0';
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

function validarCorreo(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

async function hashPassword(texto) {
  const encoder    = new TextEncoder();
  const data       = encoder.encode(texto);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ══════════════════════════════════════════════════════════════
   SESIÓN PERSISTENTE (localStorage)
══════════════════════════════════════════════════════════════ */

/**
 * Guarda un token de sesión en localStorage.
 * Almacenamos el correo y el hash para verificar que
 * la cuenta sigue siendo válida en Firebase al restaurar.
 */
function guardarSesionLocal(correo, passwordHash) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      correo,
      passwordHash,
      ts: Date.now()
    }));
  } catch (_) {
    // localStorage no disponible (modo privado extremo, etc.)
  }
}

function leerSesionLocal() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function limpiarSesionLocal() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
}

/**
 * Intenta restaurar la sesión guardada.
 * Verifica contra Firebase que la cuenta aún existe
 * y que el hash coincide antes de abrir el dashboard.
 * Retorna true si la sesión fue restaurada, false si no.
 */
async function intentarRestaurarSesion() {
  const sesion = leerSesionLocal();
  if (!sesion) return false;

  try {
    const snap = await adminGet(adminRef(adminDb, DB_ADMIN_CONFIG));
    if (!snap.exists()) {
      limpiarSesionLocal();
      return false;
    }

    const adminFirebase = snap.val();

    // Si el hash guardado coincide con el de Firebase, la sesión es válida
    if (adminFirebase.passwordHash === sesion.passwordHash) {
      adminActual      = adminFirebase;
      adminRegistrado  = true;
      return true;
    }

    // El hash cambió (contraseña actualizada) → invalidar sesión
    limpiarSesionLocal();
    return false;
  } catch (err) {
    console.warn('No se pudo verificar la sesión guardada:', err);
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════
   VERIFICAR ESTADO ADMIN
══════════════════════════════════════════════════════════════ */

async function verificarEstadoAdmin() {
  try {
    const snap  = await adminGet(adminRef(adminDb, DB_ADMIN_CONFIG));
    adminActual = snap.exists() ? snap.val() : null;
    adminRegistrado = !!adminActual;

    if (adminRegistrado) {
      if (registerAdminWrap) registerAdminWrap.style.display = 'none';
      if (adminEmailEl)      adminEmailEl.style.display      = 'none';
      if (registerHint)      registerHint.textContent        = 'Ingresa con la contraseña del administrador.';
    } else {
      if (registerAdminWrap) registerAdminWrap.style.display = 'block';
      if (adminEmailEl)      adminEmailEl.style.display      = 'block';
      if (registerHint) {
        registerHint.textContent = 'Aún no existe administrador. El primero que se registre será el admin principal.';
      }
    }
  } catch (error) {
    console.error(error);
    if (loginErr) loginErr.textContent = 'No se pudo verificar el estado del admin.';
  }
}

/* ══════════════════════════════════════════════════════════════
   REGISTRAR PRIMER ADMIN
══════════════════════════════════════════════════════════════ */

async function registrarPrimerAdmin() {
  const correo   = (adminEmailEl?.value || '').trim().toLowerCase();
  const password = (adminPassEl?.value  || '').trim();

  if (!correo) {
    if (loginErr) loginErr.textContent = 'Ingresa el correo del administrador.';
    adminEmailEl?.focus();
    return;
  }

  if (!validarCorreo(correo)) {
    if (loginErr) loginErr.textContent = 'El correo no es válido.';
    adminEmailEl?.focus();
    return;
  }

  if (password.length < 6) {
    if (loginErr) loginErr.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    adminPassEl?.focus();
    return;
  }

  try {
    const snap = await adminGet(adminRef(adminDb, DB_ADMIN_CONFIG));

    if (snap.exists()) {
      adminActual     = snap.val();
      adminRegistrado = true;

      if (registerAdminWrap) registerAdminWrap.style.display = 'none';
      if (adminEmailEl)      adminEmailEl.style.display      = 'none';
      if (registerHint)      registerHint.textContent        = 'Ingresa con la contraseña del administrador.';
      if (loginErr) loginErr.textContent = 'El administrador ya fue registrado. Ahora solo inicia sesión.';
      return;
    }

    const passwordHash = await hashPassword(password);

    const payload = {
      correo,
      passwordHash,
      creadoEn: Date.now()
    };

    await adminSet(adminRef(adminDb, DB_ADMIN_CONFIG), payload);

    adminActual     = payload;
    adminRegistrado = true;

    if (registerAdminWrap) registerAdminWrap.style.display = 'none';
    if (adminEmailEl)      adminEmailEl.style.display      = 'none';
    if (registerHint)      registerHint.textContent        = 'Ingresa con la contraseña del administrador.';
    if (loginErr)          loginErr.textContent            = '';

    // Guardar sesión persistente
    guardarSesionLocal(correo, passwordHash);

    toast('Administrador principal registrado correctamente.', 'success');
    abrirDashboard();
  } catch (error) {
    console.error(error);
    if (loginErr) loginErr.textContent = 'No se pudo registrar el administrador.';
  }
}

/* ══════════════════════════════════════════════════════════════
   LOGIN
══════════════════════════════════════════════════════════════ */

async function doLogin() {
  const password = (adminPassEl?.value || '').trim();

  if (!adminRegistrado) {
    if (loginErr) loginErr.textContent = 'Primero debes registrar al administrador.';
    return;
  }

  if (!password) {
    if (loginErr) loginErr.textContent = 'Ingresa la contraseña.';
    adminPassEl?.focus();
    return;
  }

  try {
    const snap = await adminGet(adminRef(adminDb, DB_ADMIN_CONFIG));

    if (!snap.exists()) {
      adminRegistrado = false;
      adminActual     = null;
      await verificarEstadoAdmin();
      if (loginErr) loginErr.textContent = 'No existe administrador registrado.';
      return;
    }

    adminActual = snap.val();

    const passwordHash = await hashPassword(password);

    if (passwordHash === adminActual.passwordHash) {
      if (loginErr) loginErr.textContent = '';

      // Guardar sesión persistente
      guardarSesionLocal(adminActual.correo, adminActual.passwordHash);

      abrirDashboard();
    } else {
      if (loginErr) loginErr.textContent = 'Contraseña incorrecta.';
      if (adminPassEl) {
        adminPassEl.value = '';
        adminPassEl.focus();
      }
    }
  } catch (error) {
    console.error(error);
    if (loginErr) loginErr.textContent = 'Error al iniciar sesión.';
  }
}

/* ══════════════════════════════════════════════════════════════
   ABRIR / CERRAR DASHBOARD
══════════════════════════════════════════════════════════════ */

function abrirDashboard() {
  if (dashboardAbierto) return;

  loginScreen?.classList.add('hidden');
  dashboard?.classList.add('visible');
  dashboardAbierto = true;

  if (typeof onDashboardOpen === 'function') {
    onDashboardOpen();
  }
}

function cerrarDashboard() {
  // Eliminar sesión persistente al hacer logout explícito
  limpiarSesionLocal();

  loginScreen?.classList.remove('hidden');
  dashboard?.classList.remove('visible');
  dashboardAbierto = false;

  if (adminPassEl) adminPassEl.value = '';
  if (loginErr)    loginErr.textContent = '';

  if (typeof onDashboardClose === 'function') {
    onDashboardClose();
  }

  verificarEstadoAdmin();
}

/* ══════════════════════════════════════════════════════════════
   CONFIGURACIÓN Y ARRANQUE
══════════════════════════════════════════════════════════════ */

function configurarAutenticacion(opciones = {}) {
  onDashboardOpen = typeof opciones.onDashboardOpen === 'function'
    ? opciones.onDashboardOpen
    : null;

  onDashboardClose = typeof opciones.onDashboardClose === 'function'
    ? opciones.onDashboardClose
    : null;
}

function bindEventosAutenticacion() {
  if (loginBtn)         loginBtn.addEventListener('click', doLogin);
  if (registerAdminBtn) registerAdminBtn.addEventListener('click', registrarPrimerAdmin);
  if (logoutBtn)        logoutBtn.addEventListener('click', cerrarDashboard);

  if (adminPassEl) {
    adminPassEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (adminRegistrado) doLogin();
        else                 registrarPrimerAdmin();
      }
    });
  }

  if (adminEmailEl) {
    adminEmailEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') registrarPrimerAdmin();
    });
  }
}

/**
 * Punto de entrada principal.
 * 1. Intenta restaurar sesión guardada.
 * 2. Si no hay sesión, muestra el login normal.
 */
async function iniciarAutenticacion() {
  bindEventosAutenticacion();

  // Mostrar estado de verificación mientras cargamos
  if (registerHint) registerHint.textContent = 'Verificando sesión…';

  const sesionRestaurada = await intentarRestaurarSesion();

  if (sesionRestaurada) {
    // Sesión válida — abrir dashboard directamente sin mostrar login
    abrirDashboard();
  } else {
    // Sin sesión guardada — flujo normal de login
    await verificarEstadoAdmin();
  }
}

function estaAutenticado() {
  return dashboardAbierto;
}

function obtenerAdminActual() {
  return adminActual;
}

export {
  iniciarAutenticacion,
  configurarAutenticacion,
  verificarEstadoAdmin,
  registrarPrimerAdmin,
  doLogin,
  abrirDashboard,
  cerrarDashboard,
  estaAutenticado,
  obtenerAdminActual,
  hashPassword
};