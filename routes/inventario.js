const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const qrcode = require('qrcode-generator');
const ItemInventario = require('../models/ItemInventario');
const MovInventario = require('../models/MovInventario');
const ConteoInventario = require('../models/ConteoInventario');
const VentaDia = require('../models/VentaDia');
const Empresa = require('../models/Empresa');
const { ah } = require('../middleware/sesion');
const { adminInventarioActivo } = require('./admin');
const { guardarFotoInventario, obtenerFotoInventario } = require('../servicios/almacenamiento');
const inv = require('../servicios/inventario');
const { excelReporte } = require('../servicios/excelInventario');
const logger = require('../logger');

const router = express.Router();
const { CATEGORIAS, UNIDADES } = ItemInventario;
const MOTIVOS = {
  'Materia prima': ['Vencido', 'Dañado', 'Mal almacenado', 'Cadena de frío', 'Contaminado', 'Otro'],
  'Bebidas': ['Vencido', 'Dañado', 'Roto', 'Mal almacenado', 'Otro'],
  'Insumos': ['Vencido', 'Dañado', 'Otro'],
  'Menaje': ['Roto', 'Desgaste', 'Extraviado', 'Robo', 'Otro'],
  'Mobiliario': ['Roto', 'Desgaste', 'Extraviado', 'Robo', 'Otro'],
  'Otros gastos': ['Dañado', 'Extraviado', 'Otro'],
  'Empaques': ['Dañado', 'Mojado', 'Extraviado', 'Otro']
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const mimeOk = (file.mimetype || '').toLowerCase().startsWith('image/');
    cb(null, extOk && mimeOk);
  }
});

const texto = (v, max = 120) => String(v == null ? '' : v).trim().slice(0, max);
const numero = v => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(f || '');

// la empresa de la sesion. el superadmin puede trabajar la lista de una empresa
// (cargarle la plantilla) pasando ?empresa=
function empresaDe(req) {
  if (req.session.empresa) return req.session.empresa.id;
  if (req.session.superadmin) {
    const id = req.query.empresa || (req.body && req.body.empresa);
    if (mongoose.isValidObjectId(id)) return id;
  }
  return null;
}
const esAdmin = req => !!(req.session.superadmin || adminInventarioActivo(req));
// con .lean() mongoose no pone los defaults, asi que van aqui (empresas de antes del food cost)
const metasDe = e => ({ comida: 32, bebidas: 25, ...((e && e.metasFoodCost) || {}) });
const ajustesFC = e => ({ modo: (e && e.foodCost && e.foodCost.modo) || 'diario', empaques: !(e && e.foodCost && e.foodCost.empaques === false) });

function soloEmpresa(req, res, next) {
  if (!empresaDe(req)) return res.status(401).json({ ok: false, error: 'No autenticado' });
  next();
}
function soloAdmin(req, res, next) {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'Esto necesita la clave de administrador', pideClave: true });
  next();
}

function itemPublico(it, movsItem) {
  const cons = !!inv.CONSUMIBLE[it.cat];
  const ult = movsItem.filter(m => m.tipo === 'ing').slice(-1)[0];
  return {
    id: String(it._id), nombre: it.nombre, cat: it.cat, u: it.u, precio: it.precio, precioBase: it.precioBase,
    pres: it.pres, cuenta: it.cuenta, costoDe: it.costoDe || null, conteo: it.conteo, conteoFecha: it.conteoFecha, contadoPor: it.contadoPor,
    // sin un conteo aprobado todavia no hay con que comparar
    deberia: cons || !it.conteoFecha ? null : inv.existencia(it, movsItem),
    ultimaCompra: ult ? { precio: Math.round(ult.costo / ult.cant), fecha: ult.fecha } : null
  };
}
function movPublico(m, it) {
  return {
    nombre: it ? it.nombre : '', cat: it ? it.cat : '', u: it ? it.u : '', cuenta: it ? it.cuenta : true,
    id: String(m._id), tipo: m.tipo, fecha: m.fecha, itemId: String(m.item_id), cant: m.cant, compra: m.compra,
    costo: m.costo, prov: m.prov, factura: m.factura, motivo: m.motivo, motivoOtro: m.motivoOtro, obs: m.obs,
    por: m.por, foto: !!m.foto, corregidoPor: m.cambios && m.cambios.length ? m.cambios[m.cambios.length - 1].por : ''
  };
}
function conteoPublico(c, admin) {
  if (!c) return null;
  const acceso = c.acceso && c.acceso.vence > new Date() ? c.acceso : null;
  return {
    id: String(c._id), estado: c.estado, mesCierre: c.mesCierre, mesNombre: inv.nombreMes(c.mesCierre),
    cuentas: Object.fromEntries(c.cuentas instanceof Map ? c.cuentas : Object.entries(c.cuentas || {})),
    por: Object.fromEntries(c.por instanceof Map ? c.por : Object.entries(c.por || {})),
    nota: c.nota,
    acceso: acceso ? (admin
      ? { codigo: acceso.codigo, token: acceso.token, vence: acceso.vence, conectados: acceso.conectados, bloqueado: acceso.intentos >= 5 }
      : { activo: true, conectados: acceso.conectados.map(x => ({ nombre: x.nombre, parte: x.parte })) }) : null
  };
}

async function conteoActual(empresaId) {
  return ConteoInventario.findOne({ empresa_id: empresaId, estado: { $in: ['curso', 'enviado'] } });
}

// todo lo que necesita la pantalla en una sola llamada (tambien se usa para refrescar
// mientras varias personas cuentan al tiempo)
router.get('/estado', soloEmpresa, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const admin = esAdmin(req);
  const [datos, conteo, aprobados, empresa] = await Promise.all([
    inv.cargar(empresaId), conteoActual(empresaId), inv.cierresAprobados(empresaId),
    Empresa.findById(empresaId).select('metasFoodCost foodCost').lean()
  ]);
  const hoy = inv.hoyStr();
  const faltanVentas = await inv.ventasFaltan(empresaId, ajustesFC(empresa));
  const items = datos.items.filter(i => i.activo).map(i => itemPublico(i, datos.porItem.get(String(i._id)) || []));
  const itemsMap = new Map(datos.items.map(i => [String(i._id), i]));
  // al reves primero: entre los del mismo dia queda arriba el ultimo que se registro
  const ultimos = tipo => datos.movs.filter(m => m.tipo === tipo).reverse().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 8).map(m => movPublico(m, itemsMap.get(String(m.item_id))));
  const deHoy = tipo => datos.movs.filter(m => m.tipo === tipo && m.fecha === hoy);
  const ultimo = aprobados[0] || null;
  // se sugiere el inventario general del mes que termino (desde el dia 1), mientras no se haya hecho
  const mesSugerido = inv.mesAnterior(hoy.slice(0, 7));
  const hecho = aprobados.some(c => c.mesCierre === mesSugerido);
  res.json({
    ok: true, hoy, admin, adminNombre: adminInventarioActivo(req) || '',
    categorias: CATEGORIAS, unidades: UNIDADES, motivos: MOTIVOS, consumibles: Object.keys(inv.CONSUMIBLE),
    items,
    ingresos: ultimos('ing'), bajas: ultimos('baja'),
    hoyIngresos: { n: deHoy('ing').length, total: deHoy('ing').reduce((a, m) => a + m.costo, 0) },
    hoyBajas: { n: deHoy('baja').length, total: deHoy('baja').reduce((a, m) => a + m.costo, 0) },
    conteo: conteoPublico(conteo, admin),
    ultimoAprobado: ultimo ? { id: String(ultimo._id), fecha: ultimo.fechaAprobado, mes: inv.nombreMes(ultimo.mesCierre), mesCierre: ultimo.mesCierre } : null,
    sugerido: !hecho && !conteo ? { mes: inv.nombreMes(mesSugerido), clave: mesSugerido } : null,
    faltanVentas
  });
}));

// lo minimo para el menu principal
router.get('/resumen-menu', soloEmpresa, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const hoy = inv.hoyStr();
  const mesSugerido = inv.mesAnterior(hoy.slice(0, 7));
  const [conteo, hecho] = await Promise.all([
    conteoActual(empresaId),
    ConteoInventario.exists({ empresa_id: empresaId, estado: 'aprobado', mesCierre: mesSugerido })
  ]);
  res.json({
    ok: true,
    enviado: !!(conteo && conteo.estado === 'enviado'),
    enCurso: !!conteo,
    sugerido: !hecho && !conteo ? { mes: inv.nombreMes(mesSugerido), clave: mesSugerido } : null
  });
}));

// ingresos y bajas
router.post('/movimientos', soloEmpresa, upload.single('foto'), ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const b = req.body;
  const tipo = b.tipo === 'baja' ? 'baja' : 'ing';
  const hoy = inv.hoyStr();
  const fecha = esFecha(b.fecha) ? b.fecha : hoy;
  if (fecha > hoy) return res.status(400).json({ ok: false, error: 'La fecha no puede ser de un día que todavía no ha pasado.' });
  const nombre = texto(b.producto, 80);
  if (!nombre) return res.status(400).json({ ok: false, error: 'Escribe el producto.' });
  const cant = numero(b.cantidad), costo = Math.round(numero(b.costo));
  if (!(cant > 0)) return res.status(400).json({ ok: false, error: 'Escribe una cantidad mayor que cero.' });
  if (!(costo > 0)) return res.status(400).json({ ok: false, error: tipo === 'ing' ? 'Escribe el costo total.' : 'Escribe el costo de la pérdida.' });
  const por = texto(b.por, 60);
  if (!por) return res.status(400).json({ ok: false, error: 'Escribe quién registra.' });

  const activos = await ItemInventario.find({ empresa_id: empresaId, activo: true });
  let item = activos.find(i => i.nombre.toLowerCase() === nombre.toLowerCase());
  let nuevo = false;
  if (!item) {
    if (tipo === 'baja') return res.status(400).json({ ok: false, error: 'Ese producto no está registrado. Revisa el nombre.' });
    if (!CATEGORIAS.includes(b.cat)) return res.status(400).json({ ok: false, error: 'Toca qué es: materia prima, bebidas, menaje, mobiliario, insumos u otros gastos.' });
    if (!UNIDADES.includes(b.u)) return res.status(400).json({ ok: false, error: 'Elige la unidad.' });
    item = await ItemInventario.create({ empresa_id: empresaId, nombre, cat: b.cat, u: b.u, cuenta: null, precioBase: Math.round(costo / cant), precio: Math.round(costo / cant) });
    nuevo = true;
  }

  let motivo = '', motivoOtro = '';
  if (tipo === 'baja') {
    motivo = texto(b.motivo, 40);
    if (!MOTIVOS[item.cat].includes(motivo)) return res.status(400).json({ ok: false, error: 'Elige el motivo de la baja.' });
    motivoOtro = motivo === 'Otro' ? texto(b.motivoOtro, 120) : '';
    if (motivo === 'Otro' && !motivoOtro) return res.status(400).json({ ok: false, error: 'Escribe cuál fue el motivo.' });
  }

  // si se compro por caja/paca se convierte a la unidad en que se cuenta
  const porPres = tipo === 'ing' && b.unidadCompra === 'pres' && item.pres && item.pres.cant > 1;
  const cantBase = porPres ? cant * item.pres.cant : cant;

  let foto = '';
  if (req.file) {
    try { foto = await guardarFotoInventario(empresaId, req.file.buffer); }
    catch (e) { logger.warn(`no se pudo guardar foto de inventario: ${e.message}`); }
  }

  const mov = await MovInventario.create({
    empresa_id: empresaId, tipo, fecha, item_id: item._id, cant: cantBase,
    compra: porPres ? `${cant} × ${item.pres.nombre.toLowerCase()}` : '',
    costo, prov: tipo === 'ing' ? texto(b.prov, 80) : '', factura: tipo === 'ing' ? texto(b.factura, 40) : '',
    motivo, motivoOtro, obs: tipo === 'baja' ? texto(b.obs, 200) : '', por, foto
  });
  if (tipo === 'ing') await inv.recalcularPrecio(item._id);
  res.status(201).json({ ok: true, mov: movPublico(mov), nuevo, item: { id: String(item._id), nombre: item.nombre } });
}));

async function movDeEmpresa(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return MovInventario.findOne({ _id: req.params.id, empresa_id: empresaDe(req), borrado: null });
}
// el mismo dia cualquiera corrige; un registro de dias anteriores necesita clave
function puedeCorregir(req, m) { return m.fecha === inv.hoyStr() || esAdmin(req); }

router.put('/movimientos/:id', soloEmpresa, ah(async (req, res) => {
  const m = await movDeEmpresa(req);
  if (!m) return res.status(404).json({ ok: false, error: 'No se encontró el registro.' });
  if (!puedeCorregir(req, m)) return res.status(403).json({ ok: false, error: 'Corregir un registro de días anteriores es solo para el administrador.', pideClave: true });
  const por = texto(req.body.por, 60);
  if (!por) return res.status(400).json({ ok: false, error: 'Escribe quién corrige.' });
  const item = await ItemInventario.findById(m.item_id);
  const antes = { cant: m.cant, costo: m.costo, prov: m.prov, motivo: m.motivo, motivoOtro: m.motivoOtro };
  const cant = numero(req.body.cant), costo = Math.round(numero(req.body.costo));
  if (cant > 0) m.cant = cant;
  if (costo > 0) m.costo = costo;
  if (m.tipo === 'ing') m.prov = texto(req.body.prov, 80);
  else {
    const motivo = texto(req.body.motivo, 40);
    if (item && MOTIVOS[item.cat].includes(motivo)) m.motivo = motivo;
    m.motivoOtro = m.motivo === 'Otro' ? texto(req.body.motivoOtro, 120) : '';
  }
  m.cambios.push({ por, razon: texto(req.body.razon, 200), fecha: inv.hoyStr(), antes, despues: { cant: m.cant, costo: m.costo, prov: m.prov, motivo: m.motivo, motivoOtro: m.motivoOtro } });
  await m.save();
  if (m.tipo === 'ing') await inv.recalcularPrecio(m.item_id);
  res.json({ ok: true, mov: movPublico(m) });
}));

router.post('/movimientos/:id/borrar', soloEmpresa, ah(async (req, res) => {
  const m = await movDeEmpresa(req);
  if (!m) return res.status(404).json({ ok: false, error: 'No se encontró el registro.' });
  if (!puedeCorregir(req, m)) return res.status(403).json({ ok: false, error: 'Borrar un registro de días anteriores es solo para el administrador.', pideClave: true });
  const por = texto(req.body.por, 60);
  if (!por) return res.status(400).json({ ok: false, error: 'Escribe quién borra.' });
  m.borrado = { por, razon: texto(req.body.razon, 200), fecha: inv.hoyStr() };
  await m.save();
  if (m.tipo === 'ing') await inv.recalcularPrecio(m.item_id);
  res.json({ ok: true });
}));

router.get('/movimientos/:id/foto', soloEmpresa, ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
  const m = await MovInventario.findOne({ _id: req.params.id, empresa_id: empresaDe(req) }).lean();
  if (!m || !m.foto) return res.status(404).end();
  const buffer = await obtenerFotoInventario(m.foto);
  if (!buffer) return res.status(404).end();
  res.set('Content-Type', 'image/jpeg');
  res.set('Cache-Control', 'private, max-age=3600');
  res.send(buffer);
}));

// lista de items (solo administrador, o el superadmin al cargar la plantilla)
router.put('/items', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const cambios = Array.isArray(req.body.cambios) ? req.body.cambios : [];
  const vivos = cambios.filter(c => !c.borrar);
  const nombres = vivos.map(c => texto(c.nombre, 80).toLowerCase());
  if (nombres.some(n => !n)) return res.status(400).json({ ok: false, error: 'Hay un ítem sin nombre.' });
  if (new Set(nombres).size !== nombres.length) return res.status(400).json({ ok: false, error: 'Hay dos ítems con el mismo nombre.' });
  for (const c of vivos) {
    if (!CATEGORIAS.includes(c.cat) || !UNIDADES.includes(c.u)) return res.status(400).json({ ok: false, error: `Revisa la categoría y la unidad de "${texto(c.nombre)}".` });
  }
  // solo materia prima y bebidas pueden cambiar de lado en el food cost; si queda igual a su categoria, null
  const costoDe = c => {
    if (!['Materia prima', 'Bebidas'].includes(c.cat) || !['Comida', 'Bebidas'].includes(c.costoDe)) return null;
    return (c.cat === 'Bebidas') === (c.costoDe === 'Bebidas') ? null : c.costoDe;
  };
  const pres = c => {
    const n = texto(c.presNombre, 20), k = Math.round(numero(c.presCant));
    return n && k > 1 ? { nombre: n, cant: k } : null;
  };
  for (const c of cambios) {
    if (!c.id) {
      if (c.borrar) continue;
      const precio = Math.round(numero(c.precio)) || 0;
      await ItemInventario.create({ empresa_id: empresaId, nombre: texto(c.nombre, 80), cat: c.cat, u: c.u, precio, precioBase: precio, pres: pres(c), cuenta: c.cuenta === false ? false : true, costoDe: costoDe(c) });
      continue;
    }
    if (!mongoose.isValidObjectId(c.id)) continue;
    const it = await ItemInventario.findOne({ _id: c.id, empresa_id: empresaId });
    if (!it) continue;
    if (c.borrar) { it.activo = false; await it.save(); continue; }
    it.nombre = texto(c.nombre, 80); it.cat = c.cat; it.u = c.u; it.pres = pres(c);
    // la pagina del superadmin no manda este campo: si no viene, se deja como estaba
    if ('costoDe' in c) it.costoDe = costoDe(c);
    const precio = Math.round(numero(c.precio));
    if (precio >= 0 && precio !== it.precio) { it.precio = precio; if (!it.precioBase) it.precioBase = precio; }
    if (c.cuenta === true || c.cuenta === false) it.cuenta = c.cuenta;
    await it.save();
  }
  res.json({ ok: true });
}));

router.post('/items/unir', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const { de, a } = req.body;
  if (!mongoose.isValidObjectId(de) || !mongoose.isValidObjectId(a) || de === a) return res.status(400).json({ ok: false, error: 'Elige dos ítems distintos.' });
  const [itDe, itA] = await Promise.all([
    ItemInventario.findOne({ _id: de, empresa_id: empresaId, activo: true }),
    ItemInventario.findOne({ _id: a, empresa_id: empresaId, activo: true })
  ]);
  if (!itDe || !itA) return res.status(404).json({ ok: false, error: 'No se encontró alguno de los ítems.' });
  if (itDe.u !== itA.u) return res.status(400).json({ ok: false, error: `No se pueden unir: uno está en ${itDe.u} y el otro en ${itA.u}.` });
  await MovInventario.updateMany({ empresa_id: empresaId, item_id: itDe._id }, { $set: { item_id: itA._id } });
  if (itDe.conteoFecha) { itA.conteo += itDe.conteo; await itA.save(); }
  itDe.activo = false;
  await itDe.save();
  await inv.recalcularPrecio(itA._id);
  res.json({ ok: true, mensaje: `Listo: "${itDe.nombre}" quedó dentro de "${itA.nombre}".` });
}));

// items nuevos que entraron por compras: el administrador decide si se cuentan
router.post('/items/decidir', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const decisiones = req.body.decisiones || {};
  let agregados = 0;
  for (const [id, valor] of Object.entries(decisiones)) {
    if (!mongoose.isValidObjectId(id) || typeof valor !== 'boolean') continue;
    const r = await ItemInventario.updateOne({ _id: id, empresa_id: empresaId, cuenta: null }, { $set: { cuenta: valor } });
    if (valor && r.modifiedCount) agregados++;
  }
  // si el inventario ya estaba enviado y el admin agrega items, vuelve a conteo para contarlos
  const conteo = await conteoActual(empresaId);
  if (conteo && agregados) {
    const n = agregados;
    conteo.nota = req.body.desdeRevision
      ? `El administrador agregó ${n} ítem${n === 1 ? '' : 's'} a la lista. Cuéntal${n === 1 ? 'o' : 'os'} y vuelve a enviar.`
      : `Se agreg${n === 1 ? 'ó' : 'aron'} ${n} ítem${n === 1 ? '' : 's'} a la lista de conteo.`;
    if (conteo.estado === 'enviado') conteo.estado = 'curso';
    await conteo.save();
  }
  res.json({ ok: true, agregados });
}));

// plantilla base para un restaurante (la carga el superadmin al configurar la cuenta)
const PLANTILLA = [
  ['Pechuga de pollo', 'Materia prima', 'kg'], ['Carne de res', 'Materia prima', 'kg'], ['Arroz', 'Materia prima', 'kg'],
  ['Aceite', 'Materia prima', 'L'], ['Leche entera', 'Materia prima', 'L'], ['Huevos', 'Materia prima', 'und'],
  ['Tomate', 'Materia prima', 'kg'], ['Cebolla', 'Materia prima', 'kg'], ['Papa', 'Materia prima', 'kg'],
  ['Gaseosa', 'Bebidas', 'und'], ['Cerveza', 'Bebidas', 'und'], ['Agua en botella', 'Bebidas', 'und'],
  ['Platos', 'Menaje', 'und'], ['Vasos', 'Menaje', 'und'], ['Juegos de cubiertos', 'Menaje', 'und'], ['Ollas', 'Menaje', 'und'], ['Sartenes', 'Menaje', 'und'],
  ['Mesas', 'Mobiliario', 'und'], ['Sillas', 'Mobiliario', 'und'],
  ['Detergente', 'Insumos', 'L'], ['Servilletas', 'Insumos', 'paquete'], ['Bolsas de basura', 'Insumos', 'paquete'],
  ['Contenedores para domicilio', 'Empaques', 'paquete'], ['Bolsas para domicilio', 'Empaques', 'paquete']
];
router.post('/items/plantilla', ah(async (req, res) => {
  if (!req.session.superadmin) return res.status(403).json({ ok: false, error: 'Solo el superadmin carga la plantilla.' });
  const empresaId = empresaDe(req);
  if (!empresaId) return res.status(400).json({ ok: false, error: 'Falta la empresa.' });
  const existentes = new Set((await ItemInventario.find({ empresa_id: empresaId, activo: true }).select('nombre').lean()).map(i => i.nombre.toLowerCase()));
  const nuevos = PLANTILLA.filter(([n]) => !existentes.has(n.toLowerCase())).map(([nombre, cat, u]) => ({ empresa_id: empresaId, nombre, cat, u, cuenta: true }));
  if (nuevos.length) await ItemInventario.insertMany(nuevos);
  res.json({ ok: true, agregados: nuevos.length });
}));

// inventario general
async function conteoDeEmpresa(req, res) {
  const c = await conteoActual(empresaDe(req));
  if (!c) { res.status(404).json({ ok: false, error: 'No hay un inventario general en curso.' }); return null; }
  return c;
}

router.post('/conteo/iniciar', soloEmpresa, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  let c = await conteoActual(empresaId);
  if (!c) {
    const hoy = inv.hoyStr();
    c = await ConteoInventario.create({ empresa_id: empresaId, iniciado: hoy, mesCierre: inv.mesQueCierra(hoy) });
  }
  res.json({ ok: true, conteo: conteoPublico(c, esAdmin(req)) });
}));

// operaciones del conteo que comparten el dispositivo de la empresa y los celulares con el link
async function sumarCuenta(conteoId, itemId, valor) {
  if (!mongoose.isValidObjectId(itemId) || !(valor >= 0)) return false;
  await ConteoInventario.updateOne({ _id: conteoId, estado: 'curso' }, { $push: { [`cuentas.${itemId}`]: valor } });
  return true;
}
async function cambiarParcial(conteoId, itemId, i, valor) {
  if (!mongoose.isValidObjectId(itemId) || !(i >= 0)) return false;
  if (valor === null) {
    await ConteoInventario.updateOne({ _id: conteoId, estado: 'curso' }, { $unset: { [`cuentas.${itemId}.${i}`]: 1 } });
    await ConteoInventario.updateOne({ _id: conteoId }, { $pull: { [`cuentas.${itemId}`]: null } });
    const c = await ConteoInventario.findById(conteoId);
    if (c && c.cuentas.get(itemId) && !c.cuentas.get(itemId).length) { c.cuentas.delete(itemId); await c.save(); }
    return true;
  }
  if (!(valor >= 0)) return false;
  await ConteoInventario.updateOne({ _id: conteoId, estado: 'curso' }, { $set: { [`cuentas.${itemId}.${i}`]: valor } });
  return true;
}
async function guardarParte(conteo, parte, por, empresaId) {
  const items = await ItemInventario.find({ empresa_id: empresaId, activo: true, cuenta: true }).select('cat').lean();
  const cats = parte === 'todo' ? CATEGORIAS : [parte];
  for (const cat of cats) {
    const contado = items.some(i => i.cat === cat && (conteo.cuentas.get(String(i._id)) || []).length);
    if (!contado) continue;
    // si varias personas contaron la misma parte quedan todas: "Laura, Samuel"
    const nombres = conteo.por.get(cat) ? conteo.por.get(cat).split(', ') : [];
    if (!nombres.includes(por)) nombres.push(por);
    conteo.por.set(cat, nombres.join(', '));
  }
  await conteo.save();
}

router.post('/conteo/sumar', soloEmpresa, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  if (!(await sumarCuenta(c._id, req.body.itemId, numero(req.body.valor)))) return res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
  res.json({ ok: true });
}));
router.post('/conteo/parcial', soloEmpresa, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  const valor = req.body.valor === null ? null : numero(req.body.valor);
  if (!(await cambiarParcial(c._id, req.body.itemId, Number(req.body.i), valor))) return res.status(400).json({ ok: false, error: 'Cantidad inválida.' });
  res.json({ ok: true });
}));
router.post('/conteo/parte', soloEmpresa, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  const por = texto(req.body.por, 60);
  if (!por) return res.status(400).json({ ok: false, error: 'Escribe quién contó.' });
  await guardarParte(c, req.body.parte, por, empresaDe(req));
  res.json({ ok: true });
}));
// quien estaba contando desde otro celular queda anotado en su parte aunque no haya tocado "Terminé"
async function anotarConectados(c, empresaId, sid) {
  if (!c.acceso) return;
  for (const x of c.acceso.conectados) {
    if (x.parte && (!sid || x.sid === sid)) await guardarParte(c, x.parte, x.nombre, empresaId);
  }
}

router.post('/conteo/enviar', soloEmpresa, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  await anotarConectados(c, empresaDe(req));
  c.estado = 'enviado'; c.acceso = null; c.nota = '';
  await c.save();
  res.json({ ok: true });
}));
router.post('/conteo/descartar', soloEmpresa, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  c.estado = 'descartado'; c.acceso = null;
  await c.save();
  res.json({ ok: true });
}));
router.post('/conteo/devolver', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  c.estado = 'curso';
  await c.save();
  res.json({ ok: true });
}));
router.post('/conteo/aprobar', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresaId = empresaDe(req);
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  const datos = await inv.cargar(empresaId);
  const lista = datos.items.filter(i => i.activo && i.cuenta === true);
  const hoy = inv.hoyStr();
  const resultado = {};
  for (const it of lista) {
    const id = String(it._id);
    const partes = c.cuentas.get(id);
    if (!partes || !partes.length) continue;
    const contado = Math.round(partes.reduce((a, n) => a + n, 0) * 1000) / 1000;
    resultado[id] = { antes: it.conteoFecha ? it.conteo : 0, antesFecha: it.conteoFecha, deberia: inv.existencia(it, datos.porItem.get(id) || []), contado };
    await ItemInventario.updateOne({ _id: it._id }, { $set: { conteo: contado, conteoFecha: hoy, contadoPor: c.por.get(it.cat) || '' } });
  }
  c.resultado = resultado;
  c.completo = lista.length > 0 && lista.every(it => resultado[String(it._id)]);
  c.estado = 'aprobado'; c.fechaAprobado = hoy; c.aprobadoPor = adminInventarioActivo(req) || 'Superadmin'; c.acceso = null;
  await c.save();
  res.json({ ok: true, completo: c.completo, mes: inv.nombreMes(c.mesCierre), id: String(c._id) });
}));

// acceso para contar desde otros celulares
function urlBase(req) { return `${req.protocol}://${req.get('host')}`; }
router.post('/conteo/acceso', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  c.acceso = {
    token: crypto.randomBytes(16).toString('base64url'),
    codigo: String(crypto.randomInt(100000, 1000000)),
    vence: new Date(Date.now() + 24 * 60 * 60 * 1000),
    intentos: 0, conectados: []
  };
  await c.save();
  res.json({ ok: true, url: `${urlBase(req)}/contar/${c.acceso.token}` });
}));
router.delete('/conteo/acceso', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  c.acceso = null;
  await c.save();
  res.json({ ok: true });
}));
router.post('/conteo/acceso/sacar', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const c = await conteoDeEmpresa(req, res); if (!c) return;
  await anotarConectados(c, empresaDe(req), req.body.sid);
  if (c.acceso) { c.acceso.conectados =c.acceso.conectados.filter(x => x.sid !== req.body.sid); c.markModified('acceso'); await c.save(); }
  res.json({ ok: true });
}));
router.get('/conteo/acceso/qr.svg', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const c = await conteoActual(empresaDe(req));
  if (!c || !c.acceso) return res.status(404).end();
  const q = qrcode(0, 'M');
  q.addData(`${urlBase(req)}/contar/${c.acceso.token}`);
  q.make();
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store');
  res.send(q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }));
}));

// reportes y food cost (administrador)
router.get('/reporte', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresa = await Empresa.findById(empresaDe(req)).select('metasFoodCost foodCost').lean();
  const datos = await inv.armarReporte(empresaDe(req), req.query.tipo || 'general', req.query, metasDe(empresa), ajustesFC(empresa));
  res.json({ ok: true, ...datos });
}));
router.get('/reporte/excel', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const empresa = await Empresa.findById(empresaDe(req)).select('nombre metasFoodCost foodCost').lean();
  const datos = await inv.armarReporte(empresaDe(req), req.query.tipo || 'general', req.query, metasDe(empresa), ajustesFC(empresa));
  const wb = await excelReporte(datos, { detalle: req.query.detalle === '1', empresa: empresa ? empresa.nombre : '', titulo: texto(req.query.titulo, 120) });
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.set('Content-Disposition', `attachment; filename="Inventario - ${datos.tipo}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));
// ventas: solo el administrador. sin impuesto al consumo ni propinas; domicilios netos
const pesos = v => Math.max(0, Math.round(numero(v)) || 0);
const ventasDe = b => ({ comida: pesos(b.comida), bebidas: pesos(b.bebidas), dom: pesos(b.dom) });

// ventas de un dia (modo diario). si ese dia ya tenia, se reemplazan
router.post('/ventas', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const fecha = req.body.fecha;
  if (!esFecha(fecha)) return res.status(400).json({ ok: false, error: 'Elige el día.' });
  if (fecha > inv.hoyStr()) return res.status(400).json({ ok: false, error: 'No se pueden registrar ventas de un día que todavía no ha pasado.' });
  const v = ventasDe(req.body);
  await VentaDia.updateOne({ empresa_id: empresaDe(req), fecha }, { $set: { ...v, fuente: 'manual', por: adminInventarioActivo(req) || 'Superadmin' } }, { upsert: true });
  res.json({ ok: true });
}));
// total de ventas de un cierre (modo total al cierre)
router.put('/cierres/:id/ventas', soloEmpresa, soloAdmin, ah(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'No se encontró el cierre.' });
  await ConteoInventario.updateOne({ _id: req.params.id, empresa_id: empresaDe(req), estado: 'aprobado' }, { $set: { ventas: ventasDe(req.body) } });
  res.json({ ok: true });
}));
router.put('/foodcost/ajustes', soloEmpresa, soloAdmin, ah(async (req, res) => {
  const b = req.body;
  const cambios = {};
  if (b.modo === 'diario' || b.modo === 'total') cambios['foodCost.modo'] = b.modo;
  if (typeof b.empaques === 'boolean') cambios['foodCost.empaques'] = b.empaques;
  if (b.metaComida !== undefined) cambios['metasFoodCost.comida'] = Math.min(100, Math.max(1, numero(b.metaComida) || 32));
  if (b.metaBebidas !== undefined) cambios['metasFoodCost.bebidas'] = Math.min(100, Math.max(1, numero(b.metaBebidas) || 25));
  await Empresa.updateOne({ _id: empresaDe(req) }, { $set: cambios });
  res.json({ ok: true });
}));

module.exports = router;
module.exports.conteo = { sumarCuenta, cambiarParcial, guardarParte, conteoPublico };
