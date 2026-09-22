const mongoose = require('mongoose');

// bitacora de ajustes manuales al saldo de horas extra -- solo para mostrar
// transparencia al empleado (quien, cuando, de cuanto a cuanto). no interviene
// en ningun calculo, el valor real vive en SaldoHorasExtra.
const ajusteHorasExtraSchema = new mongoose.Schema({
  empresa_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  empleado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EmpleadoLista', required: true },
  categoria:   { type: String, enum: ['diurnas', 'dominicales', 'nocturnas', 'dominicalesNocturnas'], required: true },
  valorAnterior: { type: Number, required: true },
  valorNuevo:    { type: Number, required: true },
  motivo:      { type: String, default: '', trim: true },
  adminNombre: { type: String, required: true },
  fecha:       { type: Date, default: Date.now }
});

ajusteHorasExtraSchema.index({ empresa_id: 1, empleado_id: 1, fecha: -1 });

module.exports = mongoose.model('AjusteHorasExtra', ajusteHorasExtraSchema);
