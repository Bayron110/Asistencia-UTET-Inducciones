import {
  db as adminDb,
  ref as adminRef,
  onValue as adminOnValue
} from '../../Firebase/firebase-admin.js';

const DB_ADMIN_ESTUDIANTES = 'admin_estudiantes';
const DB_GRUPOS            = 'grupos';

const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════════
   ESTADO
══════════════════════════════════════════════════════════════ */

let adminEstudiantes      = {};
let grupos                = {};
let filtroActual          = 'todos';
let filtroCarrera         = 'todos';
let vistaCarrera          = 'barras';
let chartCarreraInstance  = null;
let listenerIniciado      = false;
let listenerGrupoIniciado = false;

/* ══════════════════════════════════════════════════════════════
   RENDER PRINCIPAL
══════════════════════════════════════════════════════════════ */

function renderDashboard() {
  renderKPIs();
  renderDonut();
  renderTablaEstudiantes();
  renderGruposHistorico();
  renderCarreras();
}

/* ── KPI cards ── */
function renderKPIs() {
  const entries    = Object.values(adminEstudiantes);
  const total      = entries.length;
  const presentes  = entries.filter(e => e.asistencia === true).length;
  const ausentes   = total - presentes;
  const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

  animarNumero($('dashKpiTotal'),     total);
  animarNumero($('dashKpiPresentes'), presentes);
  animarNumero($('dashKpiAusentes'),  ausentes);
  animarNumero($('dashKpiPct'),       porcentaje, '%');
}

/* ── Donut SVG ── */
function renderDonut() {
  const entries    = Object.values(adminEstudiantes);
  const total      = entries.length;
  const presentes  = entries.filter(e => e.asistencia === true).length;
  const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0;

  const CIRCUM = 408.41;
  const arcFill = $('dashArcFill');
  if (arcFill) {
    arcFill.style.strokeDasharray  = CIRCUM;
    arcFill.style.strokeDashoffset = CIRCUM - (porcentaje / 100) * CIRCUM;
  }

  const arcLabel = $('dashArcPct');
  if (arcLabel) arcLabel.textContent = porcentaje + '%';

  const legPresentes = $('dashLegPresentes');
  const legAusentes  = $('dashLegAusentes');
  const legTotal     = $('dashLegTotal');
  if (legPresentes) legPresentes.textContent = presentes;
  if (legAusentes)  legAusentes.textContent  = total - presentes;
  if (legTotal)     legTotal.textContent     = total;
}

/* ── Contador animado ── */
function animarNumero(el, target, suffix = '') {
  if (!el) return;
  const start    = parseInt(el.dataset.current || '0', 10);
  const duration = 650;
  const startTs  = performance.now();
  el.dataset.current = target;

  function step(ts) {
    const progress = Math.min((ts - startTs) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (target - start) * ease) + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

/* ── Tabla de estudiantes ── */
function renderTablaEstudiantes() {
  const tbody = $('dashTableBody');
  if (!tbody) return;

  let entries = Object.entries(adminEstudiantes);

  if (filtroActual === 'presentes') entries = entries.filter(([, v]) => v.asistencia === true);
  if (filtroActual === 'ausentes')  entries = entries.filter(([, v]) => v.asistencia !== true);

  const searchVal = ($('dashSearch')?.value || '').trim().toLowerCase();
  if (searchVal) {
    entries = entries.filter(([cedula, v]) =>
      cedula.toLowerCase().includes(searchVal) ||
      (v.nombres || v.nombre || '').toLowerCase().includes(searchVal) ||
      (v.carrera || '').toLowerCase().includes(searchVal)
    );
  }

  const allEntries   = Object.values(adminEstudiantes);
  const totalAll     = allEntries.length;
  const presentesAll = allEntries.filter(v => v.asistencia === true).length;

  const chipCountTodos     = $('dashChipCountTodos');
  const chipCountPresentes = $('dashChipCountPresentes');
  const chipCountAusentes  = $('dashChipCountAusentes');

  if (chipCountTodos)     chipCountTodos.textContent     = totalAll;
  if (chipCountPresentes) chipCountPresentes.textContent = presentesAll;
  if (chipCountAusentes)  chipCountAusentes.textContent  = totalAll - presentesAll;

  if (entries.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="dash-empty-row">' +
        '<div class="dash-empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">' +
            '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>' +
            '<circle cx="9" cy="7" r="4"/>' +
            '<path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>' +
          '</svg>' +
          '<p>Sin resultados</p>' +
        '</div>' +
      '</td></tr>';
    return;
  }

  tbody.innerHTML = entries.map(([cedula, d], i) => {
    const presente = d.asistencia === true;
    const nombre   = d.nombres || d.nombre || '–';
    const carrera  = d.carrera  || '–';
    const telegram = d.telegram || '–';

    return (
      '<tr class="dash-row ' + (presente ? 'dash-row--presente' : 'dash-row--ausente') + '">' +
        '<td><span class="dash-num">' + (i + 1) + '</span></td>' +
        '<td><span class="dash-cedula">' + escHtml(cedula) + '</span></td>' +
        '<td>' +
          '<div class="dash-nombre">' + escHtml(nombre) + '</div>' +
          '<div class="dash-carrera">' + escHtml(carrera) + '</div>' +
        '</td>' +
        '<td class="dash-tg">' + escHtml(telegram) + '</td>' +
        '<td>' +
          '<span class="dash-badge ' + (presente ? 'dash-badge--ok' : 'dash-badge--no') + '">' +
            (presente
              ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="11" height="11"><path d="M20 6L9 17l-5-5"/></svg> Presente'
              : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Ausente') +
          '</span>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

/* ── Grupos históricos ── */
function renderGruposHistorico() {
  const container = $('dashGruposHistorico');
  if (!container) return;

  const gruposArr = Object.entries(grupos);

  if (gruposArr.length === 0) {
    container.innerHTML =
      '<div class="dash-empty" style="padding:32px 0; grid-column:1/-1;">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32">' +
          '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>' +
          '<circle cx="9" cy="7" r="4"/>' +
          '<path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>' +
        '</svg>' +
        '<p>Aún no hay grupos migrados.</p>' +
      '</div>';
    return;
  }

  container.innerHTML = gruposArr.map(([id, g]) => {
    const miembros  = Object.values(g.estudiantes || {});
    const total     = miembros.length;
    const presentes = miembros.filter(m => m.asistencia === true).length;
    const pct       = total > 0 ? Math.round((presentes / total) * 100) : 0;
    const fecha     = g.creadoEn
      ? new Date(g.creadoEn).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
      : '–';

    const pctColor = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#f87171';

    return (
      '<div class="dash-grupo-card">' +
        '<div class="dash-grupo-header">' +
          '<div>' +
            '<div class="dash-grupo-nombre">' + escHtml(g.nombre || id) + '</div>' +
            '<div class="dash-grupo-fecha">' + fecha + '</div>' +
          '</div>' +
          '<div class="dash-grupo-pct" style="color:' + pctColor + '">' + pct + '%</div>' +
        '</div>' +
        '<div class="dash-grupo-bar-bg">' +
          '<div class="dash-grupo-bar-fill" style="width:' + pct + '%; background: linear-gradient(90deg,' + pctColor + ', ' + pctColor + '88)"></div>' +
        '</div>' +
        '<div class="dash-grupo-stats">' +
          '<span class="dash-grupo-stat dash-grupo-stat--ok">✔ ' + presentes + ' presentes</span>' +
          '<span class="dash-grupo-stat dash-grupo-stat--no">✖ ' + (total - presentes) + ' ausentes</span>' +
          '<span class="dash-grupo-stat">Total: ' + total + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   ASISTENCIA POR CARRERA
══════════════════════════════════════════════════════════════ */

function calcularDatosCarreras() {
  const map = {};
  Object.values(adminEstudiantes).forEach(e => {
    const carrera = (e.carrera || 'Sin carrera').trim();
    if (!map[carrera]) map[carrera] = { presentes: 0, total: 0 };
    map[carrera].total++;
    if (e.asistencia === true) map[carrera].presentes++;
  });

  return Object.entries(map)
    .map(([nombre, d]) => ({
      nombre,
      presentes: d.presentes,
      total: d.total,
      pct: d.total > 0 ? Math.round((d.presentes / d.total) * 100) : 0
    }))
    .sort((a, b) => b.pct - a.pct);
}

function colorCarrera(pct) {
  if (pct >= 80) return { bar: '#22c55e', bg: 'rgba(34,197,94,.12)',   border: 'rgba(34,197,94,.35)',   text: '#22c55e' };
  if (pct >= 60) return { bar: '#f59e0b', bg: 'rgba(245,158,11,.1)',   border: 'rgba(245,158,11,.3)',   text: '#f59e0b' };
  return              { bar: '#f87171', bg: 'rgba(248,113,113,.1)',  border: 'rgba(248,113,113,.3)',  text: '#f87171' };
}

function renderCarreras() {
  const all = calcularDatosCarreras();

  // Contadores filtros
  const nCritico = all.filter(c => c.pct < 60).length;
  const nAlto    = all.filter(c => c.pct >= 80).length;
  const totalEl  = $('dashCarreraTotal');
  const critEl   = $('dashCarreraCritCount');
  const altoEl   = $('dashCarreraAltoCount');
  if (totalEl) totalEl.textContent = all.length + (all.length === 1 ? ' carrera' : ' carreras');
  if (critEl)  critEl.textContent  = nCritico;
  if (altoEl)  altoEl.textContent  = nAlto;

  let data = all;
  if (filtroCarrera === 'critico') data = all.filter(c => c.pct < 60);
  if (filtroCarrera === 'alto')    data = all.filter(c => c.pct >= 80);

  if (vistaCarrera === 'barras') renderCarrerasChart(data);
  else                            renderCarrerasCards(data);
}

/* ══════════════════════════════════════════════════════════════
   FIX PRINCIPAL: renderCarrerasChart
   — Ya no destruye el <canvas> con innerHTML
   — Guarda Chart.js pendiente si aún no cargó
══════════════════════════════════════════════════════════════ */

function renderCarrerasChart(data) {
  // Si Chart.js todavía no cargó, salimos; se llamará de nuevo en onload
  if (typeof Chart === 'undefined') return;

  const wrap   = $('dashCarreraCanvasWrap');
  const canvas = $('dashCarreraCanvas');

  // Si el canvas fue destruido (por un innerHTML previo), lo recreamos
  if (!canvas && wrap) {
    const nuevoCanvas = document.createElement('canvas');
    nuevoCanvas.id        = 'dashCarreraCanvas';
    nuevoCanvas.setAttribute('role', 'img');
    nuevoCanvas.setAttribute('aria-label', 'Gráfico horizontal de asistencia por carrera');
    wrap.innerHTML = '';          // limpia cualquier mensaje residual
    wrap.appendChild(nuevoCanvas);
  }

  const cvs = $('dashCarreraCanvas');
  if (!cvs || !wrap) return;

  // Destruir instancia previa si existe
  if (chartCarreraInstance) {
    chartCarreraInstance.destroy();
    chartCarreraInstance = null;
  }

  // ── Sin datos: mostrar mensaje SIN tocar el canvas ──
  if (data.length === 0) {
    // Ocultamos el canvas pero lo dejamos en el DOM
    cvs.style.display = 'none';

    let msg = wrap.querySelector('.dash-chart-empty-msg');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'dash-chart-empty-msg';
      msg.style.cssText = 'padding:32px;text-align:center;color:#4a607a;font-size:.83rem;margin:0;';
      wrap.appendChild(msg);
    }
    msg.textContent     = 'Sin carreras en este filtro.';
    msg.style.display   = 'block';
    wrap.style.height   = '80px';
    return;
  }

  // ── Con datos: aseguramos que el canvas sea visible ──
  cvs.style.display = 'block';
  const msgExistente = wrap.querySelector('.dash-chart-empty-msg');
  if (msgExistente) msgExistente.style.display = 'none';

  const h = Math.max(data.length * 52 + 60, 100);
  wrap.style.height = h + 'px';

  // Línea de referencia 80 %
  const pluginRef = {
    id: 'refLine',
    afterDraw(chart) {
      const x    = chart.scales.x.getPixelForValue(80);
      const ctx2 = chart.ctx;
      ctx2.save();
      ctx2.setLineDash([4, 4]);
      ctx2.strokeStyle = 'rgba(96,165,250,.35)';
      ctx2.lineWidth   = 1;
      ctx2.beginPath();
      ctx2.moveTo(x, chart.chartArea.top);
      ctx2.lineTo(x, chart.chartArea.bottom);
      ctx2.stroke();
      ctx2.restore();
    }
  };

  chartCarreraInstance = new Chart(cvs, {
    type: 'bar',
    plugins: [pluginRef],
    data: {
      labels: data.map(c => c.nombre),
      datasets: [{
        data:            data.map(c => c.pct),
        backgroundColor: data.map(c => colorCarrera(c.pct).bar),
        borderColor:     data.map(c => colorCarrera(c.pct).bar),
        borderWidth:     0,
        borderRadius:    6,
        borderSkipped:   false
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0d1424',
          borderColor:     'rgba(255,255,255,.12)',
          borderWidth:     1,
          titleColor:      '#e8eef8',
          bodyColor:       '#7a8fa8',
          padding:         10,
          callbacks: {
            label: ctx => {
              const c = data[ctx.dataIndex];
              return ` ${c.presentes} de ${c.total} — ${c.pct}%`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid:   { color: 'rgba(255,255,255,.05)' },
          border: { color: 'rgba(255,255,255,.07)' },
          ticks: {
            color: '#4a607a',
            font:  { family: "'JetBrains Mono',monospace", size: 11 },
            callback: v => v + '%'
          }
        },
        y: {
          grid:   { display: false },
          border: { color: 'rgba(255,255,255,.07)' },
          ticks: {
            color: '#7a8fa8',
            font:  { family: "'Syne',sans-serif", size: 12, weight: '600' }
          }
        }
      }
    }
  });
}

function renderCarrerasCards(data) {
  const wrap = $('dashCarreraCards');
  if (!wrap) return;

  if (data.length === 0) {
    wrap.innerHTML = '<p style="padding:32px;text-align:center;color:#4a607a;font-size:.83rem;">Sin carreras en este filtro.</p>';
    return;
  }

  wrap.innerHTML = data.map(c => {
    const col  = colorCarrera(c.pct);
    const icon = c.pct >= 80 ? 'M20 6L9 17l-5-5' : c.pct >= 60
      ? 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01'
      : 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM4.93 4.93l14.14 14.14';

    return (
      '<div style="background:rgba(13,20,36,.7);border:1px solid ' + col.border + ';border-radius:14px;padding:18px;position:relative;overflow:hidden;">' +
        '<div style="position:absolute;top:0;left:0;right:0;height:2px;background:' + col.bar + ';"></div>' +
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:14px;">' +
          '<div>' +
            '<div style="font-weight:700;font-size:.84rem;color:#e8eef8;line-height:1.3;">' + escHtml(c.nombre) + '</div>' +
            '<div style="font-size:.68rem;font-family:\'JetBrains Mono\',monospace;color:#4a607a;margin-top:3px;">' + c.presentes + ' presentes / ' + c.total + ' total</div>' +
          '</div>' +
          '<div style="width:34px;height:34px;border-radius:9px;background:' + col.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="' + col.text + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="' + icon + '"/></svg>' +
          '</div>' +
        '</div>' +
        '<div style="font-family:\'JetBrains Mono\',monospace;font-size:2rem;font-weight:700;color:' + col.text + ';line-height:1;margin-bottom:10px;">' + c.pct + '%</div>' +
        '<div style="height:5px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden;">' +
          '<div style="height:100%;width:' + c.pct + '%;background:' + col.bar + ';border-radius:99px;transition:width .9s;"></div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   HTML DEL TAB
══════════════════════════════════════════════════════════════ */

function montarHTML() {
  const tab = $('tab-dashboard');
  if (!tab || tab.dataset.montado) return;
  tab.dataset.montado = '1';

  tab.innerHTML = `
    <!-- KPI Cards -->
    <div class="dash-kpi-row">
      <div class="dash-kpi dash-kpi--total">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiTotal">0</div>
        <div class="dash-kpi__label">Total estudiantes</div>
      </div>
      <div class="dash-kpi dash-kpi--ok">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiPresentes">0</div>
        <div class="dash-kpi__label">Presentes</div>
      </div>
      <div class="dash-kpi dash-kpi--no">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiAusentes">0</div>
        <div class="dash-kpi__label">Ausentes</div>
      </div>
      <div class="dash-kpi dash-kpi--pct">
        <div class="dash-kpi__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="5" x2="5" y2="19"/>
            <circle cx="6.5" cy="6.5" r="2.5"/>
            <circle cx="17.5" cy="17.5" r="2.5"/>
          </svg>
        </div>
        <div class="dash-kpi__num" id="dashKpiPct">0%</div>
        <div class="dash-kpi__label">% Asistencia</div>
      </div>
    </div>

    <!-- Donut + Tabla -->
    <div class="dash-main-row">
      <div class="dash-donut-card">
        <div class="dash-donut-card__title">Distribución de asistencia</div>
        <div class="dash-arc-wrap">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="65" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="14"/>
            <circle cx="80" cy="80" r="65" fill="none" stroke="rgba(248,113,113,.15)" stroke-width="14" stroke-dasharray="408.41" stroke-dashoffset="0"/>
            <circle id="dashArcFill" cx="80" cy="80" r="65" fill="none" stroke="#22c55e" stroke-width="14" stroke-linecap="round" stroke-dasharray="408.41" stroke-dashoffset="408.41"/>
          </svg>
          <div class="dash-arc-label">
            <span class="dash-arc-label__pct" id="dashArcPct">0%</span>
            <span class="dash-arc-label__sub">asistencia</span>
          </div>
        </div>
        <div class="dash-donut-legend">
          <div class="dash-legend-item">
            <div class="dash-legend-dot" style="background:#22c55e"></div>
            <span class="dash-legend-item__label">Presentes</span>
            <span class="dash-legend-item__val" id="dashLegPresentes">0</span>
          </div>
          <div class="dash-legend-item">
            <div class="dash-legend-dot" style="background:#f87171"></div>
            <span class="dash-legend-item__label">Ausentes</span>
            <span class="dash-legend-item__val" id="dashLegAusentes">0</span>
          </div>
          <div class="dash-legend-item">
            <div class="dash-legend-dot" style="background:#60a5fa"></div>
            <span class="dash-legend-item__label">Total</span>
            <span class="dash-legend-item__val" id="dashLegTotal">0</span>
          </div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:12px;">
        <div class="dash-filter-row">
          <button class="dash-chip dash-chip--todos active-todos" data-filtro="todos">
            <span class="dash-chip__dot"></span>
            Todos
            <span class="dash-chip__count" id="dashChipCountTodos">0</span>
          </button>
          <button class="dash-chip dash-chip--presentes" data-filtro="presentes">
            <span class="dash-chip__dot"></span>
            Presentes
            <span class="dash-chip__count" id="dashChipCountPresentes">0</span>
          </button>
          <button class="dash-chip dash-chip--ausentes" data-filtro="ausentes">
            <span class="dash-chip__dot"></span>
            Ausentes
            <span class="dash-chip__count" id="dashChipCountAusentes">0</span>
          </button>
        </div>
        <div class="dash-table-card">
          <div class="dash-table-head">
            <div style="display:flex;align-items:center;gap:10px;">
              <h3>Detalle de asistencia</h3>
              <div class="dash-live"><span class="dash-live-dot"></span>En vivo</div>
            </div>
            <div class="dash-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input id="dashSearch" type="text" placeholder="Buscar cédula, nombre…">
            </div>
          </div>
          <div class="dash-table-scroll">
            <table class="dash-table">
              <thead>
                <tr>
                  <th>#</th><th>Cédula</th><th>Nombre / Carrera</th><th>Telegram</th><th>Estado</th>
                </tr>
              </thead>
              <tbody id="dashTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ ASISTENCIA POR CARRERA ══ -->
    <div style="background:rgba(13,20,36,.7);border:1px solid rgba(255,255,255,.07);border-radius:14px;overflow:hidden;">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07);">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:28px;height:28px;background:rgba(37,99,235,.15);border:1px solid rgba(37,99,235,.3);border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
            </svg>
          </div>
          <span style="font-size:.88rem;font-weight:700;color:#e8eef8;">Asistencia por carrera</span>
          <span id="dashCarreraTotal" style="font-size:.65rem;font-family:'JetBrains Mono',monospace;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);padding:2px 9px;border-radius:99px;color:#7a8fa8;">0 carreras</span>
        </div>
        <!-- Switcher vista -->
        <div style="display:flex;gap:6px;">
          <button id="dashCarreraBtnBarras" onclick="window.__dashSetVistaCarrera('barras')" style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;border:1px solid rgba(37,99,235,.4);background:rgba(37,99,235,.18);color:#60a5fa;font-size:.72rem;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="3" y="10" width="4" height="11"/><rect x="10" y="4" width="4" height="17"/><rect x="17" y="7" width="4" height="14"/></svg>
            Barras
          </button>
          <button id="dashCarreraBtnCards" onclick="window.__dashSetVistaCarrera('cards')" style="display:flex;align-items:center;gap:5px;padding:5px 12px;border-radius:99px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:#7a8fa8;font-size:.72rem;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><rect x="2" y="3" width="8" height="8" rx="1.5"/><rect x="14" y="3" width="8" height="8" rx="1.5"/><rect x="2" y="14" width="8" height="7" rx="1.5"/><rect x="14" y="14" width="8" height="7" rx="1.5"/></svg>
            Cards
          </button>
        </div>
      </div>

      <!-- Filtros -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.07);">
        <button onclick="window.__dashSetFiltroCarrera('todos')" id="dashCarreraFTodos"
          style="display:flex;align-items:center;gap:7px;padding:5px 13px;border-radius:99px;border:1px solid rgba(37,99,235,.45);background:rgba(37,99,235,.16);color:#60a5fa;font-size:.75rem;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;">
          <span style="width:6px;height:6px;border-radius:50%;background:#60a5fa;flex-shrink:0;"></span>
          Todas
        </button>
        <button onclick="window.__dashSetFiltroCarrera('critico')" id="dashCarreraFCritico"
          style="display:flex;align-items:center;gap:7px;padding:5px 13px;border-radius:99px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:#7a8fa8;font-size:.75rem;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;">
          <span style="width:6px;height:6px;border-radius:50%;background:#f87171;flex-shrink:0;"></span>
          Críticas &lt;60%
          <span id="dashCarreraCritCount" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:99px;">0</span>
        </button>
        <button onclick="window.__dashSetFiltroCarrera('alto')" id="dashCarreraFAlto"
          style="display:flex;align-items:center;gap:7px;padding:5px 13px;border-radius:99px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.03);color:#7a8fa8;font-size:.75rem;font-weight:700;cursor:pointer;font-family:'Syne',sans-serif;">
          <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0;"></span>
          Óptimas ≥80%
          <span id="dashCarreraAltoCount" style="font-family:'JetBrains Mono',monospace;font-size:.68rem;background:rgba(255,255,255,.08);padding:1px 7px;border-radius:99px;">0</span>
        </button>
        <!-- Leyenda semáforo -->
        <div style="margin-left:auto;display:flex;align-items:center;gap:12px;font-size:.68rem;font-family:'JetBrains Mono',monospace;color:#4a607a;">
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:#22c55e;display:inline-block;"></span>≥80%</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:#f59e0b;display:inline-block;"></span>60–79%</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:#f87171;display:inline-block;"></span>&lt;60%</span>
          <span style="border-left:1px dashed rgba(96,165,250,.35);padding-left:10px;color:rgba(96,165,250,.6);">— meta 80%</span>
        </div>
      </div>

      <!-- Vista barras -->
      <div id="dashCarreraVistaBarras" style="padding:8px 0 4px;">
        <div id="dashCarreraCanvasWrap" style="position:relative;width:100%;height:100px;">
          <canvas id="dashCarreraCanvas" role="img" aria-label="Gráfico horizontal de asistencia por carrera"></canvas>
        </div>
      </div>

      <!-- Vista cards -->
      <div id="dashCarreraVistaCards" style="display:none;padding:18px 20px;">
        <div id="dashCarreraCards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;"></div>
      </div>

    </div>

    <!-- Grupos históricos -->
    <div class="dash-grupos-section">
      <div class="dash-grupos-section__header">
        <h3>Grupos migrados — histórico</h3>
      </div>
      <div class="dash-grupos-grid" id="dashGruposHistorico"></div>
    </div>
  `;

  // Chips filtro tabla
  tab.querySelectorAll('.dash-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroActual = chip.dataset.filtro;
      tab.querySelectorAll('.dash-chip').forEach(c => {
        c.className = c.className.replace(/active-\S+/g, '').trim();
      });
      chip.classList.add('active-' + filtroActual);
      renderTablaEstudiantes();
    });
  });

  // Buscador
  const dashSearch = $('dashSearch');
  if (dashSearch) dashSearch.addEventListener('input', renderTablaEstudiantes);

  // Chart.js — cargar si no está disponible
  if (typeof Chart === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
    script.onload = () => renderCarreras();   // re-render cuando ya esté disponible
    document.head.appendChild(script);
  }

  // Handlers globales para los botones inline
  window.__dashSetFiltroCarrera = (f) => {
    filtroCarrera = f;
    const btns = {
      todos:   { el: $('dashCarreraFTodos'),   color: '#60a5fa', bg: 'rgba(37,99,235,.16)',       border: 'rgba(37,99,235,.45)' },
      critico: { el: $('dashCarreraFCritico'),  color: '#f87171', bg: 'rgba(248,113,113,.1)',       border: 'rgba(248,113,113,.35)' },
      alto:    { el: $('dashCarreraFAlto'),     color: '#22c55e', bg: 'rgba(34,197,94,.1)',         border: 'rgba(34,197,94,.35)' }
    };
    Object.entries(btns).forEach(([key, { el, color, bg, border }]) => {
      if (!el) return;
      const active = key === f;
      el.style.background   = active ? bg    : 'rgba(255,255,255,.03)';
      el.style.borderColor  = active ? border: 'rgba(255,255,255,.07)';
      el.style.color        = active ? color : '#7a8fa8';
    });
    renderCarreras();
  };

  window.__dashSetVistaCarrera = (v) => {
    vistaCarrera = v;
    const vBarras = $('dashCarreraVistaBarras');
    const vCards  = $('dashCarreraVistaCards');
    const bBarras = $('dashCarreraBtnBarras');
    const bCards  = $('dashCarreraBtnCards');

    if (vBarras) vBarras.style.display = v === 'barras' ? 'block' : 'none';
    if (vCards)  vCards.style.display  = v === 'cards'  ? 'block' : 'none';

    if (bBarras) {
      bBarras.style.background   = v === 'barras' ? 'rgba(37,99,235,.18)' : 'rgba(255,255,255,.03)';
      bBarras.style.borderColor  = v === 'barras' ? 'rgba(37,99,235,.4)'  : 'rgba(255,255,255,.07)';
      bBarras.style.color        = v === 'barras' ? '#60a5fa' : '#7a8fa8';
    }
    if (bCards) {
      bCards.style.background    = v === 'cards'  ? 'rgba(37,99,235,.18)' : 'rgba(255,255,255,.03)';
      bCards.style.borderColor   = v === 'cards'  ? 'rgba(37,99,235,.4)'  : 'rgba(255,255,255,.07)';
      bCards.style.color         = v === 'cards'  ? '#60a5fa' : '#7a8fa8';
    }

    renderCarreras();
  };
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════════
   ESCUCHAR FIREBASE
══════════════════════════════════════════════════════════════ */

export function iniciarDashboard() {
  montarHTML();

  if (!listenerIniciado) {
    listenerIniciado = true;

    adminOnValue(adminRef(adminDb, DB_ADMIN_ESTUDIANTES), snapshot => {
      adminEstudiantes = snapshot.val() || {};
      renderDashboard();
    });
  }

  if (!listenerGrupoIniciado) {
    listenerGrupoIniciado = true;

    adminOnValue(adminRef(adminDb, DB_GRUPOS), snapshot => {
      grupos = snapshot.val() || {};
      renderGruposHistorico();
    });
  }
}