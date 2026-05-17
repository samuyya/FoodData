const express = require('express');
const multer = require('multer');
const Asistencia = require('../models/Asistencia');
const EmpleadoLista = require('../models/EmpleadoLista');
const { requireEmpresa } = require('../middleware/sesion');
const { guardarFotoAsistencia } = require('../servicios/almacenamiento');

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

module.exports = router;
