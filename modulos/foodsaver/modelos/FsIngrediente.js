const mongoose = require('mongoose');
const { UNIDADES, UBICACIONES } = require('../config');

const schema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nombre: { type: String, required: true, trim: true, maxlength: 60 },
  // solo de referencia: no se descuenta al cocinar
  cantidad: { type: Number, required: true, min: 0 },
  unidad: { type: String, enum: UNIDADES, default: 'und' },
  ubicacion: { type: String, enum: UBICACIONES, default: 'nevera' },
  perecedero: { type: Boolean, default: true },
  vence: { type: String, default: '' },
  nivel: { type: String, enum: ['lleno', 'poco'], default: 'lleno' },
  activo: { type: Boolean, default: true },
  motivo: { type: String, enum: ['', 'acabado', 'botado'], default: '' },
  archivadoEn: { type: Date, default: null },
  // si ya salio cada aviso al celular para la fecha actual
  aviso1: { type: Boolean, default: false },
  aviso2: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.models.FsIngrediente || mongoose.model('FsIngrediente', schema);
