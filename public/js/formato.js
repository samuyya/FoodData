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

const params = new URLSearchParams(window.location.search);
const formatoId = params.get('id');

let formatoActual = null;
let esRestringido = false;

function mostrarMensaje(texto, esError = false) {
  msgRegistro.textContent = texto;
  msgRegistro.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  msgRegistro.hidden = false;
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
