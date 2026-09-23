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

const btnAbrirInspeccion    = document.getElementById('btn-abrir-inspeccion');
const panelInspeccion       = document.getElementById('panel-inspeccion');
const inputMesInspeccion    = document.getElementById('input-mes-inspeccion');
const btnVerInspeccion      = document.getElementById('btn-ver-inspeccion');
const filaEnviarInspeccion  = document.getElementById('fila-enviar-inspeccion');
const inputCorreoInspeccion = document.getElementById('input-correo-inspeccion');
const btnEnviarInspeccion   = document.getElementById('btn-enviar-inspeccion');
const inspeccionEnvioMensaje= document.getElementById('inspeccion-envio-mensaje');
const hojaInspeccion        = document.getElementById('hoja-inspeccion');
const barraImprimirInspeccion = document.getElementById('barra-imprimir-inspeccion');
const btnImprimirInspeccion = document.getElementById('btn-imprimir-inspeccion');

const modalInspeccion          = document.getElementById('modal-admin-inspeccion');
const modalInspeccionError     = document.getElementById('modal-inspeccion-error');
const formAdminInspeccion      = document.getElementById('form-admin-inspeccion');
const btnModalInspeccionCancelar = document.getElementById('modal-inspeccion-cancelar');

let empresaActual = null;
let rangoReportePendiente = null;
let mesInspeccionPendiente = null;
let mesInspeccionActual = null;

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
          <button type="button" class="btn-pequeno btn-corregir-novedad" data-id="${n.id}" data-formato="${n.formatoId}" data-carpeta="${n.carpeta}">✏️ Corregir</button>
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

  hojaReporte.querySelectorAll('.btn-corregir-novedad').forEach(btn => {
    btn.addEventListener('click', () => {
      const { id, formato, carpeta } = btn.dataset;
      window.location.href = `/formato.html?id=${encodeURIComponent(formato)}&carpeta=${encodeURIComponent(carpeta)}&corregir=${encodeURIComponent(id)}`;
    });
  });
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

function mesActualISO() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

function formatoInspeccionHTML(formato) {
  const encabezados = formato.columnas.map(c => `<th>${escapeHTML(c.header)}</th>`).join('');
  const filas = formato.filas.map(f => `
    <tr>${formato.columnas.map(c => `<td>${escapeHTML(f[c.key] ?? '')}</td>`).join('')}</tr>
  `).join('');

  return `
    <div class="inspeccion-formato">
      <h3 class="inspeccion-formato-titulo">${escapeHTML(formato.titulo)}</h3>
      <p class="inspeccion-formato-meta">${escapeHTML(formato.plan)} · ${escapeHTML(formato.programa)} · Código ${escapeHTML(formato.codigo)}</p>
      <table class="reporte-tabla">
        <thead><tr>${encabezados}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

function bloqueInspeccionCarpetaHTML(bloque) {
  return `
    <div class="bloque-carpeta">
      <h2>${ICONOS_CARPETA[bloque.clave]} ${escapeHTML(bloque.nombre)}</h2>
      ${bloque.formatos.map(formatoInspeccionHTML).join('')}
    </div>
  `;
}

function pintarInspeccion(data) {
  const logoHTML = empresaActual && empresaActual.logo
    ? `<img class="hoja-logo" src="${empresaActual.logo}" alt="Logo de ${escapeHTML(empresaActual.nombre)}" />`
    : `<div class="hoja-logo establecimiento-logo-ph" style="display:flex;align-items:center;justify-content:center;font-size:.65rem;">Logo</div>`;

  if (data.carpetas.length === 0) {
    hojaInspeccion.innerHTML = `<p class="ayuda">No hay registros guardados en ${MESES_LARGOS[data.mes - 1]} de ${data.anio}.</p>`;
    return;
  }

  hojaInspeccion.innerHTML = `
    <div class="hoja-topline">
      <span>Generado por FoodData</span>
      <span>${escapeHTML(new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }))}</span>
    </div>
    <div class="hoja-encabezado">
      ${logoHTML}
      <div>
        <p class="hoja-empresa-nombre">${escapeHTML(data.empresaNombre)}</p>
        <p class="hoja-empresa-meta">Restaurante · Formatos para inspección de sanidad</p>
      </div>
    </div>
    <div class="hoja-titulo-inst">
      <h1>FORMATOS DE ${MESES_LARGOS[data.mes - 1].toUpperCase()} DE ${data.anio}</h1>
    </div>
    ${data.carpetas.map(bloqueInspeccionCarpetaHTML).join('')}
    <p class="hoja-pie">Documento de referencia generado por FoodData a partir de los registros diarios de la empresa.</p>
  `;
}

async function verInspeccion(anio, mes) {
  hojaInspeccion.innerHTML = '<p class="ayuda">Cargando...</p>';
  hojaInspeccion.hidden = false;
  barraImprimirInspeccion.hidden = true;
  filaEnviarInspeccion.hidden = true;
  try {
    const r = await fetch(`/api/registros/inspeccion?anio=${anio}&mes=${mes}`);
    const data = await r.json();
    if (r.status === 401 && data.requiereClaveAdmin) {
      hojaInspeccion.hidden = true;
      mesInspeccionPendiente = { anio, mes };
      modalInspeccionError.hidden = true;
      formAdminInspeccion.reset();
      modalInspeccion.hidden = false;
      setTimeout(() => formAdminInspeccion.password.focus(), 50);
      return;
    }
    if (!r.ok) {
      hojaInspeccion.innerHTML = `<p class="mensaje mensaje-error">${escapeHTML(data.error || 'No se pudo cargar')}</p>`;
      return;
    }
    mesInspeccionActual = { anio, mes };
    pintarInspeccion(data);
    barraImprimirInspeccion.hidden = false;
    filaEnviarInspeccion.hidden = false;
    hojaInspeccion.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    hojaInspeccion.innerHTML = '<p class="mensaje mensaje-error">no hay conexion</p>';
  }
}

function cerrarModalInspeccion() {
  modalInspeccion.hidden = true;
  mesInspeccionPendiente = null;
}

btnModalInspeccionCancelar.addEventListener('click', cerrarModalInspeccion);
modalInspeccion.addEventListener('click', e => { if (e.target === modalInspeccion) cerrarModalInspeccion(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalInspeccion.hidden) cerrarModalInspeccion(); });

formAdminInspeccion.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalInspeccionError.hidden = true;
  const btnVerificarInspeccion = formAdminInspeccion.querySelector('button[type="submit"]');
  await conBotonCargando(btnVerificarInspeccion, 'Verificando...', async () => {
    try {
      const r = await fetch('/api/admin/verificar-inspeccion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: formAdminInspeccion.password.value })
      });
      const data = await r.json();
      if (!r.ok) {
        modalInspeccionError.textContent = data.error || 'Error';
        modalInspeccionError.hidden = false;
        return;
      }
      modalInspeccion.hidden = true;
      if (mesInspeccionPendiente) {
        const { anio, mes } = mesInspeccionPendiente;
        mesInspeccionPendiente = null;
        verInspeccion(anio, mes);
      }
    } catch (err) {
      modalInspeccionError.textContent = 'no hay conexion';
      modalInspeccionError.hidden = false;
    }
  });
});

btnAbrirInspeccion.addEventListener('click', () => {
  panelInspeccion.hidden = !panelInspeccion.hidden;
  if (!panelInspeccion.hidden) panelInspeccion.scrollIntoView({ behavior: 'smooth' });
});

btnVerInspeccion.addEventListener('click', () => {
  if (!inputMesInspeccion.value) return;
  const [anio, mes] = inputMesInspeccion.value.split('-').map(Number);
  verInspeccion(anio, mes);
});

btnEnviarInspeccion.addEventListener('click', async () => {
  inspeccionEnvioMensaje.hidden = true;
  if (!mesInspeccionActual) return;
  const destinatario = inputCorreoInspeccion.value.trim();
  if (!destinatario) {
    inspeccionEnvioMensaje.className = 'mensaje mensaje-error';
    inspeccionEnvioMensaje.textContent = 'Escribe un correo destinatario';
    inspeccionEnvioMensaje.hidden = false;
    return;
  }
  await conBotonCargando(btnEnviarInspeccion, 'Enviando...', async () => {
    try {
      const r = await fetch('/api/registros/inspeccion/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio: mesInspeccionActual.anio, mes: mesInspeccionActual.mes, destinatario })
      });
      const data = await r.json();
      inspeccionEnvioMensaje.className = r.ok ? 'mensaje mensaje-ok' : 'mensaje mensaje-error';
      inspeccionEnvioMensaje.textContent = r.ok ? `Enviado a ${destinatario}` : (data.error || 'No se pudo enviar');
      inspeccionEnvioMensaje.hidden = false;
    } catch (err) {
      inspeccionEnvioMensaje.className = 'mensaje mensaje-error';
      inspeccionEnvioMensaje.textContent = 'no hay conexion';
      inspeccionEnvioMensaje.hidden = false;
    }
  });
});

btnImprimirInspeccion.addEventListener('click', () => window.print());

inputMesInspeccion.max = mesActualISO();
inputMesInspeccion.value = mesActualISO();

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
  btnVolver.textContent = '← Volver a carpetas';
}

function volverACarpetas() {
  carpetaActual = null;
  tituloPaginaEl.textContent = 'Formatos';
  subtituloPaginaEl.textContent = 'Selecciona una carpeta.';
  vistaCarpetas.hidden = false;
  vistFormatos.hidden = true;
  btnVolver.textContent = '← Volver al menú';
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
