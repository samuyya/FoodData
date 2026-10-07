const request = require('supertest');
const app = require('../server');
const ItemInventario = require('../models/ItemInventario');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('./setup');
const { crearEmpresaLogueada, crearAdministrador, crearSuperadminLogueado, PASSWORD_ADMIN } = require('./helpers');

beforeAll(async () => { await conectarBDPrueba(); });
afterEach(async () => { await limpiarBD(); });
afterAll(async () => { await cerrarBDPrueba(); });

const CON_INVENTARIOS = { modulosActivos: ['formatos', 'inventarios'] };
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function empresaConAdmin() {
  const { agent, empresa } = await crearEmpresaLogueada(app, CON_INVENTARIOS);
  await crearAdministrador(empresa._id);
  return { agent, empresa };
}
const entrarAdmin = agent => agent.post('/api/admin/verificar-inventario').send({ password: PASSWORD_ADMIN });

describe('modulo de inventarios', () => {
  test('sin el modulo activo responde 403', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    const res = await agent.get('/api/inventario/estado');
    expect(res.status).toBe(403);
  });

  test('un ingreso de un producto nuevo crea el item sin decidir', async () => {
    const { agent } = await empresaConAdmin();
    const res = await agent.post('/api/inventario/movimientos').field({
      tipo: 'ing', fecha: hoy(), producto: 'Pechuga de pollo', cantidad: '10', costo: '180000', por: 'Laura', cat: 'Materia prima', u: 'kg'
    });
    expect(res.status).toBe(201);
    expect(res.body.nuevo).toBe(true);

    const est = await agent.get('/api/inventario/estado');
    expect(est.body.items).toHaveLength(1);
    expect(est.body.items[0].cuenta).toBeNull();
    expect(est.body.items[0].precio).toBe(18000);
    expect(est.body.hoyIngresos).toEqual({ n: 1, total: 180000 });
  });

  test('la baja exige un motivo de su categoria', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Copas de vino', cat: 'Menaje', u: 'und', cuenta: true, precio: 12000 });
    const mal = await agent.post('/api/inventario/movimientos').field({ tipo: 'baja', fecha: hoy(), producto: 'Copas de vino', cantidad: '2', costo: '24000', por: 'Laura', motivo: 'Vencido' });
    expect(mal.status).toBe(400);
    const bien = await agent.post('/api/inventario/movimientos').field({ tipo: 'baja', fecha: hoy(), producto: 'Copas de vino', cantidad: '2', costo: '24000', por: 'Laura', motivo: 'Roto' });
    expect(bien.status).toBe(201);
  });

  test('corregir un registro de otro dia pide la clave de administrador', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true });
    const r = await agent.post('/api/inventario/movimientos').field({ tipo: 'ing', fecha: '2020-01-02', producto: 'Arroz', cantidad: '5', costo: '20000', por: 'Laura' });
    const id = r.body.mov.id;

    const sin = await agent.put(`/api/inventario/movimientos/${id}`).send({ por: 'Laura', cant: 6, costo: 24000 });
    expect(sin.status).toBe(403);
    expect(sin.body.pideClave).toBe(true);

    await entrarAdmin(agent);
    const con = await agent.put(`/api/inventario/movimientos/${id}`).send({ por: 'Admin', razon: 'Eran 6', cant: 6, costo: 24000 });
    expect(con.status).toBe(200);

    const hist = await agent.get('/api/inventario/reporte?tipo=cambios');
    expect(hist.body.filas).toHaveLength(1);
    expect(hist.body.filas[0].antes.cant).toBe(5);
    expect(hist.body.filas[0].despues.cant).toBe(6);
  });

  test('los reportes piden la clave de administrador', async () => {
    const { agent } = await empresaConAdmin();
    const sin = await agent.get('/api/inventario/reporte?tipo=general');
    expect(sin.status).toBe(403);
    await entrarAdmin(agent);
    const con = await agent.get('/api/inventario/reporte?tipo=general');
    expect(con.status).toBe(200);
    expect(con.body.comprado).toBe(0);
  });

  test('inventario general: contar por partes, enviar y aprobar', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const arroz = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true, precio: 4000, precioBase: 4000 });
    const platos = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Platos', cat: 'Menaje', u: 'und', cuenta: true, precio: 9000, precioBase: 9000 });

    await agent.post('/api/inventario/conteo/iniciar');
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(arroz._id), valor: 67 });
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(arroz._id), valor: 55 });
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(platos._id), valor: 40 });
    // corregir un parcial y quitar otro
    await agent.post('/api/inventario/conteo/parcial').send({ itemId: String(arroz._id), i: 1, valor: 50 });
    await agent.post('/api/inventario/conteo/parte').send({ parte: 'todo', por: 'Laura' });

    let est = await agent.get('/api/inventario/estado');
    expect(est.body.conteo.cuentas[String(arroz._id)]).toEqual([67, 50]);
    expect(est.body.conteo.por['Materia prima']).toBe('Laura');

    await agent.post('/api/inventario/conteo/enviar');
    const sin = await agent.post('/api/inventario/conteo/aprobar');
    expect(sin.status).toBe(403);

    await entrarAdmin(agent);
    const ok = await agent.post('/api/inventario/conteo/aprobar');
    expect(ok.status).toBe(200);
    expect(ok.body.completo).toBe(true);

    est = await agent.get('/api/inventario/estado');
    expect(est.body.conteo).toBeNull();
    const it = est.body.items.find(i => i.nombre === 'Arroz');
    expect(it.conteo).toBe(117);

    const cierre = await agent.get('/api/inventario/reporte?tipo=cierre');
    expect(cierre.body.id).toBe(ok.body.id);
    expect(cierre.body.consumo.map(x => x.cat)).toEqual(['Materia prima', 'Bebidas', 'Empaques', 'Insumos']);
  });

  test('link para otros celulares: codigo, nombre y contar', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const item = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Sillas', cat: 'Mobiliario', u: 'und', cuenta: true });
    await agent.post('/api/inventario/conteo/iniciar');
    await entrarAdmin(agent);
    await agent.post('/api/inventario/conteo/acceso');
    const est = await agent.get('/api/inventario/estado');
    const { token, codigo } = est.body.conteo.acceso;

    const cel = request.agent(app);
    const malo = await cel.post(`/api/contar/${token}/entrar`).send({ codigo: codigo === '111111' ? '222222' : '111111' });
    expect(malo.status).toBe(401);
    // sin el codigo no puede contar
    expect((await cel.post(`/api/contar/${token}/sumar`).send({ itemId: String(item._id), valor: 3 })).status).toBe(401);

    expect((await cel.post(`/api/contar/${token}/entrar`).send({ codigo })).status).toBe(200);
    expect((await cel.post(`/api/contar/${token}/nombre`).send({ nombre: 'Andrés' })).status).toBe(200);
    expect((await cel.post(`/api/contar/${token}/sumar`).send({ itemId: String(item._id), valor: 24 })).status).toBe(200);

    const despues = await agent.get('/api/inventario/estado');
    expect(despues.body.conteo.cuentas[String(item._id)]).toEqual([24]);
    expect(despues.body.conteo.acceso.conectados[0].nombre).toBe('Andrés');

    // estaba contando Mobiliario sin tocar "Terminé": al enviar igual queda su nombre
    await cel.post(`/api/contar/${token}/parte`).send({ parte: 'Mobiliario' });
    await agent.post('/api/inventario/conteo/enviar');
    const enviado = await agent.get('/api/inventario/estado');
    expect(enviado.body.conteo.por.Mobiliario).toBe('Andrés');
    // y el link deja de servir
    const cerrado = await cel.get(`/api/contar/${token}`);
    expect(cerrado.body.disponible).toBe(false);
  });

  test('el link se bloquea despues de 5 codigos malos', async () => {
    const { agent } = await empresaConAdmin();
    await agent.post('/api/inventario/conteo/iniciar');
    await entrarAdmin(agent);
    await agent.post('/api/inventario/conteo/acceso');
    const { token, codigo } = (await agent.get('/api/inventario/estado')).body.conteo.acceso;
    const malo = codigo === '111111' ? '222222' : '111111';
    const cel = request.agent(app);
    for (let i = 0; i < 5; i++) await cel.post(`/api/contar/${token}/entrar`).send({ codigo: malo });
    const r = await cel.post(`/api/contar/${token}/entrar`).send({ codigo });
    expect(r.status).toBe(403);
    expect(r.body.motivo).toBe('bloqueado');
  });

  test('las ventas solo las escribe el administrador y se reemplazan por dia', async () => {
    const { agent } = await empresaConAdmin();
    const sin = await agent.post('/api/inventario/ventas').send({ fecha: '2026-02-05', comida: 100000 });
    expect(sin.status).toBe(403);
    await entrarAdmin(agent);
    expect((await agent.post('/api/inventario/ventas').send({ fecha: '2026-02-05', comida: 100000 })).status).toBe(200);
    expect((await agent.post('/api/inventario/ventas').send({ fecha: '2026-02-05', comida: 250000, dom: 50000 })).status).toBe(200);
    expect((await agent.post('/api/inventario/ventas').send({ fecha: '2999-01-01', comida: 1 })).status).toBe(400);
    const r = await agent.get('/api/inventario/reporte?tipo=foodcost');
    expect(r.body.ultimas).toEqual([{ fecha: '2026-02-05', comida: 250000, bebidas: 0, dom: 50000 }]);
  });

  test('food cost: el primer cierre es punto de partida y el segundo usa costo real y ventas', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const arroz = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true, precio: 4000, precioBase: 4000 });
    const cerveza = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Cerveza', cat: 'Bebidas', u: 'und', cuenta: true, precio: 3000, precioBase: 3000 });
    await entrarAdmin(agent);
    const contar = async (a, c) => {
      await agent.post('/api/inventario/conteo/iniciar');
      await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(arroz._id), valor: a });
      await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(cerveza._id), valor: c });
      await agent.post('/api/inventario/conteo/enviar');
      return (await agent.post('/api/inventario/conteo/aprobar')).body.id;
    };
    const primero = await contar(10, 24);
    // el primer conteo se corre al 31 de enero para tener un periodo de verdad
    const ConteoInventario = require('../models/ConteoInventario');
    await ConteoInventario.updateOne({ _id: primero }, { $set: { fechaConteo: '2026-01-31', fechaAprobado: '2026-01-31' } });
    await ItemInventario.updateMany({ empresa_id: empresa._id }, { $set: { conteoFecha: '2026-01-31' } });

    await agent.post('/api/inventario/movimientos').field({ tipo: 'ing', fecha: '2026-02-10', producto: 'Arroz', cantidad: '20', costo: '100000', por: 'Laura' });
    await agent.post('/api/inventario/movimientos').field({ tipo: 'ing', fecha: '2026-02-10', producto: 'Cerveza', cantidad: '48', costo: '144000', por: 'Laura' });
    await agent.post('/api/inventario/ventas').send({ fecha: '2026-02-05', comida: 300000, bebidas: 500000, dom: 100000 });
    const segundo = await contar(5, 12);

    const fc = (await agent.get('/api/inventario/reporte?tipo=foodcost')).body;
    expect(fc.sel.id).toBe(segundo);
    // arroz: 10 x 4.000 + 100.000 - 5 x 5.000 ; cerveza: 24 x 3.000 + 144.000 - 12 x 3.000
    expect(fc.sel.comida).toEqual({ costo: 115000, venta: 400000 });
    expect(fc.sel.bebidas).toEqual({ costo: 180000, venta: 500000 });
    expect(fc.sel.semanas.length).toBeGreaterThan(0);
    const partida = (await agent.get(`/api/inventario/reporte?tipo=foodcost&cierre=${primero}`)).body;
    expect(partida.sel.partida).toBe(true);

    // total al cierre en vez de ventas diarias
    await agent.put('/api/inventario/foodcost/ajustes').send({ modo: 'total' });
    await agent.put(`/api/inventario/cierres/${segundo}/ventas`).send({ comida: 1000000, bebidas: 600000, dom: 150000 });
    const total = (await agent.get('/api/inventario/reporte?tipo=foodcost')).body;
    expect(total.sel.comida.venta).toBe(1150000);
    expect(total.sel.semanas).toBeNull();
  });

  test('el inventario queda con la fecha en que se conto, no con la de aprobacion', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const vasos = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Vasos', cat: 'Menaje', u: 'und', cuenta: true, precio: 4000, precioBase: 4000, conteo: 40, conteoFecha: '2026-01-01' });
    await agent.post('/api/inventario/conteo/iniciar');
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(vasos._id), valor: 40 });
    await agent.post('/api/inventario/conteo/enviar');
    // se conto el 1 de febrero; el admin aprueba despues y en el medio se rompen 2 vasos
    const ConteoInventario = require('../models/ConteoInventario');
    await ConteoInventario.updateOne({ empresa_id: empresa._id, estado: 'enviado' }, { $set: { fechaConteo: '2026-02-01' } });
    await agent.post('/api/inventario/movimientos').field({ tipo: 'baja', fecha: '2026-02-03', producto: 'Vasos', cantidad: '2', costo: '8000', por: 'Laura', motivo: 'Roto' });
    await entrarAdmin(agent);
    const ap = await agent.post('/api/inventario/conteo/aprobar');
    expect(ap.status).toBe(200);

    const est = (await agent.get('/api/inventario/estado')).body;
    const it = est.items.find(i => i.nombre === 'Vasos');
    expect(it.conteoFecha).toBe('2026-02-01');
    // los 2 rotos despues del conteo se restan: deberia haber 38
    expect(it.deberia).toBe(38);
    expect(est.ultimoAprobado.fecha).toBe('2026-02-01');
    // y en el cierre no aparecen como diferencia (el conteo es el punto de partida de este item igual)
    const cierre = (await agent.get('/api/inventario/reporte?tipo=cierre')).body;
    expect(cierre.subtitulo).toContain('inventario del 1 feb');
  });

  test('el superadmin carga la plantilla de restaurante', async () => {
    const { empresa } = await crearEmpresaLogueada(app, CON_INVENTARIOS);
    const { agent } = await crearSuperadminLogueado(app);
    const r = await agent.post(`/api/inventario/items/plantilla?empresa=${empresa._id}`);
    expect(r.status).toBe(200);
    expect(r.body.agregados).toBeGreaterThan(10);
    const otra = await agent.post(`/api/inventario/items/plantilla?empresa=${empresa._id}`);
    expect(otra.body.agregados).toBe(0);
  });
});
