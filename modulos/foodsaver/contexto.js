// la unica costura con el login de FoodData. si el modulo se lleva a otro proyecto,
// se reemplaza este archivo por el login de ese proyecto y nada mas
const { MODULO } = require('./config');

function empresaDeSesion(req) {
  return req.session && req.session.empresa;
}

function tieneModulo(req) {
  const e = empresaDeSesion(req);
  return !!(e && Array.isArray(e.modulosActivos) && e.modulosActivos.includes(MODULO));
}

function getHogarId(req) {
  return empresaDeSesion(req).id;
}

function esSuperadmin(req) {
  return !!(req.session && req.session.superadmin);
}

// sin el modulo la ruta responde igual que una que no existe: no debe delatar nada
function soloHogar(req, res, next) {
  if (!tieneModulo(req)) return res.status(404).json({ ok: false, error: 'No encontrado' });
  next();
}

module.exports = { tieneModulo, getHogarId, esSuperadmin, soloHogar, empresaDeSesion };
