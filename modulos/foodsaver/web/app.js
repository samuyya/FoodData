// pagina del hogar: despensa, recetas, compras y avisos.
// todo se pinta desde /api/despensa/estado; cada accion guarda y vuelve a pedir el estado
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const pad = n => String(n).padStart(2, '0');

  // fechas con la hora de Colombia, igual que el servidor
  const fmtBog = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' });
  const hoyTxt = () => fmtBog.format(new Date());
  function masDias(n) { const d = new Date(hoyTxt() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  const fechaCorta = f => new Date(f + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const S = { tab: 'hoy', ub: 'todo', q: '', rf: 'puedo', datos: null, catalogo: null, dispositivos: [], ocupado: false };
  const TABS = [
    ['hoy', 'Hoy', 'Lo urgente', '#0b7a66', '#e6f7f2', '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'],
    ['despensa', 'Despensa', 'Lo que hay en casa', '#15803d', '#e9f7ee', '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9.5 6v2M9.5 13v3"/>'],
    ['recetas', 'Recetas', 'Qué cocinar', '#a35a12', '#fbf0e4', '<path d="M4 11h16v2a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z"/><path d="M8.5 7.5c0-1.3 1-1.7 1-3M12 7.5c0-1.3 1-1.7 1-3M15.5 7.5c0-1.3 1-1.7 1-3"/>'],
    ['compras', 'Compras', 'Lo que falta', '#2a6fb0', '#e8f1fa', '<path d="M3 4h2.2l2.3 11h10.3L20 8H6.3"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>'],
    ['ajustes', 'Ajustes', 'Avisos y días', '#0e3a31', '#e7eeec', '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>']
  ];
  const UBS = ['nevera', 'congelador', 'alacena', 'otro'];
  const UNIDADES = ['und', 'kg', 'g', 'lb', 'L', 'ml', 'paquete', 'caja', 'botella', 'lata', 'bolsa', 'atado', 'otro'];

  async function api(ruta, op = {}) {
    const o = { method: op.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (op.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(op.body); }
    let r;
    try { r = await fetch('/api/despensa' + ruta, o); } catch (e) { throw new Error('No hay conexión. Revisa el internet e intenta de nuevo.'); }
    if (r.status === 401 || (r.status === 404 && ruta === '/estado')) { location.href = '/index.html'; throw new Error('Tu sesión terminó.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Algo salió mal, intenta de nuevo.');
    return d;
  }

  async function cargar() {
    S.datos = await api('/estado');
    pintar();
  }

  // estados
  function cuando(i) {
    if (!i.perecedero || i.dias === null) return 'No vence';
    const d = i.dias;
    if (d < -1) return 'Venció hace ' + (-d) + ' días';
    if (d === -1) return 'Venció ayer';
    if (d === 0) return 'Vence hoy';
    if (d === 1) return 'Vence mañana';
    return 'Vence en ' + d + ' días';
  }
  const ICONO = { venc: '✕', urg: '⚠', pro: '⚠', bien: '✓', nv: '∞' };
  const pillEstado = i => '<span class="pill ' + i.estado + '">' + ICONO[i.estado] + ' ' + cuando(i) + '</span>';
  const cuantosTxt = (n, uno, varios) => n === 1 ? uno : n + ' ' + varios;

  // pintar
  function pintarTabs() {
    const d = S.datos, r = d.resumen, pend = d.compras.filter(c => !c.hecho).length;
    const badges = { hoy: [r.urgentes + r.pronto, 'alerta'], despensa: [r.vencidos, 'alerta'], recetas: [0, ''], compras: [pend, ''], ajustes: [0, ''] };
    $('tabs').innerHTML = TABS.map(t => '<button type="button" class="tab" role="tab" data-a="tab" data-t="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '" style="--c:' + t[3] + ';--t:' + t[4] + '"><span class="tab-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + t[5] + '</svg><span class="tab-badge ' + badges[t[0]][1] + '">' + (badges[t[0]][0] || '') + '</span></span><span class="tab-tx"><b>' + t[1] + '</b><small>' + t[2] + '</small></span></button>').join('');
  }

  function pintar() {
    if (!S.datos) return;
    pintarTabs();
    const p = { hoy: panelHoy, despensa: panelDespensa, recetas: panelRecetas, compras: panelCompras, ajustes: panelAjustes }[S.tab];
    $('panel').innerHTML = p();
    if (S.tab === 'despensa') pintarLista();
    if (S.tab === 'ajustes') cargarDispositivos();
  }

  const receta = id => S.datos.recetas.find(r => r.id === id);

  function panelHoy() {
    const d = S.datos, a = d.ingredientes;
    const urg = a.filter(i => i.estado === 'urg'), pro = a.filter(i => i.estado === 'pro'), ven = a.filter(i => i.estado === 'venc');
    const hoy = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' });
    let h = '<div class="fecha-hoy">' + cap(hoy) + '</div>';
    if (!a.length) {
      return '<div class="pila">' + h + '<div class="alerta-box gris"><span class="ic" aria-hidden="true">🧺</span><b>La despensa está vacía</b><p>Agrega lo que hay en la nevera y la alacena para saber qué vence primero y qué cocinar.</p><div class="botones"><button type="button" class="btn-pri" data-a="nuevo">Agregar el primer producto</button></div></div></div>';
    }
    h += '<div class="stats"><div class="stat ' + (urg.length + pro.length ? 'pro' : '') + '"><b>' + (urg.length + pro.length) + '</b><span>Vencen pronto</span></div><div class="stat ' + (ven.length ? 'urg' : '') + '"><b>' + ven.length + '</b><span>Vencidos</span></div><div class="stat"><b>' + a.length + '</b><span>En casa</span></div></div>';
    const lista = l => l.map(i => esc(i.nombre) + ' <span style="white-space:nowrap">(' + cuando(i).toLowerCase() + ')</span>').join(', ');
    if (urg.length) h += '<div class="alerta-box rojo"><span class="ic" aria-hidden="true">⏰</span><b>Úsalos primero: vencen en ' + d.ajustes.diasAviso2 + ' días o menos</b><p>' + lista(urg) + '</p></div>';
    if (pro.length) h += '<div class="alerta-box amarillo"><span class="ic" aria-hidden="true">🗓️</span><b>Vencen en los próximos ' + d.ajustes.diasAviso1 + ' días</b><p>' + lista(pro) + '</p></div>';
    if (ven.length) h += '<div class="alerta-box gris"><span class="ic" aria-hidden="true">🗑️</span><b>' + cuantosTxt(ven.length, '1 producto vencido', 'productos vencidos') + '</b><p>' + ven.map(i => esc(i.nombre)).join(', ') + '. Revísalos y bótalos si ya no sirven.</p><div class="botones"><button type="button" class="btn-mini" data-a="tab" data-t="despensa">Ver en la despensa</button></div></div>';
    const sug = d.sugerencias.map(receta).filter(Boolean);
    if (sug.length) {
      const s = sug[0];
      h += '<section class="card sug"><span class="cat" data-c="' + s.categoria + '">' + (s.propia ? 'De la familia' : s.categoria) + '</span><div class="sug-nombre">' + esc(s.nombre) + '</div><p>Aprovecha ' + s.aprovecha.map(i => esc(i.nombre).toLowerCase()).join(' y ') + ', que ' + (s.aprovecha.length > 1 ? 'vencen' : 'vence') + ' pronto. ' + (s.faltan.length ? 'Te falta: ' + s.faltan.map(esc).join(', ') + '.' : 'Tienes todo lo necesario.') + '</p><div class="botones"><button type="button" class="btn-pri" data-a="receta" data-id="' + esc(s.id) + '">Ver receta</button>' + (s.faltan.length ? '<button type="button" class="btn-sec" data-a="faltantes" data-id="' + esc(s.id) + '">Agregar lo que falta a compras</button>' : '') + '</div>';
      if (sug.length > 1) h += '<div class="ideas"><div class="sub-h">Otras ideas para hoy</div>' + sug.slice(1).map(x => '<button type="button" class="rec" data-a="receta" data-id="' + esc(x.id) + '"><div class="rec-top"><b>' + esc(x.nombre) + '</b><span class="cat" data-c="' + x.categoria + '">' + (x.propia ? 'De la familia' : x.categoria) + '</span></div><small>' + (x.faltan.length ? 'Te falta: ' + x.faltan.map(esc).join(', ') : 'Tienes todo') + '</small></button>').join('') + '</div>';
      h += '</section>';
    } else if (!urg.length && !pro.length) {
      h += '<div class="alerta-box gris"><span class="ic" aria-hidden="true">✓</span><b>Nada vence pronto</b><p>Todo está en orden. Cuando algo esté por vencer, aquí te diremos qué cocinar con eso.</p></div>';
    }
    return '<div class="pila">' + h + '</div>';
  }

  function filaIng(i) {
    return '<button type="button" class="ing' + (i.estado === 'venc' ? ' vencido' : '') + '" data-a="ing" data-id="' + i.id + '"><span class="ing-tx"><b>' + esc(i.nombre) + '</b><small><span class="cat" data-c="' + i.ubicacion + '">' + cap(i.ubicacion) + '</span>' + esc(i.cantidad) + ' ' + esc(i.unidad) + (i.perecedero && i.vence ? ' · ' + fechaCorta(i.vence) : '') + (i.nivel === 'poco' ? ' <span class="pill poco">Queda poco</span>' : '') + '</small></span>' + pillEstado(i) + '</button>';
  }

  function panelDespensa() {
    const a = S.datos.ingredientes, cnt = u => a.filter(i => u === 'todo' || i.ubicacion === u).length;
    return '<section class="card"><div class="fila-titulo"><h2>Lo que hay en casa</h2><span class="meta">Toca un producto para marcar que se acabó</span></div>' +
      '<div class="barra-filtros"><input class="buscar" id="q" type="search" placeholder="Buscar: leche, arroz…" value="' + esc(S.q) + '" aria-label="Buscar producto"><button type="button" class="btn-pri" data-a="nuevo">+ Agregar</button></div>' +
      '<div class="chips" style="margin:.7rem 0 .4rem">' + ['todo', 'nevera', 'congelador', 'alacena'].map(u => '<button type="button" class="chip" data-a="ub" data-u="' + u + '" aria-pressed="' + (S.ub === u) + '">' + cap(u) + '<small>' + cnt(u) + '</small></button>').join('') + '</div>' +
      '<div id="lista" class="lista"></div></section>';
  }

  function pintarLista() {
    const el = $('lista'); if (!el) return;
    const all = S.datos.ingredientes, q = S.q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const a = all.filter(i => (S.ub === 'todo' || i.ubicacion === S.ub) && i.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
    if (!all.length) { el.innerHTML = '<p class="vacio">Todavía no hay nada en la despensa. Agrega tu primer producto.</p>'; return; }
    if (!a.length) { el.innerHTML = '<p class="vacio">No encontramos productos con ese nombre o en esa ubicación.</p>'; return; }
    const ven = a.filter(i => i.estado === 'venc'), pere = a.filter(i => i.estado !== 'venc' && i.estado !== 'nv'), noPere = a.filter(i => i.estado === 'nv');
    let h = '';
    if (ven.length) h += '<div class="sec-tit rojo">Vencidos · no cuentan para las recetas</div>' + ven.map(filaIng).join('');
    if (pere.length) h += '<div class="sec-tit">Por fecha de vencimiento</div>' + pere.map(filaIng).join('');
    if (noPere.length) h += '<div class="sec-tit">No perecederos</div>' + noPere.map(filaIng).join('');
    el.innerHTML = h;
  }

  function tarjetaRec(x) {
    const e = !x.faltan.length ? '<span class="estado-rec si">✓ Puedes hacerla</span>'
      : x.faltan.length <= 2 ? '<span class="estado-rec casi">Te ' + (x.faltan.length === 1 ? 'falta' : 'faltan') + ': ' + x.faltan.map(esc).join(', ') + '</span>'
        : '<span class="estado-rec no">Te faltan ' + x.faltan.length + ' ingredientes</span>';
    return '<button type="button" class="rec" data-a="receta" data-id="' + esc(x.id) + '"><div class="rec-top"><b>' + esc(x.nombre) + '</b><span class="cat" data-c="' + x.categoria + '">' + (x.propia ? 'De la familia' : x.categoria) + '</span></div>' + e +
      (x.aprovecha.length ? '<small class="aprov">Aprovecha: ' + x.aprovecha.map(i => esc(i.nombre).toLowerCase() + ' (' + cuando({ perecedero: true, dias: i.dias }).toLowerCase() + ')').join(', ') + '</small>' : '') + '</button>';
  }

  function panelRecetas() {
    const all = S.datos.recetas;
    const fs = [['puedo', 'Qué puedo cocinar'], ['Plato', 'Platos'], ['Bebida', 'Bebidas'], ['Salsa', 'Salsas'], ['Postre', 'Postres'], ['propias', 'De la familia']];
    let h = '<section class="card"><div class="fila-titulo"><h2>Recetas</h2><button type="button" class="btn-sec" data-a="nueva-rec">+ Receta de la familia</button></div><p class="ayuda">Primero salen las que usan lo que está por vencer. Lo vencido no cuenta.</p><div class="chips">' + fs.map(f => '<button type="button" class="chip" data-a="rf" data-f="' + f[0] + '" aria-pressed="' + (S.rf === f[0]) + '">' + f[1] + '</button>').join('') + '</div></section>';
    if (S.rf === 'puedo') {
      const g0 = all.filter(x => !x.faltan.length), g1 = all.filter(x => x.faltan.length >= 1 && x.faltan.length <= 2);
      h += '<div class="sec-tit">Puedes hacerla ya · ' + g0.length + '</div>' + (g0.length ? '<div class="recetas">' + g0.map(tarjetaRec).join('') + '</div>' : '<p class="vacio">Con lo que hay hoy no alcanza para ninguna completa.</p>');
      h += '<div class="sec-tit">Casi: te falta 1 o 2 cosas · ' + g1.length + '</div>' + (g1.length ? '<div class="recetas">' + g1.map(tarjetaRec).join('') + '</div>' : '<p class="vacio">Ninguna por ahora.</p>');
    } else {
      const l = S.rf === 'propias' ? all.filter(x => x.propia) : all.filter(x => x.categoria === S.rf);
      h += l.length ? '<div class="recetas">' + l.map(tarjetaRec).join('') + '</div>' : '<p class="vacio">' + (S.rf === 'propias' ? 'Aún no hay recetas de la familia. Guarda la primera con el botón de arriba.' : 'No hay recetas en esta categoría.') + '</p>';
    }
    return '<div class="pila">' + h + '</div>';
  }

  function panelCompras() {
    const c = S.datos.compras, p = c.filter(x => !x.hecho), d = c.filter(x => x.hecho);
    const fila = x => '<div class="compra' + (x.hecho ? ' hecha' : '') + '"><button type="button" class="check" data-a="' + (x.hecho ? 'desmarcar' : 'comprado') + '" data-id="' + x.id + '" aria-label="' + (x.hecho ? 'Desmarcar ' : 'Marcar como comprado: ') + esc(x.nombre) + '">' + (x.hecho ? '✓' : '') + '</button><span class="compra-tx"><b>' + esc(x.nombre) + '</b><small>' + esc(x.origen) + '</small></span><button type="button" class="btn-mini" data-a="quitar" data-id="' + x.id + '" aria-label="Quitar ' + esc(x.nombre) + '">Quitar</button></div>';
    return '<section class="card"><div class="fila-titulo"><h2>Lista de compras</h2><span class="meta">' + cuantosTxt(p.length, '1 pendiente', 'pendientes') + '</span></div><p class="ayuda">Se llena sola cuando algo se acaba o queda poco. Al marcar un producto, te preguntamos si lo pasas a la despensa.</p>' +
      '<form class="fila-add" id="f-add" novalidate><input id="nc" type="text" maxlength="60" placeholder="Agregar: papel higiénico, café…" aria-label="Producto para comprar" list="dl-cat"><button type="submit" class="btn-pri">Agregar</button></form><p class="err" id="err-c" role="alert"></p>' +
      (p.length ? p.map(fila).join('') : '<p class="vacio">No falta nada. Cuando algo se acabe, aparecerá aquí.</p>') +
      (d.length ? '<div class="sec-tit" style="margin-top:1rem">Ya comprado</div>' + d.map(fila).join('') + '<div class="acciones" style="margin-top:.6rem"><button type="button" class="btn-mini" data-a="limpiar">Limpiar lo comprado</button></div>' : '') + '</section>';
  }

  function enIphoneSinInstalar() {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const instalada = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    return ios && !instalada;
  }
  function nombreSugerido() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua)) return 'Celular Android';
    return 'Computador';
  }

  function panelAjustes() {
    const a = S.datos.ajustes;
    return '<div class="pila">' +
      '<section class="card"><h2>¿Cuándo te avisamos?</h2><p class="ayuda">Dos avisos por producto, a las 7:00 a. m. Cada uno llega una sola vez.</p><form id="f-dias" class="dias" novalidate><label class="campo"><span>Primer aviso (días antes)</span><input id="a1" type="number" inputmode="numeric" min="1" max="30" step="1" value="' + a.diasAviso1 + '"></label><label class="campo"><span>Segundo aviso (días antes)</span><input id="a2" type="number" inputmode="numeric" min="0" max="29" step="1" value="' + a.diasAviso2 + '"></label><p class="err c2" id="err-d" role="alert"></p><div class="acciones c2"><button type="submit" class="btn-pri">Guardar días</button></div></form>' +
      '<div class="regla"><span class="pill pro">⚠ ' + a.diasAviso1 + ' días antes</span> primer aviso · <span class="pill urg">⚠ ' + a.diasAviso2 + ' días antes</span> segundo aviso</div></section>' +
      '<section class="card"><h2>Avisos en el celular</h2><p class="ayuda">En iPhone funciona con FoodData instalado en la pantalla de inicio. Hay que activarlo una vez en cada teléfono.</p>' +
      (enIphoneSinInstalar() ? '<div class="alerta-box amarillo" style="margin-bottom:.8rem"><span class="ic" aria-hidden="true">📲</span><b>Abre FoodData desde el ícono de tu pantalla de inicio</b><p>En Safari: Compartir → Agregar a pantalla de inicio. Luego entra desde ese ícono y activa los avisos aquí.</p></div>' : '') +
      '<div id="dispositivos"><p class="meta">Cargando teléfonos…</p></div>' +
      '<form id="f-avisos" class="form" style="margin-top:.8rem" novalidate><label class="campo c2"><span>Nombre de este teléfono</span><input id="tel-nombre" type="text" maxlength="40" value="' + esc(nombreSugerido()) + '" placeholder="iPhone de Samuel"></label><p class="err c2" id="err-av" role="alert"></p><div class="acciones c2" style="justify-content:flex-start"><button type="submit" class="btn-pri">Activar avisos en este teléfono</button><button type="button" class="btn-sec" data-a="prueba">Enviar un aviso de prueba</button></div></form></section></div>';
  }

  async function cargarDispositivos() {
    try {
      const d = await api('/avisos/dispositivos');
      S.dispositivos = d.dispositivos;
      const el = $('dispositivos'); if (!el) return;
      el.innerHTML = d.dispositivos.length ? d.dispositivos.map(t => '<div class="dispositivo"><span aria-hidden="true">📱</span><span><b>' + esc(t.nombre) + '</b><br><small class="meta">Recibe avisos desde el ' + new Date(t.desde).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + '</small></span><button type="button" class="btn-mini" data-a="quitar-tel" data-id="' + t.id + '">Quitar</button></div>').join('') : '<p class="vacio" style="padding:.8rem">Ningún teléfono recibe avisos todavía.</p>';
    } catch (e) { const el = $('dispositivos'); if (el) el.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; }
  }

  // modales
  let focoAntes = null;
  function abrir(html) {
    focoAntes = document.activeElement;
    $('capa').innerHTML = '<div class="modal-fondo" data-a="fondo">' + html + '</div>';
    $('capa').hidden = false;
    const f = $('capa').querySelector('input:not([disabled]),button.acc,.btn-pri');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function cerrar() {
    $('capa').hidden = true; $('capa').innerHTML = '';
    if (focoAntes && document.body.contains(focoAntes)) focoAntes.focus();
  }
  const cab = (t, sub) => '<div class="modal-cab"><div><h2>' + t + '</h2>' + (sub || '') + '</div><button type="button" class="cerrar" data-a="cerrar" aria-label="Cerrar">×</button></div>';
  const ing = id => S.datos.ingredientes.find(i => i.id === id);

  function modalIng(id) {
    const i = ing(id); if (!i) return;
    const v = i.estado === 'venc';
    abrir('<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(i.nombre) + '">' + cab(esc(i.nombre), '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.35rem">' + pillEstado(i) + '<span class="cat" data-c="' + i.ubicacion + '">' + cap(i.ubicacion) + '</span><span class="meta">' + esc(i.cantidad) + ' ' + esc(i.unidad) + '</span></div>') +
      '<div class="acc-grid">' +
      (v ? '<button type="button" class="acc rojo" data-a="accion" data-x="botado" data-id="' + id + '"><span class="em" aria-hidden="true">🗑️</span><b>Botar</b><small>Ya no sirve</small></button>'
        : '<button type="button" class="acc" data-a="accion" data-x="poco" data-id="' + id + '"><span class="em" aria-hidden="true">🤏</span><b>Queda poco</b><small>Lo anoto en compras</small></button>') +
      '<button type="button" class="acc" data-a="accion" data-x="acabado" data-id="' + id + '"><span class="em" aria-hidden="true">🫙</span><b>Se acabó</b><small>Sale de la despensa y va a compras</small></button>' +
      '<button type="button" class="acc" data-a="recompra" data-id="' + id + '"><span class="em" aria-hidden="true">🛒</span><b>Lo volví a comprar</b><small>' + (i.perecedero ? 'Nueva fecha de vencimiento' : 'Vuelve a estar completo') + '</small></button>' +
      '<button type="button" class="acc" data-a="editar" data-id="' + id + '"><span class="em" aria-hidden="true">✏️</span><b>Editar</b><small>Nombre, cantidad o fecha</small></button></div>' +
      '<div class="acciones" style="justify-content:space-between"><span class="meta">' + (i.perecedero && i.vence ? 'Vence el ' + fechaCorta(i.vence) : 'No perecedero') + '</span><button type="button" class="btn-link" data-a="eliminar" data-id="' + id + '">Eliminar (lo anoté por error)</button></div></div>');
  }

  const rapidas = () => '<div class="rapidas">' + [[3, '+3 días'], [7, '+1 semana'], [14, '+2 semanas'], [30, '+1 mes']].map(r => '<button type="button" class="btn-mini" data-a="fecha-rap" data-d="' + r[0] + '">' + r[1] + '</button>').join('') + '</div>';

  function modalForm(o) {
    const d = o.d || {}, edit = !!o.id;
    const ub = d.ubicacion || 'nevera';
    abrir('<div class="modal" role="dialog" aria-modal="true" aria-label="' + (edit ? 'Editar producto' : 'Agregar a la despensa') + '">' + cab(edit ? 'Editar producto' : o.compraId ? 'Pasar a la despensa' : 'Agregar a la despensa', o.compraId ? '<p class="meta" style="margin:.2rem 0 0">Lo marcaste como comprado. Completa los datos o solo táchalo.</p>' : '') +
      '<form class="form" id="f-ing" novalidate data-id="' + (o.id || '') + '" data-compra="' + (o.compraId || '') + '">' +
      '<label class="campo c2"><span>Producto</span><input id="f-n" list="dl-cat" type="text" maxlength="60" value="' + esc(d.nombre || '') + '" placeholder="Leche, arroz, pollo…" autocomplete="off"></label>' +
      '<label class="campo"><span>Cantidad</span><input id="f-c" type="text" inputmode="decimal" value="' + esc(d.cantidad === undefined ? '' : d.cantidad) + '" placeholder="1"></label>' +
      '<label class="campo"><span>Unidad</span><select id="f-u">' + UNIDADES.map(u => '<option' + ((d.unidad || 'und') === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label>' +
      '<div class="campo c2"><span>¿Dónde está?</span><div class="chips" id="f-ub">' + UBS.map(u => '<button type="button" class="chip" data-a="f-ub" data-u="' + u + '" aria-pressed="' + (ub === u) + '">' + cap(u) + '</button>').join('') + '</div></div>' +
      '<label class="interruptor c2"><input id="f-nop" type="checkbox"' + (d.perecedero === false ? ' checked' : '') + '> No perecedero (arroz, sal, enlatados…)</label>' +
      '<label class="campo c2"><span>Fecha de vencimiento</span><input id="f-v" type="date" value="' + esc(d.vence || '') + '"' + (d.perecedero === false ? ' disabled' : '') + '>' + rapidas() + '</label>' +
      '<p class="err c2" id="err" role="alert"></p>' +
      '<div class="acciones c2">' + (o.compraId ? '<button type="button" class="btn-link" data-a="solo-tachar" data-id="' + o.compraId + '">Solo tacharlo</button>' : '') + '<button type="button" class="btn-sec" data-a="cerrar">Cancelar</button><button type="submit" class="btn-pri">' + (edit ? 'Guardar cambios' : 'Guardar') + '</button></div></form></div>');
  }

  function modalRecompra(id) {
    const i = ing(id); if (!i) return;
    abrir('<div class="modal" role="dialog" aria-modal="true" aria-label="Lo volví a comprar">' + cab('Lo volví a comprar', '<p class="meta" style="margin:.2rem 0 0">' + esc(i.nombre) + ' vuelve a estar completo.</p>') +
      '<form class="form" id="f-rec" novalidate data-id="' + id + '">' + (i.perecedero ? '<label class="campo c2"><span>Nueva fecha de vencimiento</span><input id="f-v" type="date" value="' + masDias(7) + '">' + rapidas() + '</label>' : '<p class="ayuda c2">Es no perecedero, no hace falta fecha.</p>') +
      '<p class="err c2" id="err" role="alert"></p><div class="acciones c2"><button type="button" class="btn-sec" data-a="cerrar">Cancelar</button><button type="submit" class="btn-pri">Guardar</button></div></form></div>');
  }

  function modalReceta(id) {
    const r = receta(id); if (!r) return;
    const disponibles = r.ingredientes.filter(f => f.ok && f.itemId);
    abrir('<div class="modal ancho" role="dialog" aria-modal="true" aria-label="' + esc(r.nombre) + '">' + cab(esc(r.nombre), '<div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.35rem"><span class="cat" data-c="' + r.categoria + '">' + (r.propia ? 'De la familia' : r.categoria) + '</span><span class="meta">' + r.porciones + ' porciones</span></div>') +
      (r.aprovecha.length ? '<div class="alerta-box rojo" style="padding:.6rem .8rem"><span class="ic" aria-hidden="true">⏰</span><b>Aprovecha lo que vence</b><p>' + r.aprovecha.map(i => esc(i.nombre) + ' (' + cuando({ perecedero: true, dias: i.dias }).toLowerCase() + ')').join(', ') + '</p></div>' : '') +
      '<div class="sub-h">Ingredientes</div><ul class="lista-ing">' + r.ingredientes.map(f => '<li><span class="' + (f.ok ? 'si' : 'no') + '" aria-hidden="true">' + (f.ok ? '✓' : '✕') + '</span><span>' + cap(esc(f.nombre)) + (f.opcional ? ' <small>(opcional)</small>' : '') + (f.poco ? ' <span class="pill poco">Queda poco</span>' : '') + (!f.ok && !f.opcional ? ' <small>· no hay en casa</small>' : '') + '</span></li>').join('') + '</ul>' +
      '<div class="sub-h">Preparación</div><ol class="pasos">' + r.pasos.map(p => '<li>' + esc(p) + '</li>').join('') + '</ol>' +
      (disponibles.length ? '<details class="acabo"><summary>¿Se acabó algo al cocinar?</summary><p class="meta" style="margin:.4rem 0">Opcional. Marca lo que se terminó y lo pasamos a compras.</p><div style="display:grid;gap:.35rem">' + disponibles.map(f => { const it = ing(f.itemId); return it ? '<label class="interruptor"><input type="checkbox" class="acabo-chk" value="' + it.id + '"> ' + esc(it.nombre) + '</label>' : ''; }).join('') + '</div><div class="acciones" style="margin-top:.6rem"><button type="button" class="btn-sec" data-a="acabaron">Marcar como acabados</button></div></details>' : '') +
      '<div class="acciones">' + (r.propia ? '<button type="button" class="btn-link" data-a="borrar-rec" data-id="' + esc(r.id) + '">Borrar receta</button>' : '') + (r.faltan.length ? '<button type="button" class="btn-pri" data-a="faltantes" data-id="' + esc(r.id) + '">Agregar ' + (r.faltan.length === 1 ? 'lo que falta' : 'los ' + r.faltan.length + ' que faltan') + ' a compras</button>' : '<span class="estado-rec si">✓ Tienes todo para prepararla</span>') + '</div></div>');
  }

  function modalNuevaRec() {
    abrir('<div class="modal ancho" role="dialog" aria-modal="true" aria-label="Receta de la familia">' + cab('Receta de la familia', '<p class="meta" style="margin:.2rem 0 0">Así la tiene toda la casa, y la app sabe cuándo pueden hacerla.</p>') +
      '<form class="form" id="f-nrec" novalidate><label class="campo c2"><span>Nombre</span><input id="r-n" type="text" maxlength="80" placeholder="Frijoles de la abuela"></label>' +
      '<div class="campo c2"><span>Tipo</span><div class="chips" id="r-c">' + ['Plato', 'Bebida', 'Salsa', 'Postre'].map((c, k) => '<button type="button" class="chip" data-a="r-c" data-c="' + c + '" aria-pressed="' + (k === 0) + '">' + c + '</button>').join('') + '</div></div>' +
      '<label class="campo"><span>Porciones</span><input id="r-p" type="number" inputmode="numeric" min="1" max="50" step="1" value="4"></label><span></span>' +
      '<label class="campo c2"><span>Ingredientes <em>(uno por línea; escribe "opcional" si no es indispensable)</em></span><textarea id="r-i" rows="4" placeholder="Frijoles&#10;Plátano maduro&#10;Cilantro opcional"></textarea></label>' +
      '<label class="campo c2"><span>Preparación <em>(un paso por línea)</em></span><textarea id="r-s" rows="4" placeholder="Deja los frijoles en remojo la noche anterior."></textarea></label>' +
      '<p class="err c2" id="err" role="alert"></p><div class="acciones c2"><button type="button" class="btn-sec" data-a="cerrar">Cancelar</button><button type="submit" class="btn-pri">Guardar receta</button></div></form></div>');
  }

  // toast con deshacer
  let tTimer;
  function toast(t, deshacer) {
    $('toast-tx').textContent = t;
    $('toast').hidden = false;
    $('toast-undo').hidden = !deshacer;
    $('toast-undo').onclick = async () => {
      $('toast').hidden = true;
      try { await deshacer(); await cargar(); } catch (e) { toast(e.message); }
    };
    clearTimeout(tTimer);
    tTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
  }

  async function ocupado(boton, fn) {
    if (S.ocupado) return;
    S.ocupado = true;
    if (boton) boton.disabled = true;
    try { await fn(); } finally { S.ocupado = false; if (boton && document.body.contains(boton)) boton.disabled = false; }
  }
  const errEn = (id, m) => { const e = $(id); if (e) e.textContent = m; };

  // envios de formularios
  document.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target, boton = f.querySelector('[type="submit"]');
    ocupado(boton, async () => {
      try {
        if (f.id === 'f-ing') {
          const nop = $('f-nop').checked;
          const cuerpo = {
            nombre: $('f-n').value.trim(), cantidad: $('f-c').value.trim(), unidad: $('f-u').value,
            ubicacion: (f.querySelector('#f-ub [aria-pressed="true"]') || {}).dataset.u || 'nevera',
            perecedero: !nop, vence: nop ? '' : $('f-v').value
          };
          // validacion rapida aqui; la de verdad esta en el servidor
          if (!cuerpo.nombre) return errEn('err', 'Escribe el nombre del producto.');
          const c = Number(cuerpo.cantidad.replace(',', '.'));
          if (!cuerpo.cantidad || !Number.isFinite(c) || c <= 0) return errEn('err', 'La cantidad debe ser un número mayor que cero.');
          if (!nop && !cuerpo.vence) return errEn('err', 'Indica la fecha de vencimiento o marca "No perecedero".');
          if (f.dataset.id) await api('/ingredientes/' + f.dataset.id, { method: 'PUT', body: cuerpo });
          else await api('/ingredientes', { method: 'POST', body: Object.assign(cuerpo, f.dataset.compra ? { compraId: f.dataset.compra } : {}) });
          cerrar(); await cargar(); toast(f.dataset.id ? 'Cambios guardados.' : cap(cuerpo.nombre) + ' quedó en la despensa.');
        } else if (f.id === 'f-rec') {
          const v = $('f-v') ? $('f-v').value : '';
          if ($('f-v') && !v) return errEn('err', 'Indica la nueva fecha de vencimiento.');
          const i = ing(f.dataset.id);
          await api('/ingredientes/' + f.dataset.id + '/recomprado', { method: 'POST', body: { vence: v } });
          cerrar(); await cargar(); toast((i ? i.nombre : 'El producto') + ' está completo otra vez.');
        } else if (f.id === 'f-nrec') {
          const ingredientes = $('r-i').value.split('\n').map(x => x.trim()).filter(Boolean).map(x => /opcional/i.test(x) ? { nombre: x.replace(/\(?\s*opcional\s*\)?/i, '').trim(), opcional: true } : { nombre: x, opcional: false });
          const cuerpo = { nombre: $('r-n').value.trim(), categoria: (f.querySelector('#r-c [aria-pressed="true"]') || {}).dataset.c || 'Plato', porciones: Number($('r-p').value), ingredientes, pasos: $('r-s').value.split('\n').map(x => x.trim()).filter(Boolean) };
          if (!cuerpo.nombre) return errEn('err', 'Escribe el nombre de la receta.');
          if (!ingredientes.length) return errEn('err', 'Agrega al menos un ingrediente.');
          if (!cuerpo.pasos.length) return errEn('err', 'Escribe al menos un paso.');
          await api('/recetas', { method: 'POST', body: cuerpo });
          cerrar(); S.rf = 'propias'; await cargar(); toast('Receta guardada.');
        } else if (f.id === 'f-add') {
          const v = $('nc').value.trim();
          if (!v) return errEn('err-c', 'Escribe qué hace falta comprar.');
          await api('/compras', { method: 'POST', body: { nombre: v } });
          await cargar(); const n = $('nc'); if (n) n.focus();
        } else if (f.id === 'f-dias') {
          const a1 = $('a1').value.trim(), a2 = $('a2').value.trim();
          if (!/^\d+$/.test(a1) || !/^\d+$/.test(a2)) return errEn('err-d', 'Escribe los días con números enteros.');
          await api('/ajustes', { method: 'PUT', body: { diasAviso1: Number(a1), diasAviso2: Number(a2) } });
          await cargar(); toast('Días guardados.');
        } else if (f.id === 'f-avisos') {
          await activarAvisos($('tel-nombre').value.trim());
        }
      } catch (err) {
        errEn({ 'f-add': 'err-c', 'f-dias': 'err-d', 'f-avisos': 'err-av' }[f.id] || 'err', err.message);
      }
    });
  });

  function claveABytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function activarAvisos(nombre) {
    if (enIphoneSinInstalar()) throw new Error('Abre FoodData desde el ícono de la pantalla de inicio y vuelve a intentarlo.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Este navegador no permite avisos. En iPhone, entra desde el ícono de la pantalla de inicio.');
    const c = await api('/avisos/clave');
    if (!c.disponible) throw new Error('Los avisos todavía no están configurados en el servidor.');
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') throw new Error('No diste permiso para los avisos. Puedes activarlo en Ajustes del teléfono → Notificaciones → FoodData.');
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(c.publica) });
    await api('/avisos/suscribir', { method: 'POST', body: { suscripcion: sub.toJSON(), nombre: nombre || nombreSugerido() } });
    errEn('err-av', '');
    toast('Listo. Este teléfono recibirá los avisos.');
    cargarDispositivos();
  }

  // clics
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a, id = el.dataset.id;
    if (a === 'fondo') { if (e.target === el) cerrar(); return; }
    switch (a) {
      case 'tab': irA(el.dataset.t); return;
      case 'ub': S.ub = el.dataset.u; pintar(); return;
      case 'rf': S.rf = el.dataset.f; pintar(); return;
      case 'ing': modalIng(id); return;
      case 'cerrar': cerrar(); return;
      case 'nuevo': modalForm({ d: { perecedero: true, ubicacion: ['todo'].includes(S.ub) ? 'nevera' : S.ub } }); return;
      case 'editar': modalForm({ id, d: ing(id) }); return;
      case 'recompra': modalRecompra(id); return;
      case 'receta': modalReceta(id); return;
      case 'nueva-rec': modalNuevaRec(); return;
      case 'f-ub': case 'r-c':
        el.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === el)); return;
      case 'fecha-rap': {
        const f = $('f-v');
        if (f && !f.disabled) { f.value = masDias(Number(el.dataset.d)); errEn('err', ''); }
        return;
      }
    }
    ocupado(el, async () => {
      try {
        switch (a) {
          case 'accion': {
            const x = el.dataset.x, i = ing(id);
            const r = await api('/ingredientes/' + id + '/' + x, { method: 'POST', body: {} });
            cerrar(); await cargar();
            const txt = { poco: i.nombre + ': queda poco.' + (r.compraId ? ' Lo anoté en compras.' : ''), acabado: i.nombre + ' se acabó.' + (r.compraId ? ' Lo anoté en compras.' : ''), botado: i.nombre + ' se botó.' }[x];
            toast(txt, () => api('/ingredientes/' + id + '/restaurar', { method: 'POST', body: { nivel: r.antes.nivel, activo: true, compraId: r.compraId } }));
            break;
          }
          case 'eliminar': {
            const i = ing(id);
            await api('/ingredientes/' + id, { method: 'DELETE' });
            cerrar(); await cargar();
            toast('Eliminado.', () => api('/ingredientes', { method: 'POST', body: { nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, ubicacion: i.ubicacion, perecedero: i.perecedero, vence: i.vence } }));
            break;
          }
          case 'faltantes': {
            const r = await api('/recetas/' + encodeURIComponent(id) + '/faltantes', { method: 'POST', body: {} });
            cerrar(); await cargar();
            toast(r.agregados ? (r.agregados === 1 ? 'Anoté 1 producto en compras.' : 'Anoté ' + r.agregados + ' productos en compras.') : 'Ya estaban en la lista de compras.');
            break;
          }
          case 'acabaron': {
            const ids = [...document.querySelectorAll('.acabo-chk:checked')].map(c => c.value);
            if (!ids.length) { toast('Marca al menos un producto.'); break; }
            await api('/acabados', { method: 'POST', body: { ids } });
            cerrar(); await cargar();
            toast(ids.length === 1 ? 'Listo, quedó en compras.' : 'Listo, quedaron ' + ids.length + ' en compras.');
            break;
          }
          case 'borrar-rec':
            await api('/recetas/' + id, { method: 'DELETE' });
            cerrar(); await cargar(); toast('Receta borrada.');
            break;
          case 'comprado': {
            const c = S.datos.compras.find(x => x.id === id);
            const n = c.nombre.toLowerCase();
            const previo = S.datos.ingredientes.find(i => i.nombre.toLowerCase() === n);
            const cat = (S.catalogo || []).find(x => x.nombre.toLowerCase() === n);
            modalForm({ compraId: id, d: { nombre: c.nombre, perecedero: previo ? previo.perecedero : cat ? cat.perecedero : true, ubicacion: previo ? previo.ubicacion : cat ? cat.ubicacion : 'nevera', unidad: previo ? previo.unidad : 'und', cantidad: previo ? previo.cantidad : '' } });
            break;
          }
          case 'solo-tachar':
            await api('/compras/' + id, { method: 'PUT', body: { hecho: true } });
            cerrar(); await cargar();
            break;
          case 'desmarcar':
            await api('/compras/' + id, { method: 'PUT', body: { hecho: false } });
            await cargar();
            break;
          case 'quitar': {
            const r = await api('/compras/' + id, { method: 'DELETE' });
            await cargar();
            toast(r.compra.nombre + ' salió de la lista.', () => api('/compras/restaurar', { method: 'POST', body: r.compra }));
            break;
          }
          case 'limpiar':
            await api('/compras/limpiar', { method: 'POST', body: {} });
            await cargar();
            break;
          case 'prueba': {
            const r = await api('/avisos/prueba', { method: 'POST', body: {} });
            toast(r.entregados === 1 ? 'Aviso de prueba enviado a 1 teléfono.' : 'Aviso de prueba enviado a ' + r.entregados + ' teléfonos.');
            break;
          }
          case 'quitar-tel':
            await api('/avisos/dispositivos/' + id, { method: 'DELETE' });
            cargarDispositivos();
            break;
        }
      } catch (err) {
        if (a === 'prueba') errEn('err-av', err.message); else toast(err.message);
      }
    });
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'q') { S.q = e.target.value; pintarLista(); return; }
    const form = e.target.closest && e.target.closest('form');
    if (form) form.querySelectorAll('.err').forEach(x => { x.textContent = ''; });
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'f-nop') { const f = $('f-v'); f.disabled = e.target.checked; if (e.target.checked) f.value = ''; errEn('err', ''); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('capa').hidden) cerrar(); });

  // pestanas con #hoy, #recetas... asi el boton atras y los avisos llegan a la correcta
  function irA(t) {
    if (!TABS.some(x => x[0] === t)) t = 'hoy';
    if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
    S.tab = t; pintar();
    const tabs = $('tabs'); if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', () => irA(location.hash.slice(1)));

  async function iniciar() {
    try {
      const rMe = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!rMe.ok) { location.href = '/index.html'; return; }
      const me = await rMe.json();
      if (!me.empresa) { location.href = '/index.html'; return; }
      $('est-nombre').textContent = me.empresa.nombre;
      if (me.empresa.logo) { $('est-foto').src = me.empresa.logo; $('est-foto').hidden = false; $('est-ph').hidden = true; }
      S.tab = TABS.some(x => x[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'hoy';
      await cargar();
      api('/catalogo').then(c => {
        S.catalogo = c.ingredientes;
        $('dl-cat').innerHTML = c.ingredientes.map(x => '<option value="' + esc(x.nombre) + '">').join('');
      }).catch(() => {});
    } catch (e) {
      $('panel').innerHTML = '<p class="vacio">' + esc(e.message) + ' <button type="button" class="btn-mini" id="reintentar">Reintentar</button></p>';
      const b = $('reintentar'); if (b) b.onclick = iniciar;
    }
  }
  iniciar();
})();
