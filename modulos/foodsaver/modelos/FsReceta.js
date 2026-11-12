const mongoose = require('mongoose');
const { CATEGORIAS_RECETA } = require('../config');

// solo las recetas propias de cada familia; las base viven en datos/recetas-base.js
const schema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nombre: { type: String, required: true, trim: true, maxlength: 80 },
  categoria: { type: String, enum: CATEGORIAS_RECETA, default: 'Plato' },
  ingredientes: [{
    _id: false,
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    opcional: { type: Boolean, default: false }
  }],
  pasos: [{ type: String, trim: true, maxlength: 400 }],
  porciones: { type: Number, default: 4, min: 1, max: 50 }
}, { timestamps: true });

module.exports = mongoose.models.FsReceta || mongoose.model('FsReceta', schema);
