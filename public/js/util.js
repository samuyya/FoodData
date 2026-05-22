async function conBotonCargando(boton, textoCargando, accion) {
  if (!boton) return accion();
  const textoOriginal = boton.textContent;
  const estabaDeshabilitado = boton.disabled;
  boton.disabled = true;
  boton.textContent = textoCargando;
  try {
    return await accion();
  } finally {
    boton.textContent = textoOriginal;
    boton.disabled = estabaDeshabilitado;
  }
}

(function configurarPWA() {
  function agregarMeta(name, content) {
    if (document.querySelector(`meta[name="${name}"]`)) return;
    const m = document.createElement('meta');
    m.name = name;
    m.content = content;
    document.head.appendChild(m);
  }
  function agregarLink(rel, href) {
    if (document.querySelector(`link[rel="${rel}"]`)) return;
    const l = document.createElement('link');
    l.rel = rel;
    l.href = href;
    document.head.appendChild(l);
  }

  agregarLink('manifest', '/manifest.json');
  agregarLink('apple-touch-icon', '/img/icon-fooddata.png');
  agregarMeta('theme-color', '#16c2a3');
  agregarMeta('apple-mobile-web-app-capable', 'yes');
  agregarMeta('apple-mobile-web-app-title', 'FoodData');
  agregarMeta('apple-mobile-web-app-status-bar-style', 'default');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
