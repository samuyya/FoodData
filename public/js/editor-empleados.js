// editor de la lista de empleados de un modulo (agregar, editar, eliminar) con la opcion
// de hacer el mismo cambio en las otras listas
(function () {
  let modal = null;
  let cfg = null;

  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function armarModal() {
    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal ee-modal">
        <h2 id="ee-titulo"></h2>
        <p class="subtitulo" id="ee-sub"></p>
        <fieldset id="ee-aplicar" class="aplicar-en" hidden>
          <legend>Aplicar también en</legend>
          <div id="ee-aplicar-opciones"></div>
          <small>Cada módulo tiene su propia lista. Si marcas uno, agregar, editar o eliminar aquí también lo hace allá (se desmarca solo después de cada cambio).</small>
        </fieldset>
        <form id="ee-form" class="form-inline">
          <label class="campo">
            <span>Nuevo empleado</span>
            <input type="text" name="nombre" placeholder="Nombre completo" required pattern="[A-Za-zÀ-ÿÑñ ]+" title="Solo letras y espacios" />
          </label>
          <button type="submit" class="btn-primario">Agregar</button>
        </form>
        <p id="ee-msg" class="mensaje" hidden></p>
        <ul id="ee-lista" class="ee-lista"></ul>
        <div class="modal-acciones"><button type="button" id="ee-cerrar" class="btn-secundario">Cerrar</button></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#ee-cerrar').addEventListener('click', cerrar);
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) cerrar(); });
    modal.querySelector('#ee-form').addEventListener('submit', agregar);
    modal.querySelector('#ee-lista').addEventListener('click', clicLista);
  }

  const $ = (id) => modal.querySelector('#' + id);
  const marcados = () => Array.from(modal.querySelectorAll('#ee-aplicar-opciones input:checked'));
  const desmarcar = () => modal.querySelectorAll('#ee-aplicar-opciones input').forEach(i => { i.checked = false; });

  function msg(texto, error) {
    const m = $('ee-msg');
    m.textContent = texto;
    m.className = 'mensaje ' + (error ? 'mensaje-error' : 'mensaje-ok');
    m.hidden = false;
  }

  function textoAplicado(aplicado) {
    return (aplicado || []).map(a => ` En ${a.nombre}: ${a.resultado}.`).join('');
  }

  async function pedir(url, opciones) {
    try {
      const r = await fetch(url, opciones);
      const d = await r.json();
      if (!r.ok) { msg(d.error || 'Algo salió mal, intenta de nuevo', true); return null; }
      return d;
    } catch (err) {
      msg('no hay conexión', true);
      return null;
    }
  }

  const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

  async function cargar() {
    const d = await pedir(`/api/empleados?lista=${cfg.lista}`);
    if (!d) return;
    const ul = $('ee-lista');
    ul.innerHTML = d.empleados.length ? d.empleados.map(e => `
      <li data-id="${e._id}" data-nombre="${esc(e.nombre)}">
        <span class="ee-nombre">${esc(e.nombre)}</span>
        <span class="ee-acciones">
          <button type="button" class="btn-secundario btn-pequeno" data-editar>Editar</button>
          <button type="button" class="btn-eliminar-empleado" data-eliminar aria-label="Eliminar a ${esc(e.nombre)}">✕</button>
        </span>
      </li>`).join('') : '<li class="empleado-vacio">Aún no hay empleados en esta lista.</li>';
  }

  async function agregar(e) {
    e.preventDefault();
    const form = e.target;
    const d = await pedir(`/api/empleados?lista=${cfg.lista}`, json('POST', { nombre: form.nombre.value, aplicarEn: marcados().map(i => i.value) }));
    if (!d) return;
    form.reset();
    msg(`Empleado "${d.empleado.nombre}" agregado.` + textoAplicado(d.aplicado));
    desmarcar();
    await cargar();
    if (cfg.alCambiar) cfg.alCambiar();
  }

  function clicLista(e) {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    if (e.target.closest('[data-eliminar]')) return eliminar(li);
    if (e.target.closest('[data-editar]')) return editar(li);
    if (e.target.closest('[data-guardar]')) return guardarEdicion(li);
    if (e.target.closest('[data-cancelar]')) return cargar();
  }

  function editar(li) {
    li.innerHTML = `
      <input type="text" class="ee-input" value="${esc(li.dataset.nombre)}" pattern="[A-Za-zÀ-ÿÑñ ]+" title="Solo letras y espacios" aria-label="Nombre" />
      <span class="ee-acciones">
        <button type="button" class="btn-primario btn-pequeno" data-guardar>Guardar</button>
        <button type="button" class="btn-secundario btn-pequeno" data-cancelar>Cancelar</button>
      </span>`;
    li.querySelector('input').focus();
  }

  async function guardarEdicion(li) {
    const nombre = li.querySelector('input').value;
    const d = await pedir(`/api/empleados/${li.dataset.id}`, json('PUT', { nombre, aplicarEn: marcados().map(i => i.value) }));
    if (!d) return;
    msg('Listo.' + textoAplicado(d.aplicado));
    desmarcar();
    await cargar();
    if (cfg.alCambiar) cfg.alCambiar();
  }

  async function eliminar(li) {
    const tambien = marcados();
    const aviso = tambien.length ? `\nTambién se eliminará de: ${tambien.map(i => i.dataset.nombre).join(', ')}.` : '';
    if (!window.confirm(`¿Eliminar a "${li.dataset.nombre}"?${aviso}\nEsta acción no se puede deshacer.`)) return;
    const d = await pedir(`/api/empleados/${li.dataset.id}?aplicarEn=${tambien.map(i => i.value).join(',')}`, { method: 'DELETE' });
    if (!d) return;
    msg(`Empleado "${li.dataset.nombre}" eliminado.` + textoAplicado(d.aplicado));
    desmarcar();
    await cargar();
    if (cfg.alCambiar) cfg.alCambiar();
  }

  function cerrar() { modal.hidden = true; }

  async function abrir(opciones) {
    if (!modal) armarModal();
    cfg = opciones;
    $('ee-titulo').textContent = cfg.titulo;
    $('ee-sub').textContent = cfg.subtitulo || 'Agrega, edita o elimina los empleados de esta lista.';
    $('ee-msg').hidden = true;
    modal.hidden = false;
    // las otras listas a las que se puede aplicar el mismo cambio
    const l = await pedir('/api/empleados/listas');
    const otras = l ? l.listas.filter(x => x.id !== cfg.lista) : [];
    $('ee-aplicar-opciones').innerHTML = otras.map(x => `<label class="check-area"><input type="checkbox" value="${x.id}" data-nombre="${esc(x.nombre)}" /> ${esc(x.nombre)}</label>`).join('');
    $('ee-aplicar').hidden = otras.length === 0;
    cargar();
  }

  window.abrirEditorEmpleados = abrir;
})();
