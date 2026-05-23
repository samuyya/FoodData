const logoEl           = document.getElementById('logo-empresa');
const nombreEmpresaEl  = document.getElementById('nombre-empresa');
const logoPlaceholder  = document.getElementById('logo-placeholder');
const tituloPaginaEl   = document.getElementById('titulo-pagina');
const subtituloPaginaEl= document.getElementById('subtitulo-pagina');
const btnVolver        = document.getElementById('btn-volver');

const vistaCarpetas  = document.getElementById('vista-carpetas');
const vistFormatos   = document.getElementById('vista-formatos');
const listaCarpetas  = document.getElementById('lista-carpetas');
const listaFormatos  = document.getElementById('lista-formatos');

const modal          = document.getElementById('modal-admin');
const modalError     = document.getElementById('modal-error');
const formAdminPass  = document.getElementById('form-admin-pass');
const btnModalCancelar = document.getElementById('modal-cancelar');

const NOMBRES_CARPETA = {
  cocina:         'Cocina',
  salon:          'Salón',
  administracion: 'Administración'
};
const ICONOS_CARPETA = {
  cocina:         '🍳',
  salon:          '🪑',
  administracion: '🔒'
};

let dataCarpetas = {};
let carpetaActual = null;

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function pintarCarpetas() {
  listaCarpetas.innerHTML = '';
  const orden = ['cocina', 'salon', 'administracion'];
  orden.forEach(clave => {
    const formatos = dataCarpetas[clave] || [];
    const li = document.createElement('li');
    li.className = 'formato-card carpeta-card' + (clave === 'administracion' ? ' carpeta-card--admin' : '');

    const icono = ICONOS_CARPETA[clave];
    const nombre = NOMBRES_CARPETA[clave];
    const cantidad = formatos.length;
    const textoFormatos = cantidad === 1 ? '1 formato' : `${cantidad} formatos`;
    const candado = clave === 'administracion' ? '<span class="formato-lock">Solo administrador</span>' : '';

    li.innerHTML = `
      <div class="carpeta-icono${clave === 'administracion' ? ' carpeta-icono--admin' : ''}">${icono}</div>
      <div class="formato-info">
        <h3 class="formato-nombre">${escapeHTML(nombre)}</h3>
        <span class="carpeta-cantidad">${textoFormatos}</span>
        ${candado}
      </div>
      <span class="carpeta-flecha">›</span>
    `;

    if (cantidad === 0) {
      li.classList.add('carpeta-card--vacia');
      li.title = 'Esta carpeta no tiene formatos asignados';
    } else {
      li.addEventListener('click', () => abrirCarpeta(clave));
    }

    listaCarpetas.appendChild(li);
  });
}

async function abrirCarpeta(clave) {
  if (clave === 'administracion') {
    const r = await fetch('/api/admin/estado-carpeta');
    const d = await r.json();
    if (!d.activo) {
      modalError.hidden = true;
      formAdminPass.reset();
      modal.hidden = false;
      setTimeout(() => formAdminPass.password.focus(), 50);
      return;
    }
  }
  mostrarFormatos(clave);
}

function mostrarFormatos(clave) {
  carpetaActual = clave;
  const formatos = dataCarpetas[clave] || [];

  tituloPaginaEl.textContent = NOMBRES_CARPETA[clave];
  subtituloPaginaEl.textContent = 'Selecciona un formato para registrar.';

  listaFormatos.innerHTML = '';
  if (formatos.length === 0) {
    const vacio = document.createElement('li');
    vacio.className = 'empleado-vacio';
    vacio.textContent = 'Esta carpeta no tiene formatos asignados.';
    listaFormatos.appendChild(vacio);
  } else {
    formatos.forEach(f => {
      const li = document.createElement('li');
      li.className = 'formato-card';
      li.innerHTML = `
        <div class="formato-numero">${f.numero}</div>
        <div class="formato-info">
          <h3 class="formato-nombre">${escapeHTML(f.nombre)}</h3>
        </div>
      `;
      li.addEventListener('click', () => {
        window.location.href = `/formato.html?id=${encodeURIComponent(f.id)}&carpeta=${encodeURIComponent(f.carpeta)}`;
      });
      listaFormatos.appendChild(li);
    });
  }

  vistaCarpetas.hidden = true;
  vistFormatos.hidden = false;
}

function volverACarpetas() {
  carpetaActual = null;
  tituloPaginaEl.textContent = 'Formatos';
  subtituloPaginaEl.textContent = 'Selecciona una carpeta.';
  vistaCarpetas.hidden = false;
  vistFormatos.hidden = true;
}

function cerrarModal() {
  modal.hidden = true;
}

btnModalCancelar.addEventListener('click', cerrarModal);
modal.addEventListener('click', e => { if (e.target === modal) cerrarModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) cerrarModal(); });

formAdminPass.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalError.hidden = true;
  const btnVerificar = formAdminPass.querySelector('button[type="submit"]');
  await conBotonCargando(btnVerificar, 'Verificando...', async () => {
    try {
      const r = await fetch('/api/admin/verificar-carpeta', {
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
      cerrarModal();
      mostrarFormatos('administracion');
    } catch {
      modalError.textContent = 'Error de conexión';
      modalError.hidden = false;
    }
  });
});

btnVolver.addEventListener('click', () => {
  if (carpetaActual) {
    volverACarpetas();
  } else {
    window.location.href = '/menu.html';
  }
});

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);

    await fetch('/api/admin/limpiar', { method: 'POST' });

    const rF = await fetch('/api/formatos');
    const dF = await rF.json();
    dataCarpetas = dF.carpetas;
    pintarCarpetas();
  } catch {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando los formatos. Recarga la página.</p>';
  }
}

iniciar();
