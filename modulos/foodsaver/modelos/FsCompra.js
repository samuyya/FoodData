const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nombre: { type: String, required: true, trim: true, maxlength: 60 },
  // texto que se muestra debajo: "Se acabó", "Queda poco", "Para: Sudado de pollo"...
  origen: { type: String, default: 'Agregado a mano', maxlength: 80 },
  hecho: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.FsCompra || mongoose.model('FsCompra', schema);
