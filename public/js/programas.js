// =============================================================================
//  Catálogo de los 11 programas del Plan de Saneamiento Básico
//  Tomado de "INFORMACION ADMINISTRADOR_CARPETA SANIDAD.docx" — punto 2.
// =============================================================================
const PROGRAMAS = [
  {
    numero: 1,
    titulo: 'Programa de Limpieza y Desinfección',
    icono: '🧽',
    color: 'turquesa',
    descripcion: 'Define los procedimientos, productos y frecuencias de limpieza y desinfección de las áreas del establecimiento (cocina y salón). Incluye las fichas técnicas de los químicos y la tabla de dilución de desinfectantes.',
    documentos: [
      'Fichas técnicas de los productos químicos',
      'Formatos de limpieza y desinfección: cocina y salón',
      'Tabla de dilución de desinfectantes (visible al personal)',
      'Instructivo de lavado de manos (visible)'
    ]
  },
  {
    numero: 2,
    titulo: 'Programa de Residuos Sólidos y Líquidos',
    icono: '🗑️',
    color: 'verde',
    descripcion: 'Establece la gestión, clasificación y disposición final de los residuos generados en el establecimiento (orgánicos, aprovechables y no aprovechables).',
    documentos: ['Formato de residuos']
  },
  {
    numero: 3,
    titulo: 'Programa de Control Integrado de Plagas',
    icono: '🐛',
    color: 'ambar',
    descripcion: 'Procedimiento preventivo y correctivo para evitar la presencia de plagas. Incluye la información de la empresa externa de control y los certificados de aplicación.',
    documentos: [
      'Formato de verificación de plagas (semanal)',
      'Diagnóstico de la empresa externa',
      'Fichas técnicas de los productos aplicados',
      'Certificados de los técnicos aplicadores'
    ]
  },
  {
    numero: 4,
    titulo: 'Programa de Agua Potable',
    icono: '💧',
    color: 'azul',
    descripcion: 'Garantiza la calidad del agua usada en la preparación de alimentos mediante mediciones periódicas de pH y cloro residual.',
    documentos: [
      'Formato de verificación de pH y cloro',
      'Kit para medir pH y cloro (pastillas)'
    ]
  },
  {
    numero: 5,
    titulo: 'Programa de Capacitaciones',
    icono: '🎓',
    color: 'morado',
    descripcion: 'Plan anual de formación del personal manipulador en BPM, higiene, manejo de alimentos y salud ocupacional.',
    documentos: [
      'Cronograma de capacitaciones del año',
      'Certificados de capacitaciones con sus evaluaciones',
      'Afiche de Buenas Prácticas Higiénicas del personal',
      'Examen médico del personal',
      'Carnet de manipulación del personal'
    ]
  },
  {
    numero: 6,
    titulo: 'Programa de Mantenimiento y Calibración',
    icono: '🔧',
    color: 'gris-azul',
    descripcion: 'Asegura el correcto funcionamiento de los equipos y la exactitud de los instrumentos de medición.',
    documentos: [
      'Hojas de vida de los equipos',
      'Fichas técnicas de equipos',
      'Cronograma de calibración y mantenimiento',
      'Certificados de calibración de termómetro y balanzas'
    ]
  },
  {
    numero: 7,
    titulo: 'Programa de Trazabilidad',
    icono: '📋',
    color: 'turquesa',
    descripcion: 'Permite seguir el rastro de las materias primas y verificar las temperaturas de almacenamiento en los equipos de frío.',
    documentos: [
      'Formato de recepción de materias primas',
      'Formato de verificación de temperatura de equipos de frío',
      'Termómetro digital calibrado'
    ]
  },
  {
    numero: 8,
    titulo: 'Programa de Proveedores',
    icono: '🚚',
    color: 'ambar',
    descripcion: 'Define los criterios de selección, aceptación y rechazo de proveedores y materias primas.',
    documentos: [
      'Especificaciones técnicas de aceptación y rechazo',
      'Listado de proveedores'
    ]
  },
  {
    numero: 9,
    titulo: 'Programa de Muestreo',
    icono: '🧪',
    color: 'verde',
    descripcion: 'Programa de muestreo microbiológico de superficies, manipuladores y alimentos para verificar la efectividad de la limpieza.',
    documentos: [
      'Cronograma de muestreo del año',
      'Resultados de muestreo mensual'
    ]
  },
  {
    numero: 10,
    titulo: 'Programa de PQRS',
    icono: '📞',
    color: 'morado',
    descripcion: 'Sistema de Peticiones, Quejas, Reclamos y Sugerencias de los clientes. Facilita la mejora continua del servicio.',
    documentos: []
  },
  {
    numero: 11,
    titulo: 'Programa de Recall',
    icono: '⚠️',
    color: 'rojo',
    descripcion: 'Procedimiento de retiro inmediato de productos del mercado cuando se detecta un problema de inocuidad o calidad.',
    documentos: []
  }
];

// =============================================================================
//  Elementos
// =============================================================================
const logoEl = document.getElementById('logo-empresa');
const logoPlaceholder = document.getElementById('logo-placeholder');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const listaEl = document.getElementById('lista-programas');
const btnVolver = document.getElementById('btn-volver');

const modal = document.getElementById('modal-programa');
const mpNumero = document.getElementById('mp-numero');
const mpIcono = document.getElementById('mp-icono');
const mpTitulo = document.getElementById('mp-titulo');
const mpDescripcion = document.getElementById('mp-descripcion');
const mpDocs = document.getElementById('mp-docs');
const mpCerrar = document.getElementById('mp-cerrar');
const mpCerrarBtn = document.getElementById('mp-cerrar-btn');

// =============================================================================
//  Renderizado
// =============================================================================
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

function pintarProgramas() {
  listaEl.innerHTML = '';
  PROGRAMAS.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = `programa-card programa-card--${p.color}`;
    li.style.animationDelay = (i * 40) + 'ms';
    li.innerHTML = `
      <div class="programa-card-numero">${p.numero}</div>
      <div class="programa-card-icono">${p.icono}</div>
      <h3 class="programa-card-titulo">${escapeHTML(p.titulo)}</h3>
      <span class="programa-card-flecha">Ver detalle ›</span>
    `;
    li.addEventListener('click', () => abrirModal(p));
    listaEl.appendChild(li);
  });
}

function abrirModal(programa) {
  mpNumero.textContent = programa.numero;
  mpIcono.textContent = programa.icono;
  mpTitulo.textContent = programa.titulo;
  mpDescripcion.textContent = programa.descripcion;

  mpDocs.innerHTML = '';
  if (programa.documentos.length === 0) {
    const li = document.createElement('li');
    li.className = 'modal-programa-doc-vacio';
    li.textContent = 'Sin documentos asociados todavía.';
    mpDocs.appendChild(li);
  } else {
    programa.documentos.forEach(d => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="modal-programa-doc-icono">📄</span> ${escapeHTML(d)}`;
      mpDocs.appendChild(li);
    });
  }

  // Color de marca según el programa
  modal.querySelector('.modal-programa').dataset.color = programa.color;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

mpCerrar.addEventListener('click', cerrarModal);
mpCerrarBtn.addEventListener('click', cerrarModal);
modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) cerrarModal(); });

btnVolver.addEventListener('click', () => { window.location.href = '/menu.html'; });

// =============================================================================
//  Boot
// =============================================================================
async function iniciar() {
  try {
    const rMe = await fetch('/api/auth/me');
    if (rMe.status === 401) { window.location.href = '/'; return; }
    const me = await rMe.json();
    if (me.rol !== 'empleado') { window.location.href = '/'; return; }
    pintarHeader(me.empresa);
    pintarProgramas();
  } catch (err) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Error cargando los programas. Recarga la página.</p>';
  }
}

iniciar();
