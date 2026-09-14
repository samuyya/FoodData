const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const Empresa = require('../models/Empresa');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');

beforeAll(async () => {
  await conectarBDPrueba();
});

afterEach(async () => {
  await limpiarBD();
});

afterAll(async () => {
  await cerrarBDPrueba();
});

async function crearEmpresaDePrueba(overrides = {}) {
  const passwordHash = await bcrypt.hash('clave-segura-123', 12);
  return Empresa.create({
    nombre: 'Empresa de prueba',
    email: 'tests@empresa.com',
    passwordHash,
    ...overrides
  });
}

describe('POST /api/auth/login', () => {
  test('con email y password correctos, arranca sesion de empresa', async () => {
    await crearEmpresaDePrueba();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tests@empresa.com', password: 'clave-segura-123' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.rol).toBe('empresa');
  });

  test('con password incorrecta, responde 401', async () => {
    await crearEmpresaDePrueba();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tests@empresa.com', password: 'clave-mala' });

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
  });

  test('con un email que no existe, responde 401 igual que con password mala', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-existe@empresa.com', password: 'cualquiera' });

    expect(res.status).toBe(401);
  });

  test('sin email o sin password, responde 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tests@empresa.com' });

    expect(res.status).toBe(400);
  });

  test('una empresa desactivada no puede entrar aunque la clave sea correcta', async () => {
    await crearEmpresaDePrueba({ activa: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tests@empresa.com', password: 'clave-segura-123' });

    expect(res.status).toBe(403);
  });
});
