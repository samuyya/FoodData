const mongoose = require('mongoose');

const FORMATOS_VALIDOS = [
  'calidad_agua',
  'control_plagas',
  'presentacion_personal',
  'control_temperatura',
  'limpieza_desinfeccion',
  'manejo_residuos'
];

const registroSchema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  formato: { type: String, enum: FORMATOS_VALIDOS, required: true },
  fecha: { type: Date, required: true },
  dia: { type: Number, required: true },
  mes: { type: Number, required: true },
  anio: { type: Number, required: true },
  responsable: { type: String, required: true, trim: true },
  observaciones: { type: String, default: '', trim: true },
  datos: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

registroSchema.index(
  { empresa_id: 1, formato: 1, anio: 1, mes: 1, dia: 1 },
  { unique: true }
);

const Registro = mongoose.model('Registro', registroSchema);
Registro.FORMATOS_VALIDOS = FORMATOS_VALIDOS;

module.exports = Registro;
