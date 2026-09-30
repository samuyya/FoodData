const anioActualEl = document.getElementById('anio-actual');
if (anioActualEl) anioActualEl.textContent = new Date().getFullYear();

const formContacto = document.getElementById('form-contacto');
const msgContacto = document.getElementById('msg-contacto');

formContacto.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgContacto.hidden = true;

  const datos = Object.fromEntries(new FormData(formContacto).entries());
  const boton = formContacto.querySelector('button[type="submit"]');
  boton.disabled = true;

  try {
    const r = await fetch('/api/contacto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    const data = await r.json();

    if (data.ok) {
      formContacto.reset();
      msgContacto.textContent = '¡Listo! Te vamos a contactar pronto.';
      msgContacto.className = 'mensaje mensaje-ok';
    } else {
      msgContacto.textContent = data.error || 'No se pudo enviar el mensaje, intenta de nuevo.';
      msgContacto.className = 'mensaje mensaje-error';
    }
  } catch {
    msgContacto.textContent = 'No hay conexión, intenta de nuevo.';
    msgContacto.className = 'mensaje mensaje-error';
  }

  msgContacto.hidden = false;
  boton.disabled = false;
});
