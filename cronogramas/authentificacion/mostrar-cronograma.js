// ── mostrar-cronograma.js ────────────────────────────────────
// ?cedula=XXXXXXXXXX&cronogramaId=abc123&tipo=estudiante|docente
// Sin parámetros → redirige a cedula-solicitud.html
// ─────────────────────────────────────────────────────────────

import { escucharCronogramas, calcularEstado, obtenerCronogramas, obtenerDocentePorCedula, actualizarActividad, guardarGrupoCarrera } from '../../Firebase/cronograma.js';
import { generarLinkActivacion, procesarRegistros, revisarYNotificar } from '../notificaciones/notificacon-web.js';
import { irAAreaDocente, obtenerLinkPorDepartamento } from '../Ruta/Acceso.js';

const BOT_USERNAME = 'itsometcronogramas_bot';
const BACKEND_URL = 'https://itsqmet-bot-backend.onrender.com';

const urlParams = new URLSearchParams(window.location.search);
const PARAM_CEDULA = urlParams.get('cedula');
const PARAM_CRONO_ID = urlParams.get('cronogramaId');
const PARAM_TIPO = urlParams.get('tipo') ?? 'estudiante';

if (!PARAM_CEDULA || !PARAM_CRONO_ID) {
    window.location.replace('cedula-solicitud.html');
}

const MODO_ESTUDIANTE = PARAM_TIPO !== 'docente';

const videos = ["../videos/Animación_Fondo.mp4"];
const videoAleatorio = videos[Math.floor(Math.random() * videos.length)];
document.getElementById("videoIzq").src = videoAleatorio;
document.getElementById("videoDer").src = videoAleatorio;

let todosLosCronogramas = [];
let docenteEsUnidadTitulacion = false;
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

// ── Normaliza el nombre de carrera a una clave válida para Firebase ──
function slugCarrera(carrera) {
    return (carrera || '')
        .toString()
        .trim()
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function esURLValida(str) {
    if (!str) return true; // vacío está permitido, el link es opcional
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function actividadFinalizada(fechaFin) {
    if (!fechaFin) return false;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return new Date(fechaFin + 'T23:59:59') < hoy;
}

function obtenerCronogramasDelDocente(lista, cedula) {
    return lista.filter(c => c.docentesVinculados?.[cedula]);
}

// ── Abrevia los nombres de meses dentro de un periodo ──────────
const MESES_ABREV = {
    enero: 'Ene', febrero: 'Feb', marzo: 'Mar', abril: 'Abr',
    mayo: 'May', junio: 'Jun', julio: 'Jul', agosto: 'Ago',
    septiembre: 'Sep', setiembre: 'Sep', octubre: 'Oct',
    noviembre: 'Nov', diciembre: 'Dic'
};

function abreviarPeriodo(periodo) {
    if (!periodo) return '';
    let resultado = periodo;
    Object.entries(MESES_ABREV).forEach(([completo, abrev]) => {
        resultado = resultado.replace(new RegExp(completo, 'gi'), abrev);
    });
    return resultado;
}

// ── Mapa manual de abreviaciones por carrera (editable) ─────────
// Clave = slugCarrera(nombreCarrera), Valor = abreviación corta
// Agrega aquí nuevas carreras con el mismo patrón cuando haga falta.
const MAPA_ABREVIATURAS = {
    'DISENO_MULTIMEDIA_ONLINE': 'Multimedia',
    'MECANICA_AUTOMOTRIZ': 'Mecanica',
    'MECANICA_DE_MOTOS': 'Motos',
    'PROCESAMIENTO_EN_ALIMENTOS': 'Alimentos',
    'SEGURIDAD_CIUDADANA_Y_ORDEN_PUBLICO_ONLINE': 'Seguridad',
    'SEGURIDAD_Y_PREVENCION_DE_RIESGOS_LABORALES': 'Riesgos',
    'UNIVERSITARIA_EN_ADMINISTRACION_DE_EMPRESAS': 'Administración',
    'UNIVERSITARIA_EN_ADMINISTRACION_DE_TALENTO_HUMANO': 'Talento',
    'UNIVERSITARIA_EN_CONTABILIDAD_Y_TRIBUTARIA': 'Contabilidad',
    'UNIVERSITARIA_EN_EDUCACION_INICIAL_ONLINE': 'Inicial',
    'UNIVERSITARIA_EN_MARKETING_DIGITAL_ONLINE': 'MKT',
    'UNIVERSITARIA_EN_PEDAGOGIA': 'Pedagogia',
    'UNIVERSITARIA_EN_REDES_Y_TELECOMUNICACIONES_ONLINE': 'Redes',
    'UNIVERSITARIA_EN_SOFTWARE_Y_CIBERSEGURIDAD': 'Software',
    'VENTAS_ONLINE': 'Ventas',
    'ESTETICA_INTEGRAL': 'Estetica',
    'GASTRONOMIA': 'Gastronomia',
};

// ── Fallback: si la carrera no está en el mapa, deriva algo razonable ──
const PALABRAS_FILTRO = new Set([
    'UNIVERSITARIA', 'EN', 'DE', 'DEL', 'LA', 'EL', 'Y', 'ONLINE'
]);

function abreviarNombreCarrera(carrera) {
    const key = slugCarrera(carrera);
    if (MAPA_ABREVIATURAS[key]) return MAPA_ABREVIATURAS[key];

    // Fallback automático: primera palabra significativa
    const palabras = (carrera || '').trim().split(/\s+/);
    const significativa = palabras.find(p => !PALABRAS_FILTRO.has(p.toUpperCase())) ?? palabras[0] ?? '';
    return significativa.charAt(0).toUpperCase() + significativa.slice(1).toLowerCase();
}

// ── Descargar Excel: Nombre de Carrera | Abreviación ─────────────
async function descargarExcelCarreras(c, carreras) {
    if (!carreras || carreras.length === 0) {
        mostrarToast('⚠️ No hay carreras para exportar');
        return;
    }
    try {
        const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
        const periodoAbrev = abreviarPeriodo(c.periodo);

        const filas = carreras.map(carrera => ({
            'Nombre de la Carrera': carrera,
            'Abreviación': `${abreviarNombreCarrera(carrera)}-${periodoAbrev}`
        }));

        const ws = XLSX.utils.json_to_sheet(filas);
        ws['!cols'] = [{ wch: 48 }, { wch: 30 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Carreras');

        const nombreArchivo = `Carreras_${(c.nombre ?? 'Cronograma').replace(/[^a-zA-Z0-9]+/g, '_')}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);
    } catch (err) {
        console.error('Error generando Excel:', err);
        mostrarToast('❌ No se pudo generar el Excel');
    }
}

// ── Despertar backend con overlay bloqueante ──────────────────
async function despertarBackend(accionAlDesperar) {
    // Inyectar keyframe solo una vez
    if (!document.getElementById('styleSpinBackend')) {
        const style = document.createElement('style');
        style.id = 'styleSpinBackend';
        style.textContent = `@keyframes spinBackend { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }

    const overlay = document.createElement('div');
    overlay.id = 'overlayDespertando';
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:99999;
        background:rgba(3,14,40,0.88);
        backdrop-filter:blur(6px);
        display:flex;flex-direction:column;
        align-items:center;justify-content:center;
        gap:20px;font-family:'DM Sans',sans-serif;
    `;

    const mostrarEspera = (texto = 'Iniciando servidor...') => {
        overlay.innerHTML = `
            <div style="
                width:56px;height:56px;border-radius:50%;
                border:3px solid rgba(0,229,255,0.2);
                border-top-color:#00e5ff;
                animation:spinBackend 0.9s linear infinite;
            "></div>
            <div style="text-align:center;">
                <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 6px;">
                    Conectando con el servidor
                </p>
                <p style="color:#7da5cc;font-size:13px;margin:0;">
                    ${texto}
                </p>
            </div>
        `;
    };

    mostrarEspera();
    document.body.appendChild(overlay);

    const MAX_INTENTOS = 5;
    const TIMEOUT_MS = 8000;

    for (let i = 1; i <= MAX_INTENTOS; i++) {
        mostrarEspera(i === 1 ? 'Esto puede tomar unos segundos...' : `Reintentando... (${i}/${MAX_INTENTOS})`);

        try {
            const res = await fetch(`${BACKEND_URL}/ping`, {
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });

            if (res.ok) {
                // ✅ Servidor despierto — mostrar confirmación y ejecutar acción automáticamente
                overlay.innerHTML = `
                    <div style="
                        width:56px;height:56px;border-radius:50%;
                        background:rgba(0,229,255,0.1);
                        border:2px solid #00e5ff;
                        display:flex;align-items:center;justify-content:center;
                        font-size:1.8rem;
                    ">✅</div>
                    <div style="text-align:center;">
                        <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 6px;">
                            Servidor listo
                        </p>
                        <p style="color:#7da5cc;font-size:13px;margin:0;">
                            Abriendo Telegram...
                        </p>
                    </div>
                `;
                await new Promise(r => setTimeout(r, 800));
                overlay.remove();
                // ✅ Ejecutar la acción (abrir Telegram) automáticamente
                accionAlDesperar();
                return true;
            }
        } catch (e) {
            console.warn(`Intento ${i} fallido:`, e);
        }

        if (i < MAX_INTENTOS) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    // ❌ Todos los intentos fallaron
    overlay.innerHTML = `
        <div style="
            background:#0d1f3c;border:1px solid #1e3a5f;
            border-radius:16px;padding:32px 28px;max-width:360px;width:100%;
            text-align:center;font-family:'DM Sans',sans-serif;
        ">
            <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
            <p style="color:#fff;font-size:16px;font-weight:600;margin:0 0 8px;">
                No se pudo conectar
            </p>
            <p style="color:#7da5cc;font-size:13px;margin:0 0 24px;">
                El servidor tardó demasiado en responder. Puedes reintentar o continuar de todas formas.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="btnReintentar" style="
                    padding:12px;border-radius:10px;border:none;cursor:pointer;
                    background:#00e5ff;color:#030e28;font-weight:700;
                    font-family:'DM Sans',sans-serif;font-size:14px;
                ">🔄 Reintentar</button>
                <button id="btnContinuarIgual" style="
                    padding:12px;border-radius:10px;cursor:pointer;
                    background:transparent;color:#7da5cc;
                    border:1.5px solid #1e3a5f;
                    font-family:'DM Sans',sans-serif;font-size:13px;
                ">Continuar de todas formas</button>
            </div>
        </div>
    `;

    return new Promise(resolve => {
        document.getElementById('btnReintentar').addEventListener('click', async () => {
            overlay.remove();
            const ok = await despertarBackend(accionAlDesperar);
            resolve(ok);
        });
        document.getElementById('btnContinuarIgual').addEventListener('click', () => {
            overlay.remove();
            // Continuar igualmente ejecuta la acción
            accionAlDesperar();
            resolve(false);
        });
    });
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
        resultado = obtenerCronogramasDelDocente(resultado, PARAM_CEDULA);
        if (filtroActual !== 'TODOS') {
            resultado = resultado.filter(c =>
                calcularEstado(c.fechaInicio, c.fechaFin) === filtroActual
            );
        }
    } else if (PARAM_CRONO_ID) {
        resultado = resultado.filter(c => c.id === PARAM_CRONO_ID);
    }

    return resultado;
}

// ── Helpers panel ─────────────────────────────────────────────
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

// ── Panel estudiante ──────────────────────────────────────────
async function renderPanelEstudiante(cronogramaId) {
    const panel = document.getElementById('panelEstudiante');
    if (!panel) return;

    const lista = await obtenerCronogramas();
    const crono = lista.find(c => c.id === cronogramaId);
    if (!crono) return;

    const estudiante = crono.estudiantesVinculados?.[PARAM_CEDULA];
    const nombre = estudiante?.nombres ?? estudiante?.nombre ?? 'Estudiante';
    const carrera = estudiante?.carrera ?? '';
const linkGrupoCarrera = carrera ? (crono.gruposCarrera?.[slugCarrera(carrera)]?.link || null) : null;

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
                    <i class="ti ti-chart-line"></i> Progreso
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
        ${linkGrupoCarrera ? `
<div class="ep-notif-bloque">
    <a href="${linkGrupoCarrera}" target="_blank" rel="noopener noreferrer"
        class="ep-btn-notif" style="text-decoration:none;">
        <i class="ti ti-brand-telegram"></i>
        <span>Grupo de Telegram de mi carrera</span>
    </a>
</div>` : ''}

        ${proxAct ? `
        <div class="ep-proxima">
            <div class="ep-proxima-label">
                <i class="ti ti-calendar-due"></i> Siguiente actividad
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

        // ✅ Con despertarBackend bloqueante
        btnNotif.addEventListener('click', async () => {
            if (yaActivo) return;
            const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);

            const accion = () => {
                if (esCelular) {
                    const link = `https://t.me/${BOT_USERNAME}?start=${PARAM_CEDULA}-${cronogramaId}`;
                    window.open(link, '_blank', 'noopener,noreferrer');
                    mostrarToast('📱 Presiona START en Telegram para activar notificaciones');
                } else {
                    mostrarModalInstruccion(PARAM_CEDULA, cronogramaId);
                    iniciarPolling(cronogramaId);
                }
            };

            await despertarBackend(accion);
        });
    }
}

// ── Panel docente ─────────────────────────────────────────────
async function renderPanelDocente(cronogramaId) {
    const panel = document.getElementById('panelEstudiante');
    if (!panel) return;

    const lista = await obtenerCronogramas();
    const crono = lista.find(c => c.id === cronogramaId);
    if (!crono) return;

    const docenteVinculado = crono.docentesVinculados?.[PARAM_CEDULA];
    const nombre = docenteVinculado?.nombres ?? docenteVinculado?.nombre ?? 'Docente';
    const especialidad = docenteVinculado?.especialidad ?? docenteVinculado?.carrera ?? '';

    const docenteGlobal = await obtenerDocentePorCedula(PARAM_CEDULA);
    const esUnidadTitulacion = (docenteGlobal?.departamento ?? '').trim() === 'Unidad de Titulación';
    docenteEsUnidadTitulacion = esUnidadTitulacion;
    const cronosDocente = obtenerCronogramasDelDocente(lista, PARAM_CEDULA);
    const totalCronos = cronosDocente.length;

    const todasActividades = cronosDocente.flatMap(c =>
        (c.actividades ?? []).map(a => ({ ...a, cronogramaNombre: c.nombre ?? '' }))
    );
    const totalAct = todasActividades.length;

    const proximasPorCronograma = cronosDocente
        .map(c => ({
            cronogramaNombre: c.nombre ?? 'Sin nombre',
            periodo: c.periodo ?? '',
            actividad: siguienteActividad(c.actividades ?? [])
        }))
        .filter(p => p.actividad !== null);

    // ── HTML sección próximas ──────────────────────────────────
    let htmlProximas = '';

    if (proximasPorCronograma.length === 0) {
        htmlProximas = `
            <div class="ep-proxima ep-proxima--done">
                <i class="ti ti-circle-check"></i>
                <span>Todas las actividades completadas</span>
            </div>
        `;
    } else if (proximasPorCronograma.length === 1) {
        const p = proximasPorCronograma[0];
        htmlProximas = `
            <div class="ep-proxima">
                <div class="ep-proxima-label">
                    <i class="ti ti-calendar-due"></i>
                    Próxima actividad
                    <span class="ep-proxima-crono">${p.cronogramaNombre}${p.periodo ? ' · ' + p.periodo : ''}</span>
                </div>
                <div class="ep-proxima-nombre">${p.actividad.actividad}</div>
                <div class="ep-proxima-fecha">
                    <i class="ti ti-clock"></i>
                    ${formatearFecha(p.actividad.fechaInicio)} → ${formatearFecha(p.actividad.fechaFin)}
                </div>
            </div>
        `;
    } else {
        htmlProximas = `
            <button class="btn-ver-detalle" id="btnVerMultiplesActividades"
                style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;">
                <i class="ti ti-list-details"></i>
                Ver ${proximasPorCronograma.length} actividades próximas
            </button>
        `;
    }

    panel.innerHTML = `
    <div class="ep-perfil">
        <div class="ep-avatar ep-avatar--docente">
            <i class="ti ti-chalkboard"></i>
        </div>
        <div class="ep-info">
            <h2 class="ep-nombre">${nombre}</h2>
            <span class="ep-rol-badge"><i class="ti ti-id-badge-2"></i> Docente</span>
            ${especialidad ? `<span class="ep-carrera"><i class="ti ti-school"></i>${especialidad}</span>` : ''}
        </div>
    </div>

    <div class="ep-progress-bloque">
        <div class="ep-progress-header">
            <span class="ep-progress-label">
                <i class="ti ti-calendar-stats"></i> Cronogramas asignados
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

    <div class="ep-notif-bloque">
        <button class="ep-btn-notif" id="btnIrAreaDocente">
            <i class="ti ti-external-link"></i>
            <span>Ir a mi área${docenteGlobal?.departamento ? ` — ${docenteGlobal.departamento}` : ''}</span>
        </button>
    </div>

    <div class="ep-proximas-lista">
        ${htmlProximas}
    </div>
    `;

    panel.classList.remove('oculto');

    const btnMultiples = document.getElementById('btnVerMultiplesActividades');
    if (btnMultiples) {
        btnMultiples.addEventListener('click', () => {
            abrirModalMultiplesDocente(proximasPorCronograma);
        });
    }

    const btnNotif = document.getElementById('btnNotificacionesDocente');
    const yaActivo = docenteGlobal?.notificacionesActivas && docenteGlobal?.telegramChatId;

    if (btnNotif) {
        if (yaActivo) {
            btnNotif.classList.add('notif-activa');
            btnNotif.innerHTML = `<i class="ti ti-bell-check"></i><span>Notificaciones activas</span>`;
        }

        // ✅ Con despertarBackend bloqueante
        btnNotif.addEventListener('click', async () => {
            if (yaActivo) return;
            const esCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);

            const accion = () => {
                if (esCelular) {
                    const link = `https://t.me/${BOT_USERNAME}?start=DOC-${PARAM_CEDULA}-${cronogramaId}`;
                    window.open(link, '_blank', 'noopener,noreferrer');
                    mostrarToast('📱 Presiona START en Telegram para activar notificaciones');
                } else {
                    mostrarModalInstruccionDocente(PARAM_CEDULA, cronogramaId);
                    iniciarPollingDocente(cronogramaId);
                }
            };

            await despertarBackend(accion);
        });
    }

    const btnArea = document.getElementById('btnIrAreaDocente');
    if (btnArea) {
        const tieneLink = obtenerLinkPorDepartamento(docenteGlobal?.departamento);
        if (!tieneLink) btnArea.classList.add('notif-activa');

        btnArea.addEventListener('click', () => {
            irAAreaDocente(docenteGlobal?.departamento);
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

// ── Modal instrucciones estudiante ────────────────────────────
function mostrarModalInstruccion(cedula, cronogramaId) {
    const existing = document.getElementById('modalInstruccion');
    if (existing) existing.remove();

    const payload = `${cedula}-${cronogramaId}`;
    const linkNativo = `https://t.me/${BOT_USERNAME}?start=${payload}`;

    const modal = document.createElement('div');
    modal.id = 'modalInstruccion';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(3,14,40,0.70);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;padding:16px;backdrop-filter:blur(4px);
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
                Abre Telegram y presiona START para activar:
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
                <a href="${linkNativo}" target="_blank" rel="noopener noreferrer"
                    style="display:flex;align-items:center;gap:12px;
                           background:#0a3d7c;color:#fff;
                           padding:13px 18px;border-radius:10px;
                           text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:1.3rem">💻</span>
                    <span>Abrir Telegram</span>
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

// ── Modal instrucciones docente ───────────────────────────────
function mostrarModalInstruccionDocente(cedula, cronogramaId) {
    const existing = document.getElementById('modalInstruccion');
    if (existing) existing.remove();

    const payload = `DOC-${cedula}-${cronogramaId}`;
    const linkNativo = `https://t.me/${BOT_USERNAME}?start=${payload}`;

    const modal = document.createElement('div');
    modal.id = 'modalInstruccion';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(3,14,40,0.70);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;padding:16px;backdrop-filter:blur(4px);
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
                Abre Telegram y presiona START para activar:
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px">
                <a href="${linkNativo}" target="_blank" rel="noopener noreferrer"
                    style="display:flex;align-items:center;gap:12px;
                           background:#0a3d7c;color:#fff;
                           padding:13px 18px;border-radius:10px;
                           text-decoration:none;font-weight:600;font-size:14px">
                    <span style="font-size:1.3rem">💻</span>
                    <span>Abrir Telegram</span>
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

// ── Modal: Grupos de Telegram por carrera (de esta cohorte) ────
function abrirModalGruposCarrera(c) {
    const existing = document.getElementById('modalGruposCarrera');
    if (existing) existing.remove();

    const estudiantes = c.estudiantesVinculados ?? {};
    const carrerasSet = new Set();
    Object.values(estudiantes).forEach(est => {
        const carrera = (est.carrera ?? '').trim();
        if (carrera) carrerasSet.add(carrera);
    });
    const carreras = Array.from(carrerasSet).sort((a, b) => a.localeCompare(b, 'es'));

    const modal = document.createElement('div');
    modal.id = 'modalGruposCarrera';
    modal.style.cssText = `
        position:fixed;inset:0;background:rgba(3,14,40,0.70);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;padding:16px;backdrop-filter:blur(4px);
    `;

    const filas = carreras.length === 0
        ? `<p style="color:#64748b;font-size:13px;text-align:center;padding:20px 0;">
               No hay estudiantes vinculados con carrera registrada en este cronograma.
           </p>`
        : carreras.map(carrera => {
            const key = slugCarrera(carrera);
            const linkGuardado = c.gruposCarrera?.[key]?.link ?? '';
            return `
                <div class="fila-carrera" data-key="${key}"
                    data-carrera="${carrera.replace(/"/g, '&quot;')}"
                    style="display:flex;flex-direction:column;gap:6px;padding:10px 0;border-bottom:1px solid #eef3f9;">
                    <span style="font-size:12.5px;font-weight:700;color:#0a3d7c;">
                        <i class="ti ti-school"></i> ${carrera}
                    </span>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="url" class="input-link-carrera" placeholder="https://t.me/..."
                            value="${linkGuardado}"
                            style="flex:1;padding:8px 10px;border-radius:8px;border:1.5px solid #dde7f2;
                                   font-size:12.5px;font-family:'DM Sans',sans-serif;color:#0a3d7c;">
                        <button class="btn-guardar-carrera"
                            style="flex-shrink:0;padding:8px 11px;border-radius:8px;border:none;
                                   background:#0a3d7c;color:#fff;cursor:pointer;">
                            <i class="ti ti-device-floppy"></i>
                        </button>
                        <span class="estado-guardado" style="font-size:11px;color:#22c55e;opacity:0;transition:opacity 0.3s;">
                            <i class="ti ti-check"></i>
                        </span>
                    </div>
                </div>
            `;
        }).join('');

    modal.innerHTML = `
        <div style="
            background:#fff;border:1px solid #b0cef0;
            border-radius:16px;padding:28px 26px;max-width:460px;width:100%;
            max-height:85vh;overflow-y:auto;
            font-family:'DM Sans',sans-serif;
            box-shadow:0 20px 60px rgba(0,0,0,0.40);
        ">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
                <span style="font-size:1.6rem;">🎓</span>
                <h3 style="color:#0a3d7c;font-size:17px;font-weight:700;margin:0;">
                    Grupos de Telegram por carrera
                </h3>
            </div>
            <p style="color:#94a8c2;font-size:12px;margin-bottom:16px;">
                ${c.nombre ?? 'Sin nombre'}${c.periodo ? ' · ' + c.periodo : ''}
            </p>
            <button id="btnDescargarExcelCarreras" style="
                width:100%;margin-bottom:16px;padding:10px;
                border-radius:8px;border:1.5px solid rgba(34,197,94,0.35);
                background:rgba(34,197,94,0.10);color:#16a34a;
                font-weight:600;font-size:13px;cursor:pointer;
                display:flex;align-items:center;justify-content:center;gap:8px;
                font-family:'DM Sans',sans-serif;
            ">
                <i class="ti ti-file-spreadsheet"></i>
                Descargar Excel
            </button>
            <div id="listaCarrerasGrupos">${filas}</div>
            <button id="btnCerrarGruposCarrera" style="
                margin-top:12px;width:100%;padding:11px;background:transparent;
                color:#64748b;border:1.5px solid #dde7f2;
                border-radius:8px;cursor:pointer;font-size:13px;
                font-family:'DM Sans',sans-serif;
            ">Cerrar</button>
        </div>
    `;

    document.body.appendChild(modal);

    const btnExcel = document.getElementById('btnDescargarExcelCarreras');
    if (btnExcel) {
        btnExcel.addEventListener('click', () => descargarExcelCarreras(c, carreras));
    }

    modal.querySelectorAll('.fila-carrera').forEach(fila => {
        const key           = fila.dataset.key;
        const carreraNombre = fila.dataset.carrera;
        const input         = fila.querySelector('.input-link-carrera');
        const btnGuardar    = fila.querySelector('.btn-guardar-carrera');
        const estadoOk      = fila.querySelector('.estado-guardado');

        btnGuardar.addEventListener('click', async () => {
            const link = input.value.trim();
            if (link && !esURLValida(link)) {
                mostrarToast('⚠️ El link no es una URL válida (debe empezar con http:// o https://)');
                input.focus();
                return;
            }
            btnGuardar.disabled = true;
            try {
                await guardarGrupoCarrera(c.id, key, carreraNombre, link);
                c.gruposCarrera = c.gruposCarrera ?? {};
                c.gruposCarrera[key] = { nombre: carreraNombre, link: link || null };

                estadoOk.style.opacity = '1';
                setTimeout(() => { estadoOk.style.opacity = '0'; }, 1800);
                mostrarToast(`✅ Link guardado para ${carreraNombre}`);
            } catch (err) {
                console.error('Error guardando grupo de carrera:', err);
                mostrarToast('❌ No se pudo guardar el link. Intenta nuevamente.');
            } finally {
                btnGuardar.disabled = false;
            }
        });
    });

    document.getElementById('btnCerrarGruposCarrera').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ── Polling docente ───────────────────────────────────────────
async function iniciarPollingDocente(cronogramaId) {
    if (pollingInterval) return;
    let intentos = 0;

    pollingInterval = setInterval(async () => {
        intentos++;
        await procesarRegistros();

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

// ── Polling estudiante ────────────────────────────────────────
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

// ── Muestra/oculta el botón de grupos por carrera dentro del modal ──
function actualizarBotonGruposCarrera(c) {
    const existente = document.getElementById('btnGruposCarreraModal');
    if (existente) existente.remove();

    if (MODO_ESTUDIANTE || !docenteEsUnidadTitulacion) return;

    const contenedor = document.querySelector('.modal-actividades');
    if (!contenedor) return;

    const btn = document.createElement('button');
    btn.id = 'btnGruposCarreraModal';
    btn.className = 'btn-ver-detalle';
    btn.style.cssText = 'margin-bottom:18px;';
    btn.innerHTML = `<i class="ti ti-brand-telegram"></i> Grupos de Telegram por carrera`;
    btn.addEventListener('click', () => abrirModalGruposCarrera(c));

    contenedor.insertBefore(btn, contenedor.firstChild);
}

// ── Modal detalle cronograma ──────────────────────────────────
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
                        <th>Hora</th>
                        <th>Clase</th>
                        ${MODO_ESTUDIANTE ? '' : '<th></th>'}
                    </tr>
                </thead>
                <tbody>
                    ${actividades.map((a, i) => filaActividad(a, i)).join('')}
                </tbody>
            </table>
        `;

        if (!MODO_ESTUDIANTE) {
            tabla.querySelectorAll('.btn-editar-act').forEach(btn => {
                btn.addEventListener('click', () => alternarEdicionActividad(btn.dataset.idx));
            });
            tabla.querySelectorAll('.btn-cancelar-act').forEach(btn => {
                btn.addEventListener('click', () => alternarEdicionActividad(btn.dataset.idx, true));
            });
            tabla.querySelectorAll('.btn-guardar-act').forEach(btn => {
                btn.addEventListener('click', () => guardarActividad(c, Number(btn.dataset.idx)));
            });
        }
    }

    // ── Fila de actividad (con hora + link de clase) ───────────────
    function filaActividad(a, i) {
        const finalizada = actividadFinalizada(a.fechaFin);
        return `
        <tr class="${finalizada ? 'actividad-finalizada' : ''}">
            <td class="td-num">
                ${finalizada ? '<i class="ti ti-check"></i>' : i + 1}
            </td>
            <td>${a.actividad}</td>
            <td class="td-fecha">${formatearFecha(a.fechaInicio)}</td>
            <td class="td-fecha">${formatearFecha(a.fechaFin)}</td>
            <td class="td-hora">
                <span class="act-view act-view-hora" data-idx="${i}">${a.horaInicio ?? '—'}</span>
                <input type="time" class="act-edit act-edit-hora oculto" data-idx="${i}"
                    value="${a.horaInicio ?? ''}" data-original="${a.horaInicio ?? ''}">
            </td>
            <td class="td-link">
                <span class="act-view act-view-link" data-idx="${i}">
                    ${a.linkClase
                ? `<a href="${a.linkClase}" target="_blank" rel="noopener noreferrer" class="link-clase"><i class="ti ti-video"></i> Unirse</a>`
                : '—'}
                </span>
                <input type="url" class="act-edit act-edit-link oculto" data-idx="${i}"
                    placeholder="https://meet.google.com/..." value="${a.linkClase ?? ''}" data-original="${a.linkClase ?? ''}">
            </td>
            ${MODO_ESTUDIANTE ? '' : `
            <td class="td-acciones">
                <button class="btn-icon-act btn-editar-act" data-idx="${i}" title="Editar"><i class="ti ti-pencil"></i></button>
                <button class="btn-icon-act btn-guardar-act oculto" data-idx="${i}" title="Guardar"><i class="ti ti-check"></i></button>
                <button class="btn-icon-act btn-cancelar-act oculto" data-idx="${i}" title="Cancelar"><i class="ti ti-x"></i></button>
            </td>`}
        </tr>
    `;
    }

    // ── Alternar entre vista y edición de una fila ──────────────────
    function alternarEdicionActividad(idx, cancelar = false) {
        const vHora = document.querySelector(`.act-view-hora[data-idx="${idx}"]`);
        const eHora = document.querySelector(`.act-edit-hora[data-idx="${idx}"]`);
        const vLink = document.querySelector(`.act-view-link[data-idx="${idx}"]`);
        const eLink = document.querySelector(`.act-edit-link[data-idx="${idx}"]`);
        const bEdit = document.querySelector(`.btn-editar-act[data-idx="${idx}"]`);
        const bGuardar = document.querySelector(`.btn-guardar-act[data-idx="${idx}"]`);
        const bCancelar = document.querySelector(`.btn-cancelar-act[data-idx="${idx}"]`);

        if (cancelar) {
            eHora.value = eHora.dataset.original ?? '';
            eLink.value = eLink.dataset.original ?? '';
        }

        [vHora, vLink, bEdit].forEach(el => el.classList.toggle('oculto'));
        [eHora, eLink, bGuardar, bCancelar].forEach(el => el.classList.toggle('oculto'));
    }

    // ── Guardar hora + link de clase en Firebase ────────────────────
    async function guardarActividad(c, idx) {
        const horaInput = document.querySelector(`.act-edit-hora[data-idx="${idx}"]`);
        const linkInput = document.querySelector(`.act-edit-link[data-idx="${idx}"]`);
        const btnGuardar = document.querySelector(`.btn-guardar-act[data-idx="${idx}"]`);

        const horaInicio = horaInput.value.trim();
        const linkClase = linkInput.value.trim();

        if (linkClase && !esURLValida(linkClase)) {
            mostrarToast('⚠️ El link de clase no es una URL válida (debe empezar con http:// o https://)');
            linkInput.focus();
            return;
        }

        btnGuardar.disabled = true;
        try {
            await actualizarActividad(c.id, idx, { horaInicio, linkClase });

            // Reflejar el cambio en memoria y en la fila sin recargar
            c.actividades[idx].horaInicio = horaInicio || null;
            c.actividades[idx].linkClase = linkClase || null;

            document.querySelector(`.act-view-hora[data-idx="${idx}"]`).textContent = horaInicio || '—';
            document.querySelector(`.act-view-link[data-idx="${idx}"]`).innerHTML = linkClase
                ? `<a href="${linkClase}" target="_blank" rel="noopener noreferrer" class="link-clase"><i class="ti ti-video"></i> Unirse</a>`
                : '—';

            horaInput.dataset.original = horaInicio;
            linkInput.dataset.original = linkClase;

            alternarEdicionActividad(idx);
            mostrarToast('✅ Actividad actualizada correctamente');
        } catch (err) {
            console.error('Error guardando actividad:', err);
            mostrarToast('❌ No se pudo guardar. Intenta nuevamente.');
        } finally {
            btnGuardar.disabled = false;
        }
    }

    actualizarBotonGruposCarrera(c);
    document.getElementById('modalOverlay').classList.remove('oculto');
    document.body.style.overflow = 'hidden';
}

function cerrarModal() {
    document.getElementById('modalOverlay').classList.add('oculto');
    document.body.style.overflow = '';
}

// ── Filtros (solo docente) ────────────────────────────────────
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

// ── Modal múltiples actividades docente ───────────────────────
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

    const hoyStr = new Date().toISOString().split('T')[0];
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
                ${proximasActividades.map(p => {
        const esHoy = p.actividad.fechaInicio === hoyStr;
        return `
                    <tr style="${esHoy ? 'background:rgba(0,229,255,0.06);' : ''}">
                        <td>
                            <div style="font-weight:700;color:#1e88e5;line-height:1.3;">
                                ${p.cronogramaNombre}
                            </div>
                            ${p.periodo ? `<div style="font-size:11px;color:#546e8a;margin-top:2px;">${p.periodo}</div>` : ''}
                        </td>
                        <td>
                            <div style="display:flex;align-items:center;gap:6px;">
                                ${esHoy ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#00e5ff;flex-shrink:0;"></span>' : ''}
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