const mongoose = require('mongoose');

const FORMATOS_VALIDOS = [
  'recepcion_materias_primas',
  'calidad_agua',
  'control_temperatura',
  'control_plagas',
  'limpieza_salon',
  'limpieza_bano',
  'limpieza_campana_trampa',
  'manejo_residuos',
  'presentacion_personal',
  // alias retrocompatible (registros antiguos antes de la separación)
  'limpieza_desinfeccion'
];

const { CARPETAS: CARPETAS_VALIDAS } = require('../formatos');

const registroSchema = new mongoose.Schema({
  empresa_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  formato:      { type: String, enum: FORMATOS_VALIDOS, required: true },
  carpeta:      { type: String, enum: CARPETAS_VALIDAS, required: true, default: 'cocina' },
  fecha:        { type: Date, required: true },
  dia:          { type: Number, required: true },
  mes:          { type: Number, required: true },
  anio:         { type: Number, required: true },
  // null = el formato no usa elementos. si los usa, es el _id del elemento (baño, nevera...)
  elemento:     { type: mongoose.Schema.Types.ObjectId, default: null },
  // true = falta una medicion del dia (ej. la 2 de temperatura); false = completo
  parcial:      { type: Boolean, default: false },
  // quien guardo cada medicion y cuando (solo formatos con varios momentos al dia)
  mediciones:   { type: [{ _id: false, n: Number, por: String, en: Date }], default: [] },
  responsable:  { type: String, required: true, trim: true },
  observaciones:{ type: String, default: '', trim: true },
  datos:        { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// El índice único ahora incluye carpeta: misma plantilla en dos carpetas = registros independientes
registroSchema.index(
  { empresa_id: 1, formato: 1, carpeta: 1, elemento: 1, anio: 1, mes: 1, dia: 1 },
  { unique: true }
);

const Registro = mongoose.model('Registro', registroSchema);
Registro.FORMATOS_VALIDOS = FORMATOS_VALIDOS;
Registro.CARPETAS_VALIDAS = CARPETAS_VALIDAS;

module.exports = Registro;
