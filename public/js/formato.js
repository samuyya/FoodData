const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const tituloEl = document.getElementById('formato-titulo');
const fechaEl = document.getElementById('formato-fecha');
const badgeAdminEl = document.getElementById('badge-admin-activo');
const badgeAdminNombreEl = document.getElementById('badge-admin-nombre');

const inputResponsable = document.getElementById('input-responsable');
const responsableHint = document.getElementById('responsable-hint');
const inputObservaciones = document.getElementById('input-observaciones');
const msgRegistro = document.getElementById('msg-registro');
const formRegistro = document.getElementById('form-registro');
const btnGuardar = document.getElementById('btn-guardar');
const btnVerRegistros = document.getElementById('btn-ver-registros');
const btnVolver = document.getElementById('btn-volver');
const btnLogout = document.getElementById('btn-logout');

const seccionEmpleados = document.getElementById('seccion-empleados');
const formNuevoEmpleado = document.getElementById('form-nuevo-empleado');
const msgEmpleado = document.getElementById('msg-empleado');
const listaEmpleados = document.getElementById('lista-empleados');
const modalEmpleado = document.getElementById('modal-empleado');
const formEditarEmpleado = document.getElementById('form-editar-empleado');
const modalEmpleadoError = document.getElementById('modal-empleado-error');
const btnCancelarEditar = document.getElementById('btn-cancelar-editar-empleado');

const params = new URLSearchParams(window.location.search);
const formatoId = params.get('id');

let formatoActual = null;
let esRestringido = false;

function mostrarMensaje(texto, esError = false) {
  msgRegistro.textContent = texto;
  msgRegistro.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  msgRegistro.hidden = false;
}

function mostrarMsgEmpleado(texto, esError = false) {
  msgEmpleado.textContent = texto;
  msgEmpleado.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  msgEmpleado.hidden = false;
}

function pintarHeader(empresa) {
  nombreEmpresaEl.textContent = empresa.nombre;
  if (empresa.logo) {
    logoEl.src = empresa.logo;
    logoEl.alt = `Logo de ${empresa.nombre}`;
    logoEl.hidden = false;
  } else {
    logoEl.hidden = true;
  }
}

function pintarFecha() {
  const hoy = new Date();
  fechaEl.textContent = hoy.toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

function bloquearFormulario(motivo) {
  inputResponsable.disabled = true;
  inputObservaciones.disabled = true;
  btnGuardar.disabled = true;
  btnGuardar.title = motivo;
  mostrarMensaje(motivo);
}

function precargarRegistroExistente(reg) {
  inputResponsable.value = reg.responsable || '';
  inputObservaciones.value = reg.observaciones || '';
  bloquearFormulario('Ya se guardó un registro para hoy en este formato.');
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pintarEmpleados(empleados) {
  listaEmpleados.innerHTML = '';
  if (empleados.length === 0) {
    const vacio = document.createElement('li');
    vacio.className = 'empleado-vacio';
    vacio.textContent = 'Aún no hay empleados registrados. Agrega uno arriba.';
    listaEmpleados.appendChild(vacio);
    return;
  }
  empleados.forEach(emp => {
    const li = document.createElement('li');
    li.className = 'empleado-item';
    li.dataset.id = emp._id;
    const inicial = emp.nombre.charAt(0).toUpperCase();
    li.innerHTML = `
      <div class="empleado-cabecera">
        <button type="button" class="empleado-row">
          <span class="empleado-iniciales">${escapeHTML(inicial)}</span>
          <span class="empleado-nombre">${escapeHTML(emp.nombre)}</span>
          <span class="empleado-flecha">▾</span>
        </button>
        <div class="empleado-acciones">
          <button type="button" class="btn-secundario btn-editar-empleado">Editar</button>
          <button type="button" class="btn-eliminar-empleado" aria-label="Eliminar empleado">✕</button>
        </div>
      </div>
      <div class="empleado-formulario" hidden>
        <p class="ayuda">Formulario individual de <strong>${escapeHTML(emp.nombre)}</strong> — pendiente. Las preguntas internas se agregarán más adelante.</p>
      </div>
    `;
    li.querySelector('.empleado-row').addEventListener('click', () => {
      const cont = li.querySelector('.empleado-formulario');
      cont.hidden = !cont.hidden;
      li.classList.toggle('empleado-item--abierto');
    });
    li.querySelector('.btn-editar-empleado').addEventListener('click', () => {
      abrirModalEditar(emp);
    });
    li.querySelector('.btn-eliminar-empleado').addEventListener('click', () => {
      confirmarEliminar(emp);
    });
    listaEmpleados.appendChild(li);
  });
}

async function cargarEmpleados() {
  const r = await fetch('/api/empleados');
  if (!r.ok) return;
  const data = await r.json();
  pintarEmpleados(data.empleados);
}

function abrirModalEditar(emp) {
  formEditarEmpleado.id.value = emp._id;
  formEditarEmpleado.nombre.value = emp.nombre;
  modalEmpleadoError.hidden = true;
  modalEmpleado.hidden = false;
  setTimeout(() => formEditarEmpleado.nombre.focus(), 50);
}

function cerrarModalEditar() {
  modalEmpleado.hidden = true;
}

btnCancelarEditar.addEventListener('click', cerrarModalEditar);
modalEmpleado.addEventListener('click', (e) => {
  if (e.target === modalEmpleado) cerrarModalEditar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalEmpleado.hidden) cerrarModalEditar();
});

if (formNuevoEmpleado) {
  formNuevoEmpleado.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEmpleado.hidden = true;
    try {
      const r = await fetch('/api/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: formNuevoEmpleado.nombre.value })
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMsgEmpleado(data.error || 'Error', true);
        return;
      }
      formNuevoEmpleado.reset();
      mostrarMsgEmpleado(`Empleado "${data.empleado.nombre}" agregado.`);
      cargarEmpleados();
    } catch (err) {
      mostrarMsgEmpleado('Error de red', true);
    }
  });
}

formEditarEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalEmpleadoError.hidden = true;
  const id = formEditarEmpleado.id.value;
  const nombre = formEditarEmpleado.nombre.value;
  try {
    const r = await fetch(`/api/empleados/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    const data = await r.json();
    if (!r.ok) {
      modalEmpleadoError.textContent = data.error || 'Error';
      modalEmpleadoError.hidden = false;
      return;
    }
    cerrarModalEditar();
    cargarEmpleados();
  } catch (err) {
    modalEmpleadoError.textContent = 'Error de red';
    modalEmpleadoError.hidden = false;
  }
});

async function confirmarEliminar(emp) {
  const ok = window.confirm(`¿Eliminar a "${emp.nombre}"?\nEsta acción no se puede deshacer.`);
  if (!ok) return;
  try {
    const r = await fetch(`/api/empleados/${encodeURIComponent(emp._id)}`, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) {
      mostrarMsgEmpleado(data.error || 'Error al eliminar', true);
      return;
    }
    mostrarMsgEmpleado(`Empleado "${emp.nombre}" eliminado.`);
    cargarEmpleados();
  } catch (err) {
    mostrarMsgEmpleado('Error de red', true);
  }
}

async function cargar() {
  if (!formatoId) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Falta el parámetro de formato. Vuelve al menú.</p>';
    return;
  }

  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    pintarFecha();

    const rFormato = await fetch(`/api/formatos/${encodeURIComponent(formatoId)}`);
    if (!rFormato.ok) {
      const d = await rFormato.json();
      document.body.innerHTML = `<p style="padding:2rem;color:#b91c1c">${d.error || 'No se pudo cargar el formato'}</p>`;
      return;
    }
    const dF = await rFormato.json();
    formatoActual = dF.formato;
    esRestringido = !!formatoActual.restringido;
    tituloEl.textContent = `${formatoActual.numero}. ${formatoActual.nombre}`;

    if (esRestringido) {
      const rC = await fetch(`/api/admin/consumir?formatoId=${encodeURIComponent(formatoId)}`);
      if (!rC.ok) {
        window.location.href = '/menu.html';
        return;
      }
      const dC = await rC.json();
      inputResponsable.value = dC.nombre;
      inputResponsable.readOnly = true;
      inputResponsable.classList.add('input-readonly');
      responsableHint.textContent = 'Nombre del administrador (no editable).';
      badgeAdminNombreEl.textContent = dC.nombre;
      badgeAdminEl.hidden = false;

      if (formatoActual.id === 'presentacion_personal') {
        seccionEmpleados.hidden = false;
        cargarEmpleados();
      }
    } else {
      inputResponsable.placeholder = 'Tu nombre completo';
    }

    const rHoy = await fetch(`/api/registros/hoy/${encodeURIComponent(formatoId)}`);
    if (rHoy.ok) {
      const dHoy = await rHoy.json();
      if (dHoy.registro) {
        precargarRegistroExistente(dHoy.registro);
      }
    }
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el formato. Recarga la página.</p>';
  }
}

formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgRegistro.hidden = true;

  const cuerpo = {
    formatoId,
    responsable: inputResponsable.value,
    observaciones: inputObservaciones.value,
    datos: {}
  };

  btnGuardar.disabled = true;
  try {
    const r = await fetch('/api/registros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const data = await r.json();
    if (!r.ok) {
      mostrarMensaje(data.error || 'Error al guardar', true);
      btnGuardar.disabled = false;
      return;
    }
    mostrarMensaje('Registro guardado correctamente.');
    bloquearFormulario('Ya se guardó un registro para hoy en este formato.');
  } catch (err) {
    mostrarMensaje('Error de red al guardar', true);
    btnGuardar.disabled = false;
  }
});

btnVerRegistros.addEventListener('click', () => {
  alert('La pantalla de registros se construirá en el paso 9 (ciclo mensual e historial).');
});

btnVolver.addEventListener('click', () => {
  window.location.href = '/menu.html';
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

cargar();
