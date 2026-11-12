// panel "Hogares" del superadmin. solo se descarga despues de escribir el codigo secreto,
// y se dibuja debajo de "Crear empresa" con los estilos de siempre del dashboard
(function () {
  if (document.getElementById('panel-hogares')) { document.getElementById('panel-hogares').scrollIntoView({ block: 'start' }); return; }
  const API = '/api/superadmin/oculto';
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const sec = document.createElement('section');
  sec.className = 'card';
  sec.id = 'panel-hogares';
  sec.style.border = '1px solid #0e3a31';
  sec.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem;flex-wrap:wrap">' +
    '<h2 style="margin:0">🔒 Hogares</h2><button type="button" class="btn-secundario" id="ph-salir">Ocultar de nuevo</button></div>' +
    '<p class="ayuda">Cuentas familiares con solo el módulo de la despensa. No aparecen en la lista de empresas y ningún cliente las ve.</p>' +
    '<ul id="ph-lista" class="lista-empresas" style="list-style:none;padding:0;margin:0 0 1rem"></ul>' +
    '<h3 style="margin:.5rem 0">Crear hogar</h3>' +
    '<form id="ph-form" class="form" novalidate>' +
    '<label class="campo"><span>Nombre del hogar</span><input name="nombre" type="text" maxlength="60" placeholder="Casa de mamá" required></label>' +
    '<label class="campo"><span>Correo para entrar</span><input name="email" type="email" placeholder="familia@correo.com" required></label>' +
    '<label class="campo"><span>Contraseña</span><input name="password" type="password" minlength="8" placeholder="Mínimo 8 caracteres" required autocomplete="new-password"></label>' +
    '<label class="campo"><span>Foto de portada (png, jpg o webp, máx. 2 MB)</span><input name="foto" type="file" accept="image/png,image/jpeg,image/webp"></label>' +
    '<button type="submit" class="btn-primario">Crear hogar</button><p class="mensaje" id="ph-msg" hidden></p></form>';

  const ancla = document.getElementById('form-empresa');
  const tarjeta = ancla ? ancla.closest('section') : null;
  if (tarjeta && tarjeta.parentNode) tarjeta.parentNode.insertBefore(sec, tarjeta.nextSibling);
  else document.querySelector('main').prepend(sec);
  sec.scrollIntoView({ block: 'start' });

  const msg = (t, error) => { const p = document.getElementById('ph-msg'); p.textContent = t; p.hidden = !t; p.className = 'mensaje ' + (error ? 'mensaje-error' : 'mensaje-exito'); p.style.color = error ? '#b91c1c' : '#15803d'; };

  async function pedir(ruta, op) {
    const r = await fetch(API + ruta, Object.assign({ credentials: 'same-origin' }, op || {}));
    const d = await r.json().catch(() => ({}));
    if (r.status === 404) { sec.remove(); throw new Error('El acceso se cerró. Vuelve a escribir el código.'); }
    if (!r.ok || d.ok === false) throw new Error(d.error || 'Algo salió mal, intenta de nuevo.');
    return d;
  }

  async function listar() {
    const d = await pedir('/hogares');
    const ul = document.getElementById('ph-lista');
    ul.innerHTML = d.hogares.length ? d.hogares.map(h =>
      '<li data-id="' + h.id + '" style="display:grid;grid-template-columns:84px minmax(0,1fr);gap:.8rem;align-items:center;padding:.7rem 0;border-bottom:1px solid #e5e7eb">' +
      (h.foto ? '<img src="' + esc(h.foto) + '" alt="" style="width:84px;height:56px;object-fit:cover;border-radius:8px">' : '<span style="width:84px;height:56px;border-radius:8px;background:#ecf9f5;display:grid;place-items:center;font-size:.75rem;color:#4b5563">Sin foto</span>') +
      '<div style="min-width:0"><b>' + esc(h.nombre) + '</b> <span class="menu-badge ' + (h.activa ? 'menu-badge--ok' : '') + '">' + (h.activa ? 'Activo' : 'Desactivado') + '</span><br><small style="color:#6b7280">' + esc(h.email) + '</small>' +
      '<div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem">' +
      '<button type="button" class="btn-secundario" data-ph="activa" data-v="' + (!h.activa) + '">' + (h.activa ? 'Desactivar' : 'Activar') + '</button>' +
      '<button type="button" class="btn-secundario" data-ph="clave">Cambiar contraseña</button>' +
      '<label class="btn-secundario" style="cursor:pointer">Cambiar foto<input type="file" data-ph="foto" accept="image/png,image/jpeg,image/webp" hidden></label>' +
      (h.activa ? '' : '<button type="button" class="btn-secundario" data-ph="borrar" style="color:#b91c1c">Eliminar</button>') +
      '</div><div data-ph-extra></div></div></li>').join('') : '<li style="color:#6b7280;padding:.5rem 0">Todavía no hay hogares.</li>';
  }

  sec.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ph]');
    if (e.target.id === 'ph-salir') {
      await fetch(API + '/salir', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      sec.remove();
      return;
    }
    if (!b || b.tagName === 'INPUT') return;
    const li = b.closest('li'), id = li.dataset.id, extra = li.querySelector('[data-ph-extra]');
    try {
      if (b.dataset.ph === 'activa') {
        const fd = new FormData(); fd.append('activa', b.dataset.v);
        await pedir('/hogares/' + id, { method: 'PUT', body: fd });
        await listar();
      } else if (b.dataset.ph === 'clave') {
        extra.innerHTML = '<form data-ph-form="clave" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem"><input type="password" name="password" minlength="8" placeholder="Nueva contraseña" autocomplete="new-password" style="padding:.5rem;border:1px solid #d8e7e1;border-radius:8px"><button class="btn-primario" type="submit">Guardar</button><small data-ph-err style="color:#b91c1c;width:100%"></small></form>';
        extra.querySelector('input').focus();
      } else if (b.dataset.ph === 'borrar') {
        extra.innerHTML = '<form data-ph-form="borrar" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem"><input type="text" name="confirmacion" placeholder="Escribe el nombre exacto" style="padding:.5rem;border:1px solid #d8e7e1;border-radius:8px"><button class="btn-primario" type="submit" style="background:#b91c1c">Eliminar para siempre</button><small style="width:100%;color:#6b7280">Se borran la despensa, las recetas y la lista de compras de este hogar. No se puede deshacer.</small><small data-ph-err style="color:#b91c1c;width:100%"></small></form>';
        extra.querySelector('input').focus();
      }
    } catch (err) { msg(err.message, true); }
  });

  sec.addEventListener('change', async (e) => {
    if (e.target.dataset.ph !== 'foto' || !e.target.files[0]) return;
    const id = e.target.closest('li').dataset.id;
    const fd = new FormData(); fd.append('foto', e.target.files[0]);
    try { await pedir('/hogares/' + id, { method: 'PUT', body: fd }); await listar(); msg('Foto actualizada.'); } catch (err) { msg(err.message, true); }
  });

  sec.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'ph-form') {
      const fd = new FormData(f);
      if (!String(fd.get('nombre')).trim()) return msg('Escribe el nombre del hogar.', true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fd.get('email')).trim())) return msg('Escribe un correo válido.', true);
      if (String(fd.get('password')).length < 8) return msg('La contraseña debe tener al menos 8 caracteres.', true);
      const foto = fd.get('foto'); if (foto && !foto.size) fd.delete('foto');
      try { await pedir('/hogares', { method: 'POST', body: fd }); f.reset(); await listar(); msg('Hogar creado. Ya puede entrar con su correo y contraseña.'); } catch (err) { msg(err.message, true); }
      return;
    }
    const li = f.closest('li'), id = li.dataset.id, err = f.querySelector('[data-ph-err]');
    try {
      if (f.dataset.phForm === 'clave') {
        const p = f.password.value;
        if (p.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
        const fd = new FormData(); fd.append('password', p);
        await pedir('/hogares/' + id, { method: 'PUT', body: fd });
        await listar(); msg('Contraseña cambiada.');
      } else if (f.dataset.phForm === 'borrar') {
        await pedir('/hogares/' + id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmacion: f.confirmacion.value }) });
        await listar(); msg('Hogar eliminado.');
      }
    } catch (x) { err.textContent = x.message; }
  });

  listar().catch(err => msg(err.message, true));
})();
