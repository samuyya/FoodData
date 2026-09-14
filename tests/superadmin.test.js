const request = require('supertest');
const app = require('../server');
const Empresa = require('../models/Empresa');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearSuperadminLogueado, PASSWORD_SUPERADMIN } = require('./helpers');

beforeAll(async () => {
  await conectarBDPrueba();
});

afterEach(async () => {
  await limpiarBD();
});

afterAll(async () => {
  await cerrarBDPrueba();
});

describe('login de superadmin', () => {
  test('con credenciales correctas, arranca sesion de superadmin', async () => {
    const { superadmin } = await crearSuperadminLogueado(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: superadmin.email, password: PASSWORD_SUPERADMIN });

    expect(res.status).toBe(200);
    expect(res.body.rol).toBe('superadmin');
  });

  test('con password incorrecta, responde 401', async () => {
    const { superadmin } = await crearSuperadminLogueado(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: superadmin.email, password: 'lo-que-sea-mal' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/superadmin/empresas', () => {
  test('sin sesion de superadmin, responde 401', async () => {
    const res = await request(app).get('/api/superadmin/empresas');
    expect(res.status).toBe(401);
  });

  test('con sesion de superadmin, lista las empresas', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    await Empresa.create({ nombre: 'Empresa Uno', email: 'uno@empresa.com', passwordHash: 'x' });

    const res = await agent.get('/api/superadmin/empresas');

    expect(res.status).toBe(200);
    expect(res.body.empresas).toHaveLength(1);
  });
});

describe('POST /api/superadmin/empresas', () => {
  test('crea una empresa nueva y responde 201', async () => {
    const { agent } = await crearSuperadminLogueado(app);

    const res = await agent
      .post('/api/superadmin/empresas')
      .field('nombre', 'Restaurante Prueba')
      .field('email', 'restaurante@prueba.com')
      .field('password', 'clave-larga-123')
      .field('formatosActivos', 'calidad_agua');

    expect(res.status).toBe(201);
    expect(res.body.empresa.nombre).toBe('Restaurante Prueba');

    const enBD = await Empresa.findOne({ email: 'restaurante@prueba.com' });
    expect(enBD).not.toBeNull();
  });

  test('sin nombre, email o password, responde 400', async () => {
    const { agent } = await crearSuperadminLogueado(app);

    const res = await agent
      .post('/api/superadmin/empresas')
      .field('nombre', 'Restaurante Prueba')
      .field('formatosActivos', 'calidad_agua');

    expect(res.status).toBe(400);
  });

  test('con password de menos de 8 caracteres, responde 400', async () => {
    const { agent } = await crearSuperadminLogueado(app);

    const res = await agent
      .post('/api/superadmin/empresas')
      .field('nombre', 'Restaurante Prueba')
      .field('email', 'restaurante@prueba.com')
      .field('password', '123')
      .field('formatosActivos', 'calidad_agua');

    expect(res.status).toBe(400);
  });

  test('con un email que ya existe, responde 409', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    await Empresa.create({ nombre: 'Ya existe', email: 'repetido@empresa.com', passwordHash: 'x' });

    const res = await agent
      .post('/api/superadmin/empresas')
      .field('nombre', 'Otra empresa')
      .field('email', 'repetido@empresa.com')
      .field('password', 'clave-larga-123')
      .field('formatosActivos', 'calidad_agua');

    expect(res.status).toBe(409);
  });
});

describe('PUT /api/superadmin/empresas/:id', () => {
  test('edita el nombre de una empresa', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    const empresa = await Empresa.create({ nombre: 'Nombre Viejo', email: 'edit@empresa.com', passwordHash: 'x' });

    const res = await agent
      .put(`/api/superadmin/empresas/${empresa._id}`)
      .field('nombre', 'Nombre Nuevo');

    expect(res.status).toBe(200);
    expect(res.body.empresa.nombre).toBe('Nombre Nuevo');
  });
});

describe('DELETE /api/superadmin/empresas/:id', () => {
  test('sin desactivar primero, responde 409', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    const empresa = await Empresa.create({ nombre: 'Empresa Activa', email: 'activa@empresa.com', passwordHash: 'x' });

    const res = await agent
      .delete(`/api/superadmin/empresas/${empresa._id}`)
      .send({ confirmacion: 'Empresa Activa' });

    expect(res.status).toBe(409);
  });

  test('desactivada y con el nombre exacto de confirmacion, se elimina', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    const empresa = await Empresa.create({ nombre: 'Empresa a Borrar', email: 'borrar@empresa.com', passwordHash: 'x' });

    await agent.post(`/api/superadmin/empresas/${empresa._id}/desactivar`);
    const res = await agent
      .delete(`/api/superadmin/empresas/${empresa._id}`)
      .send({ confirmacion: 'Empresa a Borrar' });

    expect(res.status).toBe(200);
    const enBD = await Empresa.findById(empresa._id);
    expect(enBD).toBeNull();
  });
});
