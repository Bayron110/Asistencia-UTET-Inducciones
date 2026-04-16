import {
  db as userDb,
  ref as userRef,
  onValue as userOnValue,
  set as userSet
} from '../../Firebase/firebase.js';

const DB_CONFIG = 'config/sesion';

const $ = id => document.getElementById(id);

const sessionDot = $('sessionDot');
const sessionLabel = $('sessionLabel');
const statusCircle = $('statusCircle');
const statusLabel = $('statusLabel');
const statusSub = $('statusSub');
const abrirBtn = $('abrirBtn');
const cerrarBtn = $('cerrarBtn');
const programarBtn = $('programarBtn');
const customMin = $('customMin');
const countdownWrap = $('countdownWrap');
const countdownTimer = $('countdownTimer');
const countdownBarFill = $('countdownBarFill');
const timerChips = document.querySelectorAll('.timer-chip');

let sesionActiva = false;
let cierreTs = null;
let totalDuration = null;
let countdownInterval = null;
let selectedMinutes = null;
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

function formatDuration(ms) {
  if (ms <= 0) return '00:00:00';

  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

async function setSesion(activo, closeAt = null) {
  await userSet(userRef(userDb, DB_CONFIG), {
    activo,
    cierreTs: closeAt || null,
    updatedAt: Date.now()
  });
}

function applySesionConfig(cfg) {
  if (!cfg) {
    sesionActiva = false;
    cierreTs = null;
    updateSesionUI(false, null);
    return;
  }

  const { activo, cierreTs: ct } = cfg;

  if (activo && ct && Date.now() >= ct) {
    setSesion(false, null);
    return;
  }

  sesionActiva = !!activo;
  cierreTs = ct || null;
  updateSesionUI(sesionActiva, cierreTs);
}

function updateSesionUI(activo, ct) {
  if (sessionDot) {
    sessionDot.className = 'session-dot ' + (activo ? 'open' : 'closed');
  }

  if (sessionLabel) {
    sessionLabel.textContent = activo ? 'Formulario ABIERTO' : 'Formulario CERRADO';
  }

  if (statusCircle) {
    statusCircle.className = 'status-circle ' + (activo ? 'open' : 'closed');
  }

  if (statusLabel) {
    statusLabel.textContent = activo ? 'Formulario abierto' : 'Formulario cerrado';
  }

  if (statusSub) {
    if (activo && ct) {
      statusSub.textContent = `Cierra automáticamente en ${formatDuration(ct - Date.now())}`;
    } else if (activo) {
      statusSub.textContent = 'Sin límite de tiempo';
    } else {
      statusSub.textContent = 'Los estudiantes no pueden registrar asistencia';
    }
  }

  if (abrirBtn) abrirBtn.disabled = activo;
  if (cerrarBtn) cerrarBtn.disabled = !activo;

  clearCountdown();

  if (activo && ct) {
    startCountdown(ct);
  } else if (countdownWrap) {
    countdownWrap.style.display = 'none';
  }
}

function startCountdown(closeAt) {
  if (!totalDuration || cierreTs !== closeAt) {
    totalDuration = closeAt - Date.now();
  }

  if (countdownWrap) {
    countdownWrap.style.display = 'flex';
  }

  tickCountdown(closeAt);
  countdownInterval = setInterval(() => tickCountdown(closeAt), 1000);
}

async function tickCountdown(closeAt) {
  const remaining = closeAt - Date.now();

  if (remaining <= 0) {
    if (countdownTimer) countdownTimer.textContent = '00:00:00';
    if (countdownBarFill) countdownBarFill.style.width = '0%';

    clearCountdown();

    if (sesionActiva) {
      await setSesion(false, null);
      toast('El formulario se cerró automáticamente.', 'warn');
    }
    return;
  }

  if (countdownTimer) {
    countdownTimer.textContent = formatDuration(remaining);
  }

  const pct = totalDuration > 0
    ? Math.min((remaining / totalDuration) * 100, 100)
    : 0;

  if (countdownBarFill) {
    countdownBarFill.style.width = pct + '%';
  }

  if (countdownBarFill && countdownTimer) {
    if (pct < 20) {
      countdownBarFill.style.background = '#ef4444';
      countdownTimer.style.color = '#f87171';
    } else if (pct < 50) {
      countdownBarFill.style.background = '#f59e0b';
      countdownTimer.style.color = '#fbbf24';
    } else {
      countdownBarFill.style.background = '#f59e0b';
      countdownTimer.style.color = '#f59e0b';
    }
  }

  if (statusSub && sesionActiva && closeAt) {
    statusSub.textContent = `Cierra automáticamente en ${formatDuration(remaining)}`;
  }
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  totalDuration = null;
}

async function abrirFormularioAhora() {
  try {
    await setSesion(true, null);
    toast('Formulario abierto.', 'success');
  } catch (error) {
    console.error(error);
    toast('No se pudo abrir el formulario.', 'error');
  }
}

async function cerrarFormularioAhora() {
  try {
    await setSesion(false, null);
    clearCountdown();
    toast('Formulario cerrado.', 'warn');
  } catch (error) {
    console.error(error);
    toast('No se pudo cerrar el formulario.', 'error');
  }
}

async function abrirConTemporizador() {
  const mins = selectedMinutes || parseInt(customMin?.value);

  if (!mins || isNaN(mins) || mins < 1) {
    toast('Ingresa un tiempo válido (mínimo 1 min).', 'warn');
    return;
  }

  try {
    const closeAt = Date.now() + mins * 60_000;
    await setSesion(true, closeAt);
    toast(`Formulario abierto por ${mins} minuto${mins > 1 ? 's' : ''}.`, 'success');
  } catch (error) {
    console.error(error);
    toast('No se pudo programar el cierre automático.', 'error');
  }
}

function bindTimerChips() {
  timerChips.forEach(chip => {
    chip.addEventListener('click', () => {
      timerChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      selectedMinutes = parseInt(chip.dataset.min);
      if (customMin) customMin.value = '';
    });
  });

  if (customMin) {
    customMin.addEventListener('input', () => {
      timerChips.forEach(c => c.classList.remove('selected'));
      selectedMinutes = null;
    });
  }
}

function bindEventosSesion() {
  if (abrirBtn) {
    abrirBtn.addEventListener('click', abrirFormularioAhora);
  }

  if (cerrarBtn) {
    cerrarBtn.addEventListener('click', cerrarFormularioAhora);
  }

  if (programarBtn) {
    programarBtn.addEventListener('click', abrirConTemporizador);
  }

  bindTimerChips();
}

function iniciarListenersSesion() {
  if (listenersIniciados) return;
  listenersIniciados = true;

  userOnValue(userRef(userDb, DB_CONFIG), snapshot => {
    applySesionConfig(snapshot.val());
  });
}

function iniciarControlSesion() {
  bindEventosSesion();
  iniciarListenersSesion();
}

function detenerControlSesion() {
  clearCountdown();
}

function obtenerEstadoSesion() {
  return {
    activa: sesionActiva,
    cierreTs
  };
}

export {
  iniciarControlSesion,
  detenerControlSesion,
  iniciarListenersSesion,
  abrirFormularioAhora,
  cerrarFormularioAhora,
  abrirConTemporizador,
  obtenerEstadoSesion,
  setSesion,
  clearCountdown,
  formatDuration
};