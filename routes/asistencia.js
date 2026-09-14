const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Asistencia = require('../models/Asistencia');
const EmpleadoLista = require('../models/EmpleadoLista');
const Administrador = require('../models/Administrador');
const { requireEmpresa, ah } = require('../middleware/sesion');
const { limiteAdmin } = require('../middleware/limites');
const { guardarFotoAsistencia, obtenerFotoAsistencia, borrarFotoAsistencia } = require('../servicios/almacenamiento');
const { generarExcelAsistencia } = require('../servicios/excel');
const { calcularSemanas, lunesDeSemana, clasificarExtraSemana, clasificarDeficitSemana } = require('../servicios/horasExtra');
const { actualizarSaldo } = require('../servicios/saldoHorasExtra');
const Empresa = require('../models/Empresa');

const router = express.Router();

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function etiquetaSemana(lunes, domingo) {
  const opts = { day: '2-digit', month: 'short' };
  return `${lunes.toLocaleDateString('es-CO', opts)} – ${domingo.toLocaleDateString('es-CO', opts)}`;
}

// nota que aparece cuando una semana cruza de mes, explicando como se repartieron
// las horas extra entre los dos meses (cada dia ya sabe a cual mes pertenece)
function notaCorte(diasDelMes, diasOtroMes) {
  const conExtra = arr => arr.filter(d => d.horasExtra > 0);
  const esteLado = conExtra(diasDelMes);
  const otroLado = conExtra(diasOtroMes);
  if (otroLado.length === 0) return null;

  const listar = arr => arr.map(d => `${DIAS_CORTOS[new Date(d.r.fecha).getDay()]} ${d.r.dia}`).join(' y ');
  const sumar = arr => Math.round(arr.reduce((s, d) => s + d.horasExtra, 0) * 100) / 100;

  return `${listar(esteLado)} (${sumar(esteLado)} h extra) quedan en ${MESES_LARGOS[diasDelMes[0].r.mes - 1]}. ` +
    `${listar(otroLado)} (${sumar(otroLado)} h extra) pasan a ${MESES_LARGOS[diasOtroMes[0].r.mes - 1]}.`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const extOk = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    const mimeOk = (file.mimetype || '').toLowerCase().startsWith('image/');
    cb(null, extOk && mimeOk);
  }
});

function hoyPartes() {
  const ahora = new Date();
  const dia = ahora.getDate();
  const mes = ahora.getMonth() + 1;
  const anio = ahora.getFullYear();
  return { dia, mes, anio, fecha: new Date(anio, mes - 1, dia) };
}

router.get('/empleados', requireEmpresa, ah(async (req, res) => {
  const empleados = await EmpleadoLista
    .find({ empresa_id: req.session.empresa.id })
    .sort({ nombre: 1 })
    .select('nombre')
    .lean();
  res.json({ ok: true, empleados });
}));

router.get('/estado/:empleadoId', requireEmpresa, ah(async (req, res) => {
  const { dia, mes, anio } = hoyPartes();
  const registro = await Asistencia.findOne({
    empresa_id: req.session.empresa.id,
    empleado_id: req.params.empleadoId,
    dia, mes, anio
  }).lean();

  let estado = 'sin_marcar';
  if (registro && registro.horaIngreso && registro.horaSalida) estado = 'completo';
  else if (registro && registro.horaIngreso) estado = 'solo_ingreso';

  res.json({ ok: true, estado, registro: registro || null });
}));

router.post('/marcar', requireEmpresa, upload.single('foto'), async (req, res) => {
  try {
    const { empleadoId } = req.body;
    if (!empleadoId) {
      return res.status(400).json({ ok: false, error: 'Falta seleccionar el empleado' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'Falta la foto de evidencia' });
    }

    const empleado = await EmpleadoLista.findOne({
      _id: empleadoId,
      empresa_id: req.session.empresa.id
    });
    if (!empleado) {
      return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });
    }

    const { dia, mes, anio, fecha } = hoyPartes();
    const ahora = new Date();
    let registro = await Asistencia.findOne({
      empresa_id: req.session.empresa.id,
      empleado_id: empleadoId,
      dia, mes, anio
    });

    if (!registro) {
      const nombreArchivo = `${empleadoId}-${dia}-ingreso-${Date.now()}.jpg`;
      const refFoto = await guardarFotoAsistencia(req.session.empresa.id, anio, mes, nombreArchivo, req.file.buffer);
      registro = await Asistencia.create({
        empresa_id: req.session.empresa.id,
        empleado_id: empleadoId,
        empleadoNombre: empleado.nombre,
        fecha, dia, mes, anio,
        horaIngreso: ahora,
        fotoIngreso: refFoto
      });
      return res.status(201).json({ ok: true, tipo: 'ingreso', hora: ahora, registro });
    }

    if (!registro.horaSalida) {
      const nombreArchivo = `${empleadoId}-${dia}-salida-${Date.now()}.jpg`;
      const refFoto = await guardarFotoAsistencia(req.session.empresa.id, anio, mes, nombreArchivo, req.file.buffer);
      const horasTrabajadas = Math.round(((ahora - registro.horaIngreso) / 3600000) * 100) / 100;

      // update atomico con horaSalida:null en el filtro — si dos requests llegan casi
      // juntas, solo la primera hace match y la segunda cae al 409 de abajo
      const actualizado = await Asistencia.findOneAndUpdate(
        { _id: registro._id, horaSalida: null },
        { horaSalida: ahora, fotoSalida: refFoto, horasTrabajadas },
        { new: true }
      );
      if (!actualizado) {
        await borrarFotoAsistencia(refFoto);
        return res.status(409).json({ ok: false, error: 'Este empleado ya registró entrada y salida hoy' });
      }
      return res.json({ ok: true, tipo: 'salida', hora: ahora, registro: actualizado });
    }

    return res.status(409).json({ ok: false, error: 'Este empleado ya registró entrada y salida hoy' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un registro de asistencia para hoy' });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/meses', requireEmpresa, ah(async (req, res) => {
  const empresaId = new mongoose.Types.ObjectId(req.session.empresa.id);
  const agregados = await Asistencia.aggregate([
    { $match: { empresa_id: empresaId } },
    { $group: { _id: { anio: '$anio', mes: '$mes' }, count: { $sum: 1 } } },
    { $sort: { '_id.anio': -1, '_id.mes': -1 } }
  ]);
  const meses = agregados.map(m => ({ anio: m._id.anio, mes: m._id.mes, count: m.count }));
  res.json({ ok: true, meses });
}));

// resumen de todos los empleados para el panel de arriba: horas del mes + saldo
// de horas extra (el detalle dia a dia sigue viviendo en /registro/:empleadoId)
router.get('/resumen-empleados', requireEmpresa, ah(async (req, res) => {
  const hoy = hoyPartes();
  const anio = parseInt(req.query.anio || hoy.anio, 10);
  const mes = parseInt(req.query.mes || hoy.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const empresaId = req.session.empresa.id;
  const empleados = await EmpleadoLista.find({ empresa_id: empresaId }).sort({ nombre: 1 }).lean();

  const agregado = await Asistencia.aggregate([
    { $match: { empresa_id: new mongoose.Types.ObjectId(empresaId), anio, mes } },
    { $group: { _id: '$empleado_id', total: { $sum: '$horasTrabajadas' } } }
  ]);
  const totales = new Map(agregado.map(a => [String(a._id), a.total]));

  const empresa = await Empresa.findById(empresaId);
  const jornada = empresa.jornadaEsperada;

  const resumen = await Promise.all(empleados.map(async emp => {
    const saldo = await actualizarSaldo(empresaId, emp._id, jornada);
    return {
      empleadoId: emp._id,
      nombre: emp.nombre,
      totalHorasMes: Math.round((totales.get(String(emp._id)) || 0) * 100) / 100,
      saldoTotal: Math.round((saldo.diurnas + saldo.dominicales + saldo.nocturnas + saldo.dominicalesNocturnas) * 100) / 100
    };
  }));

  res.json({ ok: true, anio, mes, empleados: resumen });
}));

router.get('/registro/:empleadoId', requireEmpresa, ah(async (req, res) => {
  const hoy = hoyPartes();
  const anio = parseInt(req.query.anio || hoy.anio, 10);
  const mes = parseInt(req.query.mes || hoy.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }

  const empleado = await EmpleadoLista.findOne({
    _id: req.params.empleadoId,
    empresa_id: req.session.empresa.id
  }).lean();
  if (!empleado) return res.status(404).json({ ok: false, error: 'Empleado no encontrado' });

  const empresa = await Empresa.findById(req.session.empresa.id);
  const jornada = empresa.jornadaEsperada;
  const saldo = await actualizarSaldo(req.session.empresa.id, req.params.empleadoId, jornada);
  const bancoHoras = {
    diurnas: saldo.diurnas, dominicales: saldo.dominicales,
    nocturnas: saldo.nocturnas, dominicalesNocturnas: saldo.dominicalesNocturnas,
    total: Math.round((saldo.diurnas + saldo.dominicales + saldo.nocturnas + saldo.dominicalesNocturnas) * 100) / 100
  };

  // traigo tambien las semanas vecinas (pueden caer en el mes anterior/siguiente)
  // para poder calcular bien el umbral de 42h/semana de las semanas que cruzan de mes
  const primerDia = new Date(anio, mes - 1, 1);
  const ultimoDia = new Date(anio, mes, 0);
  const desde = lunesDeSemana(primerDia);
  const hasta = lunesDeSemana(ultimoDia);
  hasta.setDate(hasta.getDate() + 6);

  const registrosRango = await Asistencia.find({
    empresa_id: req.session.empresa.id,
    empleado_id: req.params.empleadoId,
    fecha: { $gte: desde, $lte: hasta }
  }).sort({ fecha: 1 }).lean();

  const registros = registrosRango.filter(r => r.anio === anio && r.mes === mes);

  let totalHoras = 0;
  const dias = registros.map(r => {
    const completo = !!(r.horaIngreso && r.horaSalida);
    if (completo) totalHoras += r.horasTrabajadas || 0;
    return {
      registroId: r._id,
      dia: r.dia,
      horaIngreso: r.horaIngreso,
      horaSalida: r.horaSalida,
      horasTrabajadas: r.horasTrabajadas || 0,
      fotoIngreso: r.fotoIngreso || '',
      fotoSalida: r.fotoSalida || '',
      completo
    };
  });

  // horas extra: solo semanas ya cerradas (el domingo ya paso) — la semana en curso
  // se calcula y se muestra a partir del lunes siguiente, no antes
  const hoyMedianoche = new Date();
  hoyMedianoche.setHours(0, 0, 0, 0);
  const semanasCerradas = calcularSemanas(registrosRango).filter(s => s.domingo < hoyMedianoche);

  let totalExtraMes = 0;
  const semanas = [];

  semanasCerradas.forEach(sem => {
    const diasDelMes = [], diasOtroMes = [];
    sem.dias.forEach(({ registro: r, horasExtra }) => {
      const esEsteMes = r.anio === anio && r.mes === mes;
      (esEsteMes ? diasDelMes : diasOtroMes).push({ r, horasExtra });
    });
    if (diasDelMes.length === 0) return;

    // el tipo de semana (sumo o resto) se decide con el total REAL de la semana
    // completa, no solo de los dias que caen en este mes
    const totalSemanaReal = Math.round(
      sem.dias.reduce((s, d) => s + (d.registro.horasTrabajadas || 0), 0) * 100
    ) / 100;

    let tipo = 'neutro';
    let mov = { diurnas: 0, dominicales: 0, nocturnas: 0, dominicalesNocturnas: 0 };
    if (totalSemanaReal > 42) {
      tipo = 'suma';
      mov = clasificarExtraSemana(diasDelMes.map(d => ({ registro: d.r, horasExtra: d.horasExtra })));
    } else if (totalSemanaReal < 42) {
      tipo = 'resta';
      mov = clasificarDeficitSemana(diasDelMes.map(d => d.r), jornada);
    }

    const totalMovimiento = Math.round((mov.diurnas + mov.dominicales + mov.nocturnas + mov.dominicalesNocturnas) * 100) / 100;
    if (tipo === 'neutro' || totalMovimiento === 0) return;

    if (tipo === 'suma') totalExtraMes += totalMovimiento;

    semanas.push({
      etiqueta: etiquetaSemana(sem.lunes, sem.domingo),
      tipo,
      totalSemana: totalMovimiento,
      diurnas: Math.round(mov.diurnas * 100) / 100,
      dominicales: Math.round(mov.dominicales * 100) / 100,
      nocturnas: Math.round(mov.nocturnas * 100) / 100,
      dominicalesNocturnas: Math.round(mov.dominicalesNocturnas * 100) / 100,
      corte: diasOtroMes.length ? notaCorte(diasDelMes, diasOtroMes) : null,
      notaResta: tipo === 'resta'
        ? `Esta semana se trabajaron menos horas de las esperadas; se descontaron ${totalMovimiento} h del banco de horas extra.`
        : null
    });
  });

  res.json({
    ok: true,
    empleado: { id: empleado._id, nombre: empleado.nombre },
    anio, mes,
    dias,
    totalHoras: Math.round(totalHoras * 100) / 100,
    horasExtra: { total: Math.round(totalExtraMes * 100) / 100, semanas },
    bancoHoras
  });
}));

router.get('/foto', requireEmpresa, ah(async (req, res) => {
  const ref = req.query.ref;
  if (!ref || typeof ref !== 'string' || ref.includes('..')) {
    return res.status(400).json({ ok: false, error: 'Referencia inválida' });
  }
  if (!ref.startsWith(req.session.empresa.id + '/')) {
    return res.status(403).json({ ok: false, error: 'Sin acceso a esta foto' });
  }
  const buffer = await obtenerFotoAsistencia(ref);
  if (!buffer) {
    return res.status(404).json({ ok: false, error: 'Foto no encontrada' });
  }
  res.set('Content-Type', 'image/jpeg');
  res.send(buffer);
}));

router.post('/corregir-salida', limiteAdmin, requireEmpresa, ah(async (req, res) => {
  const { registroId, hora, password } = req.body;
  if (!registroId || !hora || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan datos (registro, hora o contraseña)' });
  }
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hora).trim());
  if (!m) {
    return res.status(400).json({ ok: false, error: 'Hora inválida. Usa el formato HH:MM (ej. 17:30)' });
  }

  const admins = await Administrador.find({ empresa_id: req.session.empresa.id });
  if (admins.length === 0) {
    return res.status(404).json({ ok: false, error: 'Esta empresa aún no tiene administrador asignado' });
  }
  let adminOk = false;
  for (const a of admins) {
    if (await bcrypt.compare(password, a.passwordHash)) { adminOk = true; break; }
  }
  if (!adminOk) {
    return res.status(401).json({ ok: false, error: 'Contraseña de administrador incorrecta' });
  }

  const registro = await Asistencia.findOne({
    _id: registroId,
    empresa_id: req.session.empresa.id
  });
  if (!registro) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
  if (!registro.horaIngreso) {
    return res.status(400).json({ ok: false, error: 'Este registro no tiene hora de ingreso' });
  }
  if (registro.horaSalida) {
    return res.status(409).json({ ok: false, error: 'Este día ya tiene hora de salida' });
  }

  const salida = new Date(registro.anio, registro.mes - 1, registro.dia, parseInt(m[1], 10), parseInt(m[2], 10));
  if (salida <= registro.horaIngreso) {
    return res.status(400).json({ ok: false, error: 'La hora de salida debe ser posterior a la de ingreso' });
  }
  registro.horaSalida = salida;
  registro.horasTrabajadas = Math.round(((salida - registro.horaIngreso) / 3600000) * 100) / 100;
  await registro.save();

  res.json({ ok: true, registro });
}));

router.get('/excel/:anio/:mes', requireEmpresa, async (req, res) => {
  const anio = parseInt(req.params.anio, 10);
  const mes = parseInt(req.params.mes, 10);
  if (isNaN(anio) || isNaN(mes) || mes < 1 || mes > 12) {
    return res.status(400).json({ ok: false, error: 'Mes o año inválidos' });
  }
  try {
    const buffer = await generarExcelAsistencia(req.session.empresa.id, anio, mes);
    if (!buffer) {
      return res.status(404).json({ ok: false, error: 'No hay registros de asistencia para ese mes' });
    }
    const nombre = `asistencia_${anio}-${String(mes).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
