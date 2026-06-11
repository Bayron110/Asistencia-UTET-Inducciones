// ── notificacion-web.js ────────────────────────────────────
// Bot de Telegram para notificaciones de actividades ITSQMET.
// Usa solo Telegram Bot API + Firebase Realtime Database.
// Compatible con plan Spark (sin Cloud Functions).
// ──────────────────────────────────────────────────────────

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

// ── Guardar chatId para ESTUDIANTE ────────────────────────
// Escribe en: cronogramas/{cronogramaId}/estudiantesVinculados/{cedula}
export async function guardarChatId(cronogramaId, cedula, chatId) {
    try {
        const app = getApp('cronogramas');
        const db  = getDatabase(app);
        await update(
            ref(db, `cronogramas/${cronogramaId}/estudiantesVinculados/${cedula}`),
            { telegramChatId: chatId, notificacionesActivas: true }
        );
        return true;
    } catch (err) {
        console.error('Error guardando chatId estudiante:', err);
        return false;
    }
}

// ── Guardar chatId para DOCENTE ───────────────────────────
// Escribe en: cronogramas/{cronogramaId}/docentesVinculados/{cedula}
// Y también en /docentes/{cedula} para que persista independiente
async function guardarChatIdDocente(cronogramaId, cedula, chatId) {
    try {
        const app = getApp('cronogramas');
        const db  = getDatabase(app);

        const payload = { telegramChatId: chatId, notificacionesActivas: true };

        // 1. Actualizar referencia dentro del cronograma
        await update(
            ref(db, `cronogramas/${cronogramaId}/docentesVinculados/${cedula}`),
            payload
        );

        // 2. Actualizar datos maestros del docente en /docentes/{cedula}
        //    (persiste aunque el cronograma sea borrado)
        await update(
            ref(db, `docentes/${cedula}`),
            payload
        );

        return true;
    } catch (err) {
        console.error('Error guardando chatId docente:', err);
        return false;
    }
}

// ── Obtener updates del bot ────────────────────────────────
async function obtenerUpdates() {
    try {
        const url  = `${TELEGRAM_API}/getUpdates?offset=${lastUpdateId + 1}&timeout=3&allowed_updates=["message"]`;
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

// ── Procesar /start de estudiante o docente ────────────────
//
// Formatos de payload:
//   Estudiante : 1752222404-OuAUik_fumdsJv5ZDY_
//   Docente    : DOC-1752222404-OuAUik_fumdsJv5ZDY_
//
export async function procesarRegistros() {
    const updates = await obtenerUpdates();

    for (const upd of updates) {

        if (upd.update_id >= lastUpdateId) {
            lastUpdateId = upd.update_id;
        }

        const msg = upd.message;
        if (!msg || !msg.text) continue;

        const texto  = msg.text.trim();
        const chatId = String(msg.chat.id);
        const nombre = msg.from?.first_name ?? 'Usuario';

        console.log('📩 Mensaje recibido:', texto, '| chatId:', chatId);

        if (!texto.startsWith('/start')) continue;

        const payload = texto.replace('/start', '').trim();
        console.log('📦 Payload recibido:', payload);

        if (!payload) {
            await enviarMensajeTelegram(chatId,
                `👋 Hola <b>${nombre}</b>!\n\nPor favor accede al sistema para activar las notificaciones correctamente.`
            );
            continue;
        }

        // ── ¿Es docente? ──────────────────────────────────
        const esDocente = payload.startsWith('DOC-');

        if (esDocente) {
            // Formato: DOC-{cedula10digitos}-{cronogramaId}
            const sinPrefijo = payload.slice(4); // quitar "DOC-"
            const matchDoc   = sinPrefijo.match(/^(\d{10})-(.+)$/);

            if (!matchDoc) {
                console.error('❌ Payload docente inválido:', payload);
                await enviarMensajeTelegram(chatId,
                    `❌ Link de activación inválido. Por favor accede al sistema nuevamente.`
                );
                continue;
            }

            const cedula       = matchDoc[1];
            const cronogramaId = matchDoc[2];

            console.log('👨‍🏫 Registrando docente:', { cedula, cronogramaId, chatId });

            const ok = await guardarChatIdDocente(cronogramaId, cedula, chatId);

            if (ok) {
                await enviarMensajeTelegram(chatId,
                    `✅ <b>¡Listo, ${nombre}!</b>\n\n` +
                    `Ya estás suscrito a las notificaciones de tus cronogramas académicos.\n\n` +
                    `📅 Te avisaré cada vez que inicie una nueva actividad.\n\n` +
                    `<i>ITSOMET — Sistema de Cronogramas</i>`
                );
                console.log('✅ chatId docente guardado para cédula:', cedula);
            } else {
                await enviarMensajeTelegram(chatId,
                    `❌ Hubo un error al activar las notificaciones.\n` +
                    `Por favor intenta de nuevo desde el sistema.`
                );
            }

        } else {
            // ── Estudiante ────────────────────────────────
            // Formato: {cedula10digitos}-{cronogramaId}
            const matchEst = payload.match(/^(\d{10})-(.+)$/);

            if (!matchEst) {
                console.error('❌ Payload estudiante inválido:', payload);
                await enviarMensajeTelegram(chatId,
                    `❌ Link de activación inválido. Por favor accede al sistema nuevamente.`
                );
                continue;
            }

            const cedula       = matchEst[1];
            const cronogramaId = matchEst[2];

            console.log('🎓 Registrando estudiante:', { cedula, cronogramaId, chatId });

            const ok = await guardarChatId(cronogramaId, cedula, chatId);

            if (ok) {
                await enviarMensajeTelegram(chatId,
                    `✅ <b>¡Listo, ${nombre}!</b>\n\n` +
                    `Ya estás suscrito a las notificaciones de tu cronograma académico.\n\n` +
                    `📅 Te avisaré cada vez que inicie una nueva actividad.\n\n` +
                    `<i>ITSOMET — Sistema de Cronogramas</i>`
                );
                console.log('✅ chatId estudiante guardado para cédula:', cedula);
            } else {
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
    const hoy    = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyStr = hoy.toISOString().split('T')[0];

    const cronogramas = await obtenerCronogramas();

    for (const crono of cronogramas) {
        const actividades    = crono.actividades ?? [];
        const actividadesHoy = actividades.filter(a => a.fechaInicio === hoyStr);
        if (actividadesHoy.length === 0) continue;

        // Notificar estudiantes
        const estudiantes = crono.estudiantesVinculados ?? {};
        for (const [, datos] of Object.entries(estudiantes)) {
            if (!datos.telegramChatId || !datos.notificacionesActivas) continue;
            const nombreDest = datos.nombres ?? datos.nombre ?? 'Estudiante';
            for (const act of actividadesHoy) {
                await enviarMensajeTelegram(datos.telegramChatId,
                    mensajeActividad(nombreDest, act, crono.nombre)
                );
            }
        }

        // Notificar docentes vinculados a este cronograma
        const docentes = crono.docentesVinculados ?? {};
        for (const [, datos] of Object.entries(docentes)) {
            if (!datos.telegramChatId || !datos.notificacionesActivas) continue;
            const nombreDest = datos.nombres ?? datos.nombre ?? 'Docente';
            for (const act of actividadesHoy) {
                await enviarMensajeTelegram(datos.telegramChatId,
                    mensajeActividad(nombreDest, act, crono.nombre)
                );
            }
        }
    }
}

// ── Plantilla de mensaje de actividad ─────────────────────
function mensajeActividad(nombre, act, cronogramaNombre) {
    return (
        `📌 <b>Nueva actividad hoy</b>\n\n` +
        `Hola <b>${nombre}</b> 👋\n\n` +
        `<b>${act.actividad}</b>\n\n` +
        `📅 <b>Inicio:</b> ${formatFecha(act.fechaInicio)}\n` +
        `🏁 <b>Fin:</b>    ${formatFecha(act.fechaFin)}\n\n` +
        `📋 Cronograma: <i>${cronogramaNombre ?? ''}</i>\n\n` +
        `<i>ITSOMET — Sistema de Cronogramas</i>`
    );
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
    return `https://t.me/${BOT_USERNAME}?start=${cedula}-${cronogramaId}`;
}

// ── Link de activación para el docente ────────────────────
export function generarLinkActivacionDocente(cedula, cronogramaId) {
    return `https://t.me/${BOT_USERNAME}?start=DOC-${cedula}-${cronogramaId}`;
}