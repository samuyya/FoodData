// pase de limpieza estilistica - lo ejecuto manualmente cuando quiero
const fs = require('fs');
const path = require('path');

const archivos = [
  'public/js/formato.js',
  'public/js/registros.js',
  'public/js/programas.js',
  'public/js/formatos.js',
  'public/js/festivos.js',
  'public/js/superadmin-dashboard.js',
  'public/js/menu.js',
  'public/js/asistencia.js',
  'public/js/registro-asistencia.js',
  'servicios/excel.js',
  'servicios/googleSheets.js',
  'festivos.js',
  'empresaConfig.js',
  'routes/registros.js',
  'routes/admin.js',
  'routes/formatos.js'
];

const reemplazos = [
  // banners y comentarios verbosos
  [/\/\/ Helpers comunes para formatos con campos diarios/g, '// helpers compartidos'],
  [/\/\/ Catálogos de áreas para los formatos de limpieza/g, '// areas de limpieza'],
  [/\/\/ \(Salón viene del catálogo del servidor; baño es fijo aquí\)/g, ''],
  [/\/\/ Override de pintarBanners para CA/g, '// version local para CA'],
  [/\/\/ Pintar áreas con selector/g, ''],
  [/\/\/ Cargar info de pendientes/g, '// veo que ya hay del mes'],
  [/\/\/ Validación mínima/g, '// chequeos antes de mandar'],
  [/\/\/ Si el mes ya está al día, mostrar los datos del registro de hoy en solo-lectura/g, '// si ya esta al dia, bloqueo'],
  [/\/\/ Inicialización: al menos un item/g, '// arranco con un item'],
  [/\/\/ Compatibilidad: si el registro viejo[^\n]*/g, '// compat registros viejos'],
  [/\/\/ Mes actual/g, ''],
  [/\/\/ Encabezado institucional[^\n]*/g, '// header institucional'],
  [/\/\/ Pintar áreas/g, ''],
  [/\/\/ Festivo: solo la casilla del día tiene fondo turquoise/g, '// dia feriado se pinta'],
  [/\/\/ Festivo: solo en la primera fila del día[^\n]*/g, '// feriado solo en la 1ra fila'],
  [/\/\/ Festivo: solo en la 1ra fila[^\n]*/g, '// feriado solo en la 1ra fila'],
  [/\/\/ Resaltar columnas C\/NC[^\n]*/g, '// C/NC se pinta'],
  [/\/\/ Para recepción[^\n]*/g, '// recepcion'],
  [/\/\/ Decisión: verde si Acepta, rojo si Rechaza/g, '// acepta=verde, rechaza=rojo'],
  [/\/\/ Auto-cálculo C\/NC/g, '// recalculo el C/NC'],
  [/\/\/ Algunos formatos expanden múltiples filas por registro \(recepción\)/g, '// recepcion expande N filas'],
  [/\/\/ Algunos formatos expanden múltiples filas por registro/g, '// recepcion expande N filas'],
  [/\/\/ Solo el primer item muestra el día/g, '// solo el 1er item muestra el dia'],
  [/\/\/ solo el primer item muestra el día/g, '// solo el 1er item muestra el dia'],
  [/\/\/ Distinct por \(formato, carpeta\)[^\n]*/g, '// agrupa por instancia'],
  [/\/\/ Cada \(formato, carpeta\) es una instancia independiente/g, ''],

  // logs de debug
  [/console\.log\('\[Calidad Agua\] Respuesta del servidor:', res\);\n/g, ''],
  [/console\.log\('\[Form\] Respuesta:', res\);\n/g, ''],
  [/console\.log\('\[Form genérico\] Respuesta:', res\);\n/g, ''],
  [/console\.log\(`\[GS\][^`]*`\);\n/g, ''],
  [/console\.warn\('\[GS\]([^']+)', err[^)]+\);/g, "console.log('gs:$1', err.message);"],

  // mensajes UI mas humanos
  [/'Error de red al guardar'/g, "'no se pudo guardar, intenta otra vez'"],
  [/'Error de conexión'/g, "'no hay conexion'"],
  [/'Error de red'/g, "'no hay conexion'"],
  [/'Error al guardar'/g, "'algo salio mal al guardar'"]
];

let total = 0;
for (const f of archivos) {
  const ruta = path.join(__dirname, '..', f);
  if (!fs.existsSync(ruta)) continue;
  let c = fs.readFileSync(ruta, 'utf8');
  const antes = c.length;
  for (const [r, s] of reemplazos) c = c.replace(r, s);
  c = c.replace(/\n\n\n+/g, '\n\n');
  if (c.length !== antes) {
    fs.writeFileSync(ruta, c);
    total++;
    console.log('limpio:', f, '->', antes - c.length, 'menos');
  }
}
console.log('archivos cambiados:', total);
