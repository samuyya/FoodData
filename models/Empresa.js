const mongoose = require('mongoose');
const { FORMATOS } = require('../formatos');

const IDS_FORMATOS = FORMATOS.map(f => f.id);

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  logo: { type: String, default: '' },
  googleSheetId: { type: String, default: '', trim: true },
  formatosActivos: {
    type: [String],
    default: () => IDS_FORMATOS.slice(),
    validate: {
      validator: arr => arr.length > 0 && arr.every(id => IDS_FORMATOS.includes(id)),
      message: 'Lista de formatos inválida'
    }
  },
  formatosRestringidos: {
    type: [String],
    default: [],
    validate: {
      validator: arr => arr.every(id => IDS_FORMATOS.includes(id)),
      message: 'Lista de formatos restringidos inválida'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Empresa', empresaSchema);
