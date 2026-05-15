const mongoose = require('mongoose');

const empresaSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  logo: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Empresa', empresaSchema);
