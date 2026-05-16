const formEmpresa = document.getElementById('form-empresa');
const msgEmpresa = document.getElementById('msg-empresa');
const listaEmpresas = document.getElementById('lista-empresas');
const formAdmin = document.getElementById('form-admin');
const msgAdmin = document.getElementById('msg-admin');
const listaAdmins = document.getElementById('lista-admins');
const selectEmpresa = formAdmin.querySelector('select[name="empresa_id"]');
const btnLogout = document.getElementById('btn-logout');
const contenedorCheckboxes = document.getElementById('checkboxes-formatos');

const modalEditar = document.getElementById('modal-editar-empresa');
const formEditar = document.getElementById('form-editar-empresa');
const msgEditar = document.getElementById('msg-editar-empresa');
const btnCancelarEditar = document.getElementById('btn-cancelar-editar-empresa');
const previewLogoActual = document.getElementById('preview-logo-actual');
const previewLogoVacio = document.getElementById('preview-logo-vacio');
const contenedorCheckboxesEditar = document.getElementById('checkboxes-formatos-editar');

const cardGoogle = document.getElementById('card-google');
const googleEstado = document.getElementById('google-estado');
const googleCuentaWrap = document.getElementById('google-cuenta-wrap');
const googleCuenta = document.getElementById('google-cuenta');

let catalogoFormatos = [];

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mostrarMensaje(el, texto, esError = false) {
  el.textContent = texto;
  el.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  el.hidden = false;
}

function pintarCheckboxes(contenedor, marcadosIds = null) {
  contenedor.innerHTML = '';
  catalogoFormatos.forEach(f => {
    const checked = (marcadosIds === null) ? true : marcadosIds.includes(f.id);
    const label = document.createElement('label');
    label.className = 'check-formato';
    label.innerHTML = `
      <input type="checkbox" name="formatosActivos" value="${f.id}" ${checked ? 'checked' : ''} />
      <span>${f.numero}. ${escapeHTML(f.nombre)}${f.restringido ? ' 🔒' : ''}</span>
    `;
    contenedor.appendChild(label);
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
  pintarCheckboxes(contenedorCheckboxes);
}

async function cargarGoogleInfo() {
  try {
    const r = await fetch('/api/superadmin/google-info');
    if (!r.ok) return;
    const data = await r.json();
    cardGoogle.hidden = false;
    if (data.disponible && data.cuentaServicio) {
      googleEstado.textContent = 'La sincronización con Google Sheets está activa.';
      googleCuenta.textContent = data.cuentaServicio;
      googleCuentaWrap.hidden = false;
    } else {
      googleEstado.textContent = 'Google Sheets no está configurado todavía (falta el archivo de credenciales). El campo de hoja de cálculo se guardará igual, pero no se sincronizará hasta configurarlo.';
      googleCuentaWrap.hidden = true;
    }
  } catch (err) {
    cardGoogle.hidden = true;
  }
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
    li.className = 'empresa-item';
    li.innerHTML = `
      ${emp.logo ? `<img src="${escapeHTML(emp.logo)}" alt="logo" class="mini-logo" />` : '<span class="mini-logo mini-logo--vacio"></span>'}
      <span class="empresa-info">
        <strong>${escapeHTML(emp.nombre)}</strong> · ${escapeHTML(emp.email)}
        <small class="lista-formatos-activos">${activos.length}/${total} formatos: ${escapeHTML(nombresDeFormatos(activos))}</small>
      </span>
      <button type="button" class="btn-secundario btn-editar-empresa" data-id="${emp._id}">Editar</button>
    `;
    li.querySelector('.btn-editar-empresa').addEventListener('click', () => abrirModalEditar(emp._id));
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
    li.innerHTML = `<span><strong>${escapeHTML(a.nombre)}</strong> · ${escapeHTML(empresaNombre)}</span>`;
    listaAdmins.appendChild(li);
  });
}

async function abrirModalEditar(empresaId) {
  msgEditar.hidden = true;
  try {
    const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(empresaId)}`);
    if (!r.ok) {
      alert('No se pudo cargar la empresa');
      return;
    }
    const data = await r.json();
    const emp = data.empresa;

    formEditar.id.value = emp._id;
    formEditar.email.value = emp.email;
    formEditar.nombre.value = emp.nombre;
    formEditar.password.value = '';
    formEditar.logo.value = '';
    formEditar.googleSheetId.value = emp.googleSheetId || '';

    if (emp.logo) {
      previewLogoActual.src = emp.logo;
      previewLogoActual.hidden = false;
      previewLogoVacio.hidden = true;
    } else {
      previewLogoActual.hidden = true;
      previewLogoVacio.hidden = false;
    }

    const tieneSeleccion = Array.isArray(emp.formatosActivos) && emp.formatosActivos.length > 0;
    const marcados = tieneSeleccion ? emp.formatosActivos : catalogoFormatos.map(f => f.id);
    pintarCheckboxes(contenedorCheckboxesEditar, marcados);

    modalEditar.hidden = false;
  } catch (err) {
    alert('Error de red');
  }
}

function cerrarModalEditar() {
  modalEditar.hidden = true;
}

btnCancelarEditar.addEventListener('click', cerrarModalEditar);
modalEditar.addEventListener('click', (e) => {
  if (e.target === modalEditar) cerrarModalEditar();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalEditar.hidden) cerrarModalEditar();
});

formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEditar.hidden = true;

  const marcados = Array.from(
    contenedorCheckboxesEditar.querySelectorAll('input[name="formatosActivos"]:checked')
  ).map(i => i.value);
  if (marcados.length === 0) {
    mostrarMensaje(msgEditar, 'Selecciona al menos un formato', true);
    return;
  }

  const fd = new FormData(formEditar);
  fd.delete('email');
  if (!formEditar.password.value.trim()) fd.delete('password');
  if (!formEditar.logo.files.length) fd.delete('logo');

  const id = formEditar.id.value;
  fd.delete('id');

  const btnGuardarEditar = formEditar.querySelector('button[type="submit"]');
  await conBotonCargando(btnGuardarEditar, 'Guardando...', async () => {
    try {
      const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: fd
      });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(msgEditar, data.error || 'Error', true);
        return;
      }
      mostrarMensaje(msgEditar, `Cambios guardados para "${data.empresa.nombre}"`);
      cargarEmpresas();
      setTimeout(cerrarModalEditar, 800);
    } catch (err) {
      mostrarMensaje(msgEditar, 'Error de red', true);
    }
  });
});

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

  const btnCrearEmpresa = formEmpresa.querySelector('button[type="submit"]');
  await conBotonCargando(btnCrearEmpresa, 'Creando...', async () => {
    try {
      const r = await fetch('/api/superadmin/empresas', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) {
        mostrarMensaje(msgEmpresa, data.error || 'Error', true);
        return;
      }
      mostrarMensaje(msgEmpresa, `Empresa "${data.empresa.nombre}" creada con ${data.empresa.formatosActivos.length} formato(s)`);
      formEmpresa.reset();
      pintarCheckboxes(contenedorCheckboxes);
      cargarEmpresas();
    } catch (err) {
      mostrarMensaje(msgEmpresa, 'Error de red', true);
    }
  });
});

formAdmin.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgAdmin.hidden = true;
  const datos = {
    nombre: formAdmin.nombre.value.trim(),
    password: formAdmin.password.value,
    empresa_id: formAdmin.empresa_id.value
  };
  const btnCrearAdmin = formAdmin.querySelector('button[type="submit"]');
  await conBotonCargando(btnCrearAdmin, 'Creando...', async () => {
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
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

(async function iniciar() {
  await cargarCatalogo();
  await cargarGoogleInfo();
  await cargarEmpresas();
  await cargarAdmins();
})();
