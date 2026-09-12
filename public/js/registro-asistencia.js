const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const btnVolver = document.getElementById('btn-volver');
const logoPlaceholder = document.getElementById('logo-placeholder');

const selectEmpleado = document.getElementById('select-empleado');
const selectMes = document.getElementById('select-mes');
const btnDescargar = document.getElementById('btn-descargar-excel');
const contenedorTabla = document.getElementById('contenedor-tabla');
const estadoRegistro = document.getElementById('estado-registro');

const modalFoto = document.getElementById('modal-foto');
const modalFotoImg = document.getElementById('modal-foto-img');
const modalFotoTitulo = document.getElementById('modal-foto-titulo');
const btnCerrarFoto = document.getElementById('btn-cerrar-foto');

const modalCorregir = document.getElementById('modal-corregir');
const formCorregir = document.getElementById('form-corregir');
const corregirDia = document.getElementById('corregir-dia');
const corregirError = document.getElementById('corregir-error');
const btnCancelarCorregir = document.getElementById('btn-cancelar-corregir');

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

let registroIdEnCorreccion = null;

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

function horaTexto(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function fotoUrl(ref) {
  return `/api/asistencia/foto?ref=${encodeURIComponent(ref)}`;
}

async function cargarEmpleados() {
  const r = await fetch('/api/asistencia/empleados');
  const data = await r.json();
  selectEmpleado.innerHTML = '<option value="">-- selecciona --</option>';
  (data.empleados || []).forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp._id;
    opt.textContent = emp.nombre;
    selectEmpleado.appendChild(opt);
  });
}

async function cargarMeses() {
  const hoy = new Date();
  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth() + 1;

  const r = await fetch('/api/asistencia/meses');
  const data = await r.json();

  const opciones = new Map();
  const claveActual = `${anioActual}-${mesActual}`;
  opciones.set(claveActual, { anio: anioActual, mes: mesActual });
  (data.meses || []).forEach(m => {
    opciones.set(`${m.anio}-${m.mes}`, { anio: m.anio, mes: m.mes });
  });

  const orden = Array.from(opciones.values()).sort((a, b) => {
    if (a.anio !== b.anio) return b.anio - a.anio;
    return b.mes - a.mes;
  });

  selectMes.innerHTML = '';
  orden.forEach(o => {
    const opt = document.createElement('option');
    opt.value = `${o.anio}-${o.mes}`;
    opt.textContent = `${MESES_LARGOS[o.mes - 1]} ${o.anio}`;
    selectMes.appendChild(opt);
  });
  selectMes.value = claveActual;
}

function miniFoto(ref, etiqueta) {
  if (!ref) return '<span class="ayuda">sin foto</span>';
  const url = fotoUrl(ref);
  return `<img class="foto-mini" loading="lazy" src="${url}" data-url="${url}" data-etiqueta="${etiqueta}" alt="${etiqueta}" title="Ver ${etiqueta}" />`;
}

function renderTabla(data) {
  contenedorTabla.innerHTML = '';

  if (data.dias.length === 0) {
    estadoRegistro.textContent = `${data.empleado.nombre} no tiene registros en ${MESES_LARGOS[data.mes - 1]} ${data.anio}.`;
    contenedorTabla.appendChild(estadoRegistro);
    return;
  }

  const tabla = document.createElement('table');
  tabla.className = 'tabla-registros';
  tabla.innerHTML = `
    <thead>
      <tr>
        <th>Día</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Evidencia</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tbody = tabla.querySelector('tbody');

  data.dias.forEach(d => {
    const tr = document.createElement('tr');
    const entrada = d.horaIngreso ? horaTexto(d.horaIngreso) : '—';
    const salida = d.horaSalida ? horaTexto(d.horaSalida) : '—';
    const horas = d.completo ? `${d.horasTrabajadas} h` : '—';

    let evidencia;
    if (d.completo) {
      evidencia = `<div class="celda-evidencia">${miniFoto(d.fotoIngreso, 'Entrada')}${miniFoto(d.fotoSalida, 'Salida')}</div>`;
    } else {
      evidencia = `<span class="falta-salida">⚠ falta salida</span>
        <button type="button" class="btn-secundario btn-corregir" data-id="${d.registroId}" data-dia="${d.dia}">Corregir</button>`;
    }

    const fest = window.FestivosCO && window.FestivosCO.esFestivo(data.anio, data.mes, d.dia);
    const tdDia = fest
      ? `<td class="td-dia td-dia--festivo" title="Día feriado">${d.dia}</td>`
      : `<td class="td-dia">${d.dia}</td>`;

    tr.innerHTML = `
      ${tdDia}
      <td>${entrada}</td>
      <td>${salida}</td>
      <td>${horas}</td>
      <td>${evidencia}</td>
    `;
    tbody.appendChild(tr);
  });

  contenedorTabla.appendChild(tabla);

  const total = document.createElement('p');
  total.className = 'total-mes';
  total.textContent = `Total del mes: ${data.totalHoras} horas`;
  contenedorTabla.appendChild(total);

  pintarHorasExtra(data.horasExtra);

  contenedorTabla.querySelectorAll('.foto-mini').forEach(img => {
    img.addEventListener('click', () => {
      modalFotoImg.src = img.dataset.url;
      modalFotoTitulo.textContent = `Evidencia — ${img.dataset.etiqueta}`;
      modalFoto.hidden = false;
    });
  });

  contenedorTabla.querySelectorAll('.btn-corregir').forEach(btn => {
    btn.addEventListener('click', () => abrirCorregir(btn.dataset.id, btn.dataset.dia));
  });
}

function semanaHTML(s) {
  return `
    <article class="semana-extra">
      <div class="semana-extra-cabecera">
        <strong>${escapeHTML(s.etiqueta)}</strong>
        <span class="semana-extra-total">${s.totalSemana} h extra</span>
      </div>
      <ul class="semana-extra-lista">
        <li><span>Horas extra diurnas</span><strong>${s.diurnas} h</strong></li>
        <li><span>Horas extra con recargo dominical</span><strong>${s.dominicales} h</strong></li>
        <li><span>Horas extra nocturnas</span><strong>${s.nocturnas} h</strong></li>
        <li><span>Horas extra dominicales nocturnas</span><strong>${s.dominicalesNocturnas} h</strong></li>
      </ul>
      ${s.corte ? `<p class="semana-extra-corte">${escapeHTML(s.corte)}</p>` : ''}
    </article>
  `;
}

function pintarHorasExtra(horasExtra) {
  if (!horasExtra) return;

  if (horasExtra.total <= 0) {
    const sinExtra = document.createElement('p');
    sinExtra.className = 'total-mes';
    sinExtra.textContent = 'Total horas extra este mes: 0 h';
    contenedorTabla.appendChild(sinExtra);
    return;
  }

  const resumen = document.createElement('div');
  resumen.className = 'resumen-extra';
  resumen.innerHTML = `
    <div class="resumen-extra-cabecera">
      <div class="resumen-extra-texto">
        <span class="resumen-extra-label">Total horas extra este mes</span>
        <strong class="resumen-extra-valor">${horasExtra.total} h</strong>
      </div>
      <button type="button" class="btn-secundario btn-pequeno" id="btn-toggle-detalle">Ver detalle por semana ▾</button>
    </div>
    <div class="detalle-extra" id="detalle-extra" hidden>
      ${horasExtra.semanas.map(semanaHTML).join('')}
    </div>
  `;
  contenedorTabla.appendChild(resumen);

  const btnToggle = resumen.querySelector('#btn-toggle-detalle');
  const detalle = resumen.querySelector('#detalle-extra');
  btnToggle.addEventListener('click', () => {
    detalle.hidden = !detalle.hidden;
    btnToggle.textContent = detalle.hidden ? 'Ver detalle por semana ▾' : 'Ocultar detalle ▴';
  });
}

let peticionRegistro = 0;

async function cargarRegistro() {
  const miPeticion = ++peticionRegistro;
  const empleadoId = selectEmpleado.value;
  if (!empleadoId) {
    contenedorTabla.innerHTML = '';
    estadoRegistro.textContent = 'Selecciona un empleado para ver su registro.';
    contenedorTabla.appendChild(estadoRegistro);
    return;
  }
  const [anioStr, mesStr] = selectMes.value.split('-');

  contenedorTabla.innerHTML = '';
  estadoRegistro.textContent = 'Cargando...';
  contenedorTabla.appendChild(estadoRegistro);

  try {
    const r = await fetch(`/api/asistencia/registro/${encodeURIComponent(empleadoId)}?anio=${anioStr}&mes=${mesStr}`);
    const data = await r.json();
    if (miPeticion !== peticionRegistro) return; // cambiaron de empleado/mes mientras esperaba
    if (!r.ok) {
      estadoRegistro.textContent = data.error || 'Error cargando el registro';
      return;
    }
    renderTabla(data);
  } catch (err) {
    if (miPeticion !== peticionRegistro) return;
    estadoRegistro.textContent = 'no hay conexion';
  }
}

function abrirCorregir(registroId, dia) {
  registroIdEnCorreccion = registroId;
  corregirDia.textContent = dia;
  corregirError.hidden = true;
  formCorregir.reset();
  modalCorregir.hidden = false;
  setTimeout(() => formCorregir.hora.focus(), 50);
}

function cerrarCorregir() {
  modalCorregir.hidden = true;
  registroIdEnCorreccion = null;
}

btnCerrarFoto.addEventListener('click', () => { modalFoto.hidden = true; });
modalFoto.addEventListener('click', (e) => { if (e.target === modalFoto) modalFoto.hidden = true; });

btnCancelarCorregir.addEventListener('click', cerrarCorregir);
modalCorregir.addEventListener('click', (e) => { if (e.target === modalCorregir) cerrarCorregir(); });

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalFoto.hidden) modalFoto.hidden = true;
  if (!modalCorregir.hidden) cerrarCorregir();
});

formCorregir.addEventListener('submit', async (e) => {
  e.preventDefault();
  corregirError.hidden = true;
  const btnGuardar = formCorregir.querySelector('button[type="submit"]');
  await conBotonCargando(btnGuardar, 'Guardando...', async () => {
    try {
      const r = await fetch('/api/asistencia/corregir-salida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registroId: registroIdEnCorreccion,
          hora: formCorregir.hora.value,
          password: formCorregir.password.value
        })
      });
      const data = await r.json();
      if (!r.ok) {
        corregirError.textContent = data.error || 'No se pudo corregir';
        corregirError.hidden = false;
        return;
      }
      cerrarCorregir();
      cargarRegistro();
    } catch (err) {
      corregirError.textContent = 'no hay conexion';
      corregirError.hidden = false;
    }
  });
});

selectEmpleado.addEventListener('change', cargarRegistro);
selectMes.addEventListener('change', cargarRegistro);

btnDescargar.addEventListener('click', async () => {
  if (!selectMes.value) return;
  const [anioStr, mesStr] = selectMes.value.split('-');
  await conBotonCargando(btnDescargar, 'Preparando...', async () => {
    try {
      const r = await fetch(`/api/asistencia/excel/${anioStr}/${mesStr}`);
      if (r.status === 404) {
        alert('No hay registros de asistencia para ese mes todavía.');
        return;
      }
      if (!r.ok) {
        alert('Error al descargar el archivo.');
        return;
      }
      const blob = await r.blob();
      const disposicion = r.headers.get('Content-Disposition') || '';
      const m = disposicion.match(/filename="?([^"]+)"?/);
      const nombre = m ? m[1] : `asistencia_${anioStr}-${String(mesStr).padStart(2, '0')}.xlsx`;

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
    }
  });
});

btnVolver.addEventListener('click', () => { window.location.href = '/asistencia.html'; });
async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    await cargarEmpleados();
    await cargarMeses();
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando la página. Recarga.</p>';
  }
}

iniciar();
