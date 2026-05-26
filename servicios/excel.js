const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const Asistencia = require('../models/Asistencia');
const { getFormato } = require('../formatos');
const { esFestivo, nombreFestivo } = require('../festivos');

const CARPETA_EXCEL = path.join(__dirname, '..', 'datos', 'excel');
const COLOR_PRIMARIO = 'FF16C2A3';   // turquoise FoodData
const COLOR_HEADER_BG = 'FF16C2A3';
const COLOR_MES_BG = 'FFECF9F5';     // verde clarito de marca
const COLOR_FESTIVO_FONT = 'FFFFFFFF';

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const SUFIJO_CARPETA = { cocina: '', salon: ' (Sal)', administracion: ' (Adm)' };

// Utilidades
function slug(s) {
  return String(s || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9\-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 50) || 'empresa';
}

// Un solo archivo por empresa: datos/excel/{empresaId}/Registros - {slug}.xlsx
function rutaArchivoEmpresa(empresaId, nombreEmpresa) {
  const dir = path.join(CARPETA_EXCEL, String(empresaId));
  const fileName = `Registros - ${slug(nombreEmpresa)}.xlsx`;
  return { dir, fileName, filePath: path.join(dir, fileName) };
}

function fechaLargaEs(anio, mes, dia) {
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function nombreHoja(formato, carpeta) {
  const sufijo = SUFIJO_CARPETA[carpeta] || '';
  const propuesto = `${formato.numero}. ${formato.nombreCorto || formato.nombre}${sufijo}`;
  return propuesto.replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
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
  wb.creator = nombreEmpresa || 'FoodData';
  wb.created = new Date();
  return wb;
}

// Columnas por formato
function columnasGenericas() {
  return [
    { header: 'Día',           key: 'dia',           width: 8  },
    { header: 'Fecha',         key: 'fecha',         width: 30 },
    { header: 'Responsable',   key: 'responsable',   width: 28 },
    { header: 'Observaciones', key: 'observaciones', width: 60 }
  ];
}

function columnasCalidadAgua() {
  return [
    { header: 'Día',                key: 'dia',           width: 6  },
    { header: 'Fecha',              key: 'fecha',         width: 28 },
    { header: 'Hora muestreo',      key: 'hora',          width: 14 },
    { header: 'Punto de muestreo',  key: 'punto',         width: 18 },
    { header: 'pH (valor)',         key: 'ph_valor',      width: 12 },
    { header: 'pH (C/NC)',          key: 'ph_res',        width: 10 },
    { header: 'Cloro (mg/L)',       key: 'cloro_valor',   width: 13 },
    { header: 'Cloro (C/NC)',       key: 'cloro_res',     width: 12 },
    { header: 'Olor',               key: 'olor',          width: 8  },
    { header: 'Color',              key: 'color',         width: 8  },
    { header: 'Sabor',              key: 'sabor',         width: 8  },
    { header: 'Observaciones',      key: 'observaciones', width: 36 },
    { header: 'Responsable',        key: 'responsable',   width: 22 }
  ];
}

function filaCalidadAgua(r) {
  const d = r.datos || {};
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    hora: d.hora_muestreo || '',
    punto: d.punto_muestreo || '',
    ph_valor: d.pH && d.pH.valor != null ? d.pH.valor : '',
    ph_res:   d.pH ? d.pH.resultado || '' : '',
    cloro_valor: d.cloro && d.cloro.valor != null ? d.cloro.valor : '',
    cloro_res:   d.cloro ? d.cloro.resultado || '' : '',
    olor:  d.olor  || '',
    color: d.color || '',
    sabor: d.sabor || '',
    observaciones: r.observaciones || '',
    responsable: r.responsable || ''
  };
}

function columnasTemperatura() {
  return [
    { header: 'Día',              key: 'dia',          width: 6  },
    { header: 'Fecha',            key: 'fecha',        width: 26 },
    { header: 'Tipo de equipo',   key: 'tipoEquipo',   width: 16 },
    { header: 'Hora 1',           key: 'hora1',        width: 10 },
    { header: 'T°C 1',            key: 'temp1',        width: 9  },
    { header: 'Cumple 1',         key: 'res1',         width: 10 },
    { header: 'Hora 2',           key: 'hora2',        width: 10 },
    { header: 'T°C 2',            key: 'temp2',        width: 9  },
    { header: 'Cumple 2',         key: 'res2',         width: 10 },
    { header: 'Observaciones',    key: 'observaciones',width: 36 },
    { header: 'Responsable',      key: 'responsable',  width: 22 }
  ];
}

function filaTemperatura(r) {
  const d = r.datos || {};
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    tipoEquipo: d.tipoEquipo === 'refrigeracion' ? 'Refrigeración' : (d.tipoEquipo === 'congelacion' ? 'Congelación' : (d.tipoEquipo || '')),
    hora1: d.hora1 || '',
    temp1: d.temp1 != null && !isNaN(d.temp1) ? d.temp1 : '',
    res1:  d.resultado1 || '',
    hora2: d.hora2 || '',
    temp2: d.temp2 != null && !isNaN(d.temp2) ? d.temp2 : '',
    res2:  d.resultado2 || '',
    observaciones: r.observaciones || '',
    responsable: r.responsable || ''
  };
}

function columnasPlagas() {
  return [
    { header: 'Día',             key: 'dia',          width: 6  },
    { header: 'Fecha',           key: 'fecha',        width: 26 },
    { header: 'Áreas inspeccionadas', key: 'areas',   width: 38 },
    { header: 'Tipo de control', key: 'tipoControl',  width: 14 },
    { header: 'Novedad',         key: 'novedad',      width: 36 },
    { header: 'Observaciones',   key: 'observaciones',width: 30 },
    { header: 'Responsable',     key: 'responsable',  width: 22 }
  ];
}

function filaPlagas(r) {
  const d = r.datos || {};
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    areas: Array.isArray(d.areas) ? d.areas.join(', ') : '',
    tipoControl: d.tipoControl || '',
    novedad: d.novedad || '',
    observaciones: r.observaciones || '',
    responsable: r.responsable || ''
  };
}

function columnasResiduos() {
  return [
    { header: 'Día',                  key: 'dia',          width: 6  },
    { header: 'Fecha',                key: 'fecha',        width: 26 },
    { header: 'Bolsas orgánicos',     key: 'organicos',    width: 14 },
    { header: 'Bolsas aprovechables', key: 'aprovechables',width: 16 },
    { header: 'Bolsas no aprov.',     key: 'noAprovechables', width: 16 },
    { header: 'Total bolsas',         key: 'total',        width: 12 },
    { header: 'Fecha evacuación',     key: 'fechaEvac',    width: 18 },
    { header: 'Observaciones',        key: 'observaciones',width: 36 },
    { header: 'Responsable',          key: 'responsable',  width: 22 }
  ];
}

function filaResiduos(r) {
  const d = r.datos || {};
  const org = Number(d.organicos)       || 0;
  const apr = Number(d.aprovechables)   || 0;
  const noa = Number(d.noAprovechables) || 0;
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    organicos: org,
    aprovechables: apr,
    noAprovechables: noa,
    total: org + apr + noa,
    fechaEvac: d.fechaEvacuacion || '',
    observaciones: r.observaciones || '',
    responsable: r.responsable || ''
  };
}

function filaGenerica(r) {
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    responsable: r.responsable || '',
    observaciones: r.observaciones || ''
  };
}

function pintarCeldaCNC(cell) {
  const v = String(cell.value || '').trim();
  if (v === 'C') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    cell.font = { bold: true, color: { argb: 'FF065F46' } };
  } else if (v === 'NC') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    cell.font = { bold: true, color: { argb: 'FF991B1B' } };
  }
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
}

// Pintar una hoja: todos los meses apilados con sus encabezados
function columnasLimpiezaSalon() {
  return [
    { header: 'Día',           key: 'dia',           width: 6  },
    { header: 'Fecha',         key: 'fecha',         width: 26 },
    { header: 'Tipo limpieza', key: 'tipoLimpieza',  width: 12 },
    { header: 'Áreas + producto (DO/HS)', key: 'areas', width: 60 },
    { header: 'Observaciones', key: 'observaciones', width: 30 },
    { header: 'Responsable',   key: 'responsable',   width: 22 }
  ];
}
function filaLimpiezaSalon(r) {
  const d = r.datos || {};
  // Mapa nombre → producto desde el catálogo
  const formato = getFormato(r.formato);
  const mapaProd = {};
  if (formato && Array.isArray(formato.areas)) {
    formato.areas.forEach(a => { mapaProd[a.nombre] = a.producto; });
  }
  // areas puede venir como array (nuevo) u objeto (registros viejos)
  let lista = [];
  if (Array.isArray(d.areas)) {
    lista = d.areas.map(n => `${n} [${mapaProd[n] || '?'}]`);
  } else if (d.areas && typeof d.areas === 'object') {
    lista = Object.entries(d.areas).map(([n, p]) => `${n} [${p}]`);
  }
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    tipoLimpieza: d.tipoLimpieza || '',
    areas: lista.join(' · '),
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasLimpiezaBano() {
  return [
    { header: 'Día',           key: 'dia',           width: 6  },
    { header: 'Fecha',         key: 'fecha',         width: 26 },
    { header: 'Tipo limpieza', key: 'tipoLimpieza',  width: 12 },
    { header: 'Áreas limpiadas', key: 'areas',       width: 60 },
    { header: 'Observaciones', key: 'observaciones', width: 30 },
    { header: 'Responsable',   key: 'responsable',   width: 22 }
  ];
}
function filaLimpiezaBano(r) {
  const d = r.datos || {};
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    tipoLimpieza: d.tipoLimpieza || '',
    areas: Array.isArray(d.areas) ? d.areas.join(', ') : '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasLimpiezaCT() {
  return [
    { header: 'Día',              key: 'dia',           width: 6  },
    { header: 'Fecha',            key: 'fecha',         width: 26 },
    { header: 'Equipo(s)',        key: 'equipos',       width: 16 },
    { header: 'Hora',             key: 'hora',          width: 10 },
    { header: 'Desinfectante',    key: 'desinfectante', width: 22 },
    { header: 'Agua (L)',         key: 'agua',          width: 10 },
    { header: 'Producto (mL)',    key: 'producto',      width: 12 },
    { header: 'Observaciones',    key: 'observaciones', width: 30 },
    { header: 'Responsable',      key: 'responsable',   width: 22 }
  ];
}
function filaLimpiezaCT(r) {
  const d = r.datos || {};
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    equipos: Array.isArray(d.equipos) ? d.equipos.join(', ') : '',
    hora: d.hora || '',
    desinfectante: d.desinfectante || '',
    agua: d.cantidadAgua != null ? d.cantidadAgua : '',
    producto: d.cantidadProducto != null ? d.cantidadProducto : '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

// Recepción es multi-items por día — genera una fila por item
function columnasRecepcion() {
  return [
    { header: 'Día',          key: 'dia',          width: 6  },
    { header: 'Fecha',        key: 'fecha',        width: 26 },
    { header: 'Proveedor',    key: 'proveedor',    width: 22 },
    { header: 'Producto',     key: 'producto',     width: 22 },
    { header: 'Cant. (Kg)',   key: 'cantidad',     width: 11 },
    { header: 'T (°C)',       key: 'temperatura',  width: 9  },
    { header: 'Lote',         key: 'lote',         width: 14 },
    { header: 'Vencimiento',  key: 'vencimiento',  width: 14 },
    { header: 'Color',        key: 'color',        width: 9  },
    { header: 'Olor',         key: 'olor',         width: 9  },
    { header: 'Apariencia',   key: 'apariencia',   width: 11 },
    { header: 'Empaque',      key: 'empaque',      width: 10 },
    { header: 'Decisión',     key: 'decision',     width: 11 },
    { header: 'Obs. ítem',    key: 'obsItem',      width: 22 },
    { header: 'Responsable',  key: 'responsable',  width: 22 }
  ];
}
// recepcion
function filasRecepcion(r) {
  const items = (r.datos && Array.isArray(r.datos.items)) ? r.datos.items : [];
  if (items.length === 0) {
    return [{
      dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
      proveedor: '(sin items)', producto: '', cantidad: '', temperatura: '',
      lote: '', vencimiento: '', color: '', olor: '', apariencia: '', empaque: '',
      decision: '', obsItem: r.observaciones || '', responsable: r.responsable || ''
    }];
  }
  return items.map((it, idx) => ({
    dia: idx === 0 ? r.dia : '',  // solo el 1er item muestra el dia
    fecha: idx === 0 ? fechaLargaEs(r.anio, r.mes, r.dia) : '',
    proveedor: it.proveedor || '',
    producto: it.producto || '',
    cantidad: it.cantidad != null && !isNaN(it.cantidad) ? it.cantidad : '',
    temperatura: it.temperatura != null && !isNaN(it.temperatura) ? it.temperatura : '',
    lote: it.lote || '',
    vencimiento: it.fechaVencimiento || '',
    color: it.color || '',
    olor: it.olor || '',
    apariencia: it.apariencia || '',
    empaque: it.empaque || '',
    decision: it.decision || '',
    obsItem: it.observaciones || (idx === 0 ? (r.observaciones || '') : ''),
    responsable: idx === 0 ? (r.responsable || '') : ''
  }));
}

function columnasYFila(formatoId) {
  switch (formatoId) {
    case 'calidad_agua':              return { columnas: columnasCalidadAgua(),  fila: filaCalidadAgua };
    case 'control_temperatura':       return { columnas: columnasTemperatura(),  fila: filaTemperatura };
    case 'control_plagas':            return { columnas: columnasPlagas(),       fila: filaPlagas      };
    case 'manejo_residuos':           return { columnas: columnasResiduos(),     fila: filaResiduos    };
    case 'limpieza_salon':            return { columnas: columnasLimpiezaSalon(),fila: filaLimpiezaSalon };
    case 'limpieza_bano':             return { columnas: columnasLimpiezaBano(), fila: filaLimpiezaBano  };
    case 'limpieza_campana_trampa':   return { columnas: columnasLimpiezaCT(),   fila: filaLimpiezaCT    };
    case 'recepcion_materias_primas': return { columnas: columnasRecepcion(),    fila: null, expandirFilas: filasRecepcion };
    default:                          return { columnas: columnasGenericas(),    fila: filaGenerica    };
  }
}

function pintarHojaMultiMes(sheet, registros, formatoId, formato) {
  const esCalidadAgua = formatoId === 'calidad_agua';
  const { columnas, fila, expandirFilas } = columnasYFila(formatoId);
  const numCols = columnas.length;

  // Anchos de columna
  columnas.forEach((c, i) => { sheet.getColumn(i + 1).width = c.width; });

  // ----- Encabezado institucional (solo si el formato tiene metadatos) -----
  if (formato && formato.titulo) {
    const titRow = sheet.addRow([formato.titulo]);
    sheet.mergeCells(titRow.number, 1, titRow.number, numCols);
    titRow.font = { bold: true, size: 14, color: { argb: 'FF0F172A' } };
    titRow.alignment = { vertical: 'middle', horizontal: 'center' };
    titRow.height = 28;
    if (formato.plan) {
      const sub = sheet.addRow([`${formato.plan}  ·  ${formato.programa || ''}  ·  Código ${formato.codigo || ''}  ·  Versión ${formato.version || ''}`]);
      sheet.mergeCells(sub.number, 1, sub.number, numCols);
      sub.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
      sub.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    sheet.addRow([]);
  }

  // Si no hay registros, mensaje informativo
  if (registros.length === 0) {
    const fila = sheet.addRow(['Aún no hay registros guardados en esta instancia.']);
    sheet.mergeCells(fila.number, 1, fila.number, numCols);
    fila.font = { italic: true, color: { argb: 'FF6B7280' } };
    fila.alignment = { vertical: 'middle', horizontal: 'center' };
    return;
  }

  // ----- Agrupar por año-mes -----
  const porMes = new Map();
  registros.forEach(r => {
    const k = `${r.anio}-${String(r.mes).padStart(2, '0')}`;
    if (!porMes.has(k)) porMes.set(k, { anio: r.anio, mes: r.mes, registros: [] });
    porMes.get(k).registros.push(r);
  });

  const claves = Array.from(porMes.keys()).sort();
  const idxColDia = 1;
  const findIdx = key => columnas.findIndex(c => c.key === key) + 1;  // 1-based, 0 si no existe
  const cncIdxs = [
    findIdx('ph_res'), findIdx('cloro_res'), findIdx('olor'), findIdx('color'), findIdx('sabor'),
    findIdx('res1'),   findIdx('res2')
  ].filter(i => i > 0);

  claves.forEach((k, idx) => {
    const { anio, mes, registros: regs } = porMes.get(k);
    const nombreMes = MESES_LARGOS[mes - 1].toUpperCase();

    if (idx > 0) sheet.addRow([]);  // espacio entre meses

    // Cabecera del mes
    const mesRow = sheet.addRow([`${nombreMes} ${anio}`]);
    sheet.mergeCells(mesRow.number, 1, mesRow.number, numCols);
    mesRow.font = { bold: true, size: 13, color: { argb: 'FF0E3A31' } };
    mesRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MES_BG } };
    mesRow.alignment = { vertical: 'middle', horizontal: 'center' };
    mesRow.height = 24;
    mesRow.border = {
      top:    { style: 'medium', color: { argb: COLOR_PRIMARIO } },
      bottom: { style: 'medium', color: { argb: COLOR_PRIMARIO } }
    };

    // Encabezado de columnas
    const hRow = sheet.addRow(columnas.map(c => c.header));
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
    hRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    hRow.height = 26;

    // Filas de datos — algunos formatos expanden múltiples filas por registro (recepción)
    regs.forEach(r => {
      const filasData = expandirFilas ? expandirFilas(r) : [fila(r)];
      const esFest = esFestivo(r.anio, r.mes, r.dia);

      filasData.forEach((data, idxItem) => {
        const row = sheet.addRow(columnas.map(c => data[c.key]));
        row.alignment = { vertical: 'top', wrapText: true };

        // feriado solo en la primera fila del dia
        if (esFest && idxItem === 0) {
          const cell = row.getCell(idxColDia);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRIMARIO } };
          cell.font = { bold: true, color: { argb: COLOR_FESTIVO_FONT } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.note = 'Día feriado';
        } else {
          row.getCell(idxColDia).alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // C/NC se pinta
        cncIdxs.forEach(i => pintarCeldaCNC(row.getCell(i)));

        // recepcion
        if (formatoId === 'recepcion_materias_primas') {
          ['color', 'olor', 'apariencia', 'empaque'].forEach(key => {
            const i = columnas.findIndex(c => c.key === key) + 1;
            if (i > 0) pintarCeldaCNC(row.getCell(i));
          });
          // acepta verde, rechaza rojo
          const iDec = columnas.findIndex(c => c.key === 'decision') + 1;
          if (iDec > 0) {
            const cell = row.getCell(iDec);
            const v = String(cell.value || '').trim();
            if (v === 'Acepta') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
              cell.font = { bold: true, color: { argb: 'FF065F46' } };
            } else if (v === 'Rechaza') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
              cell.font = { bold: true, color: { argb: 'FF991B1B' } };
            }
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        }
      });
    });
  });
}

// Sincronizar la hoja de (formato, carpeta) en el archivo de la empresa
async function sincronizarFormatoCarpeta(empresaId, formatoId, carpeta) {
  const formato = getFormato(formatoId);
  if (!formato) throw new Error(`Formato desconocido: ${formatoId}`);

  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  const { dir, filePath } = rutaArchivoEmpresa(empresaId, empresa && empresa.nombre);
  await fs.promises.mkdir(dir, { recursive: true });

  const wb = await abrirWorkbook(filePath, empresa && empresa.nombre);

  const sheetName = nombreHoja(formato, carpeta || 'cocina');
  const existente = wb.getWorksheet(sheetName);
  if (existente) wb.removeWorksheet(existente.id);
  const sheet = wb.addWorksheet(sheetName, { properties: { tabColor: { argb: COLOR_PRIMARIO } } });

  // TODOS los registros de esta instancia (todos los meses)
  const registros = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId,
    carpeta: carpeta || 'cocina'
  }).sort({ anio: 1, mes: 1, dia: 1 }).lean();

  pintarHojaMultiMes(sheet, registros, formatoId, formato);

  await wb.xlsx.writeFile(filePath);
  return { filePath };
}

// Alias para compatibilidad (`routes/registros.js` llamaba sincronizarFormatoMes)
// Ahora reconstruye TODA la instancia (no solo el mes), porque el archivo de Excel
// es uno por empresa con meses apilados dentro de cada hoja.
async function sincronizarFormatoMes(empresaId, formatoId, carpeta /*, anio, mes */) {
  return sincronizarFormatoCarpeta(empresaId, formatoId, carpeta);
}

// Reconstruye TODAS las hojas (formato, carpeta) del archivo de la empresa
async function reconstruirArchivoCompleto(empresaId) {
  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  const { dir, filePath, fileName } = rutaArchivoEmpresa(empresaId, empresa && empresa.nombre);
  await fs.promises.mkdir(dir, { recursive: true });

  // Borrar archivos viejos de la estructura anterior (YYYY-MM.xlsx) que ya no se usan
  try {
    const archivos = await fs.promises.readdir(dir);
    for (const f of archivos) {
      if (/^\d{4}-\d{2}\.xlsx$/.test(f) && f !== fileName) {
        try { await fs.promises.unlink(path.join(dir, f)); }
        catch (e) { /* ignorar */ }
      }
    }
  } catch (e) { /* directorio no existe aún */ }

  // Borrar el archivo actual para empezar limpio
  if (fs.existsSync(filePath)) {
    try { await fs.promises.unlink(filePath); }
    catch (e) {
      // Si está bloqueado (abierto en Excel), no podemos reescribirlo
      const err = new Error('El archivo Excel está abierto. Ciérralo y vuelve a intentar.');
      err.code = e.code || 'EBUSY';
      throw err;
    }
  }

  const instancias = await Registro.aggregate([
    { $match: { empresa_id: new mongoose.Types.ObjectId(empresaId) } },
    { $group: { _id: { formato: '$formato', carpeta: '$carpeta' } } }
  ]);

  if (instancias.length === 0) return { filePath: null };

  for (const { _id } of instancias) {
    if (!getFormato(_id.formato)) continue;
    await sincronizarFormatoCarpeta(empresaId, _id.formato, _id.carpeta || 'cocina');
  }
  return { filePath };
}

// Compat: API vieja `reconstruirMesCompleto(empresaId, anio, mes)`
async function reconstruirMesCompleto(empresaId /*, anio, mes */) {
  return reconstruirArchivoCompleto(empresaId);
}

// Compat: ruta del archivo (sin importar año/mes — ahora es uno solo por empresa)
function getRutaArchivo(empresaId /*, anio, mes */) {
  // Llamada síncrona — devolvemos solo el path estándar usando el ID como nombre temporal.
  // El nombre real se calcula con `nombreEmpresa` durante la sincronización.
  const dir = path.join(CARPETA_EXCEL, String(empresaId));
  return { dir, filePath: null };
}

async function getRutaArchivoActual(empresaId) {
  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  return rutaArchivoEmpresa(empresaId, empresa && empresa.nombre);
}

// ASISTENCIA (no cambia su estructura — pero ahora resalta festivos)
function horaCorta(fecha) {
  if (!fecha) return '';
  return new Date(fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function estiloEncabezado(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_HEADER_BG } };
  row.alignment = { vertical: 'middle' };
  row.height = 24;
}

function nombreHojaEmpleado(nombre, usados) {
  const base = (String(nombre).replace(/[\\\/\?\*\[\]:]/g, '').trim() || 'Empleado').slice(0, 31);
  let candidato = base;
  let n = 2;
  while (usados.has(candidato.toLowerCase())) {
    const sufijo = ` (${n})`;
    candidato = base.slice(0, 31 - sufijo.length) + sufijo;
    n++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

async function generarExcelAsistencia(empresaId, anio, mes) {
  const registros = await Asistencia.find({ empresa_id: empresaId, anio, mes })
    .sort({ empleadoNombre: 1, dia: 1 })
    .lean();

  if (registros.length === 0) return null;

  const empresa = await Empresa.findById(empresaId).select('nombre').lean();
  const wb = new ExcelJS.Workbook();
  wb.creator = empresa && empresa.nombre ? empresa.nombre : 'FoodData';
  wb.created = new Date();

  const porEmpleado = new Map();
  registros.forEach(r => {
    if (!porEmpleado.has(r.empleadoNombre)) porEmpleado.set(r.empleadoNombre, []);
    porEmpleado.get(r.empleadoNombre).push(r);
  });

  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [
    { header: 'Empleado',            key: 'empleado', width: 28 },
    { header: 'Total horas del mes', key: 'total',    width: 22 }
  ];
  estiloEncabezado(resumen.getRow(1));

  const usados = new Set();
  const totales = [];

  for (const [nombre, lista] of porEmpleado) {
    const hoja = wb.addWorksheet(nombreHojaEmpleado(nombre, usados), {
      properties: { tabColor: { argb: COLOR_PRIMARIO } }
    });
    hoja.columns = [
      { header: 'Día',              key: 'dia',     width: 8  },
      { header: 'Fecha',            key: 'fecha',   width: 30 },
      { header: 'Entrada',          key: 'entrada', width: 12 },
      { header: 'Salida',           key: 'salida',  width: 16 },
      { header: 'Horas trabajadas', key: 'horas',   width: 18 }
    ];
    estiloEncabezado(hoja.getRow(1));

    let total = 0;
    lista.forEach(r => {
      const completo = !!(r.horaIngreso && r.horaSalida);
      const horas = completo ? (r.horasTrabajadas || 0) : 0;
      total += horas;
      const row = hoja.addRow({
        dia: r.dia,
        fecha: fechaLargaEs(r.anio, r.mes, r.dia),
        entrada: horaCorta(r.horaIngreso),
        salida: r.horaSalida ? horaCorta(r.horaSalida) : 'FALTA SALIDA',
        horas: completo ? horas : ''
      });
      // Festivo: resaltar solo la casilla del día
      if (esFestivo(r.anio, r.mes, r.dia)) {
        const cell = row.getCell('dia');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRIMARIO } };
        cell.font = { bold: true, color: { argb: COLOR_FESTIVO_FONT } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.note = 'Día feriado';
      }
    });

    const filaTotal = hoja.addRow({ salida: 'Total del mes:', horas: Math.round(total * 100) / 100 });
    filaTotal.font = { bold: true };

    totales.push({ nombre, total: Math.round(total * 100) / 100 });
  }

  totales
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .forEach(t => resumen.addRow({ empleado: t.nombre, total: t.total }));

  return wb.xlsx.writeBuffer();
}

module.exports = {
  sincronizarFormatoCarpeta,
  sincronizarFormatoMes,         // alias retro-compatible
  reconstruirArchivoCompleto,
  reconstruirMesCompleto,        // alias retro-compatible
  getRutaArchivo,                // legacy
  getRutaArchivoActual,
  generarExcelAsistencia
};
