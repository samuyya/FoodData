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
const carpetaId = params.get('carpeta') || 'cocina';

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

function cncCell(valor) {
  if (valor === 'C')  return '<span class="cnc-pill cnc-pill--ok">Cumple</span>';
  if (valor === 'NC') return '<span class="cnc-pill cnc-pill--bad">No cumple</span>';
  return '';
}

function celdaDia(r) {
  const fest = window.FestivosCO && window.FestivosCO.esFestivo(r.anio, r.mes, r.dia);
  if (fest) {
    return `<td class="td-dia td-dia--festivo" title="Día feriado">${r.dia}</td>`;
  }
  return `<td class="td-dia">${r.dia}</td>`;
}

function pintarTablaCalidadAgua(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const tr = document.createElement('tr');
    const fechaTxt = fechaCorta(r);
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaTxt)}</td>
      <td>${escapeHTML(d.hora_muestreo || '')}</td>
      <td>${escapeHTML(d.punto_muestreo || '')}</td>
      <td class="num">${d.pH && d.pH.valor != null ? d.pH.valor : ''}</td>
      <td>${cncCell(d.pH && d.pH.resultado)}</td>
      <td class="num">${d.cloro && d.cloro.valor != null ? d.cloro.valor : ''}</td>
      <td>${cncCell(d.cloro && d.cloro.resultado)}</td>
      <td>${cncCell(d.olor)}</td>
      <td>${cncCell(d.color)}</td>
      <td>${cncCell(d.sabor)}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function fechaCorta(r) {
  return new Date(r.anio, r.mes - 1, r.dia).toLocaleDateString('es-CO', {
    weekday: 'short', day: '2-digit', month: 'long'
  });
}

function pintarTablaTemperatura(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const tipo = d.tipoEquipo === 'refrigeracion' ? 'Refrigeración' : (d.tipoEquipo === 'congelacion' ? 'Congelación' : '');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td>${escapeHTML(tipo)}</td>
      <td>${escapeHTML(d.hora1 || '')}</td>
      <td class="num">${d.temp1 != null && !isNaN(d.temp1) ? d.temp1 + ' °C' : ''}</td>
      <td>${cncCell(d.resultado1)}</td>
      <td>${escapeHTML(d.hora2 || '')}</td>
      <td class="num">${d.temp2 != null && !isNaN(d.temp2) ? d.temp2 + ' °C' : ''}</td>
      <td>${cncCell(d.resultado2)}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaPlagas(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const areas = Array.isArray(d.areas) ? d.areas.join(', ') : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td>${escapeHTML(areas)}</td>
      <td>${escapeHTML(d.tipoControl || '')}</td>
      <td>${escapeHTML(d.novedad || '')}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaResiduos(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const org = Number(d.organicos) || 0, apr = Number(d.aprovechables) || 0, noa = Number(d.noAprovechables) || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td class="num">${org}</td>
      <td class="num">${apr}</td>
      <td class="num">${noa}</td>
      <td class="num"><strong>${org + apr + noa}</strong></td>
      <td>${escapeHTML(d.fechaEvacuacion || '')}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaLimpiezaSalon(registros, tbody) {
  // Mapa nombre → producto (sacado del catálogo del formato actual)
  const mapaProd = {};
  if (formatoActual && Array.isArray(formatoActual.areas)) {
    formatoActual.areas.forEach(a => { mapaProd[a.nombre] = a.producto; });
  }

  registros.forEach(r => {
    const d = r.datos || {};
    let lista = [];
    if (Array.isArray(d.areas)) lista = d.areas.map(n => ({ nombre: n, producto: mapaProd[n] || '?' }));
    else if (d.areas && typeof d.areas === 'object') lista = Object.entries(d.areas).map(([n, p]) => ({ nombre: n, producto: p }));

    const areasTxt = lista
      .map(a => `<span class="badge-area">${escapeHTML(a.nombre)} <strong>[${a.producto}]</strong></span>`)
      .join(' ');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td>${escapeHTML(d.tipoLimpieza || '')}</td>
      <td>${areasTxt}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaLimpiezaBano(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const areas = Array.isArray(d.areas) ? d.areas.join(', ') : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td>${escapeHTML(d.tipoLimpieza || '')}</td>
      <td>${escapeHTML(areas)}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaLimpiezaCT(registros, tbody) {
  registros.forEach(r => {
    const d = r.datos || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      ${celdaDia(r)}
      <td>${escapeHTML(fechaCorta(r))}</td>
      <td>${escapeHTML(Array.isArray(d.equipos) ? d.equipos.join(', ') : '')}</td>
      <td>${escapeHTML(d.hora || '')}</td>
      <td>${escapeHTML(d.desinfectante || '')}</td>
      <td class="num">${d.cantidadAgua != null ? d.cantidadAgua + ' L' : ''}</td>
      <td class="num">${d.cantidadProducto != null ? d.cantidadProducto + ' mL' : ''}</td>
      <td>${escapeHTML(r.observaciones || '')}</td>
      <td>${escapeHTML(r.responsable || '')}</td>
    `;
    tbody.appendChild(tr);
  });
}

function pintarTablaRecepcion(registros, tbody) {
  registros.forEach(r => {
    const items = (r.datos && Array.isArray(r.datos.items)) ? r.datos.items : [];
    const filas = items.length > 0 ? items : [{}];
    filas.forEach((it, idx) => {
      const tr = document.createElement('tr');
      const diaCell = idx === 0 ? celdaDia(r) : '<td></td>';
      const fechaCell = idx === 0 ? `<td>${escapeHTML(fechaCorta(r))}</td>` : '<td></td>';
      const decision = it.decision || '';
      const decisionHTML = decision === 'Acepta'
        ? '<span class="cnc-pill cnc-pill--ok">Acepta</span>'
        : (decision === 'Rechaza' ? '<span class="cnc-pill cnc-pill--bad">Rechaza</span>' : '');
      tr.innerHTML = `
        ${diaCell}
        ${fechaCell}
        <td>${escapeHTML(it.proveedor || '')}</td>
        <td>${escapeHTML(it.producto || '')}</td>
        <td class="num">${it.cantidad != null ? it.cantidad : ''}</td>
        <td class="num">${it.temperatura != null ? it.temperatura + ' °C' : ''}</td>
        <td>${escapeHTML(it.lote || '')}</td>
        <td>${escapeHTML(it.fechaVencimiento || '')}</td>
        <td>${cncCell(it.color)}</td>
        <td>${cncCell(it.olor)}</td>
        <td>${cncCell(it.apariencia)}</td>
        <td>${cncCell(it.empaque)}</td>
        <td>${decisionHTML}</td>
        <td>${escapeHTML(it.observaciones || '')}</td>
        <td>${idx === 0 ? escapeHTML(r.responsable || '') : ''}</td>
      `;
      if (idx > 0) tr.classList.add('fila-item-extra');
      tbody.appendChild(tr);
    });
  });
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

  const fId = formatoActual && formatoActual.id;

  if (fId === 'calidad_agua') {
    tabla.classList.add('tabla-registros--calidad-agua');
    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Día</th><th>Fecha</th><th>Hora</th><th>Punto de muestreo</th>
          <th>pH</th><th>pH</th><th>Cloro (mg/L)</th><th>Cloro</th>
          <th>Olor</th><th>Color</th><th>Sabor</th><th>Observaciones</th><th>Responsable</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    pintarTablaCalidadAgua(registros, tabla.querySelector('tbody'));
  } else if (fId === 'control_temperatura') {
    tabla.classList.add('tabla-registros--temperatura');
    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Día</th><th>Fecha</th><th>Tipo equipo</th>
          <th>Hora 1</th><th>T°C 1</th><th>C/NC</th>
          <th>Hora 2</th><th>T°C 2</th><th>C/NC</th>
          <th>Observaciones</th><th>Responsable</th>
        </tr>
      </thead><tbody></tbody>
    `;
    pintarTablaTemperatura(registros, tabla.querySelector('tbody'));
  } else if (fId === 'control_plagas') {
    tabla.classList.add('tabla-registros--plagas');
    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Día</th><th>Fecha</th><th>Áreas inspeccionadas</th>
          <th>Tipo control</th><th>Novedad</th>
          <th>Observaciones</th><th>Responsable</th>
        </tr>
      </thead><tbody></tbody>
    `;
    pintarTablaPlagas(registros, tabla.querySelector('tbody'));
  } else if (fId === 'manejo_residuos') {
    tabla.classList.add('tabla-registros--residuos');
    tabla.innerHTML = `
      <thead>
        <tr>
          <th>Día</th><th>Fecha</th>
          <th>Orgánicos</th><th>Aprovechables</th><th>No aprov.</th><th>Total</th>
          <th>Fecha evacuación</th><th>Observaciones</th><th>Responsable</th>
        </tr>
      </thead><tbody></tbody>
    `;
    pintarTablaResiduos(registros, tabla.querySelector('tbody'));
  } else if (fId === 'limpieza_salon') {
    tabla.classList.add('tabla-registros--limpieza-salon');
    tabla.innerHTML = `
      <thead><tr>
        <th>Día</th><th>Fecha</th><th>Tipo</th><th>Áreas + producto</th>
        <th>Observaciones</th><th>Responsable</th>
      </tr></thead><tbody></tbody>
    `;
    pintarTablaLimpiezaSalon(registros, tabla.querySelector('tbody'));
  } else if (fId === 'limpieza_bano') {
    tabla.classList.add('tabla-registros--limpieza-bano');
    tabla.innerHTML = `
      <thead><tr>
        <th>Día</th><th>Fecha</th><th>Tipo</th><th>Áreas limpiadas</th>
        <th>Observaciones</th><th>Responsable</th>
      </tr></thead><tbody></tbody>
    `;
    pintarTablaLimpiezaBano(registros, tabla.querySelector('tbody'));
  } else if (fId === 'limpieza_campana_trampa') {
    tabla.classList.add('tabla-registros--limpieza-ct');
    tabla.innerHTML = `
      <thead><tr>
        <th>Día</th><th>Fecha</th><th>Equipo(s)</th><th>Hora</th>
        <th>Desinfectante</th><th>Agua</th><th>Producto</th>
        <th>Observaciones</th><th>Responsable</th>
      </tr></thead><tbody></tbody>
    `;
    pintarTablaLimpiezaCT(registros, tabla.querySelector('tbody'));
  } else if (fId === 'recepcion_materias_primas') {
    tabla.classList.add('tabla-registros--recepcion');
    tabla.innerHTML = `
      <thead><tr>
        <th>Día</th><th>Fecha</th><th>Proveedor</th><th>Producto</th>
        <th>Cant. (Kg)</th><th>T (°C)</th><th>Lote</th><th>Vencimiento</th>
        <th>Color</th><th>Olor</th><th>Apariencia</th><th>Empaque</th>
        <th>Decisión</th><th>Obs. ítem</th><th>Responsable</th>
      </tr></thead><tbody></tbody>
    `;
    pintarTablaRecepcion(registros, tabla.querySelector('tbody'));
  } else {
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
        ${celdaDia(r)}
        <td>${escapeHTML(fechaTxt)}</td>
        <td>${escapeHTML(r.responsable || '')}</td>
        <td>${escapeHTML(r.observaciones || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  contenedorTabla.innerHTML = '';
  contenedorTabla.appendChild(tabla);

  const sufijo = esMesActual ? ' (mes en curso)' : ' (mes anterior)';
  historialInfoTexto.textContent = `${registros.length} registro(s) en ${MESES_LARGOS[mes - 1]} ${anio}${sufijo}.`;
}

let peticionHistorial = 0;

async function cargarHistorial(anio, mes) {
  const miPeticion = ++peticionHistorial;
  estadoHistorial.textContent = 'Cargando...';
  contenedorTabla.innerHTML = '';
  contenedorTabla.appendChild(estadoHistorial);

  try {
    const r = await fetch(`/api/registros/historial/${encodeURIComponent(formatoId)}?carpeta=${encodeURIComponent(carpetaId)}&anio=${anio}&mes=${mes}`);
    if (miPeticion !== peticionHistorial) return; // el usuario ya cambio de mes, esta respuesta llego tarde
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
      if (miPeticion !== peticionHistorial) return;
      estadoHistorial.textContent = d.error || 'Error cargando registros';
      return;
    }
    const data = await r.json();
    if (miPeticion !== peticionHistorial) return;
    pintarTabla(data.registros, data.anio, data.mes, data.esMesActual);
  } catch (err) {
    if (miPeticion !== peticionHistorial) return;
    estadoHistorial.textContent = 'no hay conexion';
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
      modalError.textContent = 'no hay conexion';
      modalError.hidden = false;
    }
  });
});

btnDescargar.addEventListener('click', async () => {
  btnDescargar.disabled = true;
  const textoOriginal = btnDescargar.textContent;
  btnDescargar.textContent = 'Preparando...';

  try {
    const r = await fetch(`/api/registros/excel`);
    if (r.status === 404) {
      alert('No hay registros guardados todavía.');
      return;
    }
    if (!r.ok) {
      alert('Error descargando el archivo.');
      return;
    }
    const blob = await r.blob();
    const disposicion = r.headers.get('Content-Disposition') || '';
    const m = disposicion.match(/filename="?([^"]+)"?/);
    const nombre = m ? m[1] : `registros.xlsx`;

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
  window.location.href = `/formato.html?id=${encodeURIComponent(formatoId)}&carpeta=${encodeURIComponent(carpetaId)}`;
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

    const rFormato = await fetch(`/api/formatos/${encodeURIComponent(formatoId)}?carpeta=${encodeURIComponent(carpetaId)}`);
    if (!rFormato.ok) {
      const d = await rFormato.json();
      document.body.innerHTML = `<p style="padding:2rem;color:#b91c1c">${d.error || 'No se pudo cargar el formato'}</p>`;
      return;
    }
    const dF = await rFormato.json();
    formatoActual = dF.formato;
    tituloEl.textContent = `Registros — ${formatoActual.numero}. ${formatoActual.nombre}`;
    subtituloEl.textContent = 'Los empleados solo ven el mes en curso. Los meses anteriores requieren contraseña de administrador.';

    const rMeses = await fetch(`/api/registros/meses/${encodeURIComponent(formatoId)}?carpeta=${encodeURIComponent(carpetaId)}`);
    const dMeses = await rMeses.json();
    pintarOpcionesMes(dMeses.meses || []);

    cargarHistorial(mesActualAnio, mesActualMes);
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando la pantalla.</p>';
  }
}

iniciar();
