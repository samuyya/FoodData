// guarda fotos de asistencia, documentos de programas y logos de empresa.
// en disco local mientras no haya cuenta de Cloudinary configurada (dev, tests),
// y en Cloudinary si existe CLOUDINARY_URL (asi funciona en Render, que tiene
// disco efimero). el SDK de cloudinary se autoconfigura solo con esa variable.
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const logger = require('../logger');

const usarCloudinary = !!process.env.CLOUDINARY_URL;

const CARPETA_BASE = path.join(__dirname, '..', 'datos', 'asistencia');
const CARPETA_DOCS = path.join(__dirname, '..', 'datos', 'documentos');
const CARPETA_LOGOS = path.join(__dirname, '..', 'public', 'img', 'logos');

function subirBuffer(buffer, opciones) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(opciones, (err, resultado) => {
      if (err) return reject(err);
      resolve(resultado);
    });
    stream.end(buffer);
  });
}

// la firma no expira, pero eso no es un problema: esta URL nunca sale del
// servidor, la usamos aca mismo para bajar los bytes y servirselos al cliente
async function bajarAutenticado(publicId, resourceType) {
  const url = cloudinary.url(publicId, { type: 'authenticated', sign_url: true, resource_type: resourceType });
  const res = await fetch(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function quitarExtension(nombre) {
  return nombre.replace(/\.[^.]+$/, '');
}

async function guardarFotoAsistencia(empresaId, anio, mes, nombreArchivo, buffer) {
  const carpetaMes = `${anio}-${String(mes).padStart(2, '0')}`;
  if (usarCloudinary) {
    const publicId = `${empresaId}/${carpetaMes}/${quitarExtension(nombreArchivo)}`;
    await subirBuffer(buffer, { public_id: publicId, resource_type: 'image', type: 'authenticated' });
    return publicId;
  }
  const dir = path.join(CARPETA_BASE, String(empresaId), carpetaMes);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, nombreArchivo), buffer);
  return `${empresaId}/${carpetaMes}/${nombreArchivo}`;
}

// devuelve el buffer de la foto, o null si no existe
async function obtenerFotoAsistencia(referencia) {
  if (usarCloudinary) return bajarAutenticado(referencia, 'image');
  const ruta = path.join(CARPETA_BASE, referencia);
  if (!fs.existsSync(ruta)) return null;
  return fs.promises.readFile(ruta);
}

async function borrarFotoAsistencia(referencia) {
  if (usarCloudinary) {
    try { await cloudinary.uploader.destroy(referencia, { resource_type: 'image', type: 'authenticated' }); }
    catch (e) { logger.warn(`no se pudo borrar foto de cloudinary: ${e.message}`); }
    return;
  }
  try { await fs.promises.unlink(path.join(CARPETA_BASE, referencia)); }
  catch (e) { /* si ya no existe, no pasa nada */ }
}

// Guarda un archivo de programa. En disco: datos/documentos/{empresaId}/programa-{n}/{timestamp}-{nombre}
async function guardarDocumentoPrograma(empresaId, numeroPrograma, nombreOriginal, buffer) {
  const seguro = String(nombreOriginal).replace(/[^a-zA-Z0-9._\- ]/g, '_').slice(0, 100);
  const nombre = `${Date.now()}-${seguro}`;
  if (usarCloudinary) {
    const publicId = `${empresaId}/programa-${numeroPrograma}/${quitarExtension(nombre)}`;
    // siempre 'raw' aunque el archivo sea una imagen: asi no hay que adivinar
    // el resource_type al reconstruir la URL de descarga mas adelante
    await subirBuffer(buffer, { public_id: publicId, resource_type: 'raw', type: 'authenticated' });
    return publicId;
  }
  const dir = path.join(CARPETA_DOCS, String(empresaId), `programa-${numeroPrograma}`);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(path.join(dir, nombre), buffer);
  return `${empresaId}/programa-${numeroPrograma}/${nombre}`;
}

// devuelve el buffer del documento, o null si no existe
async function obtenerDocumentoPrograma(referencia) {
  if (usarCloudinary) return bajarAutenticado(referencia, 'raw');
  const ruta = path.join(CARPETA_DOCS, referencia);
  if (!fs.existsSync(ruta)) return null;
  return fs.promises.readFile(ruta);
}

async function borrarDocumento(referencia) {
  if (usarCloudinary) {
    try { await cloudinary.uploader.destroy(referencia, { resource_type: 'raw', type: 'authenticated' }); }
    catch (e) { logger.warn(`no se pudo borrar documento de cloudinary: ${e.message}`); }
    return;
  }
  try { await fs.promises.unlink(path.join(CARPETA_DOCS, referencia)); }
  catch (e) { /* si ya no existe, no pasa nada */ }
}

// el logo es publico (no hay nada sensible en el logo de un restaurante), asi
// que va con 'upload' normal y devolvemos la URL completa para guardar tal cual
// en empresa.logo — en disco devolvemos la ruta relativa de siempre
async function guardarLogo(buffer, extension) {
  if (usarCloudinary) {
    const publicId = `logos/logo-${Date.now()}`;
    const resultado = await subirBuffer(buffer, { public_id: publicId, resource_type: 'image', type: 'upload' });
    return resultado.secure_url;
  }
  if (!fs.existsSync(CARPETA_LOGOS)) await fs.promises.mkdir(CARPETA_LOGOS, { recursive: true });
  const nombre = `logo-${Date.now()}${extension}`;
  await fs.promises.writeFile(path.join(CARPETA_LOGOS, nombre), buffer);
  return `/img/logos/${nombre}`;
}

// logoValue es lo que quedo guardado en empresa.logo: una URL de Cloudinary o
// una ruta relativa local. se usa al reemplazar el logo o al borrar la empresa.
async function borrarLogo(logoValue) {
  if (!logoValue) return;
  if (usarCloudinary) {
    if (!logoValue.includes('res.cloudinary.com')) return; // logo local de antes de migrar, no hay nada que borrar en cloudinary
    const publicId = logoValue.split('/upload/')[1]?.replace(/^v\d+\//, '').replace(/\.[^./]+$/, '');
    if (!publicId) return;
    try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'upload' }); }
    catch (e) { logger.warn(`no se pudo borrar logo de cloudinary: ${e.message}`); }
    return;
  }
  try { await fs.promises.unlink(path.join(CARPETA_LOGOS, path.basename(logoValue))); }
  catch (e) { /* si ya no existe, no pasa nada */ }
}

module.exports = {
  guardarFotoAsistencia,
  obtenerFotoAsistencia,
  borrarFotoAsistencia,
  guardarDocumentoPrograma,
  obtenerDocumentoPrograma,
  borrarDocumento,
  guardarLogo,
  borrarLogo
};
