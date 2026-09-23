const express = require('express');
const bcrypt = require('bcryptjs');
const Administrador = require('../models/Administrador');
const { requireEmpresa, ah } = require('../middleware/sesion');
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

function adminReporteActivo(req) {
  const r = req.session && req.session.adminReporte;
  if (!r) return false;
  if (Date.now() - r.ts > MAX_EDAD_MS) return false;
  return true;
}

function adminInspeccionActivo(req) {
  const i = req.session && req.session.adminInspeccion;
  if (!i) return false;
  if (Date.now() - i.ts > MAX_EDAD_MS) return false;
  return true;
}

// la verificacion para dias atrasados es INDEPENDIENTE por carpeta.
// la sesion guarda { cocina: { ts }, salon: { ts }, administracion: { ts } }.
// si la sesion vieja tiene formato distinto (un solo { ts }) lo trato como invalido.
function adminAtrasadoActivo(req, carpeta) {
  if (!carpeta) return false;
  const m = req.session && req.session.adminAtrasado;
  if (!m || typeof m !== 'object') return false;
  const sub = m[carpeta];
  if (!sub || !sub.ts) return false;
  if (Date.now() - sub.ts > MAX_EDAD_MS) return false;
  return true;
}

// Verifica contraseña para entrar a la carpeta Administración
router.post('/verificar-carpeta', limiteAdmin, requireEmpresa, ah(async (req, res) => {
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
}));

// Devuelve si hay sesión activa para la carpeta Administración
router.get('/estado-carpeta', requireEmpresa, (req, res) => {
  const nombre = adminCarpetaAdministracionActivo(req);
  res.json({ ok: true, activo: !!nombre, nombre: nombre || null });
});

// Verifica contraseña para llenar días atrasados (se pide al entrar al formato).
// Requiere ahora la carpeta para guardar el marcador especifico de esa seccion.
router.post('/verificar-atrasado', limiteAdmin, requireEmpresa, ah(async (req, res) => {
  const { password, carpeta } = req.body;
  if (!password) return res.status(400).json({ ok: false, error: 'Falta la contraseña' });
  if (!['cocina', 'salon', 'administracion'].includes(carpeta)) {
    return res.status(400).json({ ok: false, error: 'Carpeta inválida' });
  }
  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }
  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) {
      // si la sesion tiene formato viejo (sin sub-objetos por carpeta), la reseteo
      if (!req.session.adminAtrasado || typeof req.session.adminAtrasado.ts === 'number') {
        req.session.adminAtrasado = {};
      }
      req.session.adminAtrasado[carpeta] = { ts: Date.now() };
      return res.json({ ok: true });
    }
  }
  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
}));

router.post('/verificar-historial', limiteAdmin, requireEmpresa, ah(async (req, res) => {
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
}));

router.post('/verificar-reporte', limiteAdmin, requireEmpresa, ah(async (req, res) => {
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
      req.session.adminReporte = { nombre: a.nombre, ts: Date.now() };
      return res.json({ ok: true, nombre: a.nombre });
    }
  }
  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
}));

router.post('/verificar-inspeccion', limiteAdmin, requireEmpresa, ah(async (req, res) => {
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
      req.session.adminInspeccion = { nombre: a.nombre, ts: Date.now() };
      return res.json({ ok: true, nombre: a.nombre });
    }
  }
  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
}));

// Limpia las verificaciones que SÍ dependen del contexto de navegación
// (acceso a Administración, historial, reporte e inspección). Corregir un
// registro reusa el mismo marcador que el reporte (adminReporte), no tiene
// uno propio. El marcador `adminAtrasado` NO se limpia aquí porque debe
// persistir toda la sesión (8 h): es una sola verificación válida para
// cualquier formato.
router.post('/limpiar', requireEmpresa, (req, res) => {
  req.session.adminCarpetaAdministracion = null;
  req.session.adminHistorial = null;
  req.session.adminReporte = null;
  req.session.adminInspeccion = null;
  res.json({ ok: true });
});

module.exports = router;
module.exports.adminCarpetaAdministracionActivo = adminCarpetaAdministracionActivo;
module.exports.adminHistorialActivo = adminHistorialActivo;
module.exports.adminAtrasadoActivo = adminAtrasadoActivo;
module.exports.adminReporteActivo = adminReporteActivo;
module.exports.adminInspeccionActivo = adminInspeccionActivo;
