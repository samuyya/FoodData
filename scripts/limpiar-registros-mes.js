// Script para borrar registros del mes actual (útil en desarrollo)
// Uso:   node scripts/limpiar-registros-mes.js [formatoId]
//        node scripts/limpiar-registros-mes.js calidad_agua
//        node scripts/limpiar-registros-mes.js              ← borra TODOS los formatos del mes
require('dotenv').config();
const mongoose = require('mongoose');
const { conectarDB } = require('../db');
const Registro = require('../models/Registro');

async function main() {
  await conectarDB();

  const formatoId = process.argv[2];
  const hoy = new Date();
  const filtro = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  if (formatoId) filtro.formato = formatoId;

  console.log('Filtro de borrado:', filtro);
  const antes = await Registro.countDocuments(filtro);
  console.log(`Encontrados ${antes} registro(s) para borrar.`);

  if (antes === 0) {
    console.log('Nada que hacer.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const resultado = await Registro.deleteMany(filtro);
  console.log(`✅ Borrados ${resultado.deletedCount} registro(s).`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
