const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');
const bcrypt = require('bcryptjs');
const { FORMATOS, getFormato, CARPETAS, NOMBRES_CARPETA } = require('../formatos');
const { getConfigEmpresa, elementosDe } = require('../empresaConfig');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');
const { adminCarpetaAdministracionActivo, adminHistorialActivo, adminAtrasadoActivo, adminReporteActivo, adminInspeccionActivo } = require('./admin');
const { sincronizarFormatoCarpeta, reconstruirArchivoCompleto, getRutaArchivoActual, columnasYFila } = require('../servicios/excel');
const googleSheets = require('../servicios/googleSheets');
const correo = require('../servicios/correo');
const logger = require('../logger');

const router = express.Router();

const REGEX_LETRAS = /^[A-Za-zÀ-ÿÑñ\s]+$/;

async function verificarPasswordAdmin(empresaId, password) {
  if (!password) {
    return { status: 401, requiereClave: true, error: 'Este formato está atrasado. Ingresa la contraseña de administrador para continuar.' };
  }
  const admins = await Administrador.find({ empresa_id: empresaId });
  if (admins.length === 0) {
    return { status: 404, error: 'Esta empresa aún no tiene administrador asignado' };
  }
  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) return { ok: true };
  }
  return { status: 401, requiereClave: true, error: 'Contraseña de administrador incorrecta' };
}

async function empresaTieneFormato(empresaId, formatoId) {
  const e = await Empresa.findById(empresaId).select('formatosActivos').lean();
  const activos = (e && e.formatosActivos && e.formatosActivos.length > 0)
    ? e.formatosActivos
    : FORMATOS.map(f => f.id);
  return activos.includes(formatoId);
}

function partesDeHoy() {
  const ahora = new Date();
  return {
    dia: ahora.getDate(),
    mes: ahora.getMonth() + 1,
    anio: ahora.getFullYear()
  };
}

// dia del mes desde el que se exige llenar: un elemento (baño, nevera...) nuevo solo cuenta
// desde que se dio de alta, no hacia atras
function diaDesde(el, mes, anio) {
  if (!el || !el.desde) return 1;
  const [a, m, d] = el.desde.split('-').map(Number);
  return (a === anio && m === mes) ? d : 1;
}

// momentos del dia que faltan en un registro (ej. [2] = falta la medicion 2)
function faltantes(formato, registro) {
  if (!formato || !formato.momentos) return [];
  const d = registro.datos || {};
  return formato.momentos.filter(m => !m.campos.every(c => d[c] !== '' && d[c] != null)).map(m => m.n);
}

async function infoPendientes(empresaId, formatoId, carpeta, el = null) {
  const { dia, mes, anio } = partesDeHoy();
  const guardados = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId,
    carpeta,
    elemento: el ? el._id : null,
    anio, mes,
    dia: { $lte: dia }
  }).sort({ dia: 1 }).lean();

  const set = new Set(guardados.map(g => g.dia));
  const pendientes = [];
  for (let d = diaDesde(el, mes, anio); d <= dia; d++) {
    if (!set.has(d)) pendientes.push(d);
  }
  const siguienteDia = pendientes.length > 0 ? pendientes[0] : null;
  const registroHoy = guardados.find(g => g.dia === dia) || null;
  // dias a los que les falta un momento (ej. la medicion 2): ya tienen registro, asi que no
  // bloquean los dias siguientes, pero hay que avisar que faltan
  const formato = getFormato(formatoId);
  const parciales = guardados.filter(g => g.parcial).map(g => ({ id: g._id, dia: g.dia, falta: faltantes(formato, g), esHoy: g.dia === dia }));

  return {
    diaActual: dia,
    mes, anio,
    pendientes,
    diasGuardados: guardados.map(g => g.dia),
    siguienteDia,
    completoHoy: pendientes.length === 0,
    registroHoy,
    registrosMes: guardados,
    parciales
  };
}

// el elemento (baño, nevera...) con el que se llena un formato. si el formato tiene elementos
// en servicio en esa carpeta hay que elegir uno; si no tiene, no se manda ninguno
function resolverElemento(config, formatoId, carpeta, elementoId) {
  const activos = elementosDe(config, formatoId, carpeta, true);
  if (activos.length === 0) {
    if (elementoId) return { status: 400, error: 'Este formato no tiene elementos configurados' };
    return { el: null };
  }
  if (!elementoId) return { status: 400, error: 'Elige cuál es (por ejemplo, qué baño)' };
  const el = activos.find(e => String(e._id) === String(elementoId));
  if (!el) return { status: 400, error: 'Ese elemento no está en servicio' };
  return { el };
}

// formatos que se llenan en varios momentos del dia (temperatura: medicion 1 y 2). se puede guardar
// solo el primero ("parcial") y completar el resto despues
function validarMomentos(formato, datos, parcial) {
  const mom = formato.momentos;
  if (!mom) return parcial ? { error: 'Este formato se llena una sola vez al día' } : { datos, completos: [] };
  datos = { ...(datos || {}) };
  const listo = m => m.campos.every(c => datos[c] !== '' && datos[c] != null);
  if (!listo(mom[0])) return { error: 'Falta la medición 1.' };
  if (parcial) {
    mom.slice(1).forEach(m => m.campos.concat('resultado' + m.n).forEach(c => delete datos[c]));
    return { datos, completos: [1] };
  }
  const falta = mom.find(m => !listo(m));
  if (falta) return { error: `Falta la medición ${falta.n}.` };
  const horas = mom.map(m => datos[m.campos[0]]);
  const mal = horas.findIndex((h, i) => i && h <= horas[i - 1]);
  if (mal > 0) return { error: `La hora de la medición ${mal + 1} debe ser posterior a la de la medición ${mal}.` };
  return { datos, completos: mom.map(m => m.n) };
}

// excel se espera, google sheets corre de fondo (mismo criterio que al guardar un dia nuevo)
async function sincronizarDespuesDeGuardar(req, registro, config) {
  const empresaId = req.session.empresa.id;
  let excelError = null;
  try {
    await sincronizarFormatoCarpeta(empresaId, registro.formato, registro.carpeta, { config, empresaNombre: req.session.empresa.nombre });
  } catch (errSync) {
    logger.warn(`no se pudo escribir excel: ${errSync.message}`);
    excelError = 'No se pudo actualizar el Excel: ' + errSync.message;
  }
  (async () => {
    try {
      const empresaDoc = await Empresa.findById(empresaId).select('googleSheetId').lean();
      if (empresaDoc && empresaDoc.googleSheetId && googleSheets.estaDisponible()) {
        await googleSheets.sincronizarFormato(empresaDoc.googleSheetId, empresaId, registro.formato, registro.carpeta);
      }
    } catch (errGS) {
      logger.warn(`no se sincronizo google sheets: ${errGS.message}`);
    }
  })();
  return excelError;
}

// suma de dias pendientes a lo largo de todos los formatos activos de la empresa
// para el mes en curso. lo uso en el menu principal para mostrar el badge rojo.
router.get('/resumen-pendientes', requireEmpresa, ah(async (req, res) => {
  const empresaId = req.session.empresa.id;
  const config = await getConfigEmpresa(empresaId);
  const { mes, anio } = partesDeHoy();

  // cada (formato, carpeta) cuenta como una instancia independiente, incluso si son compartidos.
  // si el formato tiene elementos (baños, neveras...), cada elemento en servicio es una instancia
  const instancias = [];
  for (const carpeta of CARPETAS) {
    for (const formatoId of (config.carpetas[carpeta] || [])) {
      const els = elementosDe(config, formatoId, carpeta, true);
      if (els.length) els.forEach(el => instancias.push({ formatoId, carpeta, el }));
      else instancias.push({ formatoId, carpeta, el: null });
    }
  }

  // reuso infoPendientes (la misma logica de dias faltantes que usa cada formato)
  // en vez de recalcular el conteo aparte, asi no se pueden desincronizar -- se piden
  // todas las instancias a la vez en vez de una por una, cada una es una consulta aparte
  const infos = await Promise.all(instancias.map(i => infoPendientes(empresaId, i.formatoId, i.carpeta, i.el)));

  let totalDiasPendientes = 0;
  let formatosConPendientes = 0;
  let diasIncompletos = 0;
  for (const info of infos) {
    if (info.pendientes.length > 0 || info.parciales.length > 0) formatosConPendientes++;
    totalDiasPendientes += info.pendientes.length;
    diasIncompletos += info.parciales.length;
  }

  res.json({
    ok: true,
    totalDiasPendientes,
    diasIncompletos,
    formatosConPendientes,
    totalFormatos: instancias.length,
    mes, anio
  });
}));

// por formato de una carpeta: cuantos dias de este mes tienen una medicion pendiente (para la lista de formatos)
router.get('/incompletos', requireEmpresa, ah(async (req, res) => {
  const carpeta = req.query.carpeta || 'cocina';
  if (!Registro.CARPETAS_VALIDAS.includes(carpeta)) {
    return res.status(400).json({ ok: false, error: 'Carpeta no válida' });
  }
  const empresaId = req.session.empresa.id;
  const config = await getConfigEmpresa(empresaId);
  const { mes, anio } = partesDeHoy();
  const formatos = {};
  for (const formatoId of (config.carpetas[carpeta] || [])) {
    const formato = getFormato(formatoId);
    if (!formato || !formato.momentos) continue;
    const dias = await Registro.countDocuments({ empresa_id: empresaId, formato: formatoId, carpeta, parcial: true, anio, mes });
    if (dias) formatos[formatoId] = { dias, medicion: formato.momentos[formato.momentos.length - 1].n };
  }
  res.json({ ok: true, formatos });
}));

router.get('/pendientes/:formatoId', requireEmpresa, ah(async (req, res) => {
  const { formatoId } = req.params;
  const carpeta = req.query.carpeta || 'cocina';
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  if (!Registro.CARPETAS_VALIDAS.includes(carpeta)) {
    return res.status(400).json({ ok: false, error: 'Carpeta no válida' });
  }
  const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
  if (!habilitado) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }
  // cada carpeta lleva su propia secuencia de pendientes, incluso si el formato esta marcado
  // como "compartido" (eso solo afecta como se ve en el excel/sheets)
  const config = await getConfigEmpresa(req.session.empresa.id);
  const resEl = resolverElemento(config, formatoId, carpeta, req.query.elemento);
  if (resEl.error) return res.status(resEl.status).json({ ok: false, error: resEl.error });
  const el = resEl.el;
  const info = await infoPendientes(req.session.empresa.id, formatoId, carpeta, el);

  const esCarpetaAdmin = carpeta === 'administracion' && config.carpetas.administracion.includes(formatoId);
  const hayAtrasados = !info.completoHoy && info.siguienteDia !== info.diaActual;
  const requiereAdminAtrasado = hayAtrasados && !esCarpetaAdmin && !adminAtrasadoActivo(req, carpeta);

  res.json({
    ok: true, ...info, requiereAdminAtrasado, esCarpetaAdmin,
    elemento: el ? { id: el._id, nombre: el.nombre, tipo: el.tipo, desde: el.desde } : null
  });
}));

router.get('/hoy/:formatoId', requireEmpresa, ah(async (req, res) => {
  const { formatoId } = req.params;
  const carpeta = req.query.carpeta || 'cocina';
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const { dia, mes, anio } = partesDeHoy();
  const registro = await Registro.findOne({
    empresa_id: req.session.empresa.id,
    formato: formatoId,
    carpeta,
    elemento: mongoose.Types.ObjectId.isValid(req.query.elemento) ? req.query.elemento : null,
    dia, mes, anio
  }).lean();
  res.json({ ok: true, registro });
}));

router.post('/', requireEmpresa, limiteAdmin, async (req, res) => {
  try {
    const { formatoId, carpeta, responsable, observaciones, datos, elemento, parcial } = req.body;
    const formato = getFormato(formatoId);
    if (!formato) return res.status(400).json({ ok: false, error: 'Formato no válido' });
    if (!carpeta || !Registro.CARPETAS_VALIDAS.includes(carpeta)) {
      return res.status(400).json({ ok: false, error: 'Carpeta no válida' });
    }
    // sanidad: que el campo `datos` no traiga porquerias gigantes
    if (datos && JSON.stringify(datos).length > 32000) {
      return res.status(413).json({ ok: false, error: 'Los datos son demasiado grandes' });
    }
    if (observaciones && String(observaciones).length > 2000) {
      return res.status(413).json({ ok: false, error: 'Las observaciones son muy largas (máx 2000 caracteres)' });
    }

    const config = await getConfigEmpresa(req.session.empresa.id);
    const { activos, carpetas } = config;
    if (!activos.includes(formatoId)) {
      return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
    }
    // Verificar que el formato esté asignado a esa carpeta para esta empresa
    if (!carpetas[carpeta] || !carpetas[carpeta].includes(formatoId)) {
      return res.status(403).json({ ok: false, error: 'Este formato no está disponible en esa carpeta' });
    }

    const resEl = resolverElemento(config, formatoId, carpeta, elemento);
    if (resEl.error) return res.status(resEl.status).json({ ok: false, error: resEl.error });
    const el = resEl.el;
    const mom = validarMomentos(formato, datos, !!parcial);
    if (mom.error) return res.status(400).json({ ok: false, error: mom.error });

    const info = await infoPendientes(req.session.empresa.id, formatoId, carpeta, el);
    if (info.completoHoy) {
      return res.status(409).json({ ok: false, error: 'Ya completaste todos los días de este mes hasta hoy' });
    }

    let nombreResponsable;
    // ojo: esto tiene que fijarse en la carpeta que se esta guardando AHORA, no en si
    // el formato tambien existe en administracion en otra parte de la config
    const esCarpetaAdmin  = carpeta === 'administracion';
    const adminNombre     = adminCarpetaAdministracionActivo(req);

    if (esCarpetaAdmin) {
      if (!adminNombre) {
        return res.status(401).json({ ok: false, error: 'Se requiere acceso a la carpeta Administración para guardar este formato' });
      }
      nombreResponsable = adminNombre;
    } else {
      const limpio = (responsable || '').trim();
      if (!limpio) return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
      if (!REGEX_LETRAS.test(limpio)) return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });
      nombreResponsable = limpio;

      if (info.siguienteDia !== info.diaActual) {
        // marcador por carpeta (cocina y salon llevan password separada)
        if (!adminAtrasadoActivo(req, carpeta)) {
          const v = await verificarPasswordAdmin(req.session.empresa.id, req.body.password);
          if (v.error) {
            return res.status(v.status).json({ ok: false, error: v.error, requiereClaveAdmin: !!v.requiereClave });
          }
          if (!req.session.adminAtrasado || typeof req.session.adminAtrasado.ts === 'number') {
            req.session.adminAtrasado = {};
          }
          req.session.adminAtrasado[carpeta] = { ts: Date.now() };
        }
      }
    }

    const dia = info.siguienteDia;
    const fecha = new Date(info.anio, info.mes - 1, dia);

    const registro = await Registro.create({
      empresa_id: req.session.empresa.id,
      formato: formatoId,
      carpeta,
      fecha,
      dia,
      mes: info.mes,
      anio: info.anio,
      elemento: el ? el._id : null,
      parcial: !!parcial,
      mediciones: mom.completos.map(n => ({ n, por: nombreResponsable, en: new Date() })),
      responsable: nombreResponsable,
      observaciones: (observaciones || '').trim(),
      datos: mom.datos || {}
    });

    // excel y google sheets arrancan los dos al mismo tiempo, pero solo se espera
    // a excel para responder -- sheets le hace 5-6 llamadas seguidas a la API de
    // Google (chequear/crear pestana, limpiar, escribir, formatear) y eso solo ya
    // suma 1-2s; no vale la pena que el usuario espere eso para ver "guardado".
    // si sheets falla, no es algo que el empleado pueda resolver ahi mismo de
    // todas formas (suele ser permisos o configuracion) -- queda en los logs
    // (Better Stack) para que el admin se entere, aunque no se vea en pantalla
    async function sincronizarExcel() {
      try {
        // le paso el config y el nombre que ya tenemos a mano en este request,
        // asi no los vuelve a pedir a Mongo (eran 2 consultas redundantes)
        await sincronizarFormatoCarpeta(req.session.empresa.id, formatoId, carpeta, {
          config, empresaNombre: req.session.empresa.nombre
        });
        return null;
      } catch (errSync) {
        logger.warn(`no se pudo escribir excel: ${errSync.message}`);
        // EBUSY o EPERM => archivo abierto en Excel desktop (Windows lo bloquea)
        if (errSync.code === 'EBUSY' || errSync.code === 'EPERM' || /resource busy|permission denied|access is denied/i.test(errSync.message)) {
          return 'El archivo Excel está abierto en tu computador y no se pudo actualizar. Ciérralo y vuelve a guardar (o descárgalo nuevamente desde la app).';
        }
        return 'No se pudo actualizar el Excel: ' + errSync.message;
      }
    }

    async function sincronizarGoogleSheets() {
      try {
        const empresaDoc = await Empresa.findById(req.session.empresa.id).select('googleSheetId').lean();
        if (!empresaDoc || !empresaDoc.googleSheetId) {
          return 'Esta empresa no tiene una hoja de Google Sheets vinculada. Pídele al superadmin que la configure.';
        }
        if (!googleSheets.estaDisponible()) {
          return 'El servidor no tiene configuradas las credenciales de Google Sheets.';
        }
        await googleSheets.sincronizarFormato(empresaDoc.googleSheetId, req.session.empresa.id, formatoId, carpeta);
        return null;
      } catch (errGS) {
        logger.warn(`no se sincronizo google sheets: ${errGS.message}`);
        const msg = String(errGS.message || '');
        if (/permission|403/i.test(msg)) {
          return `La cuenta de servicio no tiene permiso para editar esta hoja. Compártela como Editor con: ${googleSheets.getCuentaServicio()}`;
        }
        if (/not found|404/i.test(msg)) {
          return 'El ID de la hoja de Google Sheets no existe o se borró.';
        }
        return 'Google Sheets no se pudo actualizar: ' + msg;
      }
    }

    const excelPromise = sincronizarExcel();
    sincronizarGoogleSheets(); // no lo espero -- corre de fondo, su error ya se loguea adentro
    const excelError = await excelPromise;
    const googleSheetsError = null; // no se sabe todavia en este momento, ver comentario arriba

    // ya sabemos exactamente que cambio (se guardo el dia "info.siguienteDia"), asi
    // que armo el info actualizado a mano en vez de volver a consultar la BD
    const infoNuevo = {
      ...info,
      pendientes: info.pendientes.filter(d => d !== dia),
      diasGuardados: [...info.diasGuardados, dia].sort((a, b) => a - b),
      registrosMes: [...info.registrosMes, registro]
    };
    infoNuevo.siguienteDia = infoNuevo.pendientes.length > 0 ? infoNuevo.pendientes[0] : null;
    infoNuevo.completoHoy = infoNuevo.pendientes.length === 0;
    if (dia === info.diaActual) infoNuevo.registroHoy = registro;
    if (registro.parcial) infoNuevo.parciales = [...info.parciales, { id: registro._id, dia, falta: faltantes(formato, registro), esHoy: dia === info.diaActual }];

    res.status(201).json({ ok: true, registro, info: infoNuevo, excelError, googleSheetsError });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro para ese día' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// completa el momento que falta de un registro (ej. la medicion 2 de temperatura). el mismo dia
// no pide clave; completar un dia que ya paso si, igual que llenar un dia atrasado
router.post('/:id/completar', requireEmpresa, limiteAdmin, ah(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'Id de registro inválido' });
  }
  const { responsable, observaciones, datos } = req.body;
  if (datos && JSON.stringify(datos).length > 32000) {
    return res.status(413).json({ ok: false, error: 'Los datos son demasiado grandes' });
  }
  if (observaciones && String(observaciones).length > 2000) {
    return res.status(413).json({ ok: false, error: 'Las observaciones son muy largas (máx 2000 caracteres)' });
  }

  const empresaId = req.session.empresa.id;
  const registro = await Registro.findOne({ _id: req.params.id, empresa_id: empresaId });
  if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
  const formato = getFormato(registro.formato);
  if (!registro.parcial || !formato || !formato.momentos) {
    return res.status(409).json({ ok: false, error: 'Este registro ya está completo' });
  }

  const config = await getConfigEmpresa(empresaId);
  if (!config.activos.includes(registro.formato) || !(config.carpetas[registro.carpeta] || []).includes(registro.formato)) {
    return res.status(403).json({ ok: false, error: 'Este formato no está disponible en esa carpeta' });
  }

  let nombreResponsable;
  if (registro.carpeta === 'administracion') {
    const adminNombre = adminCarpetaAdministracionActivo(req);
    if (!adminNombre) {
      return res.status(401).json({ ok: false, error: 'Se requiere acceso a la carpeta Administración para guardar este formato' });
    }
    nombreResponsable = adminNombre;
  } else {
    const limpio = (responsable || '').trim();
    if (!limpio) return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
    if (!REGEX_LETRAS.test(limpio)) return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });
    nombreResponsable = limpio;

    const { dia, mes, anio } = partesDeHoy();
    const esHoy = registro.dia === dia && registro.mes === mes && registro.anio === anio;
    if (!esHoy && !adminAtrasadoActivo(req, registro.carpeta)) {
      const v = await verificarPasswordAdmin(empresaId, req.body.password);
      if (v.error) {
        return res.status(v.status).json({ ok: false, error: v.error, requiereClaveAdmin: !!v.requiereClave });
      }
      if (!req.session.adminAtrasado || typeof req.session.adminAtrasado.ts === 'number') {
        req.session.adminAtrasado = {};
      }
      req.session.adminAtrasado[registro.carpeta] = { ts: Date.now() };
    }
  }

  // solo se aceptan los campos del momento que falta; lo que ya estaba guardado no se toca
  const faltan = faltantes(formato, registro);
  const permitidos = new Set();
  formato.momentos.filter(m => faltan.includes(m.n)).forEach(m => {
    m.campos.forEach(c => permitidos.add(c));
    permitidos.add('resultado' + m.n);
  });
  const nuevos = {};
  Object.keys(datos || {}).forEach(k => { if (permitidos.has(k)) nuevos[k] = datos[k]; });
  const mom = validarMomentos(formato, { ...(registro.datos || {}), ...nuevos }, false);
  if (mom.error) return res.status(400).json({ ok: false, error: mom.error });

  registro.datos = mom.datos;
  registro.parcial = false;
  faltan.forEach(n => registro.mediciones.push({ n, por: nombreResponsable, en: new Date() }));
  const obs = (observaciones || '').trim();
  if (obs) registro.observaciones = registro.observaciones ? `${registro.observaciones} · ${obs}` : obs;
  await registro.save();

  const excelError = await sincronizarDespuesDeGuardar(req, registro, config);
  const el = registro.elemento ? (config.elementos.find(e => String(e._id) === String(registro.elemento)) || { _id: registro.elemento }) : null;
  const info = await infoPendientes(empresaId, registro.formato, registro.carpeta, el);
  res.json({ ok: true, registro, info, excelError, googleSheetsError: null });
}));

// trae un registro puntual por su _id, para el modo "corregir" que se abre
// desde una novedad del reporte -- gateado por el mismo marcador que el
// reporte (adminReporte), asi no hay que volver a pedir la clave apenas se
// llega desde ahi
router.get('/registro/:id', requireEmpresa, ah(async (req, res) => {
  if (!adminReporteActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere contraseña de administrador para corregir un registro', requiereClaveAdmin: true });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'Id de registro inválido' });
  }
  const registro = await Registro.findOne({ _id: req.params.id, empresa_id: req.session.empresa.id }).lean();
  if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
  res.json({ ok: true, registro });
}));

// corrige un registro ya guardado (dia/mes/formato/carpeta no cambian, solo
// sus datos) -- sin bitacora de auditoria a proposito, solo se sobreescribe.
router.put('/:id', requireEmpresa, limiteAdmin, ah(async (req, res) => {
  if (!adminReporteActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere contraseña de administrador para corregir un registro', requiereClaveAdmin: true });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'Id de registro inválido' });
  }
  const { responsable, observaciones, datos } = req.body;
  if (datos && JSON.stringify(datos).length > 32000) {
    return res.status(413).json({ ok: false, error: 'Los datos son demasiado grandes' });
  }
  if (observaciones && String(observaciones).length > 2000) {
    return res.status(413).json({ ok: false, error: 'Las observaciones son muy largas (máx 2000 caracteres)' });
  }
  const limpio = (responsable || '').trim();
  if (!limpio) return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
  if (!REGEX_LETRAS.test(limpio)) return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });

  const registro = await Registro.findOne({ _id: req.params.id, empresa_id: req.session.empresa.id });
  if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });

  registro.responsable = limpio;
  registro.observaciones = (observaciones || '').trim();
  registro.datos = datos || {};
  // en un formato de varios momentos, el registro queda completo solo si ya tiene todos
  const formatoReg = getFormato(registro.formato);
  if (formatoReg && formatoReg.momentos) registro.parcial = faltantes(formatoReg, registro).length > 0;
  await registro.save();

  // mismo patron de sincronizacion que al guardar un dia nuevo: excel se
  // espera, google sheets corre de fondo (ver POST / mas arriba)
  let excelError = null;
  try {
    const config = await getConfigEmpresa(req.session.empresa.id);
    await sincronizarFormatoCarpeta(req.session.empresa.id, registro.formato, registro.carpeta, {
      config, empresaNombre: req.session.empresa.nombre
    });
  } catch (errSync) {
    logger.warn(`no se pudo escribir excel tras corregir: ${errSync.message}`);
    excelError = 'No se pudo actualizar el Excel: ' + errSync.message;
  }
  (async () => {
    try {
      const empresaDoc = await Empresa.findById(req.session.empresa.id).select('googleSheetId').lean();
      if (empresaDoc && empresaDoc.googleSheetId && googleSheets.estaDisponible()) {
        await googleSheets.sincronizarFormato(empresaDoc.googleSheetId, req.session.empresa.id, registro.formato, registro.carpeta);
      }
    } catch (errGS) {
      logger.warn(`no se sincronizo google sheets tras corregir: ${errGS.message}`);
    }
  })();

  // le doy al frontend la misma forma que un "dia ya completo" (registroHoy),
  // asi el mismo codigo de cada formato que ya sabe pintar/bloquear ese
  // estado funciona tal cual, sin tener que duplicar logica por formato
  res.json({
    ok: true,
    registro,
    info: {
      completoHoy: true, registroHoy: registro,
      mes: registro.mes, anio: registro.anio,
      pendientes: [], diasGuardados: [registro.dia], siguienteDia: null
    },
    excelError, googleSheetsError: null
  });
}));

router.get('/meses/:formatoId', requireEmpresa, ah(async (req, res) => {
  const { formatoId } = req.params;
  const carpeta = req.query.carpeta || 'cocina';
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const empresaId = new mongoose.Types.ObjectId(req.session.empresa.id);
  const agregados = await Registro.aggregate([
    { $match: { empresa_id: empresaId, formato: formatoId, carpeta, ...(mongoose.Types.ObjectId.isValid(req.query.elemento) ? { elemento: new mongoose.Types.ObjectId(req.query.elemento) } : {}) } },
    { $group: { _id: { anio: '$anio', mes: '$mes' }, count: { $sum: 1 } } },
    { $sort: { '_id.anio': -1, '_id.mes': -1 } }
  ]);
  const meses = agregados.map(m => ({ anio: m._id.anio, mes: m._id.mes, count: m.count }));
  res.json({ ok: true, meses });
}));

router.get('/historial/:formatoId', requireEmpresa, ah(async (req, res) => {
  const { formatoId } = req.params;
  const carpeta = req.query.carpeta || 'cocina';
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const habilitado = await empresaTieneFormato(req.session.empresa.id, formatoId);
  if (!habilitado) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }

  const hoy = partesDeHoy();
  const anio = parseInt(req.query.anio || hoy.anio, 10);
  const mes = parseInt(req.query.mes || hoy.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const esMesActual = (anio === hoy.anio && mes === hoy.mes);
  if (!esMesActual && !adminHistorialActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Requiere verificación de administrador para meses anteriores' });
  }

  const filtro = { empresa_id: req.session.empresa.id, formato: formatoId, carpeta, anio, mes };
  if (mongoose.Types.ObjectId.isValid(req.query.elemento)) filtro.elemento = req.query.elemento;
  const registros = await Registro.find(filtro).sort({ dia: 1 }).lean();

  res.json({ ok: true, anio, mes, esMesActual, registros });
}));

// Descarga el archivo Excel completo de la empresa (todas las hojas, todos los meses)
// Si el archivo no existe o está desactualizado, lo reconstruye desde la BD.
async function descargarExcel(req, res) {
  try {
    let { filePath, fileName } = await getRutaArchivoActual(req.session.empresa.id);

    if (!filePath || !fs.existsSync(filePath)) {
      const resultado = await reconstruirArchivoCompleto(req.session.empresa.id);
      if (!resultado.filePath || !fs.existsSync(resultado.filePath)) {
        return res.status(404).json({ ok: false, error: 'No hay registros guardados todavía' });
      }
      filePath = resultado.filePath;
      fileName = require('path').basename(filePath);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// reporte de seguimiento: cumplimiento por formato + novedades, agrupado por carpeta,
// para el rango de fechas que pida el administrador (por defecto, lo que va del mes)
router.get('/reporte', requireEmpresa, ah(async (req, res) => {
  if (!adminReporteActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere contraseña de administrador para generar el reporte', requiereClaveAdmin: true });
  }
  const parse = s => {
    const [a, m, d] = String(s || '').split('-').map(Number);
    return (a && m && d) ? new Date(a, m - 1, d) : null;
  };
  const desdeStr = req.query.desde;
  const desde = parse(desdeStr);
  let hasta = parse(req.query.hasta);
  if (!desde || !hasta) return res.status(400).json({ ok: false, error: 'Fechas inválidas' });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (hasta > hoy) hasta = hoy; // no se puede reportar el futuro
  if (desde > hasta) return res.status(400).json({ ok: false, error: 'El rango de fechas no es válido' });

  const diasTotales = Math.round((hasta - desde) / 86400000) + 1;
  const empresaId = req.session.empresa.id;
  const config = await getConfigEmpresa(empresaId);

  const bloques = [];
  let sumaRegistrados = 0, sumaTotales = 0, totalNovedades = 0;

  for (const clave of CARPETAS) {
    const formatoIds = config.carpetas[clave] || [];
    if (formatoIds.length === 0) continue;

    const formatos = [];
    for (const formatoId of formatoIds) {
      const diasRegistrados = await Registro.countDocuments({
        empresa_id: empresaId, formato: formatoId, carpeta: clave,
        fecha: { $gte: desde, $lte: hasta }
      });
      sumaRegistrados += diasRegistrados;
      sumaTotales += diasTotales;
      formatos.push({
        formatoId,
        nombre: (getFormato(formatoId) || {}).nombre || formatoId,
        diasRegistrados,
        diasTotales,
        cumplimiento: diasTotales > 0 ? Math.round((diasRegistrados / diasTotales) * 100) : 0
      });
    }

    const registrosConNovedad = await Registro.find({
      empresa_id: empresaId, carpeta: clave, fecha: { $gte: desde, $lte: hasta },
      observaciones: { $ne: '' }
    }).sort({ fecha: 1 }).lean();

    const novedades = registrosConNovedad
      .filter(r => formatoIds.includes(r.formato))
      .map(r => ({
        id: r._id,
        dia: r.dia, mes: r.mes, anio: r.anio,
        formatoId: r.formato,
        carpeta: clave,
        nombre: (getFormato(r.formato) || {}).nombre || r.formato,
        observaciones: r.observaciones,
        responsable: r.responsable
      }));

    // un "no cumple" de presentacion_personal tambien es una novedad, aunque
    // el registro del dia no tenga observaciones generales — una por persona
    if (formatoIds.includes('presentacion_personal')) {
      const registrosManipuladores = await Registro.find({
        empresa_id: empresaId, formato: 'presentacion_personal', carpeta: clave,
        fecha: { $gte: desde, $lte: hasta }
      }).sort({ fecha: 1 }).lean();

      registrosManipuladores.forEach(r => {
        const manipuladores = (r.datos && r.datos.manipuladores) || [];
        manipuladores.filter(m => !m.cumple).forEach(m => {
          novedades.push({
            id: r._id,
            dia: r.dia, mes: r.mes, anio: r.anio,
            formatoId: 'presentacion_personal',
            carpeta: clave,
            nombre: 'Presentación personal',
            observaciones: `${m.nombre} no cumplió: ${(m.criterios || []).join(', ')}`,
            responsable: r.responsable
          });
        });
      });
      novedades.sort((a, b) => new Date(a.anio, a.mes - 1, a.dia) - new Date(b.anio, b.mes - 1, b.dia));
    }

    totalNovedades += novedades.length;
    bloques.push({ clave, formatos, novedades });
  }

  res.json({
    ok: true,
    desde: desdeStr,
    hasta: hasta.toISOString().slice(0, 10),
    diasTotales,
    cumplimientoGeneral: sumaTotales > 0 ? Math.round((sumaRegistrados / sumaTotales) * 100) : 0,
    formatosActivos: config.activos.length,
    totalNovedades,
    carpetas: bloques
  });
}));

// datos reales (no solo % de cumplimiento) de todos los formatos activos de un
// mes, agrupados por carpeta -- para mostrarle a sanidad en una inspeccion.
// reusa columnasYFila, el mismo adaptador que ya arma las filas del Excel
async function armarDatosInspeccion(empresaId, anio, mes) {
  const config = await getConfigEmpresa(empresaId);
  const carpetas = [];

  for (const clave of CARPETAS) {
    const formatoIds = config.carpetas[clave] || [];
    if (formatoIds.length === 0) continue;

    const formatos = [];
    for (const formatoId of formatoIds) {
      const registros = await Registro.find({
        empresa_id: empresaId, formato: formatoId, carpeta: clave, anio, mes
      }).sort({ dia: 1 }).lean();
      if (registros.length === 0) continue; // sin datos ese mes, se omite

      const { columnas, fila, expandirFilas } = columnasYFila(formatoId);
      const filas = expandirFilas ? registros.flatMap(r => expandirFilas(r)) : registros.map(fila);
      const formato = getFormato(formatoId) || {};

      formatos.push({
        formatoId,
        nombre: formato.nombre || formatoId,
        titulo: formato.titulo || formato.nombre || formatoId,
        plan: formato.plan || '',
        programa: formato.programa || '',
        codigo: formato.codigo || '',
        columnas,
        filas
      });
    }
    if (formatos.length > 0) carpetas.push({ clave, nombre: NOMBRES_CARPETA[clave], formatos });
  }
  return carpetas;
}

router.get('/inspeccion', requireEmpresa, ah(async (req, res) => {
  if (!adminInspeccionActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere contraseña de administrador para ver los formatos de inspección', requiereClaveAdmin: true });
  }
  const anio = parseInt(req.query.anio, 10);
  const mes = parseInt(req.query.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const carpetas = await armarDatosInspeccion(req.session.empresa.id, anio, mes);
  res.json({ ok: true, anio, mes, empresaNombre: req.session.empresa.nombre, carpetas });
}));

router.post('/inspeccion/enviar', requireEmpresa, limiteAdmin, ah(async (req, res) => {
  if (!adminInspeccionActivo(req)) {
    return res.status(401).json({ ok: false, error: 'Se requiere contraseña de administrador', requiereClaveAdmin: true });
  }
  if (!correo.estaDisponible()) {
    return res.status(503).json({ ok: false, error: 'El envío de correo no está configurado todavía. Pídele al superadmin que configure el servidor de correo.' });
  }

  const anio = parseInt(req.body.anio, 10);
  const mes = parseInt(req.body.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }
  const destinatario = String(req.body.destinatario || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
    return res.status(400).json({ ok: false, error: 'El correo destinatario no es válido' });
  }

  const carpetas = await armarDatosInspeccion(req.session.empresa.id, anio, mes);
  if (carpetas.length === 0) {
    return res.status(404).json({ ok: false, error: 'No hay registros guardados en ese mes' });
  }

  try {
    await correo.enviarInspeccion(destinatario, {
      empresaNombre: req.session.empresa.nombre, anio, mes, carpetas
    });
    res.json({ ok: true });
  } catch (err) {
    logger.warn(`no se pudo enviar correo de inspeccion: ${err.message}`);
    res.status(500).json({ ok: false, error: 'No se pudo enviar el correo: ' + err.message });
  }
}));

router.get('/excel', requireEmpresa, descargarExcel);
// Endpoint legacy: mismo archivo, ignora año/mes (un solo archivo por empresa)
router.get('/excel/:anio/:mes', requireEmpresa, descargarExcel);

module.exports = router;
module.exports.infoPendientes = infoPendientes;
