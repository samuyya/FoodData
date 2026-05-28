const logoEl = document.getElementById('logo-empresa');
const logoPlaceholder = document.getElementById('logo-placeholder');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const btnLogout = document.getElementById('btn-logout');
const btnFormatos = document.getElementById('btn-formatos');
const btnAsistencia = document.getElementById('btn-asistencia');
const btnCapacitaciones = document.getElementById('btn-capacitaciones');
const btnProgramas = document.getElementById('btn-programas');
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

// oculto los botones de modulos que el superadmin no le habilito a esta empresa
function aplicarModulos(modulos) {
  if (!Array.isArray(modulos) || modulos.length === 0) return; // sin info, dejo todo visible
  const mapa = {
    formatos: btnFormatos,
    asistencia: btnAsistencia,
    capacitaciones: btnCapacitaciones,
    programas: btnProgramas
  };
  Object.entries(mapa).forEach(([mod, btn]) => {
    if (!btn) return;
    if (!modulos.includes(mod)) btn.style.display = 'none';
  });
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
btnProgramas.addEventListener('click', () => {
  window.location.href = '/programas.html';
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

async function cargarBadgePendientes() {
  try {
    const r = await fetch('/api/registros/resumen-pendientes');
    if (!r.ok) return;
    const d = await r.json();
    const badge = document.getElementById('badge-pendientes');
    if (!badge) return;
    if (d.totalDiasPendientes > 0) {
      badge.textContent = 'Hay formatos pendientes por llenar';
      badge.hidden = false;
    } else if (d.totalFormatos > 0) {
      badge.textContent = '✓ al día';
      badge.classList.add('menu-badge--ok');
      badge.hidden = false;
    }
  } catch (e) { /* silencio: si falla, el menu sigue funcionando */ }
}

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    aplicarModulos(me.empresa.modulosActivos);
    await fetch('/api/admin/limpiar', { method: 'POST' });
    if (!Array.isArray(me.empresa.modulosActivos) || me.empresa.modulosActivos.includes('formatos')) {
      cargarBadgePendientes();
    }
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el menú. Recarga la página.</p>';
  }
}

iniciar();
