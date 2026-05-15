const mongoose = require('mongoose');

const administradorSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Administrador', administradorSchema);
