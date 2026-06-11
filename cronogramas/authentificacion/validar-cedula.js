// ── validar-cedula.js ──────────────────────────────────────
// Usa Realtime Database. Busca la cédula dentro del nodo
// estudiantesVinculados de cada cronograma.
// ─────────────────────────────────────────────────────────

import { obtenerCronogramas } from '../../Firebase/cronograma.js';

// ── Reactor canvas ─────────────────────────────────────────
function initReactor() {
    // ── Video de fondo ──
    const video = document.getElementById('videoBg');
    if (video) {
        video.src = '../videos/Animación_Fondo.mp4';
    }

    // ── Partículas ──
    const canvas = document.getElementById('particulasBg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let W, H, particulas = [];

    const CONFIG = {
        cantidad:    120,
        velocidad:   0.4,
        tamañoMin:   1,
        tamañoMax:   3,
        opacidadMax: 0.7,
        colorBase:   '0, 229, 255',
        conexiones:  true,
        distConex:   120,
    };

    function resize() {
        W = canvas.width  = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
    }

    function crearParticula() {
        return {
            x:   Math.random() * W,
            y:   Math.random() * H,
            vx:  (Math.random() - 0.5) * CONFIG.velocidad,
            vy:  (Math.random() - 0.5) * CONFIG.velocidad,
            r:   CONFIG.tamañoMin + Math.random() * (CONFIG.tamañoMax - CONFIG.tamañoMin),
            op:  Math.random() * CONFIG.opacidadMax,
            dop: (Math.random() * 0.005 + 0.002) * (Math.random() < 0.5 ? 1 : -1),
        };
    }

    function init() {
        resize();
        particulas = Array.from({ length: CONFIG.cantidad }, crearParticula);
    }

    function dibujar() {
        ctx.clearRect(0, 0, W, H);

        particulas.forEach((p, i) => {
            p.x  += p.vx;
            p.y  += p.vy;
            p.op += p.dop;

            if (p.x < 0 || p.x > W) p.vx *= -1;
            if (p.y < 0 || p.y > H) p.vy *= -1;
            if (p.op <= 0.05 || p.op >= CONFIG.opacidadMax) p.dop *= -1;
            p.op = Math.max(0.05, Math.min(CONFIG.opacidadMax, p.op));

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${CONFIG.colorBase}, ${p.op})`;
            ctx.fill();

            if (!CONFIG.conexiones) return;
            for (let j = i + 1; j < particulas.length; j++) {
                const q    = particulas[j];
                const dist = Math.hypot(p.x - q.x, p.y - q.y);
                if (dist < CONFIG.distConex) {
                    const alpha = (1 - dist / CONFIG.distConex) * 0.25;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = `rgba(${CONFIG.colorBase}, ${alpha})`;
                    ctx.lineWidth   = 0.5;
                    ctx.stroke();
                }
            }
        });

        requestAnimationFrame(dibujar);
    }

    window.addEventListener('resize', () => { resize(); init(); });
    init();
    dibujar();
}

// ── Validación cédula ecuatoriana ──────────────────────────
function validarCedulaEcuatoriana(cedula) {
    if (!/^\d{10}$/.test(cedula)) return false;
    const provincia = parseInt(cedula.substring(0, 2));
    if (provincia < 1 || provincia > 24) return false;
    const digitos = cedula.split('').map(Number);
    const verificador = digitos[9];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
        let val = digitos[i];
        if (i % 2 === 0) { val *= 2; if (val > 9) val -= 9; }
        suma += val;
    }
    const residuo = suma % 10;
    return (residuo === 0 ? 0 : 10 - residuo) === verificador;
}

// ── UI helpers ─────────────────────────────────────────────
function mostrarError(msg) {
    const el    = document.getElementById('errorMsg');
    const txt   = document.getElementById('errorTexto');
    const grupo = document.getElementById('inputGrupo');
    txt.textContent = msg;
    el.classList.remove('oculto');
    grupo.classList.add('error-activo');
}

function ocultarError() {
    document.getElementById('errorMsg').classList.add('oculto');
    document.getElementById('inputGrupo').classList.remove('error-activo');
}

function setLoading(on) {
    document.querySelector('.btn-texto').classList.toggle('oculto', on);
    document.querySelector('.btn-loading').classList.toggle('oculto', !on);
    document.getElementById('btnConsultar').disabled = on;
}

// ── Búsqueda en Realtime Database ──────────────────────────
// Devuelve { cronogramaId, nombre } o null si no encuentra.
// ── Búsqueda en Realtime Database ──────────────────────────
// Busca en estudiantesVinculados Y docentesVinculados
async function buscarCronograma(cedula) {
    const cronogramas = await obtenerCronogramas();

    // ── Buscar en estudiantes ──────────────────────────────
    const cronoEstudiante = cronogramas.find(c =>
        c.estudiantesVinculados && c.estudiantesVinculados[cedula]
    );

    if (cronoEstudiante) {
        const est = cronoEstudiante.estudiantesVinculados[cedula];
        return {
            cronogramaId: cronoEstudiante.id,
            nombre:       est?.nombres ?? est?.nombre ?? 'Estimado/a estudiante',
            tipo:         'estudiante'
        };
    }

    // ── Buscar en docentes ─────────────────────────────────
    // El docente puede estar en varios cronogramas — buscamos el primero que lo tenga
    const cronoDocente = cronogramas.find(c =>
        c.docentesVinculados && c.docentesVinculados[cedula]
    );

    if (cronoDocente) {
        const doc = cronoDocente.docentesVinculados[cedula];
        // Los cronogramas asignados al docente están en cronogramasAsignados[]
        const cronogramasAsignados = doc?.cronogramasAsignados ?? [cronoDocente.id];
        return {
            // Para docente mandamos el primer cronogramaId asignado
            // (en cronograma.html luego se cargarán todos)
            cronogramaId:         cronogramasAsignados[0],
            cronogramasAsignados: cronogramasAsignados,
            nombre: doc?.nombres ?? doc?.nombre ?? 'Docente',
            tipo:                 'docente'
        };
    }

    return null;
}

// ── Pantalla de bienvenida ─────────────────────────────────
function mostrarBienvenida(nombre, destino) {
    const overlay = document.createElement('div');
    overlay.className = 'bienvenida-overlay';
    overlay.innerHTML = `
        <div class="bienvenida-card">
            <i class="ti ti-user-check bienvenida-icono"></i>
            <p class="bienvenida-saludo">Bienvenido/a</p>
            <h2 class="bienvenida-nombre">${nombre}</h2>
            <p class="bienvenida-sub">Cargando tu cronograma...</p>
            <div class="bienvenida-barra"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Redirige cuando termina la barra (~3.2s total)
    setTimeout(() => {
        window.location.href = destino;
    }, 3200);
}

// ── Flujo principal ────────────────────────────────────────
// ── Flujo principal ────────────────────────────────────────
async function consultar() {
    const cedula = document.getElementById('inputCedula').value.trim();
    ocultarError();

    if (!validarCedulaEcuatoriana(cedula)) {
        mostrarError('La cédula ingresada no es válida. Verifica el número.');
        return;
    }

    setLoading(true);
    try {
        const resultado = await buscarCronograma(cedula);
        if (!resultado) {
            mostrarError('No se encontró un cronograma asignado para esta cédula.');
            return;
        }

        const params = new URLSearchParams({ cedula, cronogramaId: resultado.cronogramaId });

        // Si es docente, pasamos todos sus cronogramas asignados
        if (resultado.tipo === 'docente') {
            params.set('tipo', 'docente');
            params.set('cronogramas', resultado.cronogramasAsignados.join(','));
        }

        mostrarBienvenida(resultado.nombre, `cronograma.html?${params.toString()}`);

    } catch (err) {
        console.error('Error buscando cronograma:', err);
        mostrarError('Ocurrió un error al consultar. Intenta nuevamente.');
    } finally {
        setLoading(false);
    }
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initReactor();

    const input    = document.getElementById('inputCedula');
    const contador = document.getElementById('contador');
    const btn      = document.getElementById('btnConsultar');

    input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 10);
        const n = input.value.length;
        contador.textContent = `${n}/10`;
        contador.classList.toggle('completo', n === 10);
        btn.disabled = n !== 10;
        if (n < 10) ocultarError();
    });

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !btn.disabled) consultar();
    });

    btn.addEventListener('click', consultar);
});