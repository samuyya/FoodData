const mongoose = require('mongoose');

const empleadoListaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true }
}, { timestamps: true });

module.exports = mongoose.model('EmpleadoLista', empleadoListaSchema);
