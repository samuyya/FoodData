// registra el modulo en la app de FoodData. lo llama una sola linea de server.js
const path = require('path');
const { MODULO, NOMBRE_MODULO, RUTA_PAGINA } = require('./config');
const { tieneModulo } = require('./contexto');

const WEB = path.join(__dirname, 'web');
// archivos que puede pedir la pagina del hogar (lista cerrada)
const ARCHIVOS = { 'app.js': 'app.js', 'estilos.css': 'estilos.css' };

module.exports = function registrar(app) {
  // el menu principal pide sus botones extra al servidor (ver routes/auth.js /me):
  // asi en los archivos publicos de FoodData no queda ni una palabra de este modulo
  app.locals.menuExtras = (app.locals.menuExtras || []).concat(empresa => {
    if (!empresa || !(empresa.modulosActivos || []).includes(MODULO)) return null;
    return { etiqueta: NOMBRE_MODULO, icono: '🍲', ruta: RUTA_PAGINA, insignia: '/api/despensa/insignia', portada: empresa.logo || '' };
  });

  // sin el modulo, estas rutas caen al 404 normal de express, igual que una que no existe
  app.get(RUTA_PAGINA, (req, res, next) => {
    if (!tieneModulo(req)) return next();
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(WEB, 'index.html'));
  });
  app.get(RUTA_PAGINA + '/:archivo', (req, res, next) => {
    const archivo = ARCHIVOS[req.params.archivo];
    if (!archivo || !tieneModulo(req)) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB, archivo));
  });

  // el service worker de FoodData importa este archivo. es publico a proposito
  // (el navegador lo baja sin sesion) y no lleva datos ni el nombre del modulo
  app.get('/sw-avisos.js', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('application/javascript').sendFile(path.join(WEB, 'sw-avisos.js'));
  });

  const { soloHogar } = require('./contexto');
  app.use('/api/despensa/avisos', require('./rutas/avisos'));
  app.use('/api/despensa', soloHogar, require('./rutas/despensa'));
  app.use('/api/superadmin', require('./rutas/hogares'));
};
