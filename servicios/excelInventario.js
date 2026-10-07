// excel de los reportes de inventarios. recibe lo mismo que se pinta en pantalla
// (servicios/inventario.js armarReporte) y lo pasa a hojas. "detalle" agrega la
// lista de cada movimiento / item, para quien no la necesite no gaste espacio
const ExcelJS = require('exceljs');

const VERDE = 'FF16C2A3';
const OSCURO = 'FF0E3A31';
const PESOS = '"$" #,##0';

function titulo(hoja, texto, sub, ancho) {
  hoja.mergeCells(1, 1, 1, ancho);
  hoja.getCell(1, 1).value = texto;
  hoja.getCell(1, 1).font = { bold: true, size: 14, color: { argb: OSCURO } };
  hoja.getCell(1, 1).alignment = { horizontal: 'center' };
  hoja.mergeCells(2, 1, 2, ancho);
  hoja.getCell(2, 1).value = sub;
  hoja.getCell(2, 1).font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  hoja.getCell(2, 1).alignment = { horizontal: 'center', wrapText: true };
}
function tabla(hoja, fila, columnas, filas) {
  const enc = hoja.getRow(fila);
  columnas.forEach((c, i) => {
    const celda = enc.getCell(i + 1);
    celda.value = c.titulo;
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    hoja.getColumn(i + 1).width = Math.max(hoja.getColumn(i + 1).width || 10, c.ancho || 16);
  });
  filas.forEach((f, k) => {
    const r = hoja.getRow(fila + 1 + k);
    columnas.forEach((c, i) => {
      const celda = r.getCell(i + 1);
      celda.value = f[i];
      if (c.plata) celda.numFmt = PESOS;
    });
  });
  return fila + filas.length + 2;
}

const tipoTxt = t => t === 'ing' ? 'Ingreso' : 'Baja';
const motivoTxt = m => m.motivo + (m.motivoOtro ? ': ' + m.motivoOtro : '');

async function excelReporte(d, { detalle, empresa, titulo: sub }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = empresa || 'FoodData';
  wb.created = new Date();
  const hoja = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: VERDE } } });
  const subtitulo = `${empresa} · ${sub || ''}`.trim();

  if (d.tipo === 'cierre') {
    if (!d.id) { titulo(hoja, 'Cierre del mes', 'Todavía no hay un inventario general aprobado.', 4); return wb; }
    titulo(hoja, d.titulo, `${empresa} · ${d.subtitulo}`, 6);
    let fila = tabla(hoja, 4, [{ titulo: 'Indicador', ancho: 34 }, { titulo: 'Valor', ancho: 18, plata: true }], [
      ['Gasto del mes', d.gasto], ...d.consumo.map(x => [x.cat, x.gasto]), ['Faltante en menaje y mobiliario', d.faltante]
    ]);
    fila = tabla(hoja, fila, [
      { titulo: 'Categoría', ancho: 18 }, { titulo: 'Al cierre anterior', plata: true }, { titulo: '+ Compras', plata: true },
      { titulo: '− Bajas', plata: true }, { titulo: '− Al cierre', plata: true }, { titulo: '= Gasto del mes', plata: true }
    ], d.consumo.map(x => [x.cat, x.ini, x.com, x.baj, x.fin, x.gasto]));
    if (detalle && d.diferencias.length) {
      tabla(hoja, fila, [{ titulo: 'Ítem', ancho: 28 }, { titulo: 'Categoría' }, { titulo: 'Debería haber' }, { titulo: 'Se contó' }, { titulo: 'Diferencia' }, { titulo: 'Valor', plata: true }],
        d.diferencias.map(x => [x.nombre, x.cat, x.deberia, x.contado, x.dif, x.valor]));
    }
    return wb;
  }

  if (d.tipo === 'foodcost') {
    const s = d.sel;
    if (!s || s.partida) {
      titulo(hoja, 'Food cost', s ? 'Este fue el primer inventario general: es el punto de partida, todavía no hay food cost.' : 'Todavía no hay un inventario general aprobado.', 5);
      return wb;
    }
    titulo(hoja, `Food cost de ${s.mes}`, `${empresa} · ventas y costo del ${s.desde.split('-').reverse().join('/')} al ${s.hasta.split('-').reverse().join('/')}`, 5);
    const ini = 4;
    let fila = tabla(hoja, ini, [{ titulo: '', ancho: 22 }, { titulo: 'Costo', plata: true }, { titulo: 'Ventas', plata: true }, { titulo: 'Food cost' }, { titulo: 'Meta' }], [
      ['Comida', s.comida.costo, s.comida.venta, s.comida.venta ? s.comida.costo / s.comida.venta : null, d.metas.comida / 100],
      ['Bebidas', s.bebidas.costo, s.bebidas.venta, s.bebidas.venta ? s.bebidas.costo / s.bebidas.venta : null, d.metas.bebidas / 100]
    ]);
    for (let r = ini + 1; r <= ini + 2; r++) { hoja.getCell(r, 4).numFmt = '0.0%'; hoja.getCell(r, 5).numFmt = '0%'; }
    fila = tabla(hoja, fila, [{ titulo: 'Ventas del periodo' }, { titulo: 'Valor', plata: true }], [
      ['Comida en el local', s.ventas.comida], ['Bebidas en el local', s.ventas.bebidas], ['Domicilios netos (van con comida)', s.ventas.dom]
    ]);
    if (s.semanas) {
      const iniS = fila;
      fila = tabla(hoja, fila, [{ titulo: 'Semana (aproximado)' }, { titulo: 'Comida' }, { titulo: 'Días sin ventas' }], s.semanas.map(w => [w.nombre, w.pct === null ? null : w.pct / 100, w.faltan]));
      for (let r = iniS + 1; r < fila - 1; r++) hoja.getCell(r, 2).numFmt = '0.0%';
    }
    fila = tabla(hoja, fila, [{ titulo: 'Lo que más pesó en comida' }, { titulo: 'Costo', plata: true }], s.top);
    if (detalle && s.porDia.length) {
      tabla(hoja, fila, [{ titulo: 'Día' }, { titulo: 'Comida', plata: true }, { titulo: 'Bebidas', plata: true }, { titulo: 'Domicilios netos', plata: true }, { titulo: 'Total', plata: true }],
        s.porDia.map(v => [v.fecha, v.comida, v.bebidas, v.dom, v.comida + v.bebidas + v.dom]));
    }
    return wb;
  }

  if (d.tipo === 'existencias') {
    titulo(hoja, 'Lo que hay hoy', subtitulo, 5);
    const fila = tabla(hoja, 4, [{ titulo: 'Indicador', ancho: 28 }, { titulo: 'Valor', plata: true }], [['Valor total', d.total]]);
    if (detalle) {
      tabla(hoja, fila, [{ titulo: 'Ítem', ancho: 28 }, { titulo: 'Categoría' }, { titulo: 'Cantidad' }, { titulo: 'Unidad' }, { titulo: 'Valor total', plata: true }],
        d.filas.map(f => [f.nombre, f.cat, f.cantidad, f.u + (f.alCierre ? ' (al último cierre)' : ''), f.valor]));
    }
    return wb;
  }

  if (d.tipo === 'cambios') {
    titulo(hoja, 'Correcciones y borrados', subtitulo, 6);
    tabla(hoja, 4, [{ titulo: 'Fecha' }, { titulo: 'Qué pasó' }, { titulo: 'Registro', ancho: 30 }, { titulo: 'Cambio', ancho: 40 }, { titulo: 'Quién' }, { titulo: 'Por qué', ancho: 30 }],
      d.filas.map(f => [f.fecha, f.que === 'corr' ? 'Corregido' : 'Borrado', `${tipoTxt(f.tipo)} del ${f.fechaMov} · ${f.nombre}`,
        f.que === 'corr' ? `Cantidad ${f.antes.cant} → ${f.despues.cant}; costo ${f.antes.costo} → ${f.despues.costo}` : `${f.cant} ${f.u} · ${f.costo}`,
        f.por, f.razon || '']));
    return wb;
  }

  if (d.tipo === 'proveedores') {
    titulo(hoja, 'Compras por proveedor', subtitulo, 5);
    const fila = tabla(hoja, 4, [{ titulo: 'Proveedor', ancho: 28 }, { titulo: 'Compras' }, { titulo: 'Total', plata: true }, { titulo: '% del total' }, { titulo: 'Lo que más se le compra', ancho: 40 }],
      d.filas.map(f => [f.prov, f.n, f.total, d.total ? f.total / d.total : 0, f.top.join(', ')]));
    for (let r = 5; r < fila - 1; r++) hoja.getCell(r, 4).numFmt = '0.0%';
    if (detalle) {
      const h2 = wb.addWorksheet('Detalle');
      tabla(h2, 1, [{ titulo: 'Fecha' }, { titulo: 'Proveedor', ancho: 24 }, { titulo: 'Producto', ancho: 28 }, { titulo: 'Cantidad' }, { titulo: 'Unidad' }, { titulo: 'Costo', plata: true }],
        d.detalle.map(m => [m.fecha, m.prov || 'Sin proveedor', m.nombre, m.cant, m.u, m.costo]));
    }
    return wb;
  }

  // general / ingresos / bajas
  const nombres = { general: 'Reporte general', ingresos: 'Reporte de ingresos', bajas: 'Reporte de bajas' };
  titulo(hoja, nombres[d.tipo] || 'Reporte', subtitulo, 4);
  const kpis = [];
  if (d.tipo !== 'bajas') kpis.push(['Comprado', d.comprado]);
  if (d.tipo !== 'ingresos') kpis.push(['Perdido', d.perdido]);
  let fila = tabla(hoja, 4, [{ titulo: 'Indicador', ancho: 30 }, { titulo: 'Valor', ancho: 18, plata: true }], kpis);
  if (d.tipo !== 'bajas') fila = tabla(hoja, fila, [{ titulo: 'Compras por categoría', ancho: 30 }, { titulo: 'Valor', plata: true }], d.porCategoria);
  if (d.tipo !== 'ingresos') fila = tabla(hoja, fila, [{ titulo: 'Pérdidas por motivo', ancho: 30 }, { titulo: 'Valor', plata: true }], d.porMotivo);
  if (d.tipo !== 'bajas') fila = tabla(hoja, fila, [{ titulo: 'En qué se gastó más', ancho: 30 }, { titulo: 'Valor', plata: true }], d.topCompras.slice(0, 10));
  if (d.tipo !== 'ingresos') fila = tabla(hoja, fila, [{ titulo: 'Lo que más se perdió', ancho: 30 }, { titulo: 'Valor', plata: true }], d.topPerdidas.slice(0, 10));
  if (detalle) {
    const h2 = wb.addWorksheet('Detalle');
    tabla(h2, 1, [{ titulo: 'Fecha' }, { titulo: 'Tipo' }, { titulo: 'Producto', ancho: 28 }, { titulo: 'Categoría' }, { titulo: 'Cantidad' }, { titulo: 'Unidad' }, { titulo: 'Proveedor / motivo', ancho: 30 }, { titulo: 'Valor', plata: true }],
      d.detalle.map(m => [m.fecha, tipoTxt(m.tipo), m.nombre, m.cat, m.cant, m.u, m.tipo === 'ing' ? (m.prov || '') : motivoTxt(m), m.costo]));
  }
  return wb;
}

module.exports = { excelReporte };
