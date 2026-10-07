const mongoose = require('mongoose');

// un inventario general: se cuenta por partes (categorias), se envia al
// administrador y al aprobarlo las cantidades pasan a ser las existencias reales.
// los aprobados quedan guardados porque son los "cierres" que usa el reporte.
const conteoSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  estado: { type: String, enum: ['curso', 'enviado', 'aprobado', 'descartado'], default: 'curso' },
  mesCierre: { type: String, required: true },          // 'YYYY-MM': el mes que cierra
  iniciado: { type: String, required: true },           // 'YYYY-MM-DD'
  // cuentas por item: cada numero es una cantidad parcial (67 + 55 ...)
  cuentas: { type: Map, of: [Number], default: {} },
  // quien conto cada parte (categoria)
  por: { type: Map, of: String, default: {} },
  nota: { type: String, default: '' },
  // acceso para contar desde otros celulares (link + codigo, max 24 h)
  acceso: {
    type: new mongoose.Schema({
      token: String,
      codigo: String,
      vence: Date,
      intentos: { type: Number, default: 0 },
      conectados: [{ _id: false, nombre: String, parte: String, sid: String }]
    }, { _id: false }),
    default: null
  },
  // al aprobar: foto de como estaba cada item contado, para el reporte de cierre
  resultado: { type: Object, default: null },
  completo: { type: Boolean, default: false },
  fechaAprobado: { type: String, default: null },
  aprobadoPor: { type: String, default: '' },
  // total de ventas del periodo, para quien no registra las ventas a diario
  ventas: {
    comida: { type: Number, default: 0 },
    bebidas: { type: Number, default: 0 },
    dom: { type: Number, default: 0 }
  }
}, { timestamps: true });

conteoSchema.index({ 'acceso.token': 1 });

module.exports = mongoose.model('ConteoInventario', conteoSchema);
