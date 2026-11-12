// panel secreto del superadmin: se desbloquea con un codigo escrito en un campo cualquiera.
// sin el codigo, todo aqui responde como si no existiera
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Empresa = require('../../../models/Empresa');
const { guardarLogo, borrarLogo } = require('../../../servicios/almacenamiento');
const { MODULO, DURACION_DESBLOQUEO_MS } = require('../config');
const { esSuperadmin } = require('../contexto');
const { borrarTodoDelHogar } = require('../servicios/despensa');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const noExiste = res => res.status(404).json({ ok: false, error: 'No encontrado' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext) || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      return cb(Object.assign(new Error('La foto debe ser png, jpg o webp.'), { status: 400 }), false);
    }
    cb(null, true);
  }
});
const conFoto = (req, res, next) => upload.single('foto')(req, res, err => {
  if (!err) return next();
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa más de 2 MB.' : err.message;
  res.status(400).json({ ok: false, error: msg });
});

// los intentos fallidos cuentan; los buenos no
const limite = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  skipSuccessfulRequests: true, requestWasSuccessful: (req, res) => res.locals.codigoOk === true,
  message: { ok: false }
});

function codigoCorrecto(valor) {
  const esperado = process.env.FOODSAVER_CODIGO;
  if (!esperado || typeof valor !== 'string') return false;
  const a = crypto.createHash('sha256').update(esperado).digest(), b = crypto.createHash('sha256').update(valor.trim()).digest();
  return crypto.timingSafeEqual(a, b);
}

function desbloqueado(req) {
  return esSuperadmin(req) && req.session.ocultoHasta && req.session.ocultoHasta > Date.now();
}
const conDesbloqueo = (req, res, next) => (desbloqueado(req) ? next() : noExiste(res));

// nombre neutro a proposito: lo llama el campo de Google Sheets del formulario de empresas
router.post('/verificar-campo', limite, (req, res) => {
  if (!esSuperadmin(req)) return noExiste(res);
  const valor = req.body && req.body.valor;
  if (typeof valor !== 'string' || valor.length < 4 || valor.length > 64 || valor.includes('/') || !codigoCorrecto(valor)) {
    return res.json({ ok: false });
  }
  res.locals.codigoOk = true;
  req.session.ocultoHasta = Date.now() + DURACION_DESBLOQUEO_MS;
  res.json({ ok: true, script: '/api/superadmin/oculto/panel.js' });
});

router.get('/oculto/panel.js', conDesbloqueo, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'web', 'panel-hogares.js'));
});

router.post('/oculto/salir', (req, res) => {
  if (req.session) delete req.session.ocultoHasta;
  res.json({ ok: true });
});

const plano = e => ({ id: String(e._id), nombre: e.nombre, email: e.email, foto: e.logo || '', activa: e.activa !== false, creada: e.createdAt });

router.get('/oculto/hogares', conDesbloqueo, ah(async (req, res) => {
  const hogares = await Empresa.find({ oculta: true }).sort({ nombre: 1 }).lean();
  res.json({ ok: true, hogares: hogares.map(plano) });
}));

router.post('/oculto/hogares', conDesbloqueo, conFoto, ah(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim().slice(0, 60);
  const email = String(req.body.email || '').toLowerCase().trim().slice(0, 200);
  const password = String(req.body.password || '');
  if (!nombre) return res.status(400).json({ ok: false, error: 'Escribe el nombre del hogar.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Escribe un correo válido.' });
  if (password.length < 8) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (await Empresa.exists({ email })) return res.status(409).json({ ok: false, error: 'Ya hay una cuenta con ese correo.' });
  const logo = req.file ? await guardarLogo(req.file.buffer, path.extname(req.file.originalname).toLowerCase()) : '';
  const e = await Empresa.create({
    nombre, email, passwordHash: await bcrypt.hash(password, 12), logo,
    oculta: true, modulosActivos: [MODULO]
  });
  res.status(201).json({ ok: true, hogar: plano(e) });
}));

async function hogarDe(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Empresa.findOne({ _id: req.params.id, oculta: true });
}

router.put('/oculto/hogares/:id', conDesbloqueo, conFoto, ah(async (req, res) => {
  const e = await hogarDe(req);
  if (!e) return noExiste(res);
  if (req.body.nombre !== undefined) {
    const n = String(req.body.nombre).trim().slice(0, 60);
    if (!n) return res.status(400).json({ ok: false, error: 'El nombre no puede quedar vacío.' });
    e.nombre = n;
  }
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
    e.passwordHash = await bcrypt.hash(String(req.body.password), 12);
  }
  if (req.body.activa !== undefined) e.activa = req.body.activa === true || req.body.activa === 'true';
  if (req.file) {
    const vieja = e.logo;
    e.logo = await guardarLogo(req.file.buffer, path.extname(req.file.originalname).toLowerCase());
    if (vieja) await borrarLogo(vieja);
  }
  // un hogar siempre se queda solo con su modulo
  e.modulosActivos = [MODULO];
  await e.save();
  res.json({ ok: true, hogar: plano(e) });
}));

router.delete('/oculto/hogares/:id', conDesbloqueo, ah(async (req, res) => {
  const e = await hogarDe(req);
  if (!e) return noExiste(res);
  if (e.activa !== false) return res.status(409).json({ ok: false, error: 'Primero desactiva el hogar.' });
  if (String((req.body && req.body.confirmacion) || '').trim() !== e.nombre) {
    return res.status(400).json({ ok: false, error: 'Escribe el nombre exacto del hogar para confirmar.' });
  }
  await borrarTodoDelHogar(e._id);
  await borrarLogo(e.logo);
  await e.deleteOne();
  res.json({ ok: true });
}));

module.exports = router;
