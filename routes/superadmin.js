const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');

const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');
const { FORMATOS } = require('../formatos');
const { requireSuperadmin } = require('../middleware/sesion');

const IDS_FORMATOS = FORMATOS.map(f => f.id);

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

router.get('/catalogo', requireSuperadmin, (req, res) => {
  res.json({ ok: true, formatos: FORMATOS });
});

router.get('/empresas', requireSuperadmin, async (req, res) => {
  const empresas = await Empresa.find().sort({ nombre: 1 }).lean();
  res.json({ ok: true, empresas });
});

function parsearFormatosActivos(valor) {
  let lista = [];
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === 'string' && valor.length > 0) lista = [valor];
  lista = lista.map(s => String(s).trim()).filter(Boolean);
  const sinDuplicados = Array.from(new Set(lista));
  return sinDuplicados.filter(id => IDS_FORMATOS.includes(id));
}

router.post('/empresas', requireSuperadmin, upload.single('logo'), async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, email y contraseña son obligatorios' });
    }

    const formatosActivos = parsearFormatosActivos(req.body.formatosActivos);
    if (formatosActivos.length === 0) {
      return res.status(400).json({ ok: false, error: 'Selecciona al menos un formato para esta empresa' });
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
      logo: logoRuta,
      formatosActivos
    });
    res.status(201).json({
      ok: true,
      empresa: {
        id: empresa._id,
        nombre: empresa.nombre,
        email: empresa.email,
        logo: empresa.logo,
        formatosActivos: empresa.formatosActivos
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/empresas/:id', requireSuperadmin, async (req, res) => {
  const empresa = await Empresa.findById(req.params.id).select('-passwordHash').lean();
  if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
  res.json({ ok: true, empresa });
});

router.put('/empresas/:id', requireSuperadmin, upload.single('logo'), async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    if (req.body.nombre !== undefined) {
      const nuevoNombre = String(req.body.nombre).trim();
      if (!nuevoNombre) {
        return res.status(400).json({ ok: false, error: 'El nombre no puede estar vacío' });
      }
      empresa.nombre = nuevoNombre;
    }

    if (req.body.password !== undefined && String(req.body.password).trim() !== '') {
      empresa.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    if (req.file) {
      empresa.logo = `/img/logos/${req.file.filename}`;
    }

    if (req.body.formatosActivos !== undefined) {
      const lista = parsearFormatosActivos(req.body.formatosActivos);
      if (lista.length === 0) {
        return res.status(400).json({ ok: false, error: 'Selecciona al menos un formato' });
      }
      empresa.formatosActivos = lista;
    }

    await empresa.save();
    res.json({
      ok: true,
      empresa: {
        id: empresa._id,
        nombre: empresa.nombre,
        email: empresa.email,
        logo: empresa.logo,
        formatosActivos: empresa.formatosActivos
      }
    });
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
