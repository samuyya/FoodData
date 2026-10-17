const mongoose = require('mongoose');

// cargos de la empresa (cocinero, mesero...). por ahora solo se usan en capacitaciones
const cargoSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  nombre: { type: String, required: true, trim: true, maxlength: 30 }
}, { timestamps: true });

cargoSchema.index({ empresa_id: 1, nombre: 1 }, { unique: true });

module.exports = mongoose.model('Cargo', cargoSchema);
