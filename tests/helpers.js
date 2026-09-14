// helpers compartidos para armar una empresa + sesion logueada sin repetir
// el mismo login a mano en cada archivo de test
const request = require('supertest');
const bcrypt = require('bcryptjs');
const Empresa = require('../models/Empresa');
const Administrador = require('../models/Administrador');

const PASSWORD_EMPRESA = 'clave-segura-123';
const PASSWORD_ADMIN = 'admin-clave-123';

async function crearEmpresaLogueada(app, overrides = {}) {
  const passwordHash = await bcrypt.hash(PASSWORD_EMPRESA, 12);
  const empresa = await Empresa.create({
    nombre: 'Empresa de prueba',
    email: 'tests@empresa.com',
    passwordHash,
    ...overrides
  });

  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: empresa.email, password: PASSWORD_EMPRESA });
  return { agent, empresa };
}

async function crearAdministrador(empresaId) {
  const passwordHash = await bcrypt.hash(PASSWORD_ADMIN, 12);
  return Administrador.create({ nombre: 'Admin de prueba', empresa_id: empresaId, passwordHash });
}

module.exports = { crearEmpresaLogueada, crearAdministrador, PASSWORD_EMPRESA, PASSWORD_ADMIN };
