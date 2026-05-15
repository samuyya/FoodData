const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const grid = document.getElementById('grid-formatos');
const badgeAdmin = document.getElementById('badge-admin');
const badgeAdminNombre = document.getElementById('badge-admin-nombre');
const btnSalirAdmin = document.getElementById('btn-salir-admin');
const btnLogout = document.getElementById('btn-logout');

const modal = document.getElementById('modal-admin');
const modalFormatoNombre = document.getElementById('modal-formato-nombre');
const modalError = document.getElementById('modal-error');
const formAdminPass = document.getElementById('form-admin-pass');
const btnModalCancelar = document.getElementById('modal-cancelar');

let formatoPendiente = null;
let adminNombre = null;

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

function pintarBadgeAdmin() {
  if (adminNombre) {
    badgeAdminNombre.textContent = adminNombre;
    badgeAdmin.hidden = false;
    btnSalirAdmin.hidden = false;
  } else {
    badgeAdmin.hidden = true;
    btnSalirAdmin.hidden = true;
  }
}

function pintarFormatos(formatos) {
  grid.innerHTML = '';
  formatos.forEach(f => {
    const li = document.createElement('li');
    li.className = 'formato-card' + (f.restringido ? ' formato-card--restringido' : '');
    li.dataset.id = f.id;
    li.dataset.nombre = f.nombre;
    li.dataset.restringido = f.restringido ? '1' : '0';

    li.innerHTML = `
      <div class="formato-numero">${f.numero}</div>
      <div class="formato-info">
        <h3 class="formato-nombre">${f.nombre}</h3>
        ${f.restringido ? '<span class="formato-lock" title="Requiere contraseña de administrador">🔒 Solo administrador</span>' : ''}
      </div>
    `;
    li.addEventListener('click', () => abrirFormato(f));
    grid.appendChild(li);
  });
}

function abrirFormato(f) {
  if (f.restringido && !adminNombre) {
    formatoPendiente = f;
    modalFormatoNombre.textContent = f.nombre;
    modalError.hidden = true;
    formAdminPass.reset();
    modal.hidden = false;
    setTimeout(() => formAdminPass.password.focus(), 50);
    return;
  }
  window.location.href = `/formato.html?id=${encodeURIComponent(f.id)}`;
}

function cerrarModal() {
  modal.hidden = true;
  formatoPendiente = null;
}

btnModalCancelar.addEventListener('click', cerrarModal);
modal.addEventListener('click', (e) => {
  if (e.target === modal) cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) cerrarModal();
});

formAdminPass.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalError.hidden = true;

  try {
    const r = await fetch('/api/admin/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: formAdminPass.password.value })
    });
    const data = await r.json();
    if (!r.ok) {
      modalError.textContent = data.error || 'No se pudo verificar';
      modalError.hidden = false;
      return;
    }
    adminNombre = data.nombre;
    pintarBadgeAdmin();
    const f = formatoPendiente;
    cerrarModal();
    if (f) window.location.href = `/formato.html?id=${encodeURIComponent(f.id)}`;
  } catch (err) {
    modalError.textContent = 'Error de conexión';
    modalError.hidden = false;
  }
});

btnSalirAdmin.addEventListener('click', async () => {
  await fetch('/api/admin/salir', { method: 'POST' });
  adminNombre = null;
  pintarBadgeAdmin();
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) {
      window.location.href = '/';
      return;
    }
    const me = await rMe.json();
    if (me.rol !== 'empleado') {
      window.location.href = '/';
      return;
    }
    pintarHeader(me.empresa);
    adminNombre = me.adminNombre;
    pintarBadgeAdmin();

    const rFormatos = await fetch('/api/formatos');
    const dataF = await rFormatos.json();
    pintarFormatos(dataF.formatos);
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el menú. Recarga la página.</p>';
  }
}

iniciar();
