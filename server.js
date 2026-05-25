require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { conectarDB } = require('./db');
const Superadmin = require('./models/Superadmin');

const authRoutes = require('./routes/auth');
const superadminRoutes = require('./routes/superadmin');
const formatosRoutes = require('./routes/formatos');
const adminRoutes = require('./routes/admin');
const registrosRoutes = require('./routes/registros');
const empleadosRoutes = require('./routes/empleados');
const asistenciaRoutes = require('./routes/asistencia');
const googleSheets = require('./servicios/googleSheets');
const Registro = require('./models/Registro');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'desarrollo-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/formatos', formatosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/registros', registrosRoutes);
app.use('/api/empleados', empleadosRoutes);
app.use('/api/asistencia', asistenciaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor en linea' });
});

async function seedSuperadmin() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD no definidos en .env, no se crea superadmin inicial');
    return;
  }
  const emailNorm = email.toLowerCase().trim();
  const existe = await Superadmin.findOne({ email: emailNorm });

  if (!existe) {
    const passwordHash = await bcrypt.hash(password, 10);
    await Superadmin.create({ email: emailNorm, passwordHash });
    console.log(`Superadmin inicial creado: ${email}`);
    return;
  }

  const coincide = await bcrypt.compare(password, existe.passwordHash);
  if (!coincide) {
    existe.passwordHash = await bcrypt.hash(password, 10);
    await existe.save();
    console.log(`Superadmin: contraseña sincronizada desde .env (${email})`);
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
      console.log(`Migración registros: ${upd.modifiedCount} documento(s) actualizados con carpeta='cocina'.`);
    }

    // syncIndexes() elimina los índices que no están en el schema y crea los nuevos
    const resultado = await Registro.syncIndexes();
    if (Array.isArray(resultado) && resultado.length > 0) {
      console.log('Índices de Registro eliminados (obsoletos):', resultado);
    } else {
      console.log('Índices de Registro sincronizados.');
    }
  } catch (err) {
    console.error('Error sincronizando índices de Registro:', err.message);
  }
}

async function iniciar() {
  try {
    await conectarDB();
    await sincronizarIndicesRegistro();
    await seedSuperadmin();
    googleSheets.inicializar();
    const server = app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`\nEl puerto ${PORT} ya está en uso. Hay otro servidor corriendo.`);
        console.error('Detén el otro servidor con Ctrl+C en su terminal y vuelve a intentar.\n');
      } else {
        console.error('Error del servidor:', err.message);
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('Error al iniciar:', err.message);
    process.exit(1);
  }
}

iniciar();
