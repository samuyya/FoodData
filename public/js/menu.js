const logoEl = document.getElementById('logo-empresa');
const logoPlaceholder = document.getElementById('logo-placeholder');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const btnLogout = document.getElementById('btn-logout');
const btnFormatos = document.getElementById('btn-formatos');
const btnAsistencia = document.getElementById('btn-asistencia');
const btnCapacitaciones = document.getElementById('btn-capacitaciones');
const msgMenu = document.getElementById('msg-menu');

const anioActualEl = document.getElementById('anio-actual');
if (anioActualEl) anioActualEl.textContent = new Date().getFullYear();

function pintarHeader(empresa) {
  nombreEmpresaEl.textContent = empresa.nombre;
  if (empresa.logo) {
    logoEl.src = empresa.logo;
    logoEl.alt = `Logo de ${empresa.nombre}`;
    logoEl.hidden = false;
    logoPlaceholder.hidden = true;
  } else {
    logoEl.hidden = true;
    logoPlaceholder.hidden = false;
  }
}

function avisoPendiente(nombre) {
  msgMenu.textContent = `La sección "${nombre}" se habilitará en un paso siguiente.`;
  msgMenu.hidden = false;
}

btnFormatos.addEventListener('click', () => {
  window.location.href = '/formatos.html';
});
btnAsistencia.addEventListener('click', () => {
  window.location.href = '/asistencia.html';
});
btnCapacitaciones.addEventListener('click', () => avisoPendiente('Capacitaciones'));

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    await fetch('/api/admin/limpiar', { method: 'POST' });
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el menú. Recarga la página.</p>';
  }
}

iniciar();
