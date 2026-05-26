const mongoose = require('mongoose');
const { FORMATOS } = require('../formatos');

const IDS_FORMATOS = FORMATOS.map(f => f.id);

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  logo: { type: String, default: '' },
  googleSheetId: { type: String, default: '', trim: true },
  activa: { type: Boolean, default: true },
  formatosActivos: {
    type: [String],
    default: () => IDS_FORMATOS.slice(),
    validate: {
      validator: arr => arr.length > 0 && arr.every(id => IDS_FORMATOS.includes(id)),
      message: 'Lista de formatos inválida'
    }
  },
  formatosCarpeta: {
    cocina:        { type: [String], default: () => IDS_FORMATOS.slice() },
    salon:         { type: [String], default: () => [] },
    administracion:{ type: [String], default: () => [] }
  },
  // formatos que estan en varias carpetas pero son la MISMA fuente de datos
  // (los registros se comparten, no se duplican)
  formatosCompartidos: { type: [String], default: () => [] }
}, { timestamps: true });

module.exports = mongoose.model('Empresa', empresaSchema);
