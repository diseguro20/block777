self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  event.waitUntil(self.registration.showNotification(data.title || 'Blockerino Partners', {
    body: data.body || 'Você tem uma nova atualização.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'blockerino-affiliate',
    renotify: true,
    data: { url: data.url || '/affiliate' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/affiliate';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(items => {
    const existing = items.find(client => new URL(client.url).pathname.startsWith('/affiliate'));
    return existing ? existing.focus() : clients.openWindow(url);
  }));
});
