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

describe('inventarios: empaques, bajas ligadas a ingresos, participacion y cierre', () => {
  const ing = (agent, o) => agent.post('/api/inventario/movimientos').field({ tipo: 'ing', por: 'Laura', ...o });
  const baja = (agent, o) => agent.post('/api/inventario/movimientos').field({ tipo: 'baja', por: 'Laura', motivo: 'Vencido', ...o });
  const estado = async agent => (await agent.get('/api/inventario/estado')).body;

  test('producto nuevo que viene en bolsa: se compra por bolsas y se cuenta en litros', async () => {
    const { agent } = await empresaConAdmin();
    const r = await ing(agent, { fecha: hoy(), producto: 'Leche', cantidad: '30', costo: '90000', cat: 'Materia prima', unidadCompra: 'otra', presNombre: 'Bolsa', presCant: '1', presUnidad: 'L' });
    expect(r.status).toBe(201);
    expect(r.body.mov.cant).toBe(30);
    expect(r.body.mov.compra).toBe('30 × bolsa de 1 L');
    const it = (await estado(agent)).items[0];
    expect(it.u).toBe('L');
    expect(it.pres).toMatchObject({ nombre: 'Bolsa', cant: 1, contenido: 1, unidad: 'L' });
    expect(it.precio).toBe(3000);
  });

  test('una bolsa de 1 L en un producto que se cuenta en ml son 1000 ml', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Leche', cat: 'Materia prima', u: 'ml', cuenta: true });
    const r = await ing(agent, { fecha: hoy(), producto: 'Leche', cantidad: '30', costo: '90000', unidadCompra: 'otra', presNombre: 'Bolsa', presCant: '1', presUnidad: 'L', presRecordar: '1' });
    expect(r.status).toBe(201);
    expect(r.body.mov.cant).toBe(30000);
    const it = (await estado(agent)).items[0];
    expect(it.pres.cant).toBe(1000);
    // la proxima vez ya queda guardada: se compra por "pres"
    const otra = await ing(agent, { fecha: hoy(), producto: 'Leche', cantidad: '2', costo: '6000', unidadCompra: 'pres' });
    expect(otra.body.mov.cant).toBe(2000);
  });

  test('la presentacion tiene que ser de la misma medida del producto', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true });
    const r = await ing(agent, { fecha: hoy(), producto: 'Arroz', cantidad: '2', costo: '8000', unidadCompra: 'otra', presNombre: 'Bolsa', presCant: '1', presUnidad: 'L' });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('no se puede pasar');
    // gramos a kilos si funciona
    const ok = await ing(agent, { fecha: hoy(), producto: 'Arroz', cantidad: '4', costo: '8000', unidadCompra: 'otra', presNombre: 'Bolsa', presCant: '500', presUnidad: 'g' });
    expect(ok.body.mov.cant).toBe(2);
  });

  test('corregir un ingreso recalcula las bajas que dependian de el y las marca', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Leche', cat: 'Materia prima', u: 'L', cuenta: true });
    const primero = await ing(agent, { fecha: '2026-03-01', producto: 'Leche', cantidad: '3', costo: '30000' });
    await baja(agent, { fecha: '2026-03-02', producto: 'Leche', cantidad: '1', costo: '10000' });
    // otro ingreso mas tarde: sus bajas ya no dependen del primero
    await ing(agent, { fecha: '2026-03-05', producto: 'Leche', cantidad: '3', costo: '36000' });
    await baja(agent, { fecha: '2026-03-06', producto: 'Leche', cantidad: '1', costo: '12000' });
    await entrarAdmin(agent);

    const r = await agent.put(`/api/inventario/movimientos/${primero.body.mov.id}`).send({ por: 'Admin', razon: 'El litro valia 8.000', cant: 3, costo: 24000 });
    expect(r.status).toBe(200);
    expect(r.body.bajasActualizadas).toBe(1);

    const bajas = (await estado(agent)).bajas;
    const b1 = bajas.find(b => b.fecha === '2026-03-02'), b2 = bajas.find(b => b.fecha === '2026-03-06');
    expect(b1.costo).toBe(8000);
    expect(b1.ajuste).toMatchObject({ antes: 10000, despues: 8000 });
    expect(b2.costo).toBe(12000);
    expect(b2.ajuste).toBeNull();

    // queda anotado en el historial como cambio automatico
    const hist = (await agent.get('/api/inventario/reporte?tipo=cambios')).body.filas;
    expect(hist.some(f => f.por === 'Automático' && f.despues.costo === 8000)).toBe(true);
  });

  test('si cambia la cantidad del ingreso, el precio por unidad y las bajas tambien', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Aceite', cat: 'Materia prima', u: 'L', cuenta: true });
    const g = await ing(agent, { fecha: '2026-03-01', producto: 'Aceite', cantidad: '4', costo: '40000' });
    await baja(agent, { fecha: '2026-03-02', producto: 'Aceite', cantidad: '2', costo: '20000' });
    await entrarAdmin(agent);
    // eran 5 litros por el mismo total: el litro vale 8.000 y la baja de 2 L pasa a 16.000
    await agent.put(`/api/inventario/movimientos/${g.body.mov.id}`).send({ por: 'Admin', cant: 5, costo: 40000 });
    const b = (await estado(agent)).bajas[0];
    expect(b.costo).toBe(16000);
  });

  test('borrar un ingreso: sus bajas pasan al ingreso anterior, y sin anterior se quedan como estan', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Leche', cat: 'Materia prima', u: 'L', cuenta: true });
    await ing(agent, { fecha: '2026-03-01', producto: 'Leche', cantidad: '3', costo: '30000' });
    const segundo = await ing(agent, { fecha: '2026-03-05', producto: 'Leche', cantidad: '3', costo: '45000' });
    await baja(agent, { fecha: '2026-03-06', producto: 'Leche', cantidad: '1', costo: '15000' });
    await entrarAdmin(agent);

    const r = await agent.post(`/api/inventario/movimientos/${segundo.body.mov.id}/borrar`).send({ por: 'Admin', razon: 'Duplicado' });
    expect(r.body.bajasActualizadas).toBe(1);
    const b = (await estado(agent)).bajas[0];
    expect(b.costo).toBe(10000);
    expect(b.ajuste.razon).toContain('Se borró el ingreso');

    // el unico ingreso que queda se borra: no hay con que recalcular, la baja se queda igual
    const unico = (await estado(agent)).ingresos[0];
    const r2 = await agent.post(`/api/inventario/movimientos/${unico.id}/borrar`).send({ por: 'Admin', razon: 'Era de prueba' });
    expect(r2.body.bajasActualizadas).toBe(0);
    expect((await estado(agent)).bajas[0].costo).toBe(10000);
  });

  test('corregir algo que no cambia el precio no toca las bajas', async () => {
    const { agent, empresa } = await empresaConAdmin();
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Leche', cat: 'Materia prima', u: 'L', cuenta: true });
    const g = await ing(agent, { fecha: '2026-03-01', producto: 'Leche', cantidad: '3', costo: '30000' });
    await baja(agent, { fecha: '2026-03-02', producto: 'Leche', cantidad: '1', costo: '9000' });
    await entrarAdmin(agent);
    const r = await agent.put(`/api/inventario/movimientos/${g.body.mov.id}`).send({ por: 'Admin', cant: 3, costo: 30000, prov: 'Alpina' });
    expect(r.body.bajasActualizadas).toBe(0);
    expect((await estado(agent)).bajas[0].costo).toBe(9000);
  });

  test('quien participo en el conteo y cuanto conto: solo lo ve el administrador', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const sillas = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Sillas', cat: 'Mobiliario', u: 'und', cuenta: true });
    const arroz = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true });
    await agent.post('/api/inventario/conteo/iniciar');
    await entrarAdmin(agent);
    await agent.post('/api/inventario/conteo/acceso');
    const { token, codigo } = (await estado(agent)).conteo.acceso;

    const cel = request.agent(app);
    await cel.post(`/api/contar/${token}/entrar`).send({ codigo });
    await cel.post(`/api/contar/${token}/nombre`).send({ nombre: 'Andrés' });
    await cel.post(`/api/contar/${token}/sumar`).send({ itemId: String(sillas._id), valor: 24 });
    // en el dispositivo principal se cuenta sin nombre y se pone al guardar la parte
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(arroz._id), valor: 10 });
    await agent.post('/api/inventario/conteo/parte').send({ parte: 'Materia prima', por: 'Laura' });

    const p = (await estado(agent)).conteo.participacion;
    expect(p).toHaveLength(2);
    const andres = p.find(x => x.nombre === 'Andrés'), laura = p.find(x => x.nombre === 'Laura');
    expect(andres).toMatchObject({ cat: 'Mobiliario', celular: true, items: 1 });
    expect(laura).toMatchObject({ cat: 'Materia prima', celular: false, items: 1 });
    expect(andres.duracion).toBe('menos de 1 min');
    expect(andres.desdeTxt).toBeTruthy();

    // el celular no ve quien conto (solo el administrador)
    const visto = await cel.get(`/api/contar/${token}/conteo`);
    expect(visto.body.conteo.participacion).toBeUndefined();

    // queda guardado en el cierre
    await agent.post('/api/inventario/conteo/enviar');
    await agent.post('/api/inventario/conteo/aprobar');
    const cierre = (await agent.get('/api/inventario/reporte?tipo=cierre')).body;
    expect(cierre.participacion.map(x => x.nombre).sort()).toEqual(['Andrés', 'Laura']);
  });

  test('el tiempo de conteo cuenta desde la primera cantidad anotada y no suma las pausas largas', async () => {
    const { participacion } = require('../servicios/inventario');
    const t = min => new Date(Date.UTC(2026, 3, 1, 14, min));
    const marca = min => ({ q: 'Laura', sid: 'principal', cat: 'Bebidas', item: 'x', t: t(min) });
    // 0, 3 y 8 minutos seguidos; luego se fue una hora y volvio a anotar a los 70
    const p = participacion({ actividad: [marca(0), marca(3), marca(8), marca(70)] });
    expect(p).toHaveLength(1);
    expect(p[0].duracion).toBe('8 min');
  });

  test('cierre: gasto del mes son las compras, aparte las bajas de lo que se consume y el consumo real', async () => {
    const { agent, empresa } = await empresaConAdmin();
    const arroz = await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Arroz', cat: 'Materia prima', u: 'kg', cuenta: true, precio: 4000, precioBase: 4000 });
    await ItemInventario.create({ empresa_id: empresa._id, nombre: 'Platos', cat: 'Menaje', u: 'und', cuenta: true, precio: 9000, precioBase: 9000, conteo: 10, conteoFecha: '2026-01-01' });
    await ing(agent, { fecha: '2026-02-10', producto: 'Arroz', cantidad: '20', costo: '100000' });
    // menaje se compra pero no es consumible
    await ing(agent, { fecha: '2026-02-11', producto: 'Platos', cantidad: '4', costo: '36000' });
    await baja(agent, { fecha: '2026-02-12', producto: 'Arroz', cantidad: '2', costo: '10000' });
    await baja(agent, { fecha: '2026-02-12', producto: 'Platos', cantidad: '1', costo: '9000', motivo: 'Roto' });
    await agent.post('/api/inventario/conteo/iniciar');
    await agent.post('/api/inventario/conteo/sumar').send({ itemId: String(arroz._id), valor: 8 });
    await agent.post('/api/inventario/conteo/enviar');
    await entrarAdmin(agent);
    await agent.post('/api/inventario/conteo/aprobar');

    const c = (await agent.get('/api/inventario/reporte?tipo=cierre')).body;
    // compras de todo (arroz + platos), bajas solo de lo que se consume (el plato roto no cuenta)
    expect(c.compras).toBe(136000);
    expect(c.bajasMes).toBe(10000);
    // la formula de siempre: 0 + 100.000 - 10.000 - 8 kg a 5.000
    expect(c.gasto).toBe(50000);
    expect(c.periodo.desde).toBeNull();
  });
});
