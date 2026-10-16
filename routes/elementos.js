// elementos: baños, neveras, llaves y tanques... un formato puede tener varios y cada uno se
// llena por separado. los configura el administrador (con su clave): cuantos hay y como se llama cada uno
const express = require('express');
const Empresa = require('../models/Empresa');
const { getFormato, ELEMENTO_NOMBRE_MAX } = require('../formatos');
const { getConfigEmpresa, elementosDe } = require('../empresaConfig');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');
const { adminElementosActivo } = require('./admin');
const { infoPendientes } = require('./registros');

const router = express.Router();
const TIPOS = ['refrigeracion', 'congelacion'];

function hoyTexto() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// valida formato y carpeta; devuelve { formato, carpeta, config } o { status, error }
async function contexto(req) {
  const formato = getFormato(req.params.formatoId);
  if (!formato) return { status: 404, error: 'Formato no encontrado' };
  if (!formato.elementos) return { status: 400, error: 'Este formato no se divide en elementos' };
  const carpeta = req.query.carpeta || 'cocina';
  const config = await getConfigEmpresa(req.session.empresa.id);
  if (!config.activos.includes(formato.id) || !(config.carpetas[carpeta] || []).includes(formato.id)) {
    return { status: 403, error: 'Este formato no está disponible en esa carpeta' };
  }
  return { formato, carpeta, config };
}

// la lista con el estado de hoy de cada uno (para las tarjetas)
async function listar(req, { formato, carpeta, config }) {
  const todos = elementosDe(config, formato.id, carpeta);
  const infos = await Promise.all(todos.map(e => e.activo ? infoPendientes(req.session.empresa.id, formato.id, carpeta, e) : null));
  return {
    ok: true,
    formato: { id: formato.id, nombre: formato.nombre, ...formato.elementos, momentos: formato.momentos ? formato.momentos.length : 1 },
    nombreMax: ELEMENTO_NOMBRE_MAX,
    admin: !!adminElementosActivo(req),
    configurado: todos.some(e => e.activo),
    elementos: todos.map((e, i) => ({
      id: e._id, nombre: e.nombre, tipo: e.tipo, activo: e.activo, desde: e.desde,
      estado: infos[i] && {
        diaActual: infos[i].diaActual,
        pendientes: infos[i].pendientes,
        atrasados: infos[i].pendientes.filter(d => d < infos[i].diaActual).length,
        hoyListo: !!infos[i].registroHoy && !infos[i].registroHoy.parcial,
        parciales: infos[i].parciales
      }
    }))
  };
}

router.get('/:formatoId', requireEmpresa, ah(async (req, res) => {
  const ctx = await contexto(req);
  if (ctx.error) return res.status(ctx.status).json({ ok: false, error: ctx.error });
  res.json(await listar(req, ctx));
}));

// guarda la lista de un formato en una carpeta: renombra, saca de servicio o vuelve a poner los que ya
// existen (con su id) y crea los nuevos (sin id). nunca borra: un elemento que no viene en la lista
// se queda como estaba
router.put('/:formatoId', requireEmpresa, limiteAdmin, ah(async (req, res) => {
  if (!adminElementosActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere la contraseña de administrador', requiereClaveAdmin: true });
  }
  const ctx = await contexto(req);
  if (ctx.error) return res.status(ctx.status).json({ ok: false, error: ctx.error });
  const { formato, carpeta } = ctx;
  const lista = Array.isArray(req.body.elementos) ? req.body.elementos : [];

  const empresa = await Empresa.findById(req.session.empresa.id);
  const actuales = empresa.elementos.filter(e => e.formato === formato.id && e.carpeta === carpeta);
  const final = actuales.map(e => ({ e, nombre: e.nombre, tipo: e.tipo, activo: e.activo, reactivar: false }));
  const nuevos = [];

  for (const it of lista) {
    const nombre = String(it.nombre == null ? '' : it.nombre).trim();
    if (!nombre) return res.status(400).json({ ok: false, error: 'Escribe el nombre de cada uno.' });
    if (nombre.length > ELEMENTO_NOMBRE_MAX) {
      return res.status(400).json({ ok: false, error: `"${nombre}" tiene más de ${ELEMENTO_NOMBRE_MAX} caracteres.` });
    }
    let tipo = null;
    if (formato.elementos.conTipo) {
      tipo = it.tipo;
      if (!TIPOS.includes(tipo)) return res.status(400).json({ ok: false, error: `Elige el tipo de "${nombre}".` });
    }
    const activo = it.activo !== false;
    if (it.id) {
      const f = final.find(x => String(x.e._id) === String(it.id));
      if (!f) return res.status(400).json({ ok: false, error: 'Uno de los elementos ya no existe. Recarga la pantalla.' });
      f.reactivar = !f.activo && activo;
      Object.assign(f, { nombre, tipo, activo });
    } else {
      nuevos.push({ nombre, tipo });
    }
  }

  const nombres = [...final.map(x => x.nombre), ...nuevos.map(x => x.nombre)].map(n => n.toLowerCase());
  if (new Set(nombres).size !== nombres.length) {
    return res.status(400).json({ ok: false, error: 'Hay dos con el mismo nombre. Cada uno debe llamarse distinto.' });
  }

  const hoy = hoyTexto();
  final.forEach(f => {
    f.e.nombre = f.nombre; f.e.tipo = f.tipo; f.e.activo = f.activo;
    // al volver a servicio no cuenta como pendiente el tiempo que estuvo fuera
    if (f.reactivar) f.e.desde = hoy;
  });
  nuevos.forEach(n => empresa.elementos.push({ formato: formato.id, carpeta, nombre: n.nombre, tipo: n.tipo, activo: true, desde: hoy }));
  await empresa.save();

  ctx.config = await getConfigEmpresa(req.session.empresa.id);
  res.json(await listar(req, ctx));
}));

module.exports = router;
