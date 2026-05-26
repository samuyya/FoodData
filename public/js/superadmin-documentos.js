// 11 programas (mismo orden y titulos que en programas.js, pero solo lo basico)
const PROGRAMAS = [
  { numero: 1,  titulo: 'Limpieza y Desinfección',         icono: '🧽', color: 'turquesa' },
  { numero: 2,  titulo: 'Residuos Sólidos y Líquidos',     icono: '🗑️', color: 'verde' },
  { numero: 3,  titulo: 'Control Integrado de Plagas',     icono: '🐛', color: 'ambar' },
  { numero: 4,  titulo: 'Agua Potable',                    icono: '💧', color: 'azul' },
  { numero: 5,  titulo: 'Capacitaciones',                  icono: '🎓', color: 'morado' },
  { numero: 6,  titulo: 'Mantenimiento y Calibración',     icono: '🔧', color: 'gris-azul' },
  { numero: 7,  titulo: 'Trazabilidad',                    icono: '📋', color: 'turquesa' },
  { numero: 8,  titulo: 'Proveedores',                     icono: '🚚', color: 'ambar' },
  { numero: 9,  titulo: 'Muestreo',                        icono: '🧪', color: 'verde' },
  { numero: 10, titulo: 'PQRS',                            icono: '📞', color: 'morado' },
  { numero: 11, titulo: 'Recall',                          icono: '⚠️', color: 'rojo' }
];

const params = new URLSearchParams(window.location.search);
const empresaId = params.get('empresa');

const listaEl = document.getElementById('lista-programas-doc');
const nombreEmpresaEl = document.getElementById('nombre-empresa');
const btnVolver = document.getElementById('btn-volver');

btnVolver.addEventListener('click', () => { window.location.href = '/superadmin/dashboard.html'; });

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function pesoLegible(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function cargarEmpresa() {
  const r = await fetch(`/api/superadmin/empresas/${encodeURIComponent(empresaId)}`);
  if (!r.ok) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">No se pudo cargar la empresa</p>';
    return null;
  }
  const data = await r.json();
  return data.empresa;
}

async function cargarDocs(numero) {
  const r = await fetch(`/api/documentos/programa/${numero}?empresa_id=${encodeURIComponent(empresaId)}`);
  if (!r.ok) return [];
  const data = await r.json();
  return data.documentos || [];
}

function pintarListaDocs(contenedor, docs) {
  if (docs.length === 0) {
    contenedor.innerHTML = '<li class="doc-vacio">Sin documentos cargados todavía.</li>';
    return;
  }
  contenedor.innerHTML = docs.map(d => `
    <li class="doc-item" data-id="${d._id}">
      <div class="doc-info">
        <strong>📄 ${escapeHTML(d.nombreOriginal)}</strong>
        <span class="doc-meta">${pesoLegible(d.tamanoBytes)} · subido ${fechaCorta(d.createdAt)}</span>
        ${d.descripcion ? `<small class="doc-desc">${escapeHTML(d.descripcion)}</small>` : ''}
      </div>
      <div class="doc-acciones">
        <a href="/api/documentos/${d._id}/descargar" class="btn-secundario btn-pequeno" target="_blank">Descargar</a>
        <button type="button" class="btn-peligro btn-pequeno btn-borrar-doc" data-id="${d._id}">Borrar</button>
      </div>
    </li>
  `).join('');

  contenedor.querySelectorAll('.btn-borrar-doc').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (!confirm('¿Borrar este documento? No se puede deshacer.')) return;
      const r = await fetch(`/api/documentos/${id}`, { method: 'DELETE' });
      if (r.ok) {
        btn.closest('li').remove();
        if (contenedor.children.length === 0) {
          contenedor.innerHTML = '<li class="doc-vacio">Sin documentos cargados todavía.</li>';
        }
      } else {
        alert('No se pudo borrar');
      }
    });
  });
}

function pintarPrograma(p) {
  const li = document.createElement('li');
  li.className = `programa-doc programa-doc--${p.color}`;
  li.innerHTML = `
    <details class="programa-doc-det">
      <summary class="programa-doc-cab">
        <span class="programa-doc-num">${p.numero}</span>
        <span class="programa-doc-icono">${p.icono}</span>
        <span class="programa-doc-titulo">${escapeHTML(p.titulo)}</span>
        <span class="programa-doc-cant" id="cant-${p.numero}">—</span>
      </summary>
      <div class="programa-doc-cuerpo">
        <form class="programa-doc-form" data-num="${p.numero}" enctype="multipart/form-data">
          <label class="campo">
            <span>Archivo (máx 10MB — PDF, imagen, Word, Excel, txt)</span>
            <input type="file" name="archivo" required />
          </label>
          <label class="campo">
            <span>Descripción (opcional)</span>
            <input type="text" name="descripcion" maxlength="200" placeholder="Ej: Cronograma 2026 actualizado" />
          </label>
          <button type="submit" class="btn-primario btn-pequeno">📤 Subir documento</button>
          <p class="mensaje" hidden></p>
        </form>
        <ul class="lista-docs" id="docs-${p.numero}"></ul>
      </div>
    </details>
  `;
  listaEl.appendChild(li);

  const form = li.querySelector('form');
  const msg = li.querySelector('.mensaje');
  const ul = li.querySelector(`#docs-${p.numero}`);
  const cantEl = li.querySelector(`#cant-${p.numero}`);

  async function refrescar() {
    const docs = await cargarDocs(p.numero);
    pintarListaDocs(ul, docs);
    cantEl.textContent = docs.length === 0 ? 'sin docs' : `${docs.length} doc${docs.length === 1 ? '' : 's'}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const archivo = form.archivo.files[0];
    if (!archivo) {
      msg.textContent = 'Selecciona un archivo';
      msg.className = 'mensaje mensaje-error';
      msg.hidden = false;
      return;
    }
    const fd = new FormData();
    fd.append('archivo', archivo);
    fd.append('empresa_id', empresaId);
    if (form.descripcion.value.trim()) fd.append('descripcion', form.descripcion.value.trim());

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const txt = btn.textContent;
    btn.textContent = 'Subiendo...';
    try {
      const r = await fetch(`/api/documentos/programa/${p.numero}`, { method: 'POST', body: fd });
      const data = await r.json();
      if (!r.ok) {
        msg.textContent = data.error || 'No se pudo subir';
        msg.className = 'mensaje mensaje-error';
        msg.hidden = false;
        return;
      }
      msg.textContent = `✓ "${data.documento.nombreOriginal}" subido`;
      msg.className = 'mensaje mensaje-ok';
      msg.hidden = false;
      form.reset();
      await refrescar();
    } catch (err) {
      msg.textContent = 'Error de red';
      msg.className = 'mensaje mensaje-error';
      msg.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = txt;
    }
  });

  refrescar();
}

async function iniciar() {
  if (!empresaId) {
    document.body.innerHTML = '<p style="padding:2rem;color:#b91c1c">Falta empresa en la URL</p>';
    return;
  }
  const rMe = await fetch('/api/auth/me');
  if (rMe.status === 401) { window.location.href = '/'; return; }
  const me = await rMe.json();
  if (me.rol !== 'superadmin') { window.location.href = '/'; return; }

  const empresa = await cargarEmpresa();
  if (!empresa) return;
  nombreEmpresaEl.textContent = empresa.nombre;

  PROGRAMAS.forEach(p => pintarPrograma(p));
}

iniciar();
