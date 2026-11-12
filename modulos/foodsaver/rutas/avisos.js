// telefonos que reciben avisos y la tarea diaria
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const FsSuscripcion = require('../modelos/FsSuscripcion');
const { getHogarId, soloHogar } = require('../contexto');
const avisos = require('../servicios/avisos');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { ok: false, error: 'Demasiados intentos. Espera unos minutos.' } });

function tokenValido(req) {
  const esperado = process.env.FOODSAVER_AVISOS_TOKEN;
  const h = req.get('authorization') || '';
  const recibido = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!esperado || !recibido) return false;
  const a = crypto.createHash('sha256').update(esperado).digest(), b = crypto.createHash('sha256').update(recibido).digest();
  return crypto.timingSafeEqual(a, b);
}

// la llama GitHub Actions a las 7 am. no usa sesion: usa un token fijo
router.post('/ejecutar', limite, ah(async (req, res) => {
  if (!tokenValido(req)) return res.status(404).json({ ok: false, error: 'No encontrado' });
  const r = await avisos.ejecutarAvisos();
  res.json(Object.assign({ ok: true }, r));
}));

router.use(soloHogar);

router.get('/clave', (req, res) => {
  res.json({ ok: true, disponible: avisos.disponible(), publica: avisos.clavePublica() });
});

router.get('/dispositivos', ah(async (req, res) => {
  const subs = await FsSuscripcion.find({ empresa_id: getHogarId(req) }).sort({ createdAt: 1 }).lean();
  res.json({ ok: true, dispositivos: subs.map(s => ({ id: String(s._id), nombre: s.nombre, desde: s.createdAt })) });
}));

router.post('/suscribir', limite, ah(async (req, res) => {
  const s = req.body.suscripcion || {};
  const keys = s.keys || {};
  if (typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    return res.status(400).json({ ok: false, error: 'No pudimos registrar este teléfono. Intenta de nuevo.' });
  }
  const nombre = (typeof req.body.nombre === 'string' && req.body.nombre.trim().slice(0, 40)) || 'Teléfono';
  await FsSuscripcion.findOneAndUpdate(
    { endpoint: s.endpoint },
    { $set: { empresa_id: getHogarId(req), nombre, claves: { p256dh: keys.p256dh, auth: keys.auth }, agente: String(req.get('user-agent') || '').slice(0, 300) } },
    { upsert: true }
  );
  res.json({ ok: true });
}));

router.delete('/dispositivos/:id', ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Ese teléfono ya no estaba.' });
  await FsSuscripcion.deleteOne({ _id: req.params.id, empresa_id: getHogarId(req) });
  res.json({ ok: true });
}));

// manda un aviso de prueba a los telefonos del hogar
router.post('/prueba', limite, ah(async (req, res) => {
  if (!avisos.disponible()) return res.status(503).json({ ok: false, error: 'Los avisos todavía no están configurados en el servidor.' });
  const n = await avisos.enviarAHogar(getHogarId(req), 'Así te llegarán los avisos cuando algo esté por vencer.');
  if (!n) return res.status(409).json({ ok: false, error: 'No hay ningún teléfono con avisos activos.' });
  res.json({ ok: true, entregados: n });
}));

module.exports = router;
