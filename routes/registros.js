const express = require('express');
const mongoose = require('mongoose');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const { FORMATOS, getFormato } = require('../formatos');
const { requireEmpresa } = require('../middleware/sesion');
const { adminVerificadoPara, adminHistorialActivo } = require('./admin');

const router = express.Router();

const REGEX_LETRAS = /^[A-Za-zÀ-ÿÑñ\s]+$/;

async function empresaTieneFormato(empresaId, formatoId) {
  const e = await Empresa.findById(empresaId).select('formatosActivos').lean();
  const activos = (e && e.formatosActivos && e.formatosActivos.length > 0)
    ? e.formatosActivos
    : FORMATOS.map(f => f.id);
  return activos.includes(formatoId);
}

function partesDeHoy() {
  const ahora = new Date();
  return {
    dia: ahora.getDate(),
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
}

async function infoPendientes(empresaId, formatoId) {
  const { dia, mes, anio } = partesDeHoy();
  const guardados = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId,
    anio, mes,
    dia: { $lte: dia }
  }).sort({ dia: 1 }).lean();

  const set = new Set(guardados.map(g => g.dia));
  const pendientes = [];
  for (let d = 1; d <= dia; d++) {
    if (!set.has(d)) pendientes.push(d);
  }
  const siguienteDia = pendientes.length > 0 ? pendientes[0] : null;
  const registroHoy = guardados.find(g => g.dia === dia) || null;

  return {
    diaActual: dia,
    mes, anio,
    pendientes,
    diasGuardados: guardados.map(g => g.dia),
    siguienteDia,
    completoHoy: pendientes.length === 0,
    registroHoy,
    registrosMes: guardados
  };
}

router.get('/pendientes/:formatoId', requireEmpresa, async (req, res) => {
  const { formatoId } = req.params;
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
  if (!habilitado) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }
  const info = await infoPendientes(req.session.empresa.id, formatoId);
  res.json({ ok: true, ...info });
});

router.get('/hoy/:formatoId', requireEmpresa, async (req, res) => {
  const { formatoId } = req.params;
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const { dia, mes, anio } = partesDeHoy();
  const registro = await Registro.findOne({
    empresa_id: req.session.empresa.id,
    formato: formatoId,
    dia, mes, anio
  }).lean();
  res.json({ ok: true, registro });
});

router.post('/', requireEmpresa, async (req, res) => {
  try {
    const { formatoId, responsable, observaciones, datos } = req.body;
    const formato = getFormato(formatoId);
    if (!formato) return res.status(400).json({ ok: false, error: 'Formato no válido' });

    const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
    if (!habilitado) return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });

    const info = await infoPendientes(req.session.empresa.id, formatoId);
    if (info.completoHoy) {
      return res.status(409).json({ ok: false, error: 'Ya completaste todos los días de este mes hasta hoy' });
    }

    let nombreResponsable;
    if (formato.restringido) {
      const adminNombre = adminVerificadoPara(req, formatoId);
      if (!adminNombre) {
        return res.status(401).json({ ok: false, error: 'Se requiere verificación de administrador para guardar este formato' });
      }
      nombreResponsable = adminNombre;
    } else {
      const limpio = (responsable || '').trim();
      if (!limpio) return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
      if (!REGEX_LETRAS.test(limpio)) return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });
      nombreResponsable = limpio;
    }

    const dia = info.siguienteDia;
    const fecha = new Date(info.anio, info.mes - 1, dia);

    const registro = await Registro.create({
      empresa_id: req.session.empresa.id,
      formato: formatoId,
      fecha,
      dia,
      mes: info.mes,
      anio: info.anio,
      responsable: nombreResponsable,
      observaciones: (observaciones || '').trim(),
      datos: datos || {}
    });

    const infoNuevo = await infoPendientes(req.session.empresa.id, formatoId);
    res.status(201).json({ ok: true, registro, info: infoNuevo });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro para ese día' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/meses/:formatoId', requireEmpresa, async (req, res) => {
  const { formatoId } = req.params;
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const empresaId = new mongoose.Types.ObjectId(req.session.empresa.id);
  const agregados = await Registro.aggregate([
    { $match: { empresa_id: empresaId, formato: formatoId } },
    { $group: { _id: { anio: '$anio', mes: '$mes' }, count: { $sum: 1 } } },
    { $sort: { '_id.anio': -1, '_id.mes': -1 } }
  ]);
  const meses = agregados.map(m => ({ anio: m._id.anio, mes: m._id.mes, count: m.count }));
  res.json({ ok: true, meses });
});

router.get('/historial/:formatoId', requireEmpresa, async (req, res) => {
  const { formatoId } = req.params;
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
  if (!habilitado) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }

  const hoy = partesDeHoy();
  const anio = parseInt(req.query.anio || hoy.anio, 10);
  const mes = parseInt(req.query.mes || hoy.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const esMesActual = (anio === hoy.anio && mes === hoy.mes);
  if (!esMesActual) {
    if (!adminHistorialActivo(req)) {
      return res.status(401).json({ ok: false, error: 'Requiere verificación de administrador para meses anteriores' });
    }
  }

  const registros = await Registro.find({
    empresa_id: req.session.empresa.id,
    formato: formatoId,
    anio, mes
  }).sort({ dia: 1 }).lean();

  res.json({ ok: true, anio, mes, esMesActual, registros });
});

module.exports = router;
