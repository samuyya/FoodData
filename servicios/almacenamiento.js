const path = require('path');
const fs = require('fs');

const CARPETA_BASE = path.join(__dirname, '..', 'datos', 'asistencia');

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

module.exports = { guardarFotoAsistencia, rutaAbsolutaFoto };
