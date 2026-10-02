const Empresa = require('./models/Empresa');
const { FORMATOS, CARPETAS } = require('./formatos');

const TODOS_IDS = FORMATOS.map(f => f.id);

async function getConfigEmpresa(empresaId) {
  const e = await Empresa.findById(empresaId)
    .select('formatosActivos formatosCarpeta formatosCompartidos')
    .lean();

  // si la empresa ya no existe (ej: la borraron con una sesion vieja todavia activa),
  // no le doy acceso a nada en vez de asumir "todos los formatos habilitados"
  const activos = !e
    ? []
    : (Array.isArray(e.formatosActivos) && e.formatosActivos.length > 0)
      ? e.formatosActivos
      : TODOS_IDS.slice();

  const cDoc = (e && e.formatosCarpeta) || {};
  const carpetas = {};
  CARPETAS.forEach(c => {
    carpetas[c] = Array.isArray(cDoc[c]) ? cDoc[c].filter(id => activos.includes(id)) : [];
  });

  // Formatos que no están en ninguna carpeta van a cocina por defecto
  const conAlgunaCarpeta = new Set(CARPETAS.flatMap(c => carpetas[c]));
  const sinAsignar = activos.filter(id => !conAlgunaCarpeta.has(id));
  carpetas.cocina = [...carpetas.cocina, ...sinAsignar];

  const compartidos = Array.isArray(e && e.formatosCompartidos) ? e.formatosCompartidos : [];

  return {
    activos,
    carpetas,
    compartidos: compartidos.filter(id => activos.includes(id))
  };
}

// Devuelve TODAS las carpetas a las que pertenece un formato (puede ser más de una)
function getCarpetasDeFormato(carpetas, formatoId) {
  const resultado = CARPETAS.filter(c => carpetas[c].includes(formatoId));
  return resultado.length > 0 ? resultado : ['cocina'];
}

module.exports = { getConfigEmpresa, getCarpetasDeFormato };
