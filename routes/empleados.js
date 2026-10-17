const express = require('express');
const EmpleadoLista = require('../models/EmpleadoLista');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { getConfigEmpresa } = require('../empresaConfig');
const { adminCarpetaAdministracionActivo, adminReporteActivo } = require('./admin');
const { LISTAS, listasDisponibles } = require('../servicios/empleadosListas');

const router = express.Router();

const REGEX_LETRAS = /^[A-Za-zÀ-ÿÑñ\s]+$/;

// null si se puede usar la lista, o { status, error }
function permitida(req, config, lista) {
  if (!listasDisponibles(req, config).includes(lista)) {
    return { status: 403, error: 'Tu empresa no tiene este módulo habilitado' };
  }
  if (lista !== 'presentacion') return null;
  const { carpetas } = config;
  const esCarpetaAdmin   = carpetas.administracion.includes('presentacion_personal');
  const tieneOtraCarpeta = Object.keys(carpetas).some(c => c !== 'administracion' && carpetas[c].includes('presentacion_personal'));
  // adminReporte tambien vale aca -- corregir un dia de presentacion_personal
  // necesita leer la lista de empleados para repoblar el formulario, y esa
  // correccion ya la autoriza la clave del reporte (no hace falta ademas
  // haber entrado a Administracion)
  if (esCarpetaAdmin && !tieneOtraCarpeta && !adminCarpetaAdministracionActivo(req) && !adminReporteActivo(req)) {
    return { status: 401, error: 'Requiere acceso a la carpeta Administración para gestionar empleados' };
  }
  return null;
}

function validarNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (!limpio) return { error: 'El nombre es obligatorio' };
  if (!REGEX_LETRAS.test(limpio)) return { error: 'Solo se permiten letras y espacios' };
  return { nombre: limpio };
}

function leerLista(req) {
  const lista = req.query.lista || 'presentacion';
  return LISTAS[lista] ? lista : null;
}

// a que otras listas quiere aplicar el mismo cambio (en el body o en ?aplicarEn=a,b)
function leerDestinos(req, origen) {
  const crudo = [].concat((req.body && req.body.aplicarEn) || String(req.query.aplicarEn || '').split(','));
  return [...new Set(crudo)].filter(l => l && l !== origen && LISTAS[l]);
}

// hace el mismo cambio en las otras listas marcadas y devuelve que paso en cada una
async function aplicarEnOtras(req, config, destinos, accion) {
  const resultados = [];
  for (const lista of destinos) {
    const nombre = LISTAS[lista].nombre;
    if (permitida(req, config, lista)) { resultados.push({ lista, nombre, resultado: 'sin permiso' }); continue; }
    resultados.push({ lista, nombre, resultado: await accion(lista) });
  }
  return resultados;
}

router.get('/listas', requireEmpresa, ah(async (req, res) => {
  const config = await getConfigEmpresa(req.session.empresa.id);
  const listas = listasDisponibles(req, config).map(id => ({ id, nombre: LISTAS[id].nombre }));
  res.json({ ok: true, listas });
}));

router.get('/', requireEmpresa, ah(async (req, res) => {
  const lista = leerLista(req);
  if (!lista) return res.status(400).json({ ok: false, error: 'Lista desconocida' });
  const config = await getConfigEmpresa(req.session.empresa.id);
  const no = permitida(req, config, lista);
  if (no) return res.status(no.status).json({ ok: false, error: no.error });

  const empleados = await EmpleadoLista
    .find({ empresa_id: req.session.empresa.id, lista })
    .sort({ nombre: 1 })
    .lean();
  res.json({ ok: true, empleados });
}));

router.post('/', requireEmpresa, ah(async (req, res) => {
  const lista = leerLista(req);
  if (!lista) return res.status(400).json({ ok: false, error: 'Lista desconocida' });
  const config = await getConfigEmpresa(req.session.empresa.id);
  const no = permitida(req, config, lista);
  if (no) return res.status(no.status).json({ ok: false, error: no.error });

  const v = validarNombre(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const empresa_id = req.session.empresa.id;
  const duplicado = await EmpleadoLista.findOne({ empresa_id, lista, nombre: v.nombre });
  if (duplicado) {
    return res.status(409).json({ ok: false, error: 'Ya existe un empleado con ese nombre' });
  }

  let empleado;
  try {
    empleado = await EmpleadoLista.create({ nombre: v.nombre, empresa_id, lista });
  } catch (err) {
    // por si dos requests casi simultaneos pasan el findOne de arriba a la vez —
    // el indice unico de empresa_id+lista+nombre es el que de verdad evita el duplicado
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un empleado con ese nombre' });
    }
    throw err;
  }

  const aplicado = await aplicarEnOtras(req, config, leerDestinos(req, lista), async (otra) => {
    if (await EmpleadoLista.findOne({ empresa_id, lista: otra, nombre: v.nombre })) return 'ya estaba';
    await EmpleadoLista.create({ nombre: v.nombre, empresa_id, lista: otra });
    return 'listo';
  });
  res.status(201).json({ ok: true, empleado, aplicado });
}));

router.put('/:id', requireEmpresa, ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const actual = await EmpleadoLista.findOne({ _id: req.params.id, empresa_id });
  if (!actual) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
  const config = await getConfigEmpresa(empresa_id);
  const no = permitida(req, config, actual.lista);
  if (no) return res.status(no.status).json({ ok: false, error: no.error });

  const v = validarNombre(req.body.nombre);
  if (v.error) return res.status(400).json({ ok: false, error: v.error });

  const duplicado = await EmpleadoLista.findOne({ empresa_id, lista: actual.lista, nombre: v.nombre, _id: { $ne: actual._id } });
  if (duplicado) {
    return res.status(409).json({ ok: false, error: 'Ya existe otro empleado con ese nombre' });
  }

  const nombreViejo = actual.nombre;
  let empleado;
  try {
    actual.nombre = v.nombre;
    empleado = await actual.save();
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe otro empleado con ese nombre' });
    }
    throw err;
  }

  // en las otras listas se busca a la persona por su nombre de antes
  const aplicado = await aplicarEnOtras(req, config, leerDestinos(req, actual.lista), async (otra) => {
    const e = await EmpleadoLista.findOne({ empresa_id, lista: otra, nombre: nombreViejo });
    if (!e) return 'no estaba';
    if (await EmpleadoLista.findOne({ empresa_id, lista: otra, nombre: v.nombre })) return 'ya hay uno con ese nombre';
    e.nombre = v.nombre;
    await e.save();
    return 'listo';
  });
  res.json({ ok: true, empleado, aplicado });
}));

router.delete('/:id', requireEmpresa, ah(async (req, res) => {
  const empresa_id = req.session.empresa.id;
  const actual = await EmpleadoLista.findOne({ _id: req.params.id, empresa_id });
  if (!actual) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
  const config = await getConfigEmpresa(empresa_id);
  const no = permitida(req, config, actual.lista);
  if (no) return res.status(no.status).json({ ok: false, error: no.error });

  await actual.deleteOne();
  const aplicado = await aplicarEnOtras(req, config, leerDestinos(req, actual.lista), async (otra) => {
    const e = await EmpleadoLista.findOneAndDelete({ empresa_id, lista: otra, nombre: actual.nombre });
    return e ? 'listo' : 'no estaba';
  });
  res.json({ ok: true, aplicado });
}));

module.exports = router;
