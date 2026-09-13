// mantiene el saldo persistente de horas extra al dia. se llama cada vez que
// se pide el saldo de un empleado (no hay cron en el proyecto) y "se pone al
// dia" procesando cualquier semana cerrada que todavia no se haya aplicado.
const Asistencia = require('../models/Asistencia');
const Empresa = require('../models/Empresa');
const SaldoHorasExtra = require('../models/SaldoHorasExtra');
const {
  calcularSemanas, clasificarExtraSemana, clasificarDeficitSemana, JORNADA_SEMANAL
} = require('./horasExtra');

const CAMPOS = ['diurnas', 'dominicales', 'nocturnas', 'dominicalesNocturnas'];

async function actualizarSaldo(empresaId, empleadoId, jornadaEsperada) {
  let saldo = await SaldoHorasExtra.findOne({ empresa_id: empresaId, empleado_id: empleadoId });
  if (!saldo) saldo = new SaldoHorasExtra({ empresa_id: empresaId, empleado_id: empleadoId });

  const jornada = jornadaEsperada || (await Empresa.findById(empresaId)).jornadaEsperada;

  const filtro = { empresa_id: empresaId, empleado_id: empleadoId };
  if (saldo.ultimaSemanaProcesada) {
    // el lunes siguiente a la ultima semana ya procesada
    const desde = new Date(saldo.ultimaSemanaProcesada);
    desde.setDate(desde.getDate() + 7);
    filtro.fecha = { $gte: desde };
  }
  const registros = await Asistencia.find(filtro).lean();

  const hoyMedianoche = new Date();
  hoyMedianoche.setHours(0, 0, 0, 0);
  const semanas = calcularSemanas(registros).filter(s => s.domingo < hoyMedianoche);

  semanas.forEach(sem => {
    const total = Math.round(
      sem.dias.reduce((s, d) => s + (d.registro.horasTrabajadas || 0), 0) * 100
    ) / 100;

    if (total > JORNADA_SEMANAL) {
      const mov = clasificarExtraSemana(sem.dias);
      CAMPOS.forEach(c => { saldo[c] += mov[c]; });
    } else if (total < JORNADA_SEMANAL) {
      // ojo: si mas adelante se corrige una salida de una semana ya procesada, o
      // cambia la jornada esperada, esto no se recalcula retroactivamente
      const mov = clasificarDeficitSemana(sem.dias.map(d => d.registro), jornada);
      CAMPOS.forEach(c => { saldo[c] = Math.max(0, saldo[c] - mov[c]); });
    }
    saldo.ultimaSemanaProcesada = sem.lunes;
  });
  CAMPOS.forEach(c => { saldo[c] = Math.round(saldo[c] * 100) / 100; });

  if (semanas.length === 0) return saldo;

  try {
    await saldo.save();
  } catch (err) {
    // dos requests casi simultaneas creando el saldo por primera vez
    if (err.code === 11000) return SaldoHorasExtra.findOne({ empresa_id: empresaId, empleado_id: empleadoId });
    throw err;
  }
  return saldo;
}

module.exports = { actualizarSaldo };
