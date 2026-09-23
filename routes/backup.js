// endpoint para el backup automatico (GitHub Actions) -- no hay navegador de
// por medio, asi que en vez de sesion se usa un token fijo en el header
const express = require('express');
const crypto = require('crypto');
const { limiteBackup } = require('../middleware/limites');

const router = express.Router();

const MODELOS = [
  require('../models/Empresa'),
  require('../models/Administrador'),
  require('../models/EmpleadoLista'),
  require('../models/Registro'),
  require('../models/Asistencia'),
  require('../models/Documento'),
  require('../models/Superadmin'),
  require('../models/SaldoHorasExtra')
];

function tokenValido(header, esperado) {
  if (!header || !header.startsWith('Bearer ')) return false;
  const recibido = Buffer.from(header.slice(7));
  const bufEsperado = Buffer.from(esperado);
  if (recibido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(recibido, bufEsperado);
}

router.get('/', limiteBackup, async (req, res) => {
  if (!process.env.BACKUP_TOKEN) {
    return res.status(503).json({ error: 'Backup automatico no configurado (falta BACKUP_TOKEN)' });
  }
  if (!tokenValido(req.headers.authorization, process.env.BACKUP_TOKEN)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const resultado = {};
  for (const modelo of MODELOS) {
    resultado[modelo.modelName] = await modelo.find().lean();
  }
  res.json(resultado);
});

module.exports = router;
