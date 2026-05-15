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

module.exports = { requireEmpresa, requireSuperadmin };
