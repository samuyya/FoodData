const FORMATOS = [
  { id: 'calidad_agua',          numero: 1, nombre: 'Calidad del agua',                       nombreCorto: 'Calidad del agua',       restringidoPorDefecto: false },
  { id: 'control_plagas',        numero: 2, nombre: 'Control de plagas',                      nombreCorto: 'Control de plagas',      restringidoPorDefecto: false },
  { id: 'presentacion_personal', numero: 3, nombre: 'Presentación personal',                  nombreCorto: 'Presentación personal',  restringidoPorDefecto: true  },
  { id: 'control_temperatura',   numero: 4, nombre: 'Control de temperatura',                 nombreCorto: 'Control de temperatura', restringidoPorDefecto: false },
  { id: 'limpieza_desinfeccion', numero: 5, nombre: 'Limpieza y desinfección de superficies', nombreCorto: 'Limpieza superficies',   restringidoPorDefecto: false },
  { id: 'manejo_residuos',       numero: 6, nombre: 'Manejo de residuos',                     nombreCorto: 'Manejo de residuos',     restringidoPorDefecto: false },
  { id: 'capacitacion_continua', numero: 7, nombre: 'Capacitación continua',                  nombreCorto: 'Capacitación continua',  restringidoPorDefecto: true  }
];

function getFormato(id) {
  return FORMATOS.find(f => f.id === id);
}

module.exports = { FORMATOS, getFormato };
