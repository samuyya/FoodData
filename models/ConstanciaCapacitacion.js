const mongoose = require('mongoose');

// lo que queda cuando alguien termina una capacitacion. no se edita ni se borra: guarda copia del
// titulo, el nombre y el cargo de ese momento para que sirva aunque despues cambien o salgan de la lista
const constanciaSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  capacitacion_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Capacitacion', required: true },
  titulo: { type: String, required: true },
  programa: { type: Number, default: null },
  version: { type: Number, required: true },
  empleado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EmpleadoLista', required: true },
  empleadoNombre: { type: String, required: true },
  cargoNombre: { type: String, default: '' },
  fecha: { type: Date, default: Date.now },
  // null si la capacitacion no tenia evaluacion
  nota: { type: Number, default: null },
  fotoRef: { type: String, default: '' }
}, { timestamps: true });

constanciaSchema.index({ empresa_id: 1, capacitacion_id: 1, empleado_id: 1, version: 1 }, { unique: true });
constanciaSchema.index({ empresa_id: 1, empleado_id: 1 });

module.exports = mongoose.model('ConstanciaCapacitacion', constanciaSchema);
