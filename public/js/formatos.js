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

const btnAbrirReporte       = document.getElementById('btn-abrir-reporte');
const panelReporte          = document.getElementById('panel-reporte');
const btnGenerarMes         = document.getElementById('btn-generar-mes');
const btnTogglePersonalizado= document.getElementById('btn-toggle-personalizado');
const rangoPersonalizado    = document.getElementById('rango-personalizado');
const inputDesde            = document.getElementById('input-desde');
const inputHasta            = document.getElementById('input-hasta');
const btnGenerarRango       = document.getElementById('btn-generar-rango');
const hojaReporte           = document.getElementById('hoja-reporte');
const barraImprimir         = document.getElementById('barra-imprimir');
const btnImprimir           = document.getElementById('btn-imprimir');

const modalReporte          = document.getElementById('modal-admin-reporte');
const modalReporteError     = document.getElementById('modal-reporte-error');
const formAdminReporte      = document.getElementById('form-admin-reporte');
const btnModalReporteCancelar = document.getElementById('modal-reporte-cancelar');

let empresaActual = null;
let rangoReportePendiente = null;

const MESES_LARGOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

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

function hoyISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

function primerDiaMesISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatearFechaISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES_LARGOS[m - 1]} de ${a}`;
}

function pillCumplimiento(pct) {
  const clase = pct >= 90 ? 'ok' : 'aviso';
  return `<span class="pill-cumplimiento ${clase}">${pct}%</span>`;
}

function bloqueCarpetaHTML(bloque) {
  const filas = bloque.formatos.map(f => `
    <tr>
      <td>${escapeHTML(f.nombre)}</td>
      <td class="num">${f.diasRegistrados} / ${f.diasTotales}</td>
      <td class="num">${f.diasTotales - f.diasRegistrados}</td>
      <td class="num">${pillCumplimiento(f.cumplimiento)}</td>
    </tr>
  `).join('');

  const novedadesHTML = bloque.novedades.length === 0
    ? '<p class="sin-novedades">Sin novedades en este periodo.</p>'
    : bloque.novedades.map(n => `
        <div class="novedad">
          <strong>${n.dia} ${MESES_CORTOS[n.mes - 1]} — ${escapeHTML(n.nombre)}:</strong> ${escapeHTML(n.observaciones)}
          <span class="novedad-meta">Responsable: ${escapeHTML(n.responsable)}</span>
        </div>
      `).join('');

  return `
    <div class="bloque-carpeta">
      <h2>${ICONOS_CARPETA[bloque.clave]} ${escapeHTML(NOMBRES_CARPETA[bloque.clave])}</h2>
      <table class="reporte-tabla">
        <thead><tr><th>Formato</th><th class="num">Días al día</th><th class="num">Pendientes</th><th class="num">Cumplimiento</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <div class="novedades-carpeta">
        <h3>Novedades de ${escapeHTML(NOMBRES_CARPETA[bloque.clave])}</h3>
        ${novedadesHTML}
      </div>
    </div>
  `;
}

function pintarReporte(data) {
  const bloquesHTML = data.carpetas.map(bloqueCarpetaHTML).join('');
  const logoHTML = empresaActual && empresaActual.logo
    ? `<img class="hoja-logo" src="${empresaActual.logo}" alt="Logo de ${escapeHTML(empresaActual.nombre)}" />`
    : `<div class="hoja-logo establecimiento-logo-ph" style="display:flex;align-items:center;justify-content:center;font-size:.65rem;">Logo</div>`;

  hojaReporte.innerHTML = `
    <div class="hoja-topline">
      <span>Generado por FoodData</span>
      <span>${escapeHTML(new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }))}</span>
    </div>
    <div class="hoja-encabezado">
      ${logoHTML}
      <div>
        <p class="hoja-empresa-nombre">${escapeHTML(empresaActual ? empresaActual.nombre : '')}</p>
        <p class="hoja-empresa-meta">Restaurante · Reporte de seguimiento de formatos</p>
      </div>
    </div>
    <div class="hoja-titulo-inst">
      <h1>REPORTE DE SEGUIMIENTO DE FORMATOS</h1>
      <p>Del ${formatearFechaISO(data.desde)} al ${formatearFechaISO(data.hasta)}</p>
    </div>
    <div class="kpi-fila">
      <div class="kpi"><div class="kpi-valor">${data.cumplimientoGeneral}%</div><div class="kpi-label">Cumplimiento del periodo</div></div>
      <div class="kpi"><div class="kpi-valor">${data.formatosActivos}</div><div class="kpi-label">Formatos activos</div></div>
      <div class="kpi"><div class="kpi-valor${data.totalNovedades > 0 ? ' aviso-color' : ''}">${data.totalNovedades}</div><div class="kpi-label">Novedades con observación</div></div>
    </div>
    ${bloquesHTML}
    <p class="hoja-pie">Reporte de referencia generado por FoodData a partir de los registros diarios de la empresa.</p>
  `;
}

async function generarReporte(desde, hasta) {
  hojaReporte.innerHTML = '<p class="ayuda">Cargando...</p>';
  hojaReporte.hidden = false;
  barraImprimir.hidden = true;
  try {
    const r = await fetch(`/api/registros/reporte?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
    const data = await r.json();
    if (r.status === 401 && data.requiereClaveAdmin) {
      hojaReporte.hidden = true;
      rangoReportePendiente = { desde, hasta };
      modalReporteError.hidden = true;
      formAdminReporte.reset();
      modalReporte.hidden = false;
      setTimeout(() => formAdminReporte.password.focus(), 50);
      return;
    }
    if (!r.ok) {
      hojaReporte.innerHTML = `<p class="mensaje mensaje-error">${escapeHTML(data.error || 'No se pudo generar el reporte')}</p>`;
      return;
    }
    pintarReporte(data);
    barraImprimir.hidden = false;
    hojaReporte.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    hojaReporte.innerHTML = '<p class="mensaje mensaje-error">no hay conexion</p>';
  }
}

function cerrarModalReporte() {
  modalReporte.hidden = true;
  rangoReportePendiente = null;
}

btnModalReporteCancelar.addEventListener('click', cerrarModalReporte);
modalReporte.addEventListener('click', e => { if (e.target === modalReporte) cerrarModalReporte(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalReporte.hidden) cerrarModalReporte(); });

formAdminReporte.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalReporteError.hidden = true;
  const btnVerificarReporte = formAdminReporte.querySelector('button[type="submit"]');
  await conBotonCargando(btnVerificarReporte, 'Verificando...', async () => {
    try {
      const r = await fetch('/api/admin/verificar-reporte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: formAdminReporte.password.value })
      });
      const data = await r.json();
      if (!r.ok) {
        modalReporteError.textContent = data.error || 'Error';
        modalReporteError.hidden = false;
        return;
      }
      modalReporte.hidden = true;
      if (rangoReportePendiente) {
        const { desde, hasta } = rangoReportePendiente;
        rangoReportePendiente = null;
        generarReporte(desde, hasta);
      }
    } catch (err) {
      modalReporteError.textContent = 'no hay conexion';
      modalReporteError.hidden = false;
    }
  });
});

btnAbrirReporte.addEventListener('click', () => {
  panelReporte.hidden = !panelReporte.hidden;
  if (!panelReporte.hidden) panelReporte.scrollIntoView({ behavior: 'smooth' });
});

btnTogglePersonalizado.addEventListener('click', () => {
  rangoPersonalizado.hidden = !rangoPersonalizado.hidden;
});

btnGenerarMes.addEventListener('click', () => generarReporte(primerDiaMesISO(), hoyISO()));

btnGenerarRango.addEventListener('click', () => {
  if (!inputDesde.value || !inputHasta.value) return;
  generarReporte(inputDesde.value, inputHasta.value);
});

btnImprimir.addEventListener('click', () => window.print());

inputDesde.max = hoyISO();
inputHasta.max = hoyISO();
inputDesde.value = primerDiaMesISO();
inputHasta.value = hoyISO();

function pintarHeader(empresa) {
  empresaActual = empresa;
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
      modalError.textContent = 'no hay conexion';
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
