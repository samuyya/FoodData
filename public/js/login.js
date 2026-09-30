const form = document.getElementById('form-login');
const msgError = document.getElementById('msg-error');

const btnSubmit = form.querySelector('button[type="submit"]');

// recuerda el correo en este dispositivo -- para no obligar a cada empleado
// a memorizar/escribir el correo compartido de la empresa cada vez, la
// contraseña sigue pidiendose siempre
const CORREO_GUARDADO = 'fd_correo_recordado';
try {
  const correoGuardado = localStorage.getItem(CORREO_GUARDADO);
  if (correoGuardado) {
    form.email.value = correoGuardado;
    form.password.focus();
  }
} catch {}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgError.hidden = true;

  const datos = {
    email: form.email.value.trim(),
    password: form.password.value
  };

  await conBotonCargando(btnSubmit, 'Ingresando...', async () => {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      });
      const data = await r.json();
      if (!r.ok) {
        msgError.textContent = data.error || 'Error al iniciar sesión';
        msgError.hidden = false;
        return;
      }
      try { localStorage.setItem(CORREO_GUARDADO, datos.email); } catch {}
      window.location.href = data.redirect || '/menu.html';
    } catch (err) {
      msgError.textContent = 'No se pudo conectar con el servidor';
      msgError.hidden = false;
    }
  });
});
