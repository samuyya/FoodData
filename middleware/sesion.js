function requireEmpresa(req, res, next) {
  if (!req.session || !req.session.empresa) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  next();
}

function requireSuperadmin(req, res, next) {
  if (!req.session || !req.session.superadmin) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  next();
}

// chequea que la empresa tenga el modulo habilitado. el superadmin pasa siempre.
// la lista de modulos se cachea en la sesion al login — si el super la cambia,
// el usuario afectado tiene que volver a logearse para que aplique.
function requireModulo(modulo) {
  return (req, res, next) => {
    if (req.session && req.session.superadmin) return next();
    if (!req.session || !req.session.empresa) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    const modulos = (req.session.empresa.modulosActivos && req.session.empresa.modulosActivos.length)
      ? req.session.empresa.modulosActivos
      : ['formatos', 'asistencia', 'capacitaciones', 'programas'];
    if (!modulos.includes(modulo)) {
      return res.status(403).json({ ok: false, error: 'Tu empresa no tiene este módulo habilitado' });
    }
    next();
  };
}

module.exports = { requireEmpresa, requireSuperadmin, requireModulo };
