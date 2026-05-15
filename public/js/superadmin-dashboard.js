const formEmpresa = document.getElementById('form-empresa');
const msgEmpresa = document.getElementById('msg-empresa');
const listaEmpresas = document.getElementById('lista-empresas');
const formAdmin = document.getElementById('form-admin');
const msgAdmin = document.getElementById('msg-admin');
const listaAdmins = document.getElementById('lista-admins');
const selectEmpresa = formAdmin.querySelector('select[name="empresa_id"]');
const btnLogout = document.getElementById('btn-logout');
const contenedorCheckboxes = document.getElementById('checkboxes-formatos');

let catalogoFormatos = [];

function mostrarMensaje(el, texto, esError = false) {
  el.textContent = texto;
  el.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  el.hidden = false;
}

function pintarCheckboxes() {
  contenedorCheckboxes.innerHTML = '';
  catalogoFormatos.forEach(f => {
    const label = document.createElement('label');
    label.className = 'check-formato';
    label.innerHTML = `
      <input type="checkbox" name="formatosActivos" value="${f.id}" checked />
      <span>${f.numero}. ${f.nombre}${f.restringido ? ' 🔒' : ''}</span>
    `;
    contenedorCheckboxes.appendChild(label);
  });
}

function nombresDeFormatos(ids) {
  if (!ids || ids.length === 0) return '(ninguno)';
  return ids
    .map(id => catalogoFormatos.find(f => f.id === id))
    .filter(Boolean)
    .map(f => f.nombre)
    .join(', ');
}

async function cargarCatalogo() {
  const r = await fetch('/api/superadmin/catalogo');
  if (r.status === 401) { window.location.href = '/'; return; }
  const data = await r.json();
  catalogoFormatos = data.formatos;
  pintarCheckboxes();
}

async function cargarEmpresas() {
  const r = await fetch('/api/superadmin/empresas');
  if (r.status === 401) { window.location.href = '/'; return; }
  const data = await r.json();
  listaEmpresas.innerHTML = '';
  selectEmpresa.innerHTML = '<option value="">-- selecciona --</option>';
  data.empresas.forEach(emp => {
    const total = catalogoFormatos.length;
    const tieneSeleccion = Array.isArray(emp.formatosActivos) && emp.formatosActivos.length > 0;
    const activos = tieneSeleccion ? emp.formatosActivos : catalogoFormatos.map(f => f.id);
    const li = document.createElement('li');
    li.innerHTML = `
      ${emp.logo ? `<img src="${emp.logo}" alt="logo" class="mini-logo" />` : ''}
      <span>
        <strong>${emp.nombre}</strong> · ${emp.email}
        <small class="lista-formatos-activos">${activos.length}/${total} formatos: ${nombresDeFormatos(activos)}</small>
      </span>
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
    li.innerHTML = `<span><strong>${a.nombre}</strong> · ${empresaNombre}</span>`;
    listaAdmins.appendChild(li);
  });
}

formEmpresa.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEmpresa.hidden = true;
  const fd = new FormData(formEmpresa);

  const marcados = Array.from(
    contenedorCheckboxes.querySelectorAll('input[name="formatosActivos"]:checked')
  ).map(i => i.value);
  if (marcados.length === 0) {
    mostrarMensaje(msgEmpresa, 'Selecciona al menos un formato', true);
    return;
  }

  try {
    const r = await fetch('/api/superadmin/empresas', { method: 'POST', body: fd });
    const data = await r.json();
    if (!r.ok) {
      mostrarMensaje(msgEmpresa, data.error || 'Error', true);
      return;
    }
    mostrarMensaje(msgEmpresa, `Empresa "${data.empresa.nombre}" creada con ${data.empresa.formatosActivos.length} formato(s)`);
    formEmpresa.reset();
    pintarCheckboxes();
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

(async function iniciar() {
  await cargarCatalogo();
  await cargarEmpresas();
  await cargarAdmins();
})();
