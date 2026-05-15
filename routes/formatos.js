const express = require('express');
const { FORMATOS } = require('../formatos');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

router.get('/', requireEmpresa, (req, res) => {
  res.json({ ok: true, formatos: FORMATOS });
});

module.exports = router;
