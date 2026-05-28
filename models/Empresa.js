const mongoose = require('mongoose');
const { FORMATOS } = require('../formatos');

const IDS_FORMATOS = FORMATOS.map(f => f.id);
const MODULOS_VALIDOS = ['formatos', 'asistencia', 'capacitaciones', 'programas'];

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
  formatosCompartidos: { type: [String], default: () => [] },
  // modulos del menu principal habilitados para la empresa (cuales botones ve)
  modulosActivos: {
    type: [String],
    default: () => MODULOS_VALIDOS.slice(),
    validate: {
      validator: arr => arr.every(m => MODULOS_VALIDOS.includes(m)),
      message: 'Módulo inválido'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Empresa', empresaSchema);
module.exports.MODULOS_VALIDOS = MODULOS_VALIDOS;
