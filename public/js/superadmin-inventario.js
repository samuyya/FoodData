// el superadmin le deja lista la lista de items a una empresa (plantilla + ajustes)
const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))
const leerPlata = s => +String(s).replace(/[^\d]/g, '') || 0
const empresaId = new URLSearchParams(location.search).get('empresa')
const q = '?empresa=' + encodeURIComponent(empresaId)

let cats = [], unidades = [], filas = []

$('btn-volver').addEventListener('click', () => { window.location.href = '/superadmin/dashboard.html' })

function aviso(texto, ok = true) {
  $('msg-editar').textContent = texto
  $('msg-editar').className = 'msg ' + (ok ? 'ok' : 'err')
}

async function cargar() {
  const [rEmp, rEst] = await Promise.all([
    fetch(`/api/superadmin/empresas/${encodeURIComponent(empresaId)}`),
    fetch('/api/inventario/estado' + q)
  ])
  if (rEmp.status === 401 || rEst.status === 401) { window.location.href = '/index.html'; return }
  if (!rEmp.ok || !rEst.ok) { $('main').innerHTML = '<p class="vacio">No se pudo cargar la empresa.</p>'; return }
  const { empresa } = await rEmp.json()
  const e = await rEst.json()
  $('nombre-empresa').textContent = empresa.nombre
  $('aviso-modulo').hidden = (empresa.modulosActivos || []).includes('inventarios')
  cats = e.categorias; unidades = e.unidades
  filas = e.items.map(i => ({ id: i.id, nombre: i.nombre, cat: i.cat, u: i.u, precio: i.precio, presNombre: i.pres ? i.pres.nombre : '', presCant: i.pres ? i.pres.cant : '', cuenta: i.cuenta }))
  pintar()
}

function pintar() {
  const ops = (lista, sel) => lista.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('')
  $('tb-editar').innerHTML = filas.length ? filas.map((it, k) => `<tr class="${it.borrar ? 'fila-borrada' : ''}">
    <td><input value="${esc(it.nombre)}" data-ed="${k}:nombre" aria-label="Nombre"></td>
    <td><select data-ed="${k}:cat" aria-label="Categoría">${ops(cats, it.cat)}</select></td>
    <td><select data-ed="${k}:u" aria-label="Unidad">${ops(unidades, it.u)}</select></td>
    <td><div class="pesos"><input inputmode="numeric" value="${it.precio ? Math.round(it.precio).toLocaleString('es-CO') : ''}" data-ed="${k}:precio" aria-label="Valor por unidad"></div></td>
    <td><div class="presentacion"><input placeholder="Ej. Caja" data-ed="${k}:presNombre" value="${esc(it.presNombre)}" style="width:84px" aria-label="Presentación de compra"><span class="meta">de</span><input type="number" min="2" placeholder="24" data-ed="${k}:presCant" value="${esc(it.presCant)}" style="width:62px" aria-label="Cuántas unidades trae"></div></td>
    <td style="text-align:center"><input type="checkbox" ${it.cuenta ? 'checked' : ''} data-ed="${k}:cuenta" aria-label="Se cuenta en el inventario general" style="width:18px;height:18px;accent-color:var(--primario)"></td>
    <td>${it.borrar ? `<button type="button" class="btn-mini" data-deshacer="${k}">Deshacer</button>` : `<button type="button" class="btn-borrar" data-borrar="${k}">🗑 Borrar</button>`}</td></tr>`).join('')
    : '<tr><td colspan="7" class="vacio">Todavía no hay ítems. Carga la plantilla o agrégalos uno por uno.</td></tr>'
}

document.addEventListener('input', e => {
  const t = e.target
  if (t.matches('.pesos input')) { const v = leerPlata(t.value); t.value = v ? v.toLocaleString('es-CO') : '' }
  if (!t.dataset.ed) return
  const [k, campo] = t.dataset.ed.split(':')
  filas[+k][campo] = campo === 'precio' ? leerPlata(t.value) : campo === 'cuenta' ? t.checked : t.value
})
document.addEventListener('change', e => {
  const t = e.target
  if (!t.dataset.ed) return
  const [k, campo] = t.dataset.ed.split(':')
  filas[+k][campo] = campo === 'precio' ? leerPlata(t.value) : campo === 'cuenta' ? t.checked : t.value
})

document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return
  if (t.dataset.borrar !== undefined) {
    const k = +t.dataset.borrar
    if (!filas[k].id) filas.splice(k, 1); else filas[k].borrar = true
    pintar()
  }
  if (t.dataset.deshacer !== undefined) { delete filas[+t.dataset.deshacer].borrar; pintar() }
  if (t.id === 'btn-agregar-fila') {
    filas.push({ id: null, nombre: '', cat: 'Materia prima', u: 'kg', precio: 0, presNombre: '', presCant: '', cuenta: true })
    pintar()
    document.querySelector(`[data-ed="${filas.length - 1}:nombre"]`).focus()
  }
  if (t.id === 'btn-plantilla') {
    t.disabled = true
    const r = await fetch('/api/inventario/items/plantilla' + q, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    t.disabled = false
    if (!r.ok) return aviso(d.error || 'Algo salió mal, intenta de nuevo.', false)
    await cargar()
    aviso(d.agregados ? `Listo: se agregaron ${d.agregados} ítems.` : 'La empresa ya tenía todos los ítems de la plantilla.')
  }
  if (t.id === 'btn-guardar-lista') {
    t.disabled = true
    const cambios = filas.map(f => ({ ...f, borrar: f.borrar === true }))
    const r = await fetch('/api/inventario/items' + q, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cambios }) })
    const d = await r.json().catch(() => ({}))
    t.disabled = false
    if (!r.ok) return aviso(d.error || 'Algo salió mal, intenta de nuevo.', false)
    await cargar()
    aviso('Cambios guardados.')
  }
})

cargar()
