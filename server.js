// fijo la zona horaria del proceso ANTES que todo lo demas — si el host (ej. Render)
// corre con TZ=UTC, "hoy" quedaria 5 horas adelantado y se desincroniza el dia que
// se guarda en formatos/asistencia
process.env.TZ = 'America/Bogota';

require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { conectarDB } = require('./db');
const Superadmin = require('./models/Superadmin');
const logger = require('./logger');

const authRoutes = require('./routes/auth');
const superadminRoutes = require('./routes/superadmin');
const formatosRoutes = require('./routes/formatos');
const adminRoutes = require('./routes/admin');
const registrosRoutes = require('./routes/registros');
const empleadosRoutes = require('./routes/empleados');
const asistenciaRoutes = require('./routes/asistencia');
const documentosRoutes = require('./routes/documentos');
const { requireModulo } = require('./middleware/sesion');
const googleSheets = require('./servicios/googleSheets');
const Registro = require('./models/Registro');

const app = express();
const PORT = process.env.PORT || 3000;
const EN_PRODUCCION = process.env.NODE_ENV === 'production';

// si me olvido de poner SESSION_SECRET en produccion, mejor que reviente al arranque
// y no que use un secreto adivinable
if (EN_PRODUCCION && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  logger.error('FATAL: en produccion necesitas SESSION_SECRET con minimo 32 caracteres en .env');
  process.exit(1);
}

// si estoy detras de un proxy (Render, Cloudflare) sin esto el secure cookie y el rate-limit fallan
if (EN_PRODUCCION) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // res.cloudinary.com: ahi quedan los logos de empresa cuando esta activo Cloudinary
      imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  // HSTS solo aplica en HTTPS, helmet lo activa por defecto. lo dejo explicito
  // para que en produccion el browser fuerce HTTPS por un anio
  strictTransportSecurity: EN_PRODUCCION
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
  // bloquea que mi sitio pueda ser embebido en un iframe externo (anti clickjacking)
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'same-origin' }
}));

// comprime CSS/JS/HTML/JSON antes de mandarlos — con la latencia que ya tenemos
// de por si (Render en EEUU, clientes en Colombia), no vale la pena mandar los
// archivos sin comprimir
app.use(compression());

const origenesPermitidos = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origenesPermitidos.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));

// limito el tamano del body para que no me hagan DoS mandandome 100MB de basura
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

// quita las llaves que empiezan con $ o tienen . — bloquea inyeccion tipo {"$ne": null}
function sanitizar(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('$') || k.includes('.')) { delete obj[k]; continue; }
    if (typeof obj[k] === 'object') sanitizar(obj[k]);
  }
}
app.use((req, res, next) => {
  sanitizar(req.body);
  sanitizar(req.query);
  sanitizar(req.params);
  next();
});

const sessionConfig = {
  name: 'fd.sid',  // nombre custom, no delata que uso express-session
  secret: process.env.SESSION_SECRET || 'desarrollo-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  rolling: true,   // refresca el maxAge en cada request para que la sesion no expire si esta activo
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'lax',
    secure: EN_PRODUCCION
  }
};
// guardo las sesiones en Mongo (no en memoria) para que sobrevivan un reinicio
// del server (nodemon en dev, un redeploy en Render). en los tests uso mongo
// en memoria para todo lo demas y no quiero que esto se conecte al Atlas real
if (process.env.MONGODB_URI && process.env.NODE_ENV !== 'test') {
  sessionConfig.store = MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    ttl: 8 * 60 * 60 // segundos, igual al maxAge de la cookie
  });
}
app.use(session(sessionConfig));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/admin', adminRoutes);
// rutas protegidas por modulo (superadmin siempre puede pasar)
app.use('/api/formatos',  requireModulo('formatos'),  formatosRoutes);
app.use('/api/registros', requireModulo('formatos'),  registrosRoutes);
app.use('/api/empleados', requireModulo('formatos'),  empleadosRoutes);
app.use('/api/asistencia',requireModulo('asistencia'),asistenciaRoutes);
// documentos: el superadmin sube; las empresas leen los suyos solo si tienen el modulo "programas"
app.use('/api/documentos', documentosRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor en linea' });
});

// si una ruta llama a next(err) o explota inesperadamente, no expongo el stack
// al cliente — lo logueo aca y devuelvo algo generico
app.use((err, req, res, next) => {
  logger.error(`error sin atrapar: ${req.method} ${req.path} - ${err.message}`);
  if (res.headersSent) return next(err);
  const codigo = err.status || err.statusCode || 500;
  res.status(codigo).json({
    ok: false,
    error: codigo === 500 ? 'Algo salió mal en el servidor' : err.message
  });
});

async function seedSuperadmin() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    logger.warn('SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD no definidos en .env, no se crea superadmin inicial');
    return;
  }
  const emailNorm = email.toLowerCase().trim();
  const existe = await Superadmin.findOne({ email: emailNorm });

  if (!existe) {
    const passwordHash = await bcrypt.hash(password, 12);
    await Superadmin.create({ email: emailNorm, passwordHash });
    logger.info(`Superadmin inicial creado: ${email}`);
    return;
  }

  const coincide = await bcrypt.compare(password, existe.passwordHash);
  if (!coincide) {
    existe.passwordHash = await bcrypt.hash(password, 12);
    await existe.save();
    logger.info(`Superadmin: contraseña sincronizada desde .env (${email})`);
  }
}

// Sincroniza los índices de Registro: elimina índices viejos (sin `carpeta`)
// y crea el nuevo índice único (empresa_id, formato, carpeta, anio, mes, dia).
// Necesario porque Mongoose no elimina índices viejos automáticamente.
async function sincronizarIndicesRegistro() {
  try {
    // Antes de sincronizar índices, asegurar que registros viejos (anteriores
    // a la introducción del campo `carpeta`) tengan un valor por defecto.
    const upd = await Registro.updateMany(
      { carpeta: { $in: [null, undefined, ''] } },
      { $set: { carpeta: 'cocina' } }
    );
    if (upd.modifiedCount > 0) {
      logger.info(`Migración registros: ${upd.modifiedCount} documento(s) actualizados con carpeta='cocina'.`);
    }

    // syncIndexes() elimina los índices que no están en el schema y crea los nuevos
    const resultado = await Registro.syncIndexes();
    if (Array.isArray(resultado) && resultado.length > 0) {
      logger.info({ resultado }, 'Índices de Registro eliminados (obsoletos)');
    } else {
      logger.info('Índices de Registro sincronizados.');
    }
  } catch (err) {
    logger.error(`error sincronizando indices: ${err.message}`);
  }
}

async function iniciar() {
  try {
    await conectarDB();
    await sincronizarIndicesRegistro();
    await seedSuperadmin();
    googleSheets.inicializar();
    const server = app.listen(PORT, () => {
      logger.info(`Servidor escuchando en http://localhost:${PORT}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`El puerto ${PORT} ya está en uso. Hay otro servidor corriendo. Detén el otro servidor con Ctrl+C en su terminal y vuelve a intentar.`);
      } else {
        logger.error(`Error del servidor: ${err.message}`);
      }
      process.exit(1);
    });
  } catch (err) {
    logger.error(`Error al iniciar: ${err.message}`);
    process.exit(1);
  }
}

// si un test hace require('./server') solo quiero el "app" para pasarselo a
// supertest, no que se conecte a la BD real ni que abra el puerto
if (require.main === module) {
  iniciar();
}

module.exports = app;
