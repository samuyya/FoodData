const ExcelJS = require('exceljs');
const { resumen, reporteDe } = require('./capacitaciones');

const VERDE = 'FF16C2A3';
const PROGRAMAS = ['Limpieza y Desinfección', 'Residuos Sólidos', 'Plagas', 'Agua Potable', 'Capacitaciones', 'Mantenimiento', 'Trazabilidad', 'Proveedores', 'Muestreo', 'PQRS', 'Recall'];

const fechaHora = (f) => new Date(f).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const fechaCorta = (f) => new Date(f).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

// un texto libre que empiece con =+-@ no debe leerse como formula
const limpio = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v);

function titulo(sheet, texto, sub, columnas) {
  const t = sheet.addRow([texto]);
  sheet.mergeCells(t.number, 1, t.number, columnas);
  t.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
  t.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  t.height = 26;
  if (sub) {
    const s = sheet.addRow([sub]);
    sheet.mergeCells(s.number, 1, s.number, columnas);
    s.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    s.alignment = { horizontal: 'center', wrapText: true };
  }
  sheet.addRow([]);
}

function encabezado(sheet, cols) {
  const h = sheet.addRow(cols);
  h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  return h;
}

function nombreHoja(texto, usados) {
  const base = texto.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Capacitación';
  let n = base, i = 2;
  while (usados.has(n.toLowerCase())) n = base.slice(0, 28) + ' ' + i++;
  usados.add(n.toLowerCase());
  return n;
}

// un libro con el resumen de todos y una hoja por capacitacion
async function construirExcel(empresaId, empresaNombre, periodo) {
  const wb = new ExcelJS.Workbook();
  const usados = new Set();
  const r = await resumen(empresaId);

  const res = wb.addWorksheet(nombreHoja('Resumen', usados), { properties: { tabColor: { argb: VERDE } } });
  const cols = 2 + r.caps.length;
  titulo(res, 'Capacitaciones — ' + empresaNombre, 'Fecha = ya la hizo con la versión actual del material', cols);
  encabezado(res, ['Empleado', 'Cargo', ...r.caps.map(c => c.titulo)]);
  res.getColumn(1).width = 26; res.getColumn(2).width = 18;
  r.caps.forEach((c, i) => { res.getColumn(3 + i).width = 22; });
  r.gente.forEach(g => {
    const fila = res.addRow([limpio(g.nombre), g.cargo ? g.cargo.nombre : 'Sin cargo', ...g.celdas.map((o, i) => !o ? '—' : g.hechas[i] ? fechaCorta(g.hechas[i]) : 'Pendiente')]);
    g.celdas.forEach((o, i) => {
      const cell = fila.getCell(3 + i);
      cell.alignment = { horizontal: 'center' };
      if (o && g.hechas[i]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      else if (o) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1D2' } };
    });
  });

  for (const c of r.caps) {
    const d = await reporteDe(empresaId, c.id, periodo);
    const hoja = wb.addWorksheet(nombreHoja(c.titulo, usados), { properties: { tabColor: { argb: VERDE } } });
    const sub = [d.capacitacion.programa ? PROGRAMAS[d.capacitacion.programa - 1] : null, 'Versión ' + d.capacitacion.version,
      d.capacitacion.evaluacion ? `Evaluación: mínimo ${d.capacitacion.evaluacion.minimo} %` : 'Sin evaluación'].filter(Boolean).join('  ·  ');
    titulo(hoja, d.capacitacion.titulo, sub, 6);
    [26, 18, 22, 10, 12, 10].forEach((w, i) => { hoja.getColumn(i + 1).width = w; });
    encabezado(hoja, ['Nombre', 'Cargo', 'Fecha y hora', 'Nota', 'Foto', 'Versión']);
    d.filas.forEach(f => hoja.addRow([limpio(f.nombre), f.cargo, fechaHora(f.fecha), f.nota != null ? f.nota + ' %' : '—', f.conFoto ? 'Sí' : '—', f.version]));
    if (d.filas.length === 0) hoja.addRow(['Nadie la ha hecho en este periodo.']);
    if (d.pendientes.length) {
      hoja.addRow([]);
      const p = encabezado(hoja, ['Pendientes', 'Cargo']);
      p.getCell(1).alignment = { horizontal: 'left' };
      d.pendientes.forEach(x => hoja.addRow([limpio(x.nombre), x.cargo || 'Sin cargo']));
    }
  }
  return wb;
}

module.exports = { construirExcel };
