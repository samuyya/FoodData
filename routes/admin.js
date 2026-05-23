const express = require('express');
const bcrypt = require('bcryptjs');
const Administrador = require('../models/Administrador');
const { requireEmpresa } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');

const router = express.Router();

const MAX_EDAD_MS = 8 * 60 * 60 * 1000;

function adminCarpetaAdministracionActivo(req) {
  const p = req.session && req.session.adminCarpetaAdministracion;
  if (!p) return null;
  if (Date.now() - p.ts > MAX_EDAD_MS) return null;
  return p.nombre;
}

function adminHistorialActivo(req) {
  const h = req.session && req.session.adminHistorial;
  if (!h) return false;
  if (Date.now() - h.ts > MAX_EDAD_MS) return false;
  return true;
}

// Verifica contraseña para entrar a la carpeta Administración
router.post('/verificar-carpeta', limiteAdmin, requireEmpresa, async (req, res) => {
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
      req.session.adminCarpetaAdministracion = { nombre: a.nombre, ts: Date.now() };
      return res.json({ ok: true, nombre: a.nombre });
    }
  }
  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
});

// Devuelve si hay sesión activa para la carpeta Administración
router.get('/estado-carpeta', requireEmpresa, (req, res) => {
  const nombre = adminCarpetaAdministracionActivo(req);
  res.json({ ok: true, activo: !!nombre, nombre: nombre || null });
});

router.post('/verificar-historial', limiteAdmin, requireEmpresa, async (req, res) => {
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
  req.session.adminCarpetaAdministracion = null;
  req.session.adminHistorial = null;
  req.session.adminAtrasado = null;
  res.json({ ok: true });
});

module.exports = router;
module.exports.adminCarpetaAdministracionActivo = adminCarpetaAdministracionActivo;
module.exports.adminHistorialActivo = adminHistorialActivo;
