const EmpleadoLista = require('../models/EmpleadoLista');
const { MODULOS_BASE } = require('../models/Empresa');
const logger = require('../logger');

// cada modulo lleva su propia lista de empleados
const LISTAS = {
  asistencia: { nombre: 'Asistencia', modulo: 'asistencia' },
  presentacion: { nombre: 'Presentación personal', modulo: 'formatos' },
  capacitaciones: { nombre: 'Capacitaciones', modulo: 'capacitaciones' }
};

// ojo: capacitaciones todavia no tiene pantallas, asi que no se ofrece como destino hasta que exista
const LISTAS_VISIBLES = ['asistencia', 'presentacion'];

function listasDisponibles(req, config) {
  const modulos = (req.session.empresa.modulosActivos && req.session.empresa.modulosActivos.length)
    ? req.session.empresa.modulosActivos
    : MODULOS_BASE;
  return LISTAS_VISIBLES.filter(id => {
    if (!modulos.includes(LISTAS[id].modulo)) return false;
    return id !== 'presentacion' || config.activos.includes('presentacion_personal');
  });
}

// la lista unica de antes pasa a ser la de asistencia (los registros de horas apuntan a esos ids)
// y cada empleado se copia a presentacion para que nada deje de funcionar. solo corre una vez
async function migrarListasEmpleados() {
  try {
    const viejos = await EmpleadoLista.find({ lista: { $exists: false } }).select('nombre empresa_id').lean();
    if (viejos.length > 0) {
      await EmpleadoLista.updateMany({ _id: { $in: viejos.map(v => v._id) } }, { $set: { lista: 'asistencia' } });
    }
    // el indice viejo (empresa + nombre) no deja tener el mismo nombre en dos listas
    await EmpleadoLista.syncIndexes();
    if (viejos.length > 0) {
      await EmpleadoLista.insertMany(
        viejos.map(v => ({ empresa_id: v.empresa_id, nombre: v.nombre, lista: 'presentacion' })),
        { ordered: false }
      ).catch(() => {});
      logger.info(`Migración empleados: ${viejos.length} copiados a la lista de presentación personal.`);
    }
  } catch (err) {
    logger.error(`error migrando listas de empleados: ${err.message}`);
  }
}

module.exports = { LISTAS, LISTAS_VISIBLES, listasDisponibles, migrarListasEmpleados };
