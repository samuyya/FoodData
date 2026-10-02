const mongoose = require('mongoose');

const CATEGORIAS = ['Materia prima', 'Bebidas', 'Menaje', 'Mobiliario', 'Insumos', 'Otros gastos'];
const UNIDADES = ['kg', 'g', 'lb', 'L', 'ml', 'und', 'paquete', 'caja'];

const itemSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nombre: { type: String, required: true, trim: true, maxlength: 80 },
  cat: { type: String, enum: CATEGORIAS, required: true },
  u: { type: String, enum: UNIDADES, required: true },
  // ultimo precio por unidad de compra (se actualiza con cada ingreso)
  precio: { type: Number, default: 0 },
  // precio de arranque (el que puso el superadmin en la plantilla) — se usa
  // para valorar lo que haya de antes de la primera compra registrada
  precioBase: { type: Number, default: 0 },
  // presentacion de compra opcional, ej { nombre: 'Caja', cant: 24 } => 1 caja = 24 und
  pres: {
    type: new mongoose.Schema({ nombre: String, cant: Number }, { _id: false }),
    default: null
  },
  // true = se cuenta en el inventario general, false = no, null = nuevo sin decidir
  cuenta: { type: Boolean, default: null },
  activo: { type: Boolean, default: true },
  // ultimo conteo aprobado
  conteo: { type: Number, default: 0 },
  conteoFecha: { type: String, default: null },
  contadoPor: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('ItemInventario', itemSchema);
module.exports.CATEGORIAS = CATEGORIAS;
module.exports.UNIDADES = UNIDADES;
