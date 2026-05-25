// =============================================================================
//  Catálogo de formatos del proyecto FoodData
//  Cada formato tiene metadatos institucionales (código, plan, programa…)
//  según el documento físico oficial.
// =============================================================================

const FORMATOS = [
  {
    id: 'recepcion_materias_primas',
    numero: 1,
    nombre: 'Recepción de materias primas',
    nombreCorto: 'Recepción MP',
    codigo: 'TR-F-01',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PROGRAMAS COMPLEMENTARIOS',
    programa: 'PROGRAMA DE TRAZABILIDAD',
    titulo: 'FORMATO DE RECEPCIÓN DE MATERIAS PRIMAS',
    nota: 'Cada día puede contener varias recepciones (una por proveedor/producto). Verifica color, olor, apariencia y empaque antes de aceptar.'
  },
  {
    id: 'calidad_agua',
    numero: 2,
    nombre: 'Control de calidad del agua potable',
    nombreCorto: 'Calidad del agua',
    codigo: 'AA-F-01',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE ABASTECIMIENTO DE AGUA POTABLE',
    titulo: 'FORMATO DE CONTROL DE CALIDAD DEL AGUA POTABLE',
    nota: 'El agua potable debe cumplir con los siguientes parámetros: pH 6,5 a 9,0 · Cloro residual 0,3 a 2,0 mg/L · sin olor, sin color, sin sabor. Puntos de verificación área de preparación: Llave #1 y Llave #2.'
  },
  {
    id: 'control_temperatura',
    numero: 3,
    nombre: 'Temperatura de equipos de frío',
    nombreCorto: 'T° equipos de frío',
    codigo: 'TR-F-04',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PROGRAMAS COMPLEMENTARIOS',
    programa: 'PROGRAMA DE TRAZABILIDAD',
    titulo: 'FORMATO DE MEDICIÓN DE TEMPERATURA DE EQUIPOS DE FRÍO',
    nota: 'Refrigeración: 0 °C a 4,0 °C  ·  Congelación: ≤ −18 °C. Realizar 2 mediciones al día (inicio y final). Cuando NO CUMPLE, registra acción correctiva en observaciones.'
  },
  {
    id: 'control_plagas',
    numero: 4,
    nombre: 'Verificación diaria de plagas',
    nombreCorto: 'Verificación plagas',
    codigo: 'CP-F-01',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE CONTROL INTEGRADO DE PLAGAS',
    titulo: 'FORMATO DE VERIFICACIÓN DIARIA DE PLAGAS',
    nota: 'Marca las áreas inspeccionadas y el tipo de control aplicado. Describe cualquier novedad detectada.'
  },
  {
    id: 'limpieza_salon',
    numero: 5,
    nombre: 'Limpieza y desinfección - Salón',
    nombreCorto: 'Limpieza salón',
    codigo: 'LD-F-04',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE LIMPIEZA Y DESINFECCIÓN',
    titulo: 'FORMATO DE EJECUCIÓN Y CONTROL DE LIMPIEZA Y DESINFECCIÓN — SALÓN',
    nota: 'HS: Hipoclorito de sodio al 13%  ·  DO: Desinfectante orgánico. Marca las áreas que se limpiaron hoy.',
    // Producto asignado a cada área según el formato oficial (LD-F-04)
    areas: [
      { nombre: 'Ambiente',                 producto: 'DO' },
      { nombre: 'Alimentos y empaques',     producto: 'DO' },
      { nombre: 'Techo, lámparas',          producto: 'HS' },
      { nombre: 'Paredes, puertas',         producto: 'HS' },
      { nombre: 'Piso',                     producto: 'HS' },
      { nombre: 'Mesones, estanterías',     producto: 'HS' },
      { nombre: 'Utensilios',               producto: 'HS' },
      { nombre: 'Equipo de frío',           producto: 'HS' },
      { nombre: 'Canastillas',              producto: 'HS' },
      { nombre: 'Licuadoras',               producto: 'HS' },
      { nombre: 'Máquina de café',          producto: 'HS' },
      { nombre: 'Greca de café',            producto: 'HS' },
      { nombre: 'Tostadora',                producto: 'HS' },
      { nombre: 'Estufa',                   producto: 'HS' },
      { nombre: 'Equipos en desuso',        producto: 'HS' },
      { nombre: 'Mesas',                    producto: 'HS' },
      { nombre: 'Extintores',               producto: 'HS' },
      { nombre: 'Microondas',               producto: 'HS' },
      { nombre: 'Recipientes residuos',     producto: 'HS' },
      { nombre: 'Exteriores y alrededores', producto: 'HS' },
      { nombre: 'Trapos, traperas',         producto: 'HS' }
    ]
  },
  {
    id: 'limpieza_bano',
    numero: 6,
    nombre: 'Limpieza y desinfección - Baño',
    nombreCorto: 'Limpieza baño',
    codigo: 'LD-F-05',
    version: '03',
    fechaVersion: '28/04/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE LIMPIEZA Y DESINFECCIÓN',
    titulo: 'FORMATO DE EJECUCIÓN Y CONTROL DE LIMPIEZA Y DESINFECCIÓN — BAÑO',
    nota: 'Marca tipo de limpieza (Rutinaria o Profunda) y las áreas del baño intervenidas.'
  },
  {
    id: 'limpieza_campana_trampa',
    numero: 7,
    nombre: 'Limpieza y desinfección - Campana y trampa',
    nombreCorto: 'Limpieza campana/trampa',
    codigo: 'LD-F-06',
    version: '03',
    fechaVersion: '28/04/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE LIMPIEZA Y DESINFECCIÓN',
    titulo: 'FORMATO DE EJECUCIÓN Y CONTROL DE LIMPIEZA Y DESINFECCIÓN — CAMPANA Y TRAMPA',
    nota: 'Indica el equipo limpiado, hora, desinfectante y dosis (cantidad de agua y producto).'
  },
  {
    id: 'manejo_residuos',
    numero: 8,
    nombre: 'Control de generación de residuos sólidos',
    nombreCorto: 'Residuos sólidos',
    codigo: 'RS-F-01',
    version: '03',
    fechaVersion: '28/03/2026',
    plan: 'PLAN DE SANEAMIENTO BÁSICO',
    programa: 'PROGRAMA DE MANEJO INTEGRAL DE RESIDUOS SÓLIDOS',
    titulo: 'FORMATO DE CONTROL DE GENERACIÓN DE RESIDUOS SÓLIDOS',
    nota: 'Registra la cantidad de bolsas generadas por tipo y la fecha de evacuación. Separa orgánicos, aprovechables y no aprovechables.'
  },
  {
    id: 'presentacion_personal',
    numero: 9,
    nombre: 'Presentación personal',
    nombreCorto: 'Presentación personal'
  }
];

function getFormato(id) {
  return FORMATOS.find(f => f.id === id);
}

module.exports = { FORMATOS, getFormato };
