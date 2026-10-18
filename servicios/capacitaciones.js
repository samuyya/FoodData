const EmpleadoLista = require('../models/EmpleadoLista');
const Empresa = require('../models/Empresa');
const Capacitacion = require('../models/Capacitacion');
const Asignacion = require('../models/AsignacionCapacitacion');
const Constancia = require('../models/ConstanciaCapacitacion');

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
  const [caps, gente, asigs, consts] = await Promise.all([
    Capacitacion.find({ empresa_id: empresaId, activa: true }).sort({ createdAt: 1 }).lean(),
    EmpleadoLista.find({ empresa_id: empresaId, lista: 'capacitaciones' }).sort({ nombre: 1 }).populate('cargo', 'nombre').lean(),
    Asignacion.find({ empresa_id: empresaId }).lean(),
    Constancia.find({ empresa_id: empresaId }).select('capacitacion_id empleado_id version fecha').sort({ fecha: -1 }).lean()
  ]);
  // la fecha de la constancia vigente (la de la version actual del material) de cada par
  const hechas = new Map();
  consts.forEach(k => { const clave = `${k.empleado_id}:${k.capacitacion_id}:${k.version}`; if (!hechas.has(clave)) hechas.set(clave, k.fecha); });
  const porPar = new Map(asigs.map(a => [`${a.empleado_id}:${a.capacitacion_id}`, a]));
  return {
    caps: caps.map(c => ({ id: c._id, titulo: c.titulo })),
    gente: gente.map(g => ({
      id: g._id, nombre: g.nombre, cargo: g.cargo ? { id: g.cargo._id, nombre: g.cargo.nombre } : null,
      celdas: caps.map(c => origenDe(c, g, porPar.get(`${g._id}:${c._id}`)) || null),
      hechas: caps.map(c => hechas.get(`${g._id}:${c._id}:${c.version}`) || null)
    }))
  };
}

// "2026-10-17" -> fecha local; null si no es una fecha
function parseDia(s) {
  const [a, m, d] = String(s || '').split('-').map(Number);
  return (a && m && d) ? new Date(a, m - 1, d) : null;
}

// quien la hizo (constancias del periodo) y a quien le toca y todavia no la hace con la version actual
async function reporteDe(empresaId, capId, { desde, hasta } = {}) {
  const cap = await Capacitacion.findOne({ _id: capId, empresa_id: empresaId }).lean();
  if (!cap) return null;
  const ini = parseDia(desde), fin = parseDia(hasta);
  const filtro = { empresa_id: empresaId, capacitacion_id: cap._id };
  if (ini || fin) {
    filtro.fecha = {};
    if (ini) filtro.fecha.$gte = ini;
    if (fin) filtro.fecha.$lt = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate() + 1);
  }
  const [consts, todas, gente, asigs] = await Promise.all([
    Constancia.find(filtro).sort({ fecha: 1 }).lean(),
    Constancia.find({ empresa_id: empresaId, capacitacion_id: cap._id, version: cap.version }).select('empleado_id').lean(),
    EmpleadoLista.find({ empresa_id: empresaId, lista: 'capacitaciones' }).sort({ nombre: 1 }).populate('cargo', 'nombre').lean(),
    Asignacion.find({ empresa_id: empresaId, capacitacion_id: cap._id }).lean()
  ]);
  const hechas = new Set(todas.map(k => String(k.empleado_id)));
  const porPersona = new Map(asigs.map(a => [String(a.empleado_id), a]));
  return {
    capacitacion: {
      id: cap._id, titulo: cap.titulo, programa: cap.programa, version: cap.version, foto: cap.foto, activa: cap.activa,
      evaluacion: cap.evaluacion.activa ? { minimo: cap.evaluacion.minimo, preguntas: cap.evaluacion.preguntas.length } : null,
      material: cap.material.tipo === 'archivo' ? cap.material.archivoNombre : cap.material.enlace
    },
    filas: consts.map(k => ({ id: k._id, nombre: k.empleadoNombre, cargo: k.cargoNombre, fecha: k.fecha, nota: k.nota, conFoto: !!k.fotoRef, version: k.version })),
    pendientes: gente
      .filter(g => origenDe(cap, g, porPersona.get(String(g._id))) && !hechas.has(String(g._id)))
      .map(g => ({ nombre: g.nombre, cargo: g.cargo ? g.cargo.nombre : '' }))
  };
}

module.exports = { asegurarListaCapacitaciones, aplicaPorRegla, origenDe, asignarIngreso, resumen, reporteDe, parseDia };
