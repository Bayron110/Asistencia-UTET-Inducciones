// ── notificacion-web.js ────────────────────────────────────
// Bot de Telegram para notificaciones de actividades ITSOMET.
// Usa solo Telegram Bot API + Firebase Realtime Database.
// Compatible con plan Spark (sin Cloud Functions).
// ──────────────────────────────────────────────────────────

import { obtenerCronogramas } from '../../Firebase/cronograma.js';
import { getDatabase, ref, update, get }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Configuración ──────────────────────────────────────────
const BOT_TOKEN = '8604941459:AAFe0QUbqyFHTJnFW4bbEtznHkRluW2ECIw'; // ← reemplazar tras revocar
const BOT_USERNAME = 'itsometcronogramas_bot';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Enviar mensaje por Telegram ────────────────────────────
export async function enviarMensajeTelegram(chatId, texto) {
    try {
        const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: texto,
                parse_mode: 'HTML'
            })
        });
        const data = await res.json();
        return data.ok;
    } catch (err) {
        console.error('Error enviando mensaje Telegram:', err);
        return false;
    }
}

// ── Guardar chatId en Firebase ─────────────────────────────
export async function guardarChatId(cronogramaId, cedula, chatId) {
    try {
        const db = getDatabase();
        await update(
            ref(db, `cronogramas/${cronogramaId}/estudiantesVinculados/${cedula}`),
            { telegramChatId: chatId, notificacionesActivas: true }
        );
        return true;
    } catch (err) {
        console.error('Error guardando chatId:', err);
        return false;
    }
}

// ── Obtener updates del bot (polling) ─────────────────────
// Se usa para recibir el /start del estudiante y capturar su chatId
async function obtenerUpdates(offset = 0) {
    try {
        const res = await fetch(
            `${TELEGRAM_API}/getUpdates?offset=${offset}&timeout=5&allowed_updates=["message"]`
        );
        const data = await res.json();
        return data.ok ? data.result : [];
    } catch {
        return [];
    }
}

// ── Procesar el /start del estudiante ─────────────────────
// Cuando el estudiante abre el link t.me/bot?start=CEDULA_CRONOID
// el bot recibe: /start CEDULA-CRONOGRAMAID
export async function procesarRegistros() {
    const updates = await obtenerUpdates();
    for (const update of updates) {
        const msg = update.message;
        if (!msg || !msg.text) continue;

        const texto = msg.text.trim();
        const chatId = String(msg.chat.id);
        const nombre = msg.from.first_name ?? 'Estudiante';

        if (texto.startsWith('/start ')) {
            // Formato del payload: CEDULA-CRONOGRAMAID
            const payload = texto.replace('/start ', '').trim();
            const [cedula, cronogramaId] = payload.split('-');

            if (cedula && cronogramaId) {
                const ok = await guardarChatId(cronogramaId, cedula, chatId);
                if (ok) {
                    await enviarMensajeTelegram(chatId,
                        `✅ <b>¡Listo, ${nombre}!</b>\n\n` +
                        `Ya estás suscrito a las notificaciones de tu cronograma académico.\n\n` +
                        `📅 Te avisaré cada vez que inicie una nueva actividad.\n` +
                        `<i>ITSOMET — Sistema de Cronogramas</i>`
                    );
                }
            }
        }
    }
}

// ── Revisar actividades de hoy y notificar ─────────────────
export async function revisarYNotificar() {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().split('T')[0]; // "YYYY-MM-DD"

    const cronogramas = await obtenerCronogramas();

    for (const crono of cronogramas) {
        const estudiantes = crono.estudiantesVinculados ?? {};
        const actividades = crono.actividades ?? [];

        // Buscar actividades que inician HOY
        const actividadesHoy = actividades.filter(a => a.fechaInicio === hoyStr);
        if (actividadesHoy.length === 0) continue;

        // Notificar a cada estudiante con chatId registrado
        for (const [cedula, datos] of Object.entries(estudiantes)) {
            const chatId = datos.telegramChatId;
            const activas = datos.notificacionesActivas;
            if (!chatId || !activas) continue;

            const nombreEst = datos.nombres ?? datos.nombre ?? 'Estudiante';

            for (const act of actividadesHoy) {
                const mensaje =
                    `📌 <b>Nueva actividad hoy</b>\n\n` +
                    `Hola <b>${nombreEst}</b> 👋\n\n` +
                    `<b>${act.actividad}</b>\n\n` +
                    `📅 <b>Inicio:</b> ${formatFecha(act.fechaInicio)}\n` +
                    `🏁 <b>Fin:</b> ${formatFecha(act.fechaFin)}\n\n` +
                    `📋 Cronograma: <i>${crono.nombre}</i>\n` +
                    `<i>ITSOMET — Sistema de Cronogramas</i>`;

                await enviarMensajeTelegram(chatId, mensaje);
            }
        }
    }
}

// ── Helper fecha legible ───────────────────────────────────
function formatFecha(fecha) {
    if (!fecha) return '—';
    const d = new Date(fecha + 'T00:00:00');
    return d.toLocaleDateString('es-EC', {
        day: '2-digit', month: 'long', year: 'numeric'
    });
}

// ── Link de activación para el estudiante ─────────────────
// Genera el link que abre el bot con la cédula y cronogramaId precargados
// DESPUÉS — abre Telegram Web (funciona en PC y celular)
export function generarLinkActivacion(cedula, cronogramaId) {
    const payload = `${cedula}-${cronogramaId}`;
    return `https://t.me/${BOT_USERNAME}?start=${payload}`;
}