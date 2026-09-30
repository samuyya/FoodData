// formulario de contacto de la landing -- publico, sin sesion
const express = require('express');
const { limiteContacto } = require('../middleware/limites');
const { ah } = require('../middleware/sesion');
const MensajeContacto = require('../models/MensajeContacto');
const correo = require('../servicios/correo');
const logger = require('../logger');

const router = express.Router();

router.post('/', limiteContacto, ah(async (req, res) => {
  const nombre = String(req.body.nombre || '').trim();
  const correoContacto = String(req.body.correo || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const establecimiento = String(req.body.establecimiento || '').trim();
  const mensaje = String(req.body.mensaje || '').trim();

  if (!nombre || !mensaje || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoContacto)) {
    return res.status(400).json({ ok: false, error: 'Completa tu nombre, un correo válido y tu mensaje.' });
  }

  await MensajeContacto.create({ nombre, correo: correoContacto, telefono, establecimiento, mensaje });

  // el correo es opcional -- si no esta configurado el mensaje igual queda
  // guardado en la base de datos, solo no llega el aviso al instante
  if (correo.estaDisponible()) {
    try {
      await correo.enviarNotificacionContacto({ nombre, correo: correoContacto, telefono, establecimiento, mensaje });
    } catch (err) {
      logger.warn(`no se pudo enviar la notificacion de contacto: ${err.message}`);
    }
  }

  res.json({ ok: true });
}));

module.exports = router;
