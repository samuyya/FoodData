// calculos del modulo de inventarios. lo usan las rutas y el excel, asi los
// numeros que se ven en pantalla y los que se descargan salen de lo mismo
const ItemInventario = require('../models/ItemInventario');
const MovInventario = require('../models/MovInventario');
const ConteoInventario = require('../models/ConteoInventario');
const VentaDia = require('../models/VentaDia');

const { CATEGORIAS } = ItemInventario;
// materia prima, bebidas, empaques e insumos se gastan usandolos: su conteo es la cantidad
// final del mes. menaje, mobiliario y otros gastos deberian seguir ahi: su conteo valida
const CONSUMIBLE = { 'Materia prima': true, 'Bebidas': true, 'Empaques': true, 'Insumos': true };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const pad = n => String(n).padStart(2, '0');
function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function sumarDias(ymd, dias) {
  const [a, m, d] = ymd.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
}
function mesAnterior(ym) {
  const [a, m] = ym.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`;
}
const nombreMes = ym => MESES[Number(ym.split('-')[1]) - 1]
const etiquetaMes = ym => `${nombreMes(ym)} de ${ym.split('-')[0]}`
function fechaCorta(ymd) {
  const [, m, d] = ymd.split('-');
  return `${Number(d)} ${MESES[Number(m) - 1].slice(0, 3)}`;
}

// el inventario general que se hace en los primeros dias del mes cierra el mes anterior
function mesQueCierra(ymd) {
  const [a, m, d] = ymd.split('-').map(Number);
  return d <= 15 ? mesAnterior(`${a}-${pad(m)}`) : `${a}-${pad(m)}`;
}

async function cargar(empresaId) {
  const [items, movs] = await Promise.all([
    ItemInventario.find({ empresa_id: empresaId }).lean(),
    MovInventario.find({ empresa_id: empresaId, borrado: null }).sort({ fecha: 1, createdAt: 1 }).lean()
  ]);
  const porItem = new Map();
  items.forEach(i => porItem.set(String(i._id), []));
  movs.forEach(m => {
    const k = String(m.item_id);
    if (!porItem.has(k)) porItem.set(k, []);
    porItem.get(k).push(m);
  });
  return { items, movs, porItem };
}

// menaje y mobiliario: lo que deberia haber hoy (ultimo conteo + lo que entro - las bajas)
function existencia(item, movsItem) {
  const desde = item.conteoFecha;
  let total = item.conteoFecha ? item.conteo : 0;
  for (const m of movsItem) {
    if (desde && m.fecha <= desde) continue;
    total += m.tipo === 'ing' ? m.cant : -m.cant;
  }
  return Math.round(total * 1000) / 1000;
}

// valor exacto de una cantidad con el metodo PEPS: lo que queda se valora con el
// precio de las compras mas recientes hacia atras. lo que no alcance a cubrirse con
// compras registradas se valora con el precio de arranque del item
function valorPEPS(item, cant, hasta, movsItem) {
  if (!cant || cant <= 0) return 0;
  const compras = movsItem.filter(m => m.tipo === 'ing' && m.fecha <= hasta).slice().reverse();
  let falta = cant, total = 0;
  for (const m of compras) {
    if (falta <= 0) break;
    const t = Math.min(falta, m.cant);
    total += t * m.costo / m.cant;
    falta -= t;
  }
  if (falta > 0) total += falta * (item.precioBase || item.precio || 0);
  return Math.round(total);
}

// solo informativo: desde el primer cambio de precio se muestra el promedio
// ponderado (lo pagado / lo comprado) con el detalle de cada compra
function precioInfo(item, movsItem, desde, hasta) {
  const compras = movsItem.filter(m => m.tipo === 'ing' && m.fecha >= desde && m.fecha <= hasta)
  let cambios = 0;
  compras.forEach((m, i) => {
    if (i && Math.round(m.costo / m.cant) !== Math.round(compras[i - 1].costo / compras[i - 1].cant)) cambios++;
  });
  const detalle = compras.map(m => ({ fecha: m.fecha, cant: m.cant, precio: Math.round(m.costo / m.cant), prov: m.prov }));
  if (cambios >= 1) {
    const precio = compras.reduce((a, m) => a + m.costo, 0) / compras.reduce((a, m) => a + m.cant, 0);
    return { precio: Math.round(precio), promedio: true, cambios, compras: detalle };
  }
  return { precio: item.precio || item.precioBase || 0, promedio: false, cambios, compras: detalle };
}

async function recalcularPrecio(itemId) {
  const ult = await MovInventario.findOne({ item_id: itemId, tipo: 'ing', borrado: null }).sort({ fecha: -1, createdAt: -1 }).lean();
  if (ult) await ItemInventario.updateOne({ _id: itemId }, { $set: { precio: Math.round(ult.costo / ult.cant) } });
}

// gasto del cierre: lo que habia al cierre anterior + lo que se compro - las bajas -
// lo que quedo, por categoria y con valores exactos. las compras de items que no se
// contaron (o no estan en la lista) se toman como gastadas completas
function calcularCierre(conteo, anterior, datos) {
  const { items, porItem } = datos;
  const res = conteo.resultado || {};
  const fecha = conteo.fechaAprobado;
  const desde = anterior ? anterior.fechaAprobado : '0000-00-00';
  const itemDe = id => items.find(i => String(i._id) === id);

  const consumo = Object.keys(CONSUMIBLE).map(c => {
    let ini = 0, com = 0, baj = 0, fin = 0;
    const contados = new Set();
    for (const [id, r] of Object.entries(res)) {
      const it = itemDe(id);
      if (!it || it.cat !== c) continue;
      contados.add(id);
      const ms = porItem.get(id) || [];
      if (r.antesFecha) ini += valorPEPS(it, r.antes, r.antesFecha, ms);
      ms.forEach(m => {
        if (m.fecha <= (r.antesFecha || '0000-00-00') || m.fecha > fecha) return;
        if (m.tipo === 'ing') com += m.costo; else baj += m.costo;
      });
      fin += valorPEPS(it, r.contado, fecha, ms);
    }
    items.filter(i => i.cat === c && !contados.has(String(i._id))).forEach(it => {
      (porItem.get(String(it._id)) || []).forEach(m => {
        if (m.fecha <= desde || m.fecha > fecha) return;
        if (m.tipo === 'ing') com += m.costo; else baj += m.costo;
      });
    });
    return { cat: c, ini, com, baj, fin, gasto: ini + com - baj - fin, real: ini + com - fin };
  });

  const diferencias = [];
  for (const [id, r] of Object.entries(res)) {
    const it = itemDe(id);
    // la primera vez que se cuenta un item ese conteo es el punto de partida, no una diferencia
    if (!it || CONSUMIBLE[it.cat] || !r.antesFecha) continue;
    const dif = Math.round((r.contado - r.deberia) * 1000) / 1000;
    if (!dif) continue;
    const valor = dif < 0
      ? valorPEPS(it, -dif, fecha, porItem.get(id) || [])
      : Math.round(dif * (it.precio || it.precioBase || 0));
    diferencias.push({ id, nombre: it.nombre, cat: it.cat, u: it.u, deberia: r.deberia, contado: r.contado, dif, valor });
  }
  const faltante = diferencias.filter(d => d.dif < 0).reduce((a, d) => a + d.valor, 0);
  const gasto = consumo.reduce((a, x) => a + x.gasto, 0);

  const cambiaron = [];
  for (const id of Object.keys(res)) {
    const it = itemDe(id);
    if (!it || !CONSUMIBLE[it.cat]) continue;
    const p = precioInfo(it, porItem.get(id) || [], sumarDias(desde, 1), fecha);
    if (p.promedio) cambiaron.push({ id, nombre: it.nombre, u: it.u, ...p });
  }
  return { consumo, diferencias, faltante, gasto, cambiaron, fecha, desde };
}

async function cierresAprobados(empresaId) {
  return ConteoInventario.find({ empresa_id: empresaId, estado: 'aprobado' }).sort({ fechaAprobado: -1, updatedAt: -1 }).lean();
}

// food cost: cuanto de lo vendido se fue en costo de producto, comida y bebidas aparte.
// el costo sale de los inventarios aprobados (lo que habia + lo que se compro - lo que quedo),
// asi que incluye las bajas y la comida del personal. las ventas las escribe el administrador
function grupoFC(it, empaques) {
  if (it.cat === 'Empaques') return empaques ? 'Comida' : null;
  if (it.cat === 'Materia prima') return it.costoDe || 'Comida';
  if (it.cat === 'Bebidas') return it.costoDe || 'Bebidas';
  return null;
}
function diasEntre(desde, hasta) {
  const r = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) r.push(f);
  return r;
}
function lunesDe(ymd) {
  const [a, m, d] = ymd.split('-').map(Number);
  return sumarDias(ymd, -((new Date(a, m - 1, d).getDay() + 6) % 7));
}

// costo de cada item del food cost entre dos cierres
function costosCierre(conteo, anterior, datos, empaques) {
  const res = conteo.resultado || {};
  const fecha = conteo.fechaAprobado;
  const filas = [];
  for (const it of datos.items) {
    const g = grupoFC(it, empaques);
    if (!g) continue;
    const id = String(it._id), ms = datos.porItem.get(id) || [];
    const r = res[id];
    const desde = r && r.antesFecha ? r.antesFecha : anterior.fechaAprobado;
    const com = ms.filter(m => m.tipo === 'ing' && m.fecha > desde && m.fecha <= fecha).reduce((a, m) => a + m.costo, 0);
    // lo que no se conto se toma como gastado completo
    const costo = r ? (r.antesFecha ? valorPEPS(it, r.antes, r.antesFecha, ms) : 0) + com - valorPEPS(it, r.contado, fecha, ms) : com;
    if (r || com) filas.push({ nombre: it.nombre, g, costo: Math.round(costo), contado: !!r });
  }
  return filas;
}

function calcularFoodCost(c, anterior, datos, ventasMap, ajustes) {
  const base = { id: String(c._id), mes: nombreMes(c.mesCierre), mesCierre: c.mesCierre, fecha: c.fechaAprobado };
  if (!anterior) return { ...base, partida: true };
  const hoy = hoyStr();
  const desde = sumarDias(anterior.fechaAprobado, 1), hasta = c.fechaAprobado;
  const filas = costosCierre(c, anterior, datos, ajustes.empaques);
  const costo = g => filas.filter(x => x.g === g).reduce((a, x) => a + x.costo, 0);
  const dias = diasEntre(desde, hasta);
  let v, faltan = [], porDia = [];
  if (ajustes.modo === 'total') {
    const t = c.ventas || {};
    v = { comida: t.comida || 0, bebidas: t.bebidas || 0, dom: t.dom || 0 };
  } else {
    porDia = dias.filter(f => ventasMap.has(f)).map(f => ({ fecha: f, ...ventasMap.get(f) }));
    v = porDia.reduce((a, x) => ({ comida: a.comida + x.comida, bebidas: a.bebidas + x.bebidas, dom: a.dom + x.dom }), { comida: 0, bebidas: 0, dom: 0 });
    faltan = dias.filter(f => f < hoy && !ventasMap.has(f));
  }
  // estimado por semana (lunes a domingo): compras de comida / ventas de comida. solo con ventas diarias
  let semanas = null;
  if (ajustes.modo === 'diario') {
    const grupos = new Map();
    dias.forEach(f => { const l = lunesDe(f); if (!grupos.has(l)) grupos.set(l, []); grupos.get(l).push(f); });
    const deComida = new Set(datos.items.filter(it => grupoFC(it, ajustes.empaques) === 'Comida').map(it => String(it._id)));
    semanas = [...grupos.values()].map(ds => {
      const a = ds[0], b = ds[ds.length - 1];
      const comp = datos.movs.filter(m => m.tipo === 'ing' && m.fecha >= a && m.fecha <= b && deComida.has(String(m.item_id))).reduce((s, m) => s + m.costo, 0);
      const vend = ds.filter(f => ventasMap.has(f)).reduce((s, f) => s + ventasMap.get(f).comida + ventasMap.get(f).dom, 0);
      return { nombre: `${fechaCorta(a)} – ${fechaCorta(b)}`, pct: vend ? comp / vend * 100 : null, faltan: ds.filter(f => f < hoy && !ventasMap.has(f)).length };
    });
  }
  return {
    ...base, partida: false, desde, hasta,
    comida: { costo: costo('Comida'), venta: v.comida + v.dom },
    bebidas: { costo: costo('Bebidas'), venta: v.bebidas },
    ventas: v, faltan, semanas, porDia,
    top: filas.filter(x => x.g === 'Comida' && x.costo > 0).sort((a, b) => b.costo - a.costo).slice(0, 5).map(x => [x.nombre, x.costo]),
    noContados: filas.filter(x => !x.contado && x.costo > 0).map(x => x.nombre)
  };
}

async function armarFoodCost(empresaId, q, metas, ajustes, datos) {
  const [cierres, ventas] = await Promise.all([cierresAprobados(empresaId), VentaDia.find({ empresa_id: empresaId }).lean()]);
  const ventasMap = new Map(ventas.map(v => [v.fecha, { comida: v.comida, bebidas: v.bebidas, dom: v.dom }]));
  const hoy = hoyStr();
  // el periodo que se esta registrando ahora va desde el dia siguiente al ultimo inventario aprobado
  const periodoDesde = cierres[0] ? sumarDias(cierres[0].fechaAprobado, 1) : null;
  const diasPeriodo = periodoDesde && periodoDesde < hoy ? diasEntre(periodoDesde, sumarDias(hoy, -1)) : [];
  const calc = k => calcularFoodCost(cierres[k], cierres[k + 1] || null, datos, ventasMap, ajustes);
  const i = Math.max(0, cierres.findIndex(c => String(c._id) === q.cierre));
  // ultimos meses para la grafica (el primer inventario es punto de partida y no entra)
  const historia = [];
  for (let k = Math.min(cierres.length - 2, 5); k >= 0; k--) {
    const r = calc(k);
    if (r.comida.venta || r.bebidas.venta) {
      historia.push({ mes: r.mes, comida: r.comida.venta ? r.comida.costo / r.comida.venta * 100 : null, bebidas: r.bebidas.venta ? r.bebidas.costo / r.bebidas.venta * 100 : null });
    }
  }
  return {
    tipo: 'foodcost', ajustes, metas, hoy, periodoDesde,
    diasPeriodo: diasPeriodo.length,
    registrados: diasPeriodo.filter(f => ventasMap.has(f)).length,
    faltan: ajustes.modo === 'diario' ? diasPeriodo.filter(f => !ventasMap.has(f)) : [],
    ultimas: ventas.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5).map(v => ({ fecha: v.fecha, comida: v.comida, bebidas: v.bebidas, dom: v.dom })),
    cierres: cierres.map((c, k) => ({ id: String(c._id), etiqueta: etiquetaMes(c.mesCierre).replace(/^./, s => s.toUpperCase()) + (k === cierres.length - 1 ? ' (primer inventario)' : '') })),
    sel: cierres.length ? calc(i) : null,
    historia
  };
}

// dias del periodo actual sin ventas registradas (el aviso de la pestaña Reportes)
async function ventasFaltan(empresaId, ajustes) {
  if (ajustes.modo !== 'diario') return 0;
  const ultimo = await ConteoInventario.findOne({ empresa_id: empresaId, estado: 'aprobado' }).sort({ fechaAprobado: -1, updatedAt: -1 }).select('fechaAprobado').lean();
  if (!ultimo) return 0;
  const desde = sumarDias(ultimo.fechaAprobado, 1), hasta = sumarDias(hoyStr(), -1);
  if (desde > hasta) return 0;
  const n = await VentaDia.countDocuments({ empresa_id: empresaId, fecha: { $gte: desde, $lte: hasta } });
  return diasEntre(desde, hasta).length - n;
}

// arma los datos de cada reporte; el cliente solo los pinta
async function armarReporte(empresaId, tipo, q, metas, ajustes) {
  const datos = await cargar(empresaId);
  const { items, movs, porItem } = datos;
  const itemDe = id => items.find(i => String(i._id) === String(id));
  const hoy = hoyStr();

  if (tipo === 'cierre') {
    const cierres = await cierresAprobados(empresaId);
    const lista = cierres.map(c => ({ id: String(c._id), etiqueta: `Cierre de ${etiquetaMes(c.mesCierre)} (aprobado el ${fechaCorta(c.fechaAprobado)})` }));
    if (!cierres.length) return { tipo, cierres: lista, actual: null };
    const i = Math.max(0, cierres.findIndex(c => String(c._id) === q.cierre));
    const actual = cierres[i], anterior = cierres[i + 1] || null;
    const calc = calcularCierre(actual, anterior, datos);
    let previo = null;
    if (anterior) previo = calcularCierre(anterior, cierres[i + 2] || null, datos);
    return {
      tipo, cierres: lista, id: String(actual._id),
      titulo: `Cierre de ${nombreMes(actual.mesCierre)}`,
      subtitulo: `${etiquetaMes(actual.mesCierre).replace(/^./, s => s.toUpperCase())}${anterior ? ' frente a ' + nombreMes(anterior.mesCierre) : ''} · inventario aprobado el ${fechaCorta(actual.fechaAprobado)}`,
      mesAnterior: anterior ? nombreMes(anterior.mesCierre) : null,
      ...calc,
      previo: previo ? {
        gasto: previo.gasto, faltante: previo.faltante,
        porCat: Object.fromEntries(previo.consumo.map(x => [x.cat, x.gasto]))
      } : null
    };
  }

  if (tipo === 'foodcost') return armarFoodCost(empresaId, q, metas, ajustes, datos);

  if (tipo === 'existencias') {
    const lista = items.filter(i => i.activo && i.cuenta === true && (!q.cat || q.cat === 'Todas' || i.cat === q.cat) && (!q.q || i.nombre.toLowerCase().includes(q.q.toLowerCase())));
    const desde30 = sumarDias(hoy, -30);
    const filas = lista.map(it => {
      const ms = porItem.get(String(it._id)) || [];
      const cons = !!CONSUMIBLE[it.cat];
      const cantidad = cons ? (it.conteoFecha ? it.conteo : 0) : existencia(it, ms);
      const valor = valorPEPS(it, cantidad, cons ? (it.conteoFecha || hoy) : hoy, ms);
      return { id: String(it._id), nombre: it.nombre, cat: it.cat, u: it.u, cantidad, alCierre: cons, valor, precio: precioInfo(it, ms, desde30, hoy) };
    });
    return { tipo, filas, total: filas.reduce((a, f) => a + f.valor, 0) };
  }

  if (tipo === 'cambios') {
    const todos = await MovInventario.find({ empresa_id: empresaId, $or: [{ 'cambios.0': { $exists: true } }, { borrado: { $ne: null } }] }).lean();
    const filas = [];
    todos.forEach(m => {
      const it = itemDe(m.item_id) || { nombre: '(ítem borrado)', u: '' };
      const base = { tipo: m.tipo, fechaMov: m.fecha, nombre: it.nombre, u: it.u, registro: m.por };
      (m.cambios || []).forEach(c => filas.push({ ...base, que: 'corr', fecha: c.fecha, por: c.por, razon: c.razon, antes: c.antes, despues: c.despues }));
      if (m.borrado) filas.push({ ...base, que: 'borr', fecha: m.borrado.fecha, por: m.borrado.por, razon: m.borrado.razon, cant: m.cant, costo: m.costo, motivo: m.motivo });
    });
    filas.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return { tipo, filas };
  }

  // general / ingresos / bajas / proveedores: movimientos del periodo
  const desde = q.desde || '0000-00-00', hasta = q.hasta || hoy;
  const enRango = movs.filter(m => {
    const it = itemDe(m.item_id);
    if (!it) return false;
    return m.fecha >= desde && m.fecha <= hasta && (!q.cat || q.cat === 'Todas' || it.cat === q.cat) && (!q.q || it.nombre.toLowerCase().includes(q.q.toLowerCase()));
  }).map(m => {
    const it = itemDe(m.item_id);
    return { id: String(m._id), fecha: m.fecha, tipo: m.tipo, nombre: it.nombre, activo: it.activo, cat: it.cat, u: it.u, cant: m.cant, compra: m.compra, costo: m.costo, prov: m.prov, motivo: m.motivo, motivoOtro: m.motivoOtro };
  });
  const agrupar = (lista, clave) => {
    const o = {};
    lista.forEach(m => { const k = clave(m); o[k] = (o[k] || 0) + m.costo; });
    return Object.entries(o).sort((a, b) => b[1] - a[1]);
  };
  const ing = enRango.filter(m => m.tipo === 'ing'), baj = enRango.filter(m => m.tipo === 'baja');

  if (tipo === 'proveedores') {
    const total = ing.reduce((a, m) => a + m.costo, 0);
    const grupos = {};
    ing.forEach(m => { const k = m.prov || 'Sin proveedor'; (grupos[k] = grupos[k] || []).push(m); });
    const filas = Object.entries(grupos).map(([prov, l]) => ({
      prov, n: l.length, total: l.reduce((a, m) => a + m.costo, 0),
      top: agrupar(l, m => m.nombre).slice(0, 3).map(x => x[0])
    })).sort((a, b) => b.total - a.total);
    return { tipo, total, n: ing.length, filas, detalle: ing.slice().reverse() };
  }

  return {
    tipo,
    comprado: ing.reduce((a, m) => a + m.costo, 0),
    perdido: baj.reduce((a, m) => a + m.costo, 0),
    nIng: ing.length, nBaj: baj.length,
    porCategoria: agrupar(ing, m => m.cat),
    porMotivo: agrupar(baj, m => m.motivo),
    topCompras: agrupar(ing, m => m.nombre),
    topPerdidas: agrupar(baj, m => m.nombre),
    detalle: (tipo === 'ingresos' ? ing : tipo === 'bajas' ? baj : enRango).slice().reverse()
  };
}

module.exports = {
  CATEGORIAS, CONSUMIBLE, hoyStr, sumarDias, mesAnterior, mesQueCierra, etiquetaMes, nombreMes, fechaCorta,
  cargar, existencia, valorPEPS, precioInfo, recalcularPrecio, calcularCierre, cierresAprobados, armarReporte, ventasFaltan
};
