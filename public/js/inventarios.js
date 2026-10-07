// modulo de inventarios: ingresos, bajas, inventario general y reportes.
// todo sale de /api/inventario/estado; despues de cada accion se vuelve a pedir
const $ = id => document.getElementById(id)
const plata = n => (n < 0 ? '−$ ' : '$ ') + Math.round(Math.abs(n)).toLocaleString('es-CO')
const num = n => (+n).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const leerPlata = s => +String(s).replace(/[^\d]/g, '') || 0
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fechaCorta = f => { if (!f) return '—'; const [, m, d] = f.split('-'); return `${+d} ${MESES[m - 1]}` }
const ICONO = { 'Materia prima': '🥩', 'Bebidas': '🍹', 'Empaques': '📦', 'Menaje': '🍽️', 'Mobiliario': '🪑', 'Insumos': '🧴', 'Otros gastos': '🔧' }
const NOMBRE_UNIDAD = { kg: 'Kilogramo', g: 'Gramo', lb: 'Libra', L: 'Litro', ml: 'Mililitro', und: 'Unidad', paquete: 'Paquete', caja: 'Caja' }

let E = null                 // lo que manda el servidor
let motivo = ''
let filtroCat = 'Todas'
let vista = 'resumen'        // resumen | contar | revisar | elegir
let parteActual = null
let editandoParcial = null   // { id, i }
let borrador = null
let selPend = {}
let catNueva = ''
let recienAprobado = null
let guardadoItem = null
let movEditando = null
let reporte = null           // el ultimo reporte pintado (para el detalle de precios y exportar)

const CATS = () => E.categorias
const CONSUMIBLE = c => E.consumibles.includes(c)
const activos = () => E.items
const enInventario = () => E.items.filter(i => i.cuenta === true)
const pendientes = () => E.items.filter(i => i.cuenta === null)
const catsConteo = () => CATS().filter(c => enInventario().some(i => i.cat === c))
const porNombre = n => activos().find(i => i.nombre.toLowerCase() === String(n).trim().toLowerCase())
const porId = id => E.items.find(i => i.id === id)
const cuentas = () => (E.conteo && E.conteo.cuentas) || {}
const contado = id => (cuentas()[id] || []).length > 0
const totalDe = id => (cuentas()[id] || []).reduce((a, n) => a + n, 0)
const pillCat = c => c ? `<span class="cat" data-c="${esc(c)}">${esc(c)}</span>` : ''
const opciones = (lista, sel) => lista.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('')

// el nombre de quien registra se recuerda en este dispositivo
const NOMBRE_KEY = 'fd_inv_nombre'
function nombreGuardado() { try { return localStorage.getItem(NOMBRE_KEY) || '' } catch (_) { return '' } }
function guardarNombre(n) { try { if (n) localStorage.setItem(NOMBRE_KEY, n) } catch (_) {} }

async function api(url, opciones = {}) {
  const o = { ...opciones }
  if (o.body && !(o.body instanceof FormData)) { o.headers = { 'Content-Type': 'application/json' }; o.body = JSON.stringify(o.body) }
  const res = await fetch(url, o)
  if (res.status === 401 && !url.includes('/api/admin/')) { window.location.href = '/index.html'; return { res, d: {} } }
  let d = {}
  try { d = await res.json() } catch (_) {}
  return { res, d }
}

// "Ahora no" en el aviso del menu: ese mes no se vuelve a sugerir en este dispositivo
function pospuesto(clave) { try { return localStorage.getItem('fd_inv_aviso_' + clave) === '1' } catch (_) { return false } }

async function cargarEstado() {
  const { res, d } = await api('/api/inventario/estado')
  if (!res.ok) throw new Error(d.error || 'No se pudo cargar')
  E = d
}
async function refrescar() { await cargarEstado(); pintarTodo() }

// lo que se cuenta aqui se pinta de una; si llega una actualizacion que salio antes
// de guardarlo, se descarta para que no "desaparezca" el numero por unos segundos
let cambios = 0
async function escribir(url, o) {
  cambios++
  const r = await api(url, o)
  cambios++
  return r
}

// clave de administrador: una vez por visita al modulo
let alAutorizar = null
function pedirAdmin(texto, cb) {
  if (E.admin) return cb()
  alAutorizar = cb
  $('modal-texto').textContent = texto
  $('admin-password').value = ''
  $('admin-msg').textContent = ''
  $('modal-admin').hidden = false
  setTimeout(() => $('admin-password').focus(), 30)
}
$('form-admin').addEventListener('submit', async e => {
  e.preventDefault()
  const btn = $('modal-ok')
  btn.disabled = true
  const { res, d } = await api('/api/admin/verificar-inventario', { method: 'POST', body: { password: $('admin-password').value } })
  btn.disabled = false
  if (!res.ok) { $('admin-msg').textContent = d.error || 'Algo salió mal, intenta de nuevo.'; return }
  E.admin = true
  $('modal-admin').hidden = true
  const cb = alAutorizar; alAutorizar = null
  if (cb) cb()
})
// si el servidor dice que hace falta la clave (ej. se vencio), la pide y reintenta
async function conClave(texto, accion) {
  const r = await accion()
  if (r && r.res && r.res.status === 403 && r.d.pideClave) {
    E.admin = false
    return new Promise(ok => pedirAdmin(texto, async () => ok(await accion())))
  }
  return r
}

// ingresos y bajas
function filaMov(m, conMotivo) {
  const atr = m.fecha < E.hoy ? `<br><span class="fecha-atr">día anterior</span>` : ''
  const etiqueta = m.cuenta === null ? ' <span class="sin-inv">nuevo</span>' : m.cuenta === false ? ' <span class="sin-inv">no se cuenta</span>' : ''
  return `<tr><td>${fechaCorta(m.fecha)}${m.fecha === E.hoy ? ' <span class="meta">(hoy)</span>' : atr}</td>
    <td>${esc(m.nombre)} ${pillCat(m.cat)}${etiqueta}<br><small class="meta">${esc(m.por)}${m.obs ? ' · ' + esc(m.obs) : ''}</small>${m.corregidoPor ? `<br><span class="sin-inv">corregido por ${esc(m.corregidoPor)}</span>` : ''}</td>
    <td class="num">${num(m.cant)} ${esc(m.u)}${m.compra ? `<span class="quien">${esc(m.compra)}</span>` : ''}</td>
    <td>${conMotivo ? `<span class="pill sal">${esc(m.motivo)}</span>${m.motivoOtro ? `<br><small class="meta">${esc(m.motivoOtro)}</small>` : ''}` : esc(m.prov || '—')}</td>
    <td class="num">${plata(m.costo)}</td>
    <td><div class="acciones-fila">${m.foto ? `<button type="button" class="btn-mini" data-ver-foto="${m.id}" aria-label="Ver foto">📷</button>` : ''}<button type="button" class="btn-mini" data-corregir-mov="${m.id}">✏️ Corregir${m.fecha === E.hoy ? '' : ' 🔒'}</button></div></td></tr>`
}
function pintarMovs() {
  const vacio = t => `<tr><td colspan="6" class="vacio">Todavía no hay ${t}.</td></tr>`
  $('tb-ingresos').innerHTML = E.ingresos.length ? E.ingresos.map(m => filaMov(m)).join('') : vacio('ingresos')
  $('tb-bajas').innerHTML = E.bajas.length ? E.bajas.map(m => filaMov(m, true)).join('') : vacio('bajas')
  $('meta-ingresos').textContent = `Hoy: ${E.hoyIngresos.n} · ${plata(E.hoyIngresos.total)}`
  $('meta-bajas').textContent = `Hoy: ${E.hoyBajas.n} · ${plata(E.hoyBajas.total)}`
}

// nombres parecidos, para no crear "pechuga pollo" si ya existe "Pechuga de pollo"
const normalizar = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(de|del|la|el|los|las|en|x)\b/g, ' ').replace(/\s+/g, ' ').trim()
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
function similares(nombre) {
  const n = normalizar(nombre)
  if (n.length < 3) return []
  return activos().filter(i => {
    const o = normalizar(i.nombre)
    if (o === n || o.includes(n) || n.includes(o)) return true
    if (distancia(o, n) <= 2) return true
    const t1 = n.split(' ').filter(w => w.length >= 4), t2 = o.split(' ')
    return t1.some(w => t2.some(x => x.length >= 4 && (x === w || distancia(x, w) <= 1)))
  }).slice(0, 3)
}

// unidades: en la lista abierta el nombre completo, ya elegida la abreviatura
const largo = u => NOMBRE_UNIDAD[u] + (NOMBRE_UNIDAD[u].toLowerCase() === u ? '' : ` (${u})`)
const opcionesUnidad = sel => E.unidades.map(u => `<option value="${u}"${u === sel ? ' selected' : ''}>${u}</option>`).join('')
function unidadesLargas(sel) { for (const o of sel.options) if (!o.dataset.fijo) o.textContent = largo(o.value) }
function unidadesCortas(sel) { for (const o of sel.options) if (!o.dataset.fijo) o.textContent = o.value }
document.addEventListener('mousedown', e => { if (e.target.matches('select.unidad')) unidadesLargas(e.target) })
document.addEventListener('focusin', e => { if (e.target.matches('select.unidad')) unidadesLargas(e.target) })
document.addEventListener('change', e => { if (e.target.matches('select.unidad')) { unidadesCortas(e.target); e.target.blur() } })
document.addEventListener('focusout', e => { if (e.target.matches('select.unidad')) unidadesCortas(e.target) })

// si el item se compra por caja/paca, el selector ofrece esa presentacion
function prepararUnidad(it) {
  const sel = $('ing-unidad')
  if (it && it.pres) {
    if (sel.dataset.item !== it.id) {
      sel.innerHTML = `<option value="${it.u}" data-fijo="1">${it.u}</option><option value="pres" data-fijo="1">${esc(it.pres.nombre)} (${it.pres.cant} ${it.u})</option>`
      sel.dataset.item = it.id
    }
    sel.disabled = false
  } else if (it) {
    if (sel.dataset.item !== it.id) { sel.innerHTML = opcionesUnidad(it.u); sel.dataset.item = it.id }
    sel.value = it.u; sel.disabled = true
  } else {
    if (sel.dataset.item || !sel.options.length) { sel.innerHTML = opcionesUnidad(); sel.dataset.item = '' }
    sel.disabled = false
  }
}
const factorUnidad = it => it && it.pres && $('ing-unidad').value === 'pres' ? it.pres.cant : 1

function infoIngreso() {
  const nombre = $('ing-producto').value.trim(), it = porNombre(nombre), box = $('ing-info')
  $('ing-nuevo').hidden = !nombre || !!it
  prepararUnidad(it)
  if (!nombre) { box.hidden = true; return }
  box.hidden = false
  if (it) {
    box.className = 'info'
    const ult = it.ultimaCompra
    const cant = +$('ing-cantidad').value * factorUnidad(it), costo = leerPlata($('ing-costo').value)
    const conv = factorUnidad(it) > 1 && cant ? `<span class="precio-alerta" style="color:var(--texto-medio)">${num(+$('ing-cantidad').value)} × ${esc(it.pres.nombre.toLowerCase())} de ${it.pres.cant} = <b>${num(cant)} ${it.u}</b></span>` : ''
    let alerta = ''
    if (ult && cant && costo) {
      const ahora = costo / cant, antes = ult.precio, v = (ahora - antes) / antes * 100
      if (antes && Math.abs(v) >= 3) alerta = `<span class="precio-alerta ${v > 0 ? 'sube' : 'baja'}">${v > 0 ? '⚠️ Está' : '✓ Está'} ${Math.abs(v).toFixed(0)} % más ${v > 0 ? 'cara' : 'barata'} que la última compra (${plata(antes)} / ${it.u} el ${fechaCorta(ult.fecha)}).</span>`
    }
    box.innerHTML = `<span>${pillCat(it.cat)} ${CONSUMIBLE(it.cat) || it.cuenta !== true || it.deberia === null ? '' : `Debería haber <b>${num(it.deberia)} ${it.u}</b>. `}${ult ? `Última compra: <b>${plata(it.precio)} / ${it.u}</b>.` : ''}${conv}${alerta}</span>`
  } else {
    const sims = similares(nombre)
    box.className = 'info nuevo'
    box.innerHTML = sims.length
      ? `<span><b>¿Quisiste decir…?</b></span><span class="sugerencias-nombre">${sims.map(s => `<button type="button" data-usar-nombre="${esc(s.nombre)}">${esc(s.nombre)}</button>`).join('')}</span><span>Si no es ninguno, es nuevo: toca qué es y elige la unidad.</span>`
      : `<span><b>"${esc(nombre)}" es nuevo.</b> Toca qué es y elige la unidad; queda creado al guardar.</span>`
  }
}
function pintarCatsNueva() {
  $('ing-cats').innerHTML = CATS().map(c => `<button type="button" class="cat-btn" data-cat-nueva="${esc(c)}" aria-pressed="${c === catNueva}"><span class="ico">${ICONO[c]}</span>${esc(c)}</button>`).join('')
}

function infoBaja() {
  const it = porNombre($('baja-producto').value), box = $('baja-info')
  if (!$('baja-producto').value.trim()) { box.hidden = true; $('baja-unidad').value = ''; pintarMotivos('Materia prima'); return }
  box.hidden = false
  if (!it) { box.className = 'info nuevo'; box.innerHTML = 'Ese producto no está registrado. Revisa el nombre.'; $('baja-unidad').value = ''; return }
  $('baja-unidad').value = it.u
  pintarMotivos(it.cat)
  const precio = it.precio || it.precioBase
  const cant = +$('baja-cantidad').value, total = cant && precio ? Math.round(cant * precio) : 0
  box.className = 'info'
  box.innerHTML = `<span>${pillCat(it.cat)} ${CONSUMIBLE(it.cat) || it.cuenta !== true || it.deberia === null ? '' : `Debería haber <b>${num(it.deberia)} ${it.u}</b>. `}` +
    (total ? `A ${plata(precio)} / ${it.u}, la pérdida sería de <b>${plata(total)}</b>.</span><button type="button" id="usar-costo" data-v="${total}">Usar este costo</button>` : (precio ? 'Escribe la cantidad para calcular el costo.</span>' : '</span>'))
}
function pintarMotivos(cat) {
  const lista = E.motivos[cat] || E.motivos['Materia prima']
  if (!lista.includes(motivo)) motivo = ''
  $('motivos').innerHTML = lista.map(m => `<button type="button" class="chip motivo" aria-pressed="${m === motivo}" data-m="${esc(m)}">${esc(m)}</button>`).join('')
  $('campo-otro').hidden = motivo !== 'Otro'
}

// fotos: se achican en el celular antes de subirlas (una factura sigue legible)
function leerFoto(input, prev) {
  const f = input.files[0]
  if (!f) return
  const lector = new FileReader()
  lector.onload = () => { prev.src = lector.result; prev.hidden = false; prev.parentElement.hidden = false }
  lector.readAsDataURL(f)
  input.value = ''
}
function quitarFoto(prev) { prev.hidden = true; prev.removeAttribute('src'); prev.parentElement.hidden = true }
function fotoComoBlob(prev) {
  if (prev.hidden || !prev.src) return Promise.resolve(null)
  return new Promise(ok => {
    const img = new Image()
    img.onload = () => {
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => ok(b), 'image/jpeg', 0.75)
    }
    img.onerror = () => ok(null)
    img.src = prev.src
  })
}

// inventario general
function estadoParte(cat) {
  const lista = enInventario().filter(i => i.cat === cat)
  const n = lista.filter(i => contado(i.id)).length
  return { n, total: lista.length, lista: n === lista.length && n > 0, curso: n > 0 && n < lista.length }
}
function lineaPend() {
  const n = pendientes().length
  if (!n) return ''
  return `<p class="nota-inv">Hay ${n} ítem${n === 1 ? '' : 's'} nuevo${n === 1 ? '' : 's'} de compras recientes. El administrador decide si se cuenta${n === 1 ? '' : 'n'}.
    <button type="button" class="btn-mini" data-accion="decidir-ahora" style="margin-left:.4rem">Decidir ahora 🔒</button></p>`
}
function selectorPend() {
  return pendientes().map(it => `<div class="pend-fila"><span><b>${esc(it.nombre)}</b> ${pillCat(it.cat)}</span>
    <div class="si-no"><button type="button" data-pend="${it.id}" data-op="si" aria-pressed="${selPend[it.id] === true}">Agregar a la lista</button><button type="button" data-pend="${it.id}" data-op="no" aria-pressed="${selPend[it.id] === false}">No agregar</button></div></div>`).join('')
}
function venceTxt(v) {
  const d = new Date(v), hoy = new Date()
  const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === hoy.toDateString() ? `hoy a las ${hora}` : `mañana (${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}) a las ${hora}`
}
const urlAcceso = a => `${location.origin}/contar/${a.token}`
function panelAcceso() {
  const a = E.conteo.acceso
  if (!a) return `<div class="fila-botones" style="margin:.8rem 0"><span class="meta">¿Vienen varias personas a contar? Cada una puede hacerlo desde su propio celular.</span><button type="button" class="btn-sec" data-accion="crear-acceso">📱 Contar desde otros celulares 🔒</button></div>`
  if (!E.admin) return `<div class="fila-botones" style="margin:.8rem 0"><span class="meta">Hay un acceso abierto para contar desde otros celulares (${a.conectados.length} conectado${a.conectados.length === 1 ? '' : 's'}).</span><button type="button" class="btn-sec" data-accion="ver-acceso">Ver código 🔒</button></div>`
  const msg = encodeURIComponent('Entra aquí para ayudar con el inventario de ' + ($('nombre-empresa').textContent || '') + ': ' + urlAcceso(a) + ' (el código te lo dicen en persona)')
  return `<div class="acceso"><div class="qr"><img src="/api/inventario/conteo/acceso/qr.svg?t=${encodeURIComponent(a.token)}" alt="Código QR del link" width="140" height="140"></div>
    <div style="display:grid;gap:.4rem;min-width:0">
      <h3>Contar desde otros celulares</h3>
      <span class="meta">Código de autorización</span>
      <span class="codigo">${a.codigo.slice(0, 3)} ${a.codigo.slice(3)}</span>
      <span class="meta">Vence ${venceTxt(a.vence)}, o cuando se envíe el inventario.${a.bloqueado ? ' <b style="color:var(--error)">El link se bloqueó por 5 intentos fallidos: ciérralo y crea uno nuevo.</b>' : ''}</span>
      <span class="link-txt">${esc(urlAcceso(a))}</span>
      <div class="botones"><button type="button" class="btn-mini" data-accion="copiar-link">Copiar link</button><a class="btn-mini" href="https://wa.me/?text=${msg}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">Enviar por WhatsApp</a><button type="button" class="btn-mini" data-accion="cerrar-acceso" style="color:var(--error)">Cerrar acceso</button></div>
      <span class="meta">Consejo: manda el link por WhatsApp y di el código en voz alta, no los dos en el mismo mensaje. Escanear el QR con la cámara también abre el link.</span>
      <b style="margin-top:.3rem">Conectados (${a.conectados.length})</b>
      ${a.conectados.length ? `<ul class="conectados">${a.conectados.map(c => `<li><span>${esc(c.nombre)} ${c.parte ? `<span class="en-parte">· contando ${esc(c.parte === 'todo' ? 'todo' : c.parte)}</span>` : ''}</span><button type="button" class="btn-mini" data-sacar="${esc(c.sid)}">Sacar</button></li>`).join('')}</ul>` : '<span class="meta">Todavía nadie ha entrado.</span>'}
    </div></div>`
}

function pintarCardInv() {
  const card = $('card-inv')
  $('card-exist').hidden = vista !== 'resumen' || !$('card-editar').hidden
  if (vista === 'elegir') {
    card.innerHTML = `<div class="fila-titulo"><h2>Ítems nuevos por decidir</h2><span class="admin-tag">🔓 Administrador</span></div>
      <p class="ayuda">Elige cuáles se agregan a la lista de conteo. Los que no toques quedan pendientes.</p>
      <div class="pend-box">${selectorPend() || '<p>No hay ítems nuevos por decidir.</p>'}</div>
      <div class="fila-botones" style="margin-top:1rem"><button type="button" class="btn-sec" data-accion="elegir-cancelar">Cancelar</button><button type="button" class="btn-pri" data-accion="elegir-guardar">Guardar</button></div>`
    return
  }
  const conteo = E.conteo
  if (!conteo) {
    if (vista !== 'resumen') vista = 'resumen'
    const ult = E.ultimoAprobado
    card.innerHTML = (recienAprobado ? `<div class="aprobado" style="margin-bottom:1rem"><div><b>✅ Inventario general de ${esc(recienAprobado.mes)} aprobado.</b><p>Las existencias quedaron actualizadas. ¿Quieres ver cómo cerró el mes frente al anterior?</p></div>
        <button type="button" class="btn-pri" data-accion="ver-cierre">Ver reporte del cierre</button></div>` : '') +
      `<div class="fila-botones"><div><h2>Inventario general</h2><p class="meta" style="margin:.2rem 0 0">${ult ? `Último inventario: ${fechaCorta(ult.fecha)} (cierre de ${esc(ult.mes)})${ult.aprobado && ult.aprobado !== ult.fecha ? `, aprobado el ${fechaCorta(ult.aprobado)}` : ''}` : 'Todavía no se ha hecho ninguno.'}</p></div>
      <button type="button" class="${recienAprobado ? 'btn-sec' : 'btn-pri'}" data-accion="iniciar">Iniciar inventario general</button></div>
      ${lineaPend()}<p class="ayuda" style="margin:.8rem 0 0">Se cuenta todo: en menaje y mobiliario sirve para validar que esté todo; en materia prima, bebidas e insumos, para saber cuánto quedó al cierre y calcular cuánto se gastó en el mes. Se puede repartir por partes, y las existencias solo cambian cuando el administrador lo aprueba.</p>`
    return
  }
  if (vista === 'resumen') {
    const partes = catsConteo().map(c => ({ c, ...estadoParte(c), por: conteo.por[c] }))
    const listas = partes.filter(p => p.lista).length
    card.innerHTML = `<div class="fila-botones"><div><h2>Inventario general en curso</h2><p class="meta" style="margin:.2rem 0 0">Cierre de ${esc(conteo.mesNombre)} · ${listas} de ${partes.length} partes listas</p></div>
      <button type="button" class="btn-sec" data-contar="todo">Contar todo de una vez</button></div>
      ${conteo.nota ? `<p class="nota-inv">${esc(conteo.nota)}</p>` : ''}${lineaPend()}${conteo.estado === 'curso' ? panelAcceso() : ''}<p class="ayuda" style="margin:.8rem 0 .2rem">Elige una parte para contarla. Cada persona puede tomar una parte distinta.</p>
      <div class="partes">${partes.length ? partes.map(p => `<div class="parte${p.lista ? ' lista' : ''}">${pillCat(p.c)}
        <span class="estado ${p.lista ? 'lista' : p.curso ? 'curso' : 'pend'}">${p.lista ? '✓ Lista' : p.curso ? `En curso · ${p.n} de ${p.total}` : `Sin empezar · ${p.total} ítems`}</span>
        ${p.por ? `<span class="meta">Contó: ${esc(p.por)}</span>` : ''}
        <button type="button" class="btn-mini" data-contar="${esc(p.c)}">${p.lista ? 'Revisar' : p.curso ? 'Seguir contando' : 'Contar esta parte'}</button></div>`).join('') : '<p class="meta">La lista de conteo está vacía. El administrador puede agregar ítems con "Editar lista".</p>'}</div>
      ${conteo.estado === 'enviado'
        ? `<div class="esperando"><span><b>Enviado al administrador${conteo.fechaConteo ? ` el ${fechaCorta(conteo.fechaConteo)}` : ''}.</b> El inventario queda con fecha de ese día y las existencias se actualizan cuando lo apruebe.</span><button type="button" class="btn-pri" data-accion="revisar">Revisar y aprobar 🔒</button></div>`
        : `<div class="fila-botones"><span class="meta">${partes.length && listas === partes.length ? 'Todo contado. Ya se puede enviar.' : 'Puedes enviarlo aunque falten partes; solo se actualizan los ítems contados.'}</span>
          <div class="botones"><button type="button" class="btn-sec" data-accion="cancelar-inv">Descartar</button><button type="button" class="btn-pri" data-accion="enviar" ${partes.some(p => p.n) ? '' : 'disabled'}>Enviar al administrador</button></div></div>`}`
    return
  }
  if (vista === 'contar') {
    if (conteo.estado !== 'curso') { vista = 'resumen'; return pintarCardInv() }
    const cats = parteActual === 'todo' ? catsConteo() : [parteActual]
    const escrito = $('contar-por') ? $('contar-por').value : null
    card.innerHTML = `<div class="fila-botones"><div><h2>${parteActual === 'todo' ? 'Contar todo' : 'Contar: ' + esc(parteActual)}</h2>
      <p class="meta" style="margin:.2rem 0 0">Escribe lo que cuentes y toca <b>Sumar</b>. Si cuentas el mismo ítem en otro lugar, vuelve a sumar y se acumula. Toca un número para corregirlo o × para quitarlo. Todo se guarda solo: si se cae la señal o se cierra la app, no se pierde lo contado.</p></div>
      <button type="button" class="btn-sec" data-accion="volver-partes">← Partes</button></div>` +
      cats.map(c => `<div class="contar-grupo"><h3>${pillCat(c)} <span class="meta">${estadoParte(c).n} de ${estadoParte(c).total} contados · ${CONSUMIBLE(c) ? 'cuenta lo que quedó' : 'cuenta lo que hay'}</span></h3>` +
        enInventario().filter(i => i.cat === c).map(filaContar).join('') + '</div>').join('') +
      `<div class="pie-conteo"><label class="campo"><span>Contado por</span><input id="contar-por" value="${esc(escrito ?? nombreGuardado())}" placeholder="Tu nombre"></label>
        <div class="botones"><span class="msg" id="msg-contar"></span><button type="button" class="btn-pri" data-accion="guardar-parte">Guardar y volver</button></div></div>`
    return
  }
  if (vista === 'revisar') {
    const lista = enInventario()
    const contados = lista.filter(i => contado(i.id))
    const sin = lista.filter(i => !contado(i.id))
    const pend = pendientes()
    card.innerHTML = `<div class="fila-titulo"><h2>Revisar el conteo</h2><span class="admin-tag">🔓 Administrador</span></div>
      <p class="ayuda">Revisa que lo contado tenga sentido antes de aprobarlo. Al aprobar, estas cantidades pasan a ser las existencias reales. Las diferencias frente al mes anterior las ves después en Reportes.</p>
      ${conteo.fechaConteo ? `<p class="nota-inv" style="margin:0 0 .4rem">Se contó el <b>${fechaCorta(conteo.fechaConteo)}</b>: el inventario queda con esa fecha aunque lo apruebes después. Lo que se registre después de ese día cuenta para el siguiente periodo.</p>` : ''}
      ${CATS().map(c => {
        const l = contados.filter(i => i.cat === c)
        if (!l.length) return ''
        return `<h3 class="sub-tabla">${pillCat(c)} <span class="meta">contó ${esc(conteo.por[c] || '—')}</span></h3>
        <div class="tabla-scroll"><table><thead><tr><th>Ítem</th><th class="num">Contado</th><th>Cómo se contó</th></tr></thead><tbody>
        ${l.map(it => `<tr><td>${esc(it.nombre)}</td><td class="num"><b>${num(totalDe(it.id))}</b> ${it.u}</td><td class="meta">${(cuentas()[it.id] || []).map(num).join(' + ')}</td></tr>`).join('')}</tbody></table></div>`
      }).join('')}
      ${pend.length ? `<div class="pend-box" style="margin-top:1rem"><b>Hay ${pend.length} ítem${pend.length === 1 ? ' nuevo que no se contó' : 's nuevos que no se contaron'} en este inventario.</b>
        <p>Elige cuáles se agregan a la lista. Si agregas alguno, el inventario vuelve a conteo para contarlos antes de aprobar; los que no agregues quedan fuera (se puede cambiar después en "Editar lista").</p>
        ${selectorPend()}
        <div class="botones"><button type="button" class="btn-pri" data-accion="pend-aplicar">Guardar selección</button></div></div>` : ''}
      ${sin.length ? `<p class="info nuevo" style="margin-top:1rem"><span><b>${sin.length} ítem${sin.length === 1 ? '' : 's'} sin contar:</b> ${sin.map(i => esc(i.nombre)).join(', ')}. Se quedan como están.</span></p>` : ''}
      <div class="fila-botones" style="margin-top:1rem"><button type="button" class="btn-sec" data-accion="devolver">Devolver para recontar</button>
        <button type="button" class="btn-pri" data-accion="aprobar" ${contados.length ? '' : 'disabled'}>Aprobar y actualizar existencias</button></div>`
  }
}

function filaContar(it) {
  const parciales = cuentas()[it.id] || []
  const chips = parciales.map((n, i) => editandoParcial && editandoParcial.id === it.id && editandoParcial.i === i
    ? `<span class="parcial"><input type="number" min="0" step="any" value="${n}" data-editar-parcial="${it.id}:${i}" aria-label="Corregir cantidad"></span>`
    : `<span class="parcial"><button type="button" data-corregir="${it.id}:${i}" title="Corregir">${num(n)}</button><button type="button" class="quitar" data-quitar="${it.id}:${i}" aria-label="Quitar ${num(n)}">×</button></span>`
  ).join('<span class="mas">+</span>')
  return `<div class="item-conteo"><div class="nombre"><b>${esc(it.nombre)}</b><span class="meta">en ${it.u}</span></div>
    <div class="parciales">${chips}${parciales.length ? `<span class="total-item">= ${num(totalDe(it.id))} ${it.u}</span>` : '<span class="total-item vacio">Sin contar</span>'}${guardadoItem === it.id ? '<span class="guardado-ok">✓ Guardado</span>' : ''}</div>
    <div class="sumar"><input type="number" min="0" step="any" placeholder="0" data-sumar-input="${it.id}" aria-label="Cantidad contada de ${esc(it.nombre)}"><button type="button" data-sumar="${it.id}">${parciales.length ? '+ Sumar' : 'Agregar'}</button></div></div>`
}

function pintarLista() {
  $('filtro-cat').innerHTML = ['Todas', ...catsConteo()].map(c => `<button type="button" class="chip" aria-pressed="${c === filtroCat}" data-fc="${esc(c)}">${esc(c)}</button>`).join('')
  const q = $('buscar').value.trim().toLowerCase()
  const lista = enInventario().filter(i => (filtroCat === 'Todas' || i.cat === filtroCat) && (!q || i.nombre.toLowerCase().includes(q)))
  const cats = catsConteo().filter(c => lista.some(i => i.cat === c))
  $('lista-general').innerHTML = cats.length ? cats.map(c => {
    const l = lista.filter(i => i.cat === c)
    return `<div class="grupo-lista"><h3>${pillCat(c)} <span class="meta">${l.length} ítem${l.length === 1 ? '' : 's'}</span></h3>
      <ul class="nombres">${l.map(i => `<li>${esc(i.nombre)}</li>`).join('')}</ul></div>`
  }).join('') : `<p class="vacio">${enInventario().length ? 'No hay ítems con ese filtro.' : 'La lista está vacía. El administrador puede agregar ítems con "Editar lista".'}</p>`
  pintarCardInv()
}

// editar lista (solo administrador)
function abrirEditar() {
  borrador = activos().map(i => ({ id: i.id, nombre: i.nombre, cat: i.cat, u: i.u, precio: i.precio, presNombre: i.pres ? i.pres.nombre : '', presCant: i.pres ? i.pres.cant : '', cuenta: i.cuenta, costoDe: i.costoDe }))
  $('card-editar').hidden = false
  pintarEditar()
  $('card-editar').scrollIntoView({ block: 'start' })
}
// materia prima y bebidas eligen si cuentan como comida o bebidas en el food cost (ej. vino para cocinar)
function celdaCostoDe(it, k) {
  if (it.cat === 'Materia prima' || it.cat === 'Bebidas') {
    return `<select data-ed="${k}:costoDe" aria-label="Cuenta en el food cost como">${opciones(['Comida', 'Bebidas'], it.costoDe || (it.cat === 'Bebidas' ? 'Bebidas' : 'Comida'))}</select>`
  }
  return `<span class="costo-de">${it.cat === 'Empaques' ? 'Comida, si el ajuste los suma' : 'No entra'}</span>`
}
function pintarEditar() {
  const ops = activos().map(i => `<option value="${i.id}">${esc(i.nombre)} (${i.u})</option>`).join('')
  $('unir-de').innerHTML = ops; $('unir-a').innerHTML = ops
  const p = pendientes()
  $('editar-pend').innerHTML = p.length ? `<div class="pend-box" style="margin-top:1rem"><b>${p.length} ítem${p.length === 1 ? '' : 's'} nuevo${p.length === 1 ? '' : 's'} por decidir</b>
    <p>Entraron por compras. Elige si se agregan a la lista de conteo.</p>${selectorPend()}
    <div class="botones"><button type="button" class="btn-pri" data-accion="editar-pend-guardar">Guardar selección</button></div></div>` : ''
  $('tb-editar').innerHTML = borrador.map((it, k) => `<tr class="${it.borrar ? 'fila-borrada' : ''}">
    <td><input value="${esc(it.nombre)}" data-ed="${k}:nombre" aria-label="Nombre">${it.cuenta === null ? '<span class="sin-inv">nuevo, sin decidir</span>' : ''}</td>
    <td><select data-ed="${k}:cat" aria-label="Categoría">${opciones(CATS(), it.cat)}</select></td>
    <td><select class="unidad" data-ed="${k}:u" aria-label="Unidad">${opcionesUnidad(it.u)}</select></td>
    <td><div class="pesos"><input inputmode="numeric" value="${it.precio ? Math.round(it.precio).toLocaleString('es-CO') : ''}" data-ed="${k}:precio" aria-label="Valor por unidad"></div></td>
    <td><div class="presentacion"><input placeholder="Ej. Caja" data-ed="${k}:presNombre" value="${esc(it.presNombre)}" style="width:84px" aria-label="Presentación de compra"><span class="meta">de</span><input type="number" min="2" placeholder="24" data-ed="${k}:presCant" value="${esc(it.presCant)}" style="width:62px" aria-label="Cuántas unidades trae"></div></td>
    <td style="text-align:center"><input type="checkbox" ${it.cuenta ? 'checked' : ''} data-ed="${k}:cuenta" aria-label="Se cuenta en el inventario general" style="width:18px;height:18px;accent-color:var(--primario)"></td>
    <td>${celdaCostoDe(it, k)}</td>
    <td>${it.borrar === 'confirmar' ? `<span class="confirmar-borrar">¿Borrar? <button type="button" class="btn-mini" data-borrar-si="${k}">Sí</button><button type="button" class="btn-mini" data-borrar-no="${k}">No</button></span>`
      : it.borrar ? `<button type="button" class="btn-mini" data-borrar-no="${k}">Deshacer</button>`
      : `<button type="button" class="btn-borrar" data-borrar="${k}">🗑 Borrar</button>`}</td></tr>`).join('')
  pintarCardInv()
}

function pintarAvisos() {
  const cuerpo = E.sugerido ? `<span class="ic">📦</span><div><b>Terminó ${esc(E.sugerido.mes)}: es buen momento para el inventario general.</b>` +
    '<p>Se cuenta todo lo que hay: materia prima, bebidas, empaques, menaje, mobiliario e insumos. Se puede repartir por partes entre varias personas.</p></div>' : ''
  $('aviso-inv').innerHTML = E.sugerido && !E.conteo && !pospuesto(E.sugerido.clave) ? cuerpo : ''
  document.querySelectorAll('[data-aviso-curso]').forEach(p => {
    p.hidden = !E.conteo
    p.innerHTML = '<b>Se está haciendo el inventario general.</b> Si registras algo que ya se contó o que falta por contar, avísale a quien está contando para que no quede descuadrado.'
  })
  $('badge-tab-ingresos').textContent = E.hoyIngresos.n || ''
  $('badge-tab-ingresos').title = 'Ingresos registrados hoy'
  $('badge-tab-bajas').textContent = E.hoyBajas.n || ''
  $('badge-tab-bajas').title = 'Bajas registradas hoy'
  const estado = E.conteo ? (E.conteo.estado === 'enviado' ? 'Esperando aprobación' : 'Inventario en curso') : E.sugerido ? 'Inventario sugerido' : ''
  $('badge-tab-existencias').textContent = estado ? '!' : ''
  $('badge-tab-existencias').className = 'tab-badge alerta'
  $('badge-tab-existencias').title = estado
  $('sub-tab-existencias').textContent = estado || 'El conteo y la lista'
  $('sub-tab-existencias').classList.toggle('estado-tab', !!estado)
  const faltan = E.faltanVentas || 0
  $('badge-tab-reportes').textContent = faltan || ''
  $('badge-tab-reportes').title = faltan ? 'Días de ventas sin registrar' : ''
  $('sub-tab-reportes').textContent = faltan ? `Falta${faltan === 1 ? '' : 'n'} ${faltan} día${faltan === 1 ? '' : 's'} de ventas` : 'Por día, mes o rango'
  $('sub-tab-reportes').classList.toggle('estado-tab', !!faltan)
}

function pintarListas() {
  $('lista-items').innerHTML = activos().map(i => `<option value="${esc(i.nombre)}">${esc(i.cat)}</option>`).join('')
  const provs = [...new Set(E.ingresos.map(m => m.prov).filter(Boolean))]
  $('proveedores').innerHTML = provs.map(p => `<option>${esc(p)}</option>`).join('')
  $('rep-cat').innerHTML = opciones(['Todas', ...CATS()], $('rep-cat').value || 'Todas')
}
function pintarTodo() {
  pintarListas(); pintarMovs(); pintarLista(); pintarAvisos()
  if (!$('card-editar').hidden && borrador) pintarEditar()
  $('rep-admin').hidden = !E.admin
}

// reportes
function rangoActual() {
  const p = $('rep-periodo').value, hoy = E.hoy
  const [a, m] = hoy.split('-').map(Number)
  const pad = n => String(n).padStart(2, '0')
  $('rep-rango').hidden = p !== 'rango' || ['cierre', 'existencias', 'cambios', 'foodcost'].includes($('rep-tipo').value)
  if (p === 'hoy') return [hoy, hoy, `Hoy, ${fechaCorta(hoy)} de ${a}`]
  if (p === 'semana') { const d = new Date(a, m - 1, +hoy.slice(8) - 6); const ini = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; return [ini, hoy, `${fechaCorta(ini)} al ${fechaCorta(hoy)} de ${a}`] }
  if (p === 'mes') return [`${a}-${pad(m)}-01`, hoy, `${MESES_LARGOS[m - 1]} de ${a} (en curso)`.replace(/^./, s => s.toUpperCase())]
  if (p === 'mesant') {
    const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
    const ultimo = new Date(pa, pm, 0).getDate()
    return [`${pa}-${pad(pm)}-01`, `${pa}-${pad(pm)}-${pad(ultimo)}`, `${MESES_LARGOS[pm - 1]} de ${pa}`.replace(/^./, s => s.toUpperCase())]
  }
  const d = $('rep-desde').value || hoy, h = $('rep-hasta').value || hoy
  return [d, h, `${fechaCorta(d)} al ${fechaCorta(h)}`]
}
function barras(lista, verde) {
  if (!lista.length) return '<p class="nota">Sin movimientos en este periodo.</p>'
  const max = Math.max(...lista.map(x => x[1]))
  return lista.slice(0, 6).map(([n, v]) => `<div class="barra-fila"><span title="${esc(n)}">${esc(n)}</span><span class="barra${verde ? ' verde' : ''}"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span><span class="num">${plata(v)}</span></div>`).join('')
}
const BOTONES = '<div class="botones"><button type="button" class="btn-sec" data-exportar="excel">📥 Descargar Excel</button><button type="button" class="btn-sec" data-exportar="imprimir">🖨️ Imprimir</button></div>'
function variacion(ahora, antes, mes) {
  if (!antes) return ''
  const v = (ahora - antes) / antes * 100
  return `<span class="${v > 0 ? 'var-up' : 'var-down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toFixed(0)} % frente a ${esc(mes)}</span>`
}
function etiquetaPrecio(p, u, idx, periodo) {
  return `${plata(p.precio)} / ${u}` + (p.promedio ? `<span class="quien">precio promedio, varió ${p.cambios} ${p.cambios === 1 ? 'vez' : 'veces'} ${periodo} · <button type="button" class="link" data-precios="${idx}">Ver detalle</button></span>` : '')
}
function semaforo(pct, meta) {
  if (pct <= meta) return '<span class="semaforo verde">Dentro de la meta</span>'
  if (pct <= meta + 3) return '<span class="semaforo amarillo">Un poco por encima</span>'
  return '<span class="semaforo rojo">Por encima de la meta</span>'
}

function htmlCierre(d) {
  if (!d.id) return `<div class="encab-rep"><div><h2>Cierre del mes</h2></div></div>
    <p class="info nuevo" style="margin-top:1rem"><span>Este reporte aparece cuando el administrador apruebe un inventario general.</span><button type="button" data-accion="ir-inventario">Ir al inventario general</button></p>`
  const porCat = c => d.consumo.find(x => x.cat === c)
  const prev = d.previo, mes = d.mesAnterior
  return `<div class="encab-rep"><div><h2>${esc(d.titulo)}</h2><span class="meta">${esc(d.subtitulo)}</span></div>${BOTONES}</div>
    <div class="kpis" style="margin-top:1rem">
      <div class="kpi"><small>Gasto del mes</small><b>${plata(d.gasto)}</b>${prev ? variacion(d.gasto, prev.gasto, mes) : ''}</div>
      <div class="kpi"><small>Materia prima</small><b>${plata(porCat('Materia prima').gasto)}</b>${prev ? variacion(porCat('Materia prima').gasto, prev.porCat['Materia prima'], mes) : ''}</div>
      <div class="kpi"><small>Bebidas</small><b>${plata(porCat('Bebidas').gasto)}</b>${prev ? variacion(porCat('Bebidas').gasto, prev.porCat['Bebidas'], mes) : ''}</div>
      <div class="kpi perdida"><small>Faltante en menaje y mobiliario</small><b>${plata(d.faltante)}</b>${prev ? variacion(d.faltante, prev.faltante, mes) : ''}</div>
    </div>
    <p class="info" style="margin-top:1rem"><span>El food cost de este cierre (cuánto de lo vendido se fue en costo) está en su propio reporte.</span><button type="button" data-accion="ver-fc">Ver food cost</button></p>
    <h3 class="sub-tabla">Cuánto se gastó <span class="meta">en pesos, valores exactos</span></h3>
    <div class="tabla-scroll"><table><thead><tr><th></th><th class="num">Al cierre anterior</th><th class="num">+ Compras</th><th class="num">− Bajas</th><th class="num">− Al cierre</th><th class="num">= Gasto del mes</th></tr></thead><tbody>
    ${d.consumo.map(x => `<tr><td>${pillCat(x.cat)}</td><td class="num">${plata(x.ini)}</td><td class="num">${plata(x.com)}</td><td class="num">${plata(x.baj)}</td><td class="num">${plata(x.fin)}</td><td class="num"><b>${plata(x.gasto)}</b></td></tr>`).join('')}
    </tbody></table></div>
    <p class="nota" style="margin-top:.4rem">Compras y bajas se suman con su valor exacto. Lo que queda al cierre se valora con el precio exacto de las últimas compras (método PEPS: lo primero que entra es lo primero que sale), así no se esconde ninguna subida de precio. Las bajas se restan aparte porque ya salen en "Perdido".</p>
    ${d.cambiaron.length ? `<div class="detalle-rep"><h3 class="sub-tabla">Ítems cuyo precio cambió en el mes <span class="meta">solo informativo</span></h3><ul class="nombres">${d.cambiaron.map((i, k) => `<li><b>${esc(i.nombre)}</b> ${etiquetaPrecio(i, i.u, 'c' + k, 'en el mes')}</li>`).join('')}</ul></div>` : ''}
    <div class="detalle-rep"><h3 class="sub-tabla">Menaje y mobiliario <span class="meta">lo que debería haber frente a lo que se contó</span></h3>
    ${d.diferencias.length ? `<div class="tabla-scroll"><table><thead><tr><th>Ítem</th><th class="num">Debería haber</th><th class="num">Se contó</th><th class="num">Diferencia</th><th class="num">Valor</th></tr></thead><tbody>
      ${d.diferencias.map(x => `<tr><td>${esc(x.nombre)} ${pillCat(x.cat)}</td><td class="num">${num(x.deberia)}</td><td class="num">${num(x.contado)}</td>
        <td class="num"><span class="dif ${x.dif < 0 ? 'falta' : 'sobra'}">${x.dif < 0 ? 'Faltan ' + num(-x.dif) : 'Sobran ' + num(x.dif)}</span></td><td class="num">${plata(x.valor)}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="nota">Todo cuadró: no falta ni sobra nada.</p>'}</div>
    <p class="nota" style="margin-top:1rem">Es una referencia para el dueño, no contabilidad oficial.</p>`
}

// food cost: cuanto de lo vendido se fue en costo de producto. las ventas solo las escribe el administrador
let fcSel = null
let fcAjAbierto = false
const fechaLarga = f => { const [, m, d] = f.split('-'); return `${+d} de ${MESES_LARGOS[m - 1]}` }
const pct = n => n.toFixed(1).replace('.', ',') + ' %'
const enPesos = v => v ? Math.round(v).toLocaleString('es-CO') : ''

function camposVentas(v, conFecha, fecha) {
  return `<form class="fc-form" id="form-ventas" autocomplete="off">
      ${conFecha ? `<label class="campo"><span>Día</span><input type="date" id="v-fecha" max="${E.hoy}" value="${fecha}"></label>` : ''}
      <label class="campo"><span>Comida en el local</span><div class="pesos"><input inputmode="numeric" id="v-comida" placeholder="0" value="${enPesos(v && v.comida)}"></div></label>
      <label class="campo"><span>Bebidas en el local</span><div class="pesos"><input inputmode="numeric" id="v-bebidas" placeholder="0" value="${enPesos(v && v.bebidas)}"></div></label>
      <label class="campo"><span>Domicilios por apps</span><div class="pesos"><input inputmode="numeric" id="v-dom" placeholder="0" value="${enPesos(v && v.dom)}"></div></label>
      ${conFecha ? '' : '<span></span>'}
      <p class="aviso-dom">Domicilios: ganancias netas, sin contar comisiones ni gastos de las apps. Se suman a las ventas de comida.</p>
      <div class="acciones"><span class="msg" id="msg-ventas"></span><button class="btn-pri" type="submit">${conFecha ? 'Guardar ventas del día' : 'Guardar total'}</button></div>
    </form>
    <p class="nota">Todo sin impuesto al consumo y sin propinas.${conFecha ? ' Si ese día ya tenía ventas, se reemplazan. Si el local no abrió, guárdalo en cero para que no quede pendiente.' : ''}</p>`
}

function bloqueVentas(d) {
  const aj = d.ajustes
  const resumen = `Ventas: ${aj.modo === 'diario' ? 'a diario' : 'un total al cierre'} · Empaques: ${aj.empaques ? 'sí se suman' : 'no se suman'} · Metas ${d.metas.comida} % y ${d.metas.bebidas} %`
  const ajustes = `<details class="fc-ajustes" id="fc-ajustes"${fcAjAbierto ? ' open' : ''}><summary>⚙️ Ajustes del food cost <span class="meta">${resumen}</span></summary>
    <div class="cuerpo">
      <div class="ajuste"><b>¿Cómo registras las ventas?</b>
        <div class="segmento"><button type="button" data-fcmodo="diario" aria-pressed="${aj.modo === 'diario'}">A diario</button><button type="button" data-fcmodo="total" aria-pressed="${aj.modo === 'total'}">Un total al cierre</button></div>
        <small>A diario: como el cuadre de caja de cada noche, y además muestra un estimado por semana. Un total al cierre: una sola vez, cuando se aprueba el inventario general.</small></div>
      <div class="ajuste"><b>¿Sumar los empaques de domicilio al costo de la comida?</b>
        <div class="segmento"><button type="button" data-fcemp="si" aria-pressed="${aj.empaques}">Sí</button><button type="button" data-fcemp="no" aria-pressed="${!aj.empaques}">No</button></div>
        <small>Sí: el food cost incluye lo que gastas en contenedores, bolsas y desechables. No: solo cuenta los ingredientes.</small></div>
      <div class="ajuste"><b>Metas</b><div class="metas">
        <label class="campo"><span>Comida (%)</span><input type="number" min="1" max="100" id="fc-meta-comida" data-meta="metaComida" value="${d.metas.comida}"></label>
        <label class="campo"><span>Bebidas (%)</span><input type="number" min="1" max="100" id="fc-meta-bebidas" data-meta="metaBebidas" value="${d.metas.bebidas}"></label></div></div>
    </div></details>`
  let cuerpo
  if (aj.modo === 'diario') {
    let progreso
    if (!d.periodoDesde) progreso = '<p class="nota">El food cost empieza después del primer inventario general aprobado, que es el punto de partida. Las ventas que registres desde ese día son las que cuentan.</p>'
    else if (d.diasPeriodo) progreso = `<div class="progreso-ventas"><b style="font-size:.9rem">Desde el ${fechaLarga(d.periodoDesde)} hasta ayer: ${d.registrados} de ${d.diasPeriodo} días registrados</b>
        <span class="barra verde"><i style="width:${(d.registrados / d.diasPeriodo * 100).toFixed(1)}%"></i></span></div>`
    else progreso = `<p class="nota">Desde el ${fechaLarga(d.periodoDesde)}, cuando se aprobó el inventario general. Hoy se registra al cerrar caja.</p>`
    cuerpo = `${progreso}
      ${d.faltan.length ? `<div class="dias-faltan"><span>Faltan:</span>${d.faltan.map(f => `<button type="button" data-dia="${f}">${fechaCorta(f)}</button>`).join('')}<span class="meta">Toca un día para llenarlo.</span></div>` : ''}
      ${camposVentas(null, true, d.faltan[0] || d.hoy)}
      ${d.ultimas.length ? `<div class="tabla-scroll"><table><thead><tr><th>Día</th><th class="num">Comida</th><th class="num">Bebidas</th><th class="num">Domicilios netos</th><th class="num">Total</th></tr></thead><tbody>
        ${d.ultimas.map(v => `<tr><td>${fechaCorta(v.fecha)}</td><td class="num">${plata(v.comida)}</td><td class="num">${plata(v.bebidas)}</td><td class="num">${plata(v.dom)}</td><td class="num"><b>${plata(v.comida + v.bebidas + v.dom)}</b></td></tr>`).join('')}
      </tbody></table></div>` : ''}`
  } else if (d.sel && !d.sel.partida) {
    cuerpo = `<p style="margin:0"><b>Ventas del ${fechaLarga(d.sel.desde)} al ${fechaLarga(d.sel.hasta)}</b> <span class="meta">(el periodo del inventario general de ${esc(d.sel.mes)}; se cambia en "Cierre", abajo)</span></p>${camposVentas(d.sel.ventas, false)}`
  } else {
    cuerpo = '<p class="nota">El total de ventas se escribe para cada inventario general aprobado, desde el segundo: el primero es el punto de partida.</p>'
  }
  return `<section class="fc-bloque"><div class="fila-titulo" style="margin:0"><h3>Ventas</h3><span class="admin-tag">🔓 Solo el administrador</span></div>${ajustes}${cuerpo}</section>`
}

// grafica de los ultimos meses: % de comida y de bebidas con su meta
function grafica(hist, metas) {
  const W = 560, H = 210, iz = 40, de = 16, ar = 16, ab = 30
  const vals = hist.flatMap(h => [h.comida, h.bebidas]).filter(v => v !== null).concat([metas.comida, metas.bebidas])
  const min = Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5), max = Math.ceil((Math.max(...vals) + 4) / 5) * 5
  const x = i => iz + (hist.length === 1 ? (W - iz - de) / 2 : i * (W - iz - de) / (hist.length - 1))
  const y = v => ar + (max - v) / (max - min) * (H - ar - ab)
  const ticks = []
  for (let t = min; t <= max; t += 5) ticks.push(t)
  const linea = (k, color) => {
    const pts = hist.map((h, i) => [i, h[k]]).filter(p => p[1] !== null)
    return `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>` +
      pts.map(([i, v], n) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${n === pts.length - 1 ? 5 : 3.5}" fill="${color}"/><text x="${x(i).toFixed(1)}" y="${(y(v) - 9).toFixed(1)}" text-anchor="middle" style="fill:${color};font-weight:700">${v.toFixed(1).replace('.', ',')}</text>`).join('')
  }
  const meta = (v, color) => `<line x1="${iz}" x2="${W - de}" y1="${y(v)}" y2="${y(v)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".55"/>`
  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Food cost de los últimos meses">
    ${ticks.map(t => `<line class="eje" x1="${iz}" x2="${W - de}" y1="${y(t)}" y2="${y(t)}"/><text x="${iz - 8}" y="${y(t) + 4}" text-anchor="end">${t} %</text>`).join('')}
    ${hist.map((h, i) => `<text x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(h.mes)}</text>`).join('')}
    ${meta(metas.comida, '#0b7a66')}${meta(metas.bebidas, '#b0305c')}
    ${linea('comida', '#0b7a66')}${linea('bebidas', '#b0305c')}
  </svg>
  <div class="leyenda"><span><i style="background:#0b7a66"></i>Comida</span><span><i style="background:#b0305c"></i>Bebidas</span><span><i class="punteada"></i>Meta</span></div>`
}

function bloqueResultado(d) {
  const selector = d.cierres.length ? `<label class="campo" style="width:250px;max-width:100%"><span>Cierre</span><select id="fc-cierre">${d.cierres.map(c => `<option value="${c.id}"${d.sel && c.id === d.sel.id ? ' selected' : ''}>${esc(c.etiqueta)}</option>`).join('')}</select></label>` : ''
  const x = d.sel
  let cuerpo
  if (!x) {
    cuerpo = `<p class="info nuevo" style="margin:0"><span>El food cost sale de los inventarios generales aprobados: necesita saber cuánto quedó al cierre. Todavía no hay ninguno.</span><button type="button" data-accion="ir-inventario">Ir al inventario general</button></p>`
  } else if (x.partida) {
    cuerpo = `<div class="partida"><b>El inventario de ${esc(x.mes)} fue el primero: es el punto de partida.</b><p>Todavía no había un conteo anterior para saber cuánto se gastó, así que el food cost empieza a calcularse desde el siguiente cierre.</p></div>`
  } else {
    const kpi = (nombre, c, meta) => c.venta
      ? `<div class="kpi"><small>${nombre}</small><b>${pct(c.costo / c.venta * 100)}</b><span>${plata(c.costo)} de costo · ${plata(c.venta)} vendidos · meta ${meta} %</span><br>${semaforo(c.costo / c.venta * 100, meta)}</div>`
      : `<div class="kpi"><small>${nombre}</small><b>—</b><span>Faltan las ventas del periodo</span></div>`
    const notas = []
    if (x.faltan.length) notas.push(`<b>Falta${x.faltan.length === 1 ? '' : 'n'} ${x.faltan.length} día${x.faltan.length === 1 ? '' : 's'} de ventas (${x.faltan.slice(0, 8).map(fechaCorta).join(', ')}${x.faltan.length > 8 ? '…' : ''}).</b> Hasta que se registren, el food cost sale más alto de lo real.`)
    if (!x.comida.venta && !x.bebidas.venta) notas.push(d.ajustes.modo === 'total' ? '<b>Falta escribir el total de ventas de este periodo</b> arriba, en Ventas.' : '<b>No hay ventas registradas en este periodo.</b>')
    if (x.noContados.length) notas.push(`Estos ítems no se contaron en el inventario, así que todo lo que se compró de ellos cuenta como gastado: ${x.noContados.map(esc).join(', ')}.`)
    const semanas = x.semanas ? `<h3 class="sub-tabla">Estimado por semana <span class="aprox">Aproximado</span></h3>
      <p class="nota" style="margin-bottom:.5rem">Compras de comida de la semana ÷ ventas de comida de la semana. Sirve para ver a tiempo si algo se dispara; el número real es el del cierre.</p>
      <div class="tabla-scroll"><table><thead><tr><th>Semana</th><th class="num">Comida</th><th></th></tr></thead><tbody>
      ${x.semanas.map(w => `<tr><td>${w.nombre}</td><td class="num"><b>${w.pct === null ? '—' : pct(w.pct)}</b></td><td>${w.pct === null ? '<span class="meta">Sin ventas registradas</span>' : semaforo(w.pct, d.metas.comida)}${w.faltan ? ` <span class="meta">· falta${w.faltan === 1 ? '' : 'n'} ${w.faltan} día${w.faltan === 1 ? '' : 's'}</span>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`
      : '<h3 class="sub-tabla">Estimado por semana</h3><p class="nota">Solo está disponible cuando las ventas se registran a diario (se cambia en Ajustes).</p>'
    cuerpo = `<p class="meta" style="margin:0">Del ${fechaLarga(x.desde)} al ${fechaLarga(x.hasta)}</p>
      <div class="fc-kpis">${kpi('Costo de comida', x.comida, d.metas.comida)}${kpi('Costo de bebidas', x.bebidas, d.metas.bebidas)}</div>
      ${notas.map(n => `<p class="info nuevo" style="margin:0"><span>${n}</span></p>`).join('')}
      ${d.historia.length ? `<h3 class="sub-tabla">Últimos meses</h3>${grafica(d.historia, d.metas)}` : ''}
      ${semanas}
      <div class="detalle-rep"><h3 class="sub-tabla">Lo que más pesó en el costo de comida <span class="meta">${esc(x.mes)}</span></h3><div class="barras">${barras(x.top, true)}</div></div>
      <p class="nota" style="margin-top:.4rem">El costo es real: lo que había al cierre anterior + lo que se compró − lo que quedó. Incluye las pérdidas (bajas) y la comida del personal. ${d.ajustes.empaques ? 'Los empaques de domicilio suman al costo de comida.' : 'Los empaques de domicilio no entran.'}</p>`
  }
  return `<section class="fc-bloque"><div class="fila-titulo" style="margin:0;align-items:end"><h3>Resultado</h3>${selector}</div>${cuerpo}</section>`
}

function htmlFoodCost(d) {
  return `<div class="encab-rep"><div><h2>Food cost y ventas</h2><span class="meta">Cuánto de lo vendido se fue en costo de producto</span></div>${BOTONES}</div>
    <div style="display:grid;gap:1rem;margin-top:1rem">${bloqueVentas(d)}${bloqueResultado(d)}</div>
    <p class="nota" style="margin-top:1rem">Es una referencia para el dueño, no contabilidad oficial.</p>`
}

async function guardarAjustesFC(body) {
  const r = await conClave('Los ajustes del food cost son solo para el administrador.', () => api('/api/inventario/foodcost/ajustes', { method: 'PUT', body }))
  if (!r.res.ok) return alert(r.d.error || 'No se pudo guardar el ajuste, intenta de nuevo.')
  await pintarReporte()
  await refrescar()
}

function textoCambio(antes, despues, u) {
  const l = []
  if (antes.cant !== despues.cant) l.push(`Cantidad: <s>${num(antes.cant)}</s> → <b>${num(despues.cant)} ${esc(u)}</b>`)
  if (antes.costo !== despues.costo) l.push(`Costo: <s>${plata(antes.costo)}</s> → <b>${plata(despues.costo)}</b>`)
  if ((antes.prov || '') !== (despues.prov || '')) l.push(`Proveedor: <s>${esc(antes.prov || '—')}</s> → <b>${esc(despues.prov || '—')}</b>`)
  const mot = x => x.motivo ? x.motivo + (x.motivoOtro ? ': ' + x.motivoOtro : '') : ''
  if (mot(antes) !== mot(despues)) l.push(`Motivo: <s>${esc(mot(antes) || '—')}</s> → <b>${esc(mot(despues) || '—')}</b>`)
  return l.length ? `<ul class="cambio-lista">${l.map(x => `<li>${x}</li>`).join('')}</ul>` : '<span class="meta">Sin cambios en las cifras</span>'
}

async function pintarReporte() {
  const tipo = $('rep-tipo').value
  const [desde, hasta, titulo] = rangoActual()
  $('campo-periodo').hidden = ['cierre', 'existencias', 'cambios', 'foodcost'].includes(tipo)
  $('campo-cat').hidden = $('campo-item').hidden = ['cierre', 'cambios', 'foodcost'].includes(tipo)
  $('campo-cierre').hidden = tipo !== 'cierre'
  const cat = $('rep-cat').value || 'Todas', q = $('rep-item').value.trim()
  const params = new URLSearchParams({ tipo, desde, hasta, cat, q, cierre: (tipo === 'foodcost' ? fcSel : $('rep-cierre').value) || '' })
  $('salida').innerHTML = '<p class="cargando">Armando el reporte…</p>'
  const r = await conClave('Los reportes muestran el dinero de todo el establecimiento.', () => api('/api/inventario/reporte?' + params))
  if (!r || !r.res.ok) { $('salida').innerHTML = `<p class="vacio">${esc((r && r.d.error) || 'No se pudo armar el reporte, intenta de nuevo.')}</p>`; return }
  const d = r.d
  reporte = { d, params, titulo, tipo }
  const s = $('salida')
  const filtroTxt = `${cat === 'Todas' ? 'todas las categorías' : esc(cat)}${q ? ' · ' + esc(q) : ''}`

  if (tipo === 'cierre') {
    const sel = $('rep-cierre')
    sel.innerHTML = d.cierres.length ? d.cierres.map(c => `<option value="${c.id}"${c.id === d.id ? ' selected' : ''}>${esc(c.etiqueta)}</option>`).join('') : '<option value="">Todavía no hay cierres</option>'
    s.innerHTML = htmlCierre(d)
    return
  }
  if (tipo === 'foodcost') {
    fcSel = d.sel ? d.sel.id : null
    s.innerHTML = htmlFoodCost(d)
    return
  }
  if (tipo === 'existencias') {
    s.innerHTML = `<div class="encab-rep"><div><h2>Lo que hay hoy</h2><span class="meta">Al ${fechaCorta(E.hoy)} · ${filtroTxt}</span></div>${BOTONES}</div>
      <div class="kpis" style="margin-top:1rem"><div class="kpi"><small>Valor total</small><b>${plata(d.total)}</b><span>${d.filas.length} ítems</span></div></div>
      <div class="tabla-scroll detalle-rep" style="margin-top:1rem"><table><thead><tr><th>Ítem</th><th>Categoría</th><th class="num">Cantidad</th><th class="num">Precio por unidad</th><th class="num">Valor total</th></tr></thead>
      <tbody>${d.filas.map((f, k) => `<tr><td>${esc(f.nombre)}</td><td>${pillCat(f.cat)}</td><td class="num">${num(f.cantidad)} ${f.u}${f.alCierre ? '<span class="quien">al último cierre</span>' : ''}</td><td class="num">${etiquetaPrecio(f.precio, f.u, 'e' + k, 'en los últimos 30 días')}</td><td class="num">${plata(f.valor)}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">No hay ítems con ese filtro.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="4">Valor total</td><td class="num">${plata(d.total)}</td></tr></tfoot></table></div>
      <p class="nota" style="margin-top:.5rem">El valor total es exacto: usa el precio de las últimas compras de cada ítem (PEPS). El precio por unidad es solo informativo.</p>`
    return
  }
  if (tipo === 'cambios') {
    s.innerHTML = `<div class="encab-rep"><div><h2>Correcciones y borrados</h2><span class="meta">Todo lo que se cambió o se borró después de registrarse</span></div>${BOTONES}</div>
      <div class="tabla-scroll" style="margin-top:1rem"><table><thead><tr><th>Fecha</th><th>Qué pasó</th><th>Registro</th><th>Cambio</th><th>Quién y por qué</th></tr></thead><tbody>
      ${d.filas.length ? d.filas.map(f => `<tr><td>${fechaCorta(f.fecha)}</td>
        <td>${f.que === 'corr' ? '<span class="pill corr">Corregido</span>' : '<span class="pill sal">Borrado</span>'}</td>
        <td>${f.tipo === 'ing' ? 'Ingreso' : 'Baja'} del ${fechaCorta(f.fechaMov)}<br><b>${esc(f.nombre)}</b> <span class="meta">registró ${esc(f.registro)}</span></td>
        <td>${f.que === 'corr' ? textoCambio(f.antes || {}, f.despues || f.antes || {}, f.u) : `${num(f.cant)} ${esc(f.u)} · ${plata(f.costo)}${f.motivo ? ' · ' + esc(f.motivo) : ''}`}</td>
        <td><b>${esc(f.por)}</b><br><span class="meta">${esc(f.razon || 'Sin razón')}</span></td></tr>`).join('') : '<tr><td colspan="5" class="vacio">Nadie ha corregido ni borrado nada.</td></tr>'}
      </tbody></table></div>`
    return
  }
  if (tipo === 'proveedores') {
    s.innerHTML = `<div class="encab-rep"><div><h2>Compras por proveedor</h2><span class="meta">${esc(titulo)} · ${filtroTxt}</span></div>${BOTONES}</div>
      <div class="kpis" style="margin-top:1rem"><div class="kpi"><small>Comprado</small><b>${plata(d.total)}</b><span>${d.n} compras</span></div><div class="kpi"><small>Proveedores</small><b>${d.filas.length}</b></div></div>
      <div class="barras" style="margin-top:1rem">${barras(d.filas.map(f => [f.prov, f.total]), true)}</div>
      <div class="tabla-scroll" style="margin-top:1rem"><table><thead><tr><th>Proveedor</th><th class="num">Compras</th><th class="num">Total</th><th class="num">% del total</th><th>Lo que más se le compra</th></tr></thead><tbody>
      ${d.filas.length ? d.filas.map(f => `<tr><td>${esc(f.prov)}</td><td class="num">${f.n}</td><td class="num">${plata(f.total)}</td><td class="num">${(f.total / d.total * 100).toFixed(1).replace('.', ',')} %</td><td class="meta">${f.top.map(esc).join(', ')}</td></tr>`).join('') : '<tr><td colspan="5" class="vacio">Sin compras en este periodo.</td></tr>'}
      </tbody></table></div>`
    return
  }
  const verIng = tipo !== 'bajas', verBaj = tipo !== 'ingresos'
  const pct = d.comprado ? (d.perdido / d.comprado * 100).toFixed(1).replace('.', ',') + ' %' : '—'
  s.innerHTML = `<div class="encab-rep"><div><h2>${{ general: 'Reporte general', ingresos: 'Reporte de ingresos', bajas: 'Reporte de bajas' }[tipo]}</h2>
      <span class="meta">${esc(titulo)} · ${filtroTxt}</span></div>${BOTONES}</div>
    <div class="kpis" style="margin-top:1rem">
      ${verIng ? `<div class="kpi"><small>Comprado</small><b>${plata(d.comprado)}</b><span>${d.nIng} ingresos</span></div>` : ''}
      ${verBaj ? `<div class="kpi perdida"><small>Perdido</small><b>${plata(d.perdido)}</b><span>${d.nBaj} bajas</span></div>` : ''}
      ${tipo === 'general' ? `<div class="kpi"><small>% de pérdida</small><b>${pct}</b><span>de lo comprado</span></div>` : ''}
    </div>
    <div class="dos-col" style="margin-top:1rem">
      ${verIng ? `<div><h3 style="margin:0;font-size:1rem">Compras por categoría</h3><div class="barras">${barras(d.porCategoria, true)}</div></div>` : ''}
      ${verBaj ? `<div><h3 style="margin:0;font-size:1rem">Pérdidas por motivo</h3><div class="barras">${barras(d.porMotivo)}</div></div>` : ''}
      ${verIng ? `<div><h3 style="margin:0;font-size:1rem">En qué se gastó más</h3><div class="barras">${barras(d.topCompras, true)}</div></div>` : ''}
      ${verBaj ? `<div><h3 style="margin:0;font-size:1rem">Lo que más se perdió</h3><div class="barras">${barras(d.topPerdidas)}</div></div>` : ''}
    </div>
    <div class="detalle-rep"><h3 class="sub-tabla">Detalle de movimientos <span class="meta">(${d.detalle.length})</span></h3>
    <div class="tabla-scroll"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th class="num">Cantidad</th><th>Proveedor / motivo</th><th class="num">Valor</th></tr></thead>
    <tbody>${d.detalle.length ? d.detalle.slice(0, 40).map(m => `<tr><td>${fechaCorta(m.fecha)}</td><td>${m.tipo === 'ing' ? '<span class="pill ent">Ingreso</span>' : '<span class="pill sal">Baja</span>'}</td><td>${esc(m.nombre)}${m.activo ? '' : ' <span class="meta">(borrado)</span>'}</td><td class="num">${num(m.cant)} ${esc(m.u)}</td><td>${esc(m.tipo === 'ing' ? (m.prov || '—') : m.motivo + (m.motivoOtro ? ': ' + m.motivoOtro : ''))}</td><td class="num">${plata(m.costo)}</td></tr>`).join('') : '<tr><td colspan="6" class="vacio">Sin movimientos en este periodo.</td></tr>'}</tbody></table></div>
    ${d.detalle.length > 40 ? '<p class="nota" style="margin-top:.5rem">Se muestran los 40 más recientes; el Excel trae todos.</p>' : ''}</div>
    <p class="nota" style="margin-top:1rem">Es una referencia para el dueño, no contabilidad oficial.</p>`
}

function abrirPrecios(idx) {
  const d = reporte.d
  const info = idx[0] === 'c' ? d.cambiaron[+idx.slice(1)] : { ...d.filas[+idx.slice(1)].precio, nombre: d.filas[+idx.slice(1)].nombre, u: d.filas[+idx.slice(1)].u }
  $('precios-titulo').textContent = info.nombre
  $('precios-sub').innerHTML = `Su precio cambió <b>${info.cambios} ${info.cambios === 1 ? 'vez' : 'veces'}</b>. Precio promedio: <b>${plata(info.precio)} / ${info.u}</b> (lo pagado dividido lo comprado). Es solo informativo: los reportes usan el valor exacto de cada compra.`
  let antes = null
  $('precios-tabla').innerHTML = `<table><thead><tr><th>Fecha</th><th class="num">Cantidad</th><th class="num">Precio por ${info.u}</th><th>Proveedor</th></tr></thead><tbody>` +
    info.compras.map(m => {
      const dif = antes === null || m.precio === antes ? '' : ` <span class="precio-dif ${m.precio > antes ? 'sube' : 'baja'}">${m.precio > antes ? '▲' : '▼'} ${Math.abs((m.precio - antes) / antes * 100).toFixed(0)} %</span>`
      antes = m.precio
      return `<tr><td>${fechaCorta(m.fecha)}</td><td class="num">${num(m.cant)} ${info.u}</td><td class="num">${plata(m.precio)}${dif}</td><td>${esc(m.prov || '—')}</td></tr>`
    }).join('') + `</tbody><tfoot><tr><td colspan="2">Precio promedio</td><td class="num">${plata(info.precio)}</td><td></td></tr></tfoot></table>`
  $('modal-precios').hidden = false
}

// corregir o borrar un movimiento
function abrirCorregir(id) {
  const m = [...E.ingresos, ...E.bajas].find(x => x.id === id)
  if (!m) return
  const abrir = () => {
    movEditando = m
    const ing = m.tipo === 'ing'
    const it = porId(m.itemId) || { cat: m.cat, u: m.u }
    $('mov-titulo').textContent = ing ? 'Corregir ingreso' : 'Corregir baja'
    $('mov-sub').innerHTML = `${esc(m.nombre)} ${pillCat(m.cat)} · ${fechaCorta(m.fecha)} · registró ${esc(m.por)}`
    $('mov-form').innerHTML = `
      <label class="campo"><span>Cantidad (${esc(m.u)})</span><input type="number" min="0" step="any" id="mov-cant" value="${m.cant}"></label>
      <label class="campo"><span>${ing ? 'Costo total' : 'Costo de la pérdida'}</span><div class="pesos"><input inputmode="numeric" id="mov-costo" value="${m.costo.toLocaleString('es-CO')}"></div></label>
      ${ing ? `<label class="campo c6"><span>Proveedor</span><input id="mov-prov" value="${esc(m.prov || '')}"></label>`
            : `<label class="campo c6"><span>Motivo</span><select id="mov-motivo">${opciones(E.motivos[it.cat] || [], m.motivo)}</select></label>
               <label class="campo c6"><span>¿Cuál fue el motivo? <em>(si es "Otro")</em></span><input id="mov-otro" value="${esc(m.motivoOtro || '')}"></label>`}
      <label class="campo c6"><span>¿Quién corrige?</span><input id="mov-por" placeholder="Tu nombre" value="${esc(nombreGuardado())}"></label>
      <label class="campo c6"><span>¿Por qué se corrige?</span><input id="mov-razon" placeholder="Ej. Se escribió un cero de más"></label>`
    $('mov-borrar').innerHTML = ''
    $('mov-msg').textContent = ''
    $('modal-mov').hidden = false
    $('mov-cant').focus()
  }
  if (m.fecha === E.hoy) abrir()
  else pedirAdmin('Corregir un registro de días anteriores es solo para el administrador.', abrir)
}

function aviso(id, texto, ok = true) {
  const el = $(id); if (!el) return
  el.textContent = texto; el.className = 'msg ' + (ok ? 'ok' : 'err')
  setTimeout(() => { if (el.textContent === texto) el.textContent = '' }, texto.length > 70 ? 7000 : 3500)
}
function irA(tab) {
  document.querySelector(`[data-tab="${tab}"]`).click()
  window.scrollTo(0, 0)
}
function abrirReportes(tipo, cierre) {
  $('candado').hidden = true; $('reportes').hidden = false
  if (tipo) $('rep-tipo').value = tipo
  if (cierre) $('rep-cierre').innerHTML = `<option value="${cierre}" selected></option>`
  irA('reportes')
}

async function accionConteo(url, body) {
  const r = await api(url, { method: 'POST', body: body || {} })
  if (!r.res.ok) { alert(r.d.error || 'Algo salió mal, intenta de nuevo.'); return r }
  await refrescar()
  return r
}
async function sumar(id) {
  const input = document.querySelector(`[data-sumar-input="${id}"]`)
  const v = parseFloat(input.value)
  if (!(v >= 0) || input.value === '') { input.focus(); return }
  input.value = ''
  // se pinta de una y se guarda en el servidor; si falla se recarga lo real
  ;(E.conteo.cuentas[id] = E.conteo.cuentas[id] || []).push(v)
  guardadoItem = id
  pintarCardInv()
  const nuevo = document.querySelector(`[data-sumar-input="${id}"]`); if (nuevo) nuevo.focus()
  const r = await escribir('/api/inventario/conteo/sumar', { method: 'POST', body: { itemId: id, valor: v } })
  if (!r.res.ok) { alert(r.d.error || 'No se pudo guardar, intenta de nuevo.'); await refrescar() }
}
async function guardarParcial(input) {
  const [id, i] = input.dataset.editarParcial.split(':')
  const v = parseFloat(input.value)
  editandoParcial = null
  if (v >= 0) {
    E.conteo.cuentas[id][+i] = v
    pintarCardInv()
    await escribir('/api/inventario/conteo/parcial', { method: 'POST', body: { itemId: id, i: +i, valor: v } })
  } else pintarCardInv()
}

// eventos
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return
  const d = t.dataset
  if (t.id === 'btn-volver') { window.location.href = '/menu.html'; return }
  if (d.tab) {
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b === t))
    document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== d.tab)
    if (d.tab === 'reportes' && E.admin) { $('candado').hidden = true; $('reportes').hidden = false }
    if (d.tab === 'reportes' && !$('reportes').hidden) pintarReporte()
    return
  }
  if (d.m) { motivo = d.m; pintarMotivos((porNombre($('baja-producto').value) || {}).cat || 'Materia prima'); if (motivo === 'Otro') $('baja-otro').focus() }
  if (d.fc && t.classList.contains('chip')) { filtroCat = d.fc; pintarLista() }
  if (d.catNueva) { catNueva = d.catNueva; pintarCatsNueva() }
  if (d.usarNombre) { $('ing-producto').value = d.usarNombre; infoIngreso() }
  if (d.quitarFoto) quitarFoto($(d.quitarFoto + '-prev'))
  if (t.id === 'usar-costo') { $('baja-costo').value = (+d.v).toLocaleString('es-CO'); $('baja-info').hidden = true }
  if (t.id === 'btn-desbloquear') pedirAdmin('Los reportes muestran el dinero de todo el establecimiento.', () => { $('candado').hidden = true; $('reportes').hidden = false; pintarTodo(); pintarReporte() })
  if (t.id === 'modal-cancelar') { $('modal-admin').hidden = true; alAutorizar = null }
  if (d.accion === 'ver-historial') pedirAdmin('El historial de cambios es solo para el administrador.', () => abrirReportes('cambios'))

  // movimientos
  if (d.corregirMov) abrirCorregir(d.corregirMov)
  if (d.verFoto) { const m = [...E.ingresos, ...E.bajas].find(x => x.id === d.verFoto); $('foto-titulo').textContent = 'Foto · ' + (m ? m.nombre : ''); $('foto-img').src = `/api/inventario/movimientos/${d.verFoto}/foto`; $('modal-foto').hidden = false }
  if (t.id === 'foto-cerrar') $('modal-foto').hidden = true
  if (d.precios) abrirPrecios(d.precios)
  if (t.id === 'precios-cerrar') $('modal-precios').hidden = true
  if (t.id === 'mov-cancelar') { $('modal-mov').hidden = true; movEditando = null }
  if (t.id === 'mov-btn-borrar') {
    $('mov-borrar').innerHTML = '<p class="borrar-confirma">¿Seguro que quieres borrar este registro? Queda anotado quién lo borró. <button type="button" class="btn-borrar" id="mov-borrar-si">Sí, borrar</button></p>'
    return
  }
  if (t.id === 'mov-guardar' || t.id === 'mov-borrar-si') {
    const por = $('mov-por').value.trim()
    if (!por) { $('mov-msg').className = 'msg err'; $('mov-msg').textContent = 'Escribe quién corrige.'; $('mov-por').focus(); return }
    guardarNombre(por)
    const m = movEditando, razon = $('mov-razon').value.trim()
    const body = t.id === 'mov-borrar-si' ? { por, razon } : {
      por, razon, cant: +$('mov-cant').value, costo: leerPlata($('mov-costo').value),
      ...(m.tipo === 'ing' ? { prov: $('mov-prov').value.trim() } : { motivo: $('mov-motivo').value, motivoOtro: $('mov-otro').value.trim() })
    }
    const url = t.id === 'mov-borrar-si' ? `/api/inventario/movimientos/${m.id}/borrar` : `/api/inventario/movimientos/${m.id}`
    const r = await conClave('Corregir un registro de días anteriores es solo para el administrador.', () => api(url, { method: t.id === 'mov-borrar-si' ? 'POST' : 'PUT', body }))
    if (!r.res.ok) { $('mov-msg').className = 'msg err'; $('mov-msg').textContent = r.d.error || 'Algo salió mal, intenta de nuevo.'; return }
    $('modal-mov').hidden = true; movEditando = null
    await refrescar()
  }

  // editar lista
  if (t.id === 'btn-editar-lista') pedirAdmin('Editar la lista de ítems es solo para el administrador.', abrirEditar)
  if (t.id === 'btn-agregar-fila') { borrador.push({ id: null, nombre: '', cat: 'Materia prima', u: 'kg', precio: 0, presNombre: '', presCant: '', cuenta: true }); pintarEditar(); document.querySelector(`[data-ed="${borrador.length - 1}:nombre"]`).focus() }
  if (d.borrar !== undefined) { borrador[+d.borrar].borrar = 'confirmar'; pintarEditar() }
  if (d.borrarSi !== undefined) { const k = +d.borrarSi; if (!borrador[k].id) borrador.splice(k, 1); else borrador[k].borrar = true; pintarEditar() }
  if (d.borrarNo !== undefined) { delete borrador[+d.borrarNo].borrar; pintarEditar() }
  if (t.id === 'btn-cancelar-editar') { borrador = null; $('card-editar').hidden = true; pintarLista() }
  if (t.id === 'btn-guardar-lista') {
    const cambios = borrador.map(b => ({ id: b.id, nombre: b.nombre, cat: b.cat, u: b.u, precio: b.precio, presNombre: b.presNombre, presCant: b.presCant, cuenta: b.cuenta, costoDe: b.costoDe, borrar: b.borrar === true }))
    const r = await conClave('Editar la lista de ítems es solo para el administrador.', () => api('/api/inventario/items', { method: 'PUT', body: { cambios } }))
    if (!r.res.ok) return aviso('msg-editar', r.d.error || 'Algo salió mal, intenta de nuevo.', false)
    borrador = null; $('card-editar').hidden = true
    await refrescar()
  }
  if (t.id === 'btn-unir') {
    const r = await conClave('Unir ítems es solo para el administrador.', () => api('/api/inventario/items/unir', { method: 'POST', body: { de: $('unir-de').value, a: $('unir-a').value } }))
    if (!r.res.ok) return aviso('msg-unir', r.d.error || 'Algo salió mal, intenta de nuevo.', false)
    await refrescar(); abrirEditar(); aviso('msg-unir', r.d.mensaje)
  }

  // items nuevos por decidir
  if (d.pend) { selPend[d.pend] = d.op === 'si'; if (!$('card-editar').hidden) pintarEditar(); else pintarCardInv() }
  if (d.accion === 'decidir-ahora') pedirAdmin('Decidir qué ítems nuevos se cuentan es para el administrador.', () => { selPend = {}; vista = 'elegir'; pintarCardInv(); $('card-inv').scrollIntoView({ block: 'start' }) })
  if (d.accion === 'elegir-cancelar') { selPend = {}; vista = 'resumen'; pintarTodo() }
  if (['elegir-guardar', 'editar-pend-guardar', 'pend-aplicar'].includes(d.accion)) {
    const decisiones = { ...selPend }
    selPend = {}
    const r = await conClave('Decidir qué ítems nuevos se cuentan es para el administrador.', () => api('/api/inventario/items/decidir', { method: 'POST', body: { decisiones, desdeRevision: d.accion === 'pend-aplicar' } }))
    if (!r.res.ok) return alert(r.d.error || 'Algo salió mal, intenta de nuevo.')
    if (d.accion === 'elegir-guardar' || (d.accion === 'pend-aplicar' && r.d.agregados)) vista = 'resumen'
    if (borrador) borrador.forEach(b => { if (b.id && decisiones[b.id] !== undefined) b.cuenta = decisiones[b.id] })
    await refrescar()
  }

  // inventario general
  if (d.accion === 'iniciar') { recienAprobado = null; vista = 'resumen'; await accionConteo('/api/inventario/conteo/iniciar') }
  if (d.contar) { parteActual = d.contar; vista = 'contar'; editandoParcial = null; guardadoItem = null; pintarCardInv(); $('card-inv').scrollIntoView({ block: 'start' }) }
  if (d.sumar) sumar(d.sumar)
  if (d.corregir) { const [id, i] = d.corregir.split(':'); editandoParcial = { id, i: +i }; pintarCardInv(); const el = document.querySelector(`[data-editar-parcial="${id}:${i}"]`); el.focus(); el.select() }
  if (d.quitar) {
    const [id, i] = d.quitar.split(':')
    E.conteo.cuentas[id].splice(+i, 1)
    pintarCardInv()
    await escribir('/api/inventario/conteo/parcial', { method: 'POST', body: { itemId: id, i: +i, valor: null } })
  }
  if (d.accion === 'guardar-parte' || d.accion === 'volver-partes') {
    const por = $('contar-por').value.trim()
    if (d.accion === 'guardar-parte' && !por) { aviso('msg-contar', 'Escribe quién contó.', false); $('contar-por').focus(); return }
    vista = 'resumen'
    if (por) { guardarNombre(por); await accionConteo('/api/inventario/conteo/parte', { parte: parteActual, por }) }
    else await refrescar()
  }
  if (d.accion === 'enviar') await accionConteo('/api/inventario/conteo/enviar')
  if (d.accion === 'cancelar-inv') { if (confirm('¿Descartar este inventario general? Se pierde todo lo contado.')) await accionConteo('/api/inventario/conteo/descartar') }
  if (d.accion === 'revisar') pedirAdmin('Aprobar el inventario general cambia las existencias reales.', () => { vista = 'revisar'; pintarCardInv() })
  if (d.accion === 'devolver') { vista = 'resumen'; await conClave('Aprobar el inventario general cambia las existencias reales.', () => accionConteo('/api/inventario/conteo/devolver')) }
  if (d.accion === 'aprobar') {
    const r = await conClave('Aprobar el inventario general cambia las existencias reales.', () => api('/api/inventario/conteo/aprobar', { method: 'POST', body: {} }))
    if (!r.res.ok) return alert(r.d.error || 'Algo salió mal, intenta de nuevo.')
    recienAprobado = { mes: r.d.mes, id: r.d.id }
    vista = 'resumen'
    await refrescar()
    $('card-inv').scrollIntoView({ block: 'start' })
  }
  if (d.accion === 'ver-cierre') abrirReportes('cierre', recienAprobado && recienAprobado.id)
  if (d.accion === 'ir-inventario') irA('existencias')
  if (d.fcmodo) guardarAjustesFC({ modo: d.fcmodo })
  if (d.fcemp) guardarAjustesFC({ empaques: d.fcemp === 'si' })
  if (d.dia) { $('v-fecha').value = d.dia; $('v-comida').focus() }
  if (d.accion === 'ver-fc') { fcSel = null; $('rep-tipo').value = 'foodcost'; pintarReporte() }

  // acceso para otros celulares
  if (d.accion === 'crear-acceso') pedirAdmin('Abrir el inventario a otros celulares es solo para el administrador.', async () => { await conClave('Abrir el inventario a otros celulares es solo para el administrador.', () => accionConteo('/api/inventario/conteo/acceso')) })
  if (d.accion === 'ver-acceso') pedirAdmin('El código del acceso es solo para el administrador.', refrescar)
  if (d.accion === 'cerrar-acceso') { await api('/api/inventario/conteo/acceso', { method: 'DELETE' }); await refrescar() }
  if (d.accion === 'copiar-link') {
    const url = urlAcceso(E.conteo.acceso)
    try { await navigator.clipboard.writeText(url); t.textContent = 'Copiado' } catch (_) { t.textContent = 'Cópialo de arriba' }
    setTimeout(() => { t.textContent = 'Copiar link' }, 1800)
  }
  if (d.sacar !== undefined) { await api('/api/inventario/conteo/acceso/sacar', { method: 'POST', body: { sid: d.sacar } }); await refrescar() }

  // exportar
  if (d.exportar) {
    const excel = d.exportar === 'excel'
    $('modal-exportar').dataset.tipo = d.exportar
    $('exp-titulo').textContent = excel ? 'Descargar Excel' : 'Imprimir'
    $('exp-ok').textContent = excel ? 'Descargar' : 'Imprimir'
    const tipo = $('rep-tipo').value
    $('exp-detalle-txt').textContent = tipo === 'cambios' ? 'Además, el antes y el después de cada cambio.' : tipo === 'proveedores' ? 'Además, cada compra de cada proveedor.' : tipo === 'cierre' ? 'Además, la tabla de cada ítem de menaje y mobiliario con diferencia.' : tipo === 'foodcost' ? 'Además, las ventas de cada día del periodo.'
      : tipo === 'existencias' ? 'Además, la tabla con cada ítem, su cantidad y su valor.' : 'Además, la lista de cada movimiento, uno por uno.'
    $('exp-msg').textContent = ''
    $('modal-exportar').hidden = false
    $('exp-ok').focus()
  }
  if (t.id === 'exp-cancelar') $('modal-exportar').hidden = true
  if (t.id === 'exp-ok') {
    const todo = document.querySelector('[name="exp-que"]:checked').value === 'todo'
    $('modal-exportar').hidden = true
    if ($('modal-exportar').dataset.tipo === 'excel') {
      const p = new URLSearchParams(reporte.params)
      p.set('detalle', todo ? '1' : '0')
      p.set('titulo', reporte.titulo || '')
      window.location.href = '/api/inventario/reporte/excel?' + p
    } else {
      document.body.classList.toggle('solo-resumen', !todo)
      setTimeout(() => window.print(), 60)
    }
  }
})

document.addEventListener('input', e => {
  const t = e.target
  if (t.matches('.pesos input')) { const v = leerPlata(t.value); t.value = v ? v.toLocaleString('es-CO') : '' }
  if (t.id === 'ing-producto' || t.id === 'ing-cantidad' || t.id === 'ing-costo') infoIngreso()
  if (t.id === 'baja-producto' || t.id === 'baja-cantidad') infoBaja()
  if (t.id === 'buscar') pintarLista()
  if (t.dataset.ed) { const [k, campo] = t.dataset.ed.split(':'); borrador[+k][campo] = campo === 'precio' ? leerPlata(t.value) : campo === 'cuenta' ? t.checked : t.value }
  if (t.id === 'rep-item') { clearTimeout(t._espera); t._espera = setTimeout(pintarReporte, 400) }
})
document.addEventListener('change', async e => {
  const t = e.target
  if (t.dataset.ed) { const [k, campo] = t.dataset.ed.split(':'); borrador[+k][campo] = campo === 'cuenta' ? t.checked : campo === 'precio' ? leerPlata(t.value) : t.value }
  if (['rep-periodo', 'rep-tipo', 'rep-cat', 'rep-cierre', 'rep-desde', 'rep-hasta'].includes(t.id)) pintarReporte()
  if (t.id === 'ing-unidad') infoIngreso()
  if (t.dataset.meta) guardarAjustesFC({ [t.dataset.meta]: +t.value })
  if (t.id === 'fc-cierre') { fcSel = t.value; pintarReporte() }
})
document.addEventListener('keydown', e => {
  const t = e.target
  if (e.key === 'Enter' && t.dataset.sumarInput) { e.preventDefault(); sumar(t.dataset.sumarInput) }
  if (e.key === 'Enter' && t.dataset.editarParcial) { e.preventDefault(); guardarParcial(t) }
  if (e.key === 'Escape' && t.dataset.editarParcial) { editandoParcial = null; pintarCardInv() }
  if (e.key === 'Escape') ['modal-mov', 'modal-foto', 'modal-precios', 'modal-exportar', 'modal-admin'].forEach(id => $(id).hidden = true)
})
document.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.editarParcial && editandoParcial) guardarParcial(e.target) })
window.addEventListener('afterprint', () => document.body.classList.remove('solo-resumen'))
document.addEventListener('toggle', e => { if (e.target.id === 'fc-ajustes') fcAjAbierto = e.target.open }, true)

// ventas del food cost: las del dia, o el total del cierre elegido
document.addEventListener('submit', async e => {
  if (e.target.id !== 'form-ventas') return
  e.preventDefault()
  const v = { comida: leerPlata($('v-comida').value), bebidas: leerPlata($('v-bebidas').value), dom: leerPlata($('v-dom').value) }
  const boton = e.target.querySelector('[type="submit"]')
  boton.disabled = true
  let r, txt
  if ($('v-fecha')) {
    const fecha = $('v-fecha').value
    r = await conClave('Las ventas son solo para el administrador.', () => api('/api/inventario/ventas', { method: 'POST', body: { fecha, ...v } }))
    txt = `Ventas del ${fecha ? fechaLarga(fecha) : 'día'} guardadas.`
  } else {
    r = await conClave('Las ventas son solo para el administrador.', () => api(`/api/inventario/cierres/${reporte.d.sel.id}/ventas`, { method: 'PUT', body: v }))
    txt = 'Total guardado.'
  }
  boton.disabled = false
  if (!r.res.ok) return aviso('msg-ventas', r.d.error || 'Algo salió mal, intenta de nuevo.', false)
  await pintarReporte()
  await refrescar()
  aviso('msg-ventas', txt)
})

// guardar ingreso y baja
$('form-ingreso').addEventListener('submit', async e => {
  e.preventDefault()
  const nombre = $('ing-producto').value.trim()
  const it = porNombre(nombre)
  if (!it && !catNueva) return aviso('msg-ingreso', 'Toca qué es: materia prima, bebidas, menaje, mobiliario, insumos u otros gastos.', false)
  const costo = leerPlata($('ing-costo').value)
  if (!costo) return aviso('msg-ingreso', 'Escribe el costo total.', false)
  const f = new FormData()
  f.append('tipo', 'ing'); f.append('fecha', $('ing-fecha').value); f.append('producto', nombre)
  f.append('cantidad', $('ing-cantidad').value); f.append('costo', costo)
  f.append('unidadCompra', $('ing-unidad').value === 'pres' ? 'pres' : '')
  f.append('u', $('ing-unidad').value); f.append('cat', catNueva)
  f.append('prov', $('ing-proveedor').value.trim()); f.append('factura', $('ing-factura').value.trim()); f.append('por', $('ing-por').value.trim())
  const foto = await fotoComoBlob($('ing-foto-prev'))
  if (foto) f.append('foto', foto, 'factura.jpg')
  const boton = e.target.querySelector('[type="submit"]')
  boton.disabled = true
  const { res, d } = await api('/api/inventario/movimientos', { method: 'POST', body: f })
  boton.disabled = false
  if (!res.ok) return aviso('msg-ingreso', d.error || 'Algo salió mal, intenta de nuevo.', false)
  guardarNombre($('ing-por').value.trim())
  e.target.reset(); $('ing-por').value = nombreGuardado(); $('ing-fecha').value = E.hoy; $('ing-info').hidden = true; $('ing-nuevo').hidden = true
  catNueva = ''; quitarFoto($('ing-foto-prev'))
  await refrescar()
  prepararUnidad(null); pintarCatsNueva()
  aviso('msg-ingreso', 'Ingreso guardado.' + (d.nuevo ? ` "${d.item.nombre}" quedó registrado.` : ''))
})
$('form-baja').addEventListener('submit', async e => {
  e.preventDefault()
  const it = porNombre($('baja-producto').value)
  if (!it) return aviso('msg-baja', 'Ese producto no está registrado.', false)
  if (!motivo) return aviso('msg-baja', 'Elige el motivo de la baja.', false)
  const otro = $('baja-otro').value.trim()
  if (motivo === 'Otro' && !otro) { $('baja-otro').focus(); return aviso('msg-baja', 'Escribe cuál fue el motivo.', false) }
  const costo = leerPlata($('baja-costo').value)
  if (!costo) return aviso('msg-baja', 'Escribe el costo de la pérdida.', false)
  const f = new FormData()
  f.append('tipo', 'baja'); f.append('fecha', $('baja-fecha').value); f.append('producto', it.nombre)
  f.append('cantidad', $('baja-cantidad').value); f.append('costo', costo); f.append('motivo', motivo); f.append('motivoOtro', otro)
  f.append('obs', $('baja-obs').value.trim()); f.append('por', $('baja-por').value.trim())
  const foto = await fotoComoBlob($('baja-foto-prev'))
  if (foto) f.append('foto', foto, 'baja.jpg')
  const boton = e.target.querySelector('[type="submit"]')
  boton.disabled = true
  const { res, d } = await api('/api/inventario/movimientos', { method: 'POST', body: f })
  boton.disabled = false
  if (!res.ok) return aviso('msg-baja', d.error || 'Algo salió mal, intenta de nuevo.', false)
  guardarNombre($('baja-por').value.trim())
  e.target.reset(); $('baja-por').value = nombreGuardado(); $('baja-fecha').value = E.hoy; motivo = ''; $('baja-info').hidden = true; $('baja-otro').value = ''
  quitarFoto($('baja-foto-prev'))
  await refrescar()
  pintarMotivos('Materia prima'); aviso('msg-baja', 'Baja guardada.')
})
for (const id of ['ing-foto', 'ing-foto-cam', 'baja-foto', 'baja-foto-cam']) $(id).addEventListener('change', () => leerFoto($(id), $(id.replace('-cam', '') + '-prev')))

// mientras hay un inventario en curso, lo que cuentan los demas aparece solo
setInterval(async () => {
  if (document.hidden || !E || !E.conteo || $('card-inv').closest('[data-panel]').hidden) return
  if (editandoParcial || vista === 'revisar' || vista === 'elegir') return
  const act = document.activeElement
  if (act && act.matches('input') && act.value) return
  try {
    const antes = JSON.stringify([E.conteo, E.items.length]), n = cambios
    const { res, d } = await api('/api/inventario/estado')
    if (!res.ok || n !== cambios) return
    E = d
    if (JSON.stringify([E.conteo, E.items.length]) !== antes) { pintarCardInv(); pintarAvisos() }
  } catch (_) {}
}, 5000)

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me')
    if (rMe.status === 401) { window.location.href = '/index.html'; return }
    const me = await rMe.json()
    if (me.rol !== 'empleado') { window.location.href = '/index.html'; return }
    $('nombre-empresa').textContent = me.empresa.nombre
    if (me.empresa.logo) { $('logo-empresa').src = me.empresa.logo; $('logo-empresa').alt = `Logo de ${me.empresa.nombre}`; $('logo-empresa').hidden = false; $('logo-placeholder').hidden = true }
    const mods = me.empresa.modulosActivos || []
    if (!mods.includes('inventarios')) {
      document.querySelector('main').innerHTML = '<section class="card"><h2>Inventarios no está activo</h2><p class="ayuda">Este módulo no está habilitado para tu establecimiento. Si lo necesitas, escríbenos.</p></section>'
      return
    }
    await cargarEstado()
    $('ing-fecha').value = $('baja-fecha').value = E.hoy
    $('ing-fecha').max = $('baja-fecha').max = E.hoy
    $('ing-por').value = $('baja-por').value = nombreGuardado()
    const [a, m] = E.hoy.split('-').map(Number)
    $('op-mesant').textContent = `Mes anterior (${MESES_LARGOS[m === 1 ? 11 : m - 2]})`
    $('rep-desde').value = `${a}-${String(m).padStart(2, '0')}-01`; $('rep-hasta').value = E.hoy
    prepararUnidad(null); pintarCatsNueva(); pintarMotivos('Materia prima')
    pintarTodo()
    // desde el menu: "Ir al inventario general"
    if (location.hash === '#inventario-general') irA('existencias')
  } catch (err) {
    document.querySelector('main').innerHTML = '<section class="card"><p class="vacio">No se pudo cargar Inventarios. Recarga la página.</p></section>'
  }
}
iniciar()
