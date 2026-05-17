const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const Asistencia = require('../models/Asistencia');
const { FORMATOS, getFormato } = require('../formatos');

const CARPETA_EXCEL = path.join(__dirname, '..', 'datos', 'excel');

function rutaArchivo(empresaId, anio, mes) {
  const dir = path.join(CARPETA_EXCEL, String(empresaId));
  const fileName = `${anio}-${String(mes).padStart(2, '0')}.xlsx`;
  return { dir, fileName, filePath: path.join(dir, fileName) };
}

function nombreHoja(formato) {
  const propuesto = `${formato.numero}. ${formato.nombreCorto || formato.nombre}`;
  return propuesto.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
}

function fechaLargaEs(anio, mes, dia) {
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

async function abrirWorkbook(filePath, nombreEmpresa) {
  const wb = new ExcelJS.Workbook();
  if (fs.existsSync(filePath)) {
    try {
      await wb.xlsx.readFile(filePath);
      return wb;
    } catch (err) {
      console.warn(`No se pudo leer ${filePath}, se reconstruye:`, err.message);
    }
  }
  wb.creator = nombreEmpresa || 'Seal Zenith';
  wb.created = new Date();
  return wb;
}

function pintarHoja(sheet, registros) {
  sheet.columns = [
    { header: 'Día',           key: 'dia',           width: 8  },
    { header: 'Fecha',         key: 'fecha',         width: 30 },
    { header: 'Responsable',   key: 'responsable',   width: 28 },
    { header: 'Observaciones', key: 'observaciones', width: 60 }
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  registros.forEach(r => {
    const row = sheet.addRow({
      dia: r.dia,
      fecha: fechaLargaEs(r.anio, r.mes, r.dia),
      responsable: r.responsable,
      observaciones: r.observaciones || ''
    });
    row.alignment = { vertical: 'top', wrapText: true };
  });

  if (registros.length === 0) {
    const fila = sheet.addRow({ dia: '', fecha: 'Sin registros este mes', responsable: '', observaciones: '' });
    fila.font = { italic: true, color: { argb: 'FF6B7280' } };
  }
}

async function sincronizarFormatoMes(empresaId, formatoId, anio, mes) {
  const formato = getFormato(formatoId);
  if (!formato) throw new Error(`Formato desconocido: ${formatoId}`);

  const { dir, filePath } = rutaArchivo(empresaId, anio, mes);
  await fs.promises.mkdir(dir, { recursive: true });

  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  const wb = await abrirWorkbook(filePath, empresa && empresa.nombre);

  const sheetName = nombreHoja(formato);
  const existente = wb.getWorksheet(sheetName);
  if (existente) wb.removeWorksheet(existente.id);
  const sheet = wb.addWorksheet(sheetName);

  const registros = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId,
    anio, mes
  }).sort({ dia: 1 }).lean();

  pintarHoja(sheet, registros);

  await wb.xlsx.writeFile(filePath);
  return { filePath };
}

async function reconstruirMesCompleto(empresaId, anio, mes) {
  const { dir, filePath } = rutaArchivo(empresaId, anio, mes);
  await fs.promises.mkdir(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }

  const formatosConDatos = await Registro.distinct('formato', {
    empresa_id: empresaId, anio, mes
  });

  if (formatosConDatos.length === 0) {
    return { filePath: null };
  }

  for (const formatoId of formatosConDatos) {
    if (!getFormato(formatoId)) continue;
    await sincronizarFormatoMes(empresaId, formatoId, anio, mes);
  }
  return { filePath };
}

function getRutaArchivo(empresaId, anio, mes) {
  return rutaArchivo(empresaId, anio, mes);
}

function horaCorta(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function estiloEncabezado(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  row.alignment = { vertical: 'middle' };
  row.height = 22;
}

async function generarExcelAsistencia(empresaId, anio, mes) {
  const registros = await Asistencia.find({ empresa_id: empresaId, anio, mes })
    .sort({ empleadoNombre: 1, dia: 1 })
    .lean();

  if (registros.length === 0) return null;

  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  const wb = new ExcelJS.Workbook();
  wb.creator = empresa && empresa.nombre ? empresa.nombre : 'Seal Zenith';
  wb.created = new Date();

  const hoja = wb.addWorksheet('Asistencia');
  hoja.columns = [
    { header: 'Empleado',         key: 'empleado', width: 28 },
    { header: 'Día',              key: 'dia',      width: 8  },
    { header: 'Fecha',            key: 'fecha',    width: 30 },
    { header: 'Entrada',          key: 'entrada',  width: 12 },
    { header: 'Salida',           key: 'salida',   width: 16 },
    { header: 'Horas trabajadas', key: 'horas',    width: 18 }
  ];
  estiloEncabezado(hoja.getRow(1));

  const totales = {};
  registros.forEach(r => {
    const completo = !!(r.horaIngreso && r.horaSalida);
    const horas = completo ? (r.horasTrabajadas || 0) : 0;
    hoja.addRow({
      empleado: r.empleadoNombre,
      dia: r.dia,
      fecha: fechaLargaEs(r.anio, r.mes, r.dia),
      entrada: horaCorta(r.horaIngreso),
      salida: r.horaSalida ? horaCorta(r.horaSalida) : 'FALTA SALIDA',
      horas: completo ? horas : ''
    });
    totales[r.empleadoNombre] = (totales[r.empleadoNombre] || 0) + horas;
  });

  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Empleado',            key: 'empleado', width: 28 },
    { header: 'Total horas del mes', key: 'total',    width: 22 }
  ];
  estiloEncabezado(resumen.getRow(1));
  Object.keys(totales).sort().forEach(nombre => {
    resumen.addRow({ empleado: nombre, total: Math.round(totales[nombre] * 100) / 100 });
  });

  return wb.xlsx.writeBuffer();
}

module.exports = {
  sincronizarFormatoMes,
  reconstruirMesCompleto,
  getRutaArchivo,
  generarExcelAsistencia
};
