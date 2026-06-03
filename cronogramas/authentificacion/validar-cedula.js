// ── validar-cedula.js ──────────────────────────────────────
// Usa Realtime Database. Busca la cédula dentro del nodo
// estudiantesVinculados de cada cronograma.
// ─────────────────────────────────────────────────────────

import { obtenerCronogramas } from '../../Firebase/cronograma.js';

// ── Reactor canvas ─────────────────────────────────────────
function initReactor() {
    const canvas = document.getElementById('reactorBg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const ox = () => canvas.width * 0.5;
    const oy = () => canvas.height * 0.5;
    const rings = [
        { r: 200, speed: 0.0015, dash: [1,5],  dir:  1, alpha: 0.15, width: 0.8 },
        { r: 180, speed: 0.004,  dash: [40,12], dir: -1, alpha: 0.40, width: 2.0 },
        { r: 155, speed: 0.007,  dash: [30,15], dir:  1, alpha: 0.45, width: 1.5 },
        { r: 128, speed: 0.014,  dash: [25,20], dir: -1, alpha: 0.50, width: 1.5 },
        { r: 100, speed: 0.020,  dash: [18,18], dir:  1, alpha: 0.55, width: 2.0 },
        { r:  72, speed: 0.030,  dash: [12,8],  dir: -1, alpha: 0.45, width: 1.2 },
        { r:  44, speed: 0.040,  dash: [8,4],   dir:  1, alpha: 0.70, width: 2.0 },
    ];
    const angles = rings.map(() => Math.random() * Math.PI * 2);
    const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.5 + 0.3,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -(Math.random() * 0.35 + 0.05),
        alpha: Math.random() * 0.40 + 0.10,
        pulse: Math.random() * Math.PI * 2,
    }));
    let corePhase = 0;
    const draw = () => {
        const w = canvas.width, h = canvas.height;
        const cx = ox(), cy = oy();
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#000d1a'; ctx.fillRect(0, 0, w, h);
        const bgG = ctx.createRadialGradient(cx, cy, 0, cx, cy, 340);
        bgG.addColorStop(0, 'rgba(0,80,120,0.18)'); bgG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bgG; ctx.fillRect(0, 0, w, h);
        rings.forEach((ring, i) => {
            angles[i] += ring.speed * ring.dir;
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(angles[i]);
            ctx.beginPath(); ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,229,255,${ring.alpha})`;
            ctx.lineWidth = ring.width; ctx.setLineDash(ring.dash); ctx.stroke();
            ctx.restore();
        });
        ctx.setLineDash([]);
        corePhase += 0.025;
        const cp = 0.75 + 0.25 * Math.sin(corePhase);
        const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 45 * cp);
        halo.addColorStop(0, 'rgba(0,229,255,0.14)'); halo.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, 45 * cp, 0, Math.PI * 2); ctx.fillStyle = halo; ctx.fill();
        const sphere = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 18);
        sphere.addColorStop(0, 'rgba(180,240,255,0.9)');
        sphere.addColorStop(0.5, 'rgba(0,229,255,0.8)');
        sphere.addColorStop(1, 'rgba(0,30,60,0.85)');
        ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fillStyle = sphere; ctx.fill();
        particles.forEach(p => {
            p.pulse += 0.018;
            const a = p.alpha * (0.65 + 0.35 * Math.sin(p.pulse));
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,229,255,${a})`; ctx.fill();
            p.x += p.vx; p.y += p.vy;
            if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
        });
        requestAnimationFrame(draw);
    };
    draw();
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
async function buscarCronograma(cedula) {
    const cronogramas = await obtenerCronogramas();
    const encontrado = cronogramas.find(c =>
        c.estudiantesVinculados && c.estudiantesVinculados[cedula]
    );
    if (!encontrado) return null;
    const estudiante = encontrado.estudiantesVinculados[cedula];
    return {
        cronogramaId: encontrado.id,
        nombre: estudiante?.nombres ?? estudiante?.nombre ?? 'Estimado/a estudiante'
    };
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
        mostrarBienvenida(resultado.nombre, `cronograma.html?${params.toString()}`);
        console.log('Estudiante encontrado:', resultado);
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