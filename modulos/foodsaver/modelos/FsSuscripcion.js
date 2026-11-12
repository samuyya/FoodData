const mongoose = require('mongoose');

// un telefono que recibe avisos. el endpoint es unico por navegador instalado
const schema = new mongoose.Schema({
  empresa_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', required: true, index: true },
  nombre: { type: String, trim: true, maxlength: 40, default: 'Teléfono' },
  endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
  claves: {
    p256dh: { type: String, required: true, maxlength: 200 },
    auth: { type: String, required: true, maxlength: 100 }
  },
  agente: { type: String, maxlength: 300, default: '' }
}, { timestamps: true });

module.exports = mongoose.models.FsSuscripcion || mongoose.model('FsSuscripcion', schema);
