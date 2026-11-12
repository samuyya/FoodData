// fechas siempre con la hora de Colombia, aunque el servidor corra en UTC
const formato = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });

function hoyColombia(fecha = new Date()) {
  return formato.format(fecha);
}

function esFechaValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(texto + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

// medianoche UTC de cada fecha: asi el cambio de horario no corre un dia
function diasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 864e5);
}

function diasHasta(fecha, hoy = hoyColombia()) {
  return diasEntre(hoy, fecha);
}

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { hoyColombia, esFechaValida, diasHasta, diasEntre, sumarDias };
