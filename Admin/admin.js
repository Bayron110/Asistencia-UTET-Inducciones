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

/* ══════════════════════════════════════════════════════════════
   INICIALIZACIÓN GENERAL
══════════════════════════════════════════════════════════════ */

let modulosDashboardIniciados = false;

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