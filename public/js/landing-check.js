// si este dispositivo ya inicio sesion antes (ver login.js), directo al login
// en vez de mostrarle la presentacion de nuevo -- va en el <head>, antes de que
// se pinte la pagina, para que no se alcance a ver la landing ni un instante
try {
  if (localStorage.getItem('fd_correo_recordado')) {
    window.location.replace('/index.html');
  }
} catch {}
