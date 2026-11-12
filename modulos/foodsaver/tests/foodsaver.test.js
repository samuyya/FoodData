process.env.FOODSAVER_CODIGO = 'codigo-de-prueba-1';
process.env.FOODSAVER_AVISOS_TOKEN = 'token-de-prueba';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../../server');
const Empresa = require('../../../models/Empresa');
const FsIngrediente = require('../modelos/FsIngrediente');
const FsCompra = require('../modelos/FsCompra');
const { conectarBDPrueba, limpiarBD, cerrarBDPrueba } = require('../../../tests/setup');
const { crearEmpresaLogueada, crearSuperadminLogueado, PASSWORD_EMPRESA } = require('../../../tests/helpers');
const { hoyColombia, sumarDias, diasHasta, esFechaValida } = require('../zona');
const { coincide } = require('../servicios/nombres');
const avisos = require('../servicios/avisos');

beforeAll(async () => { await conectarBDPrueba(); });
afterEach(async () => { await limpiarBD(); });
afterAll(async () => { await cerrarBDPrueba(); });

const HOGAR = { oculta: true, modulosActivos: ['foodsaver'] };
const dentro = n => sumarDias(hoyColombia(), n);

async function otroHogar(email) {
  const passwordHash = await bcrypt.hash(PASSWORD_EMPRESA, 4);
  const e = await Empresa.create({ nombre: 'Otro hogar', email, passwordHash, ...HOGAR });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email, password: PASSWORD_EMPRESA });
  return { agent, empresa: e };
}

describe('fechas y nombres', () => {
  test('cuenta los dias con la fecha de Colombia', () => {
    expect(diasHasta(dentro(3))).toBe(3);
    expect(diasHasta(dentro(-1))).toBe(-1);
    expect(esFechaValida('2026-02-30')).toBe(false);
    expect(esFechaValida('2026-11-12')).toBe(true);
  });

  test('reconoce plurales, tildes y alias', () => {
    expect(coincide('limón', 'Limones')).toBe(true);
    expect(coincide('leche', 'Leche entera')).toBe(true);
    expect(coincide('cebolla larga', 'Cebolla de rama')).toBe(true);
    expect(coincide('frijoles', 'Frijol')).toBe(true);
    expect(coincide('tomate', 'Salsa de tomate')).toBe(false);
    expect(coincide('leche', 'Crema de leche')).toBe(false);
  });
});

describe('secreto: nada se ve sin el modulo', () => {
  test('una empresa normal recibe 404 en la api y en la pagina, y su menu no trae extras', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    expect((await agent.get('/api/despensa/estado')).status).toBe(404);
    expect((await agent.get('/despensa')).status).toBe(404);
    expect((await agent.get('/despensa/app.js')).status).toBe(404);
    const me = await agent.get('/api/auth/me');
    expect(me.body.extras).toEqual([]);
  });

  test('sin sesion tambien es 404', async () => {
    expect((await request(app).get('/api/despensa/estado')).status).toBe(404);
    expect((await request(app).get('/despensa')).status).toBe(404);
  });

  test('el hogar ve su pagina y su boton en el menu, con la foto de portada', async () => {
    const { agent } = await crearEmpresaLogueada(app, { ...HOGAR, logo: '/img/logos/casa.jpg' });
    expect((await agent.get('/despensa')).status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body.extras).toHaveLength(1);
    expect(me.body.extras[0]).toMatchObject({ etiqueta: 'CaseritosN&S', ruta: '/despensa', portada: '/img/logos/casa.jpg' });
  });

  test('el archivo de avisos del service worker es publico y no nombra el modulo', async () => {
    const r = await request(app).get('/sw-avisos.js');
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/foodsaver|despensa|hogar/i);
  });
});

describe('panel secreto del superadmin', () => {
  test('la lista normal y las rutas normales no muestran hogares', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    const h = await Empresa.create({ nombre: 'Casa', email: 'casa@x.com', passwordHash: 'x', ...HOGAR });
    await Empresa.create({ nombre: 'Restaurante', email: 'r@x.com', passwordHash: 'x' });
    const lista = await agent.get('/api/superadmin/empresas');
    expect(lista.body.empresas.map(e => e.nombre)).toEqual(['Restaurante']);
    expect((await agent.get('/api/superadmin/empresas/' + h._id)).status).toBe(404);
    expect((await agent.post('/api/superadmin/empresas/' + h._id + '/desactivar')).status).toBe(404);
  });

  test('un formulario normal no puede activar el modulo', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    await agent.post('/api/superadmin/empresas').field({ nombre: 'R', email: 'r2@x.com', password: '12345678', formatosActivos: 'calidad_agua', modulosActivos: 'foodsaver' });
    const e = await Empresa.findOne({ email: 'r2@x.com' });
    expect(e.modulosActivos).not.toContain('foodsaver');
  });

  test('sin codigo todo es 404; un codigo malo no hace nada; el bueno abre el panel', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    expect((await agent.get('/api/superadmin/oculto/hogares')).status).toBe(404);
    expect((await agent.get('/api/superadmin/oculto/panel.js')).status).toBe(404);

    const malo = await agent.post('/api/superadmin/verificar-campo').send({ valor: 'cualquier-cosa' });
    expect(malo.body).toEqual({ ok: false });
    expect((await agent.get('/api/superadmin/oculto/hogares')).status).toBe(404);

    const bueno = await agent.post('/api/superadmin/verificar-campo').send({ valor: 'codigo-de-prueba-1' });
    expect(bueno.body.ok).toBe(true);
    expect((await agent.get('/api/superadmin/oculto/panel.js')).status).toBe(200);

    const creado = await agent.post('/api/superadmin/oculto/hogares').field({ nombre: 'Casa de mamá', email: 'mama@x.com', password: '12345678' });
    expect(creado.status).toBe(201);
    const e = await Empresa.findOne({ email: 'mama@x.com' }).lean();
    expect(e.oculta).toBe(true);
    expect(e.modulosActivos).toEqual(['foodsaver']);

    const lista = await agent.get('/api/superadmin/oculto/hogares');
    expect(lista.body.hogares.map(h => h.nombre)).toEqual(['Casa de mamá']);

    await agent.post('/api/superadmin/oculto/salir');
    expect((await agent.get('/api/superadmin/oculto/hogares')).status).toBe(404);
  });

  test('una empresa (no superadmin) no puede usar el codigo', async () => {
    const { agent } = await crearEmpresaLogueada(app);
    const r = await agent.post('/api/superadmin/verificar-campo').send({ valor: 'codigo-de-prueba-1' });
    expect(r.status).toBe(404);
  });

  test('eliminar un hogar exige desactivarlo y escribir su nombre, y borra sus datos', async () => {
    const { agent } = await crearSuperadminLogueado(app);
    await agent.post('/api/superadmin/verificar-campo').send({ valor: 'codigo-de-prueba-1' });
    const h = await Empresa.create({ nombre: 'Casa', email: 'casa@x.com', passwordHash: 'x', ...HOGAR });
    await FsIngrediente.create({ empresa_id: h._id, nombre: 'Leche', cantidad: 1, vence: dentro(3) });
    expect((await agent.delete('/api/superadmin/oculto/hogares/' + h._id).send({ confirmacion: 'Casa' })).status).toBe(409);
    await agent.put('/api/superadmin/oculto/hogares/' + h._id).field({ activa: 'false' });
    expect((await agent.delete('/api/superadmin/oculto/hogares/' + h._id).send({ confirmacion: 'Otra' })).status).toBe(400);
    expect((await agent.delete('/api/superadmin/oculto/hogares/' + h._id).send({ confirmacion: 'Casa' })).status).toBe(200);
    expect(await FsIngrediente.countDocuments({ empresa_id: h._id })).toBe(0);
    expect(await Empresa.exists({ _id: h._id })).toBeNull();
  });
});

describe('despensa', () => {
  test('valida lo que se escribe', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    const casos = [
      [{ nombre: '', cantidad: 1, vence: dentro(2) }, 'Escribe el nombre del producto.'],
      [{ nombre: 'Leche', cantidad: 'abc', vence: dentro(2) }, 'La cantidad debe ser un número mayor que cero.'],
      [{ nombre: 'Leche', cantidad: 0, vence: dentro(2) }, 'La cantidad debe ser un número mayor que cero.'],
      [{ nombre: 'Leche', cantidad: -2, vence: dentro(2) }, 'La cantidad debe ser un número mayor que cero.'],
      [{ nombre: 'Leche', cantidad: 1 }, 'Indica la fecha de vencimiento o marca "No perecedero".'],
      [{ nombre: 'Leche', cantidad: 1, vence: '2026-02-30' }, 'Esa fecha no es válida.']
    ];
    for (const [cuerpo, error] of casos) {
      const r = await agent.post('/api/despensa/ingredientes').send(cuerpo);
      expect(r.status).toBe(400);
      expect(r.body.error).toBe(error);
    }
    const ok = await agent.post('/api/despensa/ingredientes').send({ nombre: 'arroz', cantidad: '2,5', unidad: 'kg', ubicacion: 'alacena', perecedero: false });
    expect(ok.status).toBe(201);
    const est = await agent.get('/api/despensa/estado');
    expect(est.body.ingredientes[0]).toMatchObject({ nombre: 'Arroz', cantidad: 2.5, estado: 'nv' });
  });

  test('calcula vencido, urgente, pronto y bien, y ordena por fecha', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    for (const [nombre, d] of [['Bien', 10], ['Pronto', 4], ['Vencido', -1], ['Hoy', 0], ['Urgente', 2]]) {
      await agent.post('/api/despensa/ingredientes').send({ nombre, cantidad: 1, vence: dentro(d) });
    }
    const est = (await agent.get('/api/despensa/estado')).body;
    expect(est.ingredientes.map(i => [i.nombre, i.estado])).toEqual([['Vencido', 'venc'], ['Hoy', 'urg'], ['Urgente', 'urg'], ['Pronto', 'pro'], ['Bien', 'bien']]);
    expect(est.resumen).toMatchObject({ urgentes: 2, pronto: 1, vencidos: 1, total: 5 });
    const ins = await agent.get('/api/despensa/insignia');
    expect(ins.body.texto).toBe('3 productos vencen pronto');
  });

  test('un hogar no puede ver ni tocar lo de otro', async () => {
    const a = await crearEmpresaLogueada(app, HOGAR);
    const b = await otroHogar('otro@x.com');
    const r = await a.agent.post('/api/despensa/ingredientes').send({ nombre: 'Leche', cantidad: 1, vence: dentro(3) });
    expect((await b.agent.get('/api/despensa/estado')).body.ingredientes).toHaveLength(0);
    expect((await b.agent.put('/api/despensa/ingredientes/' + r.body.id).send({ nombre: 'X', cantidad: 1, vence: dentro(3) })).status).toBe(404);
    expect((await b.agent.post('/api/despensa/ingredientes/' + r.body.id + '/acabado')).status).toBe(404);
    expect((await b.agent.delete('/api/despensa/ingredientes/' + r.body.id)).status).toBe(404);
    expect(await FsIngrediente.countDocuments({ nombre: 'Leche' })).toBe(1);
  });

  test('queda poco y se acabó llenan la lista de compras sin repetir, y se pueden deshacer', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    const id = (await agent.post('/api/despensa/ingredientes').send({ nombre: 'Leche', cantidad: 1, vence: dentro(3) })).body.id;
    const poco = await agent.post('/api/despensa/ingredientes/' + id + '/poco');
    expect(poco.body.compraId).toBeTruthy();
    const acabo = await agent.post('/api/despensa/ingredientes/' + id + '/acabado');
    expect(acabo.body.compraId).toBeNull();
    let est = (await agent.get('/api/despensa/estado')).body;
    expect(est.ingredientes).toHaveLength(0);
    expect(est.compras.map(c => c.nombre)).toEqual(['Leche']);

    await agent.post('/api/despensa/ingredientes/' + id + '/restaurar').send({ nivel: 'poco', activo: true, compraId: poco.body.compraId });
    est = (await agent.get('/api/despensa/estado')).body;
    expect(est.ingredientes[0]).toMatchObject({ nombre: 'Leche', nivel: 'poco' });
    expect(est.compras).toHaveLength(0);
  });

  test('lo volví a comprar pone fecha nueva, reinicia avisos y lo quita de compras', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    const id = (await agent.post('/api/despensa/ingredientes').send({ nombre: 'Queso', cantidad: 1, vence: dentro(1) })).body.id;
    await FsIngrediente.updateOne({ _id: id }, { aviso1: true, aviso2: true });
    await agent.post('/api/despensa/ingredientes/' + id + '/acabado');
    expect((await agent.post('/api/despensa/ingredientes/' + id + '/recomprado').send({})).status).toBe(400);
    await agent.post('/api/despensa/ingredientes/' + id + '/recomprado').send({ vence: dentro(9) });
    const i = await FsIngrediente.findById(id).lean();
    expect(i).toMatchObject({ activo: true, vence: dentro(9), aviso1: false, aviso2: false, nivel: 'lleno' });
    expect(await FsCompra.countDocuments({ hecho: false })).toBe(0);
  });

  test('comprar desde la lista pasa el producto a la despensa y lo tacha', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    const c = await agent.post('/api/despensa/compras').send({ nombre: 'café' });
    expect((await agent.post('/api/despensa/compras').send({ nombre: 'Café' })).status).toBe(409);
    expect((await agent.post('/api/despensa/compras').send({ nombre: '  ' })).status).toBe(400);
    await agent.post('/api/despensa/ingredientes').send({ nombre: 'Café', cantidad: 1, perecedero: false, compraId: c.body.id });
    const est = (await agent.get('/api/despensa/estado')).body;
    expect(est.compras[0]).toMatchObject({ nombre: 'Café', hecho: true });
    await agent.post('/api/despensa/compras/limpiar');
    expect((await agent.get('/api/despensa/estado')).body.compras).toHaveLength(0);
  });
});

describe('recetas', () => {
  test('prioriza las que aprovechan lo que vence y excluye lo vencido', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    for (const [nombre, d] of [['Leche entera', 2], ['Moras', 3], ['Azúcar', null], ['Lulo', -1]]) {
      await agent.post('/api/despensa/ingredientes').send(d === null ? { nombre, cantidad: 1, perecedero: false } : { nombre, cantidad: 1, vence: dentro(d) });
    }
    const est = (await agent.get('/api/despensa/estado')).body;
    const mora = est.recetas.find(r => r.id === 'jugo-mora');
    expect(mora.faltan).toEqual([]);
    expect(mora.puntaje).toBe(5);
    expect(est.recetas[0].id).toBe('jugo-mora');
    expect(est.sugerencias[0]).toBe('jugo-mora');
    // el lulo esta vencido: no cuenta
    expect(est.recetas.find(r => r.id === 'jugo-lulo').faltan).toEqual(['lulo']);
  });

  test('agrega los faltantes a compras y guarda recetas propias', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    const f = await agent.post('/api/despensa/recetas/jugo-lulo/faltantes');
    expect(f.body.agregados).toBe(2);
    const est = (await agent.get('/api/despensa/estado')).body;
    expect(est.compras.map(c => c.nombre).sort()).toEqual(['Azúcar', 'Lulo']);

    expect((await agent.post('/api/despensa/recetas').send({ nombre: 'Jugo de lulo', ingredientes: [{ nombre: 'lulo' }], pasos: ['x'], porciones: 2 })).body.error).toBe('Ya hay una receta con ese nombre.');
    expect((await agent.post('/api/despensa/recetas').send({ nombre: 'Algo', ingredientes: [], pasos: ['x'], porciones: 2 })).status).toBe(400);
    const nueva = await agent.post('/api/despensa/recetas').send({ nombre: 'frijoles de la abuela', categoria: 'Plato', ingredientes: [{ nombre: 'frijoles' }, { nombre: 'cilantro', opcional: true }], pasos: ['Remojar', 'Cocinar'], porciones: 6 });
    expect(nueva.status).toBe(201);
    const r = (await agent.get('/api/despensa/estado')).body.recetas.find(x => x.id === nueva.body.id);
    expect(r).toMatchObject({ nombre: 'Frijoles de la abuela', propia: true, faltan: ['frijoles'] });
    expect((await agent.delete('/api/despensa/recetas/jugo-lulo')).status).toBe(404);
    expect((await agent.delete('/api/despensa/recetas/' + nueva.body.id)).status).toBe(200);
  });
});

describe('avisos', () => {
  test('el disparador diario pide el token', async () => {
    expect((await request(app).post('/api/despensa/avisos/ejecutar')).status).toBe(404);
    expect((await request(app).post('/api/despensa/avisos/ejecutar').set('Authorization', 'Bearer otro')).status).toBe(404);
    const ok = await request(app).post('/api/despensa/avisos/ejecutar').set('Authorization', 'Bearer token-de-prueba');
    expect(ok.status).toBe(200);
  });

  test('arma los dos avisos y no repite lo ya avisado', async () => {
    const { empresa } = await crearEmpresaLogueada(app, HOGAR);
    const mk = (nombre, d, extra) => FsIngrediente.create({ empresa_id: empresa._id, nombre, cantidad: 1, vence: dentro(d), ...extra });
    await mk('Leche', 1); await mk('Queso', 4); await mk('Pollo', 4, { aviso1: true }); await mk('Arroz', 20); await mk('Yogur', -2);
    const p = await avisos.pendientesDeAviso(empresa._id);
    expect(p.urgentes.map(i => i.nombre)).toEqual(['Leche']);
    expect(p.pronto.map(i => i.nombre)).toEqual(['Queso']);
    const m = avisos.mensajes(p);
    expect(m[0]).toBe('Úsalo ya: leche vence en 2 días o menos.');
    expect(m[1]).toBe('1 producto vence en los próximos 5 días: queso.');
  });

  test('sin telefonos no marca nada (avisara cuando se active uno)', async () => {
    const { empresa } = await crearEmpresaLogueada(app, HOGAR);
    await FsIngrediente.create({ empresa_id: empresa._id, nombre: 'Leche', cantidad: 1, vence: dentro(1) });
    await avisos.ejecutarAvisos();
    expect((await FsIngrediente.findOne({ nombre: 'Leche' }).lean()).aviso2).toBe(false);
  });

  test('ajustes valida los dias y reinicia los avisos', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    expect((await agent.put('/api/despensa/ajustes').send({ diasAviso1: 2, diasAviso2: 2 })).status).toBe(400);
    expect((await agent.put('/api/despensa/ajustes').send({ diasAviso1: 'a', diasAviso2: 1 })).status).toBe(400);
    expect((await agent.put('/api/despensa/ajustes').send({ diasAviso1: 7, diasAviso2: 3 })).status).toBe(200);
    expect((await agent.get('/api/despensa/estado')).body.ajustes).toEqual({ diasAviso1: 7, diasAviso2: 3 });
  });

  test('registrar un telefono valida los datos', async () => {
    const { agent } = await crearEmpresaLogueada(app, HOGAR);
    expect((await agent.post('/api/despensa/avisos/suscribir').send({ suscripcion: { endpoint: 'http://x' } })).status).toBe(400);
    const ok = await agent.post('/api/despensa/avisos/suscribir').send({ nombre: 'iPhone de prueba', suscripcion: { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'k', auth: 'a' } } });
    expect(ok.status).toBe(200);
    const d = await agent.get('/api/despensa/avisos/dispositivos');
    expect(d.body.dispositivos.map(x => x.nombre)).toEqual(['iPhone de prueba']);
  });
});
