const mongoose = require('mongoose');

const mensajeContactoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  correo: { type: String, required: true, trim: true, lowercase: true },
  telefono: { type: String, trim: true },
  establecimiento: { type: String, trim: true },
  mensaje: { type: String, required: true, trim: true },
  creado: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MensajeContacto', mensajeContactoSchema);
