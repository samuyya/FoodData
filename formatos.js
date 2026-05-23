const FORMATOS = [
  { id: 'calidad_agua',          numero: 1, nombre: 'Calidad del agua',                       nombreCorto: 'Calidad del agua'       },
  { id: 'control_plagas',        numero: 2, nombre: 'Control de plagas',                      nombreCorto: 'Control de plagas'      },
  { id: 'presentacion_personal', numero: 3, nombre: 'Presentación personal',                  nombreCorto: 'Presentación personal'  },
  { id: 'control_temperatura',   numero: 4, nombre: 'Control de temperatura',                 nombreCorto: 'Control de temperatura' },
  { id: 'limpieza_desinfeccion', numero: 5, nombre: 'Limpieza y desinfección de superficies', nombreCorto: 'Limpieza superficies'   },
  { id: 'manejo_residuos',       numero: 6, nombre: 'Manejo de residuos',                     nombreCorto: 'Manejo de residuos'     }
];

function getFormato(id) {
  return FORMATOS.find(f => f.id === id);
}

module.exports = { FORMATOS, getFormato };
