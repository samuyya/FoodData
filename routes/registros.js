const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');
const bcrypt = require('bcryptjs');
const { FORMATOS, getFormato } = require('../formatos');
const { getConfigEmpresa } = require('../empresaConfig');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');
const { adminCarpetaAdministracionActivo, adminHistorialActivo, adminAtrasadoActivo } = require('./admin');
const { sincronizarFormatoCarpeta, reconstruirArchivoCompleto, getRutaArchivoActual } = require('../servicios/excel');
const googleSheets = require('../servicios/googleSheets');

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

async function infoPendientes(empresaId, formatoId, carpeta) {
  const { dia, mes, anio } = partesDeHoy();
  const guardados = await Registro.find({
    empresa_id: empresaId,
    formato: formatoId,
    carpeta,
    anio, mes,
    dia: { $lte: dia }
  }).sort({ dia: 1 }).lean();

  const set = new Set(guardados.map(g => g.dia));
  const pendientes = [];
  for (let d = 1; d <= dia; d++) {
    if (!set.has(d)) pendientes.push(d);
  }
  const siguienteDia = pendientes.length > 0 ? pendientes[0] : null;
  const registroHoy = guardados.find(g => g.dia === dia) || null;

  return {
    diaActual: dia,
    mes, anio,
    pendientes,
    diasGuardados: guardados.map(g => g.dia),
    siguienteDia,
    completoHoy: pendientes.length === 0,
    registroHoy,
    registrosMes: guardados
  };
}

// suma de dias pendientes a lo largo de todos los formatos activos de la empresa
// para el mes en curso. lo uso en el menu principal para mostrar el badge rojo.
router.get('/resumen-pendientes', requireEmpresa, ah(async (req, res) => {
  const empresaId = req.session.empresa.id;
  const config = await getConfigEmpresa(empresaId);
  const { mes, anio } = partesDeHoy();

  // cada (formato, carpeta) cuenta como una instancia independiente, incluso si son compartidos
  const instancias = new Set();
  for (const carpeta of ['cocina', 'salon', 'administracion']) {
    for (const formatoId of (config.carpetas[carpeta] || [])) {
      if (formatoId === 'presentacion_personal') continue;
      instancias.add(`${formatoId}|${carpeta}`);
    }
  }

  let totalDiasPendientes = 0;
  let formatosConPendientes = 0;

  // reuso infoPendientes (la misma logica de dias faltantes que usa cada formato)
  // en vez de recalcular el conteo aparte, asi no se pueden desincronizar
  for (const key of instancias) {
    const [formatoId, carpeta] = key.split('|');
    const info = await infoPendientes(empresaId, formatoId, carpeta);
    if (info.pendientes.length > 0) {
      formatosConPendientes++;
      totalDiasPendientes += info.pendientes.length;
    }
  }

  res.json({
    ok: true,
    totalDiasPendientes,
    formatosConPendientes,
    totalFormatos: instancias.size,
    mes, anio
  });
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
  const info = await infoPendientes(req.session.empresa.id, formatoId, carpeta);
  const config = await getConfigEmpresa(req.session.empresa.id);

  const esCarpetaAdmin = carpeta === 'administracion' && config.carpetas.administracion.includes(formatoId);
  const hayAtrasados = !info.completoHoy && info.siguienteDia !== info.diaActual;
  const requiereAdminAtrasado = hayAtrasados && !esCarpetaAdmin && !adminAtrasadoActivo(req, carpeta);

  res.json({ ok: true, ...info, requiereAdminAtrasado, esCarpetaAdmin });
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
    dia, mes, anio
  }).lean();
  res.json({ ok: true, registro });
}));

router.post('/', requireEmpresa, limiteAdmin, async (req, res) => {
  try {
    const { formatoId, carpeta, responsable, observaciones, datos } = req.body;
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

    const info = await infoPendientes(req.session.empresa.id, formatoId, carpeta);
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
      responsable: nombreResponsable,
      observaciones: (observaciones || '').trim(),
      datos: datos || {}
    });

    let excelError = null;
    try {
      await sincronizarFormatoCarpeta(req.session.empresa.id, formatoId, carpeta);
    } catch (errSync) {
      console.log('no se pudo escribir excel:', errSync.message);
      // EBUSY o EPERM => archivo abierto en Excel desktop (Windows lo bloquea)
      if (errSync.code === 'EBUSY' || errSync.code === 'EPERM' || /resource busy|permission denied|access is denied/i.test(errSync.message)) {
        excelError = 'El archivo Excel está abierto en tu computador y no se pudo actualizar. Ciérralo y vuelve a guardar (o descárgalo nuevamente desde la app).';
      } else {
        excelError = 'No se pudo actualizar el Excel: ' + errSync.message;
      }
    }

    let googleSheetsError = null;
    try {
      const empresaDoc = await Empresa.findById(req.session.empresa.id).select('googleSheetId').lean();
      if (!empresaDoc || !empresaDoc.googleSheetId) {
        googleSheetsError = 'Esta empresa no tiene una hoja de Google Sheets vinculada. Pídele al superadmin que la configure.';
      } else if (!googleSheets.estaDisponible()) {
        googleSheetsError = 'El servidor no tiene configuradas las credenciales de Google Sheets.';
      } else {
        await googleSheets.sincronizarFormato(empresaDoc.googleSheetId, req.session.empresa.id, formatoId, carpeta);
      }
    } catch (errGS) {
      console.log('no se sincronizo google sheets:', errGS.message);
      const msg = String(errGS.message || '');
      if (/permission|403/i.test(msg)) {
        googleSheetsError = `La cuenta de servicio no tiene permiso para editar esta hoja. Compártela como Editor con: ${googleSheets.getCuentaServicio()}`;
      } else if (/not found|404/i.test(msg)) {
        googleSheetsError = 'El ID de la hoja de Google Sheets no existe o se borró.';
      } else {
        googleSheetsError = 'Google Sheets no se pudo actualizar: ' + msg;
      }
    }

    const infoNuevo = await infoPendientes(req.session.empresa.id, formatoId, carpeta);
    res.status(201).json({ ok: true, registro, info: infoNuevo, excelError, googleSheetsError });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro para ese día' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/meses/:formatoId', requireEmpresa, ah(async (req, res) => {
  const { formatoId } = req.params;
  const carpeta = req.query.carpeta || 'cocina';
  if (!getFormato(formatoId)) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const empresaId = new mongoose.Types.ObjectId(req.session.empresa.id);
  const agregados = await Registro.aggregate([
    { $match: { empresa_id: empresaId, formato: formatoId, carpeta } },
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

  const registros = await Registro.find({
    empresa_id: req.session.empresa.id,
    formato: formatoId,
    carpeta,
    anio, mes
  }).sort({ dia: 1 }).lean();

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

router.get('/excel', requireEmpresa, descargarExcel);
// Endpoint legacy: mismo archivo, ignora año/mes (un solo archivo por empresa)
router.get('/excel/:anio/:mes', requireEmpresa, descargarExcel);

module.exports = router;
