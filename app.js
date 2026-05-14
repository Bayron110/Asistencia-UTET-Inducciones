import {
  db,
  ref,
  get,
  set,
  onValue
} from './Firebase/firebase-admin.js';

'use strict';

const CONFIG = {
  STORAGE_KEY: 'itsqmet_asist_submitted',
  RATE_LIMIT_KEY: 'itsqmet_last_attempt',
  RATE_LIMIT_MS: 5000,
  SESSION_TTL_MS: 12 * 60 * 60 * 1000,
  MAX_CEDULA_LEN: 10,
  MIN_CEDULA_LEN: 10,
  TELEGRAM_REGEX: /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/,
  DB_ADMIN_PATH: 'admin_estudiantes',
  DB_CONFIG_PATH: 'config/sesion'
};

const $ = id => document.getElementById(id);

const form          = $('asistForm');
const cedulaInput   = $('cedula');
const nombreInput   = $('nombre');
const carreraInput  = $('carrera');
const telegramInput = $('telegram');
const submitBtn     = $('submitBtn');
const btnText       = $('btnText');
const btnSpinner    = $('btnSpinner');
const btnIcon       = $('btnIcon');
const cedulaBar     = $('cedulaBar');
const cedulaErr     = $('cedulaErr');
const telegramErr   = $('telegramErr');
const alreadyBanner = $('alreadyBanner');
const sesionBanner  = $('sesionBanner');
const modalOverlay  = $('modalOverlay');
const modalCedula   = $('modalCedula');
const modalNombre   = $('modalNombre');
const modalCarrera  = $('modalCarrera');
const modalTelegram = $('modalTelegram');
const modalTs       = $('modalTs');
const modalClose    = $('modalClose');

let estudianteActual = null;
let sesionActual     = null;

// ─── Utilidades ──────────────────────────────────────────────────────────────

function sanitize(str) {
  return String(str).replace(/[<>"'`]/g, '').trim().slice(0, 200);
}

function validarCedulaEC(cedula) {
  if (!/^\d{10}$/.test(cedula)) return false;

  const prov = parseInt(cedula.substring(0, 2), 10);
  if (prov < 1 || prov > 24) return false;

  const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;

  for (let i = 0; i < 9; i++) {
    let val = parseInt(cedula[i], 10) * coefs[i];
    if (val >= 10) val -= 9;
    suma += val;
  }

  const digitoVerificador = parseInt(cedula[9], 10);
  const residuo = suma % 10;

  return residuo === 0
    ? digitoVerificador === 0
    : (10 - residuo) === digitoVerificador;
}

function validarTelegram(val) {
  return CONFIG.TELEGRAM_REGEX.test(val.startsWith('@') ? val : '@' + val);
}

// ─── LocalStorage ────────────────────────────────────────────────────────────

function yaEnviado() {
  try {
    const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);

    if (Date.now() - data.ts > CONFIG.SESSION_TTL_MS) {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      return false;
    }

    return data;
  } catch {
    return false;
  }
}

function marcarEnviado(cedula, telegram) {
  const payload = { ts: Date.now(), cedula, telegram };
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload)); } catch {}
  try { sessionStorage.setItem(CONFIG.STORAGE_KEY, '1'); } catch {}
}

function checkRateLimit() {
  try {
    const last = parseInt(localStorage.getItem(CONFIG.RATE_LIMIT_KEY) || '0', 10);
    return Date.now() - last < CONFIG.RATE_LIMIT_MS;
  } catch {
    return false;
  }
}

function updateRateLimit() {
  try {
    localStorage.setItem(CONFIG.RATE_LIMIT_KEY, Date.now().toString());
  } catch {}
}

// ─── Sesión ───────────────────────────────────────────────────────────────────

function normalizarTelegram(valor) {
  let v = sanitize(valor);
  if (v && !v.startsWith('@')) v = '@' + v;
  return v;
}

function sesionEstaActiva(cfg) {
  if (!cfg) return true;
  if (!cfg.activo) return false;
  if (cfg.cierreTs && Date.now() >= cfg.cierreTs) return false;
  return true;
}

function mensajeSesion(cfg) {
  if (!cfg) return '';
  if (!cfg.activo) return 'El período de registro ha finalizado. Contacta a tu docente.';
  if (cfg.cierreTs && Date.now() >= cfg.cierreTs) {
    return 'El tiempo de registro venció. Contacta a tu docente.';
  }
  return '';
}

function bloquearFormulario(mensaje) {
  if (cedulaInput) cedulaInput.disabled = true;
  if (telegramInput) telegramInput.disabled = true;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '.45';
    submitBtn.style.cursor = 'not-allowed';
  }

  if (sesionBanner) {
    const detail = sesionBanner.querySelector('.sesion-detail');
    if (detail) detail.textContent = mensaje;
    sesionBanner.classList.add('show');
  }
}

function desbloquearFormulario() {
  const ya = yaEnviado();

  if (!ya) {
    if (cedulaInput) cedulaInput.disabled = false;
    if (telegramInput) telegramInput.disabled = false;

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '';
      submitBtn.style.cursor = '';
    }
  }

  if (sesionBanner) sesionBanner.classList.remove('show');
}

function aplicarEstadoSesion(cfg) {
  sesionActual = cfg || null;

  if (sesionEstaActiva(cfg)) {
    desbloquearFormulario();
  } else {
    bloquearFormulario(mensajeSesion(cfg));
  }
}

// Escucha cambios de sesión en tiempo real — ahora usando la única db
function inicializarSesionTiempoReal() {
  onValue(ref(db, CONFIG.DB_CONFIG_PATH), snapshot => {
    aplicarEstadoSesion(snapshot.val());
  });
}

// ─── Firebase (todo sobre la misma db) ───────────────────────────────────────

async function obtenerEstudianteAdmin(cedula) {
  const snapshot = await get(ref(db, `${CONFIG.DB_ADMIN_PATH}/${cedula}`));
  return snapshot.exists() ? snapshot.val() : null;
}

async function actualizarAdminEstudiante(cedula, nombre, carrera, telegram) {
  await set(ref(db, `${CONFIG.DB_ADMIN_PATH}/${cedula}`), {
    cedula,
    nombres: nombre,
    carrera,
    telegram,
    asistencia: true
  });
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function updateCedulaProgress(len) {
  if (!cedulaBar) return;

  const pct = Math.min((len / CONFIG.MAX_CEDULA_LEN) * 100, 100);
  cedulaBar.style.width = pct + '%';

  if (pct < 50) {
    cedulaBar.style.background = 'linear-gradient(90deg,#e53e3e,#fc8181)';
  } else if (pct < 100) {
    cedulaBar.style.background = 'linear-gradient(90deg,#f59e0b,#fbbf24)';
  } else {
    cedulaBar.style.background = 'linear-gradient(90deg,#1a4aaa,#22c55e)';
  }
}

function setFieldState(input, errEl, valid, errMsg) {
  if (!input) return;

  input.classList.toggle('valid', valid);
  input.classList.toggle('invalid', !valid && errMsg !== null);

  const okIcon  = input.parentElement?.querySelector('.status-icon--ok');
  const errIcon = input.parentElement?.querySelector('.status-icon--err');

  if (okIcon)  okIcon.style.display  = valid ? 'block' : 'none';
  if (errIcon) errIcon.style.display = (!valid && errMsg) ? 'block' : 'none';

  if (errEl) {
    errEl.textContent = errMsg || '';
    errEl.classList.toggle('show', !!errMsg && !valid);
  }
}

function limpiarDatosEstudiante() {
  estudianteActual = null;
  if (nombreInput)  nombreInput.value  = '';
  if (carreraInput) carreraInput.value = '';
}

async function autocompletarEstudiantePorCedula() {
  const cedula = cedulaInput?.value.trim() || '';

  limpiarDatosEstudiante();

  if (!/^\d{10}$/.test(cedula)) return;
  if (!validarCedulaEC(cedula)) return;

  try {
    const estudiante = await obtenerEstudianteAdmin(cedula);

    if (!estudiante) {
      setFieldState(cedulaInput, cedulaErr, false, 'La cédula no existe en la base cargada por el admin');
      return;
    }

    estudianteActual = estudiante;

    if (nombreInput)  nombreInput.value  = estudiante.nombres || estudiante.nombre || '';
    if (carreraInput) carreraInput.value = estudiante.carrera || '';
  } catch (err) {
    console.error(err);
    showToast('No se pudo consultar la información del estudiante.', 'error');
  }
}

// ─── Bindings ─────────────────────────────────────────────────────────────────

function bindCedulaInput() {
  if (!cedulaInput) return;

  cedulaInput.addEventListener('input', async () => {
    cedulaInput.value = cedulaInput.value.replace(/\D/g, '').slice(0, CONFIG.MAX_CEDULA_LEN);

    const len = cedulaInput.value.length;
    updateCedulaProgress(len);
    limpiarDatosEstudiante();

    if (len === 0) {
      setFieldState(cedulaInput, cedulaErr, false, null);
      return;
    }

    if (len < CONFIG.MIN_CEDULA_LEN) {
      setFieldState(cedulaInput, cedulaErr, false, `Faltan ${CONFIG.MIN_CEDULA_LEN - len} dígitos`);
      return;
    }

    if (!validarCedulaEC(cedulaInput.value)) {
      setFieldState(cedulaInput, cedulaErr, false, 'Cédula ecuatoriana inválida');
      return;
    }

    setFieldState(cedulaInput, cedulaErr, true, null);
    await autocompletarEstudiantePorCedula();
  });

  cedulaInput.addEventListener('paste', e => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const clean = paste.replace(/\D/g, '').slice(0, CONFIG.MAX_CEDULA_LEN);
    cedulaInput.value = clean;
    cedulaInput.dispatchEvent(new Event('input'));
  });

  cedulaInput.addEventListener('contextmenu', e => e.preventDefault());
}

function bindTelegramInput() {
  if (!telegramInput) return;

  telegramInput.addEventListener('input', () => {
    const val = telegramInput.value;

    if (val.length > 0 && !val.startsWith('@')) {
      telegramInput.value = '@' + val;
    }

    const v = telegramInput.value;

    if (v.length <= 1) {
      setFieldState(telegramInput, telegramErr, false, null);
      return;
    }

    if (!validarTelegram(v)) {
      setFieldState(telegramInput, telegramErr, false, 'Formato inválido. Ej: @mi_usuario (5–32 caracteres)');
    } else {
      setFieldState(telegramInput, telegramErr, true, null);
    }
  });
}

function showAlreadySent(cedula) {
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '.5';
    submitBtn.style.cursor  = 'not-allowed';
  }

  if (cedulaInput)   cedulaInput.disabled   = true;
  if (telegramInput) telegramInput.disabled = true;
  if (alreadyBanner) alreadyBanner.classList.add('show');

  const span = alreadyBanner?.querySelector('.already-detail');
  if (span && cedula) {
    span.textContent = `Cédula: ${cedula.slice(0, 3)}•••${cedula.slice(-2)}`;
  }
}

function revisarEstadoInicial() {
  const ya = yaEnviado();
  if (ya) showAlreadySent(ya.cedula);
}

function setBtnLoading(on) {
  if (!submitBtn || !btnText || !btnSpinner || !btnIcon) return;

  submitBtn.disabled        = on;
  btnSpinner.style.display  = on ? 'block' : 'none';
  btnIcon.style.display     = on ? 'none'  : 'block';
  btnText.textContent       = on ? 'Enviando…' : 'Registrar Asistencia';
}

function setBtnSuccess() {
  if (!submitBtn || !btnIcon || !btnText) return;

  submitBtn.style.background = 'linear-gradient(135deg,#16a34a 0%,#22c55e 100%)';
  submitBtn.style.boxShadow  = '0 5px 18px rgba(34,197,94,.40)';
  btnIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
         stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  `;
  btnText.textContent  = '¡Enviado!';
  submitBtn.disabled   = true;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function openModal(cedula, nombre, carrera, telegram) {
  if (!modalOverlay) return;

  const masked = cedula.slice(0, 3) + '•'.repeat(5) + cedula.slice(-2);

  if (modalCedula)   modalCedula.textContent   = masked;
  if (modalNombre)   modalNombre.textContent   = nombre;
  if (modalCarrera)  modalCarrera.textContent  = carrera;
  if (modalTelegram) modalTelegram.textContent = telegram;
  if (modalTs) {
    modalTs.textContent = new Date().toLocaleString('es-EC', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
  }

  modalOverlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove('show');
  document.body.style.overflow = '';
}

function bindModal() {
  if (modalClose) modalClose.addEventListener('click', closeModal);

  if (modalOverlay) {
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'error') {
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const t  = document.createElement('div');
  t.className = 'toast';

  const bg = type === 'error' ? '#e53e3e' : '#f59e0b';
  t.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bg};
    color: #fff;
    font-family: 'Montserrat', sans-serif;
    font-weight: 600;
    font-size: .84rem;
    padding: 12px 24px;
    border-radius: 99px;
    box-shadow: 0 4px 20px rgba(0,0,0,.25);
    z-index: 2000;
    white-space: nowrap;
    animation: toastIn .3s ease both;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0);    }
    }
  `;

  document.head.appendChild(style);
  t.textContent = msg;
  document.body.appendChild(t);

  setTimeout(() => {
    t.style.opacity    = '0';
    t.style.transition = 'opacity .3s';
    setTimeout(() => t.remove(), 300);
  }, 4000);
}

// ─── Submit ───────────────────────────────────────────────────────────────────

function bindFormSubmit() {
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (submitBtn?.disabled || cedulaInput?.disabled || telegramInput?.disabled) return;

    if (!sesionEstaActiva(sesionActual)) {
      bloquearFormulario(mensajeSesion(sesionActual));
      return;
    }

    // Rate limit SOLO para spam real
    if (checkRateLimit()) {
      showToast('Espera unos segundos antes de volver a intentar.', 'warn');
      return;
    }

    const cedula   = sanitize(cedulaInput?.value || '');
    const telegram = normalizarTelegram(telegramInput?.value || '');
    const nombre   = sanitize(nombreInput?.value || '');
    const carrera  = sanitize(carreraInput?.value || '');

    let hasError = false;

    // ───── Validar cédula ─────
    if (!validarCedulaEC(cedula)) {
      setFieldState(
        cedulaInput,
        cedulaErr,
        false,
        'Ingresa una cédula ecuatoriana válida'
      );

      cedulaInput?.focus();
      hasError = true;
    }

    // ───── Validar estudiante ─────
    if (!estudianteActual || !nombre || !carrera) {
      setFieldState(
        cedulaInput,
        cedulaErr,
        false,
        'La cédula no está registrada por el administrador'
      );

      if (!hasError) cedulaInput?.focus();
      hasError = true;
    }

    // ───── Validar Telegram ─────
    if (!validarTelegram(telegram)) {
      setFieldState(
        telegramInput,
        telegramErr,
        false,
        'Formato inválido. Ej: @usuario'
      );

      if (!hasError) telegramInput?.focus();
      hasError = true;
    }

    // ❌ YA NO BLOQUEAMOS POR ERRORES
    if (hasError) {
      return;
    }

    setBtnLoading(true);

    try {

      // ───── Verificar sesión ─────
      const cfgSnap = await get(ref(db, CONFIG.DB_CONFIG_PATH));

      aplicarEstadoSesion(cfgSnap.val());

      if (
        !sesionEstaActiva(sesionActual) ||
        submitBtn?.disabled ||
        cedulaInput?.disabled
      ) {
        setBtnLoading(false);
        return;
      }

      // ───── Revisar si ya registró ─────
      const existe = await get(
        ref(db, `${CONFIG.DB_ADMIN_PATH}/${cedula}`)
      );

      const yaAsistio =
        existe.exists() &&
        existe.val()?.asistencia === true;

      if (yaAsistio) {

        setBtnLoading(false);

        setFieldState(
          cedulaInput,
          cedulaErr,
          false,
          'Esta cédula ya registró asistencia'
        );

        showToast(
          'Esta cédula ya registró asistencia.',
          'warn'
        );

        return;
      }

      // ───── Guardar asistencia ─────
      await actualizarAdminEstudiante(
        cedula,
        nombre,
        carrera,
        telegram
      );

      // ───── Guardar estado local ─────
      marcarEnviado(cedula, telegram);

      // ✅ RATE LIMIT SOLO DESPUÉS DEL ÉXITO
      updateRateLimit();

      setBtnLoading(false);

      setBtnSuccess();

      setTimeout(() => {
        openModal(
          cedula,
          nombre,
          carrera,
          telegram
        );
      }, 600);

    } catch (err) {

      console.error('Firebase error:', err);

      // ❌ YA NO BLOQUEAMOS POR ERROR FIREBASE
      setBtnLoading(false);

      showToast(
        'Error al registrar en Firebase. Intenta nuevamente.',
        'error'
      );
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  bindCedulaInput();
  bindTelegramInput();
  bindFormSubmit();
  bindModal();
  revisarEstadoInicial();
  inicializarSesionTiempoReal();
}

init();