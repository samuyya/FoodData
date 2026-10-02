// celular que entra con el link del inventario general: codigo, nombre y a contar.
// no ve nada mas de la app
const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const num = n => (+n).toLocaleString('es-CO', { maximumFractionDigits: 2 })
const token = location.pathname.split('/').pop()
const base = '/api/contar/' + encodeURIComponent(token)
const main = $('main')
const CATS = ['Materia prima', 'Bebidas', 'Menaje', 'Mobiliario', 'Insumos', 'Otros gastos']
const CONSUMIBLE = c => ['Materia prima', 'Bebidas', 'Insumos'].includes(c)
const pillCat = c => `<span class="cat" data-c="${esc(c)}">${esc(c)}</span>`

let paso = 'codigo', error = '', nombre = '', parte = null
let datos = null           // { yo, items, conteo }
let editando = null        // { id, i }
let guardado = null

async function api(url, body) {
  const o = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  const res = await fetch(url, o)
  let d = {}
  try { d = await res.json() } catch (_) {}
  return { res, d }
}

function cerrado(motivo) {
  paso = 'fin'
  main.innerHTML = motivo === 'bloqueado'
    ? '<section class="card entrada"><div class="bloqueado">Acceso bloqueado</div><p>Se escribió mal el código 5 veces. Pídele al administrador un link nuevo.</p></section>'
    : motivo === 'sacado'
      ? '<section class="card entrada"><h2>Ya no estás en el inventario</h2><p>El administrador te sacó del conteo. Si fue un error, pídele que te deje entrar de nuevo con el código.</p><button type="button" class="btn-pri" data-accion="otra-vez">Entrar con el código</button></section>'
      : '<section class="card entrada"><h2>Este link ya no está disponible</h2><p>El acceso venció, se cerró o el inventario ya se envió. Si necesitas entrar, pídele un link nuevo al administrador.</p></section>'
}

const items = () => datos.items
const cuentas = () => datos.conteo.cuentas || {}
const contado = id => (cuentas()[id] || []).length > 0
const totalDe = id => (cuentas()[id] || []).reduce((a, n) => a + n, 0)
const catsConteo = () => CATS.filter(c => items().some(i => i.cat === c))
function estadoParte(c) {
  const l = items().filter(i => i.cat === c)
  const n = l.filter(i => contado(i.id)).length
  return { n, total: l.length, lista: n === l.length && n > 0, curso: n > 0 && n < l.length }
}
const quienEn = c => ((datos.conteo.acceso && datos.conteo.acceso.conectados) || []).filter(x => x.parte === c).map(x => x.nombre)

function filaContar(it) {
  const parciales = cuentas()[it.id] || []
  const chips = parciales.map((n, i) => editando && editando.id === it.id && editando.i === i
    ? `<span class="parcial"><input type="number" min="0" step="any" value="${n}" data-editar-parcial="${it.id}:${i}" aria-label="Corregir cantidad"></span>`
    : `<span class="parcial"><button type="button" data-corregir="${it.id}:${i}" title="Corregir">${num(n)}</button><button type="button" class="quitar" data-quitar="${it.id}:${i}" aria-label="Quitar ${num(n)}">×</button></span>`
  ).join('<span class="mas">+</span>')
  return `<div class="item-conteo"><div class="nombre"><b>${esc(it.nombre)}</b><span class="meta">en ${it.u}</span></div>
    <div class="parciales">${chips}${parciales.length ? `<span class="total-item">= ${num(totalDe(it.id))} ${it.u}</span>` : '<span class="total-item vacio">Sin contar</span>'}${guardado === it.id ? '<span class="guardado-ok">✓ Guardado</span>' : ''}</div>
    <div class="sumar"><input type="number" min="0" step="any" placeholder="0" data-sumar-input="${it.id}" aria-label="Cantidad contada de ${esc(it.nombre)}"><button type="button" data-sumar="${it.id}">${parciales.length ? '+ Sumar' : 'Agregar'}</button></div></div>`
}

function pintar() {
  if (paso === 'fin') return
  if (paso === 'codigo') {
    main.innerHTML = `<section class="card entrada"><h2>Inventario general</h2><p>Ingresa el código de autorización que te dio el administrador.</p>
      <form id="form-codigo" style="display:grid;gap:.8rem">
        <input class="codigo-input" id="inv-codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Código de autorización">
        ${error ? `<p class="denegado">${esc(error)}</p>` : ''}
        <button type="submit" class="btn-pri">Entrar</button>
      </form></section>`
    $('inv-codigo').focus()
    return
  }
  if (paso === 'nombre') {
    main.innerHTML = `<section class="card entrada"><h2>¿Cómo te llamas?</h2><p>Tu nombre queda con lo que cuentes.</p>
      <form id="form-nombre" style="display:grid;gap:.8rem">
        <input class="nombre-input" id="inv-nombre" placeholder="Tu nombre" value="${esc(nombre)}" autocomplete="name">
        <button type="submit" class="btn-pri">Seguir</button>
      </form></section>`
    $('inv-nombre').focus()
    return
  }
  if (paso === 'partes') {
    const partes = catsConteo().map(c => ({ c, ...estadoParte(c), quien: quienEn(c).filter(n => n !== nombre) }))
    main.innerHTML = `<section class="card"><h2>Hola, ${esc(nombre)}</h2><p class="ayuda">Elige qué vas a contar.</p>
      <div class="partes">${partes.map(p => `<div class="parte${p.lista ? ' lista' : ''}">${pillCat(p.c)}
        <span class="estado ${p.lista ? 'lista' : p.curso ? 'curso' : 'pend'}">${p.lista ? '✓ Lista' : p.curso ? `En curso · ${p.n} de ${p.total}` : `Sin empezar · ${p.total} ítems`}</span>
        ${p.quien.length ? `<span class="en-parte">${p.quien.map(esc).join(', ')} está${p.quien.length > 1 ? 'n' : ''} contando aquí</span>` : ''}
        <button type="button" class="btn-mini" data-parte="${esc(p.c)}">${p.lista ? 'Revisar' : 'Contar esta parte'}</button></div>`).join('') || '<p class="meta">Todavía no hay nada en la lista de conteo.</p>'}</div></section>`
    return
  }
  // contando
  const tomadaPor = quienEn(parte).filter(n => n !== nombre)
  main.innerHTML = `<section class="card"><div class="fila-botones"><h2>Contar: ${esc(parte)}</h2><button type="button" class="btn-sec" data-accion="volver">← Partes</button></div>
    ${tomadaPor.length ? `<p class="nota-inv">⚠️ ${tomadaPor.map(esc).join(', ')} también está contando esta parte. Pónganse de acuerdo para no contar lo mismo dos veces.</p>` : ''}
    <p class="meta">Escribe lo que cuentes y toca <b>Sumar</b>. Todo se guarda solo y se ve al instante en los demás celulares. ${CONSUMIBLE(parte) ? 'Cuenta lo que quedó.' : 'Cuenta lo que hay.'}</p>
    ${items().filter(i => i.cat === parte).map(filaContar).join('')}
    <div class="fila-botones" style="margin-top:1rem"><span></span><button type="button" class="btn-pri" data-accion="terminar">Terminé esta parte</button></div></section>`
}

// cuenta los cambios hechos aqui; si cambian mientras se trae el conteo, esa respuesta ya llego vieja
let cambios = 0
async function escribir(url, body) {
  cambios++
  const r = await api(url, body)
  cambios++
  return r
}
async function cargarConteo() {
  const n = cambios
  const { res, d } = await api(base + '/conteo')
  if (!res.ok) { cerrado(d.motivo); return false }
  if (n !== cambios) return true
  datos = d
  nombre = d.yo
  return true
}

async function revisar() {
  const { d } = await api(base)
  if (!d.disponible) return cerrado(d.motivo)
  if (d.empresa) $('donde').textContent = 'Inventario general · ' + d.empresa
  if (d.paso === 'sacado') return cerrado('sacado')
  paso = d.paso
  nombre = d.nombre || ''
  if (paso === 'partes' && !(await cargarConteo())) return
  pintar()
}

async function sumar(id) {
  const input = document.querySelector(`[data-sumar-input="${id}"]`)
  const v = parseFloat(input.value)
  if (!(v >= 0) || input.value === '') { input.focus(); return }
  ;(datos.conteo.cuentas[id] = datos.conteo.cuentas[id] || []).push(v)
  guardado = id
  pintar()
  const nuevo = document.querySelector(`[data-sumar-input="${id}"]`); if (nuevo) nuevo.focus()
  const { res, d } = await escribir(base + '/sumar', { itemId: id, valor: v })
  if (!res.ok) { if (d.motivo) return cerrado(d.motivo); alert(d.error || 'No se pudo guardar, intenta de nuevo.'); await cargarConteo(); pintar() }
}
async function guardarParcial(input) {
  const [id, i] = input.dataset.editarParcial.split(':')
  const v = parseFloat(input.value)
  editando = null
  if (v >= 0) {
    datos.conteo.cuentas[id][+i] = v
    pintar()
    await escribir(base + '/parcial', { itemId: id, i: +i, valor: v })
  } else pintar()
}

document.addEventListener('submit', async e => {
  e.preventDefault()
  if (e.target.id === 'form-codigo') {
    const { res, d } = await api(base + '/entrar', { codigo: $('inv-codigo').value })
    if (!res.ok) {
      if (d.motivo) return cerrado(d.motivo)
      error = d.error || 'Algo salió mal, intenta de nuevo.'
      return pintar()
    }
    error = ''; paso = 'nombre'
    try { nombre = localStorage.getItem('fd_inv_nombre') || '' } catch (_) {}
    pintar()
  }
  if (e.target.id === 'form-nombre') {
    const n = $('inv-nombre').value.trim()
    if (!n) { $('inv-nombre').focus(); return }
    const { res, d } = await api(base + '/nombre', { nombre: n })
    if (!res.ok) return cerrado(d.motivo)
    try { localStorage.setItem('fd_inv_nombre', n) } catch (_) {}
    paso = 'partes'
    if (await cargarConteo()) pintar()
  }
})

document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return
  const d = t.dataset
  if (d.accion === 'otra-vez') { paso = 'codigo'; error = ''; pintar() }
  if (d.parte) {
    parte = d.parte; paso = 'contar'; editando = null; guardado = null
    pintar(); window.scrollTo(0, 0)
    await api(base + '/parte', { parte })
  }
  if (d.accion === 'volver' || d.accion === 'terminar') {
    paso = 'partes'
    const r = await api(base + '/parte', { terminar: true })
    if (!r.res.ok) return cerrado(r.d.motivo)
    if (await cargarConteo()) pintar()
    window.scrollTo(0, 0)
  }
  if (d.sumar) sumar(d.sumar)
  if (d.corregir) { const [id, i] = d.corregir.split(':'); editando = { id, i: +i }; pintar(); const el = document.querySelector(`[data-editar-parcial="${id}:${i}"]`); el.focus(); el.select() }
  if (d.quitar) {
    const [id, i] = d.quitar.split(':')
    datos.conteo.cuentas[id].splice(+i, 1)
    pintar()
    await escribir(base + '/parcial', { itemId: id, i: +i, valor: null })
  }
})
document.addEventListener('keydown', e => {
  const t = e.target
  if (e.key === 'Enter' && t.dataset.sumarInput) { e.preventDefault(); sumar(t.dataset.sumarInput) }
  if (e.key === 'Enter' && t.dataset.editarParcial) { e.preventDefault(); guardarParcial(t) }
  if (e.key === 'Escape' && t.dataset.editarParcial) { editando = null; pintar() }
})
document.addEventListener('focusout', e => { if (e.target.dataset && e.target.dataset.editarParcial && editando) guardarParcial(e.target) })

// lo que cuentan los demas aparece solo, sin pisar lo que se esta escribiendo
setInterval(async () => {
  if (document.hidden || !datos || (paso !== 'partes' && paso !== 'contar') || editando) return
  const act = document.activeElement
  if (act && act.matches('input') && act.value) return
  const antes = JSON.stringify(datos.conteo)
  if (!(await cargarConteo())) return
  if (JSON.stringify(datos.conteo) !== antes) pintar()
}, 5000)

revisar()
