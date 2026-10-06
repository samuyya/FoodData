// lista unica de modelos para backup/restore. ojo: si creas un modelo nuevo, agregalo aqui
// o se queda fuera del respaldo
module.exports = [
  require('./Empresa'),
  require('./Administrador'),
  require('./EmpleadoLista'),
  require('./Registro'),
  require('./Asistencia'),
  require('./Documento'),
  require('./Superadmin'),
  require('./SaldoHorasExtra'),
  require('./AjusteHorasExtra'),
  require('./ItemInventario'),
  require('./MovInventario'),
  require('./ConteoInventario')
];
