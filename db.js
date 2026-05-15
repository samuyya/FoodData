const mongoose = require('mongoose');

async function conectarDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('Falta la variable MONGODB_URI en el archivo .env');
  }
  await mongoose.connect(uri);
  console.log('MongoDB conectado');
}

module.exports = { conectarDB };
