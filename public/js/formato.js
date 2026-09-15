const $ = (id) => document.getElementById(id);

// elementos del header
const logoEl = $('logo-empresa');
const logoPlaceholder = $('logo-placeholder');
const nombreEmpresaEl = $('nombre-empresa');
const tituloEl = $('formato-titulo');
const fechaEl = $('formato-fecha');
const badgeAdminEl = $('badge-admin-activo');
const badgeAdminNombreEl = $('badge-admin-nombre');
const btnVolver = $('btn-volver');

const bannerPendientes = $('banner-pendientes');
const bannerInfo = $('banner-info');
const bannerExito = $('banner-exito');

const encInst = $('encabezado-institucional');
const encPlan = $('enc-plan');
const encPrograma = $('enc-programa');
const encTitulo = $('enc-titulo');

// form genérico (formatos sin plantilla propia)
const formGenerico = $('form-registro');
const diaObjetivoGen = $('formato-dia-actual');
const inputResponsable = $('input-responsable');
const responsableHint = $('responsable-hint');
const inputObservaciones = $('input-observaciones');
const msgRegistro = $('msg-registro');
const btnGuardar = $('btn-guardar');
const btnVerRegistros = $('btn-ver-registros');

// calidad de agua
const formCA = $('form-calidad-agua');
const caDiaActual = $('ca-dia-actual');
const caHora = $('ca-hora');
const caPunto = $('ca-punto');
const caPhValor = $('ca-ph-valor');
const caPhRes = $('ca-ph-resultado');
const caCloroValor = $('ca-cloro-valor');
const caCloroRes = $('ca-cloro-resultado');
const caObservaciones = $('ca-observaciones');
const caResponsable = $('ca-responsable');
const caResponsableHint = $('ca-responsable-hint');
const caNota = $('ca-nota');
const caMsg = $('ca-msg');
const caBtnGuardar = $('ca-btn-guardar');
const caBtnRegistros = $('ca-btn-registros');

// empleados (lo usa presentacion_personal)
const seccionEmpleados = $('seccion-empleados');
const formNuevoEmpleado = $('form-nuevo-empleado');
const msgEmpleado = $('msg-empleado');
const listaEmpleados = $('lista-empleados');
const modalEmpleado = $('modal-empleado');
const formEditarEmpleado = $('form-editar-empleado');
const modalEmpleadoError = $('modal-empleado-error');
const btnCancelarEditar = $('btn-cancelar-editar-empleado');

// presentacion personal — cierre del dia (verificacion de manipuladores)
const formPP = $('form-presentacion-personal');
const ppDia = $('pp-dia-actual');
const ppResp = $('pp-responsable');
const ppHint = $('pp-responsable-hint');
const ppObs = $('pp-observaciones');
const ppNota = $('pp-nota');
const ppMsg = $('pp-msg');
const ppBtn = $('pp-btn-guardar');
const ppBtnReg = $('pp-btn-registros');

// modal de admin atrasado (compartido)
const modalAdminAtrasado = $('modal-admin-atrasado');
const modalAdminAtrasadoInfo = $('modal-admin-atrasado-info');
const formAdminAtrasado = $('form-admin-atrasado');
const modalAdminAtrasadoError = $('modal-admin-atrasado-error');
const btnCancelarAdminAtrasado = $('btn-cancelar-admin-atrasado');

const params = new URLSearchParams(window.location.search);
const formatoId = params.get('id');
const carpetaId = params.get('carpeta') || 'cocina';

let formatoActual = null;
let esCarpetaAdmin = false;
let adminNombreSesion = null;

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const RANGOS = {
  pH:    { min: 6.5, max: 9.0 },
  cloro: { min: 0.3, max: 2.0 }
};

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mostrarMensaje(el, texto, esError = false) {
  el.textContent = texto;
  el.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  el.hidden = false;
}

function mostrarMsgEmpleado(texto, esError = false) {
  msgEmpleado.textContent = texto;
  msgEmpleado.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  msgEmpleado.hidden = false;
}

function pintarHeader(empresa) {
  nombreEmpresaEl.textContent = empresa.nombre;
  // El logo de la empresa solo se muestra en la sub-topbar (no en el encabezado institucional)
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

function pintarFecha() {
  const hoy = new Date();
  const fechaTxt = hoy.toLocaleDateString('es-CO', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
  const a = hoy.getFullYear(), m = hoy.getMonth() + 1, d = hoy.getDate();
  const fest = window.FestivosCO && window.FestivosCO.esFestivo(a, m, d);
  if (fest) {
    const n = window.FestivosCO.nombreFestivo(a, m, d);
    fechaEl.innerHTML = `${fechaTxt} <span class="badge-festivo">★ Festivo: ${n}</span>`;
  } else {
    fechaEl.textContent = fechaTxt;
  }
}

function pintarEncabezadoInstitucional(formato) {
  if (!formato.plan && !formato.programa && !formato.titulo) {
    encInst.hidden = true;
    return;
  }
  encPlan.textContent = formato.plan || '';
  encPrograma.textContent = formato.programa || '';
  encTitulo.textContent = formato.titulo || formato.nombre;
  const sumTit = document.getElementById('enc-summary-titulo');
  if (sumTit) sumTit.textContent = formato.titulo || 'Detalle del formato';
  // si el usuario ya vio este formato, lo dejo cerrado por defecto
  const yaVisto = localStorage.getItem('foodata.encVisto.' + formato.id) === '1';
  encInst.open = !yaVisto;
  if (!yaVisto) localStorage.setItem('foodata.encVisto.' + formato.id, '1');
  encInst.hidden = false;
}

// Banners pendientes
function mostrarBannerExito(texto) {
  bannerExito.innerHTML = texto;
  bannerExito.hidden = false;
  // Re-iniciar animación
  bannerExito.style.animation = 'none';
  void bannerExito.offsetHeight;
  bannerExito.style.animation = '';
}

function ocultarBannerExito() {
  bannerExito.hidden = true;
  bannerExito.innerHTML = '';
}

function pintarBanners(info, diaObjetivoEl) {
  bannerPendientes.hidden = true;
  bannerInfo.hidden = true;
  diaObjetivoEl.hidden = true;

  const { diaActual, mes, pendientes, siguienteDia, completoHoy } = info;
  const nombreMes = MESES_LARGOS[mes - 1];

  if (completoHoy) {
    bannerInfo.innerHTML = `✅ <strong>Mes al día.</strong> Todos los registros del 1 al ${diaActual} de ${nombreMes} están completos.`;
    bannerInfo.hidden = false;
    return;
  }

  if (siguienteDia === diaActual) {
    diaObjetivoEl.innerHTML = `📅 Estás registrando el <strong>día ${diaActual} de ${nombreMes}</strong> (hoy).`;
    diaObjetivoEl.hidden = false;
    return;
  }

  const restantes = pendientes.slice(1);
  const restantesTxt = restantes.length === 0
    ? 'Después de este, ya estarás al día.'
    : `Después de este faltarán: ${restantes.join(', ')}.`;

  bannerPendientes.innerHTML = `
    ⚠️ <strong>Tienes ${pendientes.length} día(s) pendiente(s) en ${nombreMes}.</strong>
    Días faltantes: ${pendientes.join(', ')}.
    Debes completarlos en orden, empezando por el más antiguo.
  `;
  bannerPendientes.hidden = false;

  diaObjetivoEl.innerHTML = `📝 Estás registrando el <strong>día ${siguienteDia} de ${nombreMes}</strong>. ${restantesTxt}`;
  diaObjetivoEl.hidden = false;
}

// Empleados (formato presentacion_personal)
// las 8 condiciones del formato de papel (FO-VM-03) — se guardan como texto
// claro en vez de los codigos de una letra que traia el excel (G, Z, U...)
const CRITERIOS_MANIPULADOR = [
  'Gorro', 'Calzado cerrado', 'Uñas cortas', 'Sin maquillaje / barba',
  'Dotación limpia', 'Estado de salud', 'Sin accesorios', 'Sin lociones / tabaco'
];

function pintarEmpleados(empleados) {
  listaEmpleados.innerHTML = '';
  if (empleados.length === 0) {
    const vacio = document.createElement('li');
    vacio.className = 'empleado-vacio';
    vacio.textContent = 'Aún no hay empleados registrados. Agrega uno arriba.';
    listaEmpleados.appendChild(vacio);
    return;
  }
  empleados.forEach(emp => {
    const li = document.createElement('li');
    li.className = 'empleado-item';
    li.dataset.id = emp._id;
    const inicial = emp.nombre.charAt(0).toUpperCase();
    const criteriosHTML = CRITERIOS_MANIPULADOR
      .map(c => `<label class="check-area"><input type="checkbox" value="${escapeHTML(c)}" /> ${escapeHTML(c)}</label>`)
      .join('');
    li.innerHTML = `
      <div class="empleado-cabecera">
        <button type="button" class="empleado-row">
          <span class="empleado-iniciales">${escapeHTML(inicial)}</span>
          <span class="empleado-nombre">${escapeHTML(emp.nombre)}</span>
          <span class="empleado-flecha">▾</span>
        </button>
        <div class="empleado-acciones">
          <button type="button" class="btn-secundario btn-editar-empleado">Editar</button>
          <button type="button" class="btn-eliminar-empleado" aria-label="Eliminar empleado">✕</button>
        </div>
      </div>
      <div class="empleado-formulario" hidden>
        <div class="empleado-check-cabecera">
          <span class="campo-label" style="margin:0">Verificación de hoy</span>
          <div class="radios-cnc empleado-check-radios">
            <label class="radio-pill radio-pill--ok"><input type="radio" name="cumple-${emp._id}" value="si" checked />Cumple</label>
            <label class="radio-pill radio-pill--bad"><input type="radio" name="cumple-${emp._id}" value="no" />No cumple</label>
          </div>
        </div>
        <div class="detalle-desviacion checks-grid" hidden>${criteriosHTML}</div>
      </div>
    `;
    li.querySelector('.empleado-row').addEventListener('click', () => {
      const cont = li.querySelector('.empleado-formulario');
      cont.hidden = !cont.hidden;
      li.classList.toggle('empleado-item--abierto');
    });
    li.querySelector('.btn-editar-empleado').addEventListener('click', () => abrirModalEditarEmp(emp));
    li.querySelector('.btn-eliminar-empleado').addEventListener('click', () => confirmarEliminar(emp));

    const detalle = li.querySelector('.detalle-desviacion');
    li.querySelectorAll(`input[name="cumple-${emp._id}"]`).forEach(r => {
      r.addEventListener('change', () => { detalle.hidden = (r.value !== 'no' || !r.checked); });
    });

    listaEmpleados.appendChild(li);
  });
}

async function cargarEmpleados() {
  const r = await fetch('/api/empleados');
  if (!r.ok) return;
  const data = await r.json();
  pintarEmpleados(data.empleados);
}

// aplica lo ya guardado hoy (si existe) a las filas de empleados ya pintadas
function aplicarEstadoManipuladores(registroHoy) {
  const manipuladores = (registroHoy && registroHoy.datos && registroHoy.datos.manipuladores) || [];
  manipuladores.forEach(m => {
    const li = listaEmpleados.querySelector(`.empleado-item[data-id="${m.empleadoId}"]`);
    if (!li) return; // el empleado pudo haber sido eliminado despues
    const radio = li.querySelector(`input[name="cumple-${m.empleadoId}"][value="${m.cumple ? 'si' : 'no'}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
    if (!m.cumple && Array.isArray(m.criterios)) {
      m.criterios.forEach(c => {
        const check = li.querySelector(`.detalle-desviacion input[value="${CSS.escape(c)}"]`);
        if (check) check.checked = true;
      });
    }
  });
}

// recorre el DOM (no un estado aparte) para armar lo que se va a guardar
function recogerManipuladores() {
  return Array.from(listaEmpleados.querySelectorAll('.empleado-item')).map(li => {
    const empleadoId = li.dataset.id;
    const nombre = li.querySelector('.empleado-nombre').textContent;
    const marcado = li.querySelector(`input[name="cumple-${empleadoId}"]:checked`);
    const cumple = !marcado || marcado.value === 'si';
    const criterios = cumple ? [] : Array.from(li.querySelectorAll('.detalle-desviacion input:checked')).map(c => c.value);
    return { empleadoId, nombre, cumple, criterios };
  });
}

function resetearManipuladores() {
  listaEmpleados.querySelectorAll('.empleado-item').forEach(li => {
    const radioSi = li.querySelector('input[value="si"]');
    if (radioSi) radioSi.checked = true;
    li.querySelectorAll('.detalle-desviacion input').forEach(c => { c.checked = false; });
    const detalle = li.querySelector('.detalle-desviacion');
    if (detalle) detalle.hidden = true;
  });
}

function bloquearEmpleadosCheck() {
  listaEmpleados.querySelectorAll('.empleado-formulario input').forEach(el => { el.disabled = true; });
}

function abrirModalEditarEmp(emp) {
  formEditarEmpleado.id.value = emp._id;
  formEditarEmpleado.nombre.value = emp.nombre;
  modalEmpleadoError.hidden = true;
  modalEmpleado.hidden = false;
  setTimeout(() => formEditarEmpleado.nombre.focus(), 50);
}

function cerrarModalEditar() { modalEmpleado.hidden = true; }

btnCancelarEditar.addEventListener('click', cerrarModalEditar);
modalEmpleado.addEventListener('click', (e) => { if (e.target === modalEmpleado) cerrarModalEditar(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalEmpleado.hidden) cerrarModalEditar(); });

if (formNuevoEmpleado) {
  const btnAgregar = formNuevoEmpleado.querySelector('button[type="submit"]');
  formNuevoEmpleado.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgEmpleado.hidden = true;
    await conBotonCargando(btnAgregar, 'Agregando...', async () => {
      try {
        const r = await fetch('/api/empleados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: formNuevoEmpleado.nombre.value })
        });
        const data = await r.json();
        if (!r.ok) { mostrarMsgEmpleado(data.error || 'Error', true); return; }
        formNuevoEmpleado.reset();
        mostrarMsgEmpleado(`Empleado "${data.empleado.nombre}" agregado.`);
        cargarEmpleados();
      } catch (err) {
        mostrarMsgEmpleado('no hay conexion', true);
      }
    });
  });
}

formEditarEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalEmpleadoError.hidden = true;
  const id = formEditarEmpleado.id.value;
  const nombre = formEditarEmpleado.nombre.value;
  const btnGuardarEmp = formEditarEmpleado.querySelector('button[type="submit"]');
  await conBotonCargando(btnGuardarEmp, 'Guardando...', async () => {
    try {
      const r = await fetch(`/api/empleados/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre })
      });
      const data = await r.json();
      if (!r.ok) {
        modalEmpleadoError.textContent = data.error || 'Error';
        modalEmpleadoError.hidden = false;
        return;
      }
      cerrarModalEditar();
      cargarEmpleados();
    } catch (err) {
      modalEmpleadoError.textContent = 'no hay conexion';
      modalEmpleadoError.hidden = false;
    }
  });
});

async function confirmarEliminar(emp) {
  if (!window.confirm(`¿Eliminar a "${emp.nombre}"?\nEsta acción no se puede deshacer.`)) return;
  try {
    const r = await fetch(`/api/empleados/${encodeURIComponent(emp._id)}`, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) { mostrarMsgEmpleado(data.error || 'Error al eliminar', true); return; }
    mostrarMsgEmpleado(`Empleado "${emp.nombre}" eliminado.`);
    cargarEmpleados();
  } catch (err) {
    mostrarMsgEmpleado('no hay conexion', true);
  }
}

// Modal admin atrasado — UPFRONT (al entrar al formato)
function mostrarModalAdminAtrasadoUpfront(info, onVerificadoOk) {
  modalAdminAtrasadoError.hidden = true;
  formAdminAtrasado.reset();
  const dias = (info.pendientes || []).join(', ');
  const nombreCarpeta = carpetaId === 'cocina' ? 'Cocina' : (carpetaId === 'salon' ? 'Salón' : 'Administración');
  modalAdminAtrasadoInfo.innerHTML = `Este formato de <strong>${nombreCarpeta}</strong> tiene <strong>${info.pendientes.length} día(s) atrasado(s)</strong> sin registrar (${dias}). Solo el administrador puede llenarlos; ingresa la contraseña para continuar.`;
  modalAdminAtrasado.hidden = false;
  setTimeout(() => formAdminAtrasado.password.focus(), 80);

  // Cancelar → volver a lista de formatos
  btnCancelarAdminAtrasado.onclick = () => { window.location.href = '/formatos.html'; };
  modalAdminAtrasado.onclick = (e) => { if (e.target === modalAdminAtrasado) btnCancelarAdminAtrasado.onclick(); };
  document.onkeydown = (e) => {
    if (e.key === 'Escape' && !modalAdminAtrasado.hidden) btnCancelarAdminAtrasado.onclick();
  };

  formAdminAtrasado.onsubmit = async (e) => {
    e.preventDefault();
    modalAdminAtrasadoError.hidden = true;
    const btn = formAdminAtrasado.querySelector('button[type="submit"]');
    const txt = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    try {
      const r = await fetch('/api/admin/verificar-atrasado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: formAdminAtrasado.password.value, carpeta: carpetaId })
      });
      const data = await r.json();
      if (!r.ok) {
        modalAdminAtrasadoError.textContent = data.error || 'No se pudo verificar';
        modalAdminAtrasadoError.hidden = false;
        return;
      }
      modalAdminAtrasado.hidden = true;
      onVerificadoOk();
    } catch (err) {
      modalAdminAtrasadoError.textContent = 'no hay conexion';
      modalAdminAtrasadoError.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  };
}

// Llamada para guardar
async function enviarRegistro(cuerpo) {
  try {
    const r = await fetch('/api/registros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const data = await r.json();
    if (!r.ok) {
      return { error: data.error || 'algo salio mal al guardar', requiereClaveAdmin: data.requiereClaveAdmin };
    }
    return { ok: true, registro: data.registro, info: data.info };
  } catch (err) {
    return { error: 'no se pudo guardar, intenta otra vez' };
  }
}

// FORM GENÉRICO
function iniciarFormGenerico(infoInicial) {
  formGenerico.hidden = false;

  if (esCarpetaAdmin) {
    inputResponsable.value = adminNombreSesion;
    inputResponsable.readOnly = true;
    inputResponsable.classList.add('input-readonly');
    responsableHint.textContent = 'Nombre del administrador (no editable).';
  } else {
    inputResponsable.placeholder = 'Tu nombre completo';
  }

  function aplicarInfo(info) {
    pintarBanners(info, diaObjetivoGen);
    if (info.completoHoy && info.registroHoy) {
      inputResponsable.value = info.registroHoy.responsable || inputResponsable.value;
      inputObservaciones.value = info.registroHoy.observaciones || '';
      Array.from(formGenerico.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
      btnGuardar.disabled = true;
      btnGuardar.title = 'Ya completaste todos los días hasta hoy';
    }
  }

  if (infoInicial) aplicarInfo(infoInicial);

  formGenerico.addEventListener('submit', async (e) => {
    e.preventDefault();
    msgRegistro.hidden = true;
    ocultarBannerExito();
    const cuerpo = {
      formatoId, carpeta: carpetaId,
      responsable: inputResponsable.value,
      observaciones: inputObservaciones.value,
      datos: {}
    };
    const txt = btnGuardar.textContent;
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';
    let res;
    try {
      res = await enviarRegistro(cuerpo);
          } finally {
      btnGuardar.disabled = false;
      btnGuardar.textContent = txt;
    }

    if (res.requiereClaveAdmin) {
      mostrarModalAdminAtrasadoUpfront(
        { pendientes: (res.info && res.info.pendientes) || ['(varios)'] },
        () => { formGenerico.requestSubmit ? formGenerico.requestSubmit() : formGenerico.dispatchEvent(new Event('submit', { cancelable: true })); }
      );
      return;
    }
    if (res.error) {
      mostrarMensaje(msgRegistro, res.error, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const diaGuardado = res.registro.dia;
    const avisos = [
      res.excelError        ? `<br><span class="aviso-excel">⚠️ Excel local: ${escapeHTML(res.excelError)}</span>` : '',
      res.googleSheetsError ? `<br><span class="aviso-excel">⚠️ Google Sheets: ${escapeHTML(res.googleSheetsError)}</span>` : ''
    ].join('');
    if (res.info.completoHoy) {
      mostrarBannerExito(`✅ <strong>¡Listo!</strong> Día ${diaGuardado} guardado y el mes está al día.${avisos}`);
      aplicarInfo(res.info);
    } else {
      const sig = res.info.siguienteDia;
      const nombreMes = MESES_LARGOS[res.info.mes - 1];
      mostrarBannerExito(`✅ <strong>Día ${diaGuardado} guardado correctamente.</strong> Ahora llena el día <strong>${sig} de ${nombreMes}</strong>.${avisos}`);
      pintarBanners(res.info, diaObjetivoGen);
      inputObservaciones.value = '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  btnVerRegistros.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM CALIDAD DEL AGUA
function evaluarCNC(valor, rango) {
  const num = parseFloat(valor);
  if (isNaN(num)) return null;
  return (num >= rango.min && num <= rango.max) ? 'C' : 'NC';
}

function pintarBadgeCNC(badge, resultado) {
  badge.classList.remove('badge-resultado--ok', 'badge-resultado--bad', 'badge-resultado--vacio');
  if (resultado === 'C') {
    badge.textContent = 'Cumple';
    badge.classList.add('badge-resultado--ok');
  } else if (resultado === 'NC') {
    badge.textContent = 'No cumple';
    badge.classList.add('badge-resultado--bad');
  } else {
    badge.textContent = '—';
    badge.classList.add('badge-resultado--vacio');
  }
}

function iniciarFormCalidadAgua(infoInicial) {
  formCA.hidden = false;
  caNota.textContent = formatoActual.nota || '';

  const actualizarPhResultado    = () => pintarBadgeCNC(caPhRes,    evaluarCNC(caPhValor.value,    RANGOS.pH));
  const actualizarCloroResultado = () => pintarBadgeCNC(caCloroRes, evaluarCNC(caCloroValor.value, RANGOS.cloro));
  caPhValor.addEventListener('input', actualizarPhResultado);
  caCloroValor.addEventListener('input', actualizarCloroResultado);

  if (esCarpetaAdmin) {
    caResponsable.value = adminNombreSesion;
    caResponsable.readOnly = true;
    caResponsable.classList.add('input-readonly');
    caResponsableHint.textContent = 'Nombre del administrador (no editable).';
  } else {
    caResponsable.placeholder = 'Tu nombre completo';
  }

  function recogerDatos() {
    const olor  = formCA.querySelector('input[name="olor"]:checked');
    const color = formCA.querySelector('input[name="color"]:checked');
    const sabor = formCA.querySelector('input[name="sabor"]:checked');
    return {
      hora_muestreo:  caHora.value,
      punto_muestreo: caPunto.value.trim(),
      pH:    { valor: parseFloat(caPhValor.value),    resultado: evaluarCNC(caPhValor.value, RANGOS.pH) },
      cloro: { valor: parseFloat(caCloroValor.value), resultado: evaluarCNC(caCloroValor.value, RANGOS.cloro) },
      olor:  olor  ? olor.value  : null,
      color: color ? color.value : null,
      sabor: sabor ? sabor.value : null
    };
  }

  function rellenarConRegistro(reg) {
    const d = reg.datos || {};
    if (d.hora_muestreo)   caHora.value = d.hora_muestreo;
    if (d.punto_muestreo)  caPunto.value = d.punto_muestreo;
    if (d.pH && d.pH.valor != null)       { caPhValor.value = d.pH.valor; actualizarPhResultado(); }
    if (d.cloro && d.cloro.valor != null) { caCloroValor.value = d.cloro.valor; actualizarCloroResultado(); }
    ['olor', 'color', 'sabor'].forEach(campo => {
      if (d[campo]) {
        const r = formCA.querySelector(`input[name="${campo}"][value="${d[campo]}"]`);
        if (r) r.checked = true;
      }
    });
    if (reg.observaciones) caObservaciones.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) caResponsable.value = reg.responsable;
  }

  function resetearCamposDiarios() {
    caHora.value = '';
    caPunto.value = '';
    caPhValor.value = '';
    caCloroValor.value = '';
    caObservaciones.value = '';
    formCA.querySelectorAll('input[name="olor"], input[name="color"], input[name="sabor"]')
      .forEach(r => r.checked = false);
    pintarBadgeCNC(caPhRes, null);
    pintarBadgeCNC(caCloroRes, null);
  }

  function bloquearFormCompleto() {
    Array.from(formCA.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    caBtnGuardar.disabled = true;
    caBtnGuardar.title = 'Ya completaste todos los días hasta hoy';
  }

  function aplicarInfo(info) {
    pintarBanners(info, caDiaActual);
    if (info.completoHoy && info.registroHoy) {
      rellenarConRegistro(info.registroHoy);
      bloquearFormCompleto();
    }
  }

  if (infoInicial) aplicarInfo(infoInicial);

  formCA.addEventListener('submit', async (e) => {
    e.preventDefault();
    caMsg.hidden = true;
    ocultarBannerExito();

    const datos = recogerDatos();
    if (!datos.hora_muestreo)        { mostrarMensaje(caMsg, 'Indica la hora de muestreo.', true);          return; }
    if (!datos.punto_muestreo)       { mostrarMensaje(caMsg, 'Indica el punto de muestreo.', true);         return; }
    if (isNaN(datos.pH.valor))       { mostrarMensaje(caMsg, 'Ingresa un valor numérico para el pH.', true);return; }
    if (isNaN(datos.cloro.valor))    { mostrarMensaje(caMsg, 'Ingresa un valor numérico para el cloro residual.', true); return; }
    if (!datos.olor || !datos.color || !datos.sabor) {
      mostrarMensaje(caMsg, 'Marca Cumple o No cumple en olor, color y sabor.', true);
      return;
    }
    if (!caResponsable.value.trim()) { mostrarMensaje(caMsg, 'Ingresa el nombre del responsable.', true);   return; }

    const cuerpo = {
      formatoId, carpeta: carpetaId,
      responsable: caResponsable.value.trim(),
      observaciones: caObservaciones.value.trim(),
      datos
    };

    const txt = caBtnGuardar.textContent;
    caBtnGuardar.disabled = true;
    caBtnGuardar.textContent = 'Guardando...';
    let res;
    try {
      res = await enviarRegistro(cuerpo);
          } finally {
      caBtnGuardar.disabled = false;
      caBtnGuardar.textContent = txt;
    }

    if (res.requiereClaveAdmin) {
      // Sesión de admin expiró: pedir password de nuevo
      mostrarModalAdminAtrasadoUpfront(
        { pendientes: (res.info && res.info.pendientes) || ['(varios)'] },
        () => { formCA.requestSubmit ? formCA.requestSubmit() : formCA.dispatchEvent(new Event('submit', { cancelable: true })); }
      );
      return;
    }
    if (res.error) {
      mostrarMensaje(caMsg, res.error, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const diaGuardado = res.registro.dia;
    const avisos = [
      res.excelError        ? `<br><span class="aviso-excel">⚠️ Excel local: ${escapeHTML(res.excelError)}</span>` : '',
      res.googleSheetsError ? `<br><span class="aviso-excel">⚠️ Google Sheets: ${escapeHTML(res.googleSheetsError)}</span>` : ''
    ].join('');

    if (res.info.completoHoy) {
      // Bloquear el form con los datos guardados
      mostrarBannerExito(`✅ <strong>¡Listo!</strong> Día ${diaGuardado} guardado y el mes está al día.${avisos}`);
      rellenarConRegistro(res.info.registroHoy);
      pintarBanners(res.info, caDiaActual);
      bloquearFormCompleto();
    } else {
      // Quedan más días por llenar: mensaje claro + limpiar campos diarios
      const sig = res.info.siguienteDia;
      const nombreMes = MESES_LARGOS[res.info.mes - 1];
      mostrarBannerExito(`✅ <strong>Día ${diaGuardado} guardado correctamente.</strong> Ahora llena el día <strong>${sig} de ${nombreMes}</strong>. El responsable se mantiene; los demás campos se limpiaron.${avisos}`);
      resetearCamposDiarios();
      pintarBanners(res.info, caDiaActual);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  caBtnRegistros.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// helpers compartidos
function configurarResponsableEsCarpetaAdmin(input, hint) {
  if (esCarpetaAdmin) {
    input.value = adminNombreSesion;
    input.readOnly = true;
    input.classList.add('input-readonly');
    if (hint) hint.textContent = 'Nombre del administrador (no editable).';
  } else {
    input.placeholder = 'Tu nombre completo';
  }
}

async function postRegistro(cuerpo, btn, msgEl, diaObjEl, formEl, opciones = {}) {
  const txt = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  let res;
  try {
    res = await enviarRegistro(cuerpo);
      } finally {
    btn.disabled = false;
    btn.textContent = txt;
  }
  if (res.requiereClaveAdmin) {
    mostrarModalAdminAtrasadoUpfront(
      { pendientes: (res.info && res.info.pendientes) || ['(varios)'] },
      () => formEl.requestSubmit ? formEl.requestSubmit() : formEl.dispatchEvent(new Event('submit', { cancelable: true }))
    );
    return;
  }
  if (res.error) {
    mostrarMensaje(msgEl, res.error, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const diaGuardado = res.registro.dia;
  const avisos = [
    res.excelError        ? `<br><span class="aviso-excel">⚠️ Excel local: ${escapeHTML(res.excelError)}</span>` : '',
    res.googleSheetsError ? `<br><span class="aviso-excel">⚠️ Google Sheets: ${escapeHTML(res.googleSheetsError)}</span>` : ''
  ].join('');

  if (res.info.completoHoy) {
    mostrarBannerExito(`✅ <strong>¡Listo!</strong> Día ${diaGuardado} guardado y el mes está al día.${avisos}`);
    if (opciones.onCompleto) opciones.onCompleto(res.info);
  } else {
    const sig = res.info.siguienteDia;
    const nombreMes = MESES_LARGOS[res.info.mes - 1];
    mostrarBannerExito(`✅ <strong>Día ${diaGuardado} guardado correctamente.</strong> Ahora llena el día <strong>${sig} de ${nombreMes}</strong>. El responsable se mantiene; los demás campos se limpiaron.${avisos}`);
    if (opciones.onAvance) opciones.onAvance(res.info);
  }
  pintarBanners(res.info, diaObjEl);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// FORM TEMPERATURA DE EQUIPOS DE FRÍO
function iniciarFormTemperatura(infoInicial) {
  const formTE = document.getElementById('form-temperatura');
  const teDia = document.getElementById('te-dia-actual');
  const teHora1 = document.getElementById('te-hora1');
  const teTemp1 = document.getElementById('te-temp1');
  const teRes1 = document.getElementById('te-res1');
  const teHora2 = document.getElementById('te-hora2');
  const teTemp2 = document.getElementById('te-temp2');
  const teRes2 = document.getElementById('te-res2');
  const teTipo = document.getElementById('te-tipo');
  const teObs = document.getElementById('te-observaciones');
  const teResp = document.getElementById('te-responsable');
  const teHint = document.getElementById('te-responsable-hint');
  const teNota = document.getElementById('te-nota');
  const teMsg = document.getElementById('te-msg');
  const teBtn = document.getElementById('te-btn-guardar');
  const teBtnReg = document.getElementById('te-btn-registros');

  formTE.hidden = false;
  teNota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(teResp, teHint);

  function evaluar(temp) {
    const num = parseFloat(temp);
    if (isNaN(num)) return null;
    if (teTipo.value === 'refrigeracion') return (num >= 0 && num <= 4) ? 'C' : 'NC';
    if (teTipo.value === 'congelacion')   return (num <= -18) ? 'C' : 'NC';
    return null;
  }
  function pintar(badge, valor) {
    const r = evaluar(valor);
    pintarBadgeCNC(badge, r);
    return r;
  }
  teTemp1.addEventListener('input', () => pintar(teRes1, teTemp1.value));
  teTemp2.addEventListener('input', () => pintar(teRes2, teTemp2.value));
  teTipo.addEventListener('change', () => { pintar(teRes1, teTemp1.value); pintar(teRes2, teTemp2.value); });

  function recoger() {
    return {
      tipoEquipo: teTipo.value,
      hora1: teHora1.value,
      temp1: parseFloat(teTemp1.value),
      resultado1: evaluar(teTemp1.value),
      hora2: teHora2.value,
      temp2: parseFloat(teTemp2.value),
      resultado2: evaluar(teTemp2.value)
    };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (d.tipoEquipo) teTipo.value = d.tipoEquipo;
    if (d.hora1) teHora1.value = d.hora1;
    if (d.temp1 != null && !isNaN(d.temp1)) { teTemp1.value = d.temp1; pintar(teRes1, d.temp1); }
    if (d.hora2) teHora2.value = d.hora2;
    if (d.temp2 != null && !isNaN(d.temp2)) { teTemp2.value = d.temp2; pintar(teRes2, d.temp2); }
    if (reg.observaciones) teObs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) teResp.value = reg.responsable;
  }
  function resetear() {
    teHora1.value = ''; teTemp1.value = ''; teHora2.value = ''; teTemp2.value = '';
    teObs.value = '';
    pintarBadgeCNC(teRes1, null);
    pintarBadgeCNC(teRes2, null);
  }
  function bloquear() {
    Array.from(formTE.querySelectorAll('input, textarea, select')).forEach(el => el.disabled = true);
    teBtn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, teDia);
    if (infoInicial.completoHoy && infoInicial.registroHoy) {
      rellenar(infoInicial.registroHoy);
      bloquear();
    }
  }

  formTE.addEventListener('submit', async (e) => {
    e.preventDefault();
    teMsg.hidden = true;
    const d = recoger();
    if (!d.tipoEquipo) { mostrarMensaje(teMsg, 'Selecciona el tipo de equipo.', true); return; }
    if (!d.hora1 || !d.hora2) { mostrarMensaje(teMsg, 'Indica las horas de las dos mediciones.', true); return; }
    if (isNaN(d.temp1) || isNaN(d.temp2)) { mostrarMensaje(teMsg, 'Ingresa las dos temperaturas.', true); return; }
    if (!teResp.value.trim()) { mostrarMensaje(teMsg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: teResp.value.trim(),
      observaciones: teObs.value.trim(),
      datos: d
    }, teBtn, teMsg, teDia, formTE, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  teBtnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM VERIFICACIÓN DE PLAGAS
function iniciarFormPlagas(infoInicial) {
  const formPL = document.getElementById('form-plagas');
  const plDia = document.getElementById('pl-dia-actual');
  const plAreas = document.getElementById('pl-areas');
  const plNovedad = document.getElementById('pl-novedad');
  const plObs = document.getElementById('pl-observaciones');
  const plResp = document.getElementById('pl-responsable');
  const plHint = document.getElementById('pl-responsable-hint');
  const plNota = document.getElementById('pl-nota');
  const plMsg = document.getElementById('pl-msg');
  const plBtn = document.getElementById('pl-btn-guardar');
  const plBtnReg = document.getElementById('pl-btn-registros');

  formPL.hidden = false;
  plNota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(plResp, plHint);

  function recoger() {
    const areas = Array.from(plAreas.querySelectorAll('input[name="area"]:checked')).map(i => i.value);
    const tipo = formPL.querySelector('input[name="tipoControl"]:checked');
    return {
      areas,
      tipoControl: tipo ? tipo.value : null,
      novedad: plNovedad.value.trim()
    };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (Array.isArray(d.areas)) {
      d.areas.forEach(a => {
        const c = plAreas.querySelector(`input[value="${a}"]`);
        if (c) c.checked = true;
      });
    }
    if (d.tipoControl) {
      const r = formPL.querySelector(`input[name="tipoControl"][value="${d.tipoControl}"]`);
      if (r) r.checked = true;
    }
    if (d.novedad) plNovedad.value = d.novedad;
    if (reg.observaciones) plObs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) plResp.value = reg.responsable;
  }
  function resetear() {
    plAreas.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    formPL.querySelectorAll('input[name="tipoControl"]').forEach(r => r.checked = false);
    plNovedad.value = '';
    plObs.value = '';
  }
  function bloquear() {
    Array.from(formPL.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    plBtn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, plDia);
    if (infoInicial.completoHoy && infoInicial.registroHoy) {
      rellenar(infoInicial.registroHoy);
      bloquear();
    }
  }

  formPL.addEventListener('submit', async (e) => {
    e.preventDefault();
    plMsg.hidden = true;
    const d = recoger();
    if (d.areas.length === 0) { mostrarMensaje(plMsg, 'Marca al menos un área inspeccionada.', true); return; }
    if (!d.tipoControl) { mostrarMensaje(plMsg, 'Indica el tipo de control (Preventivo o Correctivo).', true); return; }
    if (!plResp.value.trim()) { mostrarMensaje(plMsg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: plResp.value.trim(),
      observaciones: plObs.value.trim(),
      datos: d
    }, plBtn, plMsg, plDia, formPL, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  plBtnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM CONTROL DE RESIDUOS SÓLIDOS
function iniciarFormResiduos(infoInicial) {
  const formRS = document.getElementById('form-residuos');
  const rsDia = document.getElementById('rs-dia-actual');
  const rsOrg = document.getElementById('rs-organicos');
  const rsApr = document.getElementById('rs-aprovechables');
  const rsNoA = document.getElementById('rs-noaprovechables');
  const rsFEv = document.getElementById('rs-fecha-evacuacion');
  const rsObs = document.getElementById('rs-observaciones');
  const rsResp = document.getElementById('rs-responsable');
  const rsHint = document.getElementById('rs-responsable-hint');
  const rsNota = document.getElementById('rs-nota');
  const rsMsg = document.getElementById('rs-msg');
  const rsBtn = document.getElementById('rs-btn-guardar');
  const rsBtnReg = document.getElementById('rs-btn-registros');

  formRS.hidden = false;
  rsNota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(rsResp, rsHint);

  function recoger() {
    return {
      organicos: parseInt(rsOrg.value || '0', 10),
      aprovechables: parseInt(rsApr.value || '0', 10),
      noAprovechables: parseInt(rsNoA.value || '0', 10),
      fechaEvacuacion: rsFEv.value || null
    };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (d.organicos      != null) rsOrg.value = d.organicos;
    if (d.aprovechables  != null) rsApr.value = d.aprovechables;
    if (d.noAprovechables!= null) rsNoA.value = d.noAprovechables;
    if (d.fechaEvacuacion) rsFEv.value = d.fechaEvacuacion;
    if (reg.observaciones) rsObs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) rsResp.value = reg.responsable;
  }
  function resetear() {
    rsOrg.value = ''; rsApr.value = ''; rsNoA.value = '';
    rsFEv.value = '';
    rsObs.value = '';
  }
  function bloquear() {
    Array.from(formRS.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    rsBtn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, rsDia);
    if (infoInicial.completoHoy && infoInicial.registroHoy) {
      rellenar(infoInicial.registroHoy);
      bloquear();
    }
  }

  formRS.addEventListener('submit', async (e) => {
    e.preventDefault();
    rsMsg.hidden = true;
    const d = recoger();
    if ([d.organicos, d.aprovechables, d.noAprovechables].some(n => isNaN(n) || n < 0)) {
      mostrarMensaje(rsMsg, 'Ingresa cantidades válidas (≥ 0) en las 3 categorías.', true);
      return;
    }
    if (!rsResp.value.trim()) { mostrarMensaje(rsMsg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: rsResp.value.trim(),
      observaciones: rsObs.value.trim(),
      datos: d
    }, rsBtn, rsMsg, rsDia, formRS, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  rsBtnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

//  Catálogos de áreas para los formatos de limpieza
//  (Salón viene del catálogo del servidor; baño es fijo aquí)
const AREAS_BANO = [
  'Ambiente', 'Sanitario', 'Lavamanos', 'Dispensadores', 'Decoración',
  'Techo', 'Lámparas', 'Paredes', 'Piso', 'Puertas',
  'Accesorios', 'Recipiente residuos', 'Implementos de aseo'
];

// FORM LIMPIEZA Y DESINFECCIÓN — SALÓN
function iniciarFormLimpiezaSalon(infoInicial) {
  const form = document.getElementById('form-limpieza-salon');
  const diaEl = document.getElementById('ls-dia-actual');
  const areasCt = document.getElementById('ls-areas');
  const obs = document.getElementById('ls-observaciones');
  const resp = document.getElementById('ls-responsable');
  const hint = document.getElementById('ls-responsable-hint');
  const nota = document.getElementById('ls-nota');
  const msg = document.getElementById('ls-msg');
  const btn = document.getElementById('ls-btn-guardar');
  const btnReg = document.getElementById('ls-btn-registros');

  form.hidden = false;
  nota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(resp, hint);

  // Áreas vienen del catálogo (formato.areas) con producto fijo por área
  const listaAreas = Array.isArray(formatoActual.areas) ? formatoActual.areas : [];

  areasCt.innerHTML = '';
  listaAreas.forEach(({ nombre, producto }) => {
    const label = document.createElement('label');
    label.className = 'area-check-card';
    label.innerHTML = `
      <span class="area-check-nombre">${nombre}</span>
      <input type="checkbox" name="area" value="${nombre}" class="area-check-input" />
      <span class="area-check-producto area-check-producto--${producto.toLowerCase()}">${producto}</span>
    `;
    areasCt.appendChild(label);
  });

  function recoger() {
    const tipo = form.querySelector('input[name="tipoLimpieza"]:checked');
    const areas = Array.from(areasCt.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value);
    return { tipoLimpieza: tipo ? tipo.value : null, areas };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (d.tipoLimpieza) {
      const r = form.querySelector(`input[name="tipoLimpieza"][value="${d.tipoLimpieza}"]`);
      if (r) r.checked = true;
    }
    // compat registros viejos
    let areasArr = [];
    if (Array.isArray(d.areas)) areasArr = d.areas;
    else if (d.areas && typeof d.areas === 'object') areasArr = Object.keys(d.areas);
    areasArr.forEach(a => {
      const c = areasCt.querySelector(`input[value="${a}"]`);
      if (c) c.checked = true;
    });
    if (reg.observaciones) obs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) resp.value = reg.responsable;
  }
  function resetear() {
    form.querySelectorAll('input[name="tipoLimpieza"]').forEach(r => r.checked = false);
    areasCt.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    obs.value = '';
  }
  function bloquear() {
    Array.from(form.querySelectorAll('input, textarea, select')).forEach(el => el.disabled = true);
    btn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, diaEl);
    if (infoInicial.completoHoy && infoInicial.registroHoy) { rellenar(infoInicial.registroHoy); bloquear(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const d = recoger();
    if (!d.tipoLimpieza) { mostrarMensaje(msg, 'Indica el tipo de limpieza (Rutinaria o Profunda).', true); return; }
    if (d.areas.length === 0) { mostrarMensaje(msg, 'Marca al menos un área que se limpió.', true); return; }
    if (!resp.value.trim()) { mostrarMensaje(msg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: resp.value.trim(),
      observaciones: obs.value.trim(),
      datos: d
    }, btn, msg, diaEl, form, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  btnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM LIMPIEZA Y DESINFECCIÓN — BAÑO
function iniciarFormLimpiezaBano(infoInicial) {
  const form = document.getElementById('form-limpieza-bano');
  const diaEl = document.getElementById('lb-dia-actual');
  const areasCt = document.getElementById('lb-areas');
  const obs = document.getElementById('lb-observaciones');
  const resp = document.getElementById('lb-responsable');
  const hint = document.getElementById('lb-responsable-hint');
  const nota = document.getElementById('lb-nota');
  const msg = document.getElementById('lb-msg');
  const btn = document.getElementById('lb-btn-guardar');
  const btnReg = document.getElementById('lb-btn-registros');

  form.hidden = false;
  nota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(resp, hint);

  areasCt.innerHTML = '';
  AREAS_BANO.forEach(area => {
    const label = document.createElement('label');
    label.className = 'check-area';
    label.innerHTML = `<input type="checkbox" name="area" value="${area}" /> ${area}`;
    areasCt.appendChild(label);
  });

  function recoger() {
    const tipo = form.querySelector('input[name="tipoLimpieza"]:checked');
    const areas = Array.from(areasCt.querySelectorAll('input[name="area"]:checked')).map(c => c.value);
    return { tipoLimpieza: tipo ? tipo.value : null, areas };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (d.tipoLimpieza) {
      const r = form.querySelector(`input[name="tipoLimpieza"][value="${d.tipoLimpieza}"]`);
      if (r) r.checked = true;
    }
    if (Array.isArray(d.areas)) d.areas.forEach(a => {
      const c = areasCt.querySelector(`input[value="${a}"]`);
      if (c) c.checked = true;
    });
    if (reg.observaciones) obs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) resp.value = reg.responsable;
  }
  function resetear() {
    form.querySelectorAll('input[name="tipoLimpieza"]').forEach(r => r.checked = false);
    areasCt.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
    obs.value = '';
  }
  function bloquear() {
    Array.from(form.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    btn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, diaEl);
    if (infoInicial.completoHoy && infoInicial.registroHoy) { rellenar(infoInicial.registroHoy); bloquear(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const d = recoger();
    if (!d.tipoLimpieza) { mostrarMensaje(msg, 'Indica el tipo de limpieza.', true); return; }
    if (d.areas.length === 0) { mostrarMensaje(msg, 'Marca al menos un área limpiada.', true); return; }
    if (!resp.value.trim()) { mostrarMensaje(msg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: resp.value.trim(),
      observaciones: obs.value.trim(),
      datos: d
    }, btn, msg, diaEl, form, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  btnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM LIMPIEZA Y DESINFECCIÓN — CAMPANA Y TRAMPA
function iniciarFormLimpiezaCT(infoInicial) {
  const form = document.getElementById('form-limpieza-ct');
  const diaEl = document.getElementById('lct-dia-actual');
  const hora = document.getElementById('lct-hora');
  const desinf = document.getElementById('lct-desinfectante');
  const agua = document.getElementById('lct-agua');
  const prod = document.getElementById('lct-producto');
  const obs = document.getElementById('lct-observaciones');
  const resp = document.getElementById('lct-responsable');
  const hint = document.getElementById('lct-responsable-hint');
  const nota = document.getElementById('lct-nota');
  const msg = document.getElementById('lct-msg');
  const btn = document.getElementById('lct-btn-guardar');
  const btnReg = document.getElementById('lct-btn-registros');

  form.hidden = false;
  nota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(resp, hint);

  function recoger() {
    const equipos = Array.from(form.querySelectorAll('input[name="equipo"]:checked')).map(i => i.value);
    return {
      equipos,
      hora: hora.value,
      desinfectante: desinf.value.trim(),
      cantidadAgua: parseFloat(agua.value),
      cantidadProducto: parseFloat(prod.value)
    };
  }
  function rellenar(reg) {
    const d = reg.datos || {};
    if (Array.isArray(d.equipos)) d.equipos.forEach(eq => {
      const c = form.querySelector(`input[name="equipo"][value="${eq}"]`);
      if (c) c.checked = true;
    });
    if (d.hora) hora.value = d.hora;
    if (d.desinfectante) desinf.value = d.desinfectante;
    if (d.cantidadAgua != null && !isNaN(d.cantidadAgua)) agua.value = d.cantidadAgua;
    if (d.cantidadProducto != null && !isNaN(d.cantidadProducto)) prod.value = d.cantidadProducto;
    if (reg.observaciones) obs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) resp.value = reg.responsable;
  }
  function resetear() {
    form.querySelectorAll('input[name="equipo"]').forEach(c => c.checked = false);
    hora.value = ''; desinf.value = ''; agua.value = ''; prod.value = '';
    obs.value = '';
  }
  function bloquear() {
    Array.from(form.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    btn.disabled = true;
  }

  if (infoInicial) {
    pintarBanners(infoInicial, diaEl);
    if (infoInicial.completoHoy && infoInicial.registroHoy) { rellenar(infoInicial.registroHoy); bloquear(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const d = recoger();
    if (d.equipos.length === 0) { mostrarMensaje(msg, 'Marca al menos un equipo (Campana o Trampa).', true); return; }
    if (!d.hora) { mostrarMensaje(msg, 'Indica la hora.', true); return; }
    if (!d.desinfectante) { mostrarMensaje(msg, 'Indica el desinfectante usado.', true); return; }
    if (isNaN(d.cantidadAgua) || isNaN(d.cantidadProducto)) { mostrarMensaje(msg, 'Ingresa cantidades válidas de agua y producto.', true); return; }
    if (!resp.value.trim()) { mostrarMensaje(msg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: resp.value.trim(),
      observaciones: obs.value.trim(),
      datos: d
    }, btn, msg, diaEl, form, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  btnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM RECEPCIÓN DE MATERIAS PRIMAS — multi-ítems por día
function iniciarFormRecepcion(infoInicial) {
  const form = document.getElementById('form-recepcion');
  const diaEl = document.getElementById('rec-dia-actual');
  const itemsEl = document.getElementById('rec-items');
  const btnAgregar = document.getElementById('rec-btn-agregar');
  const obs = document.getElementById('rec-observaciones');
  const resp = document.getElementById('rec-responsable');
  const hint = document.getElementById('rec-responsable-hint');
  const nota = document.getElementById('rec-nota');
  const msg = document.getElementById('rec-msg');
  const btn = document.getElementById('rec-btn-guardar');
  const btnReg = document.getElementById('rec-btn-registros');

  form.hidden = false;
  nota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(resp, hint);

  let contadorItem = 0;

  function crearItem(datos = {}) {
    contadorItem++;
    const idx = contadorItem;
    const div = document.createElement('div');
    div.className = 'item-recepcion';
    div.dataset.idx = idx;
    div.innerHTML = `
      <h3 class="item-recepcion-titulo">
        <span>📦 Recepción #<span class="item-numero">${idx}</span></span>
        <button type="button" class="item-recepcion-borrar" aria-label="Eliminar recepción" title="Eliminar recepción">✕</button>
      </h3>
      <div class="form-grid-2">
        <label class="campo">
          <span>Proveedor</span>
          <input type="text" name="proveedor" required value="${escAttr(datos.proveedor)}" />
        </label>
        <label class="campo">
          <span>Producto</span>
          <input type="text" name="producto" required value="${escAttr(datos.producto)}" />
        </label>
      </div>
      <div class="form-grid-2">
        <label class="campo">
          <span>Cantidad (Kg)</span>
          <input type="number" name="cantidad" step="0.01" min="0" required value="${escAttr(datos.cantidad)}" />
        </label>
        <label class="campo">
          <span>Temperatura (°C)</span>
          <input type="number" name="temperatura" step="0.1" value="${escAttr(datos.temperatura)}" />
        </label>
      </div>
      <div class="form-grid-2">
        <label class="campo">
          <span>Lote</span>
          <input type="text" name="lote" value="${escAttr(datos.lote)}" />
        </label>
        <label class="campo">
          <span>Fecha de vencimiento</span>
          <input type="date" name="fechaVencimiento" value="${escAttr(datos.fechaVencimiento)}" />
        </label>
      </div>

      <fieldset class="param-card">
        <legend>Condiciones de calidad</legend>
        <div class="param-grid-3 cond-calidad-grid">
          ${[
            { campo: 'color',      label: 'Color' },
            { campo: '',           label: '' },
            { campo: 'apariencia', label: 'Apariencia' },
            { campo: 'empaque',    label: 'Empaque' },
            { campo: '',           label: '' },
            { campo: 'olor',       label: 'Olor' }
          ].map(({ campo, label }) => {
            if (!campo) return '<div class="organo-vacio"></div>';
            return `
              <div class="organo-grupo">
                <span class="organo-label">${label}</span>
                <div class="radios-cnc">
                  <label class="radio-pill radio-pill--ok"><input type="radio" name="${campo}_${idx}" value="C" ${datos[campo] === 'C' ? 'checked' : ''} required />C</label>
                  <label class="radio-pill radio-pill--bad"><input type="radio" name="${campo}_${idx}" value="NC" ${datos[campo] === 'NC' ? 'checked' : ''} />NC</label>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </fieldset>

      <fieldset class="param-card item-decision">
        <legend>Decisión</legend>
        <div class="radios-cnc">
          <label class="radio-pill radio-pill--ok"><input type="radio" name="decision_${idx}" value="Acepta" ${datos.decision === 'Acepta' ? 'checked' : ''} required />Acepta</label>
          <label class="radio-pill radio-pill--bad"><input type="radio" name="decision_${idx}" value="Rechaza" ${datos.decision === 'Rechaza' ? 'checked' : ''} />Rechaza</label>
        </div>
      </fieldset>

      <label class="campo">
        <span>Observaciones de esta recepción</span>
        <input type="text" name="obsItem" value="${escAttr(datos.observaciones)}" />
      </label>
    `;
    div.querySelector('.item-recepcion-borrar').addEventListener('click', () => {
      if (itemsEl.children.length > 1 || confirm('¿Eliminar la única recepción?')) {
        div.remove();
        renumerar();
      }
    });
    itemsEl.appendChild(div);
    return div;
  }

  function renumerar() {
    Array.from(itemsEl.querySelectorAll('.item-recepcion')).forEach((it, i) => {
      it.querySelector('.item-numero').textContent = i + 1;
    });
  }

  function escAttr(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function recogerItems() {
    return Array.from(itemsEl.querySelectorAll('.item-recepcion')).map(div => {
      const idx = div.dataset.idx;
      const get = (sel) => { const el = div.querySelector(sel); return el ? el.value.trim() : ''; };
      const radio = (campo) => {
        const r = div.querySelector(`input[name="${campo}_${idx}"]:checked`);
        return r ? r.value : null;
      };
      return {
        proveedor: get('input[name="proveedor"]'),
        producto: get('input[name="producto"]'),
        cantidad: parseFloat(get('input[name="cantidad"]')),
        temperatura: get('input[name="temperatura"]') ? parseFloat(get('input[name="temperatura"]')) : null,
        lote: get('input[name="lote"]'),
        fechaVencimiento: get('input[name="fechaVencimiento"]'),
        color: radio('color'),
        olor: radio('olor'),
        apariencia: radio('apariencia'),
        empaque: radio('empaque'),
        decision: radio('decision'),
        observaciones: get('input[name="obsItem"]')
      };
    });
  }

  function rellenar(reg) {
    const items = reg.datos && Array.isArray(reg.datos.items) ? reg.datos.items : [];
    itemsEl.innerHTML = '';
    contadorItem = 0;
    if (items.length === 0) crearItem();
    else items.forEach(d => crearItem(d));
    if (reg.observaciones) obs.value = reg.observaciones;
    if (reg.responsable && !esCarpetaAdmin) resp.value = reg.responsable;
  }
  function resetear() {
    itemsEl.innerHTML = '';
    contadorItem = 0;
    crearItem();
    obs.value = '';
  }
  function bloquear() {
    Array.from(form.querySelectorAll('input, textarea, button:not(#rec-btn-registros)')).forEach(el => el.disabled = true);
  }

  // arranco con un item
  crearItem();
  btnAgregar.addEventListener('click', () => crearItem());

  if (infoInicial) {
    pintarBanners(infoInicial, diaEl);
    if (infoInicial.completoHoy && infoInicial.registroHoy) { rellenar(infoInicial.registroHoy); bloquear(); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const items = recogerItems();
    if (items.length === 0) { mostrarMensaje(msg, 'Agrega al menos una recepción.', true); return; }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.proveedor || !it.producto) { mostrarMensaje(msg, `Recepción #${i + 1}: completa proveedor y producto.`, true); return; }
      if (isNaN(it.cantidad)) { mostrarMensaje(msg, `Recepción #${i + 1}: ingresa cantidad en Kg.`, true); return; }
      if (!it.color || !it.olor || !it.apariencia || !it.empaque) {
        mostrarMensaje(msg, `Recepción #${i + 1}: marca C/NC en las 4 condiciones de calidad.`, true); return;
      }
      if (!it.decision) { mostrarMensaje(msg, `Recepción #${i + 1}: indica si Acepta o Rechaza.`, true); return; }
    }
    if (!resp.value.trim()) { mostrarMensaje(msg, 'Ingresa el nombre del responsable.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: resp.value.trim(),
      observaciones: obs.value.trim(),
      datos: { items }
    }, btn, msg, diaEl, form, {
      onCompleto: (info) => { rellenar(info.registroHoy); bloquear(); },
      onAvance: () => resetear()
    });
  });
  btnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// FORM PRESENTACIÓN PERSONAL (verificación de manipuladores, dentro de la
// misma lista de empleados — ver pintarEmpleados)
function iniciarFormPresentacionPersonal(infoInicial) {
  formPP.hidden = false;
  ppNota.textContent = formatoActual.nota || '';
  configurarResponsableEsCarpetaAdmin(ppResp, ppHint);

  function bloquear() {
    Array.from(formPP.querySelectorAll('input, textarea')).forEach(el => el.disabled = true);
    ppBtn.disabled = true;
    bloquearEmpleadosCheck();
  }

  if (infoInicial) {
    pintarBanners(infoInicial, ppDia);
    if (infoInicial.completoHoy && infoInicial.registroHoy) {
      const reg = infoInicial.registroHoy;
      aplicarEstadoManipuladores(reg);
      if (reg.observaciones) ppObs.value = reg.observaciones;
      if (reg.responsable && !esCarpetaAdmin) ppResp.value = reg.responsable;
      bloquear();
    }
  }

  formPP.addEventListener('submit', async (e) => {
    e.preventDefault();
    ppMsg.hidden = true;
    if (listaEmpleados.querySelectorAll('.empleado-item').length === 0) {
      mostrarMensaje(ppMsg, 'Agrega al menos un empleado antes de guardar.', true); return;
    }
    const manipuladores = recogerManipuladores();
    const sinCriterios = manipuladores.find(m => !m.cumple && m.criterios.length === 0);
    if (sinCriterios) {
      mostrarMensaje(ppMsg, `Marca al menos un criterio para "${sinCriterios.nombre}" (o cámbialo a Cumple).`, true); return;
    }
    if (!ppResp.value.trim()) { mostrarMensaje(ppMsg, 'Ingresa el nombre de quien revisó.', true); return; }

    await postRegistro({
      formatoId, carpeta: carpetaId,
      responsable: ppResp.value.trim(),
      observaciones: ppObs.value.trim(),
      datos: { manipuladores }
    }, ppBtn, ppMsg, ppDia, formPP, {
      onCompleto: (info) => { aplicarEstadoManipuladores(info.registroHoy); bloquear(); },
      onAvance: () => resetearManipuladores()
    });
  });
  ppBtnReg.addEventListener('click', () => {
    window.location.href = `/registros.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
  });
}

// Boot
const PLANTILLAS = {
  'calidad_agua':              iniciarFormCalidadAgua,
  'control_temperatura':       iniciarFormTemperatura,
  'control_plagas':            iniciarFormPlagas,
  'manejo_residuos':           iniciarFormResiduos,
  'limpieza_salon':            iniciarFormLimpiezaSalon,
  'limpieza_bano':             iniciarFormLimpiezaBano,
  'limpieza_campana_trampa':   iniciarFormLimpiezaCT,
  'recepcion_materias_primas': iniciarFormRecepcion,
  'presentacion_personal':     iniciarFormPresentacionPersonal
};

async function cargar() {
  if (!formatoId) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Falta el parámetro de formato. Vuelve al menú.</p>';
    return;
  }

  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    pintarFecha();

    const rFormato = await fetch(`/api/formatos/${encodeURIComponent(formatoId)}?carpeta=${encodeURIComponent(carpetaId)}`);
    if (!rFormato.ok) {
      const d = await rFormato.json();
      document.body.innerHTML = `<p style="padding:2rem;color:#b91c1c">${d.error || 'No se pudo cargar el formato'}</p>`;
      return;
    }
    const dF = await rFormato.json();
    formatoActual = dF.formato;
    esCarpetaAdmin = formatoActual.carpeta === 'administracion';
    tituloEl.textContent = `${formatoActual.numero}. ${formatoActual.nombre}`;

    if (esCarpetaAdmin) {
      const rE = await fetch('/api/admin/estado-carpeta');
      const dE = await rE.json();
      if (!dE.activo) { window.location.href = '/formatos.html'; return; }
      adminNombreSesion = dE.nombre;
      badgeAdminNombreEl.textContent = adminNombreSesion;
      badgeAdminEl.hidden = false;
    }

    pintarEncabezadoInstitucional(formatoActual);

    if (formatoActual.id === 'presentacion_personal') {
      seccionEmpleados.hidden = false;
      await cargarEmpleados(); // las filas tienen que existir antes de aplicarles el estado del dia
    }

    // Cargar pendientes ANTES de mostrar el formulario
    const rPend = await fetch(`/api/registros/pendientes/${encodeURIComponent(formatoId)}?carpeta=${encodeURIComponent(carpetaId)}`);
    const pendInicial = rPend.ok ? await rPend.json() : null;

    const arrancarFormulario = () => {
      const iniciador = PLANTILLAS[formatoActual.id] || iniciarFormGenerico;
      iniciador(pendInicial);
    };

    // Si requiere contraseña de admin para días atrasados, pedirla AHORA antes de mostrar el form
    if (pendInicial && pendInicial.requiereAdminAtrasado) {
      mostrarModalAdminAtrasadoUpfront(pendInicial, arrancarFormulario);
    } else {
      arrancarFormulario();
    }
  } catch (err) {
    console.error(err);
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando el formato. Recarga la página.</p>';
  }
}

btnVolver.addEventListener('click', () => { window.location.href = '/formatos.html'; });

// atajos globales: Ctrl+S guarda, Esc cierra modal abierto
document.addEventListener('keydown', (e) => {
  // Ctrl+S / Cmd+S => guarda el form visible
  if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    const formVisible = Array.from(document.querySelectorAll('form'))
      .find(f => !f.hidden && f.offsetParent !== null && f.querySelector('button[type="submit"]'));
    if (!formVisible) return;
    e.preventDefault();
    if (formVisible.requestSubmit) formVisible.requestSubmit();
    else formVisible.dispatchEvent(new Event('submit', { cancelable: true }));
    return;
  }
  // Esc => cierra cualquier modal visible (modal-backdrop sin hidden)
  if (e.key === 'Escape') {
    const modal = Array.from(document.querySelectorAll('.modal-backdrop')).find(m => !m.hidden);
    if (modal) modal.hidden = true;
  }
});

cargar();
