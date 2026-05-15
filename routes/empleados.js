const express = require('express');
const EmpleadoLista = require('../models/EmpleadoLista');
const { requireEmpresa } = require('../middleware/sesion');
const { adminVerificadoPara } = require('./admin');

const router = express.Router();

const REGEX_LETRAS = /^[A-Za-zÀ-ÿÑñ\s]+$/;

function requireAdminFormato3(req, res, next) {
  const nombre = adminVerificadoPara(req, 'presentacion_personal');
  if (!nombre) {
    return res.status(401).json({ ok: false, error: 'Requiere verificación de administrador del Formato 3' });
  }
  next();
}

function validarNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { error: 'El nombre es obligatorio' };
  if (!REGEX_LETRAS.test(limpio)) return { error: 'Solo se permiten letras y espacios' };
  return { nombre: limpio };
}

router.get('/', requireEmpresa, requireAdminFormato3, async (req, res) => {
  const empleados = await EmpleadoLista
    .find({ empresa_id: req.session.empresa.id })
    .sort({ nombre: 1 })
    .lean();
  res.json({ ok: true, empleados });
});

router.post('/', requireEmpresa, requireAdminFormato3, async (req, res) => {
  const v = validarNombre(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const duplicado = await EmpleadoLista.findOne({
    empresa_id: req.session.empresa.id,
    nombre: v.nombre
  });
  if (duplicado) {
    return res.status(409).json({ ok: false, error: 'Ya existe un empleado con ese nombre' });
  }

  const empleado = await EmpleadoLista.create({
    nombre: v.nombre,
    empresa_id: req.session.empresa.id
  });
  res.status(201).json({ ok: true, empleado });
});

router.put('/:id', requireEmpresa, requireAdminFormato3, async (req, res) => {
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

  const empleado = await EmpleadoLista.findOneAndUpdate(
    { _id: req.params.id, empresa_id: req.session.empresa.id },
    { nombre: v.nombre },
    { new: true }
  );
  if (!empleado) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
  res.json({ ok: true, empleado });
});

router.delete('/:id', requireEmpresa, requireAdminFormato3, async (req, res) => {
  const r = await EmpleadoLista.findOneAndDelete({
    _id: req.params.id,
    empresa_id: req.session.empresa.id
  });
  if (!r) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
  res.json({ ok: true });
});

module.exports = router;
