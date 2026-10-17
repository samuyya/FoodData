const express = require('express');
const path = require('path');
const multer = require('multer');
const Cargo = require('../models/Cargo');
const Capacitacion = require('../models/Capacitacion');
const Asignacion = require('../models/AsignacionCapacitacion');
const EmpleadoLista = require('../models/EmpleadoLista');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { adminCapacitacionesActivo } = require('./admin');
const { guardarDocumentoPrograma, obtenerDocumentoPrograma, borrarDocumento } = require('../servicios/almacenamiento');
const { resumen, aplicaPorRegla } = require('../servicios/capacitaciones');

const router = express.Router();
router.use(requireEmpresa);

router.get('/estado', (req, res) => res.json({ ok: true, admin: !!adminCapacitacionesActivo(req) }));

// todo lo de abajo es del administrador
router.use((req, res, next) => {
  if (adminCapacitacionesActivo(req)) return next();
  res.status(401).json({ ok: false, error: 'Se requiere la contraseña de administrador', requiereClaveAdmin: true });
});

const TIPOS_OK = /^(image\/(png|jpe?g|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/plain)$/;
const EXT_OK = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const ok = TIPOS_OK.test((file.mimetype || '').toLowerCase()) && EXT_OK.includes(ext);
    cb(ok ? null : new Error('Tipo de archivo no permitido (usa PDF, imagen, Word, Excel, presentación o texto)'), ok);
  }
});
function subir(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();
    res.status(400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'El archivo pasa de 10 MB' : err.message });
  });
}

const REGEX_CARGO = /^[A-Za-zÀ-ÿÑñ0-9 ]+$/;
function validarCargo(nombre) {
  const n = String(nombre || '').trim().replace(/\s+/g, ' ');
  if (!n) return { error: 'Escribe el nombre del cargo' };
  if (n.length > 30) return { error: 'El cargo puede tener máximo 30 letras' };
  if (!REGEX_CARGO.test(n)) return { error: 'El cargo solo puede tener letras y números' };
  return { nombre: n };
}

// cargos
router.get('/cargos', ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const [cargos, gente] = await Promise.all([
    Cargo.find({ empresa_id }).sort({ nombre: 1 }).lean(),
    EmpleadoLista.find({ empresa_id, lista: 'capacitaciones', cargo: { $ne: null } }).select('cargo').lean()
  ]);
  const cuenta = {};
  gente.forEach(g => { cuenta[g.cargo] = (cuenta[g.cargo] || 0) + 1; });
  res.json({ ok: true, cargos: cargos.map(c => ({ id: c._id, nombre: c.nombre, personas: cuenta[c._id] || 0 })) });
}));

router.post('/cargos', ah(async (req, res) => {
  const v = validarCargo(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });
  try {
    const c = await Cargo.create({ empresa_id: req.session.empresa.id, nombre: v.nombre });
    res.status(201).json({ ok: true, cargo: { id: c._id, nombre: c.nombre, personas: 0 } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ ok: false, error: 'Ya existe un cargo con ese nombre' });
    throw err;
  }
}));

router.put('/cargos/:id', ah(async (req, res) => {
  const v = validarCargo(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });
  try {
    const c = await Cargo.findOneAndUpdate({ _id: req.params.id, empresa_id: req.session.empresa.id }, { nombre: v.nombre }, { new: true });
    if (!c) return res.status(404).json({ ok: false, error: 'Cargo no encontrado' });
    res.json({ ok: true, cargo: { id: c._id, nombre: c.nombre } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ ok: false, error: 'Ya existe un cargo con ese nombre' });
    throw err;
  }
}));

// si hay gente con ese cargo, primero hay que decir a que cargo pasan (?reasignarA=<id> o "ninguno")
router.delete('/cargos/:id', ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const cargo = await Cargo.findOne({ _id: req.params.id, empresa_id });
  if (!cargo) return res.status(404).json({ ok: false, error: 'Cargo no encontrado' });

  const personas = await EmpleadoLista.countDocuments({ empresa_id, lista: 'capacitaciones', cargo: cargo._id });
  const destino = req.query.reasignarA;
  if (personas > 0 && !destino) {
    return res.status(409).json({ ok: false, enUso: personas, error: `${personas} persona${personas === 1 ? '' : 's'} tiene${personas === 1 ? '' : 'n'} este cargo. Elige a qué cargo pasan antes de eliminarlo.` });
  }
  let nuevo = null;
  if (personas > 0 && destino !== 'ninguno') {
    const otro = await Cargo.findOne({ _id: destino, empresa_id });
    if (!otro || String(otro._id) === String(cargo._id)) return res.status(400).json({ ok: false, error: 'Elige otro cargo para reasignar' });
    nuevo = otro._id;
  }
  await EmpleadoLista.updateMany({ empresa_id, lista: 'capacitaciones', cargo: cargo._id }, { $set: { cargo: nuevo } });
  const caps = await Capacitacion.updateMany({ empresa_id, cargos: cargo._id }, { $pull: { cargos: cargo._id } });
  await cargo.deleteOne();
  res.json({ ok: true, capacitacionesAfectadas: caps.modifiedCount });
}));

// capacitaciones
const cortar = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

// valida y arma los campos que manda el formulario. { error } o { campos }
async function leerCap(req, existente) {
  let d;
  try { d = JSON.parse(req.body.datos || '{}'); } catch (e) { return { error: 'Los datos no llegaron bien, intenta de nuevo' }; }
  const empresa_id = req.session.empresa.id;
  const titulo = cortar(d.titulo, 80);
  if (!titulo) return { error: 'Escribe el título de la capacitación' };
  let programa = null;
  if (d.programa) {
    programa = parseInt(d.programa, 10);
    if (!(programa >= 1 && programa <= 11)) return { error: 'Programa inválido' };
  }

  const alcance = d.alcance === 'cargos' ? 'cargos' : 'todos';
  let cargos = [];
  if (alcance === 'cargos') {
    const ids = [].concat(d.cargos || []);
    cargos = (await Cargo.find({ _id: { $in: ids }, empresa_id }).select('_id').lean()).map(c => c._id);
    if (cargos.length === 0) return { error: 'Elige al menos un cargo, o márcala para todos' };
  }

  const material = {};
  if (d.materialTipo === 'enlace') {
    const enlace = cortar(d.enlace, 300);
    if (!/^https?:\/\/\S+$/i.test(enlace)) return { error: 'Escribe el enlace completo, empezando por https://' };
    Object.assign(material, { tipo: 'enlace', enlace, archivoRef: '', archivoNombre: '', mimeType: '' });
  } else if (req.file) {
    Object.assign(material, { tipo: 'archivo', enlace: '', archivoNombre: req.file.originalname, mimeType: req.file.mimetype });
  } else if (existente && existente.material.tipo === 'archivo') {
    Object.assign(material, existente.material.toObject());
  } else {
    return { error: 'Sube el material o escribe un enlace' };
  }

  const evaluacion = { activa: false, minimo: 80, preguntas: [] };
  if (d.evaluacion && d.evaluacion.activa) {
    const minimo = parseInt(d.evaluacion.minimo, 10);
    if (!(minimo >= 50 && minimo <= 100)) return { error: 'La nota mínima va entre 50 y 100' };
    const preguntas = (d.evaluacion.preguntas || []).map(p => ({
      texto: cortar(p.texto, 200),
      opciones: (p.opciones || []).map(o => cortar(o, 120)).filter(Boolean),
      correcta: parseInt(p.correcta, 10)
    }));
    if (preguntas.length === 0) return { error: 'Agrega al menos una pregunta, o apaga la evaluación' };
    for (const [i, p] of preguntas.entries()) {
      if (!p.texto) return { error: `Escribe la pregunta ${i + 1}` };
      if (p.opciones.length < 2) return { error: `La pregunta ${i + 1} necesita al menos 2 respuestas` };
      if (!(p.correcta >= 0 && p.correcta < p.opciones.length)) return { error: `Marca la respuesta correcta de la pregunta ${i + 1}` };
    }
    Object.assign(evaluacion, { activa: true, minimo, preguntas });
  }

  return {
    campos: { titulo, descripcion: cortar(d.descripcion, 300), programa, material, alcance, cargos, ingreso: !!d.ingreso, evaluacion, foto: !!d.foto }
  };
}

function ficha(c, cuentaPorCap) {
  return {
    id: c._id, titulo: c.titulo, descripcion: c.descripcion, programa: c.programa, activa: c.activa, version: c.version,
    material: { tipo: c.material.tipo, archivoNombre: c.material.archivoNombre, enlace: c.material.enlace },
    alcance: c.alcance, cargos: c.cargos, ingreso: c.ingreso, foto: c.foto,
    evaluacion: { activa: c.evaluacion.activa, minimo: c.evaluacion.minimo, preguntas: c.evaluacion.preguntas },
    asignadas: cuentaPorCap[c._id] || 0
  };
}

router.get('/caps', ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const [caps, r] = await Promise.all([
    Capacitacion.find({ empresa_id }).sort({ createdAt: 1 }).lean(),
    resumen(empresa_id)
  ]);
  const cuenta = {};
  r.caps.forEach((c, i) => { cuenta[c.id] = r.gente.filter(g => g.celdas[i]).length; });
  res.json({ ok: true, capacitaciones: caps.map(c => ficha(c, cuenta)) });
}));

router.post('/caps', subir, ah(async (req, res) => {
  const v = await leerCap(req, null);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });
  const empresa_id = req.session.empresa.id;
  if (req.file) v.campos.material.archivoRef = await guardarDocumentoPrograma(empresa_id, 'capacitaciones', req.file.originalname, req.file.buffer);
  const c = await Capacitacion.create({ empresa_id, ...v.campos });
  res.status(201).json({ ok: true, capacitacion: ficha(c, {}) });
}));

router.put('/caps/:id', subir, ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const c = await Capacitacion.findOne({ _id: req.params.id, empresa_id });
  if (!c) return res.status(404).json({ ok: false, error: 'Capacitación no encontrada' });
  const v = await leerCap(req, c);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const viejo = c.material.toObject();
  const nuevo = v.campos.material;
  const cambioMaterial = !!req.file || nuevo.tipo !== viejo.tipo || (nuevo.tipo === 'enlace' && nuevo.enlace !== viejo.enlace);
  if (req.file) nuevo.archivoRef = await guardarDocumentoPrograma(empresa_id, 'capacitaciones', req.file.originalname, req.file.buffer);
  c.set(v.campos);
  // con material nuevo, quien ya la hizo la repite
  if (cambioMaterial) c.version += 1;
  await c.save();
  if (cambioMaterial && viejo.archivoRef) await borrarDocumento(viejo.archivoRef);
  res.json({ ok: true, capacitacion: ficha(c, {}) });
}));

// desactivar no borra nada: se conserva para las constancias
router.post('/caps/:id/estado', ah(async (req, res) => {
  const c = await Capacitacion.findOneAndUpdate({ _id: req.params.id, empresa_id: req.session.empresa.id }, { activa: !!req.body.activa }, { new: true });
  if (!c) return res.status(404).json({ ok: false, error: 'Capacitación no encontrada' });
  res.json({ ok: true, activa: c.activa });
}));

router.get('/caps/:id/material', ah(async (req, res) => {
  const c = await Capacitacion.findOne({ _id: req.params.id, empresa_id: req.session.empresa.id }).lean();
  if (!c || c.material.tipo !== 'archivo') return res.status(404).json({ ok: false, error: 'No hay archivo' });
  const buf = await obtenerDocumentoPrograma(c.material.archivoRef);
  if (!buf) return res.status(404).json({ ok: false, error: 'No se encontró el archivo' });
  res.setHeader('Content-Type', c.material.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline; filename*=UTF-8\'\'' + encodeURIComponent(c.material.archivoNombre));
  res.send(buf);
}));

// el paquete de ingreso: cuales capacitaciones se le asignan a quien entra nuevo
router.put('/paquete', ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const ids = [].concat(req.body.ids || []);
  await Capacitacion.updateMany({ empresa_id }, { $set: { ingreso: false } });
  await Capacitacion.updateMany({ empresa_id, _id: { $in: ids } }, { $set: { ingreso: true } });
  res.json({ ok: true });
}));

// tabla de quien tiene que hacer que
router.get('/resumen', ah(async (req, res) => {
  res.json({ ok: true, ...(await resumen(req.session.empresa.id)) });
}));

// sumar o quitar una capacitacion a una persona puntual
router.put('/gente/:empleadoId/caps', ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const [emp, cap] = await Promise.all([
    EmpleadoLista.findOne({ _id: req.params.empleadoId, empresa_id, lista: 'capacitaciones' }).lean(),
    Capacitacion.findOne({ _id: req.body.capacitacion, empresa_id }).lean()
  ]);
  if (!emp || !cap) return res.status(404).json({ ok: false, error: 'No se encontró la persona o la capacitación' });

  const filtro = { empleado_id: emp._id, capacitacion_id: cap._id };
  const regla = aplicaPorRegla(cap, emp);
  if (req.body.asignada) {
    await Asignacion.deleteMany({ ...filtro, origen: 'excluida' });
    if (!regla) await Asignacion.updateOne(filtro, { $setOnInsert: { empresa_id, origen: 'manual' } }, { upsert: true });
  } else {
    await Asignacion.deleteMany({ ...filtro, origen: { $in: ['manual', 'ingreso'] } });
    if (regla) await Asignacion.updateOne(filtro, { $set: { empresa_id, origen: 'excluida' } }, { upsert: true });
  }
  res.json({ ok: true });
}));

module.exports = router;
