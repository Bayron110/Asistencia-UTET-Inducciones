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
let filtroActual          = 'todos';   // 'todos' | 'presentes' | 'ausentes'
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

  const CIRCUM = 408.41; // 2π × 65
  const arcFill = $('dashArcFill');
  if (arcFill) {
    const offset = CIRCUM - (porcentaje / 100) * CIRCUM;
    arcFill.style.strokeDasharray  = CIRCUM;
    arcFill.style.strokeDashoffset = offset;
  }

  const arcLabel = $('dashArcPct');
  if (arcLabel) arcLabel.textContent = porcentaje + '%';

  // Leyenda
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

  // Actualizar contadores en los chips
  const allEntries       = Object.values(adminEstudiantes);
  const totalAll         = allEntries.length;
  const presentesAll     = allEntries.filter(v => v.asistencia === true).length;
  const ausentesAll      = totalAll - presentesAll;

  const chipCountTodos     = $('dashChipCountTodos');
  const chipCountPresentes = $('dashChipCountPresentes');
  const chipCountAusentes  = $('dashChipCountAusentes');

  if (chipCountTodos)     chipCountTodos.textContent     = totalAll;
  if (chipCountPresentes) chipCountPresentes.textContent = presentesAll;
  if (chipCountAusentes)  chipCountAusentes.textContent  = ausentesAll;

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

    // Color del porcentaje según nivel
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

      <!-- Donut Chart -->
      <div class="dash-donut-card">
        <div class="dash-donut-card__title">Distribución de asistencia</div>

        <div class="dash-arc-wrap">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <!-- Track -->
            <circle cx="80" cy="80" r="65"
              fill="none"
              stroke="rgba(255,255,255,.06)"
              stroke-width="14"/>
            <!-- Ausentes (fondo rojo) -->
            <circle cx="80" cy="80" r="65"
              fill="none"
              stroke="rgba(248,113,113,.15)"
              stroke-width="14"
              stroke-dasharray="408.41"
              stroke-dashoffset="0"/>
            <!-- Presentes (verde) -->
            <circle id="dashArcFill" cx="80" cy="80" r="65"
              fill="none"
              stroke="#22c55e"
              stroke-width="14"
              stroke-linecap="round"
              stroke-dasharray="408.41"
              stroke-dashoffset="408.41"/>
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

      <!-- Tabla detalle -->
      <div style="display:flex; flex-direction:column; gap:12px;">
        <!-- Filtros -->
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

        <!-- Tabla -->
        <div class="dash-table-card">
          <div class="dash-table-head">
            <div style="display:flex;align-items:center;gap:10px;">
              <h3>Detalle de asistencia</h3>
              <div class="dash-live">
                <span class="dash-live-dot"></span>
                En vivo
              </div>
            </div>
            <div class="dash-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input id="dashSearch" type="text" placeholder="Buscar cédula, nombre…">
            </div>
          </div>
          <div class="dash-table-scroll">
            <table class="dash-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cédula</th>
                  <th>Nombre / Carrera</th>
                  <th>Telegram</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody id="dashTableBody"></tbody>
            </table>
          </div>
        </div>
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

  // Chips filtro
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