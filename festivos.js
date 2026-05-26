//  Festivos de Colombia
//  Incluye: festivos fijos, festivos trasladados (Ley Emiliani) y festivos
//  religiosos basados en la Pascua.
const cache = new Map();

// Algoritmo de Meeus/Jones/Butcher para calcular el Domingo de Pascua
function calcularPascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

// Si la fecha cae lunes, no la mueve. Si no, devuelve el siguiente lunes.
function siguienteLunes(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=domingo, 1=lunes, ..., 6=sábado
  const diff = (8 - dow) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function suma(base, dias) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + dias);
  return d;
}

function keyFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function festivosDeAnio(anio) {
  if (cache.has(anio)) return cache.get(anio);

  // [mes, día, nombre]
  const FIJOS = [
    [1,  1,  'Año Nuevo'],
    [5,  1,  'Día del Trabajo'],
    [7,  20, 'Día de la Independencia'],
    [8,  7,  'Batalla de Boyacá'],
    [12, 8,  'Inmaculada Concepción'],
    [12, 25, 'Navidad']
  ];

  // Festivos trasladados al lunes (Ley Emiliani)
  const TRASLADADOS = [
    [1,  6,  'Día de los Reyes Magos'],
    [3,  19, 'Día de San José'],
    [6,  29, 'San Pedro y San Pablo'],
    [8,  15, 'Asunción de la Virgen'],
    [10, 12, 'Día de la Diversidad Étnica'],
    [11, 1,  'Día de Todos los Santos'],
    [11, 11, 'Independencia de Cartagena']
  ];

  const pascua = calcularPascua(anio);

  // Religiosos basados en Pascua
  const jueves   = suma(pascua, -3);  // Jueves Santo
  const viernes  = suma(pascua, -2);  // Viernes Santo
  // Estos tres se trasladan al siguiente lunes
  const ascension   = siguienteLunes(suma(pascua, 40));  // Ascensión del Señor
  const corpus      = siguienteLunes(suma(pascua, 60));  // Corpus Christi
  const sagrado     = siguienteLunes(suma(pascua, 68));  // Sagrado Corazón

  const lista = [
    ...FIJOS.map(([m, d, nombre]) => ({ date: new Date(anio, m - 1, d), nombre })),
    ...TRASLADADOS.map(([m, d, nombre]) => ({ date: siguienteLunes(new Date(anio, m - 1, d)), nombre })),
    { date: jueves,    nombre: 'Jueves Santo' },
    { date: viernes,   nombre: 'Viernes Santo' },
    { date: ascension, nombre: 'Ascensión del Señor' },
    { date: corpus,    nombre: 'Corpus Christi' },
    { date: sagrado,   nombre: 'Sagrado Corazón' }
  ];

  const mapa = new Map();
  lista.forEach(f => {
    const k = keyFecha(f.date);
    if (mapa.has(k)) {
      mapa.set(k, mapa.get(k) + ' / ' + f.nombre);
    } else {
      mapa.set(k, f.nombre);
    }
  });
  cache.set(anio, mapa);
  return mapa;
}

function esFestivo(anio, mes, dia) {
  const k = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return festivosDeAnio(anio).has(k);
}

function nombreFestivo(anio, mes, dia) {
  const k = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return festivosDeAnio(anio).get(k) || null;
}

function festivosDeMes(anio, mes) {
  const mapa = festivosDeAnio(anio);
  const resultado = [];
  mapa.forEach((nombre, k) => {
    const [a, m, d] = k.split('-').map(Number);
    if (a === anio && m === mes) resultado.push({ dia: d, nombre });
  });
  resultado.sort((a, b) => a.dia - b.dia);
  return resultado;
}

module.exports = { esFestivo, nombreFestivo, festivosDeMes, festivosDeAnio, calcularPascua };
