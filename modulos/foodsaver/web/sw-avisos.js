// lo importa el service worker de FoodData. solo muestra avisos y abre la pagina al tocarlos.
// siempre muestra algo al recibir un push: iOS cancela la suscripcion si llegan avisos silenciosos
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { texto: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Aviso', {
    body: d.texto || '',
    icon: '/img/icon-fooddata-192.png',
    badge: '/img/icon-fooddata-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) {
      if ('focus' in c && 'navigate' in c) return c.focus().then(() => c.navigate(url)).catch(() => self.clients.openWindow(url));
    }
    return self.clients.openWindow(url);
  }));
});
