const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const Empresa = require('../models/Empresa');
const { MODULOS_VALIDOS } = Empresa;
const Administrador = require('../models/Administrador');
const EmpleadoLista = require('../models/EmpleadoLista');
const Registro = require('../models/Registro');
const Asistencia = require('../models/Asistencia');
const Documento = require('../models/Documento');
const SaldoHorasExtra = require('../models/SaldoHorasExtra');
const { FORMATOS } = require('../formatos');
const { requireSuperadmin, ah } = require('../middleware/sesion');
const googleSheets = require('../servicios/googleSheets');
const { guardarLogo, borrarLogo } = require('../servicios/almacenamiento');

const IDS_FORMATOS = FORMATOS.map(f => f.id);

function extraerSheetId(valor) {
  if (!valor) return '';
  const v = String(valor).trim();
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : v;
}

const router = express.Router();

// ojo: SVG fuera de la lista porque puede traer <script> y nos hace XSS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    const extOk = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    const mimeOk = ['image/png', 'image/jpeg', 'image/webp'].includes(mime);
    if (!extOk || !mimeOk) return cb(new Error('Solo imágenes png/jpg/webp'), false);
    cb(null, true);
  }
});

router.get('/catalogo', requireSuperadmin, (req, res) => {
  res.json({ ok: true, formatos: FORMATOS });
});

router.get('/google-info', requireSuperadmin, (req, res) => {
  res.json({
    ok: true,
    disponible: googleSheets.estaDisponible(),
    cuentaServicio: googleSheets.getCuentaServicio()
  });
});

router.get('/empresas', requireSuperadmin, ah(async (req, res) => {
  const empresas = await Empresa.find().sort({ nombre: 1 }).lean();
  res.json({ ok: true, empresas });
}));

function passwordDebil(password, minimo = 8) {
  return !password || String(password).length < minimo;
}

const DIAS_JORNADA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
function parsearJornadaEsperada(body) {
  const jornada = {};
  DIAS_JORNADA.forEach(dia => {
    const v = parseFloat(body[`jornada_${dia}`]);
    jornada[dia] = (!isNaN(v) && v >= 0 && v <= 24) ? v : 7;
  });
  return jornada;
}

function parsearListaFormatos(valor) {
  let lista = [];
  if (Array.isArray(valor)) lista = valor;
  else if (typeof valor === 'string' && valor.length > 0) lista = [valor];
  lista = lista.map(s => String(s).trim()).filter(Boolean);
  const sinDuplicados = Array.from(new Set(lista));
  return sinDuplicados.filter(id => IDS_FORMATOS.includes(id));
}

function parsearCarpetas(body, activos) {
  // Cada carpeta es un campo de checkboxes: carpeta_cocina, carpeta_salon, carpeta_administracion
  // Un formato puede estar en ninguna, una o varias carpetas
  const extraer = campo => parsearListaFormatos(body[campo]).filter(id => activos.includes(id));
  const cocina        = extraer('carpeta_cocina');
  const salon         = extraer('carpeta_salon');
  const administracion= extraer('carpeta_administracion');

  // Si un formato activo no quedó en ninguna carpeta, lo ponemos en cocina por defecto
  const conAlguna = new Set([...cocina, ...salon, ...administracion]);
  activos.filter(id => !conAlguna.has(id)).forEach(id => cocina.push(id));

  return { cocina, salon, administracion };
}

function parsearModulos(valor) {
  let lista = Array.isArray(valor) ? valor : (typeof valor === 'string' && valor.length > 0 ? [valor] : []);
  lista = lista.map(s => String(s).trim()).filter(s => MODULOS_VALIDOS.includes(s));
  // si no marcan ninguno, por seguridad les dejo formatos al menos (no quiero empresas zombi sin nada)
  if (lista.length === 0) lista = ['formatos'];
  return Array.from(new Set(lista));
}

function parsearCompartidos(body, activos, carpetas) {
  // solo marca como compartido los formatos que estan en 2+ carpetas
  // (no tiene sentido marcar como compartido un formato que solo esta en una)
  const ids = parsearListaFormatos(body.formatosCompartidos);
  return ids.filter(id => {
    if (!activos.includes(id)) return false;
    const en = [carpetas.cocina, carpetas.salon, carpetas.administracion]
      .filter(arr => arr.includes(id)).length;
    return en >= 2;
  });
}

router.post('/empresas', requireSuperadmin, upload.single('logo'), async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Nombre, email y contraseña son obligatorios' });
    }
    if (passwordDebil(password)) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const formatosActivos = parsearListaFormatos(req.body.formatosActivos);
    if (formatosActivos.length === 0) {
      return res.status(400).json({ ok: false, error: 'Selecciona al menos un formato para esta empresa' });
    }

    const formatosCarpeta = parsearCarpetas(req.body, formatosActivos);
    const formatosCompartidos = parsearCompartidos(req.body, formatosActivos, formatosCarpeta);
    const modulosActivos = parsearModulos(req.body.modulosActivos);
    const jornadaEsperada = parsearJornadaEsperada(req.body);

    const yaExiste = await Empresa.findOne({ email: email.toLowerCase().trim() });
    if (yaExiste) {
      return res.status(409).json({ ok: false, error: 'Ya existe una empresa con ese email' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const logoRuta = req.file ? await guardarLogo(req.file.buffer, path.extname(req.file.originalname).toLowerCase()) : '';
    const empresa = await Empresa.create({
      nombre: nombre.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      logo: logoRuta,
      googleSheetId: extraerSheetId(req.body.googleSheetId),
      formatosActivos,
      formatosCarpeta,
      formatosCompartidos,
      modulosActivos,
      jornadaEsperada
    });
    res.status(201).json({
      ok: true,
      empresa: {
        id: empresa._id,
        nombre: empresa.nombre,
        email: empresa.email,
        logo: empresa.logo,
        googleSheetId: empresa.googleSheetId,
        formatosActivos: empresa.formatosActivos,
        formatosCarpeta: empresa.formatosCarpeta,
        formatosCompartidos: empresa.formatosCompartidos,
        jornadaEsperada: empresa.jornadaEsperada
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/empresas/:id', requireSuperadmin, ah(async (req, res) => {
  // sin .lean() a proposito: asi mongoose rellena jornadaEsperada con sus
  // defaults si la empresa es de antes de que existiera ese campo
  const empresa = await Empresa.findById(req.params.id).select('-passwordHash');
  if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
  res.json({ ok: true, empresa });
}));

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
      if (passwordDebil(req.body.password)) {
        return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      empresa.passwordHash = await bcrypt.hash(req.body.password, 12);
    }

    if (req.file) {
      const logoViejo = empresa.logo;
      empresa.logo = await guardarLogo(req.file.buffer, path.extname(req.file.originalname).toLowerCase());
      if (logoViejo) await borrarLogo(logoViejo);
    }

    if (req.body.googleSheetId !== undefined) {
      empresa.googleSheetId = extraerSheetId(req.body.googleSheetId);
    }

    if (req.body.formatosActivos !== undefined) {
      const lista = parsearListaFormatos(req.body.formatosActivos);
      if (lista.length === 0) {
        return res.status(400).json({ ok: false, error: 'Selecciona al menos un formato' });
      }
      empresa.formatosActivos = lista;
    }

    empresa.formatosCarpeta = parsearCarpetas(req.body, empresa.formatosActivos);
    empresa.formatosCompartidos = parsearCompartidos(req.body, empresa.formatosActivos, empresa.formatosCarpeta);
    if (req.body.modulosActivos !== undefined) {
      empresa.modulosActivos = parsearModulos(req.body.modulosActivos);
    }
    empresa.jornadaEsperada = parsearJornadaEsperada(req.body);

    await empresa.save();
    res.json({
      ok: true,
      empresa: {
        id: empresa._id,
        nombre: empresa.nombre,
        email: empresa.email,
        logo: empresa.logo,
        googleSheetId: empresa.googleSheetId,
        formatosActivos: empresa.formatosActivos,
        formatosCarpeta: empresa.formatosCarpeta,
        formatosCompartidos: empresa.formatosCompartidos,
        jornadaEsperada: empresa.jornadaEsperada
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/empresas/:id/desactivar', requireSuperadmin, ah(async (req, res) => {
  const empresa = await Empresa.findById(req.params.id);
  if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
  empresa.activa = false;
  await empresa.save();
  res.json({ ok: true });
}));

router.post('/empresas/:id/reactivar', requireSuperadmin, ah(async (req, res) => {
  const empresa = await Empresa.findById(req.params.id);
  if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
  empresa.activa = true;
  await empresa.save();
  res.json({ ok: true });
}));

router.delete('/empresas/:id', requireSuperadmin, async (req, res) => {
  try {
    const empresa = await Empresa.findById(req.params.id);
    if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });
    if (empresa.activa !== false) {
      return res.status(409).json({ ok: false, error: 'Primero debes desactivar la empresa antes de eliminarla definitivamente' });
    }
    const confirmacion = String((req.body && req.body.confirmacion) || '').trim();
    if (confirmacion !== empresa.nombre) {
      return res.status(400).json({ ok: false, error: 'El nombre de confirmación no coincide con el de la empresa' });
    }

    const empresaId = empresa._id;
    await Administrador.deleteMany({ empresa_id: empresaId });
    await EmpleadoLista.deleteMany({ empresa_id: empresaId });
    await Registro.deleteMany({ empresa_id: empresaId });
    await Asistencia.deleteMany({ empresa_id: empresaId });
    await Documento.deleteMany({ empresa_id: empresaId });
    await SaldoHorasExtra.deleteMany({ empresa_id: empresaId });

    // ojo: esto solo limpia disco local. con Cloudinary activo, las fotos/documentos
    // de esta empresa quedan huerfanos alla (el logo si se borra, via borrarLogo)
    const dirAsistencia = path.join(__dirname, '..', 'datos', 'asistencia', String(empresaId));
    const dirExcel = path.join(__dirname, '..', 'datos', 'excel', String(empresaId));
    const dirDocumentos = path.join(__dirname, '..', 'datos', 'documentos', String(empresaId));
    await fs.promises.rm(dirAsistencia, { recursive: true, force: true });
    await fs.promises.rm(dirExcel, { recursive: true, force: true });
    await fs.promises.rm(dirDocumentos, { recursive: true, force: true });
    await borrarLogo(empresa.logo);

    await empresa.deleteOne();
    res.json({ ok: true });
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
    if (passwordDebil(password, 4)) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const empresa = await Empresa.findById(empresa_id);
    if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await Administrador.create({ nombre: nombre.trim(), passwordHash, empresa_id });
    res.status(201).json({ ok: true, administrador: { id: admin._id, nombre: admin.nombre, empresa_id: admin.empresa_id } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/administradores', requireSuperadmin, ah(async (req, res) => {
  const admins = await Administrador.find()
    .select('-passwordHash')
    .populate('empresa_id', 'nombre')
    .sort({ nombre: 1 })
    .lean();
  res.json({ ok: true, administradores: admins });
}));

module.exports = router;
