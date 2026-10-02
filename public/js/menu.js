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
  window.location.href = '/index.html';
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

// inventarios: aviso del inventario general del mes que termino y el badge del boton
const btnInventarios = document.getElementById('btn-inventarios');
btnInventarios.addEventListener('click', () => { window.location.href = '/inventarios.html'; });

async function cargarAvisoInventario() {
  try {
    const r = await fetch('/api/inventario/resumen-menu');
    if (!r.ok) return;
    const d = await r.json();
    const badge = document.getElementById('badge-inv');
    if (d.enviado) badge.textContent = 'Inventario esperando aprobación';
    else if (d.sugerido || d.enCurso) badge.textContent = 'Inventario general sugerido';
    badge.hidden = !(d.enviado || d.sugerido || d.enCurso);

    const aviso = document.getElementById('aviso-menu');
    let pospuesto = false;
    try { pospuesto = d.sugerido && localStorage.getItem('fd_inv_aviso_' + d.sugerido.clave) === '1'; } catch (_) {}
    if (!d.sugerido || pospuesto) { aviso.innerHTML = ''; return; }
    aviso.innerHTML = `<span class="ic">📦</span><div><b>Terminó ${d.sugerido.mes}: es buen momento para el inventario general.</b>
      <p>Se cuenta todo lo que hay: materia prima, bebidas, menaje, mobiliario e insumos. Se puede repartir por partes entre varias personas.</p></div>
      <div class="botones"><button type="button" class="btn-primario" id="aviso-ir">Ir al inventario general</button><button type="button" class="btn-secundario" id="aviso-no">Ahora no</button></div>`;
    document.getElementById('aviso-ir').onclick = () => { window.location.href = '/inventarios.html#inventario-general'; };
    document.getElementById('aviso-no').onclick = () => {
      try { localStorage.setItem('fd_inv_aviso_' + d.sugerido.clave, '1'); } catch (_) {}
      aviso.innerHTML = '';
    };
  } catch (e) { console.log('no se pudo cargar el aviso de inventario:', e.message); }
}

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/index.html'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/index.html'; return; }
    pintarHeader(me.empresa);
    aplicarModulos(me.empresa.modulosActivos);
    // limpiar los marcadores de admin vencidos no bloquea nada visual, corre aparte
    fetch('/api/admin/limpiar', { method: 'POST' }).catch(() => {});
    if (!Array.isArray(me.empresa.modulosActivos) || me.empresa.modulosActivos.includes('formatos')) {
      cargarBadgePendientes();
    }
    // inventarios es adicional: solo aparece si el superadmin lo activo
    if ((me.empresa.modulosActivos || []).includes('inventarios')) {
      btnInventarios.hidden = false;
      cargarAvisoInventario();
    }
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el menú. Recarga la página.</p>';
  }
}

iniciar();
