const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const tituloEl = document.getElementById('formato-titulo');
const fechaEl = document.getElementById('formato-fecha');
const badgeAdminEl = document.getElementById('badge-admin-activo');
const badgeAdminNombreEl = document.getElementById('badge-admin-nombre');

const bannerPendientes = document.getElementById('banner-pendientes');
const bannerInfo = document.getElementById('banner-info');
const diaObjetivoEl = document.getElementById('formato-dia-actual');

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
let adminNombreSesion = null;
let estadoPendientes = null;

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function resetearFormulario() {
  inputResponsable.disabled = false;
  inputObservaciones.disabled = false;
  btnGuardar.disabled = false;
  btnGuardar.title = '';
  msgRegistro.hidden = true;
  bannerPendientes.hidden = true;
  bannerInfo.hidden = true;
  diaObjetivoEl.hidden = true;
  if (!esRestringido) {
    inputResponsable.value = '';
  }
  inputObservaciones.value = '';
}

function pintarEstadoPendientes(info) {
  estadoPendientes = info;
  resetearFormulario();

  const { diaActual, mes, anio, pendientes, siguienteDia, completoHoy, registroHoy } = info;
  const nombreMes = MESES_LARGOS[mes - 1];

  if (completoHoy) {
    bannerInfo.innerHTML = `✅ <strong>Mes al día.</strong> Todos los registros del 1 al ${diaActual} de ${nombreMes} están completos.`;
    bannerInfo.hidden = false;

    if (registroHoy) {
      inputResponsable.value = registroHoy.responsable || '';
      inputObservaciones.value = registroHoy.observaciones || '';
    }
    inputResponsable.disabled = true;
    inputObservaciones.disabled = true;
    btnGuardar.disabled = true;
    btnGuardar.title = 'Ya completaste todos los días hasta hoy';
    return;
  }

  if (siguienteDia === diaActual) {
    diaObjetivoEl.innerHTML = `📅 Estás registrando el <strong>día ${diaActual} de ${nombreMes}</strong> (hoy).`;
    diaObjetivoEl.hidden = false;
    return;
  }

  const restantes = pendientes.slice(1);
  const restantesTxt = restantes.length === 0
    ? 'Después de este, ya estarás al día.'
    : `Después de este faltarán: ${restantes.join(', ')}.`;

  bannerPendientes.innerHTML = `
    ⚠️ <strong>Tienes ${pendientes.length} día(s) pendiente(s) en ${nombreMes}.</strong>
    Días faltantes: ${pendientes.join(', ')}.
    Debes completarlos en orden, empezando por el más antiguo.
  `;
  bannerPendientes.hidden = false;

  diaObjetivoEl.innerHTML = `📝 Estás registrando el <strong>día ${siguienteDia} de ${nombreMes}</strong>. ${restantesTxt}`;
  diaObjetivoEl.hidden = false;
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
    li.querySelector('.btn-editar-empleado').addEventListener('click', () => abrirModalEditar(emp));
    li.querySelector('.btn-eliminar-empleado').addEventListener('click', () => confirmarEliminar(emp));
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

function cerrarModalEditar() { modalEmpleado.hidden = true; }

btnCancelarEditar.addEventListener('click', cerrarModalEditar);
modalEmpleado.addEventListener('click', (e) => {
  if (e.target === modalEmpleado) cerrarModalEditar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalEmpleado.hidden) cerrarModalEditar();
});

if (formNuevoEmpleado) {
  const btnAgregar = formNuevoEmpleado.querySelector('button[type="submit"]');
  formNuevoEmpleado.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEmpleado.hidden = true;
    await conBotonCargando(btnAgregar, 'Agregando...', async () => {
      try {
        const r = await fetch('/api/empleados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: formNuevoEmpleado.nombre.value })
        });
        const data = await r.json();
        if (!r.ok) { mostrarMsgEmpleado(data.error || 'Error', true); return; }
        formNuevoEmpleado.reset();
        mostrarMsgEmpleado(`Empleado "${data.empleado.nombre}" agregado.`);
        cargarEmpleados();
      } catch (err) {
        mostrarMsgEmpleado('Error de red', true);
      }
    });
  });
}

formEditarEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalEmpleadoError.hidden = true;
  const id = formEditarEmpleado.id.value;
  const nombre = formEditarEmpleado.nombre.value;
  const btnGuardarEmp = formEditarEmpleado.querySelector('button[type="submit"]');
  await conBotonCargando(btnGuardarEmp, 'Guardando...', async () => {
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
});

async function confirmarEliminar(emp) {
  if (!window.confirm(`¿Eliminar a "${emp.nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    const r = await fetch(`/api/empleados/${encodeURIComponent(emp._id)}`, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) { mostrarMsgEmpleado(data.error || 'Error al eliminar', true); return; }
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
      if (!rC.ok) { window.location.href = '/formatos.html'; return; }
      const dC = await rC.json();
      adminNombreSesion = dC.nombre;
      inputResponsable.value = adminNombreSesion;
      inputResponsable.readOnly = true;
      inputResponsable.classList.add('input-readonly');
      responsableHint.textContent = 'Nombre del administrador (no editable).';
      badgeAdminNombreEl.textContent = adminNombreSesion;
      badgeAdminEl.hidden = false;
    } else {
      inputResponsable.placeholder = 'Tu nombre completo';
    }

    if (formatoActual.id === 'presentacion_personal') {
      seccionEmpleados.hidden = false;
      cargarEmpleados();
    }

    const rPend = await fetch(`/api/registros/pendientes/${encodeURIComponent(formatoId)}`);
    if (rPend.ok) {
      const dPend = await rPend.json();
      pintarEstadoPendientes(dPend);
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

  const txtGuardar = btnGuardar.textContent;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';
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
    const guardadoDia = data.registro.dia;
    pintarEstadoPendientes(data.info);
    mostrarMensaje(`Registro del día ${guardadoDia} guardado correctamente.`);
  } catch (err) {
    mostrarMensaje('Error de red al guardar', true);
    btnGuardar.disabled = false;
  } finally {
    btnGuardar.textContent = txtGuardar;
  }
});

btnVerRegistros.addEventListener('click', () => {
  window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}`;
});

btnVolver.addEventListener('click', () => { window.location.href = '/formatos.html'; });

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

cargar();
