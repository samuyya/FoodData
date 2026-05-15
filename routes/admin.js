const express = require('express');
const bcrypt = require('bcrypt');
const Administrador = require('../models/Administrador');
const { getFormato } = require('../formatos');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

const MAX_EDAD_MS = 8 * 60 * 60 * 1000;

function adminVerificadoPara(req, formatoId) {
  const p = req.session && req.session.adminPendiente;
  if (!p) return null;
  if (p.formatoId !== formatoId) return null;
  if (Date.now() - p.ts > MAX_EDAD_MS) return null;
  return p.nombre;
}

function adminHistorialActivo(req) {
  const h = req.session && req.session.adminHistorial;
  if (!h) return false;
  if (Date.now() - h.ts > MAX_EDAD_MS) return false;
  return true;
}

router.post('/verificar', requireEmpresa, async (req, res) => {
  const { password, formatoId } = req.body;
  if (!password || !formatoId) {
    return res.status(400).json({ ok: false, error: 'Falta la contraseña o el formato' });
  }

  const formato = getFormato(formatoId);
  if (!formato) {
    return res.status(400).json({ ok: false, error: 'Formato no válido' });
  }
  if (!formato.restringido) {
    return res.status(400).json({ ok: false, error: 'Este formato no requiere contraseña' });
  }

  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }

  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) {
      req.session.adminPendiente = { formatoId, nombre: a.nombre, ts: Date.now() };
      return res.json({ ok: true });
    }
  }

  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
});

router.post('/verificar-historial', requireEmpresa, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Falta la contraseña' });
  }
  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }
  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) {
      req.session.adminHistorial = { nombre: a.nombre, ts: Date.now() };
      return res.json({ ok: true, nombre: a.nombre });
    }
  }
  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
});

router.post('/limpiar', requireEmpresa, (req, res) => {
  req.session.adminPendiente = null;
  req.session.adminHistorial = null;
  res.json({ ok: true });
});

router.get('/consumir', requireEmpresa, (req, res) => {
  const { formatoId } = req.query;
  const nombre = adminVerificadoPara(req, formatoId);
  if (!nombre) {
    req.session.adminPendiente = null;
    return res.status(401).json({ ok: false, error: 'Verificación de administrador requerida' });
  }
  res.json({ ok: true, nombre });
});

module.exports = router;
module.exports.adminVerificadoPara = adminVerificadoPara;
module.exports.adminHistorialActivo = adminHistorialActivo;
