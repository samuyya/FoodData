// la logica del modulo: estados de vencimiento, cruce con recetas y lista de compras
const mongoose = require('mongoose');
const FsIngrediente = require('../modelos/FsIngrediente');
const FsCompra = require('../modelos/FsCompra');
const FsReceta = require('../modelos/FsReceta');
const FsAjuste = require('../modelos/FsAjuste');
const RECETAS_BASE = require('../datos/recetas-base');
const { DIAS_AVISO1, DIAS_AVISO2 } = require('../config');
const { hoyColombia, diasHasta } = require('../zona');
const { norm, coincide, esBasico } = require('./nombres');

async function getAjustes(empresaId) {
  const a = await FsAjuste.findOne({ empresa_id: empresaId }).lean();
  return { diasAviso1: a ? a.diasAviso1 : DIAS_AVISO1, diasAviso2: a ? a.diasAviso2 : DIAS_AVISO2 };
}

// vencido / urgente (aviso 2) / pronto (aviso 1) / bien / no perecedero
function estadoDe(item, ajustes, hoy = hoyColombia()) {
  if (!item.perecedero || !item.vence) return { estado: 'nv', dias: null };
  const dias = diasHasta(item.vence, hoy);
  let estado = 'bien';
  if (dias < 0) estado = 'venc';
  else if (dias <= ajustes.diasAviso2) estado = 'urg';
  else if (dias <= ajustes.diasAviso1) estado = 'pro';
  return { estado, dias };
}

function conEstado(items, ajustes, hoy) {
  return items.map(i => Object.assign({}, i, { id: String(i._id) }, estadoDe(i, ajustes, hoy)));
}

const PESO = { urg: 3, pro: 2 };

function evaluarReceta(receta, disponibles) {
  const ingredientes = receta.ingredientes.map(x => {
    if (esBasico(x.nombre)) return { nombre: x.nombre, opcional: x.opcional, ok: true };
    const h = disponibles.find(i => coincide(x.nombre, i.nombre));
    return {
      nombre: x.nombre, opcional: x.opcional, ok: !!h,
      itemId: h ? h.id : null, poco: !!(h && h.nivel === 'poco'), estado: h ? h.estado : null
    };
  });
  const faltan = ingredientes.filter(x => !x.ok && !x.opcional).map(x => x.nombre);
  let puntaje = 0;
  const usa = new Map();
  ingredientes.forEach(x => {
    const w = PESO[x.estado] || 0;
    if (!w) return;
    puntaje += w;
    const item = disponibles.find(i => i.id === x.itemId);
    usa.set(item.id, { id: item.id, nombre: item.nombre, dias: item.dias });
  });
  return {
    id: receta.id, nombre: receta.nombre, categoria: receta.categoria, porciones: receta.porciones,
    pasos: receta.pasos, propia: receta.propia, ingredientes, faltan, puntaje,
    aprovecha: [...usa.values()].sort((a, b) => a.dias - b.dias)
  };
}

const ordenRecetas = (a, b) => b.puntaje - a.puntaje || a.faltan.length - b.faltan.length || a.nombre.localeCompare(b.nombre, 'es');

function recetaPropiaPlana(r) {
  return { id: String(r._id), nombre: r.nombre, categoria: r.categoria, porciones: r.porciones, pasos: r.pasos, propia: true, ingredientes: r.ingredientes };
}

// lo mas urgente primero; los no perecederos al final
function ordenarDespensa(a, b) {
  const ka = a.dias === null ? Infinity : a.dias, kb = b.dias === null ? Infinity : b.dias;
  return ka - kb || a.nombre.localeCompare(b.nombre, 'es');
}

async function estadoCompleto(empresaId) {
  const hoy = hoyColombia();
  const [ajustes, items, compras, propias] = await Promise.all([
    getAjustes(empresaId),
    FsIngrediente.find({ empresa_id: empresaId, activo: true }).lean(),
    FsCompra.find({ empresa_id: empresaId }).sort({ hecho: 1, createdAt: -1 }).lean(),
    FsReceta.find({ empresa_id: empresaId }).sort({ nombre: 1 }).lean()
  ]);
  const ingredientes = conEstado(items, ajustes, hoy).sort(ordenarDespensa);
  const disponibles = ingredientes.filter(i => i.estado !== 'venc');
  const recetas = RECETAS_BASE.concat(propias.map(recetaPropiaPlana)).map(r => evaluarReceta(r, disponibles)).sort(ordenRecetas);
  const cuenta = e => ingredientes.filter(i => i.estado === e).length;
  const sugerencias = recetas.filter(r => r.puntaje > 0 && r.faltan.length <= 2)
    .sort((a, b) => (a.faltan.length > 0) - (b.faltan.length > 0) || ordenRecetas(a, b));
  return {
    hoy, ajustes, ingredientes, recetas,
    compras: compras.map(c => ({ id: String(c._id), nombre: c.nombre, origen: c.origen, hecho: c.hecho })),
    resumen: { urgentes: cuenta('urg'), pronto: cuenta('pro'), vencidos: cuenta('venc'), total: ingredientes.length },
    sugerencias: sugerencias.slice(0, 4).map(r => r.id)
  };
}

// agrega a la lista sin duplicar lo que ya esta pendiente. devuelve la compra creada o null
async function agregarCompra(empresaId, nombre, origen) {
  const pendientes = await FsCompra.find({ empresa_id: empresaId, hecho: false }).select('nombre').lean();
  if (pendientes.some(c => norm(c.nombre) === norm(nombre))) return null;
  const limpio = String(nombre).trim();
  return FsCompra.create({ empresa_id: empresaId, nombre: limpio.charAt(0).toUpperCase() + limpio.slice(1), origen });
}

async function quitarDeCompras(empresaId, nombre) {
  const pendientes = await FsCompra.find({ empresa_id: empresaId, hecho: false }).lean();
  const ids = pendientes.filter(c => norm(c.nombre) === norm(nombre)).map(c => c._id);
  if (ids.length) await FsCompra.deleteMany({ _id: { $in: ids } });
}

async function buscarReceta(empresaId, id) {
  const base = RECETAS_BASE.find(r => r.id === id);
  if (base) return base;
  if (!mongoose.isValidObjectId(id)) return null;
  const p = await FsReceta.findOne({ _id: id, empresa_id: empresaId }).lean();
  return p ? recetaPropiaPlana(p) : null;
}

async function borrarTodoDelHogar(empresaId) {
  const modelos = require('../modelos');
  await Promise.all(modelos.map(m => m.deleteMany({ empresa_id: empresaId })));
}

module.exports = {
  getAjustes, estadoDe, conEstado, evaluarReceta, estadoCompleto,
  agregarCompra, quitarDeCompras, buscarReceta, borrarTodoDelHogar
};
