const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PROGRAMAS = ['Limpieza y Desinfección', 'Residuos Sólidos', 'Plagas', 'Agua Potable', 'Capacitaciones', 'Mantenimiento', 'Trazabilidad', 'Proveedores', 'Muestreo', 'PQRS', 'Recall'];
const ORIGEN = { todos: 'Para todos', cargo: 'Por cargo', ingreso: 'De ingreso', manual: 'A mano' };

// ojo: estado.draft es el formulario abierto (nueva o editando), se va llenando con cada tecla
const estado = { tab: 'resumen', caps: [], cargos: [], res: { caps: [], gente: [] }, otras: [], editando: null, draft: null, abierto: null, editEmp: null, borrando: null };

function avisar(texto, error) {
  const m = $('cap-msg');
  m.textContent = texto;
  m.className = 'mensaje ' + (error ? 'mensaje-error' : 'mensaje-ok');
  m.hidden = false;
}

// pide la clave y avisa cuando ya la dieron. si cancelan, vuelve al menu
function pedirClave() {
  return new Promise((resolve) => {
    const modal = $('modal-clave'), form = $('form-clave'), err = $('clave-error');
    form.reset(); err.hidden = true; modal.hidden = false;
    setTimeout(() => form.password.focus(), 80);
    $('btn-clave-volver').onclick = () => { window.location.href = '/menu.html'; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; btn.textContent = 'Ingresando...';
      try {
        const r = await fetch('/api/admin/verificar-capacitaciones', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password.value })
        });
        const d = await r.json();
        if (!r.ok) { err.textContent = d.error || 'No se pudo verificar'; err.hidden = false; form.password.select(); return; }
        modal.hidden = true;
        resolve();
      } catch (x) {
        err.textContent = 'no hay conexion'; err.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = 'Ingresar';
      }
    };
  });
}

async function api(url, opciones) {
  try {
    const r = await fetch(url, opciones);
    const d = await r.json();
    if (r.status === 401 && d.requiereClaveAdmin) { await pedirClave(); return api(url, opciones); }
    if (!r.ok) { avisar(d.error || 'Algo salió mal, intenta de nuevo', true); return null; }
    return d;
  } catch (err) {
    avisar('no hay conexión', true);
    return null;
  }
}
const json = (metodo, cuerpo) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

async function cargar() {
  const [c, g, r, l] = await Promise.all([
    api('/api/capacitaciones/caps'), api('/api/capacitaciones/cargos'), api('/api/capacitaciones/resumen'), api('/api/empleados/listas')
  ]);
  if (c) estado.caps = c.capacitaciones;
  if (g) estado.cargos = g.cargos;
  if (r) estado.res = r;
  if (l) estado.otras = l.listas.filter(x => x.id !== 'capacitaciones');
  pintar();
}

const nombresCargos = (ids) => ids.map(id => (estado.cargos.find(c => c.id === id) || {}).nombre).filter(Boolean).join(', ') || 'ningún cargo';

// resumen
function pintarResumen() {
  const { caps, gente } = estado.res;
  const total = gente.reduce((n, g) => n + g.celdas.filter(Boolean).length, 0);
  let tabla;
  if (!caps.length || !gente.length) {
    tabla = `<p class="cap-vacio">${!caps.length ? 'Todavía no hay capacitaciones. Crea la primera en la pestaña Capacitaciones.' : 'Todavía no hay empleados. Agrégalos en la pestaña Cargos y empleados.'}</p>`;
  } else {
    tabla = `<div class="cap-tabla-wrap"><table class="cap-tabla"><thead><tr><th>Empleado</th>${caps.map(c => `<th>${esc(c.titulo)}</th>`).join('')}</tr></thead><tbody>
      ${gente.map(g => `<tr><td><b>${esc(g.nombre)}</b><br><span class="cap-muted">${g.cargo ? esc(g.cargo.nombre) : 'Sin cargo'}</span></td>
        ${g.celdas.map(o => `<td>${o ? `<span class="cap-celda">Asignada<small>${ORIGEN[o]}</small></span>` : '<span class="cap-na">—</span>'}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
  }
  $('tab-resumen').innerHTML = `
    <div class="cap-fila"><h2>Quién debe hacer qué</h2></div>
    <p class="cap-muted">Aquí verás también quién ya la hizo cuando los empleados empiecen a hacerlas. Por ahora muestra a quién le corresponde cada una.</p>
    <div class="cap-stats">
      <div class="cap-stat"><b>${gente.length}</b><span class="cap-muted">empleados</span></div>
      <div class="cap-stat"><b>${caps.length}</b><span class="cap-muted">capacitaciones activas</span></div>
      <div class="cap-stat"><b>${total}</b><span class="cap-muted">asignaciones</span></div>
    </div>${tabla}`;
}

// capacitaciones
function borrador(c) {
  const ev = c ? c.evaluacion : null;
  return {
    titulo: c ? c.titulo : '', descripcion: c ? c.descripcion : '', programa: c && c.programa ? String(c.programa) : '',
    materialTipo: c ? c.material.tipo : 'archivo', enlace: c ? c.material.enlace : '', archivo: null, archivoActual: c && c.material.tipo === 'archivo' ? c.material.archivoNombre : '',
    alcance: c ? c.alcance : 'todos', cargos: c ? c.cargos.slice() : [], ingreso: c ? c.ingreso : false, foto: c ? c.foto : false,
    evalActiva: ev ? ev.activa : false, minimo: ev ? ev.minimo : 80,
    preguntas: ev && ev.preguntas.length ? ev.preguntas.map(p => ({ texto: p.texto, opciones: p.opciones.slice(), correcta: p.correcta })) : [nuevaPregunta()]
  };
}
const nuevaPregunta = () => ({ texto: '', opciones: ['', '', ''], correcta: 0 });

function sw(id, on, texto) {
  return `<label class="check-area"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} /> ${esc(texto)}</label>`;
}

function formCap() {
  const d = estado.draft;
  const chips = estado.cargos.map(c => `<button type="button" class="cap-chip" data-cargo="${c.id}" aria-pressed="${d.cargos.includes(c.id)}">${esc(c.nombre)}</button>`).join('');
  const preguntas = d.preguntas.map((p, i) => `<div class="cap-pregunta">
      <div class="cap-fila"><b>Pregunta ${i + 1}</b>${d.preguntas.length > 1 ? `<button type="button" class="btn-secundario btn-pequeno" data-quitar-p="${i}">Quitar</button>` : ''}</div>
      <input type="text" data-p="${i}" data-campo="texto" value="${esc(p.texto)}" placeholder="Escribe la pregunta" maxlength="200" aria-label="Pregunta ${i + 1}" />
      ${p.opciones.map((o, k) => `<div class="cap-opcion"><input type="radio" name="correcta-${i}" data-p="${i}" data-correcta="${k}" ${p.correcta === k ? 'checked' : ''} aria-label="Es la correcta" /><input type="text" data-p="${i}" data-o="${k}" value="${esc(o)}" placeholder="Respuesta ${k + 1}" maxlength="120" aria-label="Respuesta ${k + 1}" /></div>`).join('')}
      <span class="cap-muted">Marca con el círculo cuál es la respuesta correcta. Las respuestas vacías se ignoran.</span>
    </div>`).join('');
  const material = d.materialTipo === 'archivo'
    ? `<div class="cap-caja"><input type="file" id="f-archivo" accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" />
       <span class="cap-muted">${d.archivo ? esc(d.archivo.name) : d.archivoActual ? `Material actual: ${esc(d.archivoActual)}. Elige otro archivo solo si quieres cambiarlo.` : 'PDF, imagen, Word, Excel, presentación o texto. Hasta 10 MB.'}</span></div>`
    : `<label class="cap-campo"><input type="text" id="f-enlace" value="${esc(d.enlace)}" placeholder="https://www.youtube.com/watch?v=..." maxlength="300" aria-label="Enlace del video" /></label>`;
  return `<div class="cap-form" id="cap-form">
    <h3>${estado.editando === 'nueva' ? 'Nueva capacitación' : 'Editar capacitación'}</h3>
    <div class="cap-grid2">
      <label class="cap-campo">Título<input type="text" id="f-titulo" value="${esc(d.titulo)}" maxlength="80" /></label>
      <label class="cap-campo">Programa del plan de saneamiento (opcional)<select id="f-programa"><option value="">Sin programa</option>${PROGRAMAS.map((p, i) => `<option value="${i + 1}" ${d.programa === String(i + 1) ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    </div>
    <label class="cap-campo">Descripción corta<textarea id="f-desc" rows="2" maxlength="300">${esc(d.descripcion)}</textarea></label>
    <div class="cap-col"><b>Material</b>
      <div class="cap-chips"><button type="button" class="cap-chip" data-mat="archivo" aria-pressed="${d.materialTipo === 'archivo'}">Subir archivo</button><button type="button" class="cap-chip" data-mat="enlace" aria-pressed="${d.materialTipo === 'enlace'}">Enlace de video</button></div>
      ${material}
      ${estado.editando !== 'nueva' ? '<span class="cap-muted">Si cambias el material, quienes ya la hicieron tendrán que repetirla.</span>' : ''}
    </div>
    <div class="cap-col"><b>¿Para quién es?</b>
      <div class="cap-chips"><button type="button" class="cap-chip" data-alc="todos" aria-pressed="${d.alcance === 'todos'}">Todos</button><button type="button" class="cap-chip" data-alc="cargos" aria-pressed="${d.alcance === 'cargos'}">Por cargo</button></div>
      ${d.alcance === 'cargos' ? (chips ? `<div class="cap-chips">${chips}</div>` : '<span class="cap-muted">Aún no hay cargos. Créalos en la pestaña Cargos y empleados.</span>') : ''}
    </div>
    ${sw('f-ingreso', d.ingreso, 'Incluir en el paquete de ingreso (se asigna a quien entre nuevo a la lista)')}
    ${sw('f-foto', d.foto, 'Pedir foto de confirmación')}
    ${sw('f-eval', d.evalActiva, 'Con evaluación')}
    ${d.evalActiva ? `<div class="cap-col">
      <label class="cap-campo">Nota mínima para aprobar<select id="f-minimo">${[50, 60, 70, 80, 90, 100].map(n => `<option ${d.minimo === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${preguntas}
      <button type="button" class="btn-secundario btn-pequeno" data-mas-p style="justify-self:start">+ Agregar pregunta</button>
    </div>` : ''}
    <div class="cap-acciones"><button type="button" class="btn-primario" id="cap-guardar">Guardar capacitación</button><button type="button" class="btn-secundario" data-cancelar-cap>Cancelar</button></div>
  </div>`;
}

function tarjetaCap(c) {
  const mat = c.material.tipo === 'archivo'
    ? `<a href="/api/capacitaciones/caps/${c.id}/material" target="_blank" rel="noopener">Ver material (${esc(c.material.archivoNombre)})</a>`
    : `<a href="${esc(c.material.enlace)}" target="_blank" rel="noopener">Abrir enlace del video</a>`;
  return `<article class="cap-item ${c.activa ? '' : 'cap-item--off'}">
    <div class="cap-fila"><h3>${esc(c.titulo)}</h3><span class="cap-muted">${c.activa ? `${c.asignadas} persona${c.asignadas === 1 ? '' : 's'} la tienen asignada` : 'Desactivada'}</span></div>
    ${c.descripcion ? `<p class="cap-muted">${esc(c.descripcion)}</p>` : ''}
    <div class="cap-tags">
      ${c.programa ? `<span class="cap-tag">${esc(PROGRAMAS[c.programa - 1])}</span>` : ''}
      <span class="cap-tag">Para: ${c.alcance === 'todos' ? 'todos' : esc(nombresCargos(c.cargos))}</span>
      ${c.ingreso ? '<span class="cap-tag cap-tag--aviso">Paquete de ingreso</span>' : ''}
      <span class="cap-tag">${c.evaluacion.activa ? `Evaluación: ${c.evaluacion.preguntas.length} pregunta${c.evaluacion.preguntas.length === 1 ? '' : 's'}, mínimo ${c.evaluacion.minimo} %` : 'Sin evaluación'}</span>
      ${c.foto ? '<span class="cap-tag">Pide foto</span>' : ''}
      <span class="cap-tag">Versión ${c.version}</span>
    </div>
    <div>${mat}</div>
    <div class="cap-acciones"><button type="button" class="btn-secundario btn-pequeno" data-editar-cap="${c.id}">Editar</button><button type="button" class="btn-secundario btn-pequeno" data-estado-cap="${c.id}" data-activa="${c.activa ? '0' : '1'}">${c.activa ? 'Desactivar' : 'Reactivar'}</button></div>
  </article>`;
}

function pintarCaps() {
  $('tab-caps').innerHTML = `
    <div class="cap-fila"><h2>Capacitaciones del restaurante</h2><button type="button" class="btn-primario" data-nueva-cap>+ Nueva capacitación</button></div>
    ${estado.editando === 'nueva' ? formCap() : ''}
    <div class="cap-lista">${estado.caps.length ? estado.caps.map(c => estado.editando === c.id ? formCap() : tarjetaCap(c)).join('') : (estado.editando ? '' : '<p class="cap-vacio">Todavía no hay capacitaciones.</p>')}</div>`;
}

// cargos y empleados
function opcionesCargo(sel, sin) {
  return `${sin ? `<option value="">${sin}</option>` : ''}${estado.cargos.map(c => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}`;
}

function filaCargo(c) {
  if (estado.borrando === c.id) {
    return `<div class="cap-caja"><b>${esc(c.nombre)}</b><span class="cap-muted">${c.personas} persona${c.personas === 1 ? '' : 's'} tiene${c.personas === 1 ? '' : 'n'} este cargo. ¿A cuál pasan?</span>
      <div class="cap-inline"><select id="reasignar" aria-label="Pasar a">${estado.cargos.filter(x => x.id !== c.id).map(x => `<option value="${x.id}">${esc(x.nombre)}</option>`).join('')}<option value="ninguno">Sin cargo</option></select>
      <button type="button" class="btn-secundario btn-pequeno" data-borrar-ok="${c.id}">Eliminar</button><button type="button" class="btn-secundario btn-pequeno" data-borrar-no>Cancelar</button></div></div>`;
  }
  return `<div class="cap-caja"><div class="cap-fila"><b>${esc(c.nombre)}</b><span class="cap-muted">${c.personas} persona${c.personas === 1 ? '' : 's'}</span></div>
    <div class="cap-acciones"><button type="button" class="btn-secundario btn-pequeno" data-renombrar-cargo="${c.id}">Editar</button><button type="button" class="btn-secundario btn-pequeno" data-borrar-cargo="${c.id}">Eliminar</button></div></div>`;
}

function filaEmpleado(g) {
  const abierto = estado.abierto === g.id;
  let nombre = `<div><b>${esc(g.nombre)}</b></div>`;
  if (estado.editEmp === g.id) {
    nombre = `<div class="cap-inline" style="flex:1"><input type="text" id="emp-nombre-${g.id}" value="${esc(g.nombre)}" pattern="[A-Za-zÀ-ÿÑñ ]+" title="Solo letras y espacios" aria-label="Nombre" /><button type="button" class="btn-primario btn-pequeno" data-emp-guardar="${g.id}">Guardar</button><button type="button" class="btn-secundario btn-pequeno" data-emp-cancelar>Cancelar</button></div>`;
  }
  const checklist = abierto ? `<div class="cap-caja"><b>Asignadas a ${esc(g.nombre.split(' ')[0])}</b><div class="cap-checks">
      ${estado.res.caps.length ? estado.res.caps.map((c, i) => `<label><input type="checkbox" data-asig="${g.id}" data-cap="${c.id}" ${g.celdas[i] ? 'checked' : ''} /> ${esc(c.titulo)} ${g.celdas[i] && g.celdas[i] !== 'todos' && g.celdas[i] !== 'cargo' ? `<span class="cap-tag cap-tag--aviso">${ORIGEN[g.celdas[i]]}</span>` : ''}</label>`).join('') : '<span class="cap-muted">Aún no hay capacitaciones.</span>'}
    </div><span class="cap-muted">Marca o desmarca para sumar o quitar una capacitación a esta persona.</span></div>` : '';
  return `<div class="cap-item cap-emp-fila">
    <div class="cap-fila">${nombre}
      <select data-cargo-emp="${g.id}" aria-label="Cargo de ${esc(g.nombre)}">${opcionesCargo(g.cargo ? g.cargo.id : '', 'Sin cargo')}</select></div>
    <div class="cap-acciones"><button type="button" class="btn-secundario btn-pequeno" data-ver-caps="${g.id}">Capacitaciones</button><button type="button" class="btn-secundario btn-pequeno" data-emp-editar="${g.id}">Editar nombre</button><button type="button" class="btn-secundario btn-pequeno" data-emp-borrar="${g.id}">Eliminar</button></div>
    ${checklist}</div>`;
}

function pintarGente() {
  const gente = estado.res.gente;
  $('tab-gente').innerHTML = `<div class="cap-dos">
    <div class="cap-col">
      <h2>Cargos</h2>
      ${estado.cargos.length ? estado.cargos.map(filaCargo).join('') : '<p class="cap-vacio">Aún no hay cargos (cocinero, mesero...).</p>'}
      <div class="cap-inline"><input type="text" id="nuevo-cargo" placeholder="Nuevo cargo" maxlength="30" aria-label="Nuevo cargo" /><button type="button" class="btn-secundario btn-pequeno" data-cargo-agregar>Agregar</button></div>
      <div class="cap-paquete"><b>Paquete de ingreso</b><span class="cap-muted">Se le asigna solo a quien entre a la lista desde ahora. Tú eliges cuáles. No cambia lo de quienes ya están.</span>
        <div class="cap-checks">${estado.res.caps.length ? estado.res.caps.map(c => {
          const cap = estado.caps.find(x => x.id === c.id);
          return `<label><input type="checkbox" data-paquete="${c.id}" ${cap && cap.ingreso ? 'checked' : ''} /> ${esc(c.titulo)}</label>`;
        }).join('') : '<span class="cap-muted">Crea capacitaciones para armar el paquete.</span>'}</div></div>
    </div>
    <div class="cap-col">
      <h2>Empleados</h2>
      <p class="cap-muted">Esta lista es solo de Capacitaciones: cambiarla aquí no toca Asistencia ni Presentación personal.</p>
      ${estado.otras.length ? `<fieldset class="aplicar-en"><legend>Aplicar también en</legend><div>${estado.otras.map(l => `<label class="check-area"><input type="checkbox" data-aplicar="${l.id}" data-nombre="${esc(l.nombre)}" /> ${esc(l.nombre)}</label>`).join('')}</div><small>Si marcas uno, agregar, editar o eliminar aquí también lo hace allá (se desmarca solo después de cada cambio).</small></fieldset>` : ''}
      <div class="cap-inline"><input type="text" id="nuevo-emp" placeholder="Nombre completo" pattern="[A-Za-zÀ-ÿÑñ ]+" title="Solo letras y espacios" aria-label="Nombre del nuevo empleado" /><select id="nuevo-emp-cargo" aria-label="Cargo del nuevo empleado">${opcionesCargo('', 'Sin cargo')}</select><button type="button" class="btn-primario btn-pequeno" data-emp-agregar>Agregar</button></div>
      <span class="cap-muted">Quien se agrega recibe el paquete de ingreso.</span>
      ${gente.length ? gente.map(filaEmpleado).join('') : '<p class="cap-vacio">Aún no hay empleados.</p>'}
    </div>
  </div>`;
}

function pintar() {
  document.querySelectorAll('.cap-tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.tab === estado.tab));
  ['resumen', 'caps', 'gente'].forEach(t => { $('tab-' + t).hidden = estado.tab !== t; });
  pintarResumen(); pintarCaps(); pintarGente();
}

// formulario de capacitaciones: se guarda cada cambio en el borrador sin repintar
function leerCampo(e) {
  const d = estado.draft, t = e.target;
  if (!d) return;
  if (t.id === 'f-titulo') d.titulo = t.value;
  else if (t.id === 'f-desc') d.descripcion = t.value;
  else if (t.id === 'f-programa') d.programa = t.value;
  else if (t.id === 'f-enlace') d.enlace = t.value;
  else if (t.id === 'f-minimo') d.minimo = parseInt(t.value, 10);
  else if (t.id === 'f-archivo') d.archivo = t.files[0] || null;
  else if (t.dataset.campo === 'texto') d.preguntas[t.dataset.p].texto = t.value;
  else if (t.dataset.o !== undefined) d.preguntas[t.dataset.p].opciones[t.dataset.o] = t.value;
  else if (t.dataset.correcta !== undefined) d.preguntas[t.dataset.p].correcta = parseInt(t.dataset.correcta, 10);
  else if (t.id === 'f-ingreso') d.ingreso = t.checked;
  else if (t.id === 'f-foto') d.foto = t.checked;
  else if (t.id === 'f-eval') { d.evalActiva = t.checked; pintarCaps(); }
}
$('cap-main').addEventListener('input', leerCampo);
$('cap-main').addEventListener('change', leerCampo);

async function guardarCap() {
  const d = estado.draft;
  const cuerpo = new FormData();
  cuerpo.append('datos', JSON.stringify({
    titulo: d.titulo, descripcion: d.descripcion, programa: d.programa, materialTipo: d.materialTipo, enlace: d.enlace,
    alcance: d.alcance, cargos: d.cargos, ingreso: d.ingreso, foto: d.foto,
    evaluacion: { activa: d.evalActiva, minimo: d.minimo, preguntas: d.preguntas }
  }));
  if (d.materialTipo === 'archivo' && d.archivo) cuerpo.append('archivo', d.archivo);
  const nueva = estado.editando === 'nueva';
  const btn = $('cap-guardar');
  btn.disabled = true; btn.textContent = 'Guardando...';
  const r = await api(nueva ? '/api/capacitaciones/caps' : `/api/capacitaciones/caps/${estado.editando}`, { method: nueva ? 'POST' : 'PUT', body: cuerpo });
  if (!r) { btn.disabled = false; btn.textContent = 'Guardar capacitación'; return; }
  estado.editando = null; estado.draft = null;
  avisar(nueva ? 'Capacitación creada.' : 'Capacitación guardada.');
  await cargar();
}

// aplicar en otras listas
const aplicarMarcado = () => Array.from(document.querySelectorAll('[data-aplicar]:checked'));
function textoAplicado(aplicado) {
  return (aplicado || []).map(a => ` En ${a.nombre}: ${a.resultado}.`).join('');
}

async function accionEmpleado(url, opciones, mensaje) {
  const r = await api(url, opciones);
  if (!r) return;
  avisar(mensaje(r) + textoAplicado(r.aplicado));
  estado.editEmp = null;
  await cargar();
}

// un solo manejador de clics para toda la pagina
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.tab) { estado.tab = d.tab; $('cap-msg').hidden = true; return pintar(); }

  // capacitaciones
  if ('nuevaCap' in d) { estado.editando = 'nueva'; estado.draft = borrador(null); return pintarCaps(); }
  if (d.editarCap) { estado.editando = d.editarCap; estado.draft = borrador(estado.caps.find(c => c.id === d.editarCap)); return pintarCaps(); }
  if ('cancelarCap' in d) { estado.editando = null; estado.draft = null; return pintarCaps(); }
  if (t.id === 'cap-guardar') return guardarCap();
  if (d.mat) { estado.draft.materialTipo = d.mat; return pintarCaps(); }
  if (d.alc) { estado.draft.alcance = d.alc; return pintarCaps(); }
  if (d.cargo) {
    const l = estado.draft.cargos;
    estado.draft.cargos = l.includes(d.cargo) ? l.filter(x => x !== d.cargo) : [...l, d.cargo];
    return pintarCaps();
  }
  if ('masP' in d) { estado.draft.preguntas.push(nuevaPregunta()); return pintarCaps(); }
  if (d.quitarP !== undefined) { estado.draft.preguntas.splice(d.quitarP, 1); return pintarCaps(); }
  if (d.estadoCap) {
    const r = await api(`/api/capacitaciones/caps/${d.estadoCap}/estado`, json('POST', { activa: d.activa === '1' }));
    if (r) { avisar(r.activa ? 'Capacitación reactivada.' : 'Capacitación desactivada. Se conserva por si la necesitas después.'); await cargar(); }
    return;
  }

  // cargos
  if ('cargoAgregar' in d) {
    const r = await api('/api/capacitaciones/cargos', json('POST', { nombre: $('nuevo-cargo').value }));
    if (r) { avisar(`Cargo "${r.cargo.nombre}" creado.`); await cargar(); }
    return;
  }
  if (d.renombrarCargo) {
    const c = estado.cargos.find(x => x.id === d.renombrarCargo);
    const nombre = window.prompt('Nuevo nombre del cargo', c.nombre);
    if (!nombre) return;
    const r = await api(`/api/capacitaciones/cargos/${c.id}`, json('PUT', { nombre }));
    if (r) { avisar('Cargo actualizado.'); await cargar(); }
    return;
  }
  if (d.borrarCargo) {
    const c = estado.cargos.find(x => x.id === d.borrarCargo);
    if (c.personas > 0) { estado.borrando = c.id; return pintarGente(); }
    if (!window.confirm(`¿Eliminar el cargo "${c.nombre}"?`)) return;
    const r = await api(`/api/capacitaciones/cargos/${c.id}`, { method: 'DELETE' });
    if (r) { avisar('Cargo eliminado.'); await cargar(); }
    return;
  }
  if ('borrarNo' in d) { estado.borrando = null; return pintarGente(); }
  if (d.borrarOk) {
    const r = await api(`/api/capacitaciones/cargos/${d.borrarOk}?reasignarA=${$('reasignar').value}`, { method: 'DELETE' });
    estado.borrando = null;
    if (r) { avisar('Cargo eliminado y las personas pasaron al cargo elegido.'); await cargar(); }
    return;
  }

  // empleados
  if ('empAgregar' in d) {
    const nombre = $('nuevo-emp').value;
    const aplicarEn = aplicarMarcado().map(i => i.dataset.aplicar);
    return accionEmpleado('/api/empleados?lista=capacitaciones', json('POST', { nombre, cargo: $('nuevo-emp-cargo').value || null, aplicarEn }), r => `Empleado "${r.empleado.nombre}" agregado.`);
  }
  if (d.verCaps) { estado.abierto = estado.abierto === d.verCaps ? null : d.verCaps; return pintarGente(); }
  if (d.empEditar) { estado.editEmp = d.empEditar; return pintarGente(); }
  if ('empCancelar' in d) { estado.editEmp = null; return pintarGente(); }
  if (d.empGuardar) {
    const g = estado.res.gente.find(x => x.id === d.empGuardar);
    const aplicarEn = aplicarMarcado().map(i => i.dataset.aplicar);
    return accionEmpleado(`/api/empleados/${g.id}`, json('PUT', { nombre: $('emp-nombre-' + g.id).value, cargo: g.cargo ? g.cargo.id : null, aplicarEn }), () => 'Listo.');
  }
  if (d.empBorrar) {
    const g = estado.res.gente.find(x => x.id === d.empBorrar);
    const tambien = aplicarMarcado();
    const aviso = tambien.length ? `\nTambién se eliminará de: ${tambien.map(i => i.dataset.nombre).join(', ')}.` : '';
    if (!window.confirm(`¿Eliminar a "${g.nombre}"?${aviso}\nEsta acción no se puede deshacer.`)) return;
    return accionEmpleado(`/api/empleados/${g.id}?aplicarEn=${tambien.map(i => i.dataset.aplicar).join(',')}`, { method: 'DELETE' }, () => `Empleado "${g.nombre}" eliminado.`);
  }
});

// selects y casillas que actuan al cambiar
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.dataset.cargoEmp) {
    const g = estado.res.gente.find(x => x.id === t.dataset.cargoEmp);
    const r = await api(`/api/empleados/${g.id}`, json('PUT', { nombre: g.nombre, cargo: t.value || null }));
    if (r) { avisar('Cargo actualizado.'); await cargar(); }
  } else if (t.dataset.asig) {
    const r = await api(`/api/capacitaciones/gente/${t.dataset.asig}/caps`, json('PUT', { capacitacion: t.dataset.cap, asignada: t.checked }));
    if (r) await cargar();
  } else if (t.dataset.paquete) {
    const ids = Array.from(document.querySelectorAll('[data-paquete]:checked')).map(i => i.dataset.paquete);
    const r = await api('/api/capacitaciones/paquete', json('PUT', { ids }));
    if (r) { avisar('Paquete de ingreso guardado. Aplica a quienes entren desde ahora.'); await cargar(); }
  }
});

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/index.html'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/index.html'; return; }
    $('nombre-empresa').textContent = me.empresa.nombre;
    if (me.empresa.logo) {
      $('logo-empresa').src = me.empresa.logo;
      $('logo-empresa').alt = `Logo de ${me.empresa.nombre}`;
      $('logo-empresa').hidden = false;
      $('logo-placeholder').hidden = true;
    }
    $('btn-volver').addEventListener('click', () => { window.location.href = '/menu.html'; });
    const est = await fetch('/api/capacitaciones/estado');
    if (est.status === 403) { document.body.innerHTML = '<p style="padding:2rem">Tu empresa no tiene este módulo habilitado.</p>'; return; }
    const e = await est.json();
    if (!e.admin) await pedirClave();
    $('cap-main').hidden = false;
    await cargar();
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando la página. Recarga.</p>';
  }
}

iniciar();
