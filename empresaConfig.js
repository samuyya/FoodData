const Empresa = require('./models/Empresa');
const { FORMATOS, CARPETAS, getFormato } = require('./formatos');

const TODOS_IDS = FORMATOS.map(f => f.id);

async function getConfigEmpresa(empresaId) {
  const e = await Empresa.findById(empresaId)
    .select('formatosActivos formatosCarpeta formatosCompartidos elementos')
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
    compartidos: compartidos.filter(id => activos.includes(id)),
    elementos: (e && e.elementos) || []
  };
}

// Devuelve TODAS las carpetas a las que pertenece un formato (puede ser más de una)
function getCarpetasDeFormato(carpetas, formatoId) {
  const resultado = CARPETAS.filter(c => carpetas[c].includes(formatoId));
  return resultado.length > 0 ? resultado : ['cocina'];
}

// elementos (baños, neveras...) de un formato en una carpeta
function elementosDe(config, formatoId, carpeta, soloActivos) {
  return config.elementos.filter(e => e.formato === formatoId && e.carpeta === carpeta && (!soloActivos || e.activo));
}

// cada "instancia" de un formato en una carpeta: un elemento (baño, nevera...) o null si el formato se
// llena como uno solo. los registros viejos sin elemento solo cuentan mientras no haya ninguno en servicio
function gruposDe(config, formatoId, carpeta) {
  const f = getFormato(formatoId);
  const todos = f && f.elementos ? elementosDe(config, formatoId, carpeta) : [];
  if (todos.length === 0) return [null];
  return todos.some(e => e.activo) ? todos : [...todos, null];
}

// nombre de la pestaña de un elemento: "Baño · Mujeres" (max 31 letras por el limite de excel)
function nombreHojaElemento(formato, el, sufijo) {
  const base = `${formato.elementos.abrev} · ${el.nombre}`.replace(/[\\\/\?\*\[\]:]/g, '');
  return base.slice(0, 31 - sufijo.length) + sufijo;
}

function buscarElemento(config, id) {
  return id ? config.elementos.find(e => String(e._id) === String(id)) || null : null;
}

// texto de la fila de arriba en la hoja: "Baño: Mujeres" o "T°: Nevera 1 · Refrigeración"
function textoElemento(formato, el) {
  const tipo = el.tipo === 'congelacion' ? ' · Congelación' : el.tipo === 'refrigeracion' ? ' · Refrigeración' : '';
  return `${formato.elementos.abrev}: ${el.nombre}${tipo}${el.activo ? '' : ' (fuera de servicio)'}`;
}

module.exports = { getConfigEmpresa, getCarpetasDeFormato, elementosDe, gruposDe, nombreHojaElemento, buscarElemento, textoElemento };
