require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { conectarDB } = require('./db');
const Superadmin = require('./models/Superadmin');

const authRoutes = require('./routes/auth');
const superadminRoutes = require('./routes/superadmin');
const formatosRoutes = require('./routes/formatos');
const adminRoutes = require('./routes/admin');
const registrosRoutes = require('./routes/registros');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'desarrollo-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/formatos', formatosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/registros', registrosRoutes);

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
  const existe = await Superadmin.findOne({ email: email.toLowerCase().trim() });
  if (existe) return;
  const passwordHash = await bcrypt.hash(password, 10);
  await Superadmin.create({ email: email.toLowerCase().trim(), passwordHash });
  console.log(`Superadmin inicial creado: ${email}`);
}

async function iniciar() {
  try {
    await conectarDB();
    await seedSuperadmin();
    app.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error al iniciar:', err.message);
    process.exit(1);
  }
}

iniciar();
