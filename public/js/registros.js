const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const tituloEl = document.getElementById('formato-titulo');
const subtituloEl = document.getElementById('formato-subtitulo');
const selectMes = document.getElementById('select-mes');
const contenedorTabla = document.getElementById('contenedor-tabla');
const estadoHistorial = document.getElementById('estado-historial');
const historialInfoTexto = document.getElementById('historial-info-texto');
const btnDescargar = document.getElementById('btn-descargar-excel');
const btnVolverFormato = document.getElementById('btn-volver-formato');
const btnIrMenu = document.getElementById('btn-ir-menu');
const logoPlaceholder = document.getElementById('logo-placeholder');

const modal = document.getElementById('modal-historial-admin');
const formVerificar = document.getElementById('form-verificar-historial');
const modalError = document.getElementById('modal-historial-error');
const btnCancelar = document.getElementById('btn-cancelar-historial');

const params = new URLSearchParams(window.location.search);
const formatoId = params.get('id');

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

let formatoActual = null;
let mesActualAnio = null;
let mesActualMes = null;
let intentoPendiente = null;

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

function pintarOpcionesMes(meses) {
  const hoy = new Date();
  mesActualAnio = hoy.getFullYear();
  mesActualMes = hoy.getMonth() + 1;

  const opciones = new Map();
  const claveActual = `${mesActualAnio}-${mesActualMes}`;
  opciones.set(claveActual, { anio: mesActualAnio, mes: mesActualMes, esActual: true, count: 0 });

  meses.forEach(m => {
    const clave = `${m.anio}-${m.mes}`;
    if (!opciones.has(clave)) {
      opciones.set(clave, { anio: m.anio, mes: m.mes, esActual: clave === claveActual, count: m.count });
    } else {
      opciones.get(clave).count = m.count;
    }
  });

  const orden = Array.from(opciones.values()).sort((a, b) => {
    if (a.anio !== b.anio) return b.anio - a.anio;
    return b.mes - a.mes;
  });

  selectMes.innerHTML = '';
  orden.forEach(o => {
    const opt = document.createElement('option');
    opt.value = `${o.anio}-${o.mes}`;
    const sufijo = o.esActual ? ' (mes actual)' : '';
    const conteo = o.count > 0 ? ` — ${o.count} registro(s)` : '';
    opt.textContent = `${MESES_LARGOS[o.mes - 1]} ${o.anio}${sufijo}${conteo}`;
    selectMes.appendChild(opt);
  });
  selectMes.value = claveActual;
}

function pintarTabla(registros, anio, mes, esMesActual) {
  if (registros.length === 0) {
    estadoHistorial.textContent = `No hay registros para ${MESES_LARGOS[mes - 1]} ${anio}.`;
    contenedorTabla.innerHTML = '';
    contenedorTabla.appendChild(estadoHistorial);
    historialInfoTexto.textContent = '';
    return;
  }

  const tabla = document.createElement('table');
  tabla.className = 'tabla-registros';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Día</th>
        <th>Fecha</th>
        <th>Responsable</th>
        <th>Observaciones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tabla.querySelector('tbody');
  registros.forEach(r => {
    const tr = document.createElement('tr');
    const fechaTxt = new Date(r.anio, r.mes - 1, r.dia).toLocaleDateString('es-CO', {
      weekday: 'short', day: '2-digit', month: 'long'
    });
    tr.innerHTML = `
      <td>${r.dia}</td>
      <td>${escapeHTML(fechaTxt)}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
    `;
    tbody.appendChild(tr);
  });

  contenedorTabla.innerHTML = '';
  contenedorTabla.appendChild(tabla);

  const sufijo = esMesActual ? ' (mes en curso)' : ' (mes anterior)';
  historialInfoTexto.textContent = `${registros.length} registro(s) en ${MESES_LARGOS[mes - 1]} ${anio}${sufijo}.`;
}

async function cargarHistorial(anio, mes) {
  estadoHistorial.textContent = 'Cargando...';
  contenedorTabla.innerHTML = '';
  contenedorTabla.appendChild(estadoHistorial);

  try {
    const r = await fetch(`/api/registros/historial/${encodeURIComponent(formatoId)}?anio=${anio}&mes=${mes}`);
    if (r.status === 401) {
      intentoPendiente = { anio, mes, accion: 'ver' };
      modalError.hidden = true;
      formVerificar.reset();
      modal.hidden = false;
      setTimeout(() => formVerificar.password.focus(), 50);
      return;
    }
    if (!r.ok) {
      const d = await r.json();
      estadoHistorial.textContent = d.error || 'Error cargando registros';
      return;
    }
    const data = await r.json();
    pintarTabla(data.registros, data.anio, data.mes, data.esMesActual);
  } catch (err) {
    estadoHistorial.textContent = 'Error de red';
  }
}

selectMes.addEventListener('change', () => {
  const [anioStr, mesStr] = selectMes.value.split('-');
  cargarHistorial(parseInt(anioStr, 10), parseInt(mesStr, 10));
});

btnCancelar.addEventListener('click', () => {
  modal.hidden = true;
  intentoPendiente = null;
  const claveActual = `${mesActualAnio}-${mesActualMes}`;
  selectMes.value = claveActual;
  cargarHistorial(mesActualAnio, mesActualMes);
});

modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    modal.hidden = true;
    intentoPendiente = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) {
    modal.hidden = true;
    intentoPendiente = null;
    const claveActual = `${mesActualAnio}-${mesActualMes}`;
    selectMes.value = claveActual;
    cargarHistorial(mesActualAnio, mesActualMes);
  }
});

formVerificar.addEventListener('submit', async (e) => {
  e.preventDefault();
  modalError.hidden = true;
  const btnVerificar = formVerificar.querySelector('button[type="submit"]');
  await conBotonCargando(btnVerificar, 'Verificando...', async () => {
    try {
      const r = await fetch('/api/admin/verificar-historial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: formVerificar.password.value })
      });
      const data = await r.json();
      if (!r.ok) {
        modalError.textContent = data.error || 'Error';
        modalError.hidden = false;
        return;
      }
      modal.hidden = true;
      if (intentoPendiente) {
        const intento = intentoPendiente;
        intentoPendiente = null;
        if (intento.accion === 'descargar') {
          selectMes.value = `${intento.anio}-${intento.mes}`;
          btnDescargar.click();
        } else {
          cargarHistorial(intento.anio, intento.mes);
        }
      }
    } catch (err) {
      modalError.textContent = 'Error de red';
      modalError.hidden = false;
    }
  });
});

btnDescargar.addEventListener('click', async () => {
  if (!selectMes.value) return;
  const [anioStr, mesStr] = selectMes.value.split('-');
  const anio = parseInt(anioStr, 10);
  const mes = parseInt(mesStr, 10);

  btnDescargar.disabled = true;
  const textoOriginal = btnDescargar.textContent;
  btnDescargar.textContent = 'Preparando...';

  try {
    const r = await fetch(`/api/registros/excel/${anio}/${mes}`);
    if (r.status === 401) {
      intentoPendiente = { anio, mes, accion: 'descargar' };
      modalError.hidden = true;
      formVerificar.reset();
      modal.hidden = false;
      setTimeout(() => formVerificar.password.focus(), 50);
      return;
    }
    if (r.status === 404) {
      alert('No hay registros guardados para ese mes todavía.');
      return;
    }
    if (!r.ok) {
      alert('Error descargando el archivo.');
      return;
    }
    const blob = await r.blob();
    const disposicion = r.headers.get('Content-Disposition') || '';
    const m = disposicion.match(/filename="?([^"]+)"?/);
    const nombre = m ? m[1] : `registros_${anio}-${String(mes).padStart(2, '0')}.xlsx`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error de red al descargar.');
  } finally {
    btnDescargar.disabled = false;
    btnDescargar.textContent = textoOriginal;
  }
});

btnVolverFormato.addEventListener('click', () => {
  window.location.href = `/formato.html?id=${encodeURIComponent(formatoId)}`;
});

btnIrMenu.addEventListener('click', () => { window.location.href = '/formatos.html'; });


async function iniciar() {
  if (!formatoId) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Falta el parámetro de formato.</p>';
    return;
  }

  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);

    const rFormato = await fetch(`/api/formatos/${encodeURIComponent(formatoId)}`);
    if (!rFormato.ok) {
      const d = await rFormato.json();
      document.body.innerHTML = `<p style="padding:2rem;color:#b91c1c">${d.error || 'No se pudo cargar el formato'}</p>`;
      return;
    }
    const dF = await rFormato.json();
    formatoActual = dF.formato;
    tituloEl.textContent = `Registros — ${formatoActual.numero}. ${formatoActual.nombre}`;
    subtituloEl.textContent = 'Los empleados solo ven el mes en curso. Los meses anteriores requieren contraseña de administrador.';

    const rMeses = await fetch(`/api/registros/meses/${encodeURIComponent(formatoId)}`);
    const dMeses = await rMeses.json();
    pintarOpcionesMes(dMeses.meses || []);

    cargarHistorial(mesActualAnio, mesActualMes);
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando la pantalla.</p>';
  }
}

iniciar();
