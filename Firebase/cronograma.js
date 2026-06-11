import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, get, onValue } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyAl394v1xuNXxqkT6lEsiPQf74mFSIW6bw",
    authDomain: "cronogramas-estudiantes.firebaseapp.com",
    databaseURL: "https://cronogramas-estudiantes-default-rtdb.firebaseio.com",
    projectId: "cronogramas-estudiantes",
    storageBucket: "cronogramas-estudiantes.firebasestorage.app",
    messagingSenderId: "1079875324500",
    appId: "1:1079875324500:web:d398c2ea7e224c2d1c7bc1"
};

const app = getApps().find(a => a.name === 'cronogramas')
    ?? initializeApp(firebaseConfig, 'cronogramas');

const db = getDatabase(app);

/**
 * Obtener todos los cronogramas una vez
 */
export async function obtenerCronogramas() {
    const snapshot = await get(ref(db, 'cronogramas'));
    if (!snapshot.exists()) return [];
    const data = snapshot.val();
    return Object.keys(data).map(id => ({ id, ...data[id] }));
}

/**
 * Escuchar cronogramas en tiempo real
 */
export function escucharCronogramas(callback) {
    onValue(ref(db, 'cronogramas'), snapshot => {
        if (!snapshot.exists()) {
            callback([]);
            return;
        }
        const data = snapshot.val();
        const lista = Object.keys(data).map(id => ({ id, ...data[id] }));
        callback(lista);
    });
}

/**
 * Calcular estado según fechas
 */
export function calcularEstado(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return 'PROGRAMADO';
    const hoy   = new Date();
    const ini   = new Date(fechaInicio);
    const fin   = new Date(fechaFin);
    if (isNaN(ini.getTime()) || isNaN(fin.getTime())) return 'PROGRAMADO';
    if (hoy < ini)             return 'PROGRAMADO';
    if (hoy >= ini && hoy <= fin) return 'VIGENTE';
    return 'FINALIZADO';
}
export async function obtenerDocentePorCedula(cedula) {
    const db = getDatabase(getApp('cronogramas'));
    const snap = await get(ref(db, `docentes/${cedula}`));
    return snap.exists() ? snap.val() : null;
}