// ── Ruta/Acceso.js ──────────────────────────────────────────────
// Mapeo departamento del docente → página de su área.
// Agregar aquí cuando se sumen nuevos departamentos a futuro.
// ─────────────────────────────────────────────────────────────────

const ENLACES_POR_AREA = {
    'Unidad de Titulación': 'https://tangerine-strudel-35d0e7.netlify.app/titulaci%C3%B3n/informacion_titulacion',
    'USEGBE - URI':         'https://tangerine-strudel-35d0e7.netlify.app/area-usegbe/usegbe',
};

// ── Obtiene el link según el departamento (o null si no existe) ─
export function obtenerLinkPorDepartamento(departamento) {
    return ENLACES_POR_AREA[departamento] ?? null;
}

// ── Redirige al docente a la página de su área ──────────────────
export function irAAreaDocente(departamento) {
    const link = obtenerLinkPorDepartamento(departamento);

    if (!link) {
        alert('Tu departamento aún no tiene una página de acceso asignada. Contacta al administrador.');
        return;
    }

    window.open(link, '_blank', 'noopener,noreferrer');
}