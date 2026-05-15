const express = require('express');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const { FORMATOS, getFormato } = require('../formatos');
const { requireEmpresa } = require('../middleware/sesion');
const { adminVerificadoPara } = require('./admin');

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
    fecha: ahora,
    dia: ahora.getDate(),
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
}

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
    if (!formato) {
      return res.status(400).json({ ok: false, error: 'Formato no válido' });
    }
    const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
    if (!habilitado) {
      return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
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
      if (!limpio) {
        return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
      }
      if (!REGEX_LETRAS.test(limpio)) {
        return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });
      }
      nombreResponsable = limpio;
    }

    const { fecha, dia, mes, anio } = partesDeHoy();
    const registro = await Registro.create({
      empresa_id: req.session.empresa.id,
      formato: formatoId,
      fecha, dia, mes, anio,
      responsable: nombreResponsable,
      observaciones: (observaciones || '').trim(),
      datos: datos || {}
    });
    res.status(201).json({ ok: true, registro });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro para hoy en este formato' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
