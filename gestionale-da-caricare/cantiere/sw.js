// Fa funzionare l'app anche quando il campo è debole: tiene una copia dei file
// dell'app sul telefono. I dati (Supabase) non passano di qui.
// Quando modifichi l'app, aumenta il numero di VERSIONE: i telefoni scaricano la nuova.
const VERSIONE = 'cantiere-v1';
const FILE = ['./', './index.html', './app.css', './app.js', '../js/db.js', '../config.js', './manifest.webmanifest',
  './icone/icona-192.png', './icone/icona-512.png', './icone/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(chiavi => Promise.all(chiavi.filter(k => k !== VERSIONE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// File dell'app: prima la rete (così prende gli aggiornamenti), se non c'è campo la copia salvata.
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r).then(risp => {
      if (risp.ok) { const copia = risp.clone(); caches.open(VERSIONE).then(c => c.put(r, copia)); }
      return risp;
    }).catch(() => caches.match(r, { ignoreSearch: true }).then(c => c || caches.match('./index.html')))
  );
});
