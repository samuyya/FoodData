const mongoose = require('mongoose');

const documentoSchema = new mongoose.Schema({
  empresa_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  programaNumero: { type: Number, required: true, min: 1, max: 11 },
  nombreOriginal: { type: String, required: true, trim: true, maxlength: 200 },
  rutaArchivo:    { type: String, required: true },  // ruta relativa al disco (luego URL Cloudinary)
  mimeType:       { type: String, default: '' },
  tamanoBytes:    { type: Number, default: 0 },
  descripcion:    { type: String, default: '', trim: true, maxlength: 500 }
}, { timestamps: true });

documentoSchema.index({ empresa_id: 1, programaNumero: 1, createdAt: -1 });

module.exports = mongoose.model('Documento', documentoSchema);
