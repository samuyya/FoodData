const express = require('express');
const { FORMATOS, getFormato } = require('../formatos');
const { getConfigEmpresa } = require('../empresaConfig');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

router.get('/', requireEmpresa, async (req, res) => {
  const { activos, restringidos } = await getConfigEmpresa(req.session.empresa.id);
  const filtrados = FORMATOS
    .filter(f => activos.includes(f.id))
    .map((f, i) => ({
      ...f,
      numero: i + 1,
      restringido: restringidos.includes(f.id)
    }));
  res.json({ ok: true, formatos: filtrados });
});

router.get('/:id', requireEmpresa, async (req, res) => {
  const formato = getFormato(req.params.id);
  if (!formato) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const { activos, restringidos } = await getConfigEmpresa(req.session.empresa.id);
  if (!activos.includes(formato.id)) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }
  const indiceVisible = FORMATOS
    .filter(f => activos.includes(f.id))
    .findIndex(f => f.id === formato.id);
  res.json({
    ok: true,
    formato: {
      ...formato,
      numero: indiceVisible + 1,
      restringido: restringidos.includes(formato.id)
    }
  });
});

module.exports = router;
