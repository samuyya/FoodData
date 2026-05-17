const mongoose = require('mongoose');

const asistenciaSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  empleado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EmpleadoLista', required: true },
  empleadoNombre: { type: String, required: true, trim: true },
  fecha: { type: Date, required: true },
  dia: { type: Number, required: true },
  mes: { type: Number, required: true },
  anio: { type: Number, required: true },
  horaIngreso: { type: Date, default: null },
  fotoIngreso: { type: String, default: '' },
  horaSalida: { type: Date, default: null },
  fotoSalida: { type: String, default: '' },
  horasTrabajadas: { type: Number, default: 0 }
}, { timestamps: true });

asistenciaSchema.index(
  { empresa_id: 1, empleado_id: 1, anio: 1, mes: 1, dia: 1 },
  { unique: true }
);

module.exports = mongoose.model('Asistencia', asistenciaSchema);
