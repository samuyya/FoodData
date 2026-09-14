const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../server');
const Registro = require('../models/Registro');
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

// guardar un registro tambien escribe el excel en datos/excel/{empresaId} de
// verdad — lo borramos despues de cada test para no dejar carpetas de mentira
async function limpiarArchivosDeEmpresa(empresaId) {
  const dir = path.join(__dirname, '..', 'datos', 'excel', String(empresaId));
  await fs.promises.rm(dir, { recursive: true, force: true });
}

describe('POST /api/registros', () => {
  test('guarda el formato del dia y responde 201', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);

    const res = await agent
      .post('/api/registros')
      .send({
        formatoId: 'calidad_agua',
        carpeta: 'cocina',
        responsable: 'Juan Perez',
        observaciones: '',
        datos: { ph: 7, cloro: 1.5 },
        password: PASSWORD_ADMIN // por si la empresa nueva tiene dias atrasados que llenar primero
      });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.registro.formato).toBe('calidad_agua');

    const enBD = await Registro.findOne({ empresa_id: empresa._id, formato: 'calidad_agua' });
    expect(enBD).not.toBeNull();

    await limpiarArchivosDeEmpresa(empresa._id);
  }, 20000);

  test('sin responsable, responde 400', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);

    const res = await agent
      .post('/api/registros')
      .send({ formatoId: 'calidad_agua', carpeta: 'cocina', responsable: '', datos: {}, password: PASSWORD_ADMIN });

    expect(res.status).toBe(400);
  });

  test('con un formato que no existe en el catalogo, responde 400', async () => {
    const { agent } = await crearEmpresaLogueada(app);

    const res = await agent
      .post('/api/registros')
      .send({ formatoId: 'formato_inventado', carpeta: 'cocina', responsable: 'Juan Perez', datos: {} });

    expect(res.status).toBe(400);
  });

  test('sin sesion iniciada, responde 401', async () => {
    const res = await request(app)
      .post('/api/registros')
      .send({ formatoId: 'calidad_agua', carpeta: 'cocina', responsable: 'Juan Perez', datos: {} });

    expect(res.status).toBe(401);
  });
});

function hoyComoTexto() {
  const hoy = new Date();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mm}-${dd}`;
}

describe('GET /api/registros/reporte (protegido con clave de administrador)', () => {
  test('sin haber verificado la clave de administrador, responde 401', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    const hoy = hoyComoTexto();

    const res = await agent.get(`/api/registros/reporte?desde=${hoy}&hasta=${hoy}`);

    expect(res.status).toBe(401);
    expect(res.body.requiereClaveAdmin).toBe(true);
  });

  test('verificando la clave primero, deja generar el reporte', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    const hoy = hoyComoTexto();

    const verificacion = await agent.post('/api/admin/verificar-reporte').send({ password: PASSWORD_ADMIN });
    expect(verificacion.status).toBe(200);

    const res = await agent.get(`/api/registros/reporte?desde=${hoy}&hasta=${hoy}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.carpetas)).toBe(true);
  });

  test('con la clave de administrador incorrecta, no deja pasar', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);

    const res = await agent.post('/api/admin/verificar-reporte').send({ password: 'clave-mala' });

    expect(res.status).toBe(401);
  });

  test('con fechas invalidas, responde 400', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    await agent.post('/api/admin/verificar-reporte').send({ password: PASSWORD_ADMIN });

    const res = await agent.get('/api/registros/reporte?desde=no-es-fecha&hasta=tampoco');

    expect(res.status).toBe(400);
  });
});
