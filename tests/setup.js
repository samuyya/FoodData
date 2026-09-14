// helpers para levantar una Mongo de mentira en memoria durante los tests,
// asi nunca tocamos Atlas (ni Naiki ni "prueba 1") al correr `npm test`
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

async function conectarBDPrueba() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

async function limpiarBD() {
  const colecciones = mongoose.connection.collections;
  for (const nombre in colecciones) {
    await colecciones[nombre].deleteMany({});
  }
}

async function cerrarBDPrueba() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongod) await mongod.stop();
}

module.exports = { conectarBDPrueba, limpiarBD, cerrarBDPrueba };
