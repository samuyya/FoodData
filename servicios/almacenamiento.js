const path = require('path');
const fs = require('fs');

const CARPETA_BASE = path.join(__dirname, '..', 'datos', 'asistencia');
const CARPETA_DOCS = path.join(__dirname, '..', 'datos', 'documentos');

async function guardarFotoAsistencia(empresaId, anio, mes, nombreArchivo, buffer) {
  const carpetaMes = `${anio}-${String(mes).padStart(2, '0')}`;
  const dir = path.join(CARPETA_BASE, String(empresaId), carpetaMes);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, nombreArchivo), buffer);
  return `${empresaId}/${carpetaMes}/${nombreArchivo}`;
}

function rutaAbsolutaFoto(referencia) {
  return path.join(CARPETA_BASE, referencia);
}

async function borrarFotoAsistencia(referencia) {
  try { await fs.promises.unlink(path.join(CARPETA_BASE, referencia)); }
  catch (e) { /* si ya no existe, no pasa nada */ }
}

// Guarda un archivo de programa: datos/documentos/{empresaId}/programa-{n}/{timestamp}-{nombreSanitizado}
async function guardarDocumentoPrograma(empresaId, numeroPrograma, nombreOriginal, buffer) {
  const dir = path.join(CARPETA_DOCS, String(empresaId), `programa-${numeroPrograma}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const seguro = String(nombreOriginal).replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 100);
  const nombre = `${Date.now()}-${seguro}`;
  await fs.promises.writeFile(path.join(dir, nombre), buffer);
  return `${empresaId}/programa-${numeroPrograma}/${nombre}`;
}

function rutaAbsolutaDocumento(referencia) {
  return path.join(CARPETA_DOCS, referencia);
}

async function borrarDocumento(referencia) {
  try { await fs.promises.unlink(path.join(CARPETA_DOCS, referencia)); }
  catch (e) { /* si ya no existe, no pasa nada */ }
}

module.exports = {
  guardarFotoAsistencia,
  rutaAbsolutaFoto,
  borrarFotoAsistencia,
  guardarDocumentoPrograma,
  rutaAbsolutaDocumento,
  borrarDocumento
};
