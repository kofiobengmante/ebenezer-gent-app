const CACHE_NAME = 'ebenezer-gent-v2'; // Bump version
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon-512.png',
  'https://pcgonline.org/wp-content/uploads/2021/04/pcglogo.png',
  'https://unpkg.com/@phosphor-icons/web'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

// --- PWA Notification Handling ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

// Handle data messages if using FCM/Push
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Church Update';
  const options = {
    body: data.body || 'You have a new message from Ebenezer Gent.',
    icon: './icon-512.png',
    badge: './icon-512.png',
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
