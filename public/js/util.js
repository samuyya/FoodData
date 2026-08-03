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

// focus trap global: cuando un modal-backdrop esta visible, el tab no se sale
// de el. se cierra con Esc (lo maneja cada pagina) y restaura el foco al elemento
// que lo abrio cuando se cierra.
(function focusTrapModales() {
  const Q_FOCUSABLES = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let ultimoFocoFuera = null;

  function modalVisible() {
    return Array.from(document.querySelectorAll('.modal-backdrop')).find(m => !m.hidden);
  }

  // cuando un modal se vuelve visible, lleva el foco adentro
  const observador = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.attributeName === 'hidden' && m.target.classList.contains('modal-backdrop')) {
        if (!m.target.hidden) {
          ultimoFocoFuera = document.activeElement;
          const dentro = m.target.querySelectorAll(Q_FOCUSABLES);
          if (dentro.length > 0) setTimeout(() => dentro[0].focus(), 0);
        } else if (ultimoFocoFuera) {
          ultimoFocoFuera.focus();
          ultimoFocoFuera = null;
        }
      }
    }
  });
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    observador.observe(m, { attributes: true, attributeFilter: ['hidden'] });
  });

  // tab no sale del modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const modal = modalVisible();
    if (!modal) return;
    const focusables = Array.from(modal.querySelectorAll(Q_FOCUSABLES)).filter(el => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const primero = focusables[0];
    const ultimo  = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  });
})();

// inyecta un skip-link al inicio del body (sale solo con foco de teclado)
(function inyectarSkipLink() {
  if (document.querySelector('.skip-link')) return;
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'main';
  const a = document.createElement('a');
  a.className = 'skip-link';
  a.href = '#' + main.id;
  a.textContent = 'Saltar al contenido';
  document.body.insertBefore(a, document.body.firstChild);
})();

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
