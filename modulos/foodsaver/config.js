// todo lo que se puede ajustar del modulo sin tocar la logica
module.exports = {
  MODULO: 'foodsaver',
  NOMBRE_MODULO: 'CaseritosN&S',
  RUTA_PAGINA: '/despensa',
  DIAS_AVISO1: 5,
  DIAS_AVISO2: 2,
  UNIDADES: ['und', 'kg', 'g', 'lb', 'L', 'ml', 'paquete', 'caja', 'botella', 'lata', 'bolsa', 'atado', 'otro'],
  UBICACIONES: ['nevera', 'congelador', 'alacena', 'otro'],
  CATEGORIAS_RECETA: ['Plato', 'Bebida', 'Salsa', 'Postre'],
  // el desbloqueo del panel de hogares dura lo mismo que los marcadores de administrador
  DURACION_DESBLOQUEO_MS: 8 * 60 * 60 * 1000
};
