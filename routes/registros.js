const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');
const bcrypt = require('bcryptjs');
const { FORMATOS, getFormato } = require('../formatos');
const { getConfigEmpresa } = require('../empresaConfig');
const { requireEmpresa } = require('../middleware/sesion');
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

router.get('/pendientes/:formatoId', requireEmpresa, async (req, res) => {
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
  const info = await infoPendientes(req.session.empresa.id, formatoId, carpeta);

  // Determinar si se debe pedir contraseña de administrador al entrar al formato
  // - Solo si hay días atrasados (siguienteDia distinto de hoy) y aún no se completó hoy
  // - Y si el formato NO está en la carpeta Administración (esa ya pide contraseña al entrar)
  // - Y si no hay sesión activa de adminAtrasado
  const { carpetas } = await getConfigEmpresa(req.session.empresa.id);
  const esCarpetaAdmin = carpeta === 'administracion' && carpetas.administracion.includes(formatoId);
  const hayAtrasados = !info.completoHoy && info.siguienteDia !== info.diaActual;
  const requiereAdminAtrasado = hayAtrasados && !esCarpetaAdmin && !adminAtrasadoActivo(req);

  res.json({ ok: true, ...info, requiereAdminAtrasado, esCarpetaAdmin });
});

router.get('/hoy/:formatoId', requireEmpresa, async (req, res) => {
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
});

router.post('/', requireEmpresa, async (req, res) => {
  try {
    const { formatoId, carpeta, responsable, observaciones, datos } = req.body;
    const formato = getFormato(formatoId);
    if (!formato) return res.status(400).json({ ok: false, error: 'Formato no válido' });
    if (!carpeta || !Registro.CARPETAS_VALIDAS.includes(carpeta)) {
      return res.status(400).json({ ok: false, error: 'Carpeta no válida' });
    }

    const { activos, carpetas } = await getConfigEmpresa(req.session.empresa.id);
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
    const esCarpetaAdmin  = carpetas.administracion.includes(formatoId);
    const tieneOtraCarpeta= carpetas.cocina.includes(formatoId) || carpetas.salon.includes(formatoId);
    const adminNombre     = adminCarpetaAdministracionActivo(req);

    if (esCarpetaAdmin && adminNombre) {
      // El admin tiene sesión activa: registra con su nombre
      nombreResponsable = adminNombre;
    } else if (esCarpetaAdmin && !tieneOtraCarpeta) {
      // Solo existe en Administración y no hay sesión de admin: denegar
      return res.status(401).json({ ok: false, error: 'Se requiere acceso a la carpeta Administración para guardar este formato' });
    } else {
      const limpio = (responsable || '').trim();
      if (!limpio) return res.status(400).json({ ok: false, error: 'El responsable es obligatorio' });
      if (!REGEX_LETRAS.test(limpio)) return res.status(400).json({ ok: false, error: 'El responsable solo puede contener letras y espacios' });
      nombreResponsable = limpio;

      if (info.siguienteDia !== info.diaActual) {
        const TTL = 8 * 60 * 60 * 1000;
        const marca = req.session.adminAtrasado;
        const yaVerificado = marca && (Date.now() - marca.ts <= TTL);
        if (!yaVerificado) {
          const v = await verificarPasswordAdmin(req.session.empresa.id, req.body.password);
          if (v.error) {
            return res.status(v.status).json({ ok: false, error: v.error, requiereClaveAdmin: !!v.requiereClave });
          }
          req.session.adminAtrasado = { ts: Date.now() };
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

router.get('/meses/:formatoId', requireEmpresa, async (req, res) => {
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
});

router.get('/historial/:formatoId', requireEmpresa, async (req, res) => {
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
});

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
