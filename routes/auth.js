const express = require('express');
const bcrypt = require('bcrypt');
const Empresa = require('../models/Empresa');
const Superadmin = require('../models/Superadmin');

const router = express.Router();

const MSG_CREDENCIALES = 'El Email o la contraseña son incorrectas';

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios' });
  }

  const emailNormalizado = email.toLowerCase().trim();

  const sa = await Superadmin.findOne({ email: emailNormalizado });
  if (sa) {
    const valida = await bcrypt.compare(password, sa.passwordHash);
    if (!valida) {
      return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
    }
    req.session.superadmin = { id: sa._id.toString(), email: sa.email };
    return res.json({ ok: true, rol: 'superadmin', redirect: '/superadmin/dashboard.html' });
  }

  const empresa = await Empresa.findOne({ email: emailNormalizado });
  if (!empresa) {
    return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
  }

  const passwordValida = await bcrypt.compare(password, empresa.passwordHash);
  if (!passwordValida) {
    return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
  }

  req.session.empresa = {
    id: empresa._id.toString(),
    nombre: empresa.nombre,
    email: empresa.email,
    logo: empresa.logo
  };

  res.json({ ok: true, rol: 'empresa', redirect: '/menu.html', empresa: req.session.empresa });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.empresa) {
    return res.json({
      ok: true,
      rol: 'empleado',
      empresa: req.session.empresa,
      adminNombre: req.session.adminNombre || null
    });
  }
  if (req.session && req.session.superadmin) {
    return res.json({ ok: true, rol: 'superadmin', email: req.session.superadmin.email });
  }
  res.status(401).json({ ok: false, error: 'No autenticado' });
});

module.exports = router;
