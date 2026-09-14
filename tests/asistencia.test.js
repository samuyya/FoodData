const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server');
const EmpleadoLista = require('../models/EmpleadoLista');
const Asistencia = require('../models/Asistencia');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada, crearAdministrador, PASSWORD_ADMIN } = require('./helpers');

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

// el registro que corrige es el que quedo con ingreso pero sin salida (ej. el
// empleado se fue y se le olvido marcar) — lo armamos directo con el modelo,
// no hace falta pasar por /marcar para probar la correccion
async function crearAsistenciaSinSalida(empresaId, empleado, horaIngreso) {
  const hoy = new Date();
  return Asistencia.create({
    empresa_id: empresaId,
    empleado_id: empleado._id,
    empleadoNombre: empleado.nombre,
    fecha: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()),
    dia: hoy.getDate(), mes: hoy.getMonth() + 1, anio: hoy.getFullYear(),
    horaIngreso
  });
}

describe('POST /api/asistencia/corregir-salida', () => {
  test('con la contraseña de administrador correcta, corrige la salida', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    const empleado = await crearEmpleado(empresa._id);
    const hoy = new Date();
    const ingreso = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 8, 0);
    const registro = await crearAsistenciaSinSalida(empresa._id, empleado, ingreso);

    const res = await agent
      .post('/api/asistencia/corregir-salida')
      .send({ registroId: registro._id, hora: '17:30', password: PASSWORD_ADMIN });

    expect(res.status).toBe(200);
    expect(res.body.registro.horasTrabajadas).toBeGreaterThan(0);
  });

  test('con la contraseña incorrecta, responde 401', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    const empleado = await crearEmpleado(empresa._id);
    const registro = await crearAsistenciaSinSalida(empresa._id, empleado, new Date());

    const res = await agent
      .post('/api/asistencia/corregir-salida')
      .send({ registroId: registro._id, hora: '17:30', password: 'clave-mala' });

    expect(res.status).toBe(401);
  });

  test('con una hora de salida anterior al ingreso, responde 400', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    const empleado = await crearEmpleado(empresa._id);
    const hoy = new Date();
    const ingreso = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 20, 0);
    const registro = await crearAsistenciaSinSalida(empresa._id, empleado, ingreso);

    const res = await agent
      .post('/api/asistencia/corregir-salida')
      .send({ registroId: registro._id, hora: '08:00', password: PASSWORD_ADMIN });

    expect(res.status).toBe(400);
  });

  test('si el registro ya tiene salida, responde 409', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    const empleado = await crearEmpleado(empresa._id);
    const registro = await crearAsistenciaSinSalida(empresa._id, empleado, new Date());
    registro.horaSalida = new Date();
    registro.horasTrabajadas = 1;
    await registro.save();

    const res = await agent
      .post('/api/asistencia/corregir-salida')
      .send({ registroId: registro._id, hora: '18:00', password: PASSWORD_ADMIN });

    expect(res.status).toBe(409);
  });
});
