import { escucharCronogramas, calcularEstado } from '../../Firebase/cronograma.js';

// ── Estado ──────────────────────────────────────────────
let todosLosCronogramas = [];
let filtroActual = 'TODOS';

// ── Reactor canvas ──────────────────────────────────────
function initReactor() {
    const canvas = document.getElementById('reactorBg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const ox = () => canvas.width * 0.5;
    const oy = () => canvas.height * 0.5;

    const rings = [
        { r: 240, speed: 0.0015, dash: [1, 5], dir: 1, alpha: 0.20, width: 0.8 },
        { r: 220, speed: 0.004, dash: [40, 12], dir: -1, alpha: 0.55, width: 2.5 },
        { r: 220, speed: 0.004, dash: [20, 32], dir: -1, alpha: 0.30, width: 1.0 },
        { r: 195, speed: 0.002, dash: [2, 6], dir: 1, alpha: 0.25, width: 0.8 },
        { r: 175, speed: 0.007, dash: [30, 15], dir: 1, alpha: 0.60, width: 2.0 },
        { r: 175, speed: 0.007, dash: [10, 35], dir: 1, alpha: 0.25, width: 1.0 },
        { r: 155, speed: 0.0025, dash: [1000, 0], dir: -1, alpha: 0.18, width: 1.0 },
        { r: 135, speed: 0.014, dash: [25, 20], dir: -1, alpha: 0.65, width: 2.0 },
        { r: 135, speed: 0.014, dash: [8, 37], dir: -1, alpha: 0.30, width: 1.0 },
        { r: 112, speed: 0.005, dash: [3, 5], dir: 1, alpha: 0.30, width: 1.0 },
        { r: 90, speed: 0.020, dash: [18, 18], dir: 1, alpha: 0.70, width: 2.5 },
        { r: 90, speed: 0.020, dash: [6, 30], dir: 1, alpha: 0.35, width: 1.0 },
        { r: 68, speed: 0.030, dash: [12, 8], dir: -1, alpha: 0.55, width: 1.5 },
        { r: 68, speed: 0.030, dash: [3, 17], dir: -1, alpha: 0.25, width: 1.0 },
        { r: 45, speed: 0.040, dash: [8, 4], dir: 1, alpha: 0.80, width: 2.5 },
        { r: 45, speed: 0.040, dash: [2, 10], dir: 1, alpha: 0.40, width: 1.0 },
    ];
    const angles = rings.map(() => Math.random() * Math.PI * 2);

    const ticksOuter = Array.from({ length: 96 }, (_, i) => ({
        angle: (i / 96) * Math.PI * 2,
        len: i % 8 === 0 ? 16 : i % 4 === 0 ? 10 : i % 2 === 0 ? 6 : 3,
        r: 248,
        alpha: i % 8 === 0 ? 0.80 : i % 4 === 0 ? 0.50 : 0.20,
        width: i % 8 === 0 ? 1.5 : 0.8
    }));

    const ticksMid = Array.from({ length: 60 }, (_, i) => ({
        angle: (i / 60) * Math.PI * 2,
        len: i % 5 === 0 ? 10 : 5,
        r: 200,
        alpha: i % 5 === 0 ? 0.55 : 0.20,
        width: i % 5 === 0 ? 1.2 : 0.7
    }));

    const ticksInner = Array.from({ length: 36 }, (_, i) => ({
        angle: (i / 36) * Math.PI * 2,
        len: i % 3 === 0 ? 8 : 4,
        r: 118,
        alpha: i % 3 === 0 ? 0.60 : 0.20,
        width: 0.8
    }));

    const hudLines = [
        { side: 'left', yOff: -80, len: 200, alpha: 0.30, dash: [20, 6, 4, 6] },
        { side: 'left', yOff: -50, len: 280, alpha: 0.20, dash: [8, 8] },
        { side: 'left', yOff: 50, len: 240, alpha: 0.25, dash: [15, 6] },
        { side: 'left', yOff: 80, len: 180, alpha: 0.18, dash: [5, 10] },
        { side: 'right', yOff: -70, len: 220, alpha: 0.30, dash: [20, 6, 4, 6] },
        { side: 'right', yOff: -40, len: 300, alpha: 0.20, dash: [8, 8] },
        { side: 'right', yOff: 60, len: 250, alpha: 0.25, dash: [15, 6] },
        { side: 'right', yOff: 90, len: 170, alpha: 0.18, dash: [5, 10] },
    ];

    const particles = Array.from({ length: 80 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.8 + 0.3,
        vx: (Math.random() - 0.5) * 0.30,
        vy: -(Math.random() * 0.45 + 0.06),
        alpha: Math.random() * 0.50 + 0.10,
        pulse: Math.random() * Math.PI * 2,
        green: Math.random() < 0.15
    }));

    const scanDots = Array.from({ length: 50 }, () => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 2.2 + 0.5,
        alpha: Math.random() * 0.28 + 0.05,
        green: Math.random() < 0.20,
        pulse: Math.random() * Math.PI * 2
    }));

    let corePhase = 0;

    const draw = () => {
        const w = canvas.width, h = canvas.height;
        const cx = ox(), cy = oy();
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = '#000d1a';
        ctx.fillRect(0, 0, w, h);

        const bgG = ctx.createRadialGradient(cx, cy, 0, cx, cy, 420);
        bgG.addColorStop(0, 'rgba(0,80,120,0.22)');
        bgG.addColorStop(0.4, 'rgba(0,40,70,0.14)');
        bgG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bgG;
        ctx.fillRect(0, 0, w, h);

        scanDots.forEach(d => {
            d.pulse += 0.022;
            const a = d.alpha * (0.55 + 0.45 * Math.sin(d.pulse));
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
            ctx.fillStyle = d.green ? `rgba(105,255,71,${a})` : `rgba(0,229,255,${a})`;
            ctx.fill();
        });

        hudLines.forEach(l => {
            const startX = l.side === 'left' ? cx - 250 - l.len : cx + 250;
            const endX = l.side === 'left' ? cx - 250 : cx + 250 + l.len;
            ctx.beginPath();
            ctx.moveTo(startX, cy + l.yOff);
            ctx.lineTo(endX, cy + l.yOff);
            ctx.strokeStyle = `rgba(0,229,255,${l.alpha})`;
            ctx.lineWidth = 0.8;
            ctx.setLineDash(l.dash);
            ctx.stroke();
            ctx.setLineDash([]);
            const tx = l.side === 'left' ? startX : endX;
            ctx.fillStyle = `rgba(0,229,255,${l.alpha * 1.5})`;
            ctx.fillRect(tx - 2, cy + l.yOff - 2, 4, 4);
        });

        [ticksOuter, ticksMid, ticksInner].forEach(group => {
            group.forEach(tk => {
                const x1 = cx + Math.cos(tk.angle) * tk.r;
                const y1 = cy + Math.sin(tk.angle) * tk.r;
                const x2 = cx + Math.cos(tk.angle) * (tk.r + tk.len);
                const y2 = cy + Math.sin(tk.angle) * (tk.r + tk.len);
                ctx.beginPath();
                ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
                ctx.strokeStyle = `rgba(0,229,255,${tk.alpha})`;
                ctx.lineWidth = tk.width;
                ctx.stroke();
            });
        });

        rings.forEach((ring, i) => {
            angles[i] += ring.speed * ring.dir;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angles[i]);
            ctx.beginPath();
            ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0,229,255,${ring.alpha})`;
            ctx.lineWidth = ring.width;
            ctx.setLineDash(ring.dash);
            ctx.stroke();
            ctx.restore();
        });
        ctx.setLineDash([]);

        corePhase += 0.025;
        const corePulse = 0.75 + 0.25 * Math.sin(corePhase);
        const coreGlow = 0.85 + 0.15 * Math.sin(corePhase * 1.3);

        const halo1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55 * corePulse);
        halo1.addColorStop(0, `rgba(0,229,255,${0.18 * coreGlow})`);
        halo1.addColorStop(0.5, `rgba(0,150,200,${0.10 * coreGlow})`);
        halo1.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, 55 * corePulse, 0, Math.PI * 2);
        ctx.fillStyle = halo1; ctx.fill();

        const sphere = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 22);
        sphere.addColorStop(0, `rgba(180,240,255,${0.95 * coreGlow})`);
        sphere.addColorStop(0.3, `rgba(0,229,255,${0.85 * coreGlow})`);
        sphere.addColorStop(0.7, `rgba(0,100,180,${0.70 * coreGlow})`);
        sphere.addColorStop(1, `rgba(0,30,60,${0.90 * coreGlow})`);
        ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2);
        ctx.fillStyle = sphere; ctx.fill();

        const dot = ctx.createRadialGradient(cx, cy, 0, cx, cy, 6);
        dot.addColorStop(0, '#ffffff');
        dot.addColorStop(0.4, `rgba(200,245,255,${coreGlow})`);
        dot.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fillStyle = dot; ctx.fill();

        particles.forEach(p => {
            p.pulse += 0.020;
            const a = p.alpha * (0.65 + 0.35 * Math.sin(p.pulse));
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.green ? `rgba(105,255,71,${a})` : `rgba(0,229,255,${a})`;
            ctx.fill();
            p.x += p.vx; p.y += p.vy;
            if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
            if (p.x < -5) p.x = w + 5;
            if (p.x > w + 5) p.x = -5;
        });

        requestAnimationFrame(draw);
    };
    draw();
}

// ── Reloj ────────────────────────────────────────────────
function iniciarReloj() {
    const el = document.getElementById('reloj');
    if (!el) return;
    const tick = () => {
        const ahora = new Date();
        el.textContent = ahora.toLocaleTimeString('es-EC', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };
    tick();
    setInterval(tick, 1000);
}

// ── Helpers de fecha ─────────────────────────────────────
function formatearFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha + (fecha.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return fecha;
    return d.toLocaleDateString('es-EC', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
}

// ── Badge de estado ──────────────────────────────────────
function badgeEstado(estado) {
    const cfg = {
        VIGENTE: { label: 'Vigente', clase: 'vigente' },
        PROGRAMADO: { label: 'Programado', clase: 'programado' },
        FINALIZADO: { label: 'Finalizado', clase: 'finalizado' },
    };
    const { label, clase } = cfg[estado] ?? { label: estado, clase: '' };
    return `<span class="badge ${clase}">${label}</span>`;
}

// ── Render de una card ───────────────────────────────────
function crearCard(c) {
    const estado = calcularEstado(c.fechaInicio, c.fechaFin);
    const total = c.actividades ? c.actividades.length : 0;

    const card = document.createElement('div');
    card.className = 'crono-card';
    card.dataset.id = c.id;

    card.innerHTML = `
        <div class="crono-card-top"
            style="background:${c.colorFondo ?? '#1976d2'};
                   color:${c.colorTexto ?? '#ffffff'};
                   border-color:${c.colorBorde ?? '#0d47a1'};
                   font-family:${c.fuente ?? 'Arial'}">
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

    card.querySelector('.btn-ver-detalle')
        .addEventListener('click', () => abrirModal(c));

    return card;
}

// ── Render del grid ──────────────────────────────────────
function renderGrid(lista) {
    const grid = document.getElementById('gridCronogramas');
    const vacia = document.getElementById('vistaVacia');
    const filtrados = filtroActual === 'TODOS'
        ? lista
        : lista.filter(c => calcularEstado(c.fechaInicio, c.fechaFin) === filtroActual);

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
function actividadFinalizada(fechaFin) {
    if (!fechaFin) return false;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const fin = new Date(fechaFin + 'T23:59:59');

    return fin < hoy;
}

// ── Modal ─────────────────────────────────────────────────
function abrirModal(c) {
    const estado = calcularEstado(c.fechaInicio, c.fechaFin);

    document.getElementById('modalHeader').style.background = c.colorFondo ?? '#1976d2';
    document.getElementById('modalHeader').style.color = c.colorTexto ?? '#ffffff';
    document.getElementById('modalHeader').style.borderColor = c.colorBorde ?? '#0d47a1';
    document.getElementById('modalHeader').style.fontFamily = c.fuente ?? 'Arial';

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
                : i + 1
            }
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

// ── Filtros ───────────────────────────────────────────────
function initFiltros() {
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filtro-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filtroActual = btn.dataset.estado;
            renderGrid(todosLosCronogramas);
        });
    });
}

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initReactor();
    iniciarReloj();
    initFiltros();

    document.getElementById('btnCerrarModal')
        .addEventListener('click', cerrarModal);

    document.getElementById('modalOverlay')
        .addEventListener('click', e => {
            if (e.target === e.currentTarget) cerrarModal();
        });

    escucharCronogramas(lista => {
        todosLosCronogramas = lista;
        renderGrid(lista);
    });
});