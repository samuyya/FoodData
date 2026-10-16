const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const app = require('../server');
const Registro = require('../models/Registro');
const Empresa = require('../models/Empresa');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada, crearAdministrador, PASSWORD_ADMIN } = require('./helpers');

beforeAll(async () => { await conectarBDPrueba(); });
afterEach(async () => { await limpiarBD(); });
afterAll(async () => { await cerrarBDPrueba(); });

// guardar un registro tambien escribe el excel de la empresa: se borra al terminar cada test
const empresas = [];
afterEach(async () => {
  for (const id of empresas.splice(0)) {
    await fs.promises.rm(path.join(__dirname, '..', 'datos', 'excel', String(id)), { recursive: true, force: true });
  }
});

const hoyDia = new Date().getDate();
const entrarAdmin = agent => agent.post('/api/admin/verificar-elementos').send({ password: PASSWORD_ADMIN });
const guardarLista = (agent, formato, elementos, carpeta = 'cocina') => agent.put(`/api/elementos/${formato}?carpeta=${carpeta}`).send({ elementos });
const listar = (agent, formato, carpeta = 'cocina') => agent.get(`/api/elementos/${formato}?carpeta=${carpeta}`);

async function empresaConAdmin() {
  const { agent, empresa } = await crearEmpresaLogueada(app);
  await crearAdministrador(empresa._id);
  empresas.push(empresa._id);
  return { agent, empresa };
}
// los baños de ejemplo, ya configurados
async function conBanos(nombres = ['Mujeres', 'Hombres', 'Empleados']) {
  const o = await empresaConAdmin();
  await entrarAdmin(o.agent);
  const r = await guardarLista(o.agent, 'limpieza_bano', nombres.map(nombre => ({ nombre })));
  return { ...o, ids: r.body.elementos.map(e => e.id) };
}
const guardarBano = (agent, elemento, extra = {}) => agent.post('/api/registros').send({
  formatoId: 'limpieza_bano', carpeta: 'cocina', elemento, responsable: 'Laura',
  datos: { tipoLimpieza: 'Rutinaria', areas: ['Piso'] }, ...extra
});
const temp = (agent, elemento, datos, extra = {}) => agent.post('/api/registros').send({
  formatoId: 'control_temperatura', carpeta: 'cocina', elemento, responsable: 'Laura', datos, ...extra
});
const medicion1 = { tipoEquipo: 'refrigeracion', hora1: '08:00', temp1: 3.2, resultado1: 'C' };
const medicion2 = { hora2: '17:30', temp2: 3.6, resultado2: 'C' };

describe('configurar elementos (baños, neveras, llaves)', () => {
  test('configurar pide la clave de administrador', async () => {
    const { agent } = await empresaConAdmin();
    const sin = await guardarLista(agent, 'limpieza_bano', [{ nombre: 'Mujeres' }]);
    expect(sin.status).toBe(401);
    expect(sin.body.requiereClaveAdmin).toBe(true);
    expect((await entrarAdmin(agent)).status).toBe(200);
    expect((await guardarLista(agent, 'limpieza_bano', [{ nombre: 'Mujeres' }])).status).toBe(200);
  });

  test('valida los nombres, el tipo y los formatos que no admiten elementos', async () => {
    const { agent } = await empresaConAdmin();
    await entrarAdmin(agent);
    expect((await guardarLista(agent, 'limpieza_bano', [{ nombre: '  ' }])).status).toBe(400);
    const largo = await guardarLista(agent, 'limpieza_bano', [{ nombre: 'Baño de empleados 2do' }]);
    expect(largo.status).toBe(400);
    expect(largo.body.error).toContain('18');
    const repetido = await guardarLista(agent, 'limpieza_bano', [{ nombre: 'Mujeres' }, { nombre: 'mujeres' }]);
    expect(repetido.status).toBe(400);
    expect((await guardarLista(agent, 'recepcion_materias_primas', [{ nombre: 'Uno' }])).status).toBe(400);
    // en temperatura cada equipo lleva su tipo
    expect((await guardarLista(agent, 'control_temperatura', [{ nombre: 'Nevera 1' }])).status).toBe(400);
    expect((await guardarLista(agent, 'control_temperatura', [{ nombre: 'Nevera 1', tipo: 'congelacion' }])).status).toBe(200);
  });

  test('crea los elementos con su fecha de alta y cada uno cuenta sus pendientes desde ahi', async () => {
    const { agent, ids } = await conBanos();
    const r = await listar(agent, 'limpieza_bano');
    expect(r.body.configurado).toBe(true);
    expect(r.body.nombreMax).toBe(18);
    expect(r.body.elementos.map(e => e.nombre)).toEqual(['Mujeres', 'Hombres', 'Empleados']);
    // un elemento nuevo solo debe el dia de hoy, no todo el mes
    r.body.elementos.forEach(e => {
      expect(e.activo).toBe(true);
      expect(e.estado.pendientes).toEqual([hoyDia]);
      expect(e.estado.atrasados).toBe(0);
      expect(e.estado.hoyListo).toBe(false);
    });
    expect(ids).toHaveLength(3);
  });

  test('un elemento dado de alta en un mes anterior debe desde el dia 1 de este mes', async () => {
    const { agent, empresa, ids } = await conBanos(['Mujeres', 'Hombres']);
    const doc = await Empresa.findById(empresa._id);
    doc.elementos.find(e => String(e._id) === String(ids[0])).desde = '2020-01-15';
    await doc.save();
    const vieja = await agent.get(`/api/registros/pendientes/limpieza_bano?carpeta=cocina&elemento=${ids[0]}`);
    const nueva = await agent.get(`/api/registros/pendientes/limpieza_bano?carpeta=cocina&elemento=${ids[1]}`);
    expect(vieja.body.pendientes).toHaveLength(hoyDia);
    expect(nueva.body.pendientes).toEqual([hoyDia]);
    expect(vieja.body.elemento.nombre).toBe('Mujeres');
  });

  test('renombrar conserva el id y el historial', async () => {
    const { agent, empresa, ids } = await conBanos(['Mujeres', 'Hombres']);
    expect((await guardarBano(agent, ids[0])).status).toBe(201);
    const r = await guardarLista(agent, 'limpieza_bano', [{ id: ids[0], nombre: 'Baño clientes' }, { id: ids[1], nombre: 'Hombres' }]);
    expect(r.status).toBe(200);
    expect(r.body.elementos[0]).toMatchObject({ id: ids[0], nombre: 'Baño clientes' });
    expect(await Registro.countDocuments({ empresa_id: empresa._id, elemento: ids[0] })).toBe(1);
    expect((await listar(agent, 'limpieza_bano')).body.elementos[0].estado.hoyListo).toBe(true);
  });

  test('sacar de servicio conserva el historial y volver a ponerlo reinicia desde cuando cuenta', async () => {
    const { agent, empresa, ids } = await conBanos(['Mujeres', 'Hombres']);
    const doc = await Empresa.findById(empresa._id);
    doc.elementos.find(e => String(e._id) === String(ids[0])).desde = '2020-01-15';
    await doc.save();

    await guardarLista(agent, 'limpieza_bano', [{ id: ids[0], nombre: 'Mujeres', activo: false }, { id: ids[1], nombre: 'Hombres' }]);
    const fuera = await guardarBano(agent, ids[0]);
    expect(fuera.status).toBe(400);
    expect(fuera.body.error).toContain('no está en servicio');
    const resumen = await agent.get('/api/registros/resumen-pendientes');
    // 9 formatos en cocina, y el de baños cuenta solo el elemento que sigue en servicio
    expect(resumen.body.totalFormatos).toBe(9);

    await guardarLista(agent, 'limpieza_bano', [{ id: ids[0], nombre: 'Mujeres', activo: true }, { id: ids[1], nombre: 'Hombres' }]);
    const vuelve = await agent.get(`/api/registros/pendientes/limpieza_bano?carpeta=cocina&elemento=${ids[0]}`);
    expect(vuelve.body.pendientes).toEqual([hoyDia]);
  });
});

describe('llenar un formato por elemento', () => {
  test('cada elemento se guarda por separado y el mismo no se repite en el dia', async () => {
    const { agent, empresa, ids } = await conBanos();
    const a = await guardarBano(agent, ids[0]);
    expect(a.status).toBe(201);
    expect(a.body.registro.elemento).toBe(ids[0]);
    expect((await guardarBano(agent, ids[0])).status).toBe(409);
    expect((await guardarBano(agent, ids[1], { responsable: 'Andrés' })).status).toBe(201);

    expect(await Registro.countDocuments({ empresa_id: empresa._id, formato: 'limpieza_bano' })).toBe(2);
    const r = await listar(agent, 'limpieza_bano');
    expect(r.body.elementos.map(e => e.estado.hoyListo)).toEqual([true, true, false]);
  });

  test('si el formato tiene elementos hay que elegir uno, y si no los tiene no se manda ninguno', async () => {
    const { agent, ids } = await conBanos();
    const sin = await guardarBano(agent, undefined);
    expect(sin.status).toBe(400);
    expect(sin.body.error).toContain('Elige');
    expect((await guardarBano(agent, new mongoose.Types.ObjectId().toString())).status).toBe(400);

    // calidad del agua no tiene elementos configurados
    const agua = await agent.post('/api/registros').send({
      formatoId: 'calidad_agua', carpeta: 'cocina', elemento: ids[0], responsable: 'Laura', datos: {}, password: PASSWORD_ADMIN
    });
    expect(agua.status).toBe(400);
    expect(agua.body.error).toContain('no tiene elementos');
  });

  test('el aviso del menu cuenta cada elemento como una instancia', async () => {
    const { agent } = await conBanos();
    const r = await agent.get('/api/registros/resumen-pendientes');
    // 9 formatos en cocina: el de baños se vuelve 3 (uno por baño)
    expect(r.body.totalFormatos).toBe(11);
    expect(r.body.diasIncompletos).toBe(0);
  });
});

describe('formatos que se llenan en dos momentos (temperatura)', () => {
  async function conNeveras() {
    const o = await empresaConAdmin();
    await entrarAdmin(o.agent);
    const r = await guardarLista(o.agent, 'control_temperatura', [
      { nombre: 'Nevera 1', tipo: 'refrigeracion' }, { nombre: 'Congelador', tipo: 'congelacion' }
    ]);
    return { ...o, ids: r.body.elementos.map(e => e.id) };
  }

  test('se puede guardar solo la medicion 1 y queda marcado que falta la 2', async () => {
    const { agent, ids } = await conNeveras();
    const r = await temp(agent, ids[0], medicion1, { parcial: true });
    expect(r.status).toBe(201);
    expect(r.body.registro.parcial).toBe(true);
    expect(r.body.registro.mediciones).toHaveLength(1);
    expect(r.body.registro.mediciones[0]).toMatchObject({ n: 1, por: 'Laura' });
    expect(r.body.registro.datos.hora2).toBeUndefined();
    expect(r.body.info.parciales).toEqual([expect.objectContaining({ falta: [2], esHoy: true })]);

    const p = await agent.get(`/api/registros/pendientes/control_temperatura?carpeta=cocina&elemento=${ids[0]}`);
    expect(p.body.parciales[0].falta).toEqual([2]);
    // el dia ya tiene registro, asi que no bloquea ni se vuelve a pedir
    expect(p.body.pendientes).toEqual([]);

    const resumen = await agent.get('/api/registros/resumen-pendientes');
    expect(resumen.body.diasIncompletos).toBe(1);
    expect(resumen.body.formatosConPendientes).toBeGreaterThanOrEqual(1);
    const estado = (await listar(agent, 'control_temperatura')).body.elementos[0].estado;
    expect(estado.hoyListo).toBe(false);
    expect(estado.parciales).toHaveLength(1);
  });

  test('completar agrega la medicion 2, anota quien la hizo y no toca la medicion 1', async () => {
    const { agent, ids } = await conNeveras();
    const g = await temp(agent, ids[0], medicion1, { parcial: true });
    const id = g.body.registro._id;

    // la hora 2 tiene que ser posterior a la 1
    const mal = await agent.post(`/api/registros/${id}/completar`).send({ responsable: 'Andrés', datos: { hora2: '07:00', temp2: 3.0, resultado2: 'C' } });
    expect(mal.status).toBe(400);
    expect(mal.body.error).toContain('posterior');
    expect((await agent.post(`/api/registros/${id}/completar`).send({ responsable: '', datos: medicion2 })).status).toBe(400);

    // intentar pisar la medicion 1 no hace nada
    const ok = await agent.post(`/api/registros/${id}/completar`).send({ responsable: 'Andrés', datos: { ...medicion2, hora1: '01:00', temp1: -50 } });
    expect(ok.status).toBe(200);
    expect(ok.body.registro.parcial).toBe(false);
    expect(ok.body.registro.datos).toMatchObject({ hora1: '08:00', temp1: 3.2, hora2: '17:30', temp2: 3.6 });
    expect(ok.body.registro.mediciones.map(m => [m.n, m.por])).toEqual([[1, 'Laura'], [2, 'Andrés']]);
    expect(ok.body.info.parciales).toEqual([]);
    expect(ok.body.registro.responsable).toBe('Laura');

    expect((await agent.post(`/api/registros/${id}/completar`).send({ responsable: 'Andrés', datos: medicion2 })).status).toBe(409);
    expect((await agent.get('/api/registros/resumen-pendientes')).body.diasIncompletos).toBe(0);
    expect((await listar(agent, 'control_temperatura')).body.elementos[0].estado.hoyListo).toBe(true);
  });

  test('si se llenan las dos mediciones juntas el registro queda completo', async () => {
    const { agent, ids } = await conNeveras();
    const r = await temp(agent, ids[1], { ...medicion1, ...medicion2 });
    expect(r.status).toBe(201);
    expect(r.body.registro.parcial).toBe(false);
    expect(r.body.registro.mediciones).toHaveLength(2);
  });

  test('sin parcial hay que traer las dos mediciones, y parcial solo vale en formatos con dos momentos', async () => {
    const { agent, ids } = await conNeveras();
    const falta = await temp(agent, ids[0], medicion1);
    expect(falta.status).toBe(400);
    expect(falta.body.error).toContain('medición 2');
    expect((await temp(agent, ids[0], { tipoEquipo: 'refrigeracion' }, { parcial: true })).status).toBe(400);
    // la hora 2 igual o anterior a la 1 tampoco se acepta si se llenan juntas
    expect((await temp(agent, ids[0], { ...medicion1, hora2: '08:00', temp2: 3, resultado2: 'C' })).status).toBe(400);

    const banos = await guardarLista(agent, 'limpieza_bano', [{ nombre: 'Mujeres' }]);
    const noAplica = await guardarBano(agent, banos.body.elementos[0].id, { parcial: true });
    expect(noAplica.status).toBe(400);
    expect(noAplica.body.error).toContain('una sola vez');
  });

  test('completar un dia que ya paso pide la clave de administrador', async () => {
    const { agent, ids } = await conNeveras();
    const g = await temp(agent, ids[0], medicion1, { parcial: true });
    const id = g.body.registro._id;
    // lo muevo al año pasado para que ya no sea "hoy"
    await Registro.updateOne({ _id: id }, { $inc: { anio: -1 } });

    const sin = await agent.post(`/api/registros/${id}/completar`).send({ responsable: 'Andrés', datos: medicion2 });
    expect(sin.status).toBe(401);
    expect(sin.body.requiereClaveAdmin).toBe(true);
    const con = await agent.post(`/api/registros/${id}/completar`).send({ responsable: 'Andrés', datos: medicion2, password: PASSWORD_ADMIN });
    expect(con.status).toBe(200);
    expect(con.body.registro.parcial).toBe(false);
  });
});
