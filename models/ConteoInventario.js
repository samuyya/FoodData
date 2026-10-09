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
  // cada vez que alguien suma o corrige un numero queda una marca (quien, que parte, cuando).
  // de ahi sale quien participo y cuanto tiempo estuvo contando de verdad
  actividad: [{ _id: false, q: String, sid: String, cat: String, item: String, t: Date }],
  resultado: { type: Object, default: null },
  completo: { type: Boolean, default: false },
  // el dia en que se conto (cuando se envio al administrador). el cierre llega hasta ese dia,
  // aunque el administrador apruebe despues: lo que pase luego ya es del siguiente periodo
  fechaConteo: { type: String, default: null },
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
