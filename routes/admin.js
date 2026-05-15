const express = require('express');
const bcrypt = require('bcrypt');
const Administrador = require('../models/Administrador');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

router.post('/verificar', requireEmpresa, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ ok: false, error: 'Falta la contraseña' });
  }

  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }

  for (const a of admins) {
    const coincide = await bcrypt.compare(password, a.passwordHash);
    if (coincide) {
      req.session.adminNombre = a.nombre;
      return res.json({ ok: true, nombre: a.nombre });
    }
  }

  res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
});

router.post('/salir', requireEmpresa, (req, res) => {
  req.session.adminNombre = null;
  res.json({ ok: true });
});

module.exports = router;
