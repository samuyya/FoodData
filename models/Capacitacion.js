const mongoose = require('mongoose');

const preguntaSchema = new mongoose.Schema({
  texto: { type: String, required: true, trim: true, maxlength: 200 },
  opciones: { type: [String], default: [] },
  correcta: { type: Number, default: 0 }
}, { _id: false });

const capacitacionSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  titulo: { type: String, required: true, trim: true, maxlength: 80 },
  descripcion: { type: String, default: '', trim: true, maxlength: 300 },
  // uno de los 11 programas del plan de saneamiento (opcional)
  programa: { type: Number, default: null, min: 1, max: 11 },
  material: {
    tipo: { type: String, enum: ['archivo', 'enlace'], required: true },
    archivoRef: { type: String, default: '' },
    archivoNombre: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    enlace: { type: String, default: '', trim: true, maxlength: 300 }
  },
  // sube cada vez que cambian el material: quien ya la hizo la repite con la nueva
  version: { type: Number, default: 1 },
  alcance: { type: String, enum: ['todos', 'cargos'], default: 'todos' },
  cargos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cargo' }],
  // forma parte del paquete que se le asigna a quien entra nuevo
  ingreso: { type: Boolean, default: false },
  evaluacion: {
    activa: { type: Boolean, default: false },
    minimo: { type: Number, default: 80, min: 50, max: 100 },
    preguntas: { type: [preguntaSchema], default: [] }
  },
  foto: { type: Boolean, default: false },
  activa: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Capacitacion', capacitacionSchema);
