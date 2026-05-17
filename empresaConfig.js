const Empresa = require('./models/Empresa');
const { FORMATOS } = require('./formatos');

const TODOS_IDS = FORMATOS.map(f => f.id);
const RESTRINGIDOS_DEFECTO = FORMATOS.filter(f => f.restringidoPorDefecto).map(f => f.id);

async function getConfigEmpresa(empresaId) {
  const e = await Empresa.findById(empresaId)
    .select('formatosActivos formatosRestringidos')
    .lean();

  const activos = (e && Array.isArray(e.formatosActivos) && e.formatosActivos.length > 0)
    ? e.formatosActivos
    : TODOS_IDS.slice();

  const restringidosRaw = (e && Array.isArray(e.formatosRestringidos))
    ? e.formatosRestringidos
    : RESTRINGIDOS_DEFECTO;

  const restringidos = restringidosRaw.filter(id => activos.includes(id));
  return { activos, restringidos };
}

module.exports = { getConfigEmpresa };
