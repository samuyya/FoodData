// Restaura un backup hecho con scripts/backup.js. Es destructivo: reemplaza
// TODO el contenido actual de cada coleccion y de datos/logos por lo que haya
// en el backup. Por eso exige --confirmar aparte, para no correrlo por error.
//
// Uso:   node scripts/restore.js <nombre-carpeta-backup>              (dry run, no toca nada)
//        node scripts/restore.js <nombre-carpeta-backup> --confirmar  (restaura de verdad)
//
// Los nombres de carpeta salen de listar backups/ (son la fecha del backup).
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
  require('../models/Superadmin')
];

const CARPETA_BACKUPS = path.join(__dirname, '..', 'backups');

async function copiarCarpeta(origen, destino) {
  if (!fs.existsSync(origen)) return;
  await fs.promises.rm(destino, { recursive: true, force: true });
  await fs.promises.mkdir(destino, { recursive: true });
  await fs.promises.cp(origen, destino, { recursive: true });
}

// el backup guarda ObjectId/Date como texto plano (asi quedan al pasar por JSON).
// los devuelvo a su tipo real segun el schema del modelo antes de insertar —
// si no, insertMany los guardaria como string y romperia queries futuras.
function restaurarTipos(modelo, doc) {
  for (const [campo, ruta] of Object.entries(modelo.schema.paths)) {
    const valor = doc[campo];
    if (valor == null) continue;
    if (ruta.instance === 'ObjectId') {
      doc[campo] = new mongoose.Types.ObjectId(valor);
    } else if (ruta.instance === 'Date') {
      doc[campo] = new Date(valor);
    }
  }
  return doc;
}

async function main() {
  const nombreBackup = process.argv[2];
  const confirmar = process.argv.includes('--confirmar');

  if (!nombreBackup) {
    const disponibles = fs.existsSync(CARPETA_BACKUPS) ? await fs.promises.readdir(CARPETA_BACKUPS) : [];
    console.error('Falta el nombre de la carpeta de backup. Disponibles:');
    disponibles.forEach(d => console.error('  ' + d));
    process.exit(1);
  }

  const origen = path.join(CARPETA_BACKUPS, nombreBackup);
  if (!fs.existsSync(origen)) {
    console.error('No existe ese backup:', origen);
    process.exit(1);
  }

  console.log(`Backup a restaurar: ${origen}`);
  console.log(confirmar ? '⚠️  MODO REAL: esto reemplaza los datos actuales.\n' : 'Modo simulacion (dry run) — agrega --confirmar para restaurar de verdad.\n');

  await conectarDB();

  for (const modelo of MODELOS) {
    const rutaGz = path.join(origen, 'mongo', `${modelo.modelName}.json.gz`);
    if (!fs.existsSync(rutaGz)) {
      console.log(`  ${modelo.modelName}: no hay backup de esta coleccion, se omite`);
      continue;
    }
    const docs = JSON.parse(zlib.gunzipSync(await fs.promises.readFile(rutaGz)).toString('utf8'));
    console.log(`  ${modelo.modelName}: ${docs.length} documento(s) en el backup`);
    if (confirmar) {
      // uso el driver crudo (no modelo.insertMany) para que el restore no falle
      // si un documento viejo ya no pasa las validaciones del schema de HOY
      await modelo.collection.deleteMany({});
      if (docs.length > 0) {
        await modelo.collection.insertMany(docs.map(d => restaurarTipos(modelo, d)));
      }
    }
  }

  if (confirmar) {
    console.log('Restaurando datos/ (fotos, excels, documentos)...');
    await copiarCarpeta(path.join(origen, 'datos'), path.join(__dirname, '..', 'datos'));
    console.log('Restaurando logos...');
    await copiarCarpeta(path.join(origen, 'logos'), path.join(__dirname, '..', 'public', 'img', 'logos'));
    console.log('\n✅ Restauracion completa.');
  } else {
    console.log('\nNada se toco todavia. Vuelve a correr con --confirmar para restaurar de verdad.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
