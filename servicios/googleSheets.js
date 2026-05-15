const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const Registro = require('../models/Registro');
const { getFormato } = require('../formatos');

const RUTA_CREDENCIALES = process.env.GOOGLE_CREDENTIALS_PATH
  || path.join(__dirname, '..', 'google-credentials.json');

let sheets = null;
let disponible = false;
let cuentaServicioEmail = '';

function inicializar() {
  if (!fs.existsSync(RUTA_CREDENCIALES)) {
    console.warn('Google Sheets: sin archivo de credenciales, sincronización desactivada.');
    return;
  }
  try {
    const cred = JSON.parse(fs.readFileSync(RUTA_CREDENCIALES, 'utf8'));
    cuentaServicioEmail = cred.client_email || '';
    const auth = new google.auth.GoogleAuth({
      keyFile: RUTA_CREDENCIALES,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
    disponible = true;
    console.log(`Google Sheets: sincronización activada (cuenta: ${cuentaServicioEmail})`);
  } catch (err) {
    console.error('Google Sheets: error al inicializar:', err.message);
    disponible = false;
  }
}

function estaDisponible() {
  return disponible;
}

function getCuentaServicio() {
  return cuentaServicioEmail;
}

function fechaLargaEs(anio, mes, dia) {
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function nombrePestana(formato) {
  return `${formato.numero}. ${formato.nombreCorto || formato.nombre}`.slice(0, 90);
}

async function sincronizarFormato(spreadsheetId, empresaId, formatoId) {
  if (!disponible || !spreadsheetId) return;

  const formato = getFormato(formatoId);
  if (!formato) return;

  const pestana = nombrePestana(formato);

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existe = (meta.data.sheets || []).some(s => s.properties.title === pestana);
  if (!existe) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: pestana } } }]
      }
    });
  }

  const registros = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId
  }).sort({ anio: 1, mes: 1, dia: 1 }).lean();

  const encabezado = ['Año', 'Mes', 'Día', 'Fecha', 'Responsable', 'Observaciones'];
  const filas = registros.map(r => [
    r.anio,
    r.mes,
    r.dia,
    fechaLargaEs(r.anio, r.mes, r.dia),
    r.responsable,
    r.observaciones || ''
  ]);
  const valores = [encabezado, ...filas];

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${pestana}'`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${pestana}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: valores }
  });
}

module.exports = {
  inicializar,
  estaDisponible,
  getCuentaServicio,
  sincronizarFormato
};
