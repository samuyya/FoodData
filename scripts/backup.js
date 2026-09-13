// Respaldo completo: cada coleccion de Mongo a JSON + la carpeta datos/ (fotos,
// excels, documentos) + los logos subidos. Todo se guarda en backups/<fecha>/.
// El tier gratis de Atlas (M0) no tiene backups automaticos, y datos/ vive
// solo en este disco sin ninguna redundancia — por eso el respaldo cubre las dos cosas.
//
// Uso:   node scripts/backup.js
//
// Recomendado: programarlo con el Programador de tareas de Windows para que
// corra solo (ej. una vez al dia), y de vez en cuando copiar la carpeta
// backups/ a otro disco o a Google Drive — un respaldo que vive en la misma
// maquina no protege contra que la maquina se dañe.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');
const { conectarDB } = require('../db');

const MODELOS = [
  require('../models/Empresa'),
  require('../models/Administrador'),
  require('../models/EmpleadoLista'),
  require('../models/Registro'),
  require('../models/Asistencia'),
  require('../models/Documento'),
  require('../models/Superadmin'),
  require('../models/SaldoHorasExtra')
];

const CARPETA_BACKUPS = path.join(__dirname, '..', 'backups');
const RETENCION = 5; // cuantos backups viejos conservar

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function copiarCarpeta(origen, destino) {
  if (!fs.existsSync(origen)) return;
  await fs.promises.mkdir(destino, { recursive: true });
  await fs.promises.cp(origen, destino, { recursive: true });
}

async function volcarColeccion(modelo, carpetaDestino) {
  const docs = await modelo.find().lean();
  const json = JSON.stringify(docs);
  const gz = zlib.gzipSync(json);
  await fs.promises.writeFile(path.join(carpetaDestino, `${modelo.modelName}.json.gz`), gz);
  return docs.length;
}

async function limpiarBackupsViejos() {
  if (!fs.existsSync(CARPETA_BACKUPS)) return;
  const carpetas = (await fs.promises.readdir(CARPETA_BACKUPS)).sort();
  const sobrantes = carpetas.slice(0, Math.max(0, carpetas.length - RETENCION));
  for (const c of sobrantes) {
    await fs.promises.rm(path.join(CARPETA_BACKUPS, c), { recursive: true, force: true });
    console.log('  borrado backup viejo:', c);
  }
}

async function main() {
  await conectarDB();

  const nombre = timestamp();
  const destino = path.join(CARPETA_BACKUPS, nombre);
  await fs.promises.mkdir(path.join(destino, 'mongo'), { recursive: true });

  console.log('Respaldando colecciones de MongoDB...');
  let total = 0;
  for (const modelo of MODELOS) {
    const n = await volcarColeccion(modelo, path.join(destino, 'mongo'));
    console.log(`  ${modelo.modelName}: ${n} documento(s)`);
    total += n;
  }

  console.log('Copiando datos/ (fotos, excels, documentos)...');
  await copiarCarpeta(path.join(__dirname, '..', 'datos'), path.join(destino, 'datos'));

  console.log('Copiando logos de empresas...');
  await copiarCarpeta(path.join(__dirname, '..', 'public', 'img', 'logos'), path.join(destino, 'logos'));

  console.log('Limpiando backups viejos (conservo los ultimos ' + RETENCION + ')...');
  await limpiarBackupsViejos();

  console.log(`\n✅ Backup completo en ${destino} (${total} documentos de Mongo en total).`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
