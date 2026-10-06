// endpoint para el backup automatico (GitHub Actions) -- no hay navegador de
// por medio, asi que en vez de sesion se usa un token fijo en el header
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { limiteBackup } = require('../middleware/limites');

const router = express.Router();

const MODELOS = require('../models/todos');

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

// temporal: mide cuanto tarda Render en hablar con Mongo (borrar despues de medir)
router.get('/latencia', limiteBackup, async (req, res) => {
  if (!process.env.BACKUP_TOKEN || !tokenValido(req.headers.authorization, process.env.BACKUP_TOKEN)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const db = mongoose.connection.db;
  const pings = [];
  for (let i = 0; i < 15; i++) {
    const t = Date.now();
    await db.admin().ping();
    pings.push(Date.now() - t);
  }
  const lecturas = [];
  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    await db.collection('empresas').findOne({}, { projection: { _id: 1 } });
    lecturas.push(Date.now() - t);
  }
  const mediana = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  res.json({ pingMediana: mediana(pings), pingMin: Math.min(...pings), pingMax: Math.max(...pings), lecturaMediana: mediana(lecturas), pings, lecturas });
});

module.exports = router;
