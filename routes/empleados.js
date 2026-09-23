const express = require('express');
const EmpleadoLista = require('../models/EmpleadoLista');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { getConfigEmpresa } = require('../empresaConfig');
const { adminCarpetaAdministracionActivo, adminReporteActivo } = require('./admin');

const router = express.Router();

const REGEX_LETRAS = /^[A-Za-zÀ-ÿÑñ\s]+$/;

async function requireAccesoFormato3(req, res, next) {
  try {
    const { carpetas } = await getConfigEmpresa(req.session.empresa.id);
    const esCarpetaAdmin   = carpetas.administracion.includes('presentacion_personal');
    const tieneOtraCarpeta = carpetas.cocina.includes('presentacion_personal') || carpetas.salon.includes('presentacion_personal');
    // adminReporte tambien vale aca -- corregir un dia de presentacion_personal
    // necesita leer la lista de empleados para repoblar el formulario, y esa
    // correccion ya la autoriza la clave del reporte (no hace falta ademas
    // haber entrado a Administracion)
    if (esCarpetaAdmin && !tieneOtraCarpeta && !adminCarpetaAdministracionActivo(req) && !adminReporteActivo(req)) {
      return res.status(401).json({ ok: false, error: 'Requiere acceso a la carpeta Administración para gestionar empleados' });
    }
    next();
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

function validarNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { error: 'El nombre es obligatorio' };
  if (!REGEX_LETRAS.test(limpio)) return { error: 'Solo se permiten letras y espacios' };
  return { nombre: limpio };
}

router.get('/', requireEmpresa, requireAccesoFormato3, ah(async (req, res) => {
  const empleados = await EmpleadoLista
    .find({ empresa_id: req.session.empresa.id })
    .sort({ nombre: 1 })
    .lean();
  res.json({ ok: true, empleados });
}));

router.post('/', requireEmpresa, requireAccesoFormato3, ah(async (req, res) => {
  const v = validarNombre(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const duplicado = await EmpleadoLista.findOne({
    empresa_id: req.session.empresa.id,
    nombre: v.nombre
  });
  if (duplicado) {
    return res.status(409).json({ ok: false, error: 'Ya existe un empleado con ese nombre' });
  }

  try {
    const empleado = await EmpleadoLista.create({
      nombre: v.nombre,
      empresa_id: req.session.empresa.id
    });
    res.status(201).json({ ok: true, empleado });
  } catch (err) {
    // por si dos requests casi simultaneos pasan el findOne de arriba a la vez —
    // el indice unico de empresa_id+nombre es el que de verdad evita el duplicado
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un empleado con ese nombre' });
    }
    throw err;
  }
}));

router.put('/:id', requireEmpresa, requireAccesoFormato3, ah(async (req, res) => {
  const v = validarNombre(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const duplicado = await EmpleadoLista.findOne({
    empresa_id: req.session.empresa.id,
    nombre: v.nombre,
    _id: { $ne: req.params.id }
  });
  if (duplicado) {
    return res.status(409).json({ ok: false, error: 'Ya existe otro empleado con ese nombre' });
  }

  try {
    const empleado = await EmpleadoLista.findOneAndUpdate(
      { _id: req.params.id, empresa_id: req.session.empresa.id },
      { nombre: v.nombre },
      { new: true }
    );
    if (!empleado) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    res.json({ ok: true, empleado });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe otro empleado con ese nombre' });
    }
    throw err;
  }
}));

router.delete('/:id', requireEmpresa, requireAccesoFormato3, ah(async (req, res) => {
  const r = await EmpleadoLista.findOneAndDelete({
    _id: req.params.id,
    empresa_id: req.session.empresa.id
  });
  if (!r) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
  res.json({ ok: true });
}));

module.exports = router;
