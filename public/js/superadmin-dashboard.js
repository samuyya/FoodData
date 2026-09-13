const formEmpresa = document.getElementById('form-empresa');
const msgEmpresa = document.getElementById('msg-empresa');
const listaEmpresas = document.getElementById('lista-empresas');
const formAdmin = document.getElementById('form-admin');
const msgAdmin = document.getElementById('msg-admin');
const listaAdmins = document.getElementById('lista-admins');
const selectEmpresa = formAdmin.querySelector('select[name="empresa_id"]');
const btnLogout = document.getElementById('btn-logout');
const contenedorCheckboxes = document.getElementById('checkboxes-formatos');
const tablaCarpetas = document.getElementById('tabla-carpetas');

const modalEditar = document.getElementById('modal-editar-empresa');
const formEditar = document.getElementById('form-editar-empresa');
const msgEditar = document.getElementById('msg-editar-empresa');
const btnCancelarEditar = document.getElementById('btn-cancelar-editar-empresa');
const previewLogoActual = document.getElementById('preview-logo-actual');
const previewLogoVacio = document.getElementById('preview-logo-vacio');
const contenedorCheckboxesEditar = document.getElementById('checkboxes-formatos-editar');
const tablaCarpetasEditar = document.getElementById('tabla-carpetas-editar');

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

function idsTodos() {
  return catalogoFormatos.map(f => f.id);
}

function pintarCheckboxes(contenedor, nombreCampo, marcadosIds) {
  contenedor.innerHTML = '';
  catalogoFormatos.forEach(f => {
    const checked = Array.isArray(marcadosIds) && marcadosIds.includes(f.id);
    const label = document.createElement('label');
    label.className = 'check-formato';
    label.innerHTML = `
      <input type="checkbox" name="${nombreCampo}" value="${f.id}" ${checked ? 'checked' : ''} />
      <span>${f.numero}. ${escapeHTML(f.nombre)}</span>
    `;
    contenedor.appendChild(label);
  });
}

// tabla de asignacion: para cada formato activo, marcar en cuales carpetas va.
// la 5ta columna "Compartido" solo se habilita si el formato esta en 2+ carpetas:
// si esta marcado, las carpetas apuntan al MISMO conjunto de registros.
function pintarTablaCarpetas(contenedor, activosIds, carpetaDoc, compartidosIds) {
  const cDoc = carpetaDoc || {};
  const enCocina         = Array.isArray(cDoc.cocina)         ? cDoc.cocina         : activosIds.slice();
  const enSalon          = Array.isArray(cDoc.salon)          ? cDoc.salon          : [];
  const enAdministracion = Array.isArray(cDoc.administracion) ? cDoc.administracion : [];
  const compartidos      = Array.isArray(compartidosIds)      ? compartidosIds      : [];

  contenedor.innerHTML = '';
  const tabla = document.createElement('table');
  tabla.className = 'tabla-carpeta-asign';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Formato</th>
        <th>🍳 Cocina</th>
        <th>🪑 Salón</th>
        <th>🔒 Administración</th>
        <th title="Si marcas el mismo formato en 2+ carpetas, puedes elegir que compartan los mismos registros (en vez de duplicar)">🔗 Compartido</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tabla.querySelector('tbody');

  catalogoFormatos
    .filter(f => activosIds.includes(f.id))
    .forEach(f => {
      const enC = enCocina.includes(f.id) || (!enSalon.includes(f.id) && !enAdministracion.includes(f.id));
      const enS = enSalon.includes(f.id);
      const enA = enAdministracion.includes(f.id);
      const enCuantas = [enC, enS, enA].filter(Boolean).length;
      const compChecked = compartidos.includes(f.id);
      const compDisabled = enCuantas < 2;

      const tr = document.createElement('tr');
      tr.dataset.formatoId = f.id;
      tr.innerHTML = `
        <td>${escapeHTML(f.nombre)}</td>
        <td class="td-radio"><input type="checkbox" name="carpeta_cocina"         value="${f.id}" ${enC ? 'checked' : ''} /></td>
        <td class="td-radio"><input type="checkbox" name="carpeta_salon"          value="${f.id}" ${enS ? 'checked' : ''} /></td>
        <td class="td-radio"><input type="checkbox" name="carpeta_administracion" value="${f.id}" ${enA ? 'checked' : ''} /></td>
        <td class="td-radio td-compartido">
          <input type="checkbox" name="formatosCompartidos" value="${f.id}"
                 ${compChecked && !compDisabled ? 'checked' : ''} ${compDisabled ? 'disabled' : ''}
                 title="${compDisabled ? 'Marca el formato en 2 o más carpetas primero' : 'Compartir registros entre las carpetas'}" />
        </td>
      `;
      tbody.appendChild(tr);
    });

  // habilitar/deshabilitar la columna "Compartido" al vuelo cuando cambian los chequeos de carpeta
  tbody.addEventListener('change', (e) => {
    if (!e.target.matches('input[name^="carpeta_"]')) return;
    const fila = e.target.closest('tr');
    if (!fila) return;
    const marcadas = fila.querySelectorAll('input[name^="carpeta_"]:checked').length;
    const compChk = fila.querySelector('input[name="formatosCompartidos"]');
    if (!compChk) return;
    if (marcadas < 2) {
      compChk.checked = false;
      compChk.disabled = true;
      compChk.title = 'Marca el formato en 2 o más carpetas primero';
    } else {
      compChk.disabled = false;
      compChk.title = 'Compartir registros entre las carpetas';
    }
  });

  contenedor.appendChild(tabla);
}

function activosDeEmpresa(emp) {
  return (Array.isArray(emp.formatosActivos) && emp.formatosActivos.length > 0)
    ? emp.formatosActivos
    : idsTodos();
}

async function cargarCatalogo() {
  const r = await fetch('/api/superadmin/catalogo');
  if (r.status === 401) { window.location.href = '/'; return; }
  const data = await r.json();
  catalogoFormatos = data.formatos;
  pintarCheckboxes(contenedorCheckboxes, 'formatosActivos', idsTodos());
  pintarTablaCarpetas(tablaCarpetas, idsTodos(), null);

  // Actualizar tabla de carpetas cuando cambie la selección de formatos activos
  contenedorCheckboxes.addEventListener('change', () => {
    const marcados = Array.from(
      contenedorCheckboxes.querySelectorAll('input[name="formatosActivos"]:checked')
    ).map(i => i.value);
    pintarTablaCarpetas(tablaCarpetas, marcados, null);
  });
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
    const activos = activosDeEmpresa(emp);
    const cDoc = emp.formatosCarpeta || {};
    const enAdmin = Array.isArray(cDoc.administracion) ? cDoc.administracion.length : 0;
    const textoAdmin = enAdmin === 0 ? 'ninguno en Administración' : `${enAdmin} en Administración`;
    const estaActiva = emp.activa !== false;

    const li = document.createElement('li');
    li.className = 'empresa-item' + (estaActiva ? '' : ' empresa-item--inactiva');

    const badge = estaActiva ? '' : ' <span class="badge-inactiva">Desactivada</span>';
    const botones = estaActiva
      ? `<button type="button" class="btn-secundario btn-editar-empresa">Editar</button>
         <button type="button" class="btn-secundario btn-documentos-empresa">📎 Documentos</button>
         <button type="button" class="btn-secundario btn-desactivar-empresa">Desactivar</button>`
      : `<button type="button" class="btn-secundario btn-reactivar-empresa">Reactivar</button>
         <button type="button" class="btn-peligro btn-eliminar-empresa-def">Eliminar definitivamente</button>`;

    li.innerHTML = `
      ${emp.logo ? `<img src="${escapeHTML(emp.logo)}" alt="logo" class="mini-logo" />` : '<span class="mini-logo mini-logo--vacio"></span>'}
      <span class="empresa-info">
        <strong>${escapeHTML(emp.nombre)}</strong>${badge} · ${escapeHTML(emp.email)}
        <small class="lista-formatos-activos">${activos.length}/${total} formatos · ${textoAdmin}</small>
      </span>
      <div class="empresa-acciones">${botones}</div>
    `;

    if (estaActiva) {
      li.querySelector('.btn-editar-empresa').addEventListener('click', () => abrirModalEditar(emp._id));
      li.querySelector('.btn-documentos-empresa').addEventListener('click', () => {
        window.location.href = `/superadmin/documentos.html?empresa=${encodeURIComponent(emp._id)}`;
      });
      li.querySelector('.btn-desactivar-empresa').addEventListener('click', () => desactivarEmpresa(emp));

      const opt = document.createElement('option');
      opt.value = emp._id;
      opt.textContent = emp.nombre;
      selectEmpresa.appendChild(opt);
    } else {
      li.querySelector('.btn-reactivar-empresa').addEventListener('click', () => reactivarEmpresa(emp));
      li.querySelector('.btn-eliminar-empresa-def').addEventListener('click', () => eliminarEmpresa(emp));
    }

    listaEmpresas.appendChild(li);
  });
}

async function desactivarEmpresa(emp) {
  if (!confirm(`¿Desactivar "${emp.nombre}"?\n\nNo podrá iniciar sesión, pero todos sus datos se conservan. Podrás reactivarla cuando quieras.`)) return;
  try {
    const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(emp._id)}/desactivar`, { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Error al desactivar'); return; }
    cargarEmpresas();
  } catch (err) {
    alert('no hay conexion');
  }
}

async function reactivarEmpresa(emp) {
  if (!confirm(`¿Reactivar "${emp.nombre}"? Volverá a poder iniciar sesión.`)) return;
  try {
    const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(emp._id)}/reactivar`, { method: 'POST' });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Error al reactivar'); return; }
    cargarEmpresas();
  } catch (err) {
    alert('no hay conexion');
  }
}

async function eliminarEmpresa(emp) {
  const escrito = prompt(
    `ELIMINACIÓN DEFINITIVA de "${emp.nombre}".\n\n` +
    `Esto borra para siempre: administradores, empleados, registros de formatos, ` +
    `asistencia, fotos y archivos Excel. NO se puede deshacer.\n\n` +
    `Para confirmar, escribe el nombre exacto de la empresa:`
  );
  if (escrito === null) return;
  if (escrito.trim() !== emp.nombre) {
    alert('El nombre no coincide. No se eliminó nada.');
    return;
  }
  try {
    const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(emp._id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmacion: escrito.trim() })
    });
    const data = await r.json();
    if (!r.ok) { alert(data.error || 'Error al eliminar'); return; }
    alert(`Empresa "${emp.nombre}" eliminada definitivamente.`);
    cargarEmpresas();
  } catch (err) {
    alert('no hay conexion');
  }
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

    const activos = activosDeEmpresa(emp);
    pintarCheckboxes(contenedorCheckboxesEditar, 'formatosActivos', activos);
    pintarTablaCarpetas(tablaCarpetasEditar, activos, emp.formatosCarpeta || {}, emp.formatosCompartidos || []);

    // marcar los modulos habilitados de la empresa en el modal
    const mods = (emp.modulosActivos && emp.modulosActivos.length > 0)
      ? emp.modulosActivos
      : ['formatos', 'asistencia', 'capacitaciones', 'programas'];
    document.querySelectorAll('#checkboxes-modulos-editar input[name="modulosActivos"]').forEach(c => {
      c.checked = mods.includes(c.value);
    });

    const jornada = emp.jornadaEsperada || {};
    ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'].forEach(dia => {
      formEditar[`jornada_${dia}`].value = jornada[dia] != null ? jornada[dia] : 7;
    });

    // Actualizar tabla de carpetas cuando cambie la selección de formatos activos
    contenedorCheckboxesEditar.onchange = () => {
      const marcados = Array.from(
        contenedorCheckboxesEditar.querySelectorAll('input[name="formatosActivos"]:checked')
      ).map(i => i.value);
      pintarTablaCarpetas(tablaCarpetasEditar, marcados, emp.formatosCarpeta || {}, emp.formatosCompartidos || []);
    };

    modalEditar.hidden = false;
  } catch (err) {
    alert('no hay conexion');
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
      mostrarMensaje(msgEditar, 'no hay conexion', true);
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
      pintarCheckboxes(contenedorCheckboxes, 'formatosActivos', idsTodos());
      pintarTablaCarpetas(tablaCarpetas, idsTodos(), null);
      cargarEmpresas();
    } catch (err) {
      mostrarMensaje(msgEmpresa, 'no hay conexion', true);
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
      mostrarMensaje(msgAdmin, 'no hay conexion', true);
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
