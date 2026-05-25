// Script de diagnóstico de Google Sheets
// Uso:  node scripts/diagnostico-google-sheets.js
//       node scripts/diagnostico-google-sheets.js {empresaId}   ← prueba con esa empresa
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { google } = require('googleapis');
const { conectarDB } = require('../db');
const Empresa = require('../models/Empresa');

const RUTA_CRED = process.env.GOOGLE_CREDENTIALS_PATH
  || path.join(__dirname, '..', 'google-credentials.json');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO DE GOOGLE SHEETS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1) Verificar credenciales
  console.log('1) Verificando credenciales...');
  if (!fs.existsSync(RUTA_CRED)) {
    console.error('   ❌ No existe el archivo de credenciales:', RUTA_CRED);
    process.exit(1);
  }
  const cred = JSON.parse(fs.readFileSync(RUTA_CRED, 'utf8'));
  console.log('   ✅ Archivo encontrado');
  console.log('   📧 Cuenta de servicio:', cred.client_email);
  console.log('');

  // 2) Conectar a Google API
  console.log('2) Conectando a Google Sheets API...');
  const auth = new google.auth.GoogleAuth({
    keyFile: RUTA_CRED,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  console.log('   ✅ Cliente creado\n');

  // 3) Conectar a MongoDB
  console.log('3) Conectando a MongoDB...');
  await conectarDB();
  console.log('   ✅ Conectado\n');

  // 4) Listar empresas con googleSheetId
  console.log('4) Empresas registradas:');
  const empresas = await Empresa.find().select('nombre googleSheetId activa').lean();
  if (empresas.length === 0) {
    console.log('   (no hay empresas)');
    await mongoose.disconnect();
    process.exit(0);
  }
  empresas.forEach(e => {
    const activa = e.activa === false ? ' [INACTIVA]' : '';
    const sheet = e.googleSheetId ? `sheetId=${e.googleSheetId}` : '(SIN googleSheetId configurado)';
    console.log(`   • ${e.nombre}${activa}  ${sheet}`);
    console.log(`     _id=${e._id}`);
  });
  console.log('');

  // 5) Probar cada empresa que tenga googleSheetId
  const targetId = process.argv[2];
  const candidatas = empresas.filter(e =>
    e.googleSheetId && (!targetId || String(e._id) === targetId)
  );

  if (candidatas.length === 0) {
    console.log('⚠️  Ninguna empresa tiene googleSheetId. Configúrale uno desde el panel del superadmin.');
    await mongoose.disconnect();
    process.exit(0);
  }

  for (const emp of candidatas) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Probando con empresa: ${emp.nombre}`);
    console.log(`  Sheet ID: ${emp.googleSheetId}`);
    console.log('═══════════════════════════════════════════════════════════');

    // 5a) Leer metadatos de la hoja
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: emp.googleSheetId });
      console.log('   ✅ Acceso de lectura OK');
      console.log(`   📄 Título del archivo: "${meta.data.properties.title}"`);
      console.log(`   📑 Pestañas existentes (${meta.data.sheets.length}):`);
      meta.data.sheets.forEach(s => {
        console.log(`      - "${s.properties.title}" (sheetId=${s.properties.sheetId})`);
      });
    } catch (err) {
      console.error('   ❌ NO se pudo leer la hoja:', err.message);
      if (err.code === 403 || /permission/i.test(err.message)) {
        console.error(`   👉 Compártela como Editor con: ${cred.client_email}`);
      } else if (err.code === 404 || /not found/i.test(err.message)) {
        console.error('   👉 El ID no existe o se borró la hoja.');
      }
      continue;
    }

    // 5b) Probar escritura: crear pestaña temporal y escribir
    const pestanaTemp = `_diagnostico_${Date.now()}`;
    try {
      console.log(`\n   Intentando crear pestaña temporal "${pestanaTemp}"...`);
      const r = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: emp.googleSheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: pestanaTemp } } }]
        }
      });
      const sheetId = r.data.replies[0].addSheet.properties.sheetId;
      console.log('   ✅ Pestaña creada (sheetId=' + sheetId + ')');

      console.log('   Escribiendo valores de prueba...');
      await sheets.spreadsheets.values.update({
        spreadsheetId: emp.googleSheetId,
        range: `'${pestanaTemp}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [['TEST', new Date().toISOString()], ['fila2', 'valor2']] }
      });
      console.log('   ✅ Escritura OK');

      console.log('   Probando formato (color de fondo en A1)...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: emp.googleSheetId,
        requestBody: {
          requests: [{
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
              cell: { userEnteredFormat: { backgroundColor: { red: 0.087, green: 0.760, blue: 0.639 } } },
              fields: 'userEnteredFormat.backgroundColor'
            }
          }]
        }
      });
      console.log('   ✅ Formato OK');

      console.log('   Borrando pestaña temporal...');
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: emp.googleSheetId,
        requestBody: { requests: [{ deleteSheet: { sheetId } }] }
      });
      console.log('   ✅ Limpieza OK');

      console.log('\n   🎉 TODO FUNCIONA — la sincronización debería trabajar bien.');
    } catch (err) {
      console.error('   ❌ FALLÓ:', err.message);
      if (err.errors) console.error('   Detalles:', JSON.stringify(err.errors, null, 2));
      if (err.code === 403) {
        console.error(`   👉 La cuenta ${cred.client_email} no tiene permiso de EDITOR (tal vez solo de visor)`);
      }
    }
    console.log('');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});
