const express = require('express');
const fs = require('fs');
const multer = require('multer');
const Documento = require('../models/Documento');
const Empresa = require('../models/Empresa');
const { requireEmpresa, requireSuperadmin, ah } = require('../middleware/sesion');
const { guardarDocumentoPrograma, rutaAbsolutaDocumento, borrarDocumento } = require('../servicios/almacenamiento');

const router = express.Router();

// hasta 10MB por archivo. acepto imagenes, pdf, office, txt — lo necesario para
// las fichas tecnicas, cronogramas y certificados de cada programa.
const TIPOS_OK = /^(image\/(png|jpe?g|webp|gif)|application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/)/;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = TIPOS_OK.test((file.mimetype || '').toLowerCase());
    cb(ok ? null : new Error('Tipo de archivo no permitido (usa PDF, imagen, Word, Excel o texto)'), ok);
  }
});

function numeroValido(s) {
  const n = parseInt(s, 10);
  return (!isNaN(n) && n >= 1 && n <= 11) ? n : null;
}

// listar docs de un programa de una empresa.
// - si soy empresa: solo veo los mios.
// - si soy superadmin: paso ?empresa_id=... para ver los de cualquier empresa.
router.get('/programa/:numero', ah(async (req, res) => {
  const num = numeroValido(req.params.numero);
  if (!num) return res.status(400).json({ ok: false, error: 'Programa inválido' });

  let empresaId;
  if (req.session && req.session.empresa) {
    // las empresas solo ven sus docs si tienen activo el modulo "programas"
    const mods = req.session.empresa.modulosActivos || ['formatos', 'asistencia', 'capacitaciones', 'programas'];
    if (!mods.includes('programas')) {
      return res.status(403).json({ ok: false, error: 'Tu empresa no tiene el módulo de Programas habilitado' });
    }
    empresaId = req.session.empresa.id;
  } else if (req.session && req.session.superadmin) {
    empresaId = req.query.empresa_id;
    if (!empresaId) return res.status(400).json({ ok: false, error: 'Falta empresa_id' });
  } else {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }

  const docs = await Documento.find({ empresa_id: empresaId, programaNumero: num })
    .select('-rutaArchivo')  // la ruta del disco no se la mando al cliente
    .sort({ createdAt: -1 })
    .lean();

  res.json({ ok: true, documentos: docs });
}));

// subir un doc (solo superadmin)
router.post('/programa/:numero', requireSuperadmin, upload.single('archivo'), async (req, res) => {
  try {
    const num = numeroValido(req.params.numero);
    if (!num) return res.status(400).json({ ok: false, error: 'Programa inválido' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'Falta el archivo' });

    const { empresa_id, descripcion } = req.body;
    if (!empresa_id) return res.status(400).json({ ok: false, error: 'Falta la empresa' });
    const empresa = await Empresa.findById(empresa_id).select('_id').lean();
    if (!empresa) return res.status(404).json({ ok: false, error: 'Empresa no encontrada' });

    const ref = await guardarDocumentoPrograma(empresa_id, num, req.file.originalname, req.file.buffer);
    const doc = await Documento.create({
      empresa_id,
      programaNumero: num,
      nombreOriginal: req.file.originalname,
      rutaArchivo: ref,
      mimeType: req.file.mimetype,
      tamanoBytes: req.file.size,
      descripcion: String(descripcion || '').trim().slice(0, 500)
    });

    res.status(201).json({
      ok: true,
      documento: {
        _id: doc._id,
        empresa_id: doc.empresa_id,
        programaNumero: doc.programaNumero,
        nombreOriginal: doc.nombreOriginal,
        mimeType: doc.mimeType,
        tamanoBytes: doc.tamanoBytes,
        descripcion: doc.descripcion,
        createdAt: doc.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// descargar el archivo. empresas solo descargan los suyos, superadmin todo.
router.get('/:id/descargar', ah(async (req, res) => {
  const doc = await Documento.findById(req.params.id);
  if (!doc) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });

  const esSuper = req.session && req.session.superadmin;
  const esDuena = req.session && req.session.empresa && req.session.empresa.id === doc.empresa_id.toString();
  if (!esSuper && !esDuena) {
    return res.status(403).json({ ok: false, error: 'Sin acceso a este documento' });
  }

  const ruta = rutaAbsolutaDocumento(doc.rutaArchivo);
  if (!fs.existsSync(ruta)) {
    return res.status(404).json({ ok: false, error: 'El archivo ya no está en el servidor' });
  }

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombreOriginal)}`);
  res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
  fs.createReadStream(ruta).pipe(res);
}));

// borrar (solo superadmin)
router.delete('/:id', requireSuperadmin, ah(async (req, res) => {
  const doc = await Documento.findById(req.params.id);
  if (!doc) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
  await borrarDocumento(doc.rutaArchivo);
  await doc.deleteOne();
  res.json({ ok: true });
}));

module.exports = router;
