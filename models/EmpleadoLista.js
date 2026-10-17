const mongoose = require('mongoose');

const empleadoListaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  // cada modulo tiene su lista: asistencia, presentacion o capacitaciones
  // solo en la lista de capacitaciones
  cargo: { type: mongoose.Schema.Types.ObjectId, ref: 'Cargo', default: null },
  lista: { type: String, enum: ['asistencia', 'presentacion', 'capacitaciones'], default: 'asistencia' }
}, { timestamps: true });

// evita nombres duplicados en la misma lista incluso si dos requests
// pasan el chequeo findOne casi al mismo tiempo
empleadoListaSchema.index({ empresa_id: 1, lista: 1, nombre: 1 }, { unique: true });

module.exports = mongoose.model('EmpleadoLista', empleadoListaSchema);
