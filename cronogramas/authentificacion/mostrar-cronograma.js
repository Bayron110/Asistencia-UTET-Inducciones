// ── mostrar-cronograma.js ────────────────────────────────────
// ?cedula=XXXXXXXXXX&cronogramaId=abc123&tipo=estudiante|docente
// Sin parámetros → redirige a cedula-solicitud.html
// ─────────────────────────────────────────────────────────────

import { escucharCronogramas, calcularEstado, obtenerCronogramas, obtenerDocentePorCedula } from '../../Firebase/cronograma.js';
import { generarLinkActivacion, procesarRegistros, revisarYNotificar } from '../notificaciones/notificacon-web.js';

const BOT_USERNAME = 'itsometcronogramas_bot';

const urlParams = new URLSearchParams(window.location.search);
const PARAM_CEDULA = urlParams.get('cedula');
const PARAM_CRONO_ID = urlParams.get('cronogramaId');
const PARAM_TIPO = urlParams.get('tipo') ?? 'estudiante'; // 'estudiante' | 'docente'

if (!PARAM_CEDULA || !PARAM_CRONO_ID) {
    window.location.replace('cedula-solicitud.html');
}

const MODO_ESTUDIANTE = PARAM_TIPO !== 'docente';

const videos = [
    "../videos/Animación_Fondo.mp4"
];

const videoAleatorio = videos[Math.floor(Math.random() * videos.length)];
document.getElementById("videoIzq").src = videoAleatorio;
document.getElementById("videoDer").src = videoAleatorio;

let todosLosCronogramas = [];
let filtroActual = 'TODOS';

// ── Reloj ─────────────────────────────────────────────────────
function iniciarReloj() {
    const el = document.getElementById('reloj');
    if (!el) return;
    const tick = () => {
        el.textContent = new Date().toLocaleTimeString('es-EC', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    tick();
    setInterval(tick, 1000);
}

// ── Helpers ───────────────────────────────────────────────────
function formatearFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha + (fecha.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' });
}

function badgeEstado(estado) {
    const cfg = {
        VIGENTE: { label: 'Vigente', clase: 'vigente' },
        PROGRAMADO: { label: 'Programado', clase: 'programado' },
        FINALIZADO: { label: 'Finalizado', clase: 'finalizado' },
    };
    const { label, clase } = cfg[estado] ?? { label: estado, clase: '' };
    return `<span class="badge ${clase}">${label}</span>`;
}

function actividadFinalizada(fechaFin) {
    if (!fechaFin) return false;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return new Date(fechaFin + 'T23:59:59') < hoy;
}

// ── Helper: cronogramas asignados a un docente ────────────────
// Recorre TODA la lista de cronogramas y devuelve los que tienen
// al docente (por cédula) registrado en docentesVinculados.
function obtenerCronogramasDelDocente(lista, cedula) {
    return lista.filter(c => c.docentesVinculados?.[cedula]);
}

// ── Card ──────────────────────────────────────────────────────
function crearCard(c) {
    const estado = calcularEstado(c.fechaInicio, c.fechaFin);
    const total = c.actividades ? c.actividades.length : 0;

    const card = document.createElement('div');
    card.className = 'crono-card';
    card.dataset.id = c.id;

    card.innerHTML = `
        <div class="crono-card-top"
            style="background:${c.colorFondo ?? '#1565c0'};
                   color:${c.colorTexto ?? '#ffffff'};
                   border-color:${c.colorBorde ?? '#0d47a1'};
                   font-family:${c.fuente ?? 'DM Sans, sans-serif'}">
            <div class="crono-card-estado">${badgeEstado(estado)}</div>
            <h3 class="crono-card-nombre">${c.nombre ?? 'Sin nombre'}</h3>
            <p class="crono-card-periodo">${c.periodo ?? ''}</p>
        </div>
        <div class="crono-card-body">
            <div class="crono-meta">
                <div class="crono-meta-item">
                    <i class="ti ti-calendar-event"></i>
                    <span>${formatearFecha(c.fechaInicio)}</span>
                </div>
                <div class="crono-meta-sep">→</div>
                <div class="crono-meta-item">
                    <i class="ti ti-calendar-due"></i>
                    <span>${formatearFecha(c.fechaFin)}</span>
                </div>
            </div>
            <div class="crono-actividades-count">
                <i class="ti ti-list-check"></i>
                <span>${total} actividad${total !== 1 ? 'es' : ''}</span>
            </div>
            <button class="btn-ver-detalle" data-id="${c.id}">
                <i class="ti ti-eye"></i>
                Ver detalle
            </button>
        </div>
    `;

    card.querySelector('.btn-ver-detalle').addEventListener('click', () => abrirModal(c));
    return card;
}

// ── Filtrado ──────────────────────────────────────────────────
function filtrarLista(lista) {
    let resultado = lista;

    if (!MODO_ESTUDIANTE) {
        // Docente: mostrar todos los cronogramas donde esté vinculado
        resultado = obtenerCronogramasDelDocente(resultado, PARAM_CEDULA);

        if (filtroActual !== 'TODOS') {
            resultado = resultado.filter(c =>
                calcularEstado(c.fechaInicio, c.fechaFin) === filtroActual
            );
        }
    } else if (PARAM_CRONO_ID) {
        // Estudiante: solo su cronograma
        resultado = resultado.filter(c => c.id === PARAM_CRONO_ID);
    }

    return resultado;
}

// ── Panel estudiante ──────────────────────────────────────────
function siguienteActividad(actividades) {
    if (!actividades || actividades.length === 0) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return actividades.find(a => {
        if (!a.fechaFin) return false;
        return new Date(a.fechaFin + 'T23:59:59') >= hoy;
    }) ?? null;
}

function calcularPorcentaje(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return 0;
    const inicio = new Date(fechaInicio + 'T00:00:00').getTime();
    const fin = new Date(fechaFin + 'T23:59:59').getTime();
    const hoy = Date.now();
    if (hoy <= inicio) return 0;
    if (hoy >= fin) return 100;
    return Math.round(((hoy - inicio) / (fin - inicio)) * 100);
}

async function renderPanelEstudiante(cronogramaId) {
    const panel = document.getElementById('panelEstudiante');
    if (!panel) return;

    const lista = await obtenerCronogramas();
    const crono = lista.find(c => c.id === cronogramaId);
    if (!crono) return;

    const estudiante = crono.estudiantesVinculados?.[PARAM_CEDULA];
    const nombre = estudiante?.nombres ?? estudiante?.nombre ?? 'Estudiante';
    const carrera = estudiante?.carrera ?? '';

    const pct = calcularPorcentaje(crono.fechaInicio, crono.fechaFin);
    const proxAct = siguienteActividad(crono.actividades ?? []);
    const totalAct = crono.actividades?.length ?? 0;
    const hechas = (crono.actividades ?? []).filter(a => {
        if (!a.fechaFin) return false;
        return new Date(a.fechaFin + 'T23:59:59') < new Date();
    }).length;

    panel.innerHTML = `
        <div class="ep-perfil">
            <div class="ep-avatar"><i class="ti ti-user-circle"></i></div>
            <div class="ep-info">
                <h2 class="ep-nombre">${nombre}</h2>
                ${carrera ? `<span class="ep-carrera"><i class="ti ti-school"></i>${carrera}</span>` : ''}
            </div>
        </div>

        <div class="ep-progress-bloque">
            <div class="ep-progress-header">
                <span class="ep-progress-label">
                    <i class="ti ti-chart-line"></i>
                    Progreso
                </span>
                <span class="ep-progress-pct">${pct}%</span>
            </div>
            <div class="ep-barra-bg">
                <div class="ep-barra-fill" style="width:${pct}%"></div>
            </div>
            <div class="ep-progress-sub">
                <span>${hechas} de ${totalAct} completadas</span>
                <span>${totalAct - hechas} restante${totalAct - hechas !== 1 ? 's' : ''}</span>
            </div>
        </div>

        <div class="ep-notif-bloque">
            <button class="ep-btn-notif" id="btnNotificaciones">
                <i class="ti ti-bell"></i>
                <span>Activar notificaciones</span>
            </button>
        </div>

        ${proxAct ? `
        <div class="ep-proxima">
            <div class="ep-proxima-label">
                <i class="ti ti-calendar-due"></i>
                Siguiente actividad
            </div>
            <div class="ep-proxima-nombre">${proxAct.actividad}</div>
            <div class="ep-proxima-fecha">
                <i class="ti ti-clock"></i>
                ${formatearFecha(proxAct.fechaInicio)} → ${formatearFecha(proxAct.fechaFin)}
            </div>
        </div>
        ` : `
        <div class="ep-proxima ep-proxima--done">
            <i class="ti ti-circle-check"></i>
            <span>Todas las actividades completadas</span>
        </div>
        `}
    `;

    panel.classList.remove('oculto');

    const btnNotif = document.getElementById('btnNotificaciones');
    const yaActivo = estudiante?.notificacionesActivas && estudiante?.telegramChatId;

    if (btnNotif) {
        if (yaActivo) {
            btnNotif.classList.add('notif-activa');
            btnNotif.innerHTML = `<i class="ti ti-bell-check"></i><span>Notificaciones activas</span>`;
        }

        btnNotif.addEventListener('click', () => {
            if (yaActivo) return;
            const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);
            if (esCelular) {
                const link = `https://t.me/${BOT_USERNAME}?start=${PARAM_CEDULA}-${cronogramaId}`;
                window.open(link, '_blank', 'noopener,noreferrer');
                mostrarToast('📱 Presiona START en Telegram para activar notificaciones');
            } else {
                mostrarModalInstruccion(PARAM_CEDULA, cronogramaId);
                iniciarPolling(cronogramaId);
            }
        });
    }
}

// ── Panel docente ─────────────────────────────────────────────
// ── Panel docente ─────────────────────────────────────────────
// ── Panel docente ─────────────────────────────────────────────
async function renderPanelDocente(cronogramaId) {
    const panel = document.getElementById('panelEstudiante'); // reutilizamos el mismo contenedor
    if (!panel) return;

    const lista = await obtenerCronogramas();
    const crono = lista.find(c => c.id === cronogramaId);
    if (!crono) return;

    const docenteVinculado = crono.docentesVinculados?.[PARAM_CEDULA];
    const nombre = docenteVinculado?.nombres ?? docenteVinculado?.nombre ?? 'Docente';
    const especialidad = docenteVinculado?.especialidad ?? docenteVinculado?.carrera ?? '';

    // Datos globales del docente
    const docenteGlobal = await obtenerDocentePorCedula(PARAM_CEDULA);

    // Cronogramas asignados al docente
    const cronosDocente = obtenerCronogramasDelDocente(lista, PARAM_CEDULA);
    const totalCronos = cronosDocente.length;

    // Actividades de todos sus cronogramas
    const todasActividades = cronosDocente.flatMap(c =>
        (c.actividades ?? []).map(a => ({ ...a, cronogramaNombre: c.nombre ?? '' }))
    );
    const totalAct = todasActividades.length;

    // Próxima actividad POR CADA cronograma asignado (filtrando solo las que existen)
    const proximasPorCronograma = cronosDocente
        .map(c => ({
            cronogramaNombre: c.nombre ?? 'Sin nombre',
            actividad: siguienteActividad(c.actividades ?? [])
        }))
        .filter(p => p.actividad !== null); // Solo nos interesan las pendientes

    // Determinar qué renderizar en la sección de próximas actividades
    let htmlProximas = '';
    
    if (proximasPorCronograma.length === 0) {
        htmlProximas = `
            <div class="ep-proxima ep-proxima--done">
                <i class="ti ti-circle-check"></i>
                <span>Todas las actividades completadas</span>
            </div>
        `;
    } else if (proximasPorCronograma.length === 1) {
        // Si es solo una, se muestra directo para no forzar clicks innecesarios
        const p = proximasPorCronograma[0];
        htmlProximas = `
            <div class="ep-proxima">
                <div class="ep-proxima-label">
                    <i class="ti ti-calendar-due"></i>
                    Próxima actividad
                    <span class="ep-proxima-crono">${p.cronogramaNombre}</span>
                </div>
                <div class="ep-proxima-nombre">${p.actividad.actividad}</div>
                <div class="ep-proxima-fecha">
                    <i class="ti ti-clock"></i>
                    ${formatearFecha(p.actividad.fechaInicio)} → ${formatearFecha(p.actividad.fechaFin)}
                </div>
            </div>
        `;
    } else {
// SI HAY MÁS DE UNA, SE REEMPLAZA POR EL BOTÓN EN COINCIDENCIA CON TU SOLICITUD
htmlProximas = `
    <div class="ep-proxima ep-proxima--multiple" style="border: 1px dashed #b0cef0; background: rgba(21, 101, 192, 0.05); border-radius: 12px; padding: 16px;">
        <div class="ep-proxima-label" style="margin-bottom: 12px;">
            <i class="ti ti-calendar-event"></i>
            Múltiples actividades agendadas
        </div>
        ${
          proximasPorCronograma.length > 1
            ? `<button class="btn-ver-detalle" id="btnVerMultiplesActividades" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;">
                  <i class="ti ti-list-details"></i>
                  Ver ${proximasPorCronograma.length} actividades próximas
               </button>`
            : `
               <div style="display:flex; align-items:flex-start; gap:8px; font-size:12px;">
                   <i class="ti ti-point-filled" style="color:#00e5ff; margin-top:3px; flex-shrink:0;"></i>
                   <div>
                       <span style="color:#94b8d8;">${proximasPorCronograma[0].actividad.actividad}</span>
                       <span style="color:#546e8a; font-size:11px;"> — ${formatearFecha(proximasPorCronograma[0].actividad.fechaInicio)}</span>
                   </div>
               </div>`
        }
    </div>
`;

    }

    panel.innerHTML = `
    <div class="ep-perfil">
        <div class="ep-avatar ep-avatar--docente">
            <i class="ti ti-chalkboard"></i>
        </div>
        <div class="ep-info">
            <h2 class="ep-nombre">${nombre}</h2>
            <span class="ep-rol-badge">
                <i class="ti ti-id-badge-2"></i> Docente
            </span>
            ${especialidad ? `<span class="ep-carrera"><i class="ti ti-school"></i>${especialidad}</span>` : ''}
        </div>
    </div>

    <div class="ep-progress-bloque">
        <div class="ep-progress-header">
            <span class="ep-progress-label">
                <i class="ti ti-calendar-stats"></i>
                Cronogramas asignados
            </span>
            <span class="ep-progress-pct">${totalCronos}</span>
        </div>

        <div class="ep-barra-bg">
            <div class="ep-barra-fill" style="width:100%"></div>
        </div>

        <div class="ep-progress-sub">
            <span>${totalCronos} cronograma${totalCronos !== 1 ? 's' : ''}</span>
            <span>${totalAct} actividad${totalAct !== 1 ? 'es' : ''} en total</span>
        </div>
    </div>

    <div class="ep-notif-bloque">
        <button class="ep-btn-notif" id="btnNotificacionesDocente">
            <i class="ti ti-bell"></i>
            <span>Activar notificaciones</span>
        </button>
    </div>

    <div class="ep-proximas-lista">
        ${htmlProximas}
    </div>
    `;

    panel.classList.remove('oculto');

    // Listener para el nuevo botón de múltiples actividades
    const btnMultiples = document.getElementById('btnVerMultiplesActividades');
    if (btnMultiples) {
        btnMultiples.addEventListener('click', () => {
            abrirModalMultiplesDocente(proximasPorCronograma);
        });
    }

    // ── Lógica de Notificaciones del Docente ──
    const btnNotif = document.getElementById('btnNotificacionesDocente');
    const yaActivo = docenteGlobal?.notificacionesActivas && docenteGlobal?.telegramChatId;

    if (btnNotif) {
        if (yaActivo) {
            btnNotif.classList.add('notif-activa');
            btnNotif.innerHTML = `<i class="ti ti-bell-check"></i><span>Notificaciones activas</span>`;
        }

        btnNotif.addEventListener('click', () => {
            if (yaActivo) return;
            const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);
            if (esCelular) {
                const link = `https://t.me/${BOT_USERNAME}?start=DOC-${PARAM_CEDULA}-${cronogramaId}`;
                window.open(link, '_blank', 'noopener,noreferrer');
                mostrarToast('📱 Presiona START en Telegram para activar notificaciones');
            } else {
                mostrarModalInstruccionDocente(PARAM_CEDULA, cronogramaId);
                iniciarPollingDocente(cronogramaId);
            }
        });
    }
}

// ── Toast ─────────────────────────────────────────────────────
function mostrarToast(msg) {
    const existing = document.getElementById('toastNotif');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toastNotif';
    toast.className = 'toast-notif';
    toast.innerHTML = `<i class="ti ti-brand-telegram"></i><span>${msg}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('toast-visible'), 10);
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 400);
    }, 5000);
}

// ── Modal instrucciones PC ────────────────────────────────────
function mostrarModalInstruccion(cedula, cronogramaId) {
    const existing = document.getElementById('modalInstruccion');
    if (existing) existing.remove();

    const payload = `${cedula}-${cronogramaId}`;
    const linkNativo = `https://t.me/${BOT_USERNAME}?start=${payload}`;
    const linkTelegramWeb = `https://web.telegram.org/a/?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${BOT_USERNAME}%26start%3D${payload}`;

    const modal = document.createElement('div');
    modal.id = 'modalInstruccion';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(3,14,40,0.70);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;padding:16px;
        backdrop-filter:blur(4px);
    `;
    modal.innerHTML = `
        <div style="
            background:#fff;border:1px solid #b0cef0;
            border-radius:16px;padding:32px 28px;max-width:420px;width:100%;
            text-align:center;font-family:'DM Sans',sans-serif;
            box-shadow:0 20px 60px rgba(0,0,0,0.40);
        ">
            <div style="font-size:2.4rem;margin-bottom:12px">🔔</div>
            <h3 style="color:#0a3d7c;margin-bottom:8px;font-size:18px;font-weight:700">
                Activar notificaciones
            </h3>
            <p style="color:#64748b;font-size:13px;margin-bottom:24px">
                Elige cómo abrir Telegram:
            </p>

            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
                <a href="${linkNativo}" target="_blank" rel="noopener noreferrer"
                    style="display:flex;align-items:center;gap:12px;
                           background:#0a3d7c;color:#fff;
                           padding:13px 18px;border-radius:10px;
                           text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:1.3rem">💻</span>
                    <span>Tengo Telegram instalado</span>
                </a>
            </div>

            <div style="
                background:#f0f5fb;border-radius:10px;
                padding:12px 14px;text-align:left;
                font-size:12px;color:#64748b;
                border:1px solid #dde7f2;margin-bottom:20px;
            ">
                <b style="color:#0a3d7c">Si usas Telegram Web:</b><br>
                1. Inicia sesión con tu número<br>
                2. El bot se abrirá automáticamente<br>
                3. Presiona <b style="color:#0a3d7c">START</b>
            </div>

            <button id="btnCerrarInstruccion" style="
                padding:9px 24px;background:transparent;
                color:#64748b;border:1.5px solid #dde7f2;
                border-radius:8px;cursor:pointer;font-size:13px;
                font-family:'DM Sans',sans-serif;
            ">Cerrar</button>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('btnCerrarInstruccion').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function mostrarModalInstruccionDocente(cedula, cronogramaId) {

    const existing = document.getElementById('modalInstruccion');
    if (existing) existing.remove();

    // Payload correcto para docente
    const payload        = `DOC-${cedula}-${cronogramaId}`;
    const linkNativo     = `https://t.me/${BOT_USERNAME}?start=${payload}`;
    const linkTelegramWeb = `https://web.telegram.org/a/?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3D${BOT_USERNAME}%26start%3D${payload}`;

    const modal = document.createElement('div');
    modal.id = 'modalInstruccion';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(3,14,40,0.70);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;padding:16px;
        backdrop-filter:blur(4px);
    `;
    modal.innerHTML = `
        <div style="
            background:#fff;border:1px solid #b0cef0;
            border-radius:16px;padding:32px 28px;max-width:420px;width:100%;
            text-align:center;font-family:'DM Sans',sans-serif;
            box-shadow:0 20px 60px rgba(0,0,0,0.40);
        ">
            <div style="font-size:2.4rem;margin-bottom:12px">🔔</div>
            <h3 style="color:#0a3d7c;margin-bottom:8px;font-size:18px;font-weight:700">
                Activar notificaciones
            </h3>
            <p style="color:#64748b;font-size:13px;margin-bottom:24px">
                Elige cómo abrir Telegram:
            </p>

            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
                <a href="${linkNativo}" target="_blank" rel="noopener noreferrer"
                    style="display:flex;align-items:center;gap:12px;
                           background:#0a3d7c;color:#fff;
                           padding:13px 18px;border-radius:10px;
                           text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:1.3rem">💻</span>
                    <span>Tengo Telegram instalado</span>
                </a>

            </div>

            <div style="
                background:#f0f5fb;border-radius:10px;
                padding:12px 14px;text-align:left;
                font-size:12px;color:#64748b;
                border:1px solid #dde7f2;margin-bottom:20px;
            ">
                <b style="color:#0a3d7c">Si usas Telegram Web:</b><br>
                1. Inicia sesión con tu número<br>
                2. El bot se abrirá automáticamente<br>
                3. Presiona <b style="color:#0a3d7c">START</b>
            </div>

            <button id="btnCerrarInstruccion" style="
                padding:9px 24px;background:transparent;
                color:#64748b;border:1.5px solid #dde7f2;
                border-radius:8px;cursor:pointer;font-size:13px;
                font-family:'DM Sans',sans-serif;
            ">Cerrar</button>
        </div>
    `;

    document.body.appendChild(modal);
    document.getElementById('btnCerrarInstruccion')
        .addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

async function iniciarPollingDocente(cronogramaId) {

    if (pollingInterval) return;

    let intentos = 0;

    pollingInterval = setInterval(async () => {

        intentos++;

        await procesarRegistros();

        // ── ahora se consulta el nodo global docentes/{cedula} ──
        const docenteGlobal = await obtenerDocentePorCedula(PARAM_CEDULA);

        if (docenteGlobal?.telegramChatId) {

            clearInterval(pollingInterval);
            pollingInterval = null;

            const btn = document.getElementById('btnNotificacionesDocente');
            if (btn) {
                btn.classList.add('notif-activa');
                btn.innerHTML = `<i class="ti ti-bell-check"></i><span>Notificaciones activas</span>`;
            }

            mostrarToast('✅ ¡Notificaciones activadas correctamente!');
        }

        if (intentos >= 24) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

    }, 5000);
}
// ── Polling ───────────────────────────────────────────────────
let pollingInterval = null;
function iniciarPolling(cronogramaId) {
    if (pollingInterval) return;
    let intentos = 0;
    pollingInterval = setInterval(async () => {
        intentos++;
        await procesarRegistros();

        const lista = await obtenerCronogramas();
        const crono = lista.find(c => c.id === cronogramaId);
        const est = crono?.estudiantesVinculados?.[PARAM_CEDULA];

        if (est?.telegramChatId) {
            clearInterval(pollingInterval);
            pollingInterval = null;
            const btn = document.getElementById('btnNotificaciones');
            if (btn) {
                btn.classList.add('notif-activa');
                btn.innerHTML = `<i class="ti ti-bell-check"></i><span>Notificaciones activas</span>`;
            }
            mostrarToast('✅ ¡Notificaciones activadas correctamente!');
        }

        if (intentos >= 24) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }, 5000);
}

// ── Grid ──────────────────────────────────────────────────────
function renderGrid(lista) {
    const grid = document.getElementById('gridCronogramas');
    const vacia = document.getElementById('vistaVacia');
    const filtrados = filtrarLista(lista);

    grid.innerHTML = '';

    if (filtrados.length === 0) {
        vacia.classList.remove('oculto');
        actualizarContador(0, filtroActual);
        return;
    }

    vacia.classList.add('oculto');
    filtrados.forEach(c => grid.appendChild(crearCard(c)));
    actualizarContador(filtrados.length, filtroActual);
}

function actualizarContador(n, filtro) {
    const el = document.getElementById('contadorTexto');
    if (!el) return;
    const label = filtro === 'TODOS' ? 'cronograma' : filtro.toLowerCase();
    el.textContent = `${n} ${label}${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''}`;
}

// ── Modal detalle ─────────────────────────────────────────────
function abrirModal(c) {
    const estado = calcularEstado(c.fechaInicio, c.fechaFin);

    document.getElementById('modalHeader').style.background = c.colorFondo ?? '#1565c0';
    document.getElementById('modalHeader').style.color = c.colorTexto ?? '#ffffff';
    document.getElementById('modalHeader').style.borderColor = c.colorBorde ?? '#0d47a1';
    document.getElementById('modalHeader').style.fontFamily = c.fuente ?? 'DM Sans, sans-serif';

    document.getElementById('modalBadge').innerHTML = badgeEstado(estado);
    document.getElementById('modalNombre').textContent = c.nombre ?? '—';
    document.getElementById('modalPeriodo').textContent = c.periodo ?? '—';
    document.getElementById('modalFechaInicio').textContent = formatearFecha(c.fechaInicio);
    document.getElementById('modalFechaFin').textContent = formatearFecha(c.fechaFin);
    document.getElementById('modalFechaPublicacion').textContent = formatearFecha(c.fechaPublicacion);

    const actividades = c.actividades ?? [];
    const tabla = document.getElementById('modalTabla');

    if (actividades.length === 0) {
        tabla.innerHTML = '<p class="sin-actividades">Sin actividades registradas.</p>';
    } else {
        tabla.innerHTML = `
            <table class="modal-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Actividad</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                    </tr>
                </thead>
                <tbody>
                    ${actividades.map((a, i) => `
                        <tr class="${actividadFinalizada(a.fechaFin) ? 'actividad-finalizada' : ''}">
                            <td class="td-num">
                                ${actividadFinalizada(a.fechaFin)
                ? '<i class="ti ti-check"></i>'
                : i + 1}
                            </td>
                            <td>${a.actividad}</td>
                            <td class="td-fecha">${formatearFecha(a.fechaInicio)}</td>
                            <td class="td-fecha">${formatearFecha(a.fechaFin)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    document.getElementById('modalOverlay').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    document.getElementById('modalOverlay').classList.add('oculto');
    document.body.style.overflow = '';
}

// ── Filtros (solo modo docente/admin) ────────────────────────
function initFiltros() {
    if (MODO_ESTUDIANTE) {
        const filtrosEl = document.querySelector('.filtros');
        if (filtrosEl) filtrosEl.style.display = 'none';
        return;
    }

    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActual = btn.dataset.estado;
            renderGrid(todosLosCronogramas);
        });
    });
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    iniciarReloj();
    initFiltros();

    if (PARAM_CRONO_ID) {
        if (MODO_ESTUDIANTE) {
            renderPanelEstudiante(PARAM_CRONO_ID);
        } else {
            renderPanelDocente(PARAM_CRONO_ID);
        }
    }

    document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);

    document.getElementById('modalOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarModal();
    });

    escucharCronogramas(lista => {
        todosLosCronogramas = lista;
        renderGrid(lista);
    });
});

function abrirModalMultiplesDocente(proximasActividades) {
    document.getElementById('modalHeader').style.background = '#0a3d7c';
    document.getElementById('modalHeader').style.color = '#ffffff';
    document.getElementById('modalHeader').style.borderColor = '#030e28';

    document.getElementById('modalBadge').innerHTML = `<span class="badge vigente">Pendientes</span>`;
    document.getElementById('modalNombre').textContent = 'Próximas Actividades';
    document.getElementById('modalPeriodo').textContent = 'Resumen de todos tus cronogramas';
    document.getElementById('modalFechaInicio').textContent = '—';
    document.getElementById('modalFechaFin').textContent = '—';
    document.getElementById('modalFechaPublicacion').textContent = '—';

    const tabla = document.getElementById('modalTabla');

    tabla.innerHTML = `
        <table class="modal-table">
            <thead>
                <tr>
                    <th>Cronograma</th>
                    <th>Actividad Pendiente</th>
                    <th>Inicio</th>
                    <th>Fin</th>
                </tr>
            </thead>
            <tbody>
                ${proximasActividades.map((p, i) => {
                    const crono = todosLosCronogramas.find(c => c.nombre === p.cronogramaNombre);
                    const periodo = crono?.periodo ?? '';
                    const esHoy = p.actividad.fechaInicio === new Date().toISOString().split('T')[0];
                    return `
                    <tr style="${esHoy ? 'background: rgba(0,229,255,0.06);' : ''}">
                        <td>
                            <div style="font-weight:700; color:#1e88e5; line-height:1.3;">
                                ${p.cronogramaNombre}
                            </div>
                            ${periodo ? `<div style="font-size:11px; color:#546e8a; margin-top:2px;">${periodo}</div>` : ''}
                        </td>
                        <td>
                            <div style="display:flex; align-items:center; gap:6px;">
                                ${esHoy ? '<span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#00e5ff; flex-shrink:0;"></span>' : ''}
                                ${p.actividad.actividad}
                            </div>
                        </td>
                        <td class="td-fecha">${formatearFecha(p.actividad.fechaInicio)}</td>
                        <td class="td-fecha">${formatearFecha(p.actividad.fechaFin)}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    `;

    document.getElementById('modalOverlay').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
}