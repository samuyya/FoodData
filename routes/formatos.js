const express = require('express');
const { FORMATOS, getFormato } = require('../formatos');
const { getConfigEmpresa, getCarpetasDeFormato } = require('../empresaConfig');
const { requireEmpresa } = require('../middleware/sesion');

const router = express.Router();

router.get('/', requireEmpresa, async (req, res) => {
  const { carpetas } = await getConfigEmpresa(req.session.empresa.id);

  const resultado = {};
  for (const [nombre, ids] of Object.entries(carpetas)) {
    resultado[nombre] = FORMATOS
      .filter(f => ids.includes(f.id))
      .map((f, i) => ({ ...f, numero: i + 1, carpeta: nombre }));
  }

  res.json({ ok: true, carpetas: resultado });
});

// GET /api/formatos/:id?carpeta=cocina
// La carpeta es obligatoria cuando el mismo formato aparece en varias carpetas
router.get('/:id', requireEmpresa, async (req, res) => {
  const formato = getFormato(req.params.id);
  if (!formato) {
    return res.status(404).json({ ok: false, error: 'Formato no encontrado' });
  }
  const { activos, carpetas, compartidos } = await getConfigEmpresa(req.session.empresa.id);
  if (!activos.includes(formato.id)) {
    return res.status(403).json({ ok: false, error: 'Esta empresa no tiene este formato habilitado' });
  }

  const carpetasDelFormato = getCarpetasDeFormato(carpetas, formato.id);
  const carpetaParam = req.query.carpeta;

  let carpeta;
  if (carpetaParam) {
    if (!carpetasDelFormato.includes(carpetaParam)) {
      return res.status(403).json({ ok: false, error: 'Este formato no está disponible en esa carpeta' });
    }
    carpeta = carpetaParam;
  } else {
    carpeta = carpetasDelFormato[0];
  }

  const formatosEnCarpeta = FORMATOS.filter(f => carpetas[carpeta].includes(f.id));
  const numero = formatosEnCarpeta.findIndex(f => f.id === formato.id) + 1;
  const compartido = compartidos.includes(formato.id);

  res.json({ ok: true, formato: { ...formato, numero, carpeta, carpetas: carpetasDelFormato, compartido } });
});

module.exports = router;
