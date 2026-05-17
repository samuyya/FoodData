const express = require('express');
const multer = require('multer');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Asistencia = require('../models/Asistencia');
const EmpleadoLista = require('../models/EmpleadoLista');
const Administrador = require('../models/Administrador');
const { requireEmpresa } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');
const { guardarFotoAsistencia, rutaAbsolutaFoto } = require('../servicios/almacenamiento');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('image/'))
});

function hoyPartes() {
  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  return { dia, mes, anio, fecha: new Date(anio, mes - 1, dia) };
}

router.get('/empleados', requireEmpresa, async (req, res) => {
  const empleados = await EmpleadoLista
    .find({ empresa_id: req.session.empresa.id })
    .sort({ nombre: 1 })
    .select('nombre')
    .lean();
  res.json({ ok: true, empleados });
});

router.get('/estado/:empleadoId', requireEmpresa, async (req, res) => {
  const { dia, mes, anio } = hoyPartes();
  const registro = await Asistencia.findOne({
    empresa_id: req.session.empresa.id,
    empleado_id: req.params.empleadoId,
    dia, mes, anio
  }).lean();

  let estado = 'sin_marcar';
  if (registro && registro.horaIngreso && registro.horaSalida) estado = 'completo';
  else if (registro && registro.horaIngreso) estado = 'solo_ingreso';

  res.json({ ok: true, estado, registro: registro || null });
});

router.post('/marcar', requireEmpresa, upload.single('foto'), async (req, res) => {
  try {
    const { empleadoId } = req.body;
    if (!empleadoId) {
      return res.status(400).json({ ok: false, error: 'Falta seleccionar el empleado' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Falta la foto de evidencia' });
    }

    const empleado = await EmpleadoLista.findOne({
      _id: empleadoId,
      empresa_id: req.session.empresa.id
    });
    if (!empleado) {
      return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    }

    const { dia, mes, anio, fecha } = hoyPartes();
    const ahora = new Date();
    let registro = await Asistencia.findOne({
      empresa_id: req.session.empresa.id,
      empleado_id: empleadoId,
      dia, mes, anio
    });

    if (!registro) {
      const nombreArchivo = `${empleadoId}-${dia}-ingreso-${Date.now()}.jpg`;
      const refFoto = await guardarFotoAsistencia(req.session.empresa.id, anio, mes, nombreArchivo, req.file.buffer);
      registro = await Asistencia.create({
        empresa_id: req.session.empresa.id,
        empleado_id: empleadoId,
        empleadoNombre: empleado.nombre,
        fecha, dia, mes, anio,
        horaIngreso: ahora,
        fotoIngreso: refFoto
      });
      return res.status(201).json({ ok: true, tipo: 'ingreso', hora: ahora, registro });
    }

    if (!registro.horaSalida) {
      const nombreArchivo = `${empleadoId}-${dia}-salida-${Date.now()}.jpg`;
      const refFoto = await guardarFotoAsistencia(req.session.empresa.id, anio, mes, nombreArchivo, req.file.buffer);
      registro.horaSalida = ahora;
      registro.fotoSalida = refFoto;
      registro.horasTrabajadas = Math.round(((ahora - registro.horaIngreso) / 3600000) * 100) / 100;
      await registro.save();
      return res.json({ ok: true, tipo: 'salida', hora: ahora, registro });
    }

    return res.status(409).json({ ok: false, error: 'Este empleado ya registró entrada y salida hoy' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro de asistencia para hoy' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/meses', requireEmpresa, async (req, res) => {
  const empresaId = new mongoose.Types.ObjectId(req.session.empresa.id);
  const agregados = await Asistencia.aggregate([
    { $match: { empresa_id: empresaId } },
    { $group: { _id: { anio: '$anio', mes: '$mes' }, count: { $sum: 1 } } },
    { $sort: { '_id.anio': -1, '_id.mes': -1 } }
  ]);
  const meses = agregados.map(m => ({ anio: m._id.anio, mes: m._id.mes, count: m.count }));
  res.json({ ok: true, meses });
});

router.get('/registro/:empleadoId', requireEmpresa, async (req, res) => {
  const hoy = hoyPartes();
  const anio = parseInt(req.query.anio || hoy.anio, 10);
  const mes = parseInt(req.query.mes || hoy.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const empleado = await EmpleadoLista.findOne({
    _id: req.params.empleadoId,
    empresa_id: req.session.empresa.id
  }).lean();
  if (!empleado) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });

  const registros = await Asistencia.find({
    empresa_id: req.session.empresa.id,
    empleado_id: req.params.empleadoId,
    anio, mes
  }).sort({ dia: 1 }).lean();

  let totalHoras = 0;
  const dias = registros.map(r => {
    const completo = !!(r.horaIngreso && r.horaSalida);
    if (completo) totalHoras += r.horasTrabajadas || 0;
    return {
      registroId: r._id,
      dia: r.dia,
      horaIngreso: r.horaIngreso,
      horaSalida: r.horaSalida,
      horasTrabajadas: r.horasTrabajadas || 0,
      fotoIngreso: r.fotoIngreso || '',
      fotoSalida: r.fotoSalida || '',
      completo
    };
  });

  res.json({
    ok: true,
    empleado: { id: empleado._id, nombre: empleado.nombre },
    anio, mes,
    dias,
    totalHoras: Math.round(totalHoras * 100) / 100
  });
});

router.get('/foto', requireEmpresa, (req, res) => {
  const ref = req.query.ref;
  if (!ref || typeof ref !== 'string' || ref.includes('..')) {
    return res.status(400).json({ ok: false, error: 'Referencia inválida' });
  }
  if (!ref.startsWith(req.session.empresa.id + '/')) {
    return res.status(403).json({ ok: false, error: 'Sin acceso a esta foto' });
  }
  const ruta = rutaAbsolutaFoto(ref);
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
  }
  res.sendFile(ruta);
});

router.post('/corregir-salida', limiteAdmin, requireEmpresa, async (req, res) => {
  const { registroId, hora, password } = req.body;
  if (!registroId || !hora || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan datos (registro, hora o contraseña)' });
  }
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hora).trim());
  if (!m) {
    return res.status(400).json({ ok: false, error: 'Hora inválida. Usa el formato HH:MM (ej. 17:30)' });
  }

  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }
  let adminOk = false;
  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) { adminOk = true; break; }
  }
  if (!adminOk) {
    return res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
  }

  const registro = await Asistencia.findOne({
    _id: registroId,
    empresa_id: req.session.empresa.id
  });
  if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
  if (!registro.horaIngreso) {
    return res.status(400).json({ ok: false, error: 'Este registro no tiene hora de ingreso' });
  }
  if (registro.horaSalida) {
    return res.status(409).json({ ok: false, error: 'Este día ya tiene hora de salida' });
  }

  const salida = new Date(registro.anio, registro.mes - 1, registro.dia, parseInt(m[1], 10), parseInt(m[2], 10));
  if (salida <= registro.horaIngreso) {
    return res.status(400).json({ ok: false, error: 'La hora de salida debe ser posterior a la de ingreso' });
  }
  registro.horaSalida = salida;
  registro.horasTrabajadas = Math.round(((salida - registro.horaIngreso) / 3600000) * 100) / 100;
  await registro.save();

  res.json({ ok: true, registro });
});

module.exports = router;
