const logoEl = document.getElementById('logo-empresa');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const btnVolver = document.getElementById('btn-volver');
const btnRegistro = document.getElementById('btn-registro');
const logoPlaceholder = document.getElementById('logo-placeholder');

const pasoSeleccion = document.getElementById('paso-seleccion');
const pasoCamara = document.getElementById('paso-camara');
const pasoResultado = document.getElementById('paso-resultado');

const listaEmpleados = document.getElementById('lista-empleados-asistencia');
const nombreSeleccionado = document.getElementById('nombre-seleccionado');
const estadoEmpleado = document.getElementById('estado-empleado');

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const msgAsistencia = document.getElementById('msg-asistencia');

const btnTomar = document.getElementById('btn-tomar');
const btnRepetir = document.getElementById('btn-repetir');
const btnConfirmar = document.getElementById('btn-confirmar');
const btnCancelarCamara = document.getElementById('btn-cancelar-camara');

const resultadoBanner = document.getElementById('resultado-banner');
const btnOtro = document.getElementById('btn-otro');

let empleadoActual = null;
let stream = null;
let peticionCamara = 0;

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

function mostrarPaso(paso) {
  pasoSeleccion.hidden = paso !== 'seleccion';
  pasoCamara.hidden = paso !== 'camara';
  pasoResultado.hidden = paso !== 'resultado';
}

function mostrarMsg(texto, esError = true) {
  msgAsistencia.textContent = texto;
  msgAsistencia.className = 'mensaje ' + (esError ? 'mensaje-error' : 'mensaje-ok');
  msgAsistencia.hidden = false;
}

function horaTexto(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function detenerCamara() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

async function cargarEmpleados() {
  const r = await fetch('/api/asistencia/empleados');
  const data = await r.json();
  listaEmpleados.innerHTML = '';
  if (!data.empleados || data.empleados.length === 0) {
    const li = document.createElement('li');
    li.className = 'empleado-vacio';
    li.textContent = 'No hay empleados registrados. El administrador debe registrarlos en el Formato 3.';
    listaEmpleados.appendChild(li);
    return;
  }
  data.empleados.forEach(emp => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton-empleado';
    btn.textContent = emp.nombre;
    btn.addEventListener('click', () => seleccionarEmpleado(emp));
    li.appendChild(btn);
    listaEmpleados.appendChild(li);
  });
}

async function seleccionarEmpleado(emp) {
  empleadoActual = emp;
  msgAsistencia.hidden = true;

  try {
    const r = await fetch(`/api/asistencia/estado/${encodeURIComponent(emp._id)}`);
    const data = await r.json();

    if (data.estado === 'completo') {
      resultadoBanner.className = 'banner banner-warning';
      resultadoBanner.innerHTML = `⚠️ <strong>${escapeHTML(emp.nombre)}</strong> ya registró entrada y salida hoy.`;
      mostrarPaso('resultado');
      return;
    }

    nombreSeleccionado.textContent = emp.nombre;
    if (data.estado === 'solo_ingreso') {
      const hora = data.registro && data.registro.horaIngreso ? horaTexto(data.registro.horaIngreso) : '';
      estadoEmpleado.textContent = `Ya marcaste tu ingreso a las ${hora}. Esta foto registrará tu hora de SALIDA.`;
    } else {
      estadoEmpleado.textContent = 'Aún no has marcado hoy. Esta foto registrará tu hora de INGRESO.';
    }

    mostrarPaso('camara');
    await iniciarCamara();
  } catch (err) {
    alert('Error de red al consultar el estado del empleado.');
  }
}

async function iniciarCamara() {
  const miPeticion = ++peticionCamara;
  detenerCamara(); // por si el usuario alcanzo a tocar dos empleados seguidos, no dejo la anterior prendida
  video.hidden = false;
  canvas.hidden = true;
  btnTomar.hidden = false;
  btnRepetir.hidden = true;
  btnConfirmar.hidden = true;
  msgAsistencia.hidden = true;
  try {
    const streamNuevo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    if (miPeticion !== peticionCamara) {
      // el usuario ya selecciono otro empleado mientras el navegador pedia permiso de camara
      streamNuevo.getTracks().forEach(t => t.stop());
      return;
    }
    stream = streamNuevo;
    video.srcObject = stream;
  } catch (err) {
    if (miPeticion !== peticionCamara) return;
    btnTomar.hidden = true;
    mostrarMsg('No se pudo abrir la cámara. Revisa que el navegador tenga permiso de cámara.');
  }
}

function tomarFoto() {
  const maxAncho = 800;
  const anchoBase = video.videoWidth || maxAncho;
  const altoBase = video.videoHeight || maxAncho;
  const escala = Math.min(1, maxAncho / anchoBase);
  canvas.width = Math.round(anchoBase * escala);
  canvas.height = Math.round(altoBase * escala);
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  video.hidden = true;
  canvas.hidden = false;
  btnTomar.hidden = true;
  btnRepetir.hidden = false;
  btnConfirmar.hidden = false;
}

function repetirFoto() {
  video.hidden = false;
  canvas.hidden = true;
  btnTomar.hidden = false;
  btnRepetir.hidden = true;
  btnConfirmar.hidden = true;
  msgAsistencia.hidden = true;
}

async function enviar(blob) {
  const fd = new FormData();
  fd.append('empleadoId', empleadoActual._id);
  fd.append('foto', blob, 'asistencia.jpg');

  await conBotonCargando(btnConfirmar, 'Registrando...', async () => {
    try {
      const r = await fetch('/api/asistencia/marcar', { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) {
        mostrarMsg(data.error || 'No se pudo registrar la asistencia.');
        return;
      }
      detenerCamara();
      const tipo = data.tipo === 'ingreso' ? 'Ingreso' : 'Salida';
      resultadoBanner.className = 'banner banner-info';
      resultadoBanner.innerHTML = `✅ <strong>${tipo} registrado</strong> para ${escapeHTML(empleadoActual.nombre)} a las ${horaTexto(data.hora)}.`;
      mostrarPaso('resultado');
    } catch (err) {
      mostrarMsg('Error de red al registrar la asistencia.');
    }
  });
}

btnTomar.addEventListener('click', tomarFoto);
btnRepetir.addEventListener('click', repetirFoto);

btnConfirmar.addEventListener('click', () => {
  canvas.toBlob((blob) => {
    if (!blob) {
      mostrarMsg('No se pudo procesar la foto, intenta de nuevo.');
      return;
    }
    enviar(blob);
  }, 'image/jpeg', 0.7);
});

btnCancelarCamara.addEventListener('click', () => {
  detenerCamara();
  mostrarPaso('seleccion');
});

btnOtro.addEventListener('click', () => {
  mostrarPaso('seleccion');
});

btnVolver.addEventListener('click', () => {
  detenerCamara();
  window.location.href = '/menu.html';
});

btnRegistro.addEventListener('click', () => {
  detenerCamara();
  window.location.href = '/registro-asistencia.html';
});

window.addEventListener('beforeunload', detenerCamara);

async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    await cargarEmpleados();
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando la página. Recarga.</p>';
  }
}

iniciar();
