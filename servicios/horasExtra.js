// calculo de horas extra semanales (jornada legal colombiana de 42h/semana).
// esto NO es un calculo de nomina oficial, es un dato de referencia para el
// dueño del restaurante — por eso las simplificaciones abajo son a proposito.
const { esFestivo } = require('../festivos');

const JORNADA_SEMANAL = 42;

function lunesDeSemana(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dow = d.getDay(); // 0=domingo..6=sabado
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

function esDomingoOFestivo(anio, mes, dia) {
  return new Date(anio, mes - 1, dia).getDay() === 0 || esFestivo(anio, mes, dia);
}

// reparte [inicioExtra, finExtra) en minutos diurnos (6am-7pm) y nocturnos (7pm-6am),
// avanzando dia calendario por dia calendario (Date normaliza el rollover de mes/anio solo)
function clasificarDiurnoNocturno(inicioExtra, finExtra) {
  let diurnoMin = 0, nocturnoMin = 0;
  let cursor = new Date(inicioExtra);
  while (cursor < finExtra) {
    const seis = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 6, 0, 0);
    const diecinueve = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), 19, 0, 0);
    let limite, esDiurno;
    if (cursor < seis) {
      limite = seis; esDiurno = false;
    } else if (cursor < diecinueve) {
      limite = diecinueve; esDiurno = true;
    } else {
      limite = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 0, 0, 0);
      esDiurno = false;
    }
    const fin = limite < finExtra ? limite : finExtra;
    const minutos = (fin - cursor) / 60000;
    if (esDiurno) diurnoMin += minutos; else nocturnoMin += minutos;
    cursor = fin;
  }
  return { diurno: diurnoMin / 60, nocturno: nocturnoMin / 60 };
}

// registros: docs de Asistencia (con fecha, horaIngreso, horaSalida, horasTrabajadas,
// dia, mes, anio) en cualquier orden, pueden cruzar mas de un mes. agrupa por semana
// (lunes de esa semana) y marca cuantas horas de cada dia son "extra": el acumulado
// de la semana se revisa dia por dia en orden, y en cuanto cruza 42 el excedente de
// ESE dia es lo que cuenta como extra (los dias anteriores no, aunque hayan sido largos).
function calcularSemanas(registros) {
  const porSemana = new Map();
  registros.forEach(r => {
    if (!r.horaIngreso || !r.horaSalida) return; // turno abierto no aporta, igual que totalHoras hoy
    const lunes = lunesDeSemana(new Date(r.fecha));
    const key = lunes.getTime();
    if (!porSemana.has(key)) porSemana.set(key, { lunes, dias: [] });
    porSemana.get(key).dias.push(r);
  });

  const semanas = [];
  porSemana.forEach(({ lunes, dias }) => {
    dias.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    let acumulado = 0;
    const conExtra = dias.map(r => {
      const previo = acumulado;
      acumulado += r.horasTrabajadas || 0;
      const extra = acumulado > JORNADA_SEMANAL ? acumulado - Math.max(previo, JORNADA_SEMANAL) : 0;
      return { registro: r, horasExtra: Math.round(extra * 100) / 100 };
    });
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);
    semanas.push({ lunes, domingo, dias: conExtra });
  });
  return semanas.sort((a, b) => a.lunes - b.lunes);
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// dias: [{registro, horasExtra}] de calcularSemanas, ya filtrados al mes que se este pidiendo.
// clasifica el excedente de la semana (>42h) en las 4 categorias.
function clasificarExtraSemana(dias) {
  let diurnas = 0, dominicales = 0, nocturnas = 0, dominicalesNocturnas = 0;
  dias.forEach(({ registro: r, horasExtra }) => {
    if (horasExtra <= 0) return;
    const finExtra = r.horaSalida;
    const inicioExtra = new Date(finExtra.getTime() - horasExtra * 3600000);
    const { diurno, nocturno } = clasificarDiurnoNocturno(inicioExtra, finExtra);
    if (esDomingoOFestivo(r.anio, r.mes, r.dia)) { dominicales += diurno; dominicalesNocturnas += nocturno; }
    else { diurnas += diurno; nocturnas += nocturno; }
  });
  return { diurnas, dominicales, nocturnas, dominicalesNocturnas };
}

// registros: docs de Asistencia (con fecha/horaIngreso/horaSalida/horasTrabajadas), ya
// filtrados al mes que se este pidiendo. jornada: objeto {lunes, martes, ...} en horas.
// clasifica el faltante de cada dia (jornada esperada - horas trabajadas) contando desde
// el final del turno real hasta cuando habria salido si completaba la jornada esperada.
function clasificarDeficitSemana(registros, jornada) {
  let diurnas = 0, dominicales = 0, nocturnas = 0, dominicalesNocturnas = 0;
  registros.forEach(r => {
    const esperadas = jornada[DIAS_SEMANA[new Date(r.fecha).getDay()]];
    const deficit = Math.max(0, esperadas - (r.horasTrabajadas || 0));
    if (deficit <= 0) return;
    const finVentana = new Date(r.horaIngreso.getTime() + esperadas * 3600000);
    const { diurno, nocturno } = clasificarDiurnoNocturno(r.horaSalida, finVentana);
    if (esDomingoOFestivo(r.anio, r.mes, r.dia)) { dominicales += diurno; dominicalesNocturnas += nocturno; }
    else { diurnas += diurno; nocturnas += nocturno; }
  });
  return { diurnas, dominicales, nocturnas, dominicalesNocturnas };
}

module.exports = {
  calcularSemanas, clasificarDiurnoNocturno, esDomingoOFestivo, lunesDeSemana,
  clasificarExtraSemana, clasificarDeficitSemana, JORNADA_SEMANAL
};
