// todo lo que hace el hogar: despensa, compras, recetas propias y ajustes
const express = require('express');
const mongoose = require('mongoose');
const FsIngrediente = require('../modelos/FsIngrediente');
const FsCompra = require('../modelos/FsCompra');
const FsReceta = require('../modelos/FsReceta');
const FsAjuste = require('../modelos/FsAjuste');
const { UNIDADES, UBICACIONES, CATEGORIAS_RECETA } = require('../config');
const { getHogarId } = require('../contexto');
const { esFechaValida } = require('../zona');
const { norm, CATALOGO } = require('../servicios/nombres');
const D = require('../servicios/despensa');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const malo = (res, error, codigo = 400) => res.status(codigo).json({ ok: false, error });
const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const idValido = id => mongoose.isValidObjectId(id);

async function ingredienteDelHogar(req) {
  if (!idValido(req.params.id)) return null;
  return FsIngrediente.findOne({ _id: req.params.id, empresa_id: getHogarId(req) });
}

// la unica validacion de un ingrediente. devuelve { error } o { datos }
function validarIngrediente(b) {
  const nombre = texto(b.nombre, 60);
  if (!nombre) return { error: 'Escribe el nombre del producto.' };
  const crudo = String(b.cantidad === undefined || b.cantidad === null ? '' : b.cantidad).trim().replace(',', '.');
  const cantidad = Number(crudo);
  if (!crudo || !Number.isFinite(cantidad) || cantidad <= 0) return { error: 'La cantidad debe ser un número mayor que cero.' };
  if (cantidad > 100000) return { error: 'Esa cantidad es demasiado grande. Revísala.' };
  const unidad = UNIDADES.includes(b.unidad) ? b.unidad : 'und';
  const ubicacion = UBICACIONES.includes(b.ubicacion) ? b.ubicacion : 'nevera';
  const perecedero = b.perecedero !== false && b.perecedero !== 'false';
  const vence = perecedero ? texto(b.vence, 10) : '';
  if (perecedero && !vence) return { error: 'Indica la fecha de vencimiento o marca "No perecedero".' };
  if (perecedero && !esFechaValida(vence)) return { error: 'Esa fecha no es válida.' };
  return { datos: { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), cantidad, unidad, ubicacion, perecedero, vence } };
}

router.get('/estado', ah(async (req, res) => {
  res.json(Object.assign({ ok: true }, await D.estadoCompleto(getHogarId(req))));
}));

router.get('/catalogo', (req, res) => {
  res.json({ ok: true, ingredientes: CATALOGO.map(c => ({ nombre: c.nombre, perecedero: c.perecedero, ubicacion: c.ubicacion })), unidades: UNIDADES, ubicaciones: UBICACIONES, categorias: CATEGORIAS_RECETA });
});

// la insignia del boton en el menu principal
router.get('/insignia', ah(async (req, res) => {
  const e = await D.estadoCompleto(getHogarId(req));
  const n = e.resumen.urgentes + e.resumen.pronto;
  if (n) return res.json({ ok: true, texto: n === 1 ? '1 producto vence pronto' : `${n} productos vencen pronto`, tipo: 'aviso' });
  if (e.resumen.vencidos) return res.json({ ok: true, texto: e.resumen.vencidos === 1 ? '1 producto vencido' : `${e.resumen.vencidos} productos vencidos`, tipo: 'aviso' });
  res.json({ ok: true, texto: '✓ Todo en orden', tipo: 'ok' });
}));

router.post('/ingredientes', ah(async (req, res) => {
  const { error, datos } = validarIngrediente(req.body);
  if (error) return malo(res, error);
  const empresaId = getHogarId(req);
  const item = await FsIngrediente.create(Object.assign({ empresa_id: empresaId }, datos));
  // si venia de la lista de compras, se tacha alla
  if (req.body.compraId && idValido(req.body.compraId)) {
    await FsCompra.updateOne({ _id: req.body.compraId, empresa_id: empresaId }, { $set: { hecho: true } });
  }
  res.status(201).json({ ok: true, id: String(item._id) });
}));

router.put('/ingredientes/:id', ah(async (req, res) => {
  const item = await ingredienteDelHogar(req);
  if (!item) return malo(res, 'Ese producto ya no está en la despensa.', 404);
  const { error, datos } = validarIngrediente(req.body);
  if (error) return malo(res, error);
  // si cambio la fecha, los avisos vuelven a salir para la fecha nueva
  if (datos.vence !== item.vence) Object.assign(datos, { aviso1: false, aviso2: false });
  Object.assign(item, datos);
  await item.save();
  res.json({ ok: true });
}));

router.delete('/ingredientes/:id', ah(async (req, res) => {
  const item = await ingredienteDelHogar(req);
  if (!item) return malo(res, 'Ese producto ya no está en la despensa.', 404);
  await item.deleteOne();
  res.json({ ok: true });
}));

// acciones de un toque. devuelven lo necesario para deshacer
router.post('/ingredientes/:id/:accion(poco|acabado|botado|recomprado|restaurar)', ah(async (req, res) => {
  const item = await ingredienteDelHogar(req);
  if (!item) return malo(res, 'Ese producto ya no está en la despensa.', 404);
  const empresaId = getHogarId(req);
  const antes = { nivel: item.nivel, activo: item.activo, motivo: item.motivo };
  let compra = null;

  switch (req.params.accion) {
    case 'poco':
      item.nivel = 'poco';
      compra = await D.agregarCompra(empresaId, item.nombre, 'Queda poco');
      break;
    case 'acabado':
      Object.assign(item, { activo: false, motivo: 'acabado', archivadoEn: new Date() });
      compra = await D.agregarCompra(empresaId, item.nombre, 'Se acabó');
      break;
    case 'botado':
      Object.assign(item, { activo: false, motivo: 'botado', archivadoEn: new Date() });
      break;
    case 'recomprado': {
      if (item.perecedero) {
        const vence = texto(req.body.vence, 10);
        if (!vence) return malo(res, 'Indica la nueva fecha de vencimiento.');
        if (!esFechaValida(vence)) return malo(res, 'Esa fecha no es válida.');
        item.vence = vence;
      }
      Object.assign(item, { nivel: 'lleno', activo: true, motivo: '', archivadoEn: null, aviso1: false, aviso2: false });
      await D.quitarDeCompras(empresaId, item.nombre);
      break;
    }
    case 'restaurar': {
      const nivel = req.body.nivel === 'poco' ? 'poco' : 'lleno';
      Object.assign(item, { nivel, activo: req.body.activo !== false, motivo: req.body.activo === false ? item.motivo : '', archivadoEn: req.body.activo === false ? item.archivadoEn : null });
      if (req.body.compraId && idValido(req.body.compraId)) await FsCompra.deleteOne({ _id: req.body.compraId, empresa_id: empresaId });
      break;
    }
  }
  await item.save();
  res.json({ ok: true, antes, compraId: compra ? String(compra._id) : null });
}));

// "¿se acabó algo al cocinar?": varios de una vez
router.post('/acabados', ah(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(idValido).slice(0, 50);
  if (!ids.length) return malo(res, 'Marca al menos un producto.');
  const empresaId = getHogarId(req);
  const items = await FsIngrediente.find({ _id: { $in: ids }, empresa_id: empresaId, activo: true });
  for (const i of items) {
    Object.assign(i, { activo: false, motivo: 'acabado', archivadoEn: new Date() });
    await i.save();
    await D.agregarCompra(empresaId, i.nombre, 'Se acabó');
  }
  res.json({ ok: true, cantidad: items.length });
}));

// compras
router.post('/compras', ah(async (req, res) => {
  const nombre = texto(req.body.nombre, 60);
  if (!nombre) return malo(res, 'Escribe qué hace falta comprar.');
  const c = await D.agregarCompra(getHogarId(req), nombre, 'Agregado a mano');
  if (!c) return malo(res, 'Eso ya está en la lista.', 409);
  res.status(201).json({ ok: true, id: String(c._id) });
}));

router.put('/compras/:id', ah(async (req, res) => {
  if (!idValido(req.params.id)) return malo(res, 'No encontramos ese producto en la lista.', 404);
  const r = await FsCompra.updateOne({ _id: req.params.id, empresa_id: getHogarId(req) }, { $set: { hecho: req.body.hecho === true } });
  if (!r.matchedCount) return malo(res, 'No encontramos ese producto en la lista.', 404);
  res.json({ ok: true });
}));

router.delete('/compras/:id', ah(async (req, res) => {
  if (!idValido(req.params.id)) return malo(res, 'No encontramos ese producto en la lista.', 404);
  const c = await FsCompra.findOneAndDelete({ _id: req.params.id, empresa_id: getHogarId(req) }).lean();
  if (!c) return malo(res, 'No encontramos ese producto en la lista.', 404);
  res.json({ ok: true, compra: { nombre: c.nombre, origen: c.origen, hecho: c.hecho } });
}));

// para deshacer un "Quitar"
router.post('/compras/restaurar', ah(async (req, res) => {
  const nombre = texto(req.body.nombre, 60);
  if (!nombre) return malo(res, 'Falta el nombre.');
  await FsCompra.create({ empresa_id: getHogarId(req), nombre, origen: texto(req.body.origen, 80) || 'Agregado a mano', hecho: req.body.hecho === true });
  res.json({ ok: true });
}));

router.post('/compras/limpiar', ah(async (req, res) => {
  const r = await FsCompra.deleteMany({ empresa_id: getHogarId(req), hecho: true });
  res.json({ ok: true, borradas: r.deletedCount });
}));

// recetas
router.post('/recetas/:id/faltantes', ah(async (req, res) => {
  const empresaId = getHogarId(req);
  const receta = await D.buscarReceta(empresaId, req.params.id);
  if (!receta) return malo(res, 'No encontramos esa receta.', 404);
  const e = await D.estadoCompleto(empresaId);
  const evaluada = e.recetas.find(r => r.id === receta.id);
  let n = 0;
  for (const f of evaluada.faltan) if (await D.agregarCompra(empresaId, f, 'Para: ' + receta.nombre)) n++;
  res.json({ ok: true, agregados: n });
}));

function validarReceta(b, existentes) {
  const nombre = texto(b.nombre, 80);
  if (!nombre) return { error: 'Escribe el nombre de la receta.' };
  if (existentes.some(n => norm(n) === norm(nombre))) return { error: 'Ya hay una receta con ese nombre.' };
  const categoria = CATEGORIAS_RECETA.includes(b.categoria) ? b.categoria : 'Plato';
  const ingredientes = (Array.isArray(b.ingredientes) ? b.ingredientes : [])
    .map(x => ({ nombre: texto(x && x.nombre, 60), opcional: !!(x && x.opcional) }))
    .filter(x => x.nombre).slice(0, 40);
  if (!ingredientes.length) return { error: 'Agrega al menos un ingrediente.' };
  const pasos = (Array.isArray(b.pasos) ? b.pasos : []).map(p => texto(p, 400)).filter(Boolean).slice(0, 30);
  if (!pasos.length) return { error: 'Escribe al menos un paso.' };
  const porciones = Number(b.porciones);
  if (!Number.isInteger(porciones) || porciones < 1 || porciones > 50) return { error: 'Las porciones deben ser un número entero entre 1 y 50.' };
  return { datos: { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), categoria, ingredientes, pasos, porciones } };
}

router.post('/recetas', ah(async (req, res) => {
  const empresaId = getHogarId(req);
  const propias = await FsReceta.find({ empresa_id: empresaId }).select('nombre').lean();
  const existentes = require('../datos/recetas-base').map(r => r.nombre).concat(propias.map(r => r.nombre));
  const { error, datos } = validarReceta(req.body, existentes);
  if (error) return malo(res, error);
  const r = await FsReceta.create(Object.assign({ empresa_id: empresaId }, datos));
  res.status(201).json({ ok: true, id: String(r._id) });
}));

router.delete('/recetas/:id', ah(async (req, res) => {
  if (!idValido(req.params.id)) return malo(res, 'Solo se pueden borrar las recetas de la familia.', 404);
  const r = await FsReceta.deleteOne({ _id: req.params.id, empresa_id: getHogarId(req) });
  if (!r.deletedCount) return malo(res, 'Solo se pueden borrar las recetas de la familia.', 404);
  res.json({ ok: true });
}));

// ajustes de avisos
router.put('/ajustes', ah(async (req, res) => {
  const a1 = Number(req.body.diasAviso1), a2 = Number(req.body.diasAviso2);
  if (!Number.isInteger(a1) || !Number.isInteger(a2) || a2 < 0) return malo(res, 'Escribe los días con números enteros.');
  if (a1 <= a2) return malo(res, 'El primer aviso debe llegar con más días de anticipación que el segundo.');
  if (a1 > 30) return malo(res, 'El primer aviso puede ser máximo 30 días antes.');
  const empresaId = getHogarId(req);
  await FsAjuste.updateOne({ empresa_id: empresaId }, { $set: { diasAviso1: a1, diasAviso2: a2 } }, { upsert: true });
  // con dias nuevos, los avisos se recalculan desde cero
  await FsIngrediente.updateMany({ empresa_id: empresaId }, { $set: { aviso1: false, aviso2: false } });
  res.json({ ok: true });
}));

module.exports = router;
