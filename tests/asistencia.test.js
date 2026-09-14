const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server');
const EmpleadoLista = require('../models/EmpleadoLista');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada } = require('./helpers');

beforeAll(async () => {
  await conectarBDPrueba();
});

afterEach(async () => {
  await limpiarBD();
});

afterAll(async () => {
  await cerrarBDPrueba();
});

// la foto de "evidencia" no tiene que ser una imagen real: multer solo mira
// la extension del nombre y el mimetype declarado, no el contenido del archivo
const FOTO_DE_PRUEBA = Buffer.from('esto no es una foto de verdad, solo bytes cualquiera');

async function limpiarFotosDeEmpresa(empresaId) {
  const dir = path.join(__dirname, '..', 'datos', 'asistencia', String(empresaId));
  await fs.promises.rm(dir, { recursive: true, force: true });
}

async function crearEmpleado(empresaId, nombre = 'Empleado de prueba') {
  return EmpleadoLista.create({ empresa_id: empresaId, nombre });
}

describe('POST /api/asistencia/marcar', () => {
  test('la primera foto del dia marca ingreso', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    const empleado = await crearEmpleado(empresa._id);

    const res = await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', String(empleado._id))
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.tipo).toBe('ingreso');

    await limpiarFotosDeEmpresa(empresa._id);
  });

  test('la segunda foto del mismo dia marca salida', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    const empleado = await crearEmpleado(empresa._id);

    await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', String(empleado._id))
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    const res = await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', String(empleado._id))
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.tipo).toBe('salida');

    await limpiarFotosDeEmpresa(empresa._id);
  });

  test('una tercera foto el mismo dia responde 409 (ya esta completo)', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    const empleado = await crearEmpleado(empresa._id);

    for (let i = 0; i < 2; i++) {
      await agent
        .post('/api/asistencia/marcar')
        .field('empleadoId', String(empleado._id))
        .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });
    }

    const res = await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', String(empleado._id))
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(409);

    await limpiarFotosDeEmpresa(empresa._id);
  });

  test('sin foto adjunta, responde 400', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    const empleado = await crearEmpleado(empresa._id);

    const res = await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', String(empleado._id));

    expect(res.status).toBe(400);
  });

  test('con un empleado que no existe, responde 404', async () => {
    const { agent } = await crearEmpresaLogueada(app);

    const res = await agent
      .post('/api/asistencia/marcar')
      .field('empleadoId', '507f1f77bcf86cd799439011')
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(404);
  });

  test('sin sesion iniciada, responde 401', async () => {
    const res = await request(app)
      .post('/api/asistencia/marcar')
      .field('empleadoId', '507f1f77bcf86cd799439011')
      .attach('foto', FOTO_DE_PRUEBA, { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(401);
  });
});
