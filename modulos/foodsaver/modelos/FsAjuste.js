const mongoose = require('mongoose');
const { DIAS_AVISO1, DIAS_AVISO2 } = require('../config');

const schema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, unique: true },
  diasAviso1: { type: Number, default: DIAS_AVISO1, min: 1, max: 30 },
  diasAviso2: { type: Number, default: DIAS_AVISO2, min: 0, max: 29 }
}, { timestamps: true });

module.exports = mongoose.models.FsAjuste || mongoose.model('FsAjuste', schema);
