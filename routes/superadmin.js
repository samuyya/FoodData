const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');

const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');
const { requireSuperadmin } = require('../middleware/sesion');

const router = express.Router();

const carpetaLogos = path.join(__dirname, '..', 'public', 'img', 'logos');
if (!fs.existsSync(carpetaLogos)) fs.mkdirSync(carpetaLogos, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, carpetaLogos),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `logo-${Date.now()}${ext}`;
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Solo imágenes png/jpg/webp/svg'), ok);
  }
});

router.get('/empresas', requireSuperadmin, async (req, res) => {
  const empresas = await Empresa.find().sort({ nombre: 1 }).lean();
  res.json({ ok: true, empresas });
});

router.post('/empresas', requireSuperadmin, upload.single('logo'), async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, email y contraseña son obligatorios' });
    }
    const yaExiste = await Empresa.findOne({ email: email.toLowerCase().trim() });
    if (yaExiste) {
      return res.status(409).json({ ok: false, error: 'Ya existe una empresa con ese email' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const logoRuta = req.file ? `/img/logos/${req.file.filename}` : '';
    const empresa = await Empresa.create({
      nombre: nombre.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      logo: logoRuta
    });
    res.status(201).json({ ok: true, empresa: { id: empresa._id, nombre: empresa.nombre, email: empresa.email, logo: empresa.logo } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/administradores', requireSuperadmin, async (req, res) => {
  try {
    const { nombre, password, empresa_id } = req.body;
    if (!nombre || !password || !empresa_id) {
      return res.status(400).json({ ok: false, error: 'Nombre, contraseña y empresa son obligatorios' });
    }
    const empresa = await Empresa.findById(empresa_id);
    if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await Administrador.create({ nombre: nombre.trim(), passwordHash, empresa_id });
    res.status(201).json({ ok: true, administrador: { id: admin._id, nombre: admin.nombre, empresa_id: admin.empresa_id } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/administradores', requireSuperadmin, async (req, res) => {
  const admins = await Administrador.find().populate('empresa_id', 'nombre').sort({ nombre: 1 }).lean();
  res.json({ ok: true, administradores: admins });
});

module.exports = router;
