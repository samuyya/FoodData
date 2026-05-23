const mongoose = require('mongoose');

const FORMATOS_VALIDOS = [
  'calidad_agua',
  'control_plagas',
  'presentacion_personal',
  'control_temperatura',
  'limpieza_desinfeccion',
  'manejo_residuos'
];

const CARPETAS_VALIDAS = ['cocina', 'salon', 'administracion'];

const registroSchema = new mongoose.Schema({
  empresa_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true },
  formato:      { type: String, enum: FORMATOS_VALIDOS, required: true },
  carpeta:      { type: String, enum: CARPETAS_VALIDAS, required: true, default: 'cocina' },
  fecha:        { type: Date, required: true },
  dia:          { type: Number, required: true },
  mes:          { type: Number, required: true },
  anio:         { type: Number, required: true },
  responsable:  { type: String, required: true, trim: true },
  observaciones:{ type: String, default: '', trim: true },
  datos:        { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// El índice único ahora incluye carpeta: misma plantilla en dos carpetas = registros independientes
registroSchema.index(
  { empresa_id: 1, formato: 1, carpeta: 1, anio: 1, mes: 1, dia: 1 },
  { unique: true }
);

const Registro = mongoose.model('Registro', registroSchema);
Registro.FORMATOS_VALIDOS = FORMATOS_VALIDOS;
Registro.CARPETAS_VALIDAS = CARPETAS_VALIDAS;

module.exports = Registro;
