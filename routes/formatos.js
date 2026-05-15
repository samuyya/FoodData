const express = require('express');
const { FORMATOS } = require('../formatos');
const Empresa = require('../models/Empresa');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

router.get('/', requireEmpresa, async (req, res) => {
  const empresa = await Empresa.findById(req.session.empresa.id).select('formatosActivos').lean();
  const activos = (empresa && empresa.formatosActivos && empresa.formatosActivos.length > 0)
    ? empresa.formatosActivos
    : FORMATOS.map(f => f.id);
  const filtrados = FORMATOS.filter(f => activos.includes(f.id));
  res.json({ ok: true, formatos: filtrados });
});

module.exports = router;
