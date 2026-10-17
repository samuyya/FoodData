const mongoose = require('mongoose');

// lo que se sale de la regla (todos / cargo) para una persona puntual:
// ingreso = del paquete de ingreso, manual = la sumo el admin, excluida = el admin se la quito
const asignacionSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  empleado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EmpleadoLista', required: true },
  capacitacion_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Capacitacion', required: true },
  origen: { type: String, enum: ['ingreso', 'manual', 'excluida'], required: true }
}, { timestamps: true });

asignacionSchema.index({ empleado_id: 1, capacitacion_id: 1 }, { unique: true });
asignacionSchema.index({ empresa_id: 1, capacitacion_id: 1 });

module.exports = mongoose.model('AsignacionCapacitacion', asignacionSchema);
