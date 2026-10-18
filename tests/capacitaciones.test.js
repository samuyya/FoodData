const path = require('path');
const fs = require('fs');
const app = require('../server');
const EmpleadoLista = require('../models/EmpleadoLista');
const Capacitacion = require('../models/Capacitacion');
const Asignacion = require('../models/AsignacionCapacitacion');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada, crearAdministrador, PASSWORD_ADMIN } = require('./helpers');

beforeAll(async () => { await conectarBDPrueba(); await EmpleadoLista.syncIndexes(); await Asignacion.syncIndexes(); });
afterEach(async () => { await limpiarBD(); });
afterAll(async () => { await cerrarBDPrueba(); });

// subir material escribe en datos/documentos: se borra al terminar cada test
const empresas = [];
afterEach(async () => {
  for (const id of empresas.splice(0)) {
    await fs.promises.rm(path.join(__dirname, '..', 'datos', 'documentos', String(id)), { recursive: true, force: true });
  }
});

async function conAdmin() {
  const { agent, empresa } = await crearEmpresaLogueada(app);
  await crearAdministrador(empresa._id);
  empresas.push(empresa._id);
  await agent.post('/api/admin/verificar-capacitaciones').send({ password: PASSWORD_ADMIN });
  return { agent, empresa };
}
const cargo = async (agent, nombre) => (await agent.post('/api/capacitaciones/cargos').send({ nombre })).body.cargo;
const persona = (agent, nombre, cargoId, aplicarEn = []) =>
  agent.post('/api/empleados?lista=capacitaciones').send({ nombre, cargo: cargoId, aplicarEn });
const base = (extra = {}) => ({ titulo: 'Manejo de residuos', materialTipo: 'enlace', enlace: 'https://youtu.be/ejemplo', alcance: 'todos', ...extra });
const crearCap = (agent, datos, archivo) => {
  const r = agent.post('/api/capacitaciones/caps').field('datos', JSON.stringify(datos));
  return archivo ? r.attach('archivo', Buffer.from('contenido de prueba'), archivo) : r;
};
const resumen = async (agent) => (await agent.get('/api/capacitaciones/resumen')).body;

describe('acceso del administrador', () => {
  test('todo pide la clave de administrador', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    expect((await agent.get('/api/capacitaciones/estado')).body.admin).toBe(false);
    const r = await agent.get('/api/capacitaciones/cargos');
    expect(r.status).toBe(401);
    expect(r.body.requiereClaveAdmin).toBe(true);
    expect((await agent.get('/api/empleados?lista=capacitaciones')).status).toBe(401);
    expect((await agent.post('/api/admin/verificar-capacitaciones').send({ password: 'mala' })).status).toBe(401);
    await agent.post('/api/admin/verificar-capacitaciones').send({ password: PASSWORD_ADMIN });
    expect((await agent.get('/api/capacitaciones/cargos')).status).toBe(200);
  });

  test('sin el módulo encendido no se entra', async () => {
    const { agent } = await crearEmpresaLogueada(app, { modulosActivos: ['formatos'] });
    expect((await agent.get('/api/capacitaciones/estado')).status).toBe(403);
  });
});

describe('cargos', () => {
  test('crear, renombrar y evitar repetidos', async () => {
    const { agent } = await conAdmin();
    const c = await cargo(agent, 'Cocinero');
    expect((await agent.post('/api/capacitaciones/cargos').send({ nombre: 'Cocinero' })).status).toBe(409);
    expect((await agent.post('/api/capacitaciones/cargos').send({ nombre: '   ' })).status).toBe(400);
    expect((await agent.put(`/api/capacitaciones/cargos/${c.id}`).send({ nombre: 'Cocinera' })).body.cargo.nombre).toBe('Cocinera');
  });

  test('un cargo en uso pide reasignar antes de eliminarse', async () => {
    const { agent } = await conAdmin();
    const cocinero = await cargo(agent, 'Cocinero');
    const mesero = await cargo(agent, 'Mesero');
    await persona(agent, 'Laura Pérez', cocinero.id);
    await crearCap(agent, base({ alcance: 'cargos', cargos: [cocinero.id] }));

    const sin = await agent.delete(`/api/capacitaciones/cargos/${cocinero.id}`);
    expect(sin.status).toBe(409);
    expect(sin.body.enUso).toBe(1);

    const ok = await agent.delete(`/api/capacitaciones/cargos/${cocinero.id}?reasignarA=${mesero.id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.capacitacionesAfectadas).toBe(1);
    const lista = (await agent.get('/api/empleados?lista=capacitaciones')).body.empleados;
    expect(lista[0].cargo.nombre).toBe('Mesero');
    // el cargo salió de la capacitación
    expect((await agent.get('/api/capacitaciones/caps')).body.capacitaciones[0].cargos).toEqual([]);
  });
});

describe('capacitaciones', () => {
  test('validaciones del formulario', async () => {
    const { agent } = await conAdmin();
    expect((await crearCap(agent, base({ titulo: ' ' }))).status).toBe(400);
    expect((await crearCap(agent, base({ enlace: 'youtube.com/x' }))).status).toBe(400);
    expect((await crearCap(agent, base({ materialTipo: 'archivo' }))).body.error).toContain('material');
    expect((await crearCap(agent, base({ alcance: 'cargos', cargos: [] }))).status).toBe(400);
    expect((await crearCap(agent, base({ programa: 99 }))).status).toBe(400);
    const eval1 = (e) => crearCap(agent, base({ evaluacion: { activa: true, minimo: 80, preguntas: [e] } }));
    expect((await eval1({ texto: '¿Cuál?', opciones: ['Una'], correcta: 0 })).status).toBe(400);
    expect((await eval1({ texto: '¿Cuál?', opciones: ['Una', 'Dos'], correcta: 5 })).status).toBe(400);
    expect((await eval1({ texto: '¿Cuál?', opciones: ['Una', 'Dos'], correcta: 1 })).status).toBe(201);
  });

  test('con archivo: se sube, se puede ver, y cambiarlo sube la versión', async () => {
    const { agent } = await conAdmin();
    const r = await crearCap(agent, base({ materialTipo: 'archivo', enlace: '' }), 'cartilla.pdf');
    expect(r.status).toBe(201);
    const id = r.body.capacitacion.id;
    expect(r.body.capacitacion.material.archivoNombre).toBe('cartilla.pdf');
    const ver = await agent.get(`/api/capacitaciones/caps/${id}/material`);
    expect(ver.status).toBe(200);

    // editar sin tocar el material no cambia la versión
    const mismo = await agent.put(`/api/capacitaciones/caps/${id}`).field('datos', JSON.stringify(base({ materialTipo: 'archivo', titulo: 'Residuos' })));
    expect(mismo.body.capacitacion.version).toBe(1);
    // con archivo nuevo, sí
    const nuevo = await agent.put(`/api/capacitaciones/caps/${id}`).field('datos', JSON.stringify(base({ materialTipo: 'archivo' }))).attach('archivo', Buffer.from('otro'), 'v2.pdf');
    expect(nuevo.body.capacitacion.version).toBe(2);
    // y pasar a enlace también
    const enlace = await agent.put(`/api/capacitaciones/caps/${id}`).field('datos', JSON.stringify(base()));
    expect(enlace.body.capacitacion.version).toBe(3);
    expect((await agent.get(`/api/capacitaciones/caps/${id}/material`)).status).toBe(404);
  });

  test('un archivo de tipo raro se rechaza', async () => {
    const { agent } = await conAdmin();
    const r = await crearCap(agent, base({ materialTipo: 'archivo' }), 'virus.exe');
    expect(r.status).toBe(400);
  });

  test('desactivar no borra, y la capacitación desactivada sale de la tabla', async () => {
    const { agent } = await conAdmin();
    await persona(agent, 'Laura Pérez', null);
    const c = (await crearCap(agent, base())).body.capacitacion;
    expect((await resumen(agent)).caps).toHaveLength(1);
    await agent.post(`/api/capacitaciones/caps/${c.id}/estado`).send({ activa: false });
    expect((await resumen(agent)).caps).toHaveLength(0);
    expect(await Capacitacion.countDocuments()).toBe(1);
  });
});

describe('quién tiene qué capacitación', () => {
  test('por regla: todos, o solo los cargos elegidos', async () => {
    const { agent } = await conAdmin();
    const cocinero = await cargo(agent, 'Cocinero');
    const mesero = await cargo(agent, 'Mesero');
    await persona(agent, 'Laura Pérez', cocinero.id);
    await persona(agent, 'Camila Rojas', mesero.id);
    await persona(agent, 'Sin Cargo', null);
    await crearCap(agent, base({ titulo: 'Para todos' }));
    await crearCap(agent, base({ titulo: 'Solo cocina', alcance: 'cargos', cargos: [cocinero.id] }));

    const r = await resumen(agent);
    const fila = (n) => r.gente.find(g => g.nombre === n).celdas;
    expect(fila('Laura Pérez')).toEqual(['todos', 'cargo']);
    expect(fila('Camila Rojas')).toEqual(['todos', null]);
    expect(fila('Sin Cargo')).toEqual(['todos', null]);
  });

  test('el paquete de ingreso solo lo reciben los que entran después', async () => {
    const { agent } = await conAdmin();
    const cocinero = await cargo(agent, 'Cocinero');
    const antes = (await persona(agent, 'Ya Estaba', cocinero.id)).body.empleado;
    const c1 = (await crearCap(agent, base({ titulo: 'De ingreso', alcance: 'cargos', cargos: [cocinero.id], ingreso: true }))).body.capacitacion;
    const c2 = (await crearCap(agent, base({ titulo: 'Otra', alcance: 'cargos', cargos: [cocinero.id] }))).body.capacitacion;
    expect(await Asignacion.countDocuments()).toBe(0);

    const mesero = await cargo(agent, 'Mesero');
    await persona(agent, 'Recién Llegado', mesero.id);
    const r = await resumen(agent);
    expect(r.gente.find(g => g.nombre === 'Recién Llegado').celdas).toEqual(['ingreso', null]);
    expect(r.gente.find(g => g.nombre === 'Ya Estaba').celdas).toEqual(['cargo', 'cargo']);

    // armar el paquete de nuevo solo cambia lo que viene
    await agent.put('/api/capacitaciones/paquete').send({ ids: [c2.id] });
    await persona(agent, 'Otro Nuevo', mesero.id);
    expect((await resumen(agent)).gente.find(g => g.nombre === 'Otro Nuevo').celdas).toEqual([null, 'ingreso']);
    expect((await resumen(agent)).gente.find(g => g.nombre === 'Recién Llegado').celdas).toEqual(['ingreso', null]);
    expect(antes).toBeTruthy();
    expect(c1.id).toBeTruthy();
  });

  test('a mano: sumar una que no le toca, quitar una que sí, y volver a dejarla como estaba', async () => {
    const { agent } = await conAdmin();
    const cocinero = await cargo(agent, 'Cocinero');
    const emp = (await persona(agent, 'Laura Pérez', cocinero.id)).body.empleado;
    const solo = (await crearCap(agent, base({ titulo: 'Solo meseros', alcance: 'cargos', cargos: [(await cargo(agent, 'Mesero')).id] }))).body.capacitacion;
    const todos = (await crearCap(agent, base({ titulo: 'Todos' }))).body.capacitacion;
    const toca = (capId, asignada) => agent.put(`/api/capacitaciones/gente/${emp._id}/caps`).send({ capacitacion: capId, asignada });
    const celdas = async () => (await resumen(agent)).gente[0].celdas;

    expect(await celdas()).toEqual([null, 'todos']);
    await toca(solo.id, true);
    expect(await celdas()).toEqual(['manual', 'todos']);
    await toca(todos.id, false);
    expect(await celdas()).toEqual(['manual', null]);
    await toca(solo.id, false);
    await toca(todos.id, true);
    expect(await celdas()).toEqual([null, 'todos']);
    expect(await Asignacion.countDocuments()).toBe(0);
  });

  test('eliminar a la persona borra sus asignaciones', async () => {
    const { agent } = await conAdmin();
    const emp = (await persona(agent, 'Laura Pérez', null)).body.empleado;
    await crearCap(agent, base({ ingreso: true }));
    await persona(agent, 'Marcos Pinto', null);
    expect(await Asignacion.countDocuments()).toBe(1);
    const marcos = (await agent.get('/api/empleados?lista=capacitaciones')).body.empleados.find(e => e.nombre === 'Marcos Pinto');
    await agent.delete(`/api/empleados/${marcos._id}`);
    expect(await Asignacion.countDocuments()).toBe(0);
    expect(emp).toBeTruthy();
  });
});

describe('la lista de empleados de capacitaciones', () => {
  test('arranca como copia de la de asistencia, una sola vez', async () => {
    const { agent, empresa } = await conAdmin();
    await EmpleadoLista.create([
      { empresa_id: empresa._id, nombre: 'Laura Pérez', lista: 'asistencia' },
      { empresa_id: empresa._id, nombre: 'Andrés Gómez', lista: 'asistencia' }
    ]);
    const l1 = (await agent.get('/api/empleados?lista=capacitaciones')).body.empleados.map(e => e.nombre);
    expect(l1).toEqual(['Andrés Gómez', 'Laura Pérez']);
    // si borran a alguien, no se vuelve a copiar
    const laura = (await agent.get('/api/empleados?lista=capacitaciones')).body.empleados.find(e => e.nombre === 'Laura Pérez');
    await agent.delete(`/api/empleados/${laura._id}`);
    expect((await agent.get('/api/empleados?lista=capacitaciones')).body.empleados).toHaveLength(1);
  });

  test('editar el cargo y "aplicar también en" desde otra lista', async () => {
    const { agent } = await conAdmin();
    const mesero = await cargo(agent, 'Mesero');
    const cocinero = await cargo(agent, 'Cocinero');
    const emp = (await persona(agent, 'Camila Rojas', mesero.id, ['asistencia'])).body;
    expect(emp.aplicado[0].resultado).toBe('listo');
    expect((await agent.put(`/api/empleados/${emp.empleado._id}`).send({ nombre: 'Camila Rojas', cargo: cocinero.id })).body.empleado.cargo).toBe(cocinero.id);
    expect((await agent.put(`/api/empleados/${emp.empleado._id}`).send({ nombre: 'Camila Rojas', cargo: '507f1f77bcf86cd799439011' })).status).toBe(400);

    // desde asistencia, con la clave activa, también se puede agregar en capacitaciones y recibe el paquete
    await crearCap(agent, base({ ingreso: true }));
    const nueva = await agent.post('/api/empleados?lista=asistencia').send({ nombre: 'Nueva Persona', aplicarEn: ['capacitaciones'] });
    expect(nueva.body.aplicado[0].resultado).toBe('listo');
    expect((await resumen(agent)).gente.find(g => g.nombre === 'Nueva Persona').celdas).toEqual(['ingreso']);
  });

  test('sin la clave, capacitaciones no aparece como destino', async () => {
    const { agent, empresa } = await crearEmpresaLogueada(app);
    await crearAdministrador(empresa._id);
    expect((await agent.get('/api/empleados/listas')).body.listas.map(l => l.id)).not.toContain('capacitaciones');
    const r = await agent.post('/api/empleados?lista=asistencia').send({ nombre: 'Nora Ríos', aplicarEn: ['capacitaciones'] });
    expect(r.body.aplicado[0].resultado).toBe('sin permiso');
    await agent.post('/api/admin/verificar-capacitaciones').send({ password: PASSWORD_ADMIN });
    expect((await agent.get('/api/empleados/listas')).body.listas.map(l => l.id)).toContain('capacitaciones');
  });
});

describe('lo que hace el empleado', () => {
  const request = require('supertest');
  const { PASSWORD_EMPRESA } = require('./helpers');
  const Constancia = require('../models/ConstanciaCapacitacion');

  afterEach(async () => {
    // las fotos de confirmacion tambien escriben en disco
    for (const id of empresas) {
      await fs.promises.rm(path.join(__dirname, '..', 'datos', 'capacitaciones', String(id)), { recursive: true, force: true });
    }
  });

  const quiz = { activa: true, minimo: 70, preguntas: [
    { texto: 'Uno', opciones: ['a', 'b'], correcta: 0 },
    { texto: 'Dos', opciones: ['a', 'b', 'c'], correcta: 2 },
    { texto: 'Tres', opciones: ['a', 'b'], correcta: 1 }
  ] };
  const foto = Buffer.from('foto de mentira');
  const terminar = (agent, empId, capId, respuestas, conFoto) => {
    const r = agent.post(`/api/capacitaciones/mis/${empId}/caps/${capId}/terminar`);
    if (respuestas) r.field('respuestas', JSON.stringify(respuestas));
    return conFoto ? r.attach('foto', foto, { filename: 'foto.jpg', contentType: 'image/jpeg' }) : r;
  };
  async function escenario(extra = {}) {
    const { agent, empresa } = await conAdmin();
    const cocinero = await cargo(agent, 'Cocinero');
    const laura = (await persona(agent, 'Laura Pérez', cocinero.id)).body.empleado;
    const cap = (await crearCap(agent, base(extra))).body.capacitacion;
    return { agent, empresa, laura, cap, cocinero };
  }

  test('cualquiera con el dispositivo ve los nombres y lo suyo, sin clave', async () => {
    const { empresa } = await escenario();
    const otro = request.agent(app);
    await otro.post('/api/auth/login').send({ email: empresa.email, password: PASSWORD_EMPRESA });
    const g = (await otro.get('/api/capacitaciones/mis/gente')).body.gente;
    expect(g.map(x => x.nombre)).toEqual(['Laura Pérez']);
    expect((await otro.get('/api/capacitaciones/cargos')).status).toBe(401);
    const mis = (await otro.get(`/api/capacitaciones/mis/${g[0].id}`)).body;
    expect(mis.persona).toEqual({ nombre: 'Laura Pérez', cargo: 'Cocinero' });
    expect(mis.pendientes.map(p => p.titulo)).toEqual(['Manejo de residuos']);
    expect(mis.hechas).toEqual([]);
  });

  test('sin evaluación ni foto: terminar deja la constancia, una sola vez', async () => {
    const { agent, laura, cap } = await escenario();
    const r = await terminar(agent, laura._id, cap.id);
    expect(r.status).toBe(201);
    expect(r.body.constancia.nota).toBeNull();
    expect((await terminar(agent, laura._id, cap.id)).status).toBe(409);
    const mis = (await agent.get(`/api/capacitaciones/mis/${laura._id}`)).body;
    expect(mis.pendientes).toEqual([]);
    expect(mis.hechas.map(h => h.titulo)).toEqual(['Manejo de residuos']);
    // el administrador la ve como hecha
    const fila = (await resumen(agent)).gente[0];
    expect(fila.hechas[0]).toBeTruthy();
    const k = await Constancia.findOne();
    expect(k).toMatchObject({ empleadoNombre: 'Laura Pérez', cargoNombre: 'Cocinero', titulo: 'Manejo de residuos', version: 1 });
  });

  test('evaluación: califica con el servidor y exige la nota mínima', async () => {
    const { agent, laura, cap } = await escenario({ evaluacion: quiz });
    const contenido = (await agent.get(`/api/capacitaciones/mis/${laura._id}/caps/${cap.id}`)).body;
    expect(contenido.capacitacion.evaluacion.preguntas).toHaveLength(3);
    expect(JSON.stringify(contenido)).not.toContain('correcta');

    const mal = await agent.post(`/api/capacitaciones/mis/${laura._id}/caps/${cap.id}/evaluar`).send({ respuestas: [1, 0, 0] });
    expect(mal.body).toMatchObject({ nota: 0, minimo: 70, aprobada: false });
    expect((await agent.post(`/api/capacitaciones/mis/${laura._id}/caps/${cap.id}/evaluar`).send({ respuestas: [0] })).status).toBe(400);
    const regular = await agent.post(`/api/capacitaciones/mis/${laura._id}/caps/${cap.id}/evaluar`).send({ respuestas: [0, 2, 0] });
    expect(regular.body).toMatchObject({ nota: 67, aprobada: false });

    // aunque el celular diga que aprobó, el servidor vuelve a calificar
    expect((await terminar(agent, laura._id, cap.id, [1, 0, 0])).status).toBe(400);
    expect(await Constancia.countDocuments()).toBe(0);
    const bien = await terminar(agent, laura._id, cap.id, [0, 2, 1]);
    expect(bien.status).toBe(201);
    expect(bien.body.constancia.nota).toBe(100);
  });

  test('la foto de confirmación es obligatoria si la capacitación la pide', async () => {
    const { agent, laura, cap } = await escenario({ foto: true });
    expect((await terminar(agent, laura._id, cap.id)).status).toBe(400);
    const ok = await terminar(agent, laura._id, cap.id, null, true);
    expect(ok.status).toBe(201);
    expect((await Constancia.findOne()).fotoRef).toBeTruthy();
  });

  test('solo se puede hacer lo que le toca, y el material solo lo ve quien lo tiene', async () => {
    const { agent, laura, cap } = await escenario();
    const arch = await crearCap(agent, base({ titulo: 'Con archivo', materialTipo: 'archivo', enlace: '', alcance: 'cargos', cargos: [(await cargo(agent, 'Mesero')).id] }), 'cartilla.pdf');
    const soloMeseros = arch.body.capacitacion.id;
    expect((await terminar(agent, laura._id, soloMeseros)).status).toBe(403);
    expect((await agent.get(`/api/capacitaciones/mis/${laura._id}/caps/${soloMeseros}/material`)).status).toBe(403);
    expect((await agent.get(`/api/capacitaciones/mis/${laura._id}/caps/${cap.id}`)).status).toBe(200);
  });

  test('si cambian el material, la repite', async () => {
    const { agent, laura, cap } = await escenario();
    await terminar(agent, laura._id, cap.id);
    await agent.put(`/api/capacitaciones/caps/${cap.id}`).field('datos', JSON.stringify(base({ enlace: 'https://youtu.be/nuevo' })));
    const mis = (await agent.get(`/api/capacitaciones/mis/${laura._id}`)).body;
    expect(mis.hechas).toEqual([]);
    expect(mis.pendientes[0]).toMatchObject({ titulo: 'Manejo de residuos', repetir: true });
    expect((await terminar(agent, laura._id, cap.id)).status).toBe(201);
    expect(await Constancia.countDocuments()).toBe(2);
  });
});
