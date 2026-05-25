// Script de diagnóstico: muestra los índices y los registros del mes actual
// Uso:   node scripts/diagnostico-registros.js
require('dotenv').config();
const mongoose = require('mongoose');
const { conectarDB } = require('../db');
const Registro = require('../models/Registro');

async function main() {
  await conectarDB();

  const col = Registro.collection;
  console.log('\n=== Índices de la colección "registros" ===');
  const indices = await col.indexes();
  indices.forEach(idx => {
    console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}${idx.unique ? '  [UNIQUE]' : ''}`);
  });

  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth() + 1;

  console.log(`\n=== Registros del mes actual (${mes}/${anio}) ===`);
  const registros = await Registro.find({ anio, mes })
    .sort({ formato: 1, carpeta: 1, dia: 1 })
    .lean();

  if (registros.length === 0) {
    console.log('  (ninguno)');
  } else {
    registros.forEach(r => {
      console.log(`  empresa=${r.empresa_id}  formato=${r.formato}  carpeta=${r.carpeta || '(sin valor)'}  dia=${r.dia}  responsable=${r.responsable}`);
    });
  }

  console.log(`\nTotal: ${registros.length} registro(s)\n`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
