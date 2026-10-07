const mongoose = require('mongoose');

// ventas de un dia para el food cost (como el cuadre de caja). solo las escribe el administrador.
// sin impuesto al consumo ni propinas; los domicilios van netos (despues de la comision de la app)
const ventaSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  fecha: { type: String, required: true },   // 'YYYY-MM-DD'
  comida: { type: Number, default: 0 },
  bebidas: { type: Number, default: 0 },
  dom: { type: Number, default: 0 },
  // por ahora todo es manual; queda listo por si algun dia se conecta un POS
  fuente: { type: String, default: 'manual' },
  por: { type: String, default: '' }
}, { timestamps: true });

ventaSchema.index({ empresa_id: 1, fecha: 1 }, { unique: true });

module.exports = mongoose.model('VentaDia', ventaSchema);
