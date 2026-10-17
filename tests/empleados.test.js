const mongoose = require('mongoose');
const app = require('../server');
const EmpleadoLista = require('../models/EmpleadoLista');
const { migrarListasEmpleados } = require('../servicios/empleadosListas');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada } = require('./helpers');

beforeAll(async () => { await conectarBDPrueba(); await EmpleadoLista.syncIndexes(); });
afterEach(async () => { await limpiarBD(); });
afterAll(async () => { await cerrarBDPrueba(); });

const agregar = (agent, lista, nombre, aplicarEn = []) => agent.post(`/api/empleados?lista=${lista}`).send({ nombre, aplicarEn });
const nombresDe = async (agent, lista) => (await agent.get(`/api/empleados?lista=${lista}`)).body.empleados.map(e => e.nombre);

describe('listas de empleados separadas por modulo', () => {
  test('cada lista guarda lo suyo, y el mismo nombre puede estar en las dos', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    expect((await agregar(agent, 'asistencia', 'Laura Pérez')).status).toBe(201);
    expect((await agregar(agent, 'presentacion', 'Andrés Gómez')).status).toBe(201);
    expect((await agregar(agent, 'presentacion', 'Laura Pérez')).status).toBe(201);
    expect((await agregar(agent, 'asistencia', 'Laura Pérez')).status).toBe(409);

    expect(await nombresDe(agent, 'asistencia')).toEqual(['Laura Pérez']);
    expect((await nombresDe(agent, 'presentacion')).sort()).toEqual(['Andrés Gómez', 'Laura Pérez']);
    // la pantalla de asistencia solo ve su lista
    const enAsistencia = await agent.get('/api/asistencia/empleados');
    expect(enAsistencia.body.empleados.map(e => e.nombre)).toEqual(['Laura Pérez']);
  });

  test('sin indicar lista se usa la de presentacion personal (como siempre)', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    await agent.post('/api/empleados').send({ nombre: 'Carlos Ruiz' });
    expect(await nombresDe(agent, 'presentacion')).toEqual(['Carlos Ruiz']);
    expect(await nombresDe(agent, 'asistencia')).toEqual([]);
    expect((await agent.get('/api/empleados?lista=inventada')).status).toBe(400);
  });

  test('"aplicar también en" agrega, renombra y elimina en las otras listas marcadas', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    const creado = await agregar(agent, 'presentacion', 'María López', ['asistencia']);
    expect(creado.body.aplicado).toEqual([{ lista: 'asistencia', nombre: 'Asistencia', resultado: 'listo' }]);
    expect(await nombresDe(agent, 'asistencia')).toEqual(['María López']);

    const id = creado.body.empleado._id;
    const edit = await agent.put(`/api/empleados/${id}`).send({ nombre: 'María Lopez Díaz', aplicarEn: ['asistencia'] });
    expect(edit.body.aplicado[0].resultado).toBe('listo');
    expect(await nombresDe(agent, 'asistencia')).toEqual(['María Lopez Díaz']);
    expect(await nombresDe(agent, 'presentacion')).toEqual(['María Lopez Díaz']);

    const borrar = await agent.delete(`/api/empleados/${id}?aplicarEn=asistencia`);
    expect(borrar.body.aplicado[0].resultado).toBe('listo');
    expect(await nombresDe(agent, 'asistencia')).toEqual([]);
    expect(await nombresDe(agent, 'presentacion')).toEqual([]);
  });

  test('sin marcar nada, el cambio queda solo en su lista', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    await agregar(agent, 'asistencia', 'Pedro Soto');
    const p = await agregar(agent, 'presentacion', 'Pedro Soto');
    await agent.put(`/api/empleados/${p.body.empleado._id}`).send({ nombre: 'Pedro Soto Gil' });
    expect(await nombresDe(agent, 'asistencia')).toEqual(['Pedro Soto']);
    await agent.delete(`/api/empleados/${p.body.empleado._id}`);
    expect(await nombresDe(agent, 'asistencia')).toEqual(['Pedro Soto']);
  });

  test('avisa cuando en la otra lista no estaba, ya estaba o hay otro con ese nombre', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    await agregar(agent, 'asistencia', 'Sara Mejía');
    const dup = await agregar(agent, 'presentacion', 'Sara Mejía', ['asistencia']);
    expect(dup.body.aplicado[0].resultado).toBe('ya estaba');

    const solo = await agregar(agent, 'presentacion', 'Tomás Vega');
    const sinEstar = await agent.put(`/api/empleados/${solo.body.empleado._id}`).send({ nombre: 'Tomás Vega R', aplicarEn: ['asistencia'] });
    expect(sinEstar.body.aplicado[0].resultado).toBe('no estaba');
    const borrarSinEstar = await agent.delete(`/api/empleados/${solo.body.empleado._id}?aplicarEn=asistencia`);
    expect(borrarSinEstar.body.aplicado[0].resultado).toBe('no estaba');

    await agregar(agent, 'asistencia', 'Luz Marina');
    await agregar(agent, 'asistencia', 'Luz Marina Ortiz');
    const luz = await agregar(agent, 'presentacion', 'Luz Marina');
    const choque = await agent.put(`/api/empleados/${luz.body.empleado._id}`).send({ nombre: 'Luz Marina Ortiz', aplicarEn: ['asistencia'] });
    expect(choque.body.aplicado[0].resultado).toBe('ya hay uno con ese nombre');
  });

  test('una lista de un modulo apagado no se puede usar ni como destino', async () => {
    const { agent } = await crearEmpresaLogueada(app, { modulosActivos: ['formatos'] });
    expect((await agent.get('/api/empleados?lista=asistencia')).status).toBe(403);
    const r = await agregar(agent, 'presentacion', 'Nora Ríos', ['asistencia']);
    expect(r.status).toBe(201);
    expect(r.body.aplicado[0].resultado).toBe('sin permiso');
    expect(await EmpleadoLista.countDocuments({ lista: 'asistencia' })).toBe(0);
    const listas = await agent.get('/api/empleados/listas');
    expect(listas.body.listas.map(l => l.id)).toEqual(['presentacion']);
  });

  test('un empleado de otra empresa no se puede tocar', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    const ajeno = await EmpleadoLista.create({ empresa_id: new mongoose.Types.ObjectId(), nombre: 'Ajeno Uno', lista: 'asistencia' });
    expect((await agent.put(`/api/empleados/${ajeno._id}`).send({ nombre: 'Otro Nombre' })).status).toBe(404);
    expect((await agent.delete(`/api/empleados/${ajeno._id}`)).status).toBe(404);
  });
});

describe('migración de la lista única de antes', () => {
  test('los empleados viejos quedan en asistencia y se copian a presentación, una sola vez', async () => {
    const empresaId = new mongoose.Types.ObjectId();
    // como estaban antes: sin campo "lista"
    await EmpleadoLista.collection.insertMany([
      { empresa_id: empresaId, nombre: 'Ana Torres', createdAt: new Date(), updatedAt: new Date() },
      { empresa_id: empresaId, nombre: 'Beto Ríos', createdAt: new Date(), updatedAt: new Date() }
    ]);
    const idsViejos = (await EmpleadoLista.collection.find({}).toArray()).map(e => String(e._id)).sort();

    await migrarListasEmpleados();
    const asistencia = await EmpleadoLista.find({ lista: 'asistencia' }).lean();
    const presentacion = await EmpleadoLista.find({ lista: 'presentacion' }).lean();
    // los ids originales siguen siendo los de asistencia (las horas guardadas apuntan a ellos)
    expect(asistencia.map(e => String(e._id)).sort()).toEqual(idsViejos);
    expect(presentacion.map(e => e.nombre).sort()).toEqual(['Ana Torres', 'Beto Ríos']);

    // si luego borran una copia, volver a arrancar el servidor no la revive
    await EmpleadoLista.deleteOne({ lista: 'presentacion', nombre: 'Beto Ríos' });
    await migrarListasEmpleados();
    expect(await EmpleadoLista.countDocuments({ lista: 'presentacion' })).toBe(1);
    expect(await EmpleadoLista.countDocuments({ lista: 'asistencia' })).toBe(2);
  });
});
