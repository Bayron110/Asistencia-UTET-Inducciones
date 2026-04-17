// Admin/admin.js

import {
  iniciarAutenticacion,
  configurarAutenticacion
} from './components/autenticacion.js';

import {
  iniciarInterfaz
} from './components/interfaz.js';

import {
  iniciarListenersAsistencia,
  obtenerRegistros
} from './components/asistencia.js';

import {
  iniciarControlSesion,
  detenerControlSesion
} from './components/control-sesion.js';

import {
  iniciarExcelGrupos,
  configurarExcelGrupos
} from './components/excel-grupos.js';

import {
  iniciarDashboard
} from './components/dashboard.js';

/* ══════════════════════════════════════════════════════════════
   ESTADO GENERAL
══════════════════════════════════════════════════════════════ */

let modulosDashboardIniciados = false;
let dashboardVisualIniciado = false;

/* ══════════════════════════════════════════════════════════════
   UTILIDADES DOM
══════════════════════════════════════════════════════════════ */

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

/* ══════════════════════════════════════════════════════════════
   RELOJ SUPERIOR
══════════════════════════════════════════════════════════════ */

let relojInterval = null;

function iniciarReloj() {
  const clockDisplay = $('#clockDisplay');
  if (!clockDisplay) return;

  function actualizar() {
    const ahora = new Date();
    clockDisplay.textContent = ahora.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  actualizar();

  if (relojInterval) clearInterval(relojInterval);
  relojInterval = setInterval(actualizar, 1000);
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR MOBILE
══════════════════════════════════════════════════════════════ */

function iniciarSidebarResponsive() {
  const hamburgerBtn = $('#hamburgerBtn');
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');

  if (!sidebar || !overlay) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  }

  if (hamburgerBtn && !hamburgerBtn.dataset.binded) {
    hamburgerBtn.addEventListener('click', openSidebar);
    hamburgerBtn.dataset.binded = 'true';
  }

  if (!overlay.dataset.binded) {
    overlay.addEventListener('click', closeSidebar);
    overlay.dataset.binded = 'true';
  }

  window.__adminCloseSidebar = closeSidebar;
}

/* ══════════════════════════════════════════════════════════════
   TABS / NAVEGACIÓN
══════════════════════════════════════════════════════════════ */

const TITULOS_TAB = {
  registros: 'Registros en tiempo real',
  sesion: 'Control de Sesión',
  excel: 'Carga Excel',
  grupos: 'Grupos',
  dashboard: 'Dashboard'
};

function ocultarTodosLosTabs() {
  const panels = $all('.tab-panel');
  panels.forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });
}

function desactivarNavItems() {
  const items = $all('.nav-item');
  items.forEach(item => item.classList.remove('active'));
}

function cambiarTituloTopbar(tab) {
  const topbarTitle = $('#topbarTitle');
  if (!topbarTitle) return;
  topbarTitle.textContent = TITULOS_TAB[tab] || 'Panel Admin';
}

function asegurarDashboardMontado() {
  if (dashboardVisualIniciado) return;
  iniciarDashboard();
  dashboardVisualIniciado = true;
}

function activarTab(tab) {
  if (!tab) return;

  ocultarTodosLosTabs();
  desactivarNavItems();

  const navActivo = document.querySelector(`.nav-item[data-tab="${tab}"]`);
  const panelActivo = document.getElementById(`tab-${tab}`);

  if (navActivo) {
    navActivo.classList.add('active');
  }

  if (panelActivo) {
    panelActivo.style.display = 'block';
    panelActivo.classList.add('active');
  }

  cambiarTituloTopbar(tab);

  if (tab === 'dashboard') {
    asegurarDashboardMontado();
  }

  if (window.innerWidth <= 640 && typeof window.__adminCloseSidebar === 'function') {
    window.__adminCloseSidebar();
  }
}

function iniciarTabs() {
  const navItems = $all('.nav-item');

  navItems.forEach(item => {
    if (item.dataset.binded === 'true') return;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = item.dataset.tab;
      activarTab(tab);
    });

    item.dataset.binded = 'true';
  });

  activarTab('registros');
}

/* ══════════════════════════════════════════════════════════════
   MÓDULOS PRINCIPALES
══════════════════════════════════════════════════════════════ */

function iniciarModulosDashboard() {
  if (modulosDashboardIniciados) return;
  modulosDashboardIniciados = true;

  iniciarInterfaz();
  iniciarListenersAsistencia();
  iniciarControlSesion();

  configurarExcelGrupos({
    obtenerRegistros
  });
  iniciarExcelGrupos();

  iniciarSidebarResponsive();
  iniciarTabs();
  iniciarReloj();
}

function cerrarModulosDashboard() {
  detenerControlSesion();
}

/* ══════════════════════════════════════════════════════════════
   AUTENTICACIÓN
══════════════════════════════════════════════════════════════ */

configurarAutenticacion({
  onDashboardOpen: () => {
    iniciarModulosDashboard();
  },
  onDashboardClose: () => {
    cerrarModulosDashboard();
  }
});

iniciarAutenticacion();