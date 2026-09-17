const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const Registro = require('../models/Registro');
const { getFormato } = require('../formatos');
const { esFestivo } = require('../festivos');
const { getConfigEmpresa } = require('../empresaConfig');
const logger = require('../logger');

const RUTA_CREDENCIALES = process.env.GOOGLE_CREDENTIALS_PATH
  || path.join(__dirname, '..', 'google-credentials.json');

let sheets = null;
let disponible = false;
let cuentaServicioEmail = '';

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const SUFIJO_CARPETA_GS = { cocina: '', salon: ' (Salón)', administracion: ' (Admón)' };

// Colores (formato Google Sheets: 0-1 en cada canal)
const COLOR_PRIMARIO   = { red: 0.087, green: 0.760, blue: 0.639 };  // #16C2A3 turquoise
const COLOR_MES_BG     = { red: 0.925, green: 0.976, blue: 0.961 };  // #ECF9F5
const COLOR_C_BG       = { red: 0.819, green: 0.980, blue: 0.898 };  // #D1FAE5
const COLOR_C_FG       = { red: 0.024, green: 0.373, blue: 0.275 };  // #065F46
const COLOR_NC_BG      = { red: 0.996, green: 0.886, blue: 0.886 };  // #FEE2E2
const COLOR_NC_FG      = { red: 0.600, green: 0.106, blue: 0.106 };  // #991B1B
const COLOR_TEXTO_OSC  = { red: 0.055, green: 0.227, blue: 0.192 };  // #0E3A31

// en Render el disco es efimero, asi que ahi las credenciales van en una
// variable de entorno (el JSON completo, como texto) en vez de un archivo
function leerCredenciales() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  }
  if (fs.existsSync(RUTA_CREDENCIALES)) {
    return JSON.parse(fs.readFileSync(RUTA_CREDENCIALES, 'utf8'));
  }
  return null;
}

function inicializar() {
  let cred;
  try {
    cred = leerCredenciales();
  } catch (err) {
    logger.error(`credenciales de google sheets invalidas: ${err.message}`);
    return;
  }
  if (!cred) {
    logger.info('sin credenciales de google sheets, no sincroniza');
    return;
  }
  try {
    cuentaServicioEmail = cred.client_email || '';
    const auth = new google.auth.GoogleAuth({
      credentials: cred,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
    disponible = true;
    logger.info(`Google Sheets: sincronización activada (cuenta: ${cuentaServicioEmail})`);
  } catch (err) {
    logger.error(`google sheets no arranco: ${err.message}`);
    disponible = false;
  }
}

function estaDisponible() { return disponible; }
function getCuentaServicio() { return cuentaServicioEmail; }

function fechaLargaEs(anio, mes, dia) {
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function nombrePestana(formato, carpeta) {
  const sufijo = SUFIJO_CARPETA_GS[carpeta] || '';
  return `${formato.numero}. ${formato.nombreCorto || formato.nombre}${sufijo}`.slice(0, 90);
}

// Columnas por formato
function columnasGenericas() {
  return [
    { header: 'Día',           key: 'dia' },
    { header: 'Fecha',         key: 'fecha' },
    { header: 'Responsable',   key: 'responsable' },
    { header: 'Observaciones', key: 'observaciones' }
  ];
}

function columnasCalidadAgua() {
  return [
    { header: 'Día',               key: 'dia' },
    { header: 'Fecha',             key: 'fecha' },
    { header: 'Hora muestreo',     key: 'hora' },
    { header: 'Punto de muestreo', key: 'punto' },
    { header: 'pH (valor)',        key: 'ph_valor' },
    { header: 'pH (C/NC)',         key: 'ph_res' },
    { header: 'Cloro (mg/L)',      key: 'cloro_valor' },
    { header: 'Cloro (C/NC)',      key: 'cloro_res' },
    { header: 'Olor',              key: 'olor' },
    { header: 'Color',             key: 'color' },
    { header: 'Sabor',             key: 'sabor' },
    { header: 'Observaciones',     key: 'observaciones' },
    { header: 'Responsable',       key: 'responsable' }
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

function filaGenerica(r) {
  return {
    dia: r.dia,
    fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    responsable: r.responsable || '',
    observaciones: r.observaciones || ''
  };
}

function columnasTemperatura() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Tipo de equipo', key: 'tipoEquipo' },
    { header: 'Hora 1', key: 'hora1' }, { header: 'T°C 1', key: 'temp1' }, { header: 'Cumple 1', key: 'res1' },
    { header: 'Hora 2', key: 'hora2' }, { header: 'T°C 2', key: 'temp2' }, { header: 'Cumple 2', key: 'res2' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
  ];
}
function filaTemperatura(r) {
  const d = r.datos || {};
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    tipoEquipo: d.tipoEquipo === 'refrigeracion' ? 'Refrigeración' : (d.tipoEquipo === 'congelacion' ? 'Congelación' : (d.tipoEquipo || '')),
    hora1: d.hora1 || '',
    temp1: d.temp1 != null && !isNaN(d.temp1) ? d.temp1 : '',
    res1: d.resultado1 || '',
    hora2: d.hora2 || '',
    temp2: d.temp2 != null && !isNaN(d.temp2) ? d.temp2 : '',
    res2: d.resultado2 || '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasPlagas() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Áreas inspeccionadas', key: 'areas' },
    { header: 'Tipo de control', key: 'tipoControl' },
    { header: 'Novedad', key: 'novedad' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
  ];
}
function filaPlagas(r) {
  const d = r.datos || {};
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    areas: Array.isArray(d.areas) ? d.areas.join(', ') : '',
    tipoControl: d.tipoControl || '',
    novedad: d.novedad || '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasResiduos() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Orgánicos', key: 'organicos' },
    { header: 'Aprovechables', key: 'aprovechables' },
    { header: 'No aprovechables', key: 'noAprovechables' },
    { header: 'Total', key: 'total' },
    { header: 'Fecha evacuación', key: 'fechaEvac' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
  ];
}
function filaResiduos(r) {
  const d = r.datos || {};
  const org = Number(d.organicos) || 0, apr = Number(d.aprovechables) || 0, noa = Number(d.noAprovechables) || 0;
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    organicos: org, aprovechables: apr, noAprovechables: noa,
    total: org + apr + noa,
    fechaEvac: d.fechaEvacuacion || '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasLimpiezaSalon() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Tipo limpieza', key: 'tipoLimpieza' },
    { header: 'Áreas + producto (DO/HS)', key: 'areas' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
  ];
}
function filaLimpiezaSalon(r) {
  const d = r.datos || {};
  const formato = getFormato(r.formato);
  const mapaProd = {};
  if (formato && Array.isArray(formato.areas)) formato.areas.forEach(a => { mapaProd[a.nombre] = a.producto; });
  let lista = [];
  if (Array.isArray(d.areas)) lista = d.areas.map(n => `${n} [${mapaProd[n] || '?'}]`);
  else if (d.areas && typeof d.areas === 'object') lista = Object.entries(d.areas).map(([n, p]) => `${n} [${p}]`);
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    tipoLimpieza: d.tipoLimpieza || '',
    areas: lista.join(' · '),
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasLimpiezaBano() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Tipo limpieza', key: 'tipoLimpieza' },
    { header: 'Áreas limpiadas', key: 'areas' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
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
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Equipo(s)', key: 'equipos' },
    { header: 'Hora', key: 'hora' },
    { header: 'Desinfectante', key: 'desinfectante' },
    { header: 'Agua (L)', key: 'agua' },
    { header: 'Producto (mL)', key: 'producto' },
    { header: 'Observaciones', key: 'observaciones' }, { header: 'Responsable', key: 'responsable' }
  ];
}
function filaLimpiezaCT(r) {
  const d = r.datos || {};
  return {
    dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
    equipos: Array.isArray(d.equipos) ? d.equipos.join(', ') : '',
    hora: d.hora || '', desinfectante: d.desinfectante || '',
    agua: d.cantidadAgua != null ? d.cantidadAgua : '',
    producto: d.cantidadProducto != null ? d.cantidadProducto : '',
    observaciones: r.observaciones || '', responsable: r.responsable || ''
  };
}

function columnasRecepcion() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Proveedor', key: 'proveedor' }, { header: 'Producto', key: 'producto' },
    { header: 'Cant. (Kg)', key: 'cantidad' }, { header: 'T (°C)', key: 'temperatura' },
    { header: 'Lote', key: 'lote' }, { header: 'Vencimiento', key: 'vencimiento' },
    { header: 'Color', key: 'color' }, { header: 'Olor', key: 'olor' },
    { header: 'Apariencia', key: 'apariencia' }, { header: 'Empaque', key: 'empaque' },
    { header: 'Decisión', key: 'decision' }, { header: 'Obs. ítem', key: 'obsItem' },
    { header: 'Responsable', key: 'responsable' }
  ];
}
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
    dia: idx === 0 ? r.dia : '',
    fecha: idx === 0 ? fechaLargaEs(r.anio, r.mes, r.dia) : '',
    proveedor: it.proveedor || '', producto: it.producto || '',
    cantidad: it.cantidad != null && !isNaN(it.cantidad) ? it.cantidad : '',
    temperatura: it.temperatura != null && !isNaN(it.temperatura) ? it.temperatura : '',
    lote: it.lote || '', vencimiento: it.fechaVencimiento || '',
    color: it.color || '', olor: it.olor || '',
    apariencia: it.apariencia || '', empaque: it.empaque || '',
    decision: it.decision || '', obsItem: it.observaciones || '',
    responsable: idx === 0 ? (r.responsable || '') : ''
  }));
}

function columnasPresentacionPersonal() {
  return [
    { header: 'Día', key: 'dia' }, { header: 'Fecha', key: 'fecha' },
    { header: 'Manipulador', key: 'manipulador' }, { header: 'Cumple', key: 'cumple' },
    { header: 'Qué no cumplió', key: 'criterios' },
    { header: 'Revisado por', key: 'responsable' }, { header: 'Observaciones', key: 'observaciones' }
  ];
}
function filasPresentacionPersonal(r) {
  const manipuladores = (r.datos && Array.isArray(r.datos.manipuladores)) ? r.datos.manipuladores : [];
  if (manipuladores.length === 0) {
    return [{
      dia: r.dia, fecha: fechaLargaEs(r.anio, r.mes, r.dia),
      manipulador: '(sin empleados)', cumple: '', criterios: '',
      responsable: r.responsable || '', observaciones: r.observaciones || ''
    }];
  }
  return manipuladores.map((m, idx) => ({
    dia: idx === 0 ? r.dia : '',
    fecha: idx === 0 ? fechaLargaEs(r.anio, r.mes, r.dia) : '',
    manipulador: m.nombre || '',
    cumple: m.cumple ? 'Sí' : 'No',
    criterios: m.cumple ? '' : (Array.isArray(m.criterios) ? m.criterios.join(', ') : ''),
    responsable: idx === 0 ? (r.responsable || '') : '',
    observaciones: idx === 0 ? (r.observaciones || '') : ''
  }));
}

function columnasYFila(formatoId) {
  switch (formatoId) {
    case 'calidad_agua':              return { columnas: columnasCalidadAgua(),   fila: filaCalidadAgua  };
    case 'control_temperatura':       return { columnas: columnasTemperatura(),   fila: filaTemperatura  };
    case 'control_plagas':            return { columnas: columnasPlagas(),        fila: filaPlagas       };
    case 'manejo_residuos':           return { columnas: columnasResiduos(),      fila: filaResiduos     };
    case 'limpieza_salon':            return { columnas: columnasLimpiezaSalon(), fila: filaLimpiezaSalon };
    case 'limpieza_bano':             return { columnas: columnasLimpiezaBano(),  fila: filaLimpiezaBano  };
    case 'limpieza_campana_trampa':   return { columnas: columnasLimpiezaCT(),    fila: filaLimpiezaCT    };
    case 'recepcion_materias_primas': return { columnas: columnasRecepcion(),     fila: null, expandirFilas: filasRecepcion };
    case 'presentacion_personal':     return { columnas: columnasPresentacionPersonal(), fila: null, expandirFilas: filasPresentacionPersonal };
    default:                          return { columnas: columnasGenericas(),     fila: filaGenerica     };
  }
}

// Sincronización
async function sincronizarFormato(spreadsheetId, empresaId, formatoId, carpeta) {
    if (!disponible) throw new Error('Google Sheets no está configurado en el servidor');
  if (!spreadsheetId) throw new Error('Esta empresa no tiene una hoja de Google Sheets vinculada');

  const formato = getFormato(formatoId);
  if (!formato) throw new Error(`Formato desconocido: ${formatoId}`);

  const config = await getConfigEmpresa(empresaId);
  const esCompartido = config.compartidos.includes(formatoId);
  // compartido => pestaña sin sufijo + columna Carpeta + registros de todas las carpetas
  const pestana = esCompartido
    ? nombrePestana(formato, 'cocina')
    : nombrePestana(formato, carpeta || 'cocina');
  let { columnas, fila, expandirFilas } = columnasYFila(formatoId);
  if (esCompartido) {
    const idxFecha = columnas.findIndex(c => c.key === 'fecha');
    const insertarEn = idxFecha >= 0 ? idxFecha + 1 : 2;
    columnas = [
      ...columnas.slice(0, insertarEn),
      { header: 'Carpeta', key: 'carpeta' },
      ...columnas.slice(insertarEn)
    ];
  }
  const numCols = columnas.length;
  
  // ----- Obtener / crear pestaña -----
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existente = (meta.data.sheets || []).find(s => s.properties.title === pestana);

  let sheetId;
  if (existente) {
    sheetId = existente.properties.sheetId;
  } else {
    const r = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: pestana,
              tabColor: COLOR_PRIMARIO,
              gridProperties: { rowCount: 1000, columnCount: Math.max(numCols, 20) }
            }
          }
        }]
      }
    });
    sheetId = r.data.replies[0].addSheet.properties.sheetId;
  }

  // ----- Obtener registros agrupados por mes -----
  const filtroRegs = esCompartido
    ? { empresa_id: empresaId, formato: formatoId }
    : { empresa_id: empresaId, formato: formatoId, carpeta: carpeta || 'cocina' };
  const registros = await Registro.find(filtroRegs)
    .sort({ anio: 1, mes: 1, dia: 1, carpeta: 1 })
    .lean();
  
  // Construir filas con secciones por mes
  const valores = [];                  // matriz de strings
  const formatRequests = [];           // requests de formato para batchUpdate

  function pushFila(arr) { valores.push(arr); return valores.length - 1; }
  function fillaVacia() { return new Array(numCols).fill(''); }

  // Título institucional
  if (formato.titulo) {
    const idxTitulo = pushFila([formato.titulo, ...new Array(numCols - 1).fill('')]);
    formatRequests.push({
      mergeCells: { range: rango(sheetId, idxTitulo, idxTitulo + 1, 0, numCols), mergeType: 'MERGE_ALL' }
    });
    formatRequests.push({
      repeatCell: {
        range: rango(sheetId, idxTitulo, idxTitulo + 1, 0, numCols),
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, fontSize: 13 }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
      }
    });

    if (formato.plan) {
      const partes = [
        formato.plan,
        formato.programa,
        formato.codigo ? `Código ${formato.codigo}` : null
      ].filter(Boolean);
      const subtitulo = partes.join('  ·  ');
      const idxSub = pushFila([subtitulo, ...new Array(numCols - 1).fill('')]);
      formatRequests.push({
        mergeCells: { range: rango(sheetId, idxSub, idxSub + 1, 0, numCols), mergeType: 'MERGE_ALL' }
      });
      formatRequests.push({
        repeatCell: {
          range: rango(sheetId, idxSub, idxSub + 1, 0, numCols),
          cell: {
            userEnteredFormat: {
              horizontalAlignment: 'CENTER',
              textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.42, green: 0.45, blue: 0.50 } }
            }
          },
          fields: 'userEnteredFormat(horizontalAlignment,textFormat)'
        }
      });
    }
    pushFila(fillaVacia());
  }

  if (registros.length === 0) {
    const idx = pushFila(['Aún no hay registros guardados en esta instancia.', ...new Array(numCols - 1).fill('')]);
    formatRequests.push({
      mergeCells: { range: rango(sheetId, idx, idx + 1, 0, numCols), mergeType: 'MERGE_ALL' }
    });
  } else {
    // Agrupar por mes
    const porMes = new Map();
    registros.forEach(r => {
      const k = `${r.anio}-${String(r.mes).padStart(2, '0')}`;
      if (!porMes.has(k)) porMes.set(k, { anio: r.anio, mes: r.mes, registros: [] });
      porMes.get(k).registros.push(r);
    });

    const idxColDia = 0;
    const cncKeys = ['ph_res', 'cloro_res', 'olor', 'color', 'sabor', 'res1', 'res2'];
    const cncIndices = cncKeys.map(k => columnas.findIndex(c => c.key === k)).filter(i => i >= 0);

    let primero = true;
    for (const k of Array.from(porMes.keys()).sort()) {
      const { anio, mes, registros: regs } = porMes.get(k);
      const nombreMes = MESES_LARGOS[mes - 1].toUpperCase();

      if (!primero) pushFila(fillaVacia());
      primero = false;

      // Cabecera del mes
      const idxMes = pushFila([`${nombreMes} ${anio}`, ...new Array(numCols - 1).fill('')]);
      formatRequests.push({
        mergeCells: { range: rango(sheetId, idxMes, idxMes + 1, 0, numCols), mergeType: 'MERGE_ALL' }
      });
      formatRequests.push({
        repeatCell: {
          range: rango(sheetId, idxMes, idxMes + 1, 0, numCols),
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR_MES_BG,
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              textFormat: { bold: true, fontSize: 12, foregroundColor: COLOR_TEXTO_OSC }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,textFormat)'
        }
      });

      // Cabecera de columnas
      const idxHeaders = pushFila(columnas.map(c => c.header));
      formatRequests.push({
        repeatCell: {
          range: rango(sheetId, idxHeaders, idxHeaders + 1, 0, numCols),
          cell: {
            userEnteredFormat: {
              backgroundColor: COLOR_PRIMARIO,
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
            }
          },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)'
        }
      });

      // recepcion tiene mas columnas C/NC
      const cncRecepcion = ['color', 'olor', 'apariencia', 'empaque'].map(k => columnas.findIndex(c => c.key === k)).filter(i => i >= 0);
      const idxDecision = columnas.findIndex(c => c.key === 'decision');
      const idxCumple = columnas.findIndex(c => c.key === 'cumple');

      // Filas de datos — algunos formatos expanden múltiples filas por registro
      regs.forEach(r => {
        const filasData = expandirFilas ? expandirFilas(r) : [fila(r)];
        const esFest = esFestivo(r.anio, r.mes, r.dia);
        const NOMBRES_C = { cocina: 'Cocina', salon: 'Salón', administracion: 'Administración' };

        filasData.forEach((data, idxItem) => {
          if (esCompartido) data.carpeta = NOMBRES_C[r.carpeta] || r.carpeta || '';
          const arr = columnas.map(c => {
            const v = data[c.key];
            return v == null ? '' : String(v);
          });
          const idxFila = pushFila(arr);

          // feriado solo en la primera fila del dia
          if (esFest && idxItem === 0) {
            formatRequests.push({
              repeatCell: {
                range: rango(sheetId, idxFila, idxFila + 1, idxColDia, idxColDia + 1),
                cell: {
                  userEnteredFormat: {
                    backgroundColor: COLOR_PRIMARIO,
                    horizontalAlignment: 'CENTER',
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  },
                  note: 'Día feriado'
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat),note'
              }
            });
          } else {
            formatRequests.push({
              repeatCell: {
                range: rango(sheetId, idxFila, idxFila + 1, idxColDia, idxColDia + 1),
                cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
                fields: 'userEnteredFormat(horizontalAlignment)'
              }
            });
          }

          // Resaltado C/NC (todas las columnas conocidas)
          const idxsACNC = [...cncIndices, ...cncRecepcion];
          idxsACNC.forEach(idx => {
            const valor = String(arr[idx] || '').trim();
            if (valor !== 'C' && valor !== 'NC') return;
            const bg = valor === 'C' ? COLOR_C_BG : COLOR_NC_BG;
            const fg = valor === 'C' ? COLOR_C_FG : COLOR_NC_FG;
            formatRequests.push({
              repeatCell: {
                range: rango(sheetId, idxFila, idxFila + 1, idx, idx + 1),
                cell: {
                  userEnteredFormat: {
                    backgroundColor: bg,
                    horizontalAlignment: 'CENTER',
                    textFormat: { bold: true, foregroundColor: fg }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
              }
            });
          });

          // Decisión Acepta/Rechaza (solo recepción)
          if (idxDecision >= 0) {
            const v = String(arr[idxDecision] || '').trim();
            if (v === 'Acepta' || v === 'Rechaza') {
              const bg = v === 'Acepta' ? COLOR_C_BG : COLOR_NC_BG;
              const fg = v === 'Acepta' ? COLOR_C_FG : COLOR_NC_FG;
              formatRequests.push({
                repeatCell: {
                  range: rango(sheetId, idxFila, idxFila + 1, idxDecision, idxDecision + 1),
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: bg,
                      horizontalAlignment: 'CENTER',
                      textFormat: { bold: true, foregroundColor: fg }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
                }
              });
            }
          }

          // Cumple Sí/No (solo presentacion personal)
          if (idxCumple >= 0) {
            const v = String(arr[idxCumple] || '').trim();
            if (v === 'Sí' || v === 'No') {
              const bg = v === 'Sí' ? COLOR_C_BG : COLOR_NC_BG;
              const fg = v === 'Sí' ? COLOR_C_FG : COLOR_NC_FG;
              formatRequests.push({
                repeatCell: {
                  range: rango(sheetId, idxFila, idxFila + 1, idxCumple, idxCumple + 1),
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: bg,
                      horizontalAlignment: 'CENTER',
                      textFormat: { bold: true, foregroundColor: fg }
                    }
                  },
                  fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)'
                }
              });
            }
          }
        });
      });
    }
  }

  // ----- Limpiar la hoja entera -----
  logger.debug('[GS] Limpiando valores...');
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${pestana}'`
  });

  // Limpiar formato previo (merges + colores) usando rangos bounded
  const rangoCompleto = { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: Math.max(numCols, 20) };
  logger.debug('[GS] Limpiando formatos previos...');
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          { unmergeCells: { range: rangoCompleto } },
          {
            updateCells: {
              range: rangoCompleto,
              fields: 'userEnteredFormat,note'
            }
          }
        ]
      }
    });
  } catch (errLimpieza) {
    logger.warn(`gs: No se pudo limpiar formato previo (no es crítico): ${errLimpieza.message}`);
  }

  // ----- Escribir valores -----
  if (valores.length > 0) {
        await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${pestana}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: valores }
    });
  }

  // ----- Aplicar formato en batch (chunks de 100 requests) -----
  if (formatRequests.length > 0) {
        const CHUNK = 100;
    for (let i = 0; i < formatRequests.length; i += CHUNK) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: formatRequests.slice(i, i + CHUNK) }
      });
    }
  }
  }

function rango(sheetId, startRow, endRow, startCol, endCol) {
  return {
    sheetId,
    startRowIndex: startRow,
    endRowIndex: endRow,
    startColumnIndex: startCol,
    endColumnIndex: endCol
  };
}

module.exports = {
  inicializar,
  estaDisponible,
  getCuentaServicio,
  sincronizarFormato
};
