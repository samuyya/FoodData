const formEmpresa = document.getElementById('form-empresa');
const msgEmpresa = document.getElementById('msg-empresa');
const listaEmpresas = document.getElementById('lista-empresas');
const formAdmin = document.getElementById('form-admin');
const msgAdmin = document.getElementById('msg-admin');
const listaAdmins = document.getElementById('lista-admins');
const selectEmpresa = formAdmin.querySelector('select[name="empresa_id"]');
const btnLogout = document.getElementById('btn-logout');

function mostrarMensaje(el, texto, esError = false) {
  el.textContent = texto;
  el.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  el.hidden = false;
}

async function cargarEmpresas() {
  const r = await fetch('/api/superadmin/empresas');
  if (r.status === 401) { window.location.href = '/'; return; }
  const data = await r.json();
  listaEmpresas.innerHTML = '';
  selectEmpresa.innerHTML = '<option value="">-- selecciona --</option>';
  data.empresas.forEach(emp => {
    const li = document.createElement('li');
    li.innerHTML = `
      ${emp.logo ? `<img src="${emp.logo}" alt="logo" class="mini-logo" />` : ''}
      <span><strong>${emp.nombre}</strong> &middot; ${emp.email}</span>
    `;
    listaEmpresas.appendChild(li);

    const opt = document.createElement('option');
    opt.value = emp._id;
    opt.textContent = emp.nombre;
    selectEmpresa.appendChild(opt);
  });
}

async function cargarAdmins() {
  const r = await fetch('/api/superadmin/administradores');
  if (!r.ok) return;
  const data = await r.json();
  listaAdmins.innerHTML = '';
  data.administradores.forEach(a => {
    const li = document.createElement('li');
    const empresaNombre = a.empresa_id && a.empresa_id.nombre ? a.empresa_id.nombre : '(sin empresa)';
    li.innerHTML = `<span><strong>${a.nombre}</strong> &middot; ${empresaNombre}</span>`;
    listaAdmins.appendChild(li);
  });
}

formEmpresa.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEmpresa.hidden = true;
  const fd = new FormData(formEmpresa);
  try {
    const r = await fetch('/api/superadmin/empresas', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      mostrarMensaje(msgEmpresa, data.error || 'Error', true);
      return;
    }
    mostrarMensaje(msgEmpresa, `Empresa "${data.empresa.nombre}" creada`);
    formEmpresa.reset();
    cargarEmpresas();
  } catch (err) {
    mostrarMensaje(msgEmpresa, 'Error de red', true);
  }
});

formAdmin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgAdmin.hidden = true;
  const datos = {
    nombre: formAdmin.nombre.value.trim(),
    password: formAdmin.password.value,
    empresa_id: formAdmin.empresa_id.value
  };
  try {
    const r = await fetch('/api/superadmin/administradores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    const data = await r.json();
    if (!r.ok) {
      mostrarMensaje(msgAdmin, data.error || 'Error', true);
      return;
    }
    mostrarMensaje(msgAdmin, `Administrador "${data.administrador.nombre}" creado`);
    formAdmin.reset();
    cargarAdmins();
  } catch (err) {
    mostrarMensaje(msgAdmin, 'Error de red', true);
  }
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

cargarEmpresas();
cargarAdmins();
