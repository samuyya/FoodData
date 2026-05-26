const express = require('express');
const bcrypt = require('bcryptjs');
const Empresa = require('../models/Empresa');
const Superadmin = require('../models/Superadmin');
const { limiteLogin } = require('../middleware/limites');

const router = express.Router();

const MSG_CREDENCIALES = 'El Email o la contraseña son incorrectas';

// hash fake para hacer la comparacion incluso cuando el email no existe — asi el tiempo
// de respuesta es similar y no se puede enumerar usuarios viendo cuanto tarda el server
const HASH_FALSO = '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid12345';

// solo email tipo string + lowercase, asi corto cualquier inyeccion temprano
function emailLimpio(e) {
  if (typeof e !== 'string') return '';
  return e.toLowerCase().trim().slice(0, 200);
}

router.post('/login', limiteLogin, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios' });
  }

  const emailN = emailLimpio(email);
  if (!emailN) {
    return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
  }

  const sa = await Superadmin.findOne({ email: emailN });
  if (sa) {
    const valida = await bcrypt.compare(password, sa.passwordHash);
    if (!valida) return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
    // regenero el ID de sesion para evitar session fixation (que alguien me pase
    // un session id pre-existente esperando heredarlo despues del login)
    return req.session.regenerate((err) => {
      if (err) return res.status(500).json({ ok: false, error: 'No se pudo iniciar sesión' });
      req.session.superadmin = { id: sa._id.toString(), email: sa.email };
      res.json({ ok: true, rol: 'superadmin', redirect: '/superadmin/dashboard.html' });
    });
  }

  const empresa = await Empresa.findOne({ email: emailN });
  // si no encuentro empresa igual hago el compare contra un hash falso para no delatar
  // (timing attack) que el email no existe
  const hashParaComparar = empresa ? empresa.passwordHash : HASH_FALSO;
  const passwordValida = await bcrypt.compare(password, hashParaComparar);

  if (!empresa || !passwordValida) {
    return res.status(401).json({ ok: false, error: MSG_CREDENCIALES });
  }

  if (empresa.activa === false) {
    return res.status(403).json({ ok: false, error: 'Esta empresa está desactivada. Contacta al administrador del sistema.' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ ok: false, error: 'No se pudo iniciar sesión' });
    req.session.empresa = {
      id: empresa._id.toString(),
      nombre: empresa.nombre,
      email: empresa.email,
      logo: empresa.logo
    };
    res.json({ ok: true, rol: 'empresa', redirect: '/menu.html', empresa: req.session.empresa });
  });
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
      empresa: req.session.empresa
    });
  }
  if (req.session && req.session.superadmin) {
    return res.json({ ok: true, rol: 'superadmin', email: req.session.superadmin.email });
  }
  res.status(401).json({ ok: false, error: 'No autenticado' });
});

module.exports = router;
