const express = require('express');
const { FORMATOS, getFormato } = require('../formatos');
const Empresa = require('../models/Empresa');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

async function getActivosDeEmpresa(empresaId) {
  const empresa = await Empresa.findById(empresaId).select('formatosActivos').lean();
  if (empresa && empresa.formatosActivos && empresa.formatosActivos.length > 0) {
    return empresa.formatosActivos;
  }
  return FORMATOS.map(f => f.id);
}

router.get('/', requireEmpresa, async (req, res) => {
  const activos = await getActivosDeEmpresa(req.session.empresa.id);
  const filtrados = FORMATOS
    .filter(f => activos.includes(f.id))
    .map((f, i) => ({ ...f, numero: i + 1 }));
  res.json({ ok: true, formatos: filtrados });
});

router.get('/:id', requireEmpresa, async (req, res) => {
  const formato = getFormato(req.params.id);
  if (!formato) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const activos = await getActivosDeEmpresa(req.session.empresa.id);
  if (!activos.includes(formato.id)) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }
  const posicion = activos.indexOf(formato.id);
  const indiceVisible = FORMATOS
    .filter(f => activos.includes(f.id))
    .findIndex(f => f.id === formato.id);
  res.json({ ok: true, formato: { ...formato, numero: indiceVisible + 1 } });
});

module.exports = router;
