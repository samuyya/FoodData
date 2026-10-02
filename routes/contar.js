// lo que ve el celular que abre el link del inventario general: no necesita la
// sesion de la empresa, solo el codigo de 6 numeros. con eso SOLO puede contar
// (nada de menu, otros modulos ni plata)
const express = require('express');
const crypto = require('crypto');
const ConteoInventario = require('../models/ConteoInventario');
const ItemInventario = require('../models/ItemInventario');
const Empresa = require('../models/Empresa');
const { ah } = require('../middleware/sesion');
const { limiteContar } = require('../middleware/limites');
const { conteo: ops } = require('./inventario');

const router = express.Router();
const MAX_INTENTOS = 5;

async function buscar(token) {
  if (!token || typeof token !== 'string' || token.length > 64) return null;
  return ConteoInventario.findOne({ 'acceso.token': token });
}
// por que ya no sirve el link (null si sirve)
function noDisponible(c) {
  if (!c || !c.acceso || c.estado !== 'curso' || !(c.acceso.vence > new Date())) return 'cerrado';
  if (c.acceso.intentos >= MAX_INTENTOS) return 'bloqueado';
  return null;
}
// el celular ya entro con el codigo y nadie lo ha sacado
function sesionValida(req, c) {
  const s = req.session && req.session.invitado;
  if (!s || s.token !== c.acceso.token) return false;
  if (!s.nombre) return true;
  return c.acceso.conectados.some(x => x.sid === s.sid);
}

router.get('/:token', ah(async (req, res) => {
  const c = await buscar(req.params.token);
  const motivo = noDisponible(c);
  if (motivo) return res.json({ ok: true, disponible: false, motivo });
  const empresa = await Empresa.findById(c.empresa_id).select('nombre').lean();
  const s = req.session.invitado;
  let paso = 'codigo';
  if (s && s.token === c.acceso.token) paso = s.nombre ? (sesionValida(req, c) ? 'partes' : 'sacado') : 'nombre';
  res.json({ ok: true, disponible: true, empresa: empresa ? empresa.nombre : '', paso, nombre: s && s.token === c.acceso.token ? s.nombre : '' });
}));

router.post('/:token/entrar', limiteContar, ah(async (req, res) => {
  const c = await buscar(req.params.token);
  const motivo = noDisponible(c);
  if (motivo) return res.status(403).json({ ok: false, motivo, error: motivo === 'bloqueado' ? 'Acceso bloqueado' : 'Este link ya no está disponible' });
  const codigo = String(req.body.codigo || '').replace(/\D/g, '');
  const a = Buffer.from(codigo.padEnd(6, 'x')), b = Buffer.from(c.acceso.codigo);
  if (codigo.length !== 6 || !crypto.timingSafeEqual(a, b)) {
    c.acceso.intentos += 1;
    c.markModified('acceso');
    await c.save();
    const quedan = MAX_INTENTOS - c.acceso.intentos;
    if (quedan <= 0) return res.status(403).json({ ok: false, motivo: 'bloqueado', error: 'Acceso bloqueado' });
    return res.status(401).json({ ok: false, error: `Acceso denegado: el código no es correcto. Te quedan ${quedan} intento${quedan === 1 ? '' : 's'}.` });
  }
  req.session.invitado = { token: c.acceso.token, conteoId: String(c._id), nombre: '', sid: crypto.randomBytes(8).toString('hex') };
  res.json({ ok: true });
}));

router.post('/:token/nombre', ah(async (req, res) => {
  const c = await buscar(req.params.token);
  if (noDisponible(c) || !sesionValida(req, c)) return res.status(403).json({ ok: false, error: 'Este link ya no está disponible' });
  const nombre = String(req.body.nombre || '').trim().slice(0, 60);
  if (!nombre) return res.status(400).json({ ok: false, error: 'Escribe tu nombre.' });
  const s = req.session.invitado;
  s.nombre = nombre;
  c.acceso.conectados = c.acceso.conectados.filter(x => x.sid !== s.sid);
  c.acceso.conectados.push({ nombre, parte: '', sid: s.sid });
  c.markModified('acceso');
  await c.save();
  res.json({ ok: true });
}));

// a partir de aqui hay que haber entrado con codigo y nombre
async function dentro(req, res) {
  const c = await buscar(req.params.token);
  const motivo = noDisponible(c);
  if (motivo) { res.status(403).json({ ok: false, motivo, error: 'Este link ya no está disponible' }); return null; }
  if (!sesionValida(req, c) || !req.session.invitado.nombre) { res.status(401).json({ ok: false, motivo: 'sacado', error: 'Vuelve a entrar con el código.' }); return null; }
  return c;
}

router.get('/:token/conteo', ah(async (req, res) => {
  const c = await dentro(req, res); if (!c) return;
  const items = await ItemInventario.find({ empresa_id: c.empresa_id, activo: true, cuenta: true }).select('nombre cat u').sort({ nombre: 1 }).lean();
  res.json({
    ok: true,
    yo: req.session.invitado.nombre,
    items: items.map(i => ({ id: String(i._id), nombre: i.nombre, cat: i.cat, u: i.u })),
    conteo: ops.conteoPublico(c, false)
  });
}));
router.post('/:token/sumar', ah(async (req, res) => {
  const c = await dentro(req, res); if (!c) return;
  if (!(await ops.sumarCuenta(c._id, req.body.itemId, Number(req.body.valor)))) return res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
  res.json({ ok: true });
}));
router.post('/:token/parcial', ah(async (req, res) => {
  const c = await dentro(req, res); if (!c) return;
  const valor = req.body.valor === null ? null : Number(req.body.valor);
  if (!(await ops.cambiarParcial(c._id, req.body.itemId, Number(req.body.i), valor))) return res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
  res.json({ ok: true });
}));
// elegir una parte (o soltarla al terminar). al terminar queda el nombre en esa parte
router.post('/:token/parte', ah(async (req, res) => {
  const c = await dentro(req, res); if (!c) return;
  const s = req.session.invitado;
  const yo = c.acceso.conectados.find(x => x.sid === s.sid);
  // tambien al cambiar de parte sin tocar "Terminé" (ej. se cerro la app a mitad de conteo)
  if (yo && yo.parte) await ops.guardarParte(c, yo.parte, s.nombre, c.empresa_id);
  if (yo) yo.parte = req.body.terminar ? '' : String(req.body.parte || '').slice(0, 40);
  c.markModified('acceso');
  await c.save();
  res.json({ ok: true });
}));

module.exports = router;
