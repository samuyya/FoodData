const rateLimit = require('express-rate-limit');

function crearLimite(maxIntentos, mensaje) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: maxIntentos,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { ok: false, error: mensaje }
  });
}

const limiteLogin = crearLimite(
  15,
  'Demasiados intentos fallidos de inicio de sesión. Espera unos minutos e intenta de nuevo.'
);

const limiteAdmin = crearLimite(
  20,
  'Demasiados intentos fallidos de verificación. Espera unos minutos e intenta de nuevo.'
);

const limiteBackup = crearLimite(
  10,
  'Demasiados intentos. Espera unos minutos e intenta de nuevo.'
);

module.exports = { limiteLogin, limiteAdmin, limiteBackup };
