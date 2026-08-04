const mongoose = require('mongoose');

const empleadoListaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true }
}, { timestamps: true });

// evita nombres duplicados en la misma empresa incluso si dos requests
// pasan el chequeo findOne casi al mismo tiempo
empleadoListaSchema.index({ empresa_id: 1, nombre: 1 }, { unique: true });

module.exports = mongoose.model('EmpleadoLista', empleadoListaSchema);
