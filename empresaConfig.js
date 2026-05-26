const Empresa = require('./models/Empresa');
const { FORMATOS } = require('./formatos');

const TODOS_IDS = FORMATOS.map(f => f.id);

async function getConfigEmpresa(empresaId) {
  const e = await Empresa.findById(empresaId)
    .select('formatosActivos formatosCarpeta formatosCompartidos')
    .lean();

  const activos = (e && Array.isArray(e.formatosActivos) && e.formatosActivos.length > 0)
    ? e.formatosActivos
    : TODOS_IDS.slice();

  const cDoc = (e && e.formatosCarpeta) || {};
  const cocina        = Array.isArray(cDoc.cocina)        ? cDoc.cocina.filter(id => activos.includes(id))        : [];
  const salon         = Array.isArray(cDoc.salon)         ? cDoc.salon.filter(id => activos.includes(id))         : [];
  const administracion= Array.isArray(cDoc.administracion)? cDoc.administracion.filter(id => activos.includes(id)): [];

  // Formatos que no están en ninguna carpeta van a cocina por defecto
  const conAlgunaCarpeta = new Set([...cocina, ...salon, ...administracion]);
  const sinAsignar = activos.filter(id => !conAlgunaCarpeta.has(id));

  const compartidos = Array.isArray(e && e.formatosCompartidos) ? e.formatosCompartidos : [];

  return {
    activos,
    carpetas: {
      cocina: [...cocina, ...sinAsignar],
      salon,
      administracion
    },
    compartidos: compartidos.filter(id => activos.includes(id))
  };
}

// Si el formato es "compartido" en varias carpetas, todos los registros viven bajo
// UNA carpeta canonica (la primera en el orden cocina > salon > administracion).
// Si no es compartido, devuelve la carpeta tal cual.
function carpetaCanonica(formatoId, carpetaSolicitada, config) {
  if (!config || !Array.isArray(config.compartidos)) return carpetaSolicitada;
  if (!config.compartidos.includes(formatoId)) return carpetaSolicitada;
  const orden = ['cocina', 'salon', 'administracion'];
  for (const c of orden) {
    if (config.carpetas[c].includes(formatoId)) return c;
  }
  return carpetaSolicitada;
}

// Devuelve TODAS las carpetas a las que pertenece un formato (puede ser más de una)
function getCarpetasDeFormato(carpetas, formatoId) {
  const resultado = [];
  if (carpetas.cocina.includes(formatoId))        resultado.push('cocina');
  if (carpetas.salon.includes(formatoId))         resultado.push('salon');
  if (carpetas.administracion.includes(formatoId))resultado.push('administracion');
  return resultado.length > 0 ? resultado : ['cocina'];
}

module.exports = { getConfigEmpresa, getCarpetasDeFormato, carpetaCanonica };
