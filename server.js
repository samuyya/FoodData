require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
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

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));

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

async function iniciar() {
  try {
    await conectarDB();
    await seedSuperadmin();
    googleSheets.inicializar();
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar:', err.message);
    process.exit(1);
  }
}

iniciar();
