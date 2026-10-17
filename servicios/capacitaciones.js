const EmpleadoLista = require('../models/EmpleadoLista');
const Empresa = require('../models/Empresa');
const Capacitacion = require('../models/Capacitacion');
const Asignacion = require('../models/AsignacionCapacitacion');

// la lista de capacitaciones arranca como copia de la de asistencia, una sola vez por empresa
async function asegurarListaCapacitaciones(empresaId) {
  const e = await Empresa.findOneAndUpdate(
    { _id: empresaId, capacitacionesListaIniciada: { $ne: true } },
    { $set: { capacitacionesListaIniciada: true } }
  );
  if (!e) return;
  const asist = await EmpleadoLista.find({ empresa_id: empresaId, lista: 'asistencia' }).select('nombre').lean();
  if (asist.length === 0) return;
  await EmpleadoLista.insertMany(
    asist.map(a => ({ empresa_id: empresaId, nombre: a.nombre, lista: 'capacitaciones' })),
    { ordered: false }
  ).catch(() => {});
}

function aplicaPorRegla(cap, emp) {
  // el cargo puede venir poblado ({ _id, nombre }) o como id
  const cargoId = emp.cargo && (emp.cargo._id || emp.cargo);
  return cap.alcance === 'todos' || (!!cargoId && cap.cargos.some(c => String(c) === String(cargoId)));
}

// de donde le viene la capacitacion a la persona (null = no le corresponde)
function origenDe(cap, emp, asig) {
  if (asig && asig.origen === 'excluida') return null;
  if (asig) return asig.origen;
  if (!aplicaPorRegla(cap, emp)) return null;
  return cap.alcance === 'todos' ? 'todos' : 'cargo';
}

// a quien entra nuevo se le asigna el paquete de ingreso (solo las que ese dia esten marcadas)
async function asignarIngreso(empresaId, empleadoId) {
  const caps = await Capacitacion.find({ empresa_id: empresaId, activa: true, ingreso: true }).select('_id').lean();
  if (caps.length === 0) return 0;
  await Asignacion.insertMany(
    caps.map(c => ({ empresa_id: empresaId, empleado_id: empleadoId, capacitacion_id: c._id, origen: 'ingreso' })),
    { ordered: false }
  ).catch(() => {});
  return caps.length;
}

// la tabla de quien tiene que hacer que: una fila por persona, una celda por capacitacion
async function resumen(empresaId) {
  await asegurarListaCapacitaciones(empresaId);
  const [caps, gente, asigs] = await Promise.all([
    Capacitacion.find({ empresa_id: empresaId, activa: true }).sort({ createdAt: 1 }).lean(),
    EmpleadoLista.find({ empresa_id: empresaId, lista: 'capacitaciones' }).sort({ nombre: 1 }).populate('cargo', 'nombre').lean(),
    Asignacion.find({ empresa_id: empresaId }).lean()
  ]);
  const porPar = new Map(asigs.map(a => [`${a.empleado_id}:${a.capacitacion_id}`, a]));
  return {
    caps: caps.map(c => ({ id: c._id, titulo: c.titulo })),
    gente: gente.map(g => ({
      id: g._id, nombre: g.nombre, cargo: g.cargo ? { id: g.cargo._id, nombre: g.cargo.nombre } : null,
      celdas: caps.map(c => origenDe(c, g, porPar.get(`${g._id}:${c._id}`)) || null)
    }))
  };
}

module.exports = { asegurarListaCapacitaciones, aplicaPorRegla, origenDe, asignarIngreso, resumen };
