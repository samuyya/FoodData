// Script para borrar registros del mes actual (útil en desarrollo)
// Uso:   node scripts/limpiar-registros-mes.js <empresaId> [formatoId]
//        node scripts/limpiar-registros-mes.js 6a06af219064f0305ee69cd2 calidad_agua
//        node scripts/limpiar-registros-mes.js 6a06af219064f0305ee69cd2   ← borra TODOS los formatos del mes, solo de esa empresa
//        node scripts/limpiar-registros-mes.js --todas-las-empresas      ← el viejo comportamiento (TODAS las empresas), a proposito
require('dotenv').config();
const mongoose = require('mongoose');
const { conectarDB } = require('../db');
const Registro = require('../models/Registro');

async function main() {
  await conectarDB();

  const arg1 = process.argv[2];
  // ojo: el filtro original no tenia empresa_id y borraba el mes de TODAS
  // las empresas a la vez — ahora hay que pedirlo explicito para evitar
  // borrar datos reales de otra empresa por accidente
  if (!arg1) {
    console.error('Falta el empresaId (o pasa --todas-las-empresas si de verdad quieres borrar el mes de TODAS).');
    console.error('Uso: node scripts/limpiar-registros-mes.js <empresaId> [formatoId]');
    await mongoose.disconnect();
    process.exit(1);
  }

  const hoy = new Date();
  const filtro = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
  if (arg1 !== '--todas-las-empresas') filtro.empresa_id = arg1;

  const formatoId = process.argv[3];
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
