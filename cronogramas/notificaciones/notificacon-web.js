// ── notificacion-web.js ────────────────────────────────────
// Bot de Telegram para notificaciones de actividades ITSQMET.
// Usa solo Telegram Bot API + Firebase Realtime Database.
// Compatible con plan Spark (sin Cloud Functions).
// ──────────────────────────────────────────────────────────

// DESPUÉS
import { obtenerCronogramas } from '../../Firebase/cronograma.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, update }
    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ── Configuración ──────────────────────────────────────────
const BOT_TOKEN    = '8604941459:AAFe0QUbqyFHTJnFW4bbEtznHkRluW2ECIw';
export const BOT_USERNAME = 'itsometcronogramas_bot';
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── Offset persistente (evita reprocesar updates viejos) ───
let lastUpdateId = 0;

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
        if (!data.ok) console.error('Telegram sendMessage error:', data);
        return data.ok;
    } catch (err) {
        console.error('Error enviando mensaje Telegram:', err);
        return false;
    }
}

// ── Guardar chatId en Firebase ─────────────────────────────
export async function guardarChatId(cronogramaId, cedula, chatId) {
    try {
        const app = getApp('cronogramas'); // ← misma app que usa cronograma.js
        const db  = getDatabase(app);      // ← ahora sí encuentra Firebase

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

// ── Obtener updates del bot ────────────────────────────────
async function obtenerUpdates() {
    try {
        const url = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=3&allowed_updates=["message"]`;
        const res  = await fetch(url);
        const data = await res.json();

        if (!data.ok) {
            console.error('Telegram getUpdates error:', data);
            return [];
        }

        return data.result ?? [];
    } catch (err) {
        console.error('Error obteniendo updates:', err);
        return [];
    }
}

// ── Procesar el /start del estudiante ─────────────────────
export async function procesarRegistros() {
    const updates = await obtenerUpdates();

    for (const update of updates) {

        // Actualizar offset para no reprocesar
        if (update.update_id >= lastUpdateId) {
            lastUpdateId = update.update_id;
        }

        const msg = update.message;
        if (!msg || !msg.text) continue;

        const texto  = msg.text.trim();
        const chatId = String(msg.chat.id);
        const nombre = msg.from?.first_name ?? 'Estudiante';

        console.log('📩 Mensaje recibido:', texto, '| chatId:', chatId);

if (texto.startsWith('/start')) {
    const payload = texto.replace('/start', '').trim();

    console.log('📦 Payload recibido:', payload);

    if (!payload) {
        await enviarMensajeTelegram(chatId,
            `👋 Hola <b>${nombre}</b>!\n\nPor favor accede al sistema para activar las notificaciones correctamente.`
        );
        continue;
    }

    // La cédula siempre son 10 dígitos, separar por eso
    // Formato: 1752222404-OuAUik_fumdsJv5ZDY_
    const match = payload.match(/^(\d{10})-(.+)$/);

    if (!match) {
        console.error('❌ Payload no tiene formato válido:', payload);
        await enviarMensajeTelegram(chatId,
            `❌ Link de activación inválido. Por favor accede al sistema nuevamente.`
        );
        continue;
    }

    const cedula       = match[1]; // exactamente 10 dígitos
    const cronogramaId = match[2]; // todo lo que sigue

    console.log('✅ Registrando:', { cedula, cronogramaId, chatId });

    const ok = await guardarChatId(cronogramaId, cedula, chatId);

    if (ok) {
        await enviarMensajeTelegram(chatId,
            `✅ <b>¡Listo, ${nombre}!</b>\n\n` +
            `Ya estás suscrito a las notificaciones de tu cronograma académico.\n\n` +
            `📅 Te avisaré cada vez que inicie una nueva actividad.\n\n` +
            `<i>ITSQMET — Sistema de Cronogramas</i>`
        );
        console.log('✅ chatId guardado en Firebase para cédula:', cedula);
    } else {
        console.error('❌ Error guardando chatId en Firebase');
        await enviarMensajeTelegram(chatId,
            `❌ Hubo un error al activar las notificaciones.\n` +
            `Por favor intenta de nuevo desde el sistema.`
        );
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
            const chatId  = datos.telegramChatId;
            const activas = datos.notificacionesActivas;
            if (!chatId || !activas) continue;

            const nombreEst = datos.nombres ?? datos.nombre ?? 'Estudiante';

            for (const act of actividadesHoy) {
                const mensaje =
                    `📌 <b>Nueva actividad hoy</b>\n\n` +
                    `Hola <b>${nombreEst}</b> 👋\n\n` +
                    `<b>${act.actividad}</b>\n\n` +
                    `📅 <b>Inicio:</b> ${formatFecha(act.fechaInicio)}\n` +
                    `🏁 <b>Fin:</b>    ${formatFecha(act.fechaFin)}\n\n` +
                    `📋 Cronograma: <i>${crono.nombre}</i>\n\n` +
                    `<i>ITSQMET — Sistema de Cronogramas</i>`;

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
export function generarLinkActivacion(cedula, cronogramaId) {
    const payload = `${cedula}-${cronogramaId}`;
    return `https://t.me/${BOT_USERNAME}?start=${payload}`;
}