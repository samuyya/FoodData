const mongoose = require('mongoose');

// un ingreso (compra) o una baja (perdida). nunca se borra de verdad: borrar
// marca `borrado` para que quede en el historial de correcciones y borrados
const movSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  tipo: { type: String, enum: ['ing', 'baja'], required: true },
  fecha: { type: String, required: true },            // 'YYYY-MM-DD'
  item_id: { type: mongoose.Schema.Types.ObjectId, ref: 'ItemInventario', required: true },
  cant: { type: Number, required: true },              // siempre en la unidad de conteo del item
  compra: { type: String, default: '' },               // ej "2 × caja" si se compro por presentacion
  costo: { type: Number, required: true },
  prov: { type: String, default: '' },
  factura: { type: String, default: '' },
  motivo: { type: String, default: '' },
  motivoOtro: { type: String, default: '' },
  obs: { type: String, default: '' },
  por: { type: String, required: true },
  foto: { type: String, default: '' },
  cambios: [{
    _id: false,
    por: String,
    razon: String,
    fecha: String,
    antes: { type: Object },
    despues: { type: Object }
  }],
  borrado: {
    type: new mongoose.Schema({ por: String, razon: String, fecha: String }, { _id: false }),
    default: null
  }
}, { timestamps: true });

movSchema.index({ empresa_id: 1, fecha: -1 });
movSchema.index({ empresa_id: 1, item_id: 1, fecha: 1 });

module.exports = mongoose.model('MovInventario', movSchema);
