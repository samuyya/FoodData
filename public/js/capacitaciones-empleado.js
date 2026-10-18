// lo que ve el empleado: elige su nombre, ve lo suyo y lo hace paso a paso
// usa $ y esc de capacitaciones.js (se cargan juntos)
const SEGUNDOS_MATERIAL = 15; // tiempo minimo antes de poder seguir, para que no se salten la lectura

const emp = { persona: null, mis: null, cap: null, pasos: [], paso: 0, abierto: false, seg: 0, timer: null, q: 0, resp: [], nota: null, stream: null, blob: null };

function avisarEmp(texto, error = true) {
  const m = $('emp-msg');
  m.textContent = texto;
  m.className = 'mensaje ' + (error ? 'mensaje-error' : 'mensaje-ok');
  m.hidden = false;
}

async function pedirEmp(url, opciones) {
  try {
    const r = await fetch(url, opciones);
    const d = await r.json();
    if (!r.ok) { avisarEmp(d.error || 'Algo salió mal, intenta de nuevo'); return null; }
    return d;
  } catch (err) {
    avisarEmp('no hay conexión');
    return null;
  }
}

function mostrarEmp(vista) {
  ['nombres', 'lista', 'hacer'].forEach(v => { $('emp-' + v).hidden = v !== vista; });
  if (vista !== 'hacer') { pararTimer(); pararCamara(); }
}

function pararTimer() { clearInterval(emp.timer); emp.timer = null; }
function pararCamara() {
  if (emp.stream) emp.stream.getTracks().forEach(t => t.stop());
  emp.stream = null;
}

// elegir nombre
async function verNombres() {
  $('emp-msg').hidden = true;
  emp.persona = null;
  const d = await pedirEmp('/api/capacitaciones/mis/gente');
  if (!d) return;
  $('emp-nombres').innerHTML = `<h2>Selecciona tu nombre</h2>` + (d.gente.length
    ? `<ul class="lista-empleados">${d.gente.map(g => `<li><button type="button" class="boton-empleado" data-persona="${g.id}" data-nombre="${esc(g.nombre)}">${esc(g.nombre)}</button></li>`).join('')}</ul>`
    : '<p class="cap-vacio">Todavía no hay empleados en esta lista. El administrador los agrega en "Administrar".</p>');
  mostrarEmp('nombres');
}

// lo suyo
async function verLista() {
  const d = await pedirEmp(`/api/capacitaciones/mis/${emp.persona.id}`);
  if (!d) return;
  emp.mis = d;
  const fecha = (f) => new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  $('emp-lista').innerHTML = `
    <div class="cap-fila"><div><h2>Hola, ${esc(d.persona.nombre.split(' ')[0])}</h2><p class="cap-muted">${d.persona.cargo ? esc(d.persona.cargo) : 'Sin cargo asignado'}</p></div>
      <button type="button" class="btn-secundario btn-pequeno" data-cambiar>No soy yo</button></div>
    <h3 class="cap-sub">Por hacer</h3>
    ${d.pendientes.length ? d.pendientes.map(p => `<button type="button" class="cap-grande" data-hacer="${p.id}"><span><b>${esc(p.titulo)}</b>${p.repetir ? '<br><span class="cap-tag cap-tag--aviso">Hay material nuevo: toca repetirla</span>' : p.descripcion ? `<br><span class="cap-muted">${esc(p.descripcion)}</span>` : ''}</span><span aria-hidden="true">›</span></button>`).join('') : '<p class="cap-vacio">No tienes capacitaciones pendientes.</p>'}
    <h3 class="cap-sub">Ya hechas</h3>
    ${d.hechas.length ? d.hechas.map(h => `<div class="cap-item"><b>${esc(h.titulo)}</b><span class="cap-celda cap-celda--ok">✓ ${fecha(h.fecha)}${h.nota != null ? ` · nota ${h.nota} %` : ''}</span></div>`).join('') : '<p class="cap-vacio">Todavía no has hecho ninguna.</p>'}`;
  mostrarEmp('lista');
}

// hacer una capacitacion: material -> evaluacion -> foto -> constancia
async function empezar(capId) {
  $('emp-msg').hidden = true;
  const d = await pedirEmp(`/api/capacitaciones/mis/${emp.persona.id}/caps/${capId}`);
  if (!d) return;
  if (d.yaHecha) { avisarEmp('Ya hiciste esta capacitación.', false); return verLista(); }
  const c = d.capacitacion;
  Object.assign(emp, { cap: c, abierto: false, q: 0, resp: [], nota: null, blob: null, paso: 0 });
  emp.pasos = ['material', ...(c.evaluacion.activa ? ['evaluacion'] : []), ...(c.foto ? ['foto'] : []), 'listo'];
  pintarPaso();
}

const ETIQUETA = { material: 'Material', evaluacion: 'Evaluación', foto: 'Foto', listo: 'Listo' };

function barraPasos() {
  return `<div class="cap-pasos" style="grid-template-columns:repeat(${emp.pasos.length},1fr)">${emp.pasos.map((p, i) => `<span class="${i <= emp.paso ? 'on' : ''}">${ETIQUETA[p]}</span>`).join('')}</div>`;
}

function pintarPaso() {
  pararTimer();
  const paso = emp.pasos[emp.paso];
  if (paso !== 'foto') pararCamara();
  const c = emp.cap;
  let cuerpo = '';
  if (paso === 'material') {
    const href = c.material.tipo === 'archivo' ? `/api/capacitaciones/mis/${emp.persona.id}/caps/${c.id}/material` : c.material.enlace;
    cuerpo = `<h2>${esc(c.titulo)}</h2>${c.descripcion ? `<p class="cap-muted">${esc(c.descripcion)}</p>` : ''}
      <div class="cap-caja"><a class="btn-secundario" href="${esc(href)}" target="_blank" rel="noopener" data-abrir>${c.material.tipo === 'archivo' ? `Abrir material (${esc(c.material.archivoNombre)})` : 'Abrir el video'}</a>
        <span class="cap-muted">Ábrelo, léelo o míralo completo y vuelve aquí.</span></div>
      <p class="cap-muted" id="emp-espera"></p>
      <button type="button" class="btn-primario" id="emp-sigue" disabled>${emp.pasos[emp.paso + 1] === 'listo' ? 'Ya lo revisé, registrar' : 'Ya lo revisé, continuar'}</button>`;
  } else if (paso === 'evaluacion') {
    cuerpo = vistaPregunta();
  } else if (paso === 'foto') {
    cuerpo = `<h2>Foto de confirmación</h2>
      <div class="camara-wrap"><video id="emp-video" autoplay playsinline muted></video><canvas id="emp-canvas" class="foto-preview" hidden></canvas></div>
      <p class="cap-muted">Esta capacitación pide una foto para dejar evidencia de que la hiciste tú.</p>
      <div class="cap-acciones"><button type="button" class="btn-primario" id="emp-tomar">Tomar foto</button><button type="button" class="btn-secundario" id="emp-repetir" hidden>Repetir foto</button><button type="button" class="btn-primario" id="emp-confirmar" hidden>Confirmar y registrar</button></div>`;
  } else {
    cuerpo = `<div class="cap-listo"><div class="cap-marca">✓</div><h2>Constancia guardada</h2><p>${esc(emp.persona.nombre)} · ${esc(c.titulo)}</p>
      <p class="cap-muted">${new Date(emp.fin.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}${emp.fin.nota != null ? ` · Nota ${emp.fin.nota} %` : ''}</p>
      <button type="button" class="btn-primario" data-volver-lista>Volver a mis capacitaciones</button></div>`;
  }
  $('emp-hacer').innerHTML = `<div class="cap-fila"><button type="button" class="btn-secundario btn-pequeno" data-cancelar-hacer ${paso === 'listo' ? 'hidden' : ''}>← Salir</button></div>${barraPasos()}${cuerpo}`;
  mostrarEmp('hacer');
  if (paso === 'material') arrancarEspera();
  if (paso === 'foto') arrancarCamara();
}

function arrancarEspera() {
  emp.seg = SEGUNDOS_MATERIAL;
  const tick = () => {
    const boton = $('emp-sigue'), txt = $('emp-espera');
    if (!boton) return pararTimer();
    if (emp.seg > 0) emp.seg--;
    if (!emp.abierto) txt.textContent = 'Abre el material para poder continuar.';
    else if (emp.seg > 0) txt.textContent = `Podrás continuar en 0:${String(emp.seg).padStart(2, '0')}`;
    else txt.textContent = '';
    boton.disabled = !(emp.abierto && emp.seg <= 0);
  };
  tick();
  emp.timer = setInterval(tick, 1000);
}

function vistaPregunta() {
  const ev = emp.cap.evaluacion;
  const p = ev.preguntas[emp.q];
  const sel = emp.resp[emp.q];
  return `<h2>Evaluación</h2><p class="cap-muted">Pregunta ${emp.q + 1} de ${ev.preguntas.length} · necesitas ${ev.minimo} % para aprobar</p>
    <p><b>${esc(p.texto)}</b></p>
    <div class="cap-col">${p.opciones.map((o, i) => `<button type="button" class="cap-opt" data-opt="${i}" aria-pressed="${sel === i}">${esc(o)}</button>`).join('')}</div>
    <button type="button" class="btn-primario" id="emp-sig-preg" ${sel == null ? 'disabled' : ''}>${emp.q < ev.preguntas.length - 1 ? 'Siguiente' : 'Terminar evaluación'}</button>`;
}

async function enviarEvaluacion() {
  const d = await pedirEmp(`/api/capacitaciones/mis/${emp.persona.id}/caps/${emp.cap.id}/evaluar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ respuestas: emp.resp })
  });
  if (!d) return;
  if (!d.aprobada) {
    $('emp-hacer').innerHTML = `<div class="cap-fila"><button type="button" class="btn-secundario btn-pequeno" data-cancelar-hacer>← Salir</button></div>${barraPasos()}
      <div class="cap-listo"><h2>Sacaste ${d.nota} %</h2><p>Necesitas ${d.minimo} % para aprobar. Repasa el material e intenta de nuevo.</p>
      <button type="button" class="btn-primario" data-reintentar>Intentar de nuevo</button></div>`;
    return;
  }
  emp.nota = d.nota;
  siguientePaso();
}

function siguientePaso() {
  emp.paso++;
  if (emp.pasos[emp.paso] === 'listo') return terminar();
  pintarPaso();
}

// cámara (igual que en asistencia)
async function arrancarCamara() {
  try {
    emp.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const v = $('emp-video');
    if (v) v.srcObject = emp.stream; else pararCamara();
  } catch (err) {
    avisarEmp('No se pudo abrir la cámara. Revisa que el navegador tenga permiso de cámara.');
    const b = $('emp-tomar'); if (b) b.hidden = true;
  }
}

function tomarFoto() {
  const v = $('emp-video'), c = $('emp-canvas');
  const escala = Math.min(1, 800 / (v.videoWidth || 800));
  c.width = Math.round((v.videoWidth || 800) * escala);
  c.height = Math.round((v.videoHeight || 800) * escala);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  v.hidden = true; c.hidden = false;
  $('emp-tomar').hidden = true; $('emp-repetir').hidden = false; $('emp-confirmar').hidden = false;
}

function repetirFoto() {
  $('emp-video').hidden = false; $('emp-canvas').hidden = true;
  $('emp-tomar').hidden = false; $('emp-repetir').hidden = true; $('emp-confirmar').hidden = true;
}

async function terminar() {
  const cuerpo = new FormData();
  if (emp.cap.evaluacion.activa) cuerpo.append('respuestas', JSON.stringify(emp.resp));
  if (emp.blob) cuerpo.append('foto', emp.blob, 'foto.jpg');
  const d = await pedirEmp(`/api/capacitaciones/mis/${emp.persona.id}/caps/${emp.cap.id}/terminar`, { method: 'POST', body: cuerpo });
  if (!d) { emp.paso = Math.max(0, emp.pasos.length - 2); pintarPaso(); return; }
  emp.fin = d.constancia;
  emp.paso = emp.pasos.length - 1;
  pararCamara();
  pintarPaso();
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('#cap-main') || e.target.closest('.modal-backdrop')) return;
  const a = e.target.closest('[data-abrir]');
  if (a) { emp.abierto = true; return; }
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;

  if (d.persona) { emp.persona = { id: d.persona, nombre: d.nombre }; $('emp-msg').hidden = true; return verLista(); }
  if ('cambiar' in d) return verNombres();
  if (d.hacer) return empezar(d.hacer);
  if ('cancelarHacer' in d) { pararTimer(); pararCamara(); return verLista(); }
  if ('volverLista' in d) return verLista();
  if (t.id === 'emp-sigue') return siguientePaso();
  if (d.opt !== undefined) { emp.resp[emp.q] = parseInt(d.opt, 10); return pintarPaso(); }
  if (t.id === 'emp-sig-preg') {
    if (emp.q < emp.cap.evaluacion.preguntas.length - 1) { emp.q++; return pintarPaso(); }
    t.disabled = true;
    return enviarEvaluacion();
  }
  if ('reintentar' in d) { emp.q = 0; emp.resp = []; return pintarPaso(); }
  if (t.id === 'emp-tomar') return tomarFoto();
  if (t.id === 'emp-repetir') return repetirFoto();
  if (t.id === 'emp-confirmar') {
    t.disabled = true;
    $('emp-canvas').toBlob((blob) => {
      if (!blob) { t.disabled = false; return avisarEmp('No se pudo procesar la foto, intenta de nuevo.'); }
      emp.blob = blob;
      terminar();
    }, 'image/jpeg', 0.7);
  }
});

// arranca cuando capacitaciones.js ya cargo el encabezado, y cada vez que se vuelve a esta vista
document.addEventListener('cap-emp', () => { if (emp.persona) verLista(); else verNombres(); });
