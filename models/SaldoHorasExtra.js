const mongoose = require('mongoose');

// saldo acumulado de horas extra por empleado (se guarda para siempre, no se
// resetea por mes). ultimaSemanaProcesada evita volver a sumar/restar una
// semana que ya se aplico al saldo.
const saldoHorasExtraSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  empleado_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EmpleadoLista', required: true },
  diurnas: { type: Number, default: 0 },
  dominicales: { type: Number, default: 0 },
  nocturnas: { type: Number, default: 0 },
  dominicalesNocturnas: { type: Number, default: 0 },
  ultimaSemanaProcesada: { type: Date, default: null }
}, { timestamps: true });

saldoHorasExtraSchema.index({ empresa_id: 1, empleado_id: 1 }, { unique: true });

module.exports = mongoose.model('SaldoHorasExtra', saldoHorasExtraSchema);
