// notificaciones al celular (Web Push) y la tarea diaria de las 7 am
const webpush = require('web-push');
const Empresa = require('../../../models/Empresa');
const FsIngrediente = require('../modelos/FsIngrediente');
const FsSuscripcion = require('../modelos/FsSuscripcion');
const { MODULO, NOMBRE_MODULO, RUTA_PAGINA } = require('../config');
const { getAjustes } = require('./despensa');
const { hoyColombia, diasHasta } = require('../zona');
const logger = require('../../../logger');

let configurado = null;
function disponible() {
  if (configurado !== null) return configurado;
  const pub = process.env.FOODSAVER_VAPID_PUBLICA, priv = process.env.FOODSAVER_VAPID_PRIVADA;
  if (!pub || !priv) { configurado = false; return false; }
  try {
    webpush.setVapidDetails(process.env.FOODSAVER_VAPID_CONTACTO || 'mailto:avisos@fooddata.me', pub, priv);
    configurado = true;
  } catch (err) {
    logger.warn(`avisos del hogar: las claves VAPID no sirven (${err.message})`);
    configurado = false;
  }
  return configurado;
}

const clavePublica = () => (disponible() ? process.env.FOODSAVER_VAPID_PUBLICA : null);

// manda a todos los telefonos del hogar. devuelve a cuantos llego.
// si el telefono ya no existe (404/410) se borra la suscripcion
async function enviarAHogar(empresaId, texto) {
  if (!disponible()) return 0;
  const subs = await FsSuscripcion.find({ empresa_id: empresaId }).lean();
  const carga = JSON.stringify({ titulo: NOMBRE_MODULO, texto, url: RUTA_PAGINA });
  let entregados = 0;
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.claves.p256dh, auth: s.claves.auth } }, carga, { TTL: 12 * 60 * 60 });
      entregados++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await FsSuscripcion.deleteOne({ _id: s._id });
      else logger.warn(`avisos del hogar: no se pudo enviar (${err.statusCode || err.message})`);
    }
  }));
  return entregados;
}

const lista = items => items.map(i => i.nombre.toLowerCase()).join(', ');

// lo que tocaria avisar hoy a un hogar, sin enviar nada (sirve tambien para las pruebas)
async function pendientesDeAviso(empresaId, hoy = hoyColombia()) {
  const ajustes = await getAjustes(empresaId);
  const items = await FsIngrediente.find({ empresa_id: empresaId, activo: true, perecedero: true, vence: { $ne: '' } }).lean();
  const dias = i => diasHasta(i.vence, hoy);
  const urgentes = items.filter(i => { const d = dias(i); return d >= 0 && d <= ajustes.diasAviso2 && !i.aviso2; });
  const pronto = items.filter(i => { const d = dias(i); return d > ajustes.diasAviso2 && d <= ajustes.diasAviso1 && !i.aviso1; });
  return { ajustes, urgentes, pronto };
}

function mensajes({ ajustes, urgentes, pronto }) {
  const m = [];
  if (urgentes.length) m.push((urgentes.length === 1 ? 'Úsalo ya: ' + lista(urgentes) + ' vence' : 'Úsalos ya: ' + lista(urgentes) + ' vencen') + ` en ${ajustes.diasAviso2} días o menos.`);
  if (pronto.length) m.push((pronto.length === 1 ? '1 producto vence' : `${pronto.length} productos vencen`) + ` en los próximos ${ajustes.diasAviso1} días: ${lista(pronto)}.`);
  return m;
}

// la llama la tarea programada una vez al dia. se puede repetir sin duplicar avisos
async function ejecutarAvisos(hoy = hoyColombia()) {
  const hogares = await Empresa.find({ oculta: true, modulosActivos: MODULO, activa: { $ne: false } }).select('_id').lean();
  let enviados = 0;
  for (const h of hogares) {
    const p = await pendientesDeAviso(h._id, hoy);
    const textos = mensajes(p);
    if (!textos.length) continue;
    let llego = 0;
    for (const t of textos) llego += await enviarAHogar(h._id, t);
    // solo se marcan si llego a algun telefono: si el hogar no tiene ninguno, se avisa cuando active uno
    if (!llego) continue;
    enviados += textos.length;
    if (p.urgentes.length) await FsIngrediente.updateMany({ _id: { $in: p.urgentes.map(i => i._id) } }, { $set: { aviso1: true, aviso2: true } });
    if (p.pronto.length) await FsIngrediente.updateMany({ _id: { $in: p.pronto.map(i => i._id) } }, { $set: { aviso1: true } });
  }
  return { hogares: hogares.length, enviados };
}

module.exports = { disponible, clavePublica, enviarAHogar, pendientesDeAviso, mensajes, ejecutarAvisos };
